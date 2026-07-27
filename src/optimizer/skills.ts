/**
 * CraftBuddy - Skill Definitions and Application
 *
 * Game-accurate skill application logic based on CraftingStuff source.
 * Handles technique effects, buff interactions, and expected value calculations.
 */

import { CraftingState, BuffType } from './state';
import { safeFloor, safeAdd, safeMultiply } from '../utils/largeNumbers';
import {
  TechniqueEffect,
  Scaling,
  BuffDefinition,
  BuffEffect,
  CraftingTechniqueCondition,
  ConditionEvaluation,
  CraftingCondition,
  TechniqueType,
  RecipeConditionEffectType,
  ConditionEffect,
  HarmonyType,
  ScalingVariables,
  calculateExpectedCritMultiplier,
  getConditionEffects,
  getBonusAndChance,
  evaluateScaling,
} from './gameTypes';
import {
  processHarmonyEffect,
  getHarmonyStatModifiers,
  getHarmonyCostMultipliers,
  BarChangeEvent,
  HarmonyStatModifiers,
} from './harmony';
import {
  collectDerivedNativeVariableAliases,
  applyDerivedNativeVariableAliases,
  buildCanonicalNativeVariables,
} from './nativeVariables';
import { normalizeIdentifier } from './nameNormalization';

/**
 * Simplified skill definition for optimizer.
 * Can be constructed from game's TechniqueDefinition or manually defined.
 */
export interface SkillDefinition {
  /**
   * Internal technique name, and the identity every key and lookup derives from.
   *
   * Not necessarily what the player sees: 0.7.6 renamed False Fusion to "Strive
   * for Completion" purely through `displayName`, leaving `name` as
   * `` `False Fusion` ``. Use `displayName ?? name` for anything user-facing.
   */
  name: string;
  /**
   * Player-facing label from the runtime's `displayName`, when it differs.
   *
   * Present only when the game supplies one; UI must fall back to `name`.
   */
  displayName?: string;
  key: string;
  qiCost: number;
  stabilityCost: number;
  /** Base success chance for this technique (0-1). If omitted, treated as 1. */
  successChance?: number;
  baseCompletionGain: number;
  basePerfectionGain: number;
  stabilityGain: number;
  /** Max stability change from this skill (negative = loss, positive = gain) */
  maxStabilityChange: number;
  buffType: BuffType;
  buffDuration: number;
  /** Buff multiplier value (e.g., 1.4 for 40% boost) - read from game buff data */
  buffMultiplier: number;
  type: TechniqueType;
  /** Icon/image path for the skill (from game's CraftingTechnique.icon) */
  icon?: string;
  /** Distinguishes technique actions from items and search-local pseudo actions. */
  actionKind?: 'skill' | 'item' | 'finish';
  /** Optional raw game technique payload for native availability prechecks. */
  nativeTechnique?: unknown;
  /** Whether this skill scales with control */
  scalesWithControl?: boolean;
  /** Whether this skill scales with intensity */
  scalesWithIntensity?: boolean;
  /** Special skill that converts buffs to gains */
  isDisciplinedTouch?: boolean;
  /** Whether this skill prevents the normal max stability decay of 1 per turn */
  preventsMaxStabilityDecay?: boolean;
  /** Toxicity cost for alchemy crafting */
  toxicityCost?: number;
  /** Toxicity cleanse amount (for cleanse skills) */
  toxicityCleanse?: number;
  /** Cooldown in turns after use */
  cooldown?: number;
  /** Mastery bonuses applied to this skill */
  mastery?: SkillMastery;
  /** Raw mastery entries from game data (used for conditional mastery checks). */
  masteryEntries?: Array<Record<string, any>>;
  /** Required crafting condition to use this skill */
  conditionRequirement?: CraftingCondition | string;
  /** Requires a specific stack-based buff to be present (does not consume it) */
  buffRequirement?: { buffName: string; amount: number };
  /** Consumes a specific stack-based buff when used (can also scale gains per stack) */
  buffCost?: { buffName: string; amount?: number; consumeAll?: boolean };
  /** Whether this skill restores Qi (for tracking Qi recovery skills) */
  restoresQi?: boolean;
  /** Amount of Qi restored */
  qiRestore?: number;
  /** Whether this skill restores max stability to the craft's maximum */
  restoresMaxStabilityToFull?: boolean;
  /** Items can be consumed without advancing the turn. */
  consumesTurn?: boolean;
  /** Optional item identifier for inventory tracking. */
  itemName?: string;
  /** True for reagents that are only usable on step 0. */
  reagentOnlyAtStepZero?: boolean;

  /**
   * Full technique effects from game data (optional).
   * If provided, these are used for accurate gain calculations.
   */
  effects?: TechniqueEffect[];

  /**
   * Full buff definition for buff-granting skills (optional).
   * Used for accurate buff stat calculations.
   */
  grantedBuff?: BuffDefinition;
}

/**
 * Normalize condition string to canonical CraftingCondition type.
 * Handles various game/UI representations.
 */
function normalizeCondition(
  condition: string | undefined,
): CraftingCondition | undefined {
  if (!condition) return undefined;
  const c = String(condition).toLowerCase();
  // Accept both the canonical enum keys and common label/synonym variants.
  switch (c) {
    case 'neutral':
    case 'balanced':
      return 'neutral';
    case 'positive':
    case 'harmonious':
      return 'positive';
    case 'negative':
    case 'resistant':
      return 'negative';
    case 'verypositive':
    case 'brilliant':
    case 'excellent':
      return 'veryPositive';
    case 'verynegative':
    case 'corrupted':
      return 'veryNegative';
    default:
      // Try exact match for already-canonical values
      if (
        [
          'neutral',
          'positive',
          'negative',
          'veryPositive',
          'veryNegative',
        ].includes(condition)
      ) {
        return condition as CraftingCondition;
      }
      return undefined;
  }
}

/**
 * Mastery bonuses that modify skill effectiveness.
 * Read from CraftingTechnique.mastery array.
 */
export interface SkillMastery {
  /** Percentage bonus to control scaling (e.g., 0.1 = +10%) */
  controlBonus?: number;
  /** Percentage bonus to intensity scaling (e.g., 0.1 = +10%) */
  intensityBonus?: number;
  /** Flat reduction to qi cost */
  poolCostReduction?: number;
  /** Flat reduction to stability cost */
  stabilityCostReduction?: number;
  /** Bonus to success chance */
  successChanceBonus?: number;
  /** Bonus to crit chance */
  critChanceBonus?: number;
  /** Bonus to crit multiplier */
  critMultiplierBonus?: number;
}

interface MasteryUpgradeRule {
  additive: number;
  multiplier: number;
}

type MasteryUpgradeMap = Record<string, MasteryUpgradeRule>;

/**
 * Field names the runtime's crafting upgrade-mastery applier is allowed to
 * rewrite. `applyUpgradeMasteries` walks the action tree and only touches
 * `amount`, `value` and `cooldown` on the object carrying the matching
 * `upgradeKey`; every other numeric field is left alone.
 */
const UPGRADEABLE_NUMERIC_FIELDS = ['amount', 'value', 'cooldown'] as const;

interface ResolvedMasteryBonuses {
  bonuses: SkillMastery;
  upgrades: MasteryUpgradeMap;
}

const EMPTY_MASTERY_UPGRADES: MasteryUpgradeMap = Object.freeze({});

function hasMasteryUpgrades(upgrades: MasteryUpgradeMap): boolean {
  return Object.keys(upgrades).length > 0;
}

function applyMasteryUpgradesToScaling(
  scaling: Scaling | undefined,
  upgrades: MasteryUpgradeMap,
): Scaling | undefined {
  if (!scaling || !hasMasteryUpgrades(upgrades)) {
    return scaling;
  }

  const visited = new WeakMap<object, unknown>();
  const applyRecursively = (value: unknown): unknown => {
    if (!value || typeof value !== 'object') {
      return value;
    }

    const cached = visited.get(value as object);
    if (cached !== undefined) {
      return cached;
    }

    if (Array.isArray(value)) {
      let arrayChanged = false;
      const upgradedArray = value.map((entry) => {
        const upgradedEntry = applyRecursively(entry);
        if (upgradedEntry !== entry) {
          arrayChanged = true;
        }
        return upgradedEntry;
      });
      const arrayResult = arrayChanged ? upgradedArray : value;
      visited.set(value as object, arrayResult);
      return arrayResult;
    }

    const source = value as Record<string, unknown>;
    const clone: Record<string, unknown> = {};
    visited.set(value as object, clone);

    let changed = false;
    for (const [key, child] of Object.entries(source)) {
      const upgradedChild = applyRecursively(child);
      clone[key] = upgradedChild;
      if (upgradedChild !== child) {
        changed = true;
      }
    }

    const upgradeKey = String(source.upgradeKey || '').trim();
    const rule = upgradeKey ? upgrades[upgradeKey] : undefined;
    if (rule) {
      for (const key of UPGRADEABLE_NUMERIC_FIELDS) {
        const child = clone[key];
        if (typeof child !== 'number' || !Number.isFinite(child)) {
          continue;
        }
        const upgradedNumber = (child + rule.additive) * rule.multiplier;
        if (upgradedNumber !== child) {
          clone[key] = upgradedNumber;
          changed = true;
        }
      }
    }

    const objectResult = changed ? clone : source;
    visited.set(value as object, objectResult);
    return objectResult;
  };

  return applyRecursively(scaling) as Scaling;
}

function evaluateScalingWithMasteryUpgrades(
  scaling: Scaling | undefined,
  upgrades: MasteryUpgradeMap,
  variables: ScalingVariables,
  defaultValue: number,
): number {
  return evaluateScaling(
    applyMasteryUpgradesToScaling(scaling, upgrades),
    variables,
    defaultValue,
  );
}

function clampStabilityToBounds(
  stability: number,
  maxStability: number,
): number {
  return Math.max(0, Math.min(maxStability, stability));
}

/**
 * One completion/perfection effect, in the order the runtime applies it.
 *
 * `amount` is the raw pre-crit, pre-expected-value contribution. The aggregate
 * `SkillGains.completion` / `.perfection` already carry crit and success-chance
 * weighting, so callers rebuilding per-application bar values distribute the
 * aggregate proportionally across these raw amounts rather than using them
 * directly - that keeps the reconstructed running values summing exactly to the
 * figures the simulator commits to.
 */
export interface BarContribution {
  readonly bar: 'completion' | 'perfection';
  readonly amount: number;
}

/**
 * The label to show the player for a technique.
 *
 * 0.7.6 renamed False Fusion to "Strive for Completion" through `displayName`
 * alone - the internal `name` is unchanged - so every user-facing surface must
 * resolve the label through here rather than reading `name` directly. Keys and
 * lookups keep using `name`.
 */
export function techniqueDisplayName(
  skill: Pick<SkillDefinition, 'name' | 'displayName'>,
): string {
  const display = skill.displayName?.trim();
  return display && display.length > 0 ? display : skill.name;
}

/**
 * Whether per-application bar ordering needs to be recorded at all.
 *
 * Eccentric Decree is the only harmony that scores per bar change, so recording
 * the ordering for anything else would allocate on every node of the search for
 * data nobody reads. Mirrors `needs_bar_contributions` in the Rust engine.
 */
function needsBarContributions(config: OptimizerConfig): boolean {
  return (
    config.isSublimeCraft === true && config.craftingType === 'eccentricDecree'
  );
}

/**
 * Rescale raw per-effect contributions onto the aggregate expected-value gains.
 *
 * `calculateSkillGains` records raw amounts but returns crit- and
 * success-weighted totals, so the raw list is normalized here: each bar's
 * contributions are scaled by `actual / rawSum`, which preserves both the
 * ordering and the exact total. A zero raw sum implies a zero total, so the
 * scale collapses to 0 rather than dividing by zero.
 */
function scaleBarContributions(
  contributions: readonly BarContribution[],
  actualCompletion: number,
  actualPerfection: number,
): BarContribution[] {
  let rawCompletion = 0;
  let rawPerfection = 0;
  for (const contribution of contributions) {
    if (contribution.bar === 'completion') {
      rawCompletion += contribution.amount;
    } else {
      rawPerfection += contribution.amount;
    }
  }
  const completionScale = rawCompletion !== 0 ? actualCompletion / rawCompletion : 0;
  const perfectionScale = rawPerfection !== 0 ? actualPerfection / rawPerfection : 0;
  return contributions.map((contribution) => ({
    bar: contribution.bar,
    amount:
      contribution.bar === 'completion'
        ? contribution.amount * completionScale
        : contribution.amount * perfectionScale,
  }));
}

/**
 * Stand-in contributions for gain paths that expose no per-effect breakdown.
 *
 * Disciplined Touch and the legacy scalar summary both bypass the effect tree, so
 * they report only aggregate gains. Emitting one synthetic application per moved
 * bar - completion first, matching the runtime's effect ordering - keeps the event
 * list complete. Dropping them instead would hide the technique's own movement
 * whenever a buff contributed events, and mis-attribute the bar values the
 * Eccentric Decree fold reads.
 *
 * With no buff events this is equivalent to the single end-of-turn delta, but it
 * additionally models a focus flip landing between the two applications.
 */
function synthesizeBarContributions(
  completion: number,
  perfection: number,
): BarContribution[] {
  const synthesized: BarContribution[] = [];
  if (completion !== 0) {
    synthesized.push({ bar: 'completion', amount: completion });
  }
  if (perfection !== 0) {
    synthesized.push({ bar: 'perfection', amount: perfection });
  }
  return synthesized;
}

/**
 * Replay ordered bar contributions into the running values after each one.
 *
 * Mirrors what 0.7.6 sees inside `applyCompletion` / `applyPerfection`: the hook
 * observes the bars as they stand immediately after that single application.
 */
function buildBarChangeEvents(
  startCompletion: number,
  startPerfection: number,
  ordered: readonly BarContribution[],
): BarChangeEvent[] {
  let completion = startCompletion;
  let perfection = startPerfection;
  const events: BarChangeEvent[] = [];
  for (const contribution of ordered) {
    if (contribution.bar === 'completion') {
      completion += contribution.amount;
    } else {
      perfection += contribution.amount;
    }
    events.push({ bar: contribution.bar, completion, perfection });
  }
  return events;
}

export interface SkillGains {
  completion: number;
  perfection: number;
  stability: number;
  toxicityCleanse?: number;
  /**
   * Ordered per-effect bar contributions, present only on the effect-tree path.
   *
   * Eccentric Decree scores per bar application in 0.7.6, so `processTurn` needs
   * the ordering; every other harmony ignores it.
   */
  barContributions?: readonly BarContribution[];
}

export interface ActionSurvivabilityFloor {
  stability: number;
  maxStability: number;
  survivalProbability: number;
}

export interface SkillGainOptions {
  /**
   * Include expected-value random factors (crit/success) in predicted gains.
   * Disable for tooltip-parity "immediate" gain previews.
   */
  includeExpectedValue?: boolean;
}

export interface OptimizerConfig {
  maxQi: number;
  maxStability: number;
  /** Optional hard completion cap for this craft (game max completion). */
  maxCompletion?: number;
  /** Optional hard perfection cap for this craft (game max perfection). */
  maxPerfection?: number;
  baseIntensity: number;
  baseControl: number;
  minStability: number;
  skills: SkillDefinition[];
  /** Default buff multiplier if not specified per-skill (e.g., 1.4 for 40%) */
  defaultBuffMultiplier: number;
  /** Maximum item usages per turn (mirrors pillsPerRound in game vars). */
  pillsPerRound?: number;
  /** Max toxicity for alchemy crafting (0 for non-alchemy) */
  maxToxicity?: number;
  /** Crafting type: forge, alchemical, inscription, resonance */
  craftingType?: HarmonyType;
  /**
   * Recipe condition effect type (affects which stat conditions modify).
   * Used as fallback when conditionEffectsData is not available.
   */
  conditionEffectType?: RecipeConditionEffectType;
  /**
   * Actual condition effects data from the game's RecipeConditionEffect object.
   * When present, used directly instead of the hardcoded fallback table.
   */
  conditionEffectsData?: Record<CraftingCondition, ConditionEffect[]>;
  /**
   * Whether this is sublime/harmony crafting mode.
   * Sublime crafting allows exceeding normal target limits.
   */
  isSublimeCraft?: boolean;
  /**
   * Target multiplier for sublime crafting.
   * Default: 1.0 (normal), 2.0 (sublime), higher for equipment.
   */
  targetMultiplier?: number;
  /**
   * Target completion for completion bonus calculation.
   */
  targetCompletion?: number;
  /**
   * Target perfection value.
   */
  targetPerfection?: number;
  /**
   * Whether this is a training craft (no real consequences on failure).
   * When true, optimizer uses more aggressive strategies with lower stability margins.
   */
  trainingMode?: boolean;
}

/**
 * Default skill definitions based on the Python optimizer config.
 * These can be overridden with actual game data at runtime.
 *
 * Note: baseCompletionGain and basePerfectionGain are MULTIPLIERS, not raw values.
 * The actual gain is calculated as: multiplier * stat (intensity or control).
 * For example: Simple Fusion with multiplier 1.0 and intensity 12 gives 1.0 * 12 = 12 completion.
 */
export const DEFAULT_SKILLS: SkillDefinition[] = [
  {
    name: 'Simple Fusion',
    key: 'simple_fusion',
    qiCost: 0,
    stabilityCost: 10,
    baseCompletionGain: 1.0, // Multiplier: 1.0 * intensity
    basePerfectionGain: 0,
    stabilityGain: 0,
    maxStabilityChange: 0,
    buffType: BuffType.NONE,
    buffDuration: 0,
    buffMultiplier: 1.0,
    type: 'fusion',
    scalesWithIntensity: true,
    preventsMaxStabilityDecay: false,
  },
  {
    name: 'Energised Fusion',
    key: 'energised_fusion',
    qiCost: 10,
    stabilityCost: 10,
    baseCompletionGain: 1.8, // Multiplier: 1.8 * intensity (matches game data)
    basePerfectionGain: 0,
    stabilityGain: 0,
    maxStabilityChange: 0,
    buffType: BuffType.NONE,
    buffDuration: 0,
    buffMultiplier: 1.0,
    type: 'fusion',
    scalesWithIntensity: true,
    preventsMaxStabilityDecay: false,
  },
  {
    name: 'Cycling Fusion',
    key: 'cycling_fusion',
    qiCost: 10,
    stabilityCost: 10,
    baseCompletionGain: 0.75, // Multiplier: 0.75 * intensity (matches game data)
    basePerfectionGain: 0,
    stabilityGain: 0,
    maxStabilityChange: 0,
    buffType: BuffType.CONTROL,
    buffDuration: 2,
    buffMultiplier: 1.4,
    type: 'fusion',
    scalesWithIntensity: true,
    preventsMaxStabilityDecay: false,
  },
  {
    name: 'Disciplined Touch',
    key: 'disciplined_touch',
    qiCost: 10,
    stabilityCost: 10,
    baseCompletionGain: 0.5, // Multiplier for completion (matches game data)
    basePerfectionGain: 0.5, // Multiplier for perfection (matches game data)
    stabilityGain: 0,
    maxStabilityChange: 0,
    buffType: BuffType.NONE,
    buffDuration: 0,
    buffMultiplier: 1.0,
    type: 'fusion',
    scalesWithIntensity: true,
    isDisciplinedTouch: true,
    preventsMaxStabilityDecay: false,
  },
  {
    name: 'Cycling Refine',
    key: 'cycling_refine',
    qiCost: 10,
    stabilityCost: 10,
    baseCompletionGain: 0,
    basePerfectionGain: 0.75, // Multiplier: 0.75 * control (matches game data)
    stabilityGain: 0,
    maxStabilityChange: 0,
    buffType: BuffType.INTENSITY,
    buffDuration: 2,
    buffMultiplier: 1.4,
    type: 'refine',
    scalesWithControl: true,
    preventsMaxStabilityDecay: false,
  },
  {
    name: 'Simple Refine',
    key: 'simple_refine',
    qiCost: 18,
    stabilityCost: 10,
    baseCompletionGain: 0,
    basePerfectionGain: 1.0, // Multiplier: 1.0 * control
    stabilityGain: 0,
    maxStabilityChange: 0,
    buffType: BuffType.NONE,
    buffDuration: 0,
    buffMultiplier: 1.0,
    type: 'refine',
    scalesWithControl: true,
    preventsMaxStabilityDecay: false,
  },
  {
    name: 'Stabilize',
    key: 'stabilize',
    qiCost: 10,
    stabilityCost: 0,
    baseCompletionGain: 0,
    basePerfectionGain: 0,
    stabilityGain: 20, // Flat value, not a multiplier
    maxStabilityChange: 0,
    buffType: BuffType.NONE,
    buffDuration: 0,
    buffMultiplier: 1.0,
    type: 'stabilize',
    preventsMaxStabilityDecay: true,
  },
];

/**
 * Default optimizer configuration
 */
export const DEFAULT_CONFIG: OptimizerConfig = {
  maxQi: 194,
  maxStability: 60,
  baseIntensity: 12,
  baseControl: 16,
  // The game allows using skills until stability reaches 0.
  // Keep this at 0 to avoid incorrectly showing "No Valid Actions" at low stability.
  minStability: 0,
  skills: DEFAULT_SKILLS,
  defaultBuffMultiplier: 1.4,
  pillsPerRound: 1,
};

export interface NativeCanUseActionContext {
  state: CraftingState;
  skill: SkillDefinition;
  currentCondition?: string;
  conditionEffects: ConditionEffect[];
  maxToxicity: number;
  minStability: number;
  pillsPerRound: number;
  effectiveQiCost: number;
  variables: Record<string, number>;
}

export type NativeCanUseActionProvider = (
  context: NativeCanUseActionContext,
) => boolean | undefined;

let activeNativeCanUseActionProvider: NativeCanUseActionProvider | undefined;
let warnedNativeCanUseActionFailure = false;

export function setNativeCanUseActionProvider(
  provider: NativeCanUseActionProvider | undefined,
): void {
  activeNativeCanUseActionProvider = provider;
  warnedNativeCanUseActionFailure = false;
}

function normalizeBuffName(name: string | undefined): string {
  return normalizeIdentifier(name);
}

function isDerivedForgeHeatBuff(
  state: CraftingState,
  config: OptimizerConfig | undefined,
  buffKey: string,
  tracked: { name: string; stacks: number; definition?: BuffDefinition },
): boolean {
  if (config?.craftingType !== 'forge' || !state.harmonyData?.forgeWorks) {
    return false;
  }

  const normalizedKey = normalizeBuffName(buffKey);
  if (normalizedKey === 'heat') {
    return true;
  }

  return normalizeBuffName(tracked.name || buffKey) === 'heat';
}

function stripDerivedForgeHeatBuff(
  state: CraftingState,
  config: OptimizerConfig | undefined,
  buffs: ActiveBuffMap,
): ActiveBuffMap {
  if (config?.craftingType !== 'forge' || !state.harmonyData?.forgeWorks) {
    return buffs;
  }

  let stripped: ActiveBuffMap | undefined;
  buffs.forEach((tracked, buffKey) => {
    if (!isDerivedForgeHeatBuff(state, config, buffKey, tracked)) {
      return;
    }

    if (!stripped) {
      stripped = new Map(buffs);
    }
    stripped.delete(buffKey);
  });

  return stripped ?? buffs;
}

function normalizeRuntimeCostPercentage(raw: number | undefined): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return 100;
  }
  // Runtime snapshots can encode neutral baseline as 0 while the
  // optimizer internally expects 100 for "no modification".
  if (parsed === 0) {
    return 100;
  }
  return parsed;
}

type ActiveBuffMap = Map<
  string,
  { name: string; stacks: number; definition?: BuffDefinition }
>;

/**
 * The crafting reducer stacks "Turbid Qi" on long crafts. After the step
 * counter is bumped it runs
 * `t.step++, t.step >= Tms && t.step % Ems === 0 && K8(Cms, 1, ...)`
 * with `Tms = 100` and `Ems = 3`, granting one stack of
 * `{ name: 'Turbid Qi', canStack: true, stats: { poolCostFlat: { value: 1, scaling: 'stacks' } } }`.
 */
const TURBID_QI_FIRST_STEP = 100;
const TURBID_QI_STEP_INTERVAL = 3;
const TURBID_QI_BUFF_KEY = 'turbid_qi';

function grantsTurbidQiStack(nextStep: number): boolean {
  return (
    Number.isFinite(nextStep) &&
    nextStep >= TURBID_QI_FIRST_STEP &&
    nextStep % TURBID_QI_STEP_INTERVAL === 0
  );
}

/**
 * Locate the tracked Turbid Qi buff. The reducer creates it directly instead of
 * through an action's `createBuff`, so the optimizer can only project it
 * forward when the live craft state already carries it with a definition.
 * Identify it by its runtime shape (`stats.poolCostFlat` scaling on `stacks`)
 * and fall back to the normalized buff name.
 */
function findTurbidQiBuffKey(buffs: ActiveBuffMap): string | undefined {
  let fallback: string | undefined;
  for (const [buffKey, tracked] of Array.from(buffs.entries())) {
    if (!tracked.definition) continue;
    if (tracked.definition.stats?.poolCostFlat?.scaling === 'stacks') {
      return buffKey;
    }
    if (normalizeBuffName(tracked.name || buffKey) === TURBID_QI_BUFF_KEY) {
      fallback = buffKey;
    }
  }
  return fallback;
}

const buffDefinitionLookupCache = new WeakMap<
  OptimizerConfig,
  Map<string, BuffDefinition>
>();

function getBuffDefinitionLookup(
  config: OptimizerConfig,
): Map<string, BuffDefinition> {
  const cached = buffDefinitionLookupCache.get(config);
  if (cached) {
    return cached;
  }

  const lookup = new Map<string, BuffDefinition>();
  const addDefinition = (definition: BuffDefinition | undefined): void => {
    if (!definition?.name) return;
    const key = normalizeBuffName(definition.name);
    if (!key || lookup.has(key)) return;
    lookup.set(key, definition);
  };

  for (const skill of config.skills || []) {
    addDefinition(skill.grantedBuff);
    for (const effect of skill.effects || []) {
      if (effect?.kind === 'createBuff') {
        addDefinition(effect.buff);
      }
    }
  }

  buffDefinitionLookupCache.set(config, lookup);
  return lookup;
}

/**
 * Per-state memo for `getResolvedActiveBuffs`.
 *
 * Resolution is pure in `(state, config)` and `CraftingState` is immutable
 * once constructed - the same invariant `getCacheKey()` already relies on.
 * Without this the forge path reallocates the stripped buff map on every call,
 * which also defeats the identity check the scaling-variable memo below uses.
 */
const resolvedActiveBuffsCache = new WeakMap<
  CraftingState,
  { config: OptimizerConfig | undefined; buffs: ActiveBuffMap }
>();

function getResolvedActiveBuffs(
  state: CraftingState,
  config: OptimizerConfig | undefined,
): ActiveBuffMap {
  if (!config || state.buffs.size === 0) {
    return state.buffs;
  }

  const cached = resolvedActiveBuffsCache.get(state);
  if (cached && cached.config === config) {
    return cached.buffs;
  }
  const resolvedBuffs = resolveActiveBuffs(state, config);
  resolvedActiveBuffsCache.set(state, { config, buffs: resolvedBuffs });
  return resolvedBuffs;
}

function resolveActiveBuffs(
  state: CraftingState,
  config: OptimizerConfig,
): ActiveBuffMap {
  let hasMissingDefinition = false;
  state.buffs.forEach((tracked) => {
    if (!tracked.definition) {
      hasMissingDefinition = true;
    }
  });
  if (!hasMissingDefinition) {
    return stripDerivedForgeHeatBuff(state, config, state.buffs);
  }

  const lookup = getBuffDefinitionLookup(config);
  if (lookup.size === 0) {
    return state.buffs;
  }

  let resolved: ActiveBuffMap | undefined;
  state.buffs.forEach((tracked, buffKey) => {
    if (tracked.definition) return;
    const normalizedName = normalizeBuffName(tracked.name || buffKey);
    const definition = lookup.get(normalizedName) || lookup.get(buffKey);
    if (!definition) return;
    if (!resolved) {
      resolved = new Map(state.buffs);
    }
    resolved.set(buffKey, {
      ...tracked,
      definition,
    });
  });

  return stripDerivedForgeHeatBuff(state, config, resolved ?? state.buffs);
}

interface ProgressBonusInfo {
  guaranteed: number;
  bonusChance: number;
}

/**
 * Build the runtime's progress-percentage scaling variables.
 *
 * The runtime writes them in camelCase only:
 *   vars.completionPercentage = Math.floor((c.guaranteed + c.bonusChance) * 100)
 *   vars.perfectionPercentage = Math.floor((l.guaranteed + l.bonusChance) * 100)
 * where `c`/`l` come from getBonusAndChance. CraftBuddy used to emit only the
 * lowercase spellings, so game-authored expressions referencing the camelCase
 * names resolved to 0. The lowercase spellings are kept as aliases so existing
 * CraftBuddy-side consumers keep working.
 */
function buildProgressPercentageVariables(
  completionInfo: ProgressBonusInfo,
  perfectionInfo: ProgressBonusInfo,
): Record<string, number> {
  const completionPercentage = Math.max(
    0,
    Math.floor((completionInfo.guaranteed + completionInfo.bonusChance) * 100),
  );
  const perfectionPercentage = Math.max(
    0,
    Math.floor((perfectionInfo.guaranteed + perfectionInfo.bonusChance) * 100),
  );

  return {
    completionPercentage,
    perfectionPercentage,
    completionpercentage: completionPercentage,
    perfectionpercentage: perfectionPercentage,
  };
}

function buildNativeAvailabilityVariables(
  state: CraftingState,
  maxToxicity: number,
  pillsPerRound: number,
): Record<string, number> {
  const seededVariables: Record<string, number> = {};
  if (state.nativeVariables) {
    for (const [key, value] of Object.entries(state.nativeVariables)) {
      if (typeof value === 'number' && Number.isFinite(value)) {
        seededVariables[key] = value;
      }
    }
  }

  const maxPool = Number.isFinite(seededVariables.maxpool)
    ? Math.max(1, seededVariables.maxpool)
    : Math.max(1, state.qi);
  const derivedMaxToxicity =
    maxToxicity > 0
      ? maxToxicity
      : Number.isFinite(seededVariables.maxtoxicity)
        ? Math.max(1, seededVariables.maxtoxicity)
        : Math.max(1, state.maxToxicity);
  const maxCompletion =
    typeof seededVariables.maxcompletion === 'number' &&
    Number.isFinite(seededVariables.maxcompletion)
      ? Math.max(0, seededVariables.maxcompletion)
      : 0;
  const maxPerfection =
    typeof seededVariables.maxperfection === 'number' &&
    Number.isFinite(seededVariables.maxperfection)
      ? Math.max(0, seededVariables.maxperfection)
      : 0;
  const completionInfo =
    maxCompletion > 0
      ? getBonusAndChance(state.completion, maxCompletion)
      : { guaranteed: 0, bonusChance: 0 };
  const perfectionInfo =
    maxPerfection > 0
      ? getBonusAndChance(state.perfection, maxPerfection)
      : { guaranteed: 0, bonusChance: 0 };

  const variables: Record<string, number> = {
    ...seededVariables,
    pool: state.qi,
    maxpool: maxPool,
    completion: state.completion,
    perfection: state.perfection,
    ...buildProgressPercentageVariables(completionInfo, perfectionInfo),
    stability: state.stability,
    maxstability: state.maxStability,
    stabilitypenalty: state.stabilityPenalty,
    toxicity: state.toxicity,
    maxtoxicity: derivedMaxToxicity,
    consumedPills: state.consumedPillsThisTurn,
    consumedPillsThisTurn: state.consumedPillsThisTurn,
    pillsPerRound: Math.max(1, Math.floor(pillsPerRound || 1)),
    step: state.step,
  };

  applyDerivedNativeVariableAliases(variables, {
    buffs: state.buffs,
    harmonyData: state.harmonyData,
  });

  return variables;
}

function runNativeCanUseActionPrecheck(
  context: Omit<NativeCanUseActionContext, 'variables'>,
): boolean | undefined {
  if (!activeNativeCanUseActionProvider) {
    return undefined;
  }

  const variables = buildNativeAvailabilityVariables(
    context.state,
    context.maxToxicity,
    context.pillsPerRound,
  );

  try {
    return activeNativeCanUseActionProvider({
      ...context,
      variables,
    });
  } catch (error) {
    if (!warnedNativeCanUseActionFailure) {
      console.warn(
        '[CraftBuddy] Native canUseAction provider failed, using local fallback:',
        error,
      );
      warnedNativeCanUseActionFailure = true;
    }
  }

  return undefined;
}

function propagateNativeVariablesAfterAction(
  state: CraftingState,
  nextState: {
    qi: number;
    maxPool: number;
    completion: number;
    perfection: number;
    stability: number;
    maxStability: number;
    stabilityPenalty: number;
    toxicity: number;
    consumedPillsThisTurn: number;
    step: number;
  },
  nextBuffs: Map<
    string,
    { name: string; stacks: number; definition?: BuffDefinition }
  >,
  nextHarmonyData: CraftingState['harmonyData'],
  maxToxicity: number,
  pillsPerRound: number,
): Record<string, number> | undefined {
  if (!activeNativeCanUseActionProvider && !state.nativeVariables) {
    return undefined;
  }

  const variables = buildNativeAvailabilityVariables(
    state,
    maxToxicity,
    pillsPerRound,
  );

  variables.pool = nextState.qi;
  variables.maxpool = Math.max(1, nextState.maxPool);
  variables.completion = nextState.completion;
  variables.perfection = nextState.perfection;
  variables.stability = nextState.stability;
  variables.maxstability = nextState.maxStability;
  variables.stabilitypenalty = nextState.stabilityPenalty;
  variables.toxicity = nextState.toxicity;
  variables.consumedPills = nextState.consumedPillsThisTurn;
  variables.consumedPillsThisTurn = nextState.consumedPillsThisTurn;
  variables.pillsPerRound = Math.max(1, Math.floor(pillsPerRound || 1));
  variables.step = nextState.step;
  variables.maxtoxicity =
    maxToxicity > 0 ? maxToxicity : Math.max(1, state.maxToxicity);
  const nextCompletionTarget =
    typeof variables.maxcompletion === 'number' &&
    Number.isFinite(variables.maxcompletion)
      ? Math.max(0, variables.maxcompletion)
      : 0;
  const nextPerfectionTarget =
    typeof variables.maxperfection === 'number' &&
    Number.isFinite(variables.maxperfection)
      ? Math.max(0, variables.maxperfection)
      : 0;
  const nextCompletionInfo =
    nextCompletionTarget > 0
      ? getBonusAndChance(nextState.completion, nextCompletionTarget)
      : { guaranteed: 0, bonusChance: 0 };
  const nextPerfectionInfo =
    nextPerfectionTarget > 0
      ? getBonusAndChance(nextState.perfection, nextPerfectionTarget)
      : { guaranteed: 0, bonusChance: 0 };
  Object.assign(
    variables,
    buildProgressPercentageVariables(nextCompletionInfo, nextPerfectionInfo),
  );

  const keysToRefresh = new Set<string>();
  collectDerivedNativeVariableAliases({
    buffs: state.buffs,
    harmonyData: state.harmonyData,
  }).forEach((key) => {
    keysToRefresh.add(key);
  });
  collectDerivedNativeVariableAliases({
    buffs: nextBuffs,
    harmonyData: nextHarmonyData,
  }).forEach((key) => {
    keysToRefresh.add(key);
  });
  keysToRefresh.forEach((key) => {
    if (key) {
      delete variables[key];
    }
  });

  applyDerivedNativeVariableAliases(variables, {
    buffs: nextBuffs,
    harmonyData: nextHarmonyData,
  });

  return buildCanonicalNativeVariables({
    nativeVariables: variables,
    buffs: nextBuffs,
    harmonyData: nextHarmonyData,
  });
}

/**
 * Per-state memo for the state-derived half of the scaling variables.
 *
 * Every candidate technique at a node asks for the same ~30 state fields,
 * buff-stack entries and derived aliases; only control, intensity and the two
 * crit scalars differ. Building that once per state instead of once per
 * technique was ~8% of search time on a Skyfall Bow replay.
 */
const techniqueScalingBaseCache = new WeakMap<
  CraftingState,
  {
    config: OptimizerConfig;
    activeBuffs: ActiveBuffMap;
    base: ScalingVariables;
  }
>();

function getTechniqueScalingBase(
  state: CraftingState,
  config: OptimizerConfig,
  activeBuffs: ActiveBuffMap,
): ScalingVariables {
  const cached = techniqueScalingBaseCache.get(state);
  if (cached && cached.config === config && cached.activeBuffs === activeBuffs) {
    return cached.base;
  }
  const base = buildTechniqueScalingBase(state, config, activeBuffs);
  techniqueScalingBaseCache.set(state, { config, activeBuffs, base });
  return base;
}

function buildTechniqueScalingVariables(
  state: CraftingState,
  config: OptimizerConfig,
  control: number,
  intensity: number,
  critChance: number,
  critMultiplier: number,
  activeBuffs: ActiveBuffMap = state.buffs,
): ScalingVariables {
  // Always hand back a fresh object: callers mutate their copy.
  return {
    ...getTechniqueScalingBase(state, config, activeBuffs),
    control,
    intensity,
    critchance: critChance,
    critmultiplier: critMultiplier,
  };
}

function buildTechniqueScalingBase(
  state: CraftingState,
  config: OptimizerConfig,
  activeBuffs: ActiveBuffMap,
): ScalingVariables {
  const completionTarget = Math.max(0, config.targetCompletion ?? 0);
  const perfectionTarget = Math.max(0, config.targetPerfection ?? 0);
  const completionInfo =
    completionTarget > 0
      ? getBonusAndChance(state.completion, completionTarget)
      : { guaranteed: 0, bonusChance: 0 };
  const perfectionInfo =
    perfectionTarget > 0
      ? getBonusAndChance(state.perfection, perfectionTarget)
      : { guaranteed: 0, bonusChance: 0 };
  const vars: ScalingVariables = {
    // Overwritten per technique by `buildTechniqueScalingVariables`.
    control: 0,
    intensity: 0,
    critchance: 0,
    critmultiplier: 0,
    pool: state.qi,
    maxpool: config.maxQi,
    toxicity: state.toxicity,
    maxtoxicity: state.maxToxicity,
    resistance: 0,
    itemEffectiveness: 100,
    pillsPerRound: config.pillsPerRound || 1,
    poolCostFlat: Math.max(0, Math.floor(state.poolCostFlat)),
    poolCostPercentage: normalizeRuntimeCostPercentage(
      state.poolCostPercentage,
    ),
    stabilityCostPercentage: normalizeRuntimeCostPercentage(
      state.stabilityCostPercentage,
    ),
    successChanceBonus: state.successChanceBonus,
    stacks: 0,
    completion: state.completion,
    perfection: state.perfection,
    ...buildProgressPercentageVariables(completionInfo, perfectionInfo),
    stability: state.stability,
    maxcompletion: completionTarget,
    maxperfection: perfectionTarget,
    maxstability: state.initialMaxStability,
    stabilitypenalty: state.stabilityPenalty,
  };

  activeBuffs.forEach((tracked, buffName) => {
    vars[buffName] = tracked.stacks;
    const normalized = normalizeBuffName(buffName);
    if (!(normalized in vars)) {
      vars[normalized] = tracked.stacks;
    }
  });

  applyDerivedNativeVariableAliases(vars, {
    harmonyData: state.harmonyData,
  });

  return vars;
}

function applyBuffStatContributions(
  state: CraftingState,
  vars: ScalingVariables,
  masteryUpgrades: MasteryUpgradeMap = EMPTY_MASTERY_UPGRADES,
  activeBuffs: ActiveBuffMap = state.buffs,
): ScalingVariables {
  const buffDefinitions = Array.from(activeBuffs.values())
    .map((tracked) => tracked.definition)
    .filter((definition): definition is BuffDefinition => Boolean(definition));
  const hasExplicitControlBuff = buffDefinitions.some(
    (definition) => definition.stats?.control !== undefined,
  );
  const hasExplicitIntensityBuff = buffDefinitions.some(
    (definition) => definition.stats?.intensity !== undefined,
  );

  // Legacy scoring/sim fast path only. Expression-gated and definition-driven
  // buffs (False Fusion / Strive for Completion, Soulflame, etc.) contribute
  // through `activeBuffs` below — these turn counters must not double-apply.
  let control = vars.control;
  let intensity = vars.intensity;
  if (state.controlBuffTurns > 0 && !hasExplicitControlBuff) {
    control *= state.controlBuffMultiplier;
  }
  if (state.intensityBuffTurns > 0 && !hasExplicitIntensityBuff) {
    intensity *= state.intensityBuffMultiplier;
  }

  const adjustedVars: ScalingVariables = {
    ...vars,
    control,
    intensity,
  };

  activeBuffs.forEach((tracked, buffKey) => {
    const definition = tracked.definition;
    if (!definition?.stats) return;
    const evalVars: ScalingVariables = { ...vars, stacks: tracked.stacks };
    const normalizedKey = normalizeBuffName(
      definition.name || tracked.name || buffKey,
    );
    if (normalizedKey) {
      evalVars[normalizedKey] = tracked.stacks;
    }
    evalVars[buffKey] = tracked.stacks;

    for (const [statKey, scaling] of Object.entries(definition.stats)) {
      if (!scaling) continue;
      const raw = evaluateScalingWithMasteryUpgrades(
        scaling,
        masteryUpgrades,
        evalVars,
        0,
      );
      switch (statKey) {
        case 'poolCostPercentage':
          adjustedVars.poolCostPercentage = Math.floor(
            (adjustedVars.poolCostPercentage / 100) * (raw / 100) * 100,
          );
          break;
        case 'stabilityCostPercentage':
          adjustedVars.stabilityCostPercentage = Math.floor(
            (adjustedVars.stabilityCostPercentage / 100) * (raw / 100) * 100,
          );
          break;
        default: {
          const currentValue = adjustedVars[statKey];
          if (
            typeof currentValue !== 'number' ||
            !Number.isFinite(currentValue)
          ) {
            break;
          }
          adjustedVars[statKey] = currentValue + raw;
          break;
        }
      }
    }
  });

  return adjustedVars;
}

function getEffectiveMaxPool(
  state: CraftingState,
  config: OptimizerConfig,
  activeBuffs: ActiveBuffMap = getResolvedActiveBuffs(state, config),
): number {
  const baseVars = buildTechniqueScalingVariables(
    state,
    config,
    config.baseControl * (1 + state.completionBonus * 0.1),
    config.baseIntensity,
    state.critChance,
    state.critMultiplier,
    activeBuffs,
  );
  const buffedVars = applyBuffStatContributions(
    state,
    baseVars,
    EMPTY_MASTERY_UPGRADES,
    activeBuffs,
  );

  return Math.max(
    1,
    Number.isFinite(buffedVars.maxpool) ? buffedVars.maxpool : config.maxQi,
  );
}

function applyConditionEffectsToVariables(
  vars: ScalingVariables,
  conditionEffects: ConditionEffect[],
): ScalingVariables {
  let control = vars.control;
  let intensity = vars.intensity;
  let successChanceBonus = vars.successChanceBonus;
  let poolCostPercentage = normalizeRuntimeCostPercentage(
    vars.poolCostPercentage,
  );
  let stabilityCostPercentage = normalizeRuntimeCostPercentage(
    vars.stabilityCostPercentage,
  );

  for (const effect of conditionEffects) {
    if (effect.kind === 'control' && effect.multiplier !== undefined) {
      control *= 1 + effect.multiplier;
    } else if (effect.kind === 'intensity' && effect.multiplier !== undefined) {
      intensity *= 1 + effect.multiplier;
    } else if (effect.kind === 'chance' && effect.bonus !== undefined) {
      successChanceBonus += effect.bonus;
    } else if (effect.kind === 'pool' && effect.multiplier !== undefined) {
      poolCostPercentage = Math.floor(poolCostPercentage * effect.multiplier);
    } else if (effect.kind === 'stability' && effect.multiplier !== undefined) {
      stabilityCostPercentage = Math.floor(
        stabilityCostPercentage * effect.multiplier,
      );
    }
  }

  return {
    ...vars,
    control,
    intensity,
    successChanceBonus,
    poolCostPercentage,
    stabilityCostPercentage,
  };
}

export function evaluateEffectCondition(
  condition: CraftingTechniqueCondition | undefined,
  state: CraftingState,
  variables: ScalingVariables,
  selfStacks: number,
  currentCondition?: string,
): ConditionEvaluation {
  if (!condition) {
    return { met: true, probability: 1 };
  }

  switch (condition.kind) {
    case 'buff': {
      const buffKey =
        condition.buff === 'self'
          ? 'self'
          : normalizeBuffName(condition.buff?.name);
      const count =
        buffKey === 'self' ? selfStacks : state.getBuffStacks(buffKey);
      let met = false;
      if (condition.mode === 'more') {
        met = count >= condition.count;
      } else if (condition.mode === 'less') {
        met = count < condition.count;
      } else {
        met = count === condition.count;
      }
      return { met, probability: met ? 1 : 0 };
    }
    case 'pool': {
      const poolPct =
        variables.maxpool > 0 ? (variables.pool / variables.maxpool) * 100 : 0;
      const met =
        condition.mode === 'more'
          ? poolPct >= condition.percentage
          : poolPct < condition.percentage;
      return { met, probability: met ? 1 : 0 };
    }
    case 'perfection': {
      const maxPerf = Math.max(1, variables.maxperfection || 1);
      const perfPct = (variables.perfection / maxPerf) * 100;
      const met =
        condition.mode === 'more'
          ? perfPct >= condition.percentage
          : perfPct < condition.percentage;
      return { met, probability: met ? 1 : 0 };
    }
    case 'stability': {
      const maxStability = Math.max(1, variables.maxstability || 1);
      const stabilityPct = (variables.stability / maxStability) * 100;
      const met =
        condition.mode === 'more'
          ? stabilityPct >= condition.percentage
          : stabilityPct < condition.percentage;
      return { met, probability: met ? 1 : 0 };
    }
    case 'completion': {
      const maxCompletion = Math.max(1, variables.maxcompletion || 1);
      const completionPct = (variables.completion / maxCompletion) * 100;
      const met =
        condition.mode === 'more'
          ? completionPct >= condition.percentage
          : completionPct < condition.percentage;
      return { met, probability: met ? 1 : 0 };
    }
    case 'toxicity': {
      const maxTox = Math.max(1, variables.maxtoxicity || 1);
      const toxicityPct = (variables.toxicity / maxTox) * 100;
      const met =
        condition.mode === 'more'
          ? toxicityPct >= condition.percentage
          : toxicityPct < condition.percentage;
      return { met, probability: met ? 1 : 0 };
    }
    case 'condition': {
      const result = evaluateScaling(
        { value: 1, eqn: condition.condition },
        { ...variables, stacks: selfStacks },
        0,
      );
      const met = result > 0;
      // Direct condition-expression checks are deterministic in optimizer simulation.
      if (currentCondition) {
        return { met, probability: met ? 1 : 0 };
      }
      return { met, probability: met ? 1 : 0 };
    }
    case 'chance': {
      const probability = Math.max(0, Math.min(1, condition.percentage / 100));
      return { met: probability > 0, probability };
    }
    default:
      return { met: true, probability: 1 };
  }
}

function resolveMasteryBonuses(
  state: CraftingState,
  skill: SkillDefinition,
  variables: ScalingVariables,
): ResolvedMasteryBonuses {
  if (!skill.masteryEntries || skill.masteryEntries.length === 0) {
    return {
      bonuses: skill.mastery || {},
      upgrades: EMPTY_MASTERY_UPGRADES,
    };
  }

  const bonuses: SkillMastery = {
    controlBonus: 0,
    intensityBonus: 0,
    poolCostReduction: 0,
    stabilityCostReduction: 0,
    successChanceBonus: 0,
    critChanceBonus: 0,
    critMultiplierBonus: 0,
  };
  const upgrades: MasteryUpgradeMap = {};

  for (const mastery of skill.masteryEntries) {
    if (!mastery || typeof mastery !== 'object') continue;
    const conditionResult = evaluateEffectCondition(
      mastery.condition as CraftingTechniqueCondition | undefined,
      state,
      variables,
      0,
    );
    if (!conditionResult.met || conditionResult.probability <= 0) continue;
    const factor = conditionResult.probability;

    switch (mastery.kind) {
      // Runtime: `a.control *= 1 + c.percentage / 100`, so the stored bonus is a
      // ratio while `percentage` is a whole-number percentage.
      case 'control':
        bonuses.controlBonus =
          (bonuses.controlBonus || 0) +
          (Number(mastery.percentage || 0) / 100) * factor;
        break;
      case 'intensity':
        bonuses.intensityBonus =
          (bonuses.intensityBonus || 0) +
          (Number(mastery.percentage || 0) / 100) * factor;
        break;
      // Runtime: `a.critchance += c.percentage` / `a.critmultiplier +=
      // c.percentage` - these stay raw percentage points, no division.
      case 'critchance':
        bonuses.critChanceBonus =
          (bonuses.critChanceBonus || 0) +
          Number(mastery.percentage || 0) * factor;
        break;
      case 'critmultiplier':
        bonuses.critMultiplierBonus =
          (bonuses.critMultiplierBonus || 0) +
          Number(mastery.percentage || 0) * factor;
        break;
      case 'upgrade': {
        const upgradeKey = String(mastery.upgradeKey || '').trim();
        if (!upgradeKey) break;

        const rawChange = Number(mastery.change || 0);
        if (!Number.isFinite(rawChange) || rawChange === 0) break;

        const existing = upgrades[upgradeKey] || { additive: 0, multiplier: 1 };
        if (mastery.shouldMultiply) {
          // Runtime: `e[i] = a + a * r.change`, i.e. a relative increase of
          // `change` (0.15 -> 1.15x), not an absolute `a * change`.
          const multiplier = 1 + rawChange;
          if (Number.isFinite(multiplier) && multiplier !== 0) {
            existing.multiplier *= multiplier;
          }
        } else {
          existing.additive += rawChange;
        }
        upgrades[upgradeKey] = existing;
        break;
      }
    }
  }

  return {
    bonuses,
    upgrades,
  };
}

function buildPreMasteryActionVariables(
  state: CraftingState,
  config: OptimizerConfig,
  conditionEffects: ConditionEffect[],
  harmonyMods: ReturnType<typeof getHarmonyStatModifiers>,
  masteryUpgrades: MasteryUpgradeMap = EMPTY_MASTERY_UPGRADES,
): ScalingVariables {
  const activeBuffs = getResolvedActiveBuffs(state, config);
  const baseVars = buildTechniqueScalingVariables(
    state,
    config,
    config.baseControl * (1 + state.completionBonus * 0.1),
    config.baseIntensity,
    state.critChance,
    state.critMultiplier,
    activeBuffs,
  );
  const withBuffs = applyBuffStatContributions(
    state,
    baseVars,
    masteryUpgrades,
    activeBuffs,
  );
  const withConditions = applyConditionEffectsToVariables(
    withBuffs,
    conditionEffects,
  );

  return {
    ...withConditions,
    control: withConditions.control * harmonyMods.controlMultiplier,
    intensity: withConditions.intensity * harmonyMods.intensityMultiplier,
    critchance: withConditions.critchance + harmonyMods.critChanceBonus,
    successChanceBonus:
      withConditions.successChanceBonus + harmonyMods.successChanceBonus,
    poolCostPercentage: Math.floor(
      (withConditions.poolCostPercentage / 100) *
        (harmonyMods.poolCostPercentage / 100) *
        100,
    ),
    stabilityCostPercentage: Math.floor(
      (withConditions.stabilityCostPercentage / 100) *
        (harmonyMods.stabilityCostPercentage / 100) *
        100,
    ),
  };
}

export interface EffectiveActionCosts {
  qiCost: number;
  stabilityCost: number;
  requiredPostStability: number;
}

interface PostCostStabilityFrame {
  effectiveCosts: EffectiveActionCosts;
  stabilityAfterCosts: number;
  stabilityPenaltyAfterSetup: number;
  maxStabilityAfterSetup: number;
}

/**
 * Calculate actual action costs after all modifiers using game order/rounding.
 *
 * Runtime order (getPoolCost / getStabilityCost):
 * - Condition `pool`/`stability` multipliers scale poolCostPercentage /
 *   stabilityCostPercentage, unrounded.
 * - Pool: add poolCostFlat (clamped at 0), then a single
 *   `Math.floor(cost * poolCostPercentage / 100)`.
 * - Stability: a single `Math.ceil(negativeDelta * stabilityCostPercentage / 100)`.
 * - The harmony cost multiplier is then applied as a *separate outer* floor,
 *   not folded into the percentage:
 *     pool      = Math.floor(getPoolCost(...) * harmonyPoolMultiplier)
 *     stability = Math.floor(getStabilityCost(...) * harmonyStabilityMultiplier)
 *   Folding it into the percentage instead would drift by 1 on fractional cases.
 */
export function calculateEffectiveActionCosts(
  state: CraftingState,
  skill: SkillDefinition,
  minStability: number,
  conditionEffects: ConditionEffect[] = [],
  config?: OptimizerConfig,
): EffectiveActionCosts {
  const activeBuffs = getResolvedActiveBuffs(state, config);
  let poolCostFlat = Math.max(0, Math.floor(state.poolCostFlat));
  let poolCostPercentage = normalizeRuntimeCostPercentage(
    state.poolCostPercentage,
  );
  let stabilityCostPercentage = normalizeRuntimeCostPercentage(
    state.stabilityCostPercentage,
  );
  let harmonyPoolMultiplier = 1;
  let harmonyStabilityMultiplier = 1;

  // Only run the heavier runtime-derivation path when active buffs
  // can actually modify costs. This avoids unnecessary overhead in search.
  if (config) {
    const hasCostAffectingBuff = Array.from(activeBuffs.values()).some(
      (tracked) =>
        Boolean(
          tracked.definition?.stats?.poolCostFlat ||
          tracked.definition?.stats?.poolCostPercentage ||
          tracked.definition?.stats?.stabilityCostPercentage,
        ),
    );
    const baseHarmonyMods = getHarmonyStatModifiers(
      state.harmonyData,
      config.craftingType,
    );
    // Enhancing Echo scales this action's costs from the pre-action attunement:
    // echoing the attuned type halves them, breaking the echo doubles them.
    const harmonyCostMultipliers = getHarmonyCostMultipliers(
      state.harmonyData,
      config.craftingType,
      skill.type,
    );
    harmonyPoolMultiplier =
      (baseHarmonyMods.poolCostPercentage / 100) *
      (harmonyCostMultipliers.poolCostPercentage / 100);
    harmonyStabilityMultiplier =
      (baseHarmonyMods.stabilityCostPercentage / 100) *
      (harmonyCostMultipliers.stabilityCostPercentage / 100);

    if (hasCostAffectingBuff) {
      // The harmony multiplier is applied separately below, so the variable
      // build must see neutral harmony cost percentages.
      const runtimeVars = buildPreMasteryActionVariables(state, config, [], {
        ...baseHarmonyMods,
        poolCostPercentage: 100,
        stabilityCostPercentage: 100,
      });
      poolCostFlat = Math.max(0, Math.floor(runtimeVars.poolCostFlat ?? 0));
      poolCostPercentage = normalizeRuntimeCostPercentage(
        runtimeVars.poolCostPercentage,
      );
      stabilityCostPercentage = normalizeRuntimeCostPercentage(
        runtimeVars.stabilityCostPercentage,
      );
    }
  }
  // Condition effects multiply the cost *percentages* rather than the raw
  // costs, and are folded in before any rounding:
  //   e === 'poolCostPercentage' && effects.forEach(e => e.kind === 'pool' && (o *= e.multiplier))
  for (const effect of conditionEffects) {
    if (effect.multiplier === undefined) continue;
    if (effect.kind === 'pool') {
      poolCostPercentage *= effect.multiplier;
    } else if (effect.kind === 'stability') {
      stabilityCostPercentage *= effect.multiplier;
    }
  }

  let qiCost = getEffectiveQiCost(skill);
  let stabilityDelta = -getEffectiveStabilityCost(skill);

  // getPoolCost: `r = e; if (flat) r = max(0, r + flat); if (pct) r = floor(r * pct / 100)`
  // The flat surcharge is added *before* the percentage, and only one floor runs.
  if (poolCostFlat > 0) {
    qiCost = Math.max(0, qiCost + poolCostFlat);
  }
  if (poolCostPercentage !== 100) {
    qiCost = Math.floor((qiCost * poolCostPercentage) / 100);
  }

  if (harmonyPoolMultiplier !== 1) {
    qiCost = Math.floor(Math.max(0, qiCost) * harmonyPoolMultiplier);
  }

  // getStabilityCost: `n = -e; if (pct) n = ceil(n * pct / 100); return -n`
  // i.e. a single ceil applied to the negative stability delta.
  if (stabilityDelta < 0 && stabilityCostPercentage !== 100) {
    stabilityDelta = Math.ceil(
      (stabilityDelta * stabilityCostPercentage) / 100,
    );
  }

  if (stabilityDelta < 0 && harmonyStabilityMultiplier !== 1) {
    stabilityDelta = Math.floor(stabilityDelta * harmonyStabilityMultiplier);
  }

  return {
    qiCost: Math.max(0, qiCost),
    stabilityCost: Math.max(0, -stabilityDelta),
    requiredPostStability: Math.max(0, minStability),
  };
}

function buildPostCostStabilityFrame(
  state: CraftingState,
  skill: SkillDefinition,
  minStability: number,
  conditionEffects: ConditionEffect[] = [],
  config?: OptimizerConfig,
): PostCostStabilityFrame {
  const isItemAction = skill.actionKind === 'item';
  const consumesTurn = skill.consumesTurn ?? !isItemAction;
  const effectiveCosts = calculateEffectiveActionCosts(
    state,
    skill,
    minStability,
    conditionEffects,
    config,
  );

  let stabilityPenaltyAfterSetup = state.stabilityPenalty;
  if (consumesTurn && !skill.preventsMaxStabilityDecay) {
    stabilityPenaltyAfterSetup++;
  }
  stabilityPenaltyAfterSetup = Math.min(
    stabilityPenaltyAfterSetup,
    state.initialMaxStability,
  );

  let maxStabilityAfterSetup =
    state.initialMaxStability - stabilityPenaltyAfterSetup;
  if (skill.maxStabilityChange) {
    stabilityPenaltyAfterSetup = Math.min(
      state.initialMaxStability,
      Math.max(0, stabilityPenaltyAfterSetup - skill.maxStabilityChange),
    );
    maxStabilityAfterSetup =
      state.initialMaxStability - stabilityPenaltyAfterSetup;
  }
  if (skill.restoresMaxStabilityToFull) {
    stabilityPenaltyAfterSetup = 0;
    maxStabilityAfterSetup = state.initialMaxStability;
  }

  return {
    effectiveCosts,
    stabilityAfterCosts: state.stability - effectiveCosts.stabilityCost,
    stabilityPenaltyAfterSetup,
    maxStabilityAfterSetup,
  };
}

function clampDisplayedStabilityGain(
  gain: number,
  frame: PostCostStabilityFrame,
): number {
  if (!Number.isFinite(gain) || gain <= 0) {
    return gain;
  }

  const availableHeadroom =
    frame.maxStabilityAfterSetup - Math.max(0, frame.stabilityAfterCosts);
  if (availableHeadroom <= 0) {
    return 0;
  }

  return Math.min(gain, availableHeadroom);
}

/**
 * Calculate gains for Disciplined Touch skill.
 * Converts existing buffs into completion and perfection gains.
 *
 * The runtime defines both halves against Qi Intensity:
 *   effects: [
 *     { kind: 'perfection', amount: { value: 0.5, stat: 'intensity', upgradeKey: 'perfection' } },
 *     { kind: 'completion',  amount: { value: 0.5, stat: 'intensity', upgradeKey: 'perfection' } },
 *   ]
 * so perfection scales with intensity too, not control.
 *
 * @param state - Current crafting state with buff information
 * @param skill - The Disciplined Touch skill definition with multipliers
 * @param config - Optimizer config with base stats
 * @param conditionEffects - Current condition effects
 */
export function calculateDisciplinedTouchGains(
  state: CraftingState,
  skill: SkillDefinition,
  config: OptimizerConfig,
  conditionEffects: ConditionEffect[] = [],
  options: SkillGainOptions = {},
): SkillGains {
  const harmonyMods = getHarmonyStatModifiers(
    state.harmonyData,
    config.craftingType,
  );
  let preMasteryVars = buildPreMasteryActionVariables(
    state,
    config,
    conditionEffects,
    harmonyMods,
  );
  let resolvedMastery = resolveMasteryBonuses(state, skill, preMasteryVars);
  if (hasMasteryUpgrades(resolvedMastery.upgrades)) {
    preMasteryVars = buildPreMasteryActionVariables(
      state,
      config,
      conditionEffects,
      harmonyMods,
      resolvedMastery.upgrades,
    );
    resolvedMastery = resolveMasteryBonuses(state, skill, preMasteryVars);
  }

  const mastery = resolvedMastery.bonuses;
  const effectiveVars: ScalingVariables = {
    ...preMasteryVars,
    control: preMasteryVars.control * (1 + (mastery.controlBonus || 0)),
    intensity: preMasteryVars.intensity * (1 + (mastery.intensityBonus || 0)),
    critchance: preMasteryVars.critchance + (mastery.critChanceBonus || 0),
    critmultiplier:
      preMasteryVars.critmultiplier + (mastery.critMultiplierBonus || 0),
  };

  // Use skill's multipliers (baseCompletionGain and basePerfectionGain)
  // These are typically 0.5 each for Disciplined Touch
  const completionGain = safeFloor(
    safeMultiply(skill.baseCompletionGain, effectiveVars.intensity),
  );
  const perfectionGain = safeFloor(
    safeMultiply(skill.basePerfectionGain, effectiveVars.intensity),
  );

  // Apply crit (only to positive gains)
  const includeExpectedValue = options.includeExpectedValue ?? true;
  const critMultiplier = includeExpectedValue
    ? calculateExpectedCritMultiplier(
        effectiveVars.critchance,
        effectiveVars.critmultiplier,
      )
    : 1;

  return {
    completion: safeFloor(safeMultiply(completionGain, critMultiplier)),
    perfection: safeFloor(safeMultiply(perfectionGain, critMultiplier)),
    stability: 0,
  };
}

/**
 * Calculate the gains from applying a skill to the current state.
 *
 * Game-accurate implementation based on CraftingStuff source:
 * 1. Apply mastery bonuses to base stats
 * 2. Apply condition effects to stats
 * 3. Calculate gains using scaling formulas
 * 4. Apply expected crit multiplier (excess crit > 100% → bonus multiplier at 1:3)
 * 5. Apply success chance for expected value
 *
 * @param state - Current crafting state
 * @param skill - Skill being applied
 * @param config - Optimizer config with base stats
 * @param conditionEffects - Current condition effects
 */
export function calculateSkillGains(
  state: CraftingState,
  skill: SkillDefinition,
  config: OptimizerConfig,
  conditionEffects: ConditionEffect[] = [],
  options: SkillGainOptions = {},
): SkillGains {
  const includeExpectedValue = options.includeExpectedValue ?? true;
  const clampPredictedProgressGain = (
    gain: number,
    current: number,
    cap: number | undefined,
  ): number => {
    if (cap === undefined || !Number.isFinite(cap) || gain <= 0) {
      return gain;
    }
    const remaining = cap - current;
    if (remaining <= 0) {
      return 0;
    }
    return Math.min(gain, remaining);
  };

  /**
   * Expected progress for one action, clamping *before* the success-chance
   * weighting.
   *
   * The order matters. On success the game grants `min(gain, headroom)`, because
   * value past the top band is worthless; on failure it grants nothing. So the
   * expectation is `p * min(gain, headroom)`.
   *
   * Weighting first and clamping second - `min(p * gain, headroom)` - silently
   * erases the failure risk of any technique whose raw gain overshoots the
   * headroom, making an unreliable burst look like a guaranteed bar-filler.
   */
  const expectedProgressGain = (
    gainWithCrit: number,
    current: number,
    cap: number | undefined,
    expectedFactor: number,
  ): number =>
    safeFloor(
      safeMultiply(
        clampPredictedProgressGain(safeFloor(gainWithCrit), current, cap),
        expectedFactor,
      ),
    );

  // Handle Disciplined Touch specially - it uses both intensity and control with buffs
  if (skill.isDisciplinedTouch) {
    const disciplined = calculateDisciplinedTouchGains(
      state,
      skill,
      config,
      conditionEffects,
      options,
    );
    return {
      ...disciplined,
      completion: safeFloor(
        clampPredictedProgressGain(
          disciplined.completion,
          state.completion,
          config.maxCompletion,
        ),
      ),
      perfection: safeFloor(
        clampPredictedProgressGain(
          disciplined.perfection,
          state.perfection,
          config.maxPerfection,
        ),
      ),
    };
  }

  const harmonyMods = getHarmonyStatModifiers(
    state.harmonyData,
    config.craftingType,
  );
  let preMasteryVars = buildPreMasteryActionVariables(
    state,
    config,
    conditionEffects,
    harmonyMods,
  );
  let resolvedMastery = resolveMasteryBonuses(state, skill, preMasteryVars);
  if (hasMasteryUpgrades(resolvedMastery.upgrades)) {
    preMasteryVars = buildPreMasteryActionVariables(
      state,
      config,
      conditionEffects,
      harmonyMods,
      resolvedMastery.upgrades,
    );
    resolvedMastery = resolveMasteryBonuses(state, skill, preMasteryVars);
  }

  const mastery = resolvedMastery.bonuses;
  const masteryUpgrades = resolvedMastery.upgrades;

  const scalingVars: ScalingVariables = {
    ...preMasteryVars,
  };

  // Mastery stat bonuses apply to action variables before effect scaling.
  scalingVars.control *= 1 + (mastery.controlBonus || 0);
  scalingVars.intensity *= 1 + (mastery.intensityBonus || 0);
  scalingVars.critchance += mastery.critChanceBonus || 0;
  scalingVars.critmultiplier += mastery.critMultiplierBonus || 0;
  scalingVars.successChanceBonus += mastery.successChanceBonus || 0;

  const critFactor = includeExpectedValue
    ? calculateExpectedCritMultiplier(
        scalingVars.critchance,
        scalingVars.critmultiplier,
      )
    : 1;

  const baseSuccessChance = skill.successChance ?? 1;
  const totalSuccessChance = Math.min(
    1,
    Math.max(0, baseSuccessChance + scalingVars.successChanceBonus),
  );

  // Expected value = successChance * (gains with crit).
  // Note: Only positive gains can crit (matching game behavior).
  const expectedFactor = includeExpectedValue ? totalSuccessChance : 1;

  // Preferred path: evaluate authoritative technique effects.
  if (skill.effects && skill.effects.length > 0) {
    let completionGain = 0;
    let perfectionGain = 0;
    let stabilityGain = 0;
    let toxicityCleanse = 0;
    const recordBars = needsBarContributions(config);
    const barContributions: BarContribution[] = [];

    for (const effect of skill.effects) {
      if (!effect) continue;
      const conditionResult = evaluateEffectCondition(
        effect.condition,
        state,
        scalingVars,
        0,
      );
      if (!conditionResult.met || conditionResult.probability <= 0) {
        continue;
      }
      const conditionFactor = conditionResult.probability;

      switch (effect.kind) {
        case 'completion': {
          let amount =
            evaluateScalingWithMasteryUpgrades(
              effect.amount,
              masteryUpgrades,
              scalingVars,
              0,
            ) * conditionFactor;
          if (amount < 0 && (effect.amount?.value ?? 0) > 0) {
            amount = 0;
          }
          completionGain += amount;
          if (recordBars && amount !== 0) {
            barContributions.push({ bar: 'completion', amount });
          }
          break;
        }
        case 'perfection': {
          let amount =
            evaluateScalingWithMasteryUpgrades(
              effect.amount,
              masteryUpgrades,
              scalingVars,
              0,
            ) * conditionFactor;
          if (amount < 0 && (effect.amount?.value ?? 0) > 0) {
            amount = 0;
          }
          perfectionGain += amount;
          if (recordBars && amount !== 0) {
            barContributions.push({ bar: 'perfection', amount });
          }
          break;
        }
        case 'stability':
          stabilityGain +=
            evaluateScalingWithMasteryUpgrades(
              effect.amount,
              masteryUpgrades,
              scalingVars,
              0,
            ) * conditionFactor;
          break;
        case 'cleanseToxicity':
          toxicityCleanse +=
            evaluateScalingWithMasteryUpgrades(
              effect.amount,
              masteryUpgrades,
              scalingVars,
              0,
            ) * conditionFactor;
          break;
      }
    }

    const completionWithCrit =
      completionGain > 0 ? completionGain * critFactor : completionGain;
    const perfectionWithCrit =
      perfectionGain > 0 ? perfectionGain * critFactor : perfectionGain;

    return {
      completion: expectedProgressGain(
        completionWithCrit,
        state.completion,
        config.maxCompletion,
        expectedFactor,
      ),
      perfection: expectedProgressGain(
        perfectionWithCrit,
        state.perfection,
        config.maxPerfection,
        expectedFactor,
      ),
      stability: safeFloor(safeMultiply(stabilityGain, expectedFactor)),
      toxicityCleanse: safeFloor(safeMultiply(toxicityCleanse, expectedFactor)),
      barContributions,
    };
  }

  // Legacy fallback path for tests/offline fixtures that only provide scalar fields.
  let completionGain = skill.baseCompletionGain;
  let perfectionGain = skill.basePerfectionGain;
  let stabilityGain = skill.stabilityGain;
  let toxicityCleanse = skill.toxicityCleanse || 0;

  // Stack-based buff scaling for techniques that consume buffs
  if (
    skill.buffCost &&
    !skill.scalesWithControl &&
    !skill.scalesWithIntensity
  ) {
    const have = state.getBuffStacks(skill.buffCost.buffName);
    const stacksUsed = skill.buffCost.consumeAll
      ? have
      : Math.min(have, skill.buffCost.amount ?? 0);
    if (stacksUsed > 1) {
      completionGain = safeMultiply(completionGain, stacksUsed);
      perfectionGain = safeMultiply(perfectionGain, stacksUsed);
      stabilityGain = safeMultiply(stabilityGain, stacksUsed);
      toxicityCleanse = safeMultiply(toxicityCleanse, stacksUsed);
    }
  }

  if (skill.scalesWithControl) {
    perfectionGain = safeFloor(
      safeMultiply(skill.basePerfectionGain, scalingVars.control),
    );
    completionGain =
      skill.baseCompletionGain > 0
        ? safeFloor(safeMultiply(skill.baseCompletionGain, scalingVars.control))
        : 0;
  }
  if (skill.scalesWithIntensity && skill.type === 'fusion') {
    completionGain = safeFloor(
      safeMultiply(skill.baseCompletionGain, scalingVars.intensity),
    );
  }

  return {
    completion: expectedProgressGain(
      safeMultiply(completionGain, critFactor),
      state.completion,
      config.maxCompletion,
      expectedFactor,
    ),
    perfection: expectedProgressGain(
      safeMultiply(perfectionGain, critFactor),
      state.perfection,
      config.maxPerfection,
      expectedFactor,
    ),
    stability: safeFloor(safeMultiply(stabilityGain, expectedFactor)),
    toxicityCleanse: safeFloor(safeMultiply(toxicityCleanse, expectedFactor)),
  };
}

/**
 * Calculate display-facing gains using the same post-cost stability cap that
 * applySkill() enforces, so recommendation previews do not advertise restore
 * amounts that cannot actually fit under the current max stability.
 */
export function calculateDisplayedSkillGains(
  state: CraftingState,
  skill: SkillDefinition,
  config: OptimizerConfig,
  conditionEffects: ConditionEffect[] = [],
  options: SkillGainOptions = {},
): SkillGains {
  const gains = calculateSkillGains(
    state,
    skill,
    config,
    conditionEffects,
    options,
  );
  if (gains.stability <= 0) {
    return gains;
  }

  const frame = buildPostCostStabilityFrame(
    state,
    skill,
    config.minStability,
    conditionEffects,
    config,
  );

  return {
    ...gains,
    stability: safeFloor(clampDisplayedStabilityGain(gains.stability, frame)),
  };
}

function resolveGuaranteedContribution(
  amount: number,
  probability: number,
): number {
  if (!Number.isFinite(amount) || amount === 0) {
    return 0;
  }
  if (!Number.isFinite(probability) || probability <= 0) {
    return 0;
  }
  if (probability >= 1) {
    return amount;
  }
  return amount < 0 ? amount : 0;
}

/**
 * Compute a guaranteed post-action stability floor for survivability checks.
 *
 * The main simulator uses expected value for chance-based effects. That is
 * appropriate for progress scoring, but it can make a proc-dependent survival
 * line look "safe" when the craft actually dies on the unlucky branch. This
 * helper replays only the immediate stability/max-stability state changes with a
 * pessimistic probability policy:
 * - beneficial probabilistic stability/max-stability effects are treated as 0
 * - harmful probabilistic stability/max-stability effects are treated as happening
 *
 * Search uses this floor to keep guaranteed-safe lines ahead of proc-dependent
 * survival lines when goals are still unmet.
 */
export function calculateActionSurvivabilityFloor(
  state: CraftingState,
  skill: SkillDefinition,
  config: OptimizerConfig,
  conditionEffects: ConditionEffect[] = [],
  currentCondition?: string,
): ActionSurvivabilityFloor | null {
  const maxToxicity = config.maxToxicity || 0;
  const resolvedActiveBuffs = getResolvedActiveBuffs(state, config);

  if (
    !canApplySkill(
      state,
      skill,
      config.minStability,
      maxToxicity,
      currentCondition,
      conditionEffects,
      config.pillsPerRound || 1,
      config,
    )
  ) {
    return null;
  }

  const isItemAction = skill.actionKind === 'item';
  const consumesTurn = skill.consumesTurn ?? !isItemAction;
  const effectiveCosts = calculateEffectiveActionCosts(
    state,
    skill,
    config.minStability,
    conditionEffects,
    config,
  );

  let newStabilityPenalty = state.stabilityPenalty;
  if (consumesTurn && !skill.preventsMaxStabilityDecay) {
    newStabilityPenalty++;
  }
  newStabilityPenalty = Math.min(
    newStabilityPenalty,
    state.initialMaxStability,
  );

  if (skill.maxStabilityChange) {
    newStabilityPenalty = Math.min(
      state.initialMaxStability,
      Math.max(0, newStabilityPenalty - skill.maxStabilityChange),
    );
  }
  if (skill.restoresMaxStabilityToFull) {
    newStabilityPenalty = 0;
  }

  let newMaxStability = state.initialMaxStability - newStabilityPenalty;
  let newStability = state.stability - effectiveCosts.stabilityCost;

  // Track deterministic qi/toxicity for runtime-shaped buff conditions.
  let qiCap = getEffectiveMaxPool(state, config, resolvedActiveBuffs);
  const clampQi = (value: number): number =>
    Math.max(0, Math.min(qiCap, value));
  let newQi = clampQi(state.qi - effectiveCosts.qiCost);
  const hasExplicitPoolEffect =
    Array.isArray(skill.effects) &&
    skill.effects.some((effect) => effect?.kind === 'pool');
  if (
    !hasExplicitPoolEffect &&
    skill.restoresQi &&
    skill.qiRestore &&
    skill.qiRestore > 0
  ) {
    newQi = clampQi(newQi + skill.qiRestore);
  }
  let newToxicity = state.toxicity + (skill.toxicityCost || 0);

  const newBuffs = new Map(resolvedActiveBuffs);
  if (skill.buffCost) {
    const buff = newBuffs.get(skill.buffCost.buffName);
    if (buff) {
      const have = buff.stacks;
      const consume = skill.buffCost.consumeAll
        ? have
        : Math.min(have, skill.buffCost.amount ?? 0);
      const remaining = Math.max(0, have - consume);
      if (remaining > 0) {
        newBuffs.set(skill.buffCost.buffName, { ...buff, stacks: remaining });
      } else {
        newBuffs.delete(skill.buffCost.buffName);
      }
    }
  }

  const upsertBuffFromDefinition = (
    definition: BuffDefinition | undefined,
    stacksDelta: number,
  ): void => {
    if (!definition || !Number.isFinite(stacksDelta)) return;
    const delta = Math.floor(stacksDelta);
    if (delta === 0) return;

    const buffKey = normalizeBuffName(definition.name);
    if (!buffKey) return;

    const existing = newBuffs.get(buffKey);
    const canStack =
      definition.canStack ?? existing?.definition?.canStack ?? true;
    const maxStacks = definition.maxStacks ?? existing?.definition?.maxStacks;

    if (existing) {
      if (!canStack) {
        return;
      }
      let nextStacks = existing.stacks + delta;
      if (maxStacks !== undefined) {
        nextStacks = Math.min(nextStacks, maxStacks);
      }
      if (nextStacks > 0) {
        newBuffs.set(buffKey, {
          ...existing,
          definition: existing.definition ?? definition,
          stacks: Math.floor(nextStacks),
        });
      } else {
        newBuffs.delete(buffKey);
      }
      return;
    }

    if (delta > 0) {
      let nextStacks = delta;
      if (maxStacks !== undefined) {
        nextStacks = Math.min(nextStacks, maxStacks);
      }
      newBuffs.set(buffKey, {
        name: buffKey,
        stacks: Math.floor(nextStacks),
        definition,
      });
    }
  };

  const adjustExistingBuffStacks = (
    buffKey: string,
    stacksDelta: number,
  ): void => {
    const existing = newBuffs.get(buffKey);
    if (!existing || !Number.isFinite(stacksDelta)) return;

    const delta = Math.floor(stacksDelta);
    if (delta === 0) return;

    let nextStacks = existing.stacks + delta;
    const maxStacks = existing.definition?.maxStacks;
    if (maxStacks !== undefined) {
      nextStacks = Math.min(nextStacks, maxStacks);
    }
    if (nextStacks > 0) {
      newBuffs.set(buffKey, { ...existing, stacks: Math.floor(nextStacks) });
    } else {
      newBuffs.delete(buffKey);
    }
  };

  interface SurvivalEvent {
    probability: number;
    stabilityDelta: number;
    maxStabilityDelta: number;
  }

  const survivalEvents: SurvivalEvent[] = [];

  const queueSurvivalEvent = (
    probability: number,
    stabilityDelta: number,
    maxStabilityDelta: number,
  ): void => {
    if (!Number.isFinite(probability) || probability <= 0 || probability >= 1) {
      return;
    }
    if (
      !Number.isFinite(stabilityDelta) ||
      !Number.isFinite(maxStabilityDelta)
    ) {
      return;
    }
    if (stabilityDelta <= 0 && maxStabilityDelta <= 0) {
      return;
    }

    survivalEvents.push({
      probability,
      stabilityDelta,
      maxStabilityDelta,
    });
  };

  const calculateSurvivalProbability = (
    baseStability: number,
    baseMaxStability: number,
  ): number => {
    type SurvivalOutcome = {
      probability: number;
      stability: number;
      maxStability: number;
    };

    const addOutcome = (
      outcomes: Map<string, SurvivalOutcome>,
      outcome: SurvivalOutcome,
    ): void => {
      if (outcome.probability <= 0) return;
      const key = `${outcome.stability}|${outcome.maxStability}`;
      const existing = outcomes.get(key);
      if (existing) {
        existing.probability += outcome.probability;
        return;
      }
      outcomes.set(key, outcome);
    };

    let outcomes = new Map<string, SurvivalOutcome>();
    addOutcome(outcomes, {
      probability: 1,
      stability: Math.max(0, Math.floor(baseStability)),
      maxStability: Math.max(0, Math.floor(baseMaxStability)),
    });

    for (const event of survivalEvents) {
      const nextOutcomes = new Map<string, SurvivalOutcome>();
      for (const outcome of Array.from(outcomes.values())) {
        addOutcome(nextOutcomes, {
          probability: outcome.probability * (1 - event.probability),
          stability: outcome.stability,
          maxStability: outcome.maxStability,
        });

        const nextMaxStability = Math.max(
          0,
          Math.min(
            state.initialMaxStability,
            Math.floor(outcome.maxStability + event.maxStabilityDelta),
          ),
        );
        const nextStability = Math.max(
          0,
          Math.min(
            nextMaxStability,
            Math.floor(outcome.stability + event.stabilityDelta),
          ),
        );
        addOutcome(nextOutcomes, {
          probability: outcome.probability * event.probability,
          stability: nextStability,
          maxStability: nextMaxStability,
        });
      }
      outcomes = nextOutcomes;
    }

    let survivalProbability = 0;
    for (const outcome of Array.from(outcomes.values())) {
      if (outcome.stability > 0) {
        survivalProbability += outcome.probability;
      }
    }

    return Math.max(0, Math.min(1, survivalProbability));
  };

  const harmonyMods = getHarmonyStatModifiers(
    state.harmonyData,
    config.craftingType,
  );
  let preMasteryActionVars = buildPreMasteryActionVariables(
    state,
    config,
    conditionEffects,
    harmonyMods,
  );
  let resolvedActionMastery = resolveMasteryBonuses(
    state,
    skill,
    preMasteryActionVars,
  );
  if (hasMasteryUpgrades(resolvedActionMastery.upgrades)) {
    preMasteryActionVars = buildPreMasteryActionVariables(
      state,
      config,
      conditionEffects,
      harmonyMods,
      resolvedActionMastery.upgrades,
    );
    resolvedActionMastery = resolveMasteryBonuses(
      state,
      skill,
      preMasteryActionVars,
    );
  }

  const mastery = resolvedActionMastery.bonuses;
  const actionMasteryUpgrades = resolvedActionMastery.upgrades;
  const actionVars = {
    ...preMasteryActionVars,
  };
  actionVars.control *= 1 + (mastery.controlBonus || 0);
  actionVars.intensity *= 1 + (mastery.intensityBonus || 0);
  actionVars.critchance += mastery.critChanceBonus || 0;
  actionVars.critmultiplier += mastery.critMultiplierBonus || 0;
  actionVars.successChanceBonus += mastery.successChanceBonus || 0;

  const actionSuccessChance = isItemAction
    ? 1
    : Math.max(
        0,
        Math.min(1, (skill.successChance ?? 1) + actionVars.successChanceBonus),
      );

  if (!skill.effects || skill.effects.length === 0) {
    let guaranteedDirectStabilityGain = skill.stabilityGain;

    if (
      skill.buffCost &&
      !skill.scalesWithControl &&
      !skill.scalesWithIntensity
    ) {
      const have = state.getBuffStacks(skill.buffCost.buffName);
      const stacksUsed = skill.buffCost.consumeAll
        ? have
        : Math.min(have, skill.buffCost.amount ?? 0);
      if (stacksUsed > 1) {
        guaranteedDirectStabilityGain = safeMultiply(
          guaranteedDirectStabilityGain,
          stacksUsed,
        );
      }
    }

    newStability = Math.floor(
      clampStabilityToBounds(
        newStability +
          resolveGuaranteedContribution(
            guaranteedDirectStabilityGain,
            actionSuccessChance,
          ),
        newMaxStability,
      ),
    );
  }

  let guaranteedTechniqueStabilityDelta = 0;
  let guaranteedTechniqueMaxStabilityDelta = 0;
  let guaranteedTechniquePoolDelta = 0;
  let guaranteedTechniqueToxicityDelta = 0;

  if (skill.effects && skill.effects.length > 0) {
    for (const effect of skill.effects) {
      if (!effect) continue;
      const conditionResult = evaluateEffectCondition(
        effect.condition,
        state,
        actionVars,
        0,
      );
      if (!conditionResult.met || conditionResult.probability <= 0) {
        continue;
      }

      switch (effect.kind) {
        case 'stability': {
          const amount = evaluateScalingWithMasteryUpgrades(
            effect.amount,
            actionMasteryUpgrades,
            actionVars,
            0,
          );
          guaranteedTechniqueStabilityDelta += resolveGuaranteedContribution(
            amount,
            actionSuccessChance * conditionResult.probability,
          );
          queueSurvivalEvent(
            actionSuccessChance * conditionResult.probability,
            amount,
            0,
          );
          break;
        }
        case 'maxStability': {
          const amount = evaluateScalingWithMasteryUpgrades(
            effect.amount,
            actionMasteryUpgrades,
            actionVars,
            0,
          );
          guaranteedTechniqueMaxStabilityDelta += resolveGuaranteedContribution(
            amount,
            actionSuccessChance * conditionResult.probability,
          );
          queueSurvivalEvent(
            actionSuccessChance * conditionResult.probability,
            0,
            amount,
          );
          break;
        }
        case 'pool': {
          const amount = evaluateScalingWithMasteryUpgrades(
            effect.amount,
            actionMasteryUpgrades,
            actionVars,
            0,
          );
          guaranteedTechniquePoolDelta += resolveGuaranteedContribution(
            amount,
            actionSuccessChance * conditionResult.probability,
          );
          break;
        }
        case 'cleanseToxicity': {
          const amount = evaluateScalingWithMasteryUpgrades(
            effect.amount,
            actionMasteryUpgrades,
            actionVars,
            0,
          );
          guaranteedTechniqueToxicityDelta += resolveGuaranteedContribution(
            -amount,
            actionSuccessChance * conditionResult.probability,
          );
          break;
        }
        case 'createBuff': {
          const stacksToAdd = evaluateScalingWithMasteryUpgrades(
            effect.stacks,
            actionMasteryUpgrades,
            actionVars,
            1,
          );
          if (
            resolveGuaranteedContribution(
              stacksToAdd,
              actionSuccessChance * conditionResult.probability,
            ) > 0
          ) {
            upsertBuffFromDefinition(effect.buff, stacksToAdd);
          }
          break;
        }
        case 'consumeBuff': {
          const buffKey = normalizeBuffName(effect.buff?.name);
          if (!buffKey) break;
          const stacksToConsume = evaluateScalingWithMasteryUpgrades(
            effect.stacks,
            actionMasteryUpgrades,
            actionVars,
            1,
          );
          const guaranteedStacksToConsume = Math.abs(
            resolveGuaranteedContribution(
              -stacksToConsume,
              actionSuccessChance * conditionResult.probability,
            ),
          );
          if (guaranteedStacksToConsume > 0) {
            adjustExistingBuffStacks(
              buffKey,
              -Math.floor(guaranteedStacksToConsume),
            );
          }
          break;
        }
      }
    }
  }

  newQi = clampQi(newQi + guaranteedTechniquePoolDelta);
  newToxicity = Math.max(0, newToxicity + guaranteedTechniqueToxicityDelta);
  newStability += guaranteedTechniqueStabilityDelta;
  newStability = Math.floor(newStability);
  if (newStability < 0) newStability = 0;
  if (newStability > newMaxStability) newStability = newMaxStability;

  let buffStabilityDelta = 0;
  let buffMaxStabilityDelta = 0;
  let buffPoolDelta = 0;
  let buffToxicityDelta = 0;
  qiCap = getEffectiveMaxPool(
    state.copy({
      qi: newQi,
      stability: newStability,
      stabilityPenalty: newStabilityPenalty,
      toxicity: newToxicity,
      buffs: newBuffs,
    }),
    config,
    newBuffs,
  );

  const applyGuaranteedBuffEffect = (
    effect: BuffEffect,
    ownerBuffKey: string,
    ownerBuff: { name: string; stacks: number; definition?: BuffDefinition },
    scalingVars: ScalingVariables,
  ): void => {
    const conditionResult = evaluateEffectCondition(
      effect.condition,
      state,
      scalingVars,
      ownerBuff.stacks,
    );
    if (!conditionResult.met || conditionResult.probability <= 0) {
      return;
    }

    switch (effect.kind) {
      case 'stability': {
        const amount = evaluateScalingWithMasteryUpgrades(
          effect.amount,
          actionMasteryUpgrades,
          scalingVars,
          0,
        );
        buffStabilityDelta += resolveGuaranteedContribution(
          amount,
          conditionResult.probability,
        );
        queueSurvivalEvent(conditionResult.probability, amount, 0);
        break;
      }
      case 'maxStability': {
        const amount = evaluateScalingWithMasteryUpgrades(
          effect.amount,
          actionMasteryUpgrades,
          scalingVars,
          0,
        );
        buffMaxStabilityDelta += resolveGuaranteedContribution(
          amount,
          conditionResult.probability,
        );
        queueSurvivalEvent(conditionResult.probability, 0, amount);
        break;
      }
      case 'pool': {
        const amount = evaluateScalingWithMasteryUpgrades(
          effect.amount,
          actionMasteryUpgrades,
          scalingVars,
          0,
        );
        buffPoolDelta += resolveGuaranteedContribution(
          amount,
          conditionResult.probability,
        );
        break;
      }
      case 'changeToxicity': {
        const amount = evaluateScalingWithMasteryUpgrades(
          effect.amount,
          actionMasteryUpgrades,
          scalingVars,
          0,
        );
        // Runtime `changeToxicity` does `stats.toxicity -= amount`: a positive
        // amount cleanses toxicity, a negative amount inflicts it.
        buffToxicityDelta -= resolveGuaranteedContribution(
          amount,
          conditionResult.probability,
        );
        break;
      }
      case 'createBuff': {
        const stacksToAdd = evaluateScalingWithMasteryUpgrades(
          effect.stacks,
          actionMasteryUpgrades,
          scalingVars,
          1,
        );
        if (
          resolveGuaranteedContribution(
            stacksToAdd,
            conditionResult.probability,
          ) > 0
        ) {
          upsertBuffFromDefinition(effect.buff, stacksToAdd);
        }
        break;
      }
      case 'addStack': {
        const stackChange = evaluateScalingWithMasteryUpgrades(
          effect.stacks,
          actionMasteryUpgrades,
          scalingVars,
          1,
        );
        const guaranteedStackChange = resolveGuaranteedContribution(
          stackChange,
          conditionResult.probability,
        );
        if (guaranteedStackChange !== 0) {
          adjustExistingBuffStacks(
            ownerBuffKey,
            Math.floor(guaranteedStackChange),
          );
        }
        break;
      }
      case 'negate':
        if (conditionResult.probability > 0) {
          newBuffs.delete(ownerBuffKey);
        }
        break;
    }
  };

  if (consumesTurn) {
    for (const [buffKey, buff] of Array.from(newBuffs.entries())) {
      if (!buff.definition) continue;
      const scalingVars: ScalingVariables = {
        ...actionVars,
        pool: newQi,
        maxpool: qiCap,
        toxicity: newToxicity,
        maxtoxicity: config.maxToxicity || 0,
        poolCostFlat: state.poolCostFlat,
        poolCostPercentage: state.poolCostPercentage,
        stabilityCostPercentage: state.stabilityCostPercentage,
        stacks: buff.stacks,
      };

      if (buff.definition.effects) {
        for (const effect of buff.definition.effects) {
          applyGuaranteedBuffEffect(effect, buffKey, buff, scalingVars);
        }
      }

      const actionEffects: BuffEffect[] | undefined =
        skill.type === 'fusion'
          ? buff.definition.onFusion
          : skill.type === 'refine'
            ? buff.definition.onRefine
            : skill.type === 'stabilize'
              ? buff.definition.onStabilize
              : skill.type === 'support'
                ? buff.definition.onSupport
                : undefined;
      if (actionEffects) {
        for (const effect of actionEffects) {
          applyGuaranteedBuffEffect(effect, buffKey, buff, scalingVars);
        }
      }
    }

    // Mirror the reducer's post-turn Turbid Qi grant so the projected buff map
    // stays in parity with `applySkill`.
    if (grantsTurbidQiStack(state.step + 1)) {
      const turbidQiKey = findTurbidQiBuffKey(newBuffs);
      if (turbidQiKey) {
        adjustExistingBuffStacks(turbidQiKey, 1);
      }
    }
  }

  if (guaranteedTechniqueMaxStabilityDelta !== 0) {
    newStabilityPenalty = Math.min(
      state.initialMaxStability,
      Math.max(0, newStabilityPenalty - guaranteedTechniqueMaxStabilityDelta),
    );
    newMaxStability = state.initialMaxStability - newStabilityPenalty;
    if (newStability > newMaxStability) {
      newStability = newMaxStability;
    }
  }

  newStability = Math.floor(
    clampStabilityToBounds(newStability + buffStabilityDelta, newMaxStability),
  );
  newQi = clampQi(newQi + buffPoolDelta);
  newToxicity = Math.max(0, newToxicity + buffToxicityDelta);
  if (buffMaxStabilityDelta !== 0) {
    newStabilityPenalty = Math.min(
      state.initialMaxStability,
      Math.max(0, newStabilityPenalty - buffMaxStabilityDelta),
    );
    newMaxStability = state.initialMaxStability - newStabilityPenalty;
    if (newStability > newMaxStability) {
      newStability = newMaxStability;
    }
  }

  if (
    consumesTurn &&
    !isItemAction &&
    config.isSublimeCraft &&
    config.craftingType &&
    state.harmonyData
  ) {
    const harmonyResult = processHarmonyEffect(
      state.harmonyData,
      config.craftingType,
      skill.type,
    );
    if (harmonyResult.stabilityDelta !== 0) {
      newStability = clampStabilityToBounds(
        newStability + harmonyResult.stabilityDelta,
        newMaxStability,
      );
    }
    if (harmonyResult.stabilityPenaltyDelta !== 0) {
      newStabilityPenalty += harmonyResult.stabilityPenaltyDelta;
      newStabilityPenalty = Math.min(
        newStabilityPenalty,
        state.initialMaxStability,
      );
      newMaxStability = state.initialMaxStability - newStabilityPenalty;
      if (newStability > newMaxStability) {
        newStability = newMaxStability;
      }
    }
  }

  const finalStability = Math.max(0, Math.floor(newStability));
  const finalMaxStability = Math.max(0, Math.floor(newMaxStability));

  return {
    stability: finalStability,
    maxStability: finalMaxStability,
    survivalProbability: calculateSurvivalProbability(
      finalStability,
      finalMaxStability,
    ),
  };
}

/**
 * Check if a condition requirement is met by the current condition.
 * Skills require EXACT condition match - e.g., Harmonious skills only work during Harmonious (positive),
 * NOT during Brilliant (veryPositive). This matches the game's behavior.
 */
export function checkConditionRequirement(
  requirement: string,
  current: string,
): boolean {
  const req = normalizeCondition(requirement);
  const cur = normalizeCondition(current);
  if (!req || !cur) return false;

  // Exact match required - skills with condition requirements only work during that exact condition
  // e.g., Harmonious (positive) skills do NOT work during Brilliant/Excellent (veryPositive)
  return req === cur;
}

/**
 * Get effective qi cost after mastery reductions.
 */
export function getEffectiveQiCost(skill: SkillDefinition): number {
  const mastery = skill.mastery || {};
  const reduction = mastery.poolCostReduction || 0;
  if (Math.abs(reduction) <= 1) {
    return Math.max(0, Math.ceil(skill.qiCost * (1 - reduction)));
  }
  return Math.max(0, skill.qiCost - reduction);
}

/**
 * Get effective stability cost after mastery reductions.
 */
export function getEffectiveStabilityCost(skill: SkillDefinition): number {
  const mastery = skill.mastery || {};
  const reduction = mastery.stabilityCostReduction || 0;
  if (Math.abs(reduction) <= 1) {
    return Math.max(0, Math.ceil(skill.stabilityCost * (1 - reduction)));
  }
  return Math.max(0, skill.stabilityCost - reduction);
}

/**
 * Check if a skill can be applied given the current state.
 * Now handles cooldowns, toxicity, mastery cost reductions, and condition requirements.
 */
export function canApplySkill(
  state: CraftingState,
  skill: SkillDefinition,
  minStability: number,
  maxToxicity: number = 0,
  currentCondition?: string,
  conditionEffects: ConditionEffect[] = [],
  pillsPerRound: number = 1,
  config?: OptimizerConfig,
): boolean {
  const isItemAction = skill.actionKind === 'item';

  // Game requires current stability to be above 0 to perform actions.
  if (state.stability <= 0) {
    return false;
  }

  // Check cooldown (techniques only)
  if (!isItemAction && state.isOnCooldown(skill.key)) {
    return false;
  }

  // Check condition requirement (e.g., Harmonious skills require specific conditions)
  if (!isItemAction && skill.conditionRequirement && currentCondition) {
    // Check if current condition meets the requirement
    // veryPositive requirement: only veryPositive works
    // positive requirement: positive or veryPositive works
    // negative requirement: negative or veryNegative works
    // veryNegative requirement: only veryNegative works
    const conditionMet = checkConditionRequirement(
      skill.conditionRequirement,
      currentCondition,
    );
    if (!conditionMet) {
      return false;
    }
  }

  // Check buff requirements (stack-based buffs)
  if (!isItemAction && skill.buffRequirement) {
    const have = state.getBuffStacks(skill.buffRequirement.buffName);
    if (have < skill.buffRequirement.amount) {
      return false;
    }
  }

  // Check buff costs (consumed on use)
  if (!isItemAction && skill.buffCost) {
    const have = state.getBuffStacks(skill.buffCost.buffName);
    const required = skill.buffCost.consumeAll
      ? 1
      : (skill.buffCost.amount ?? 0);
    if (required > 0 && have < required) {
      return false;
    }
  }

  if (isItemAction) {
    const itemKey = normalizeBuffName(skill.itemName || skill.key);
    const remaining = state.items.get(itemKey) ?? 0;
    if (remaining <= 0) {
      return false;
    }

    if (skill.reagentOnlyAtStepZero && state.step !== 0) {
      return false;
    }

    const perTurnLimit = Math.max(1, Math.floor(pillsPerRound || 1));
    if (state.consumedPillsThisTurn >= perTurnLimit) {
      return false;
    }
  }

  const effectiveCosts = calculateEffectiveActionCosts(
    state,
    skill,
    minStability,
    conditionEffects,
    config,
  );

  // Check qi requirement
  if (state.qi < effectiveCosts.qiCost) {
    return false;
  }

  // Check toxicity requirement for alchemy crafting
  // Skill cannot be used if it would push toxicity over max
  if (maxToxicity > 0 && skill.toxicityCost) {
    if (state.toxicity + skill.toxicityCost > maxToxicity) {
      return false;
    }
  }

  if (!isItemAction) {
    const nativeCanUse = runNativeCanUseActionPrecheck({
      state,
      skill,
      currentCondition,
      conditionEffects,
      maxToxicity,
      minStability,
      pillsPerRound,
      effectiveQiCost: effectiveCosts.qiCost,
    });
    if (nativeCanUse === false) {
      return false;
    }
  }

  return true;
}

/**
 * Apply a skill to the state and return the new state.
 * Returns null if the skill cannot be applied.
 *
 * Game-accurate implementation based on CraftingStuff source:
 * 1. Apply toxicity cost
 * 2. Consume buff costs
 * 3. Apply pool/stability costs
 * 4. Execute technique effects
 * 5. Process turn (cooldowns, buff effects, condition advance, max stability decay)
 * 6. Update completion bonus
 *
 * @param state - Current crafting state
 * @param skill - Skill to apply
 * @param config - Optimizer config
 * @param conditionEffects - Current condition effects
 * @param targetCompletion - Target completion for completion bonus calculation
 */
export function applySkill(
  state: CraftingState,
  skill: SkillDefinition,
  config: OptimizerConfig,
  conditionEffects: ConditionEffect[] = [],
  targetCompletion: number = 0,
  currentCondition?: string,
): CraftingState | null {
  const maxToxicity = config.maxToxicity || 0;
  const resolvedActiveBuffs = getResolvedActiveBuffs(state, config);

  // Validate skill can be applied
  if (
    !canApplySkill(
      state,
      skill,
      config.minStability,
      maxToxicity,
      currentCondition,
      conditionEffects,
      config.pillsPerRound || 1,
      config,
    )
  ) {
    return null;
  }

  const isItemAction = skill.actionKind === 'item';
  const consumesTurn = skill.consumesTurn ?? !isItemAction;
  const nextStep = state.step + (consumesTurn ? 1 : 0);
  let qiCap = getEffectiveMaxPool(state, config, resolvedActiveBuffs);
  const clampQi = (value: number): number =>
    Math.max(0, Math.min(qiCap, value));

  // Calculate gains BEFORE applying buffs from this skill
  const gains = calculateSkillGains(state, skill, config, conditionEffects);

  const effectiveCosts = calculateEffectiveActionCosts(
    state,
    skill,
    config.minStability,
    conditionEffects,
    config,
  );
  const effectiveQiCost = effectiveCosts.qiCost;
  const effectiveStabilityCost = effectiveCosts.stabilityCost;

  // Calculate new resource values
  let newQi = clampQi(state.qi - effectiveQiCost);
  const hasExplicitPoolEffect =
    Array.isArray(skill.effects) &&
    skill.effects.some((effect) => effect?.kind === 'pool');
  if (
    !hasExplicitPoolEffect &&
    skill.restoresQi &&
    skill.qiRestore &&
    skill.qiRestore > 0
  ) {
    newQi = clampQi(newQi + skill.qiRestore);
  }

  // Handle max stability using game's penalty system:
  // 1. Apply standard decay of 1 per turn (unless skill prevents it)
  // 2. Apply any direct max stability change from the skill effect
  // 3. Apply any full restore effect
  let newStabilityPenalty = state.stabilityPenalty;

  // Standard max stability decay: increases penalty by 1 each turn unless skill prevents it
  if (consumesTurn && !skill.preventsMaxStabilityDecay) {
    newStabilityPenalty++;
  }

  // Cap penalty at initial max stability
  newStabilityPenalty = Math.min(
    newStabilityPenalty,
    state.initialMaxStability,
  );

  // Calculate the new max stability
  let newMaxStability = state.initialMaxStability - newStabilityPenalty;

  // Apply max stability changes from skill
  if (skill.maxStabilityChange) {
    // Negative changes to max stability increase the penalty
    // Positive changes decrease the penalty (restore max stability)
    newStabilityPenalty = Math.min(
      state.initialMaxStability,
      Math.max(0, newStabilityPenalty - skill.maxStabilityChange),
    );
    newMaxStability = state.initialMaxStability - newStabilityPenalty;
  }

  if (skill.restoresMaxStabilityToFull) {
    newStabilityPenalty = 0;
    newMaxStability = state.initialMaxStability;
  }

  // Calculate new stability (current stability, not max)
  let newStability = state.stability - effectiveStabilityCost + gains.stability;

  // Clamp stability
  newStability = Math.floor(newStability);
  if (newStability < 0) newStability = 0;
  if (newStability > newMaxStability) newStability = newMaxStability;

  // Handle toxicity for alchemy crafting
  let newToxicity = state.toxicity;
  if (skill.toxicityCost) {
    newToxicity += skill.toxicityCost;
  }
  // Apply toxicity cleanse
  if (gains.toxicityCleanse && gains.toxicityCleanse > 0) {
    newToxicity = Math.max(0, newToxicity - gains.toxicityCleanse);
  }

  // Decrement existing buff durations
  let newControlBuffTurns =
    consumesTurn && state.controlBuffTurns > 0
      ? state.controlBuffTurns - 1
      : state.controlBuffTurns;
  let newIntensityBuffTurns =
    consumesTurn && state.intensityBuffTurns > 0
      ? state.intensityBuffTurns - 1
      : state.intensityBuffTurns;

  // Disciplined Touch consumes all active buffs after using them for gains
  if (skill.isDisciplinedTouch) {
    newControlBuffTurns = 0;
    newIntensityBuffTurns = 0;
  }

  // Apply NEW buffs from this skill (active next turn)
  let newControlBuffMultiplier = state.controlBuffMultiplier;
  let newIntensityBuffMultiplier = state.intensityBuffMultiplier;

  if (skill.buffType === BuffType.CONTROL) {
    newControlBuffTurns = skill.buffDuration;
    if (skill.buffMultiplier && skill.buffMultiplier !== 1.0) {
      newControlBuffMultiplier = skill.buffMultiplier;
    } else if (config.defaultBuffMultiplier) {
      newControlBuffMultiplier = config.defaultBuffMultiplier;
    }
  } else if (skill.buffType === BuffType.INTENSITY) {
    newIntensityBuffTurns = skill.buffDuration;
    if (skill.buffMultiplier && skill.buffMultiplier !== 1.0) {
      newIntensityBuffMultiplier = skill.buffMultiplier;
    } else if (config.defaultBuffMultiplier) {
      newIntensityBuffMultiplier = config.defaultBuffMultiplier;
    }
  }

  // Update cooldowns
  const newCooldowns = new Map<string, number>();
  if (consumesTurn) {
    state.cooldowns.forEach((turns, key) => {
      if (turns > 1) {
        newCooldowns.set(key, turns - 1);
      }
    });
    if (!isItemAction && skill.cooldown && skill.cooldown > 0) {
      newCooldowns.set(skill.key, skill.cooldown);
    }
  } else {
    state.cooldowns.forEach((turns, key) => {
      if (turns > 0) {
        newCooldowns.set(key, turns);
      }
    });
  }

  // Update stack-based buffs
  const newBuffs = new Map(resolvedActiveBuffs);
  const newItems = new Map(state.items);

  if (isItemAction) {
    const itemKey = normalizeBuffName(skill.itemName || skill.key);
    const currentCount = newItems.get(itemKey) ?? 0;
    if (currentCount <= 1) {
      newItems.delete(itemKey);
    } else {
      newItems.set(itemKey, currentCount - 1);
    }
  }

  // Consume buff costs
  if (skill.buffCost) {
    const buff = resolvedActiveBuffs.get(skill.buffCost.buffName);
    if (buff) {
      const have = buff.stacks;
      const consume = skill.buffCost.consumeAll
        ? have
        : Math.min(have, skill.buffCost.amount ?? 0);
      const remaining = Math.max(0, have - consume);
      if (remaining > 0) {
        newBuffs.set(skill.buffCost.buffName, { ...buff, stacks: remaining });
      } else {
        newBuffs.delete(skill.buffCost.buffName);
      }
    }
  }

  // Process per-turn buff effects (game's doExecuteBuff runs after technique)
  let buffCompletion = 0;
  let buffPerfection = 0;
  /**
   * Ordered buff bar contributions, appended after the technique's own effects.
   *
   * The runtime executes buffs after the technique resolves, and each of their
   * completion/perfection applications goes through the same appliers, so it
   * fires the Eccentric Decree `onBarChange` hook too.
   */
  const recordBarChanges = needsBarContributions(config);
  const buffBarContributions: BarContribution[] = [];
  let buffStabilityDelta = 0;
  let buffPoolDelta = 0;
  let buffToxicityDelta = 0;
  let buffMaxStabilityDelta = 0;
  qiCap = getEffectiveMaxPool(
    state.copy({
      qi: newQi,
      stability: newStability,
      stabilityPenalty: newStabilityPenalty,
      toxicity: newToxicity,
      buffs: newBuffs,
    }),
    config,
    newBuffs,
  );

  const upsertBuffFromDefinition = (
    definition: BuffDefinition | undefined,
    stacksDelta: number,
  ): void => {
    if (!definition || !Number.isFinite(stacksDelta)) return;
    const delta = Math.floor(stacksDelta);
    if (delta === 0) return;

    const buffKey = normalizeBuffName(definition.name);
    if (!buffKey) return;

    const existing = newBuffs.get(buffKey);
    const canStack =
      definition.canStack ?? existing?.definition?.canStack ?? true;
    const maxStacks = definition.maxStacks ?? existing?.definition?.maxStacks;

    if (existing) {
      if (!canStack) {
        return;
      }
      let nextStacks = existing.stacks + delta;
      if (maxStacks !== undefined) {
        nextStacks = Math.min(nextStacks, maxStacks);
      }
      if (nextStacks > 0) {
        newBuffs.set(buffKey, {
          ...existing,
          definition: existing.definition ?? definition,
          stacks: Math.floor(nextStacks),
        });
      } else {
        newBuffs.delete(buffKey);
      }
      return;
    }

    if (delta > 0) {
      let nextStacks = delta;
      if (maxStacks !== undefined) {
        nextStacks = Math.min(nextStacks, maxStacks);
      }
      newBuffs.set(buffKey, {
        name: buffKey,
        stacks: Math.floor(nextStacks),
        definition,
      });
    }
  };

  const adjustExistingBuffStacks = (
    buffKey: string,
    stacksDelta: number,
  ): void => {
    const existing = newBuffs.get(buffKey);
    if (!existing || !Number.isFinite(stacksDelta)) return;

    const delta = Math.floor(stacksDelta);
    if (delta === 0) return;

    let nextStacks = existing.stacks + delta;
    const maxStacks = existing.definition?.maxStacks;
    if (maxStacks !== undefined) {
      nextStacks = Math.min(nextStacks, maxStacks);
    }
    if (nextStacks > 0) {
      newBuffs.set(buffKey, { ...existing, stacks: Math.floor(nextStacks) });
    } else {
      newBuffs.delete(buffKey);
    }
  };

  const harmonyMods = getHarmonyStatModifiers(
    state.harmonyData,
    config.craftingType,
  );
  let preMasteryActionVars = buildPreMasteryActionVariables(
    state,
    config,
    conditionEffects,
    harmonyMods,
  );
  let resolvedActionMastery = resolveMasteryBonuses(
    state,
    skill,
    preMasteryActionVars,
  );
  if (hasMasteryUpgrades(resolvedActionMastery.upgrades)) {
    preMasteryActionVars = buildPreMasteryActionVariables(
      state,
      config,
      conditionEffects,
      harmonyMods,
      resolvedActionMastery.upgrades,
    );
    resolvedActionMastery = resolveMasteryBonuses(
      state,
      skill,
      preMasteryActionVars,
    );
  }

  const mastery = resolvedActionMastery.bonuses;
  const actionMasteryUpgrades = resolvedActionMastery.upgrades;
  const actionVars = {
    ...preMasteryActionVars,
  };
  actionVars.control *= 1 + (mastery.controlBonus || 0);
  actionVars.intensity *= 1 + (mastery.intensityBonus || 0);
  actionVars.critchance += mastery.critChanceBonus || 0;
  actionVars.critmultiplier += mastery.critMultiplierBonus || 0;
  actionVars.successChanceBonus += mastery.successChanceBonus || 0;

  const actionSuccessChance = isItemAction
    ? 1
    : Math.max(
        0,
        Math.min(1, (skill.successChance ?? 1) + actionVars.successChanceBonus),
      );

  let techniquePoolDelta = 0;
  let techniqueMaxStabilityDelta = 0;
  if (skill.effects && skill.effects.length > 0) {
    for (const effect of skill.effects) {
      if (!effect) continue;
      const conditionResult = evaluateEffectCondition(
        effect.condition,
        state,
        actionVars,
        0,
      );
      if (!conditionResult.met || conditionResult.probability <= 0) continue;
      const factor = actionSuccessChance * conditionResult.probability;
      if (factor <= 0) continue;

      switch (effect.kind) {
        case 'pool':
          techniquePoolDelta +=
            evaluateScalingWithMasteryUpgrades(
              effect.amount,
              actionMasteryUpgrades,
              actionVars,
              0,
            ) * factor;
          break;
        case 'maxStability':
          techniqueMaxStabilityDelta +=
            evaluateScalingWithMasteryUpgrades(
              effect.amount,
              actionMasteryUpgrades,
              actionVars,
              0,
            ) * factor;
          break;
        case 'createBuff': {
          const stacksToAdd =
            evaluateScalingWithMasteryUpgrades(
              effect.stacks,
              actionMasteryUpgrades,
              actionVars,
              1,
            ) * factor;
          upsertBuffFromDefinition(effect.buff, stacksToAdd);
          break;
        }
        case 'consumeBuff': {
          const buffKey = normalizeBuffName(effect.buff?.name);
          if (!buffKey) break;
          const stacksToConsume =
            evaluateScalingWithMasteryUpgrades(
              effect.stacks,
              actionMasteryUpgrades,
              actionVars,
              1,
            ) * factor;
          if (stacksToConsume > 0) {
            adjustExistingBuffStacks(buffKey, -Math.floor(stacksToConsume));
          }
          break;
        }
      }
    }
  }

  const executeBuffEffect = (
    effect: BuffEffect,
    ownerBuffKey: string,
    ownerBuff: { name: string; stacks: number; definition?: BuffDefinition },
    scalingVars: ScalingVariables,
  ): void => {
    const conditionResult = evaluateEffectCondition(
      effect.condition,
      state,
      scalingVars,
      ownerBuff.stacks,
    );
    if (!conditionResult.met || conditionResult.probability <= 0) {
      return;
    }
    const conditionFactor = conditionResult.probability;
    const amount =
      evaluateScalingWithMasteryUpgrades(
        effect.amount,
        actionMasteryUpgrades,
        scalingVars,
        0,
      ) * conditionFactor;
    switch (effect.kind) {
      case 'completion':
        buffCompletion += amount;
        if (recordBarChanges && amount !== 0) {
          buffBarContributions.push({ bar: 'completion', amount });
        }
        break;
      case 'perfection':
        buffPerfection += amount;
        if (recordBarChanges && amount !== 0) {
          buffBarContributions.push({ bar: 'perfection', amount });
        }
        break;
      case 'stability':
        buffStabilityDelta += amount;
        break;
      case 'pool':
        buffPoolDelta += amount;
        break;
      case 'maxStability':
        buffMaxStabilityDelta += amount;
        break;
      case 'changeToxicity':
        // Runtime `changeToxicity` does `stats.toxicity -= amount`: a positive
        // amount cleanses toxicity, a negative amount inflicts it.
        buffToxicityDelta -= amount;
        break;
      case 'negate':
        newBuffs.delete(ownerBuffKey);
        break;
      case 'createBuff': {
        const stacksToAdd =
          evaluateScalingWithMasteryUpgrades(
            effect.stacks,
            actionMasteryUpgrades,
            scalingVars,
            1,
          ) * conditionFactor;
        upsertBuffFromDefinition(effect.buff, stacksToAdd);
        break;
      }
      case 'addStack': {
        const stackChange =
          evaluateScalingWithMasteryUpgrades(
            effect.stacks,
            actionMasteryUpgrades,
            scalingVars,
            1,
          ) * conditionFactor;
        if (stackChange !== 0) {
          adjustExistingBuffStacks(ownerBuffKey, stackChange);
        }
        break;
      }
    }
  };

  if (consumesTurn) {
    for (const [buffKey, buff] of Array.from(newBuffs.entries())) {
      if (!buff.definition) continue;
      const scalingVars: ScalingVariables = {
        ...actionVars,
        pool: newQi,
        maxpool: qiCap,
        toxicity: newToxicity,
        maxtoxicity: config.maxToxicity || 0,
        poolCostFlat: state.poolCostFlat,
        poolCostPercentage: state.poolCostPercentage,
        stabilityCostPercentage: state.stabilityCostPercentage,
        stacks: buff.stacks,
      };
      // Execute per-turn effects
      if (buff.definition.effects) {
        for (const effect of buff.definition.effects) {
          executeBuffEffect(effect, buffKey, buff, scalingVars);
        }
      }
      // Execute action-type-specific effects
      const actionEffects: BuffEffect[] | undefined =
        skill.type === 'fusion'
          ? buff.definition.onFusion
          : skill.type === 'refine'
            ? buff.definition.onRefine
            : skill.type === 'stabilize'
              ? buff.definition.onStabilize
              : skill.type === 'support'
                ? buff.definition.onSupport
                : undefined;
      if (actionEffects) {
        for (const effect of actionEffects) {
          executeBuffEffect(effect, buffKey, buff, scalingVars);
        }
      }
    }

    // Runtime reducer bumps the step counter after every buff has executed and
    // only then grants the Turbid Qi stack, so the fresh stack surcharges the
    // *next* actions rather than this one.
    if (grantsTurbidQiStack(nextStep)) {
      const turbidQiKey = findTurbidQiBuffKey(newBuffs);
      if (turbidQiKey) {
        adjustExistingBuffStacks(turbidQiKey, 1);
      }
    }
  }

  // Calculate new completion/perfection (including buff per-turn contributions)
  let newCompletion = safeAdd(
    state.completion,
    gains.completion + buffCompletion,
  );
  let newPerfection = safeAdd(
    state.perfection,
    gains.perfection + buffPerfection,
  );
  newQi = clampQi(newQi + techniquePoolDelta);

  // Clamp to optional hard craft caps when available.
  if (
    config.maxCompletion !== undefined &&
    Number.isFinite(config.maxCompletion)
  ) {
    newCompletion = Math.min(newCompletion, config.maxCompletion);
  }
  if (
    config.maxPerfection !== undefined &&
    Number.isFinite(config.maxPerfection)
  ) {
    newPerfection = Math.min(newPerfection, config.maxPerfection);
  }

  // Update completion bonus (game mechanic: +10% control per guaranteed bonus tier)
  let newCompletionBonus = state.completionBonus;
  if (consumesTurn && targetCompletion > 0) {
    const bonusInfo = getBonusAndChance(newCompletion, targetCompletion);
    // Completion bonus stacks are guaranteed - 1 (first threshold doesn't count)
    newCompletionBonus = Math.max(0, bonusInfo.guaranteed - 1);
  }

  if (techniqueMaxStabilityDelta !== 0) {
    newStabilityPenalty = Math.min(
      state.initialMaxStability,
      Math.max(0, newStabilityPenalty - techniqueMaxStabilityDelta),
    );
    const newMax = state.initialMaxStability - newStabilityPenalty;
    if (newStability > newMax) newStability = newMax;
  }

  // Apply buff per-turn state changes
  newStability = clampStabilityToBounds(
    newStability + buffStabilityDelta,
    state.initialMaxStability - newStabilityPenalty,
  );
  newQi = clampQi(newQi + buffPoolDelta);
  newToxicity = Math.max(0, newToxicity + buffToxicityDelta);
  if (buffMaxStabilityDelta !== 0) {
    newStabilityPenalty = Math.min(
      state.initialMaxStability,
      Math.max(0, newStabilityPenalty - buffMaxStabilityDelta),
    );
    const newMax = state.initialMaxStability - newStabilityPenalty;
    if (newStability > newMax) newStability = newMax;
  }

  // Process harmony effects for sublime crafts (runs in processTurn after technique)
  let newHarmony = state.harmony;
  let newHarmonyData = state.harmonyData;
  if (
    consumesTurn &&
    !isItemAction &&
    config.isSublimeCraft &&
    config.craftingType &&
    state.harmonyData
  ) {
    // 0.7.6 scores Eccentric Decree from inside every completion/perfection
    // application, so replay this turn's applications in the runtime's order:
    // the technique's own effects first, then the per-turn buff effects the
    // reducer executes afterwards. Every other harmony ignores the list.
    let barChanges: readonly BarChangeEvent[] = [];
    if (recordBarChanges) {
      const techniqueBarContributions =
        gains.barContributions && gains.barContributions.length > 0
          ? scaleBarContributions(
              gains.barContributions,
              gains.completion,
              gains.perfection,
            )
          : synthesizeBarContributions(gains.completion, gains.perfection);
      barChanges = buildBarChangeEvents(state.completion, state.perfection, [
        ...techniqueBarContributions,
        ...buffBarContributions,
      ]);
    }
    const harmonyResult = processHarmonyEffect(
      state.harmonyData,
      config.craftingType,
      skill.type,
      {
        completion: newCompletion,
        perfection: newPerfection,
        maxCompletion: config.maxCompletion ?? newCompletion,
        maxPerfection: config.maxPerfection ?? newPerfection,
        targetCompletion: config.targetCompletion ?? 0,
        targetPerfection: config.targetPerfection ?? 0,
        barChanges,
      },
    );
    newHarmonyData = harmonyResult.harmonyData;
    newHarmony = Math.max(
      -100,
      Math.min(
        100,
        harmonyResult.harmonyOverride ??
          state.harmony + harmonyResult.harmonyDelta,
      ),
    );

    // Apply direct state changes from harmony (e.g., Inscription penalty, Resonance stability loss)
    if (harmonyResult.stabilityDelta !== 0) {
      newStability = clampStabilityToBounds(
        newStability + harmonyResult.stabilityDelta,
        state.initialMaxStability - newStabilityPenalty,
      );
    }
    if (harmonyResult.poolDelta !== 0) {
      newQi = clampQi(newQi + harmonyResult.poolDelta);
    }
    if (harmonyResult.stabilityPenaltyDelta !== 0) {
      newStabilityPenalty += harmonyResult.stabilityPenaltyDelta;
      newStabilityPenalty = Math.min(
        newStabilityPenalty,
        state.initialMaxStability,
      );
      // Reclamp stability after penalty increase
      const newMax = state.initialMaxStability - newStabilityPenalty;
      if (newStability > newMax) newStability = newMax;
    }
  }

  // Create new state with all updates
  const nextConsumedPillsThisTurn = consumesTurn
    ? 0
    : state.consumedPillsThisTurn + (isItemAction ? 1 : 0);
  const propagatedMaxPool = getEffectiveMaxPool(
    state.copy({
      qi: newQi,
      stability: newStability,
      stabilityPenalty: newStabilityPenalty,
      completion: newCompletion,
      perfection: newPerfection,
      toxicity: newToxicity,
      buffs: newBuffs,
      harmonyData: newHarmonyData,
      completionBonus: newCompletionBonus,
    }),
    config,
    newBuffs,
  );
  const propagatedNativeVariables = propagateNativeVariablesAfterAction(
    state,
    {
      qi: newQi,
      maxPool: propagatedMaxPool,
      completion: newCompletion,
      perfection: newPerfection,
      stability: newStability,
      maxStability: state.initialMaxStability - newStabilityPenalty,
      stabilityPenalty: newStabilityPenalty,
      toxicity: newToxicity,
      consumedPillsThisTurn: nextConsumedPillsThisTurn,
      step: nextStep,
    },
    newBuffs,
    newHarmonyData,
    maxToxicity,
    config.pillsPerRound || 1,
  );

  return state.copy({
    qi: newQi,
    stability: newStability,
    stabilityPenalty: newStabilityPenalty,
    completion: newCompletion,
    perfection: newPerfection,
    controlBuffTurns: newControlBuffTurns,
    intensityBuffTurns: newIntensityBuffTurns,
    controlBuffMultiplier: newControlBuffMultiplier,
    intensityBuffMultiplier: newIntensityBuffMultiplier,
    toxicity: newToxicity,
    cooldowns: newCooldowns,
    items: newItems,
    consumedPillsThisTurn: nextConsumedPillsThisTurn,
    buffs: newBuffs,
    harmony: newHarmony,
    harmonyData: newHarmonyData,
    step: nextStep,
    completionBonus: newCompletionBonus,
    nativeVariables: propagatedNativeVariables,
    history: [...state.history, skill.name],
  });
}

/**
 * Get all skills that can be applied in the current state.
 * Now considers cooldowns, toxicity limits, and condition requirements.
 */
export function getAvailableSkills(
  state: CraftingState,
  config: OptimizerConfig,
  currentCondition?: CraftingCondition | string,
): SkillDefinition[] {
  const maxToxicity = config.maxToxicity || 0;
  const normalizedCondition =
    typeof currentCondition === 'string'
      ? normalizeCondition(currentCondition)
      : currentCondition;
  const conditionEffects = getConditionEffectsForConfig(
    config,
    normalizedCondition,
  );
  return config.skills.filter((skill) =>
    canApplySkill(
      state,
      skill,
      config.minStability,
      maxToxicity,
      normalizedCondition,
      conditionEffects,
      config.pillsPerRound || 1,
      config,
    ),
  );
}

/**
 * Check if the state is terminal (no valid actions possible).
 */
export function isTerminalState(
  state: CraftingState,
  config: OptimizerConfig,
  currentCondition?: CraftingCondition | string,
): boolean {
  return getAvailableSkills(state, config, currentCondition).length === 0;
}

/**
 * Get condition effects for the current condition and recipe type.
 * Prefers real game data (conditionEffectsData) over the hardcoded fallback table.
 */
export function getConditionEffectsForConfig(
  config: OptimizerConfig,
  condition: CraftingCondition | string | undefined,
): ConditionEffect[] {
  if (!condition) {
    return [];
  }
  const normalizedCondition = normalizeCondition(condition as string);
  if (!normalizedCondition) {
    return [];
  }
  // Prefer real game data when available
  if (config.conditionEffectsData) {
    return config.conditionEffectsData[normalizedCondition] || [];
  }
  // Fall back to hardcoded table
  if (!config.conditionEffectType) {
    return [];
  }
  return getConditionEffects(config.conditionEffectType, normalizedCondition);
}

/**
 * Diagnostic info for why a skill is blocked.
 */
export interface SkillBlockedReason {
  skillName: string;
  reason: 'cooldown' | 'qi' | 'stability' | 'toxicity' | 'condition';
  details: string;
}

/**
 * Get diagnostic information about why each skill is blocked.
 * Returns an array of reasons for all skills that cannot be used.
 */
export function getBlockedSkillReasons(
  state: CraftingState,
  config: OptimizerConfig,
  currentCondition?: string,
): SkillBlockedReason[] {
  const reasons: SkillBlockedReason[] = [];
  const maxToxicity = config.maxToxicity || 0;
  const normalizedCondition = currentCondition
    ? normalizeCondition(currentCondition)
    : undefined;
  const conditionEffects = getConditionEffectsForConfig(
    config,
    normalizedCondition,
  );

  for (const skill of config.skills) {
    const isItemAction = skill.actionKind === 'item';

    if (state.stability <= 0) {
      reasons.push({
        skillName: skill.name,
        reason: 'stability',
        details: 'Requires stability above 0',
      });
      continue;
    }

    // Check cooldown
    if (!isItemAction && state.isOnCooldown(skill.key)) {
      const turnsLeft = state.cooldowns.get(skill.key) || 0;
      reasons.push({
        skillName: skill.name,
        reason: 'cooldown',
        details: `On cooldown (${turnsLeft} turn${turnsLeft > 1 ? 's' : ''} left)`,
      });
      continue;
    }

    // Check condition requirement
    if (!isItemAction && skill.conditionRequirement && currentCondition) {
      const conditionMet = checkConditionRequirement(
        skill.conditionRequirement,
        currentCondition,
      );
      if (!conditionMet) {
        reasons.push({
          skillName: skill.name,
          reason: 'condition',
          details: `Requires ${skill.conditionRequirement} condition (current: ${currentCondition})`,
        });
        continue;
      }
    }

    if (isItemAction) {
      const itemKey = normalizeBuffName(skill.itemName || skill.key);
      const available = state.items.get(itemKey) ?? 0;
      if (available <= 0) {
        reasons.push({
          skillName: skill.name,
          reason: 'qi',
          details: 'No remaining item uses',
        });
        continue;
      }

      const perTurnLimit = Math.max(1, Math.floor(config.pillsPerRound || 1));
      if (state.consumedPillsThisTurn >= perTurnLimit) {
        reasons.push({
          skillName: skill.name,
          reason: 'condition',
          details: `Item usage limit reached (${state.consumedPillsThisTurn}/${perTurnLimit})`,
        });
        continue;
      }

      if (skill.reagentOnlyAtStepZero && state.step !== 0) {
        reasons.push({
          skillName: skill.name,
          reason: 'condition',
          details: 'Reagents can only be used on step 0',
        });
        continue;
      }
    }

    const effectiveCosts = calculateEffectiveActionCosts(
      state,
      skill,
      config.minStability,
      conditionEffects,
      config,
    );

    // Check qi requirement
    if (state.qi < effectiveCosts.qiCost) {
      reasons.push({
        skillName: skill.name,
        reason: 'qi',
        details: `Need ${effectiveCosts.qiCost} Qi (have ${state.qi})`,
      });
      continue;
    }

    // Check toxicity requirement
    if (maxToxicity > 0 && skill.toxicityCost) {
      if (state.toxicity + skill.toxicityCost > maxToxicity) {
        reasons.push({
          skillName: skill.name,
          reason: 'toxicity',
          details: `Would exceed max toxicity (${state.toxicity} + ${skill.toxicityCost} > ${maxToxicity})`,
        });
        continue;
      }
    }

    if (!isItemAction) {
      const nativeCanUse = runNativeCanUseActionPrecheck({
        state,
        skill,
        currentCondition,
        conditionEffects,
        maxToxicity,
        minStability: config.minStability,
        pillsPerRound: config.pillsPerRound || 1,
        effectiveQiCost: effectiveCosts.qiCost,
      });
      if (nativeCanUse === false) {
        reasons.push({
          skillName: skill.name,
          reason: 'condition',
          details: 'Blocked by game-native canUseAction precheck',
        });
        continue;
      }
    }
  }

  return reasons;
}
