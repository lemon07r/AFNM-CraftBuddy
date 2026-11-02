/**
 * CraftBuddy - Skill Definitions and Application
 *
 * Game-accurate skill application logic based on CraftingStuff source.
 * Handles technique effects, buff interactions, and expected value calculations.
 */

import { CraftingState, BuffType } from './state';
import { combineCostStat, costMultiplier, floorCost } from './costStats';
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
  evalExpression,
  CraftingBuffTrigger,
} from './gameTypes';
import {
  processHarmonyEffect,
  RETURNED_PRECISION,
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
import { StabilityProjection } from './stability';
import {
  applyGainBoost,
  prepareNumericApplication,
} from './numericApplications';

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
  /** Distinguishes real technique actions from quick-access items. */
  actionKind?: 'skill' | 'item';
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
  dropletCost?: number;
  noQiCost?: boolean;
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
 * data nobody reads.
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
  const completionScale =
    rawCompletion !== 0 ? actualCompletion / rawCompletion : 0;
  const perfectionScale =
    rawPerfection !== 0 ? actualPerfection / rawPerfection : 0;
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
  successChance?: number;
  /** Already-resolved payment, including mastery-phase overrides. */
  stabilityCost?: number;
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

/**
 * Seed a freshly created buff's internal state from the definition's
 * `initialState` eqns (0.7.7+). The runtime evaluates them against the
 * crafting variables at creation time; unknown symbols resolve to 0.
 */
function seedBuffInternalState(
  definition: BuffDefinition | undefined,
  variables: ScalingVariables | undefined,
): Record<string, number> | undefined {
  const initialState = definition?.initialState;
  if (!initialState) {
    return undefined;
  }
  const seeded: Record<string, number> = {};
  for (const [stateKey, eqn] of Object.entries(initialState)) {
    if (!stateKey || typeof eqn !== 'string') {
      continue;
    }
    // Unknown symbols resolve to 0 in the expression scope, so a missing
    // variable set simply zeroes every reference.
    const value = evalExpression(eqn, variables ?? ({} as ScalingVariables));
    seeded[stateKey] = Number.isFinite(value) ? value : 0;
  }
  return Object.keys(seeded).length > 0 ? seeded : undefined;
}

/**
 * 0.7.8 Illume Crucible seal: while any held buff carries
 * `sealedMaxStability`, max stability decays every action regardless of
 * `noMaxStabilityLoss` and no effect can restore it (runtime `E7o`/`D7o`).
 */
function hasSealedMaxStabilityBuff(
  buffs: ReadonlyMap<string, { definition?: BuffDefinition }>,
): boolean {
  return Array.from(buffs.values()).some(
    (buff) => buff.definition?.sealedMaxStability === true,
  );
}

/** Whether any held buff intercepts technique/mastery numeric applications. */
function hasEffectInterceptors(buffs: ActiveBuffMap): boolean {
  return Array.from(buffs.values()).some(
    (buff) => buff.definition?.craftingEffectInterceptors?.length,
  );
}

function hasStabilityPrevention(buffs: ActiveBuffMap): boolean {
  return Array.from(buffs.values()).some(
    (buff) => buff.definition?.stabilityLossPrevention,
  );
}

/** n7c: held order, no stack check. Never spend an integer use on an EV loss. */
function preventCertainStabilityLoss(
  buffs: ActiveBuffMap,
  amount: number,
  certain: boolean,
): boolean {
  if (!certain || amount >= 0) return false;
  for (const [key, owner] of Array.from(buffs.entries())) {
    const prevention = owner.definition?.stabilityLossPrevention;
    const used = Math.max(
      0,
      Math.floor(owner.internalState?.preventedStabilityLosses ?? 0),
    );
    if (!prevention || used >= prevention.uses) continue;
    buffs.set(key, {
      ...owner,
      internalState: {
        ...owner.internalState,
        preventedStabilityLosses: used + 1,
      },
    });
    return true;
  }
  return false;
}

function appliedStabilityAmount(
  amount: number,
  variables: ScalingVariables,
  buffs: ActiveBuffMap,
): number {
  return amount < 0 && hasStabilityPrevention(buffs)
    ? -floorCost(
        -amount *
          costMultiplier(
            variables.stabilityCostReduction,
            variables.stabilityCostPenalty,
          ),
      )
    : amount;
}

/**
 * Whether any held buff carries 0.7.7+ triggered effects (the runtime `_6`
 * dispatcher). Gates per-application trigger bookkeeping so crafts without
 * trigger buffs allocate nothing extra.
 */
function hasTriggeredEffectBuffs(
  buffs: ReadonlyMap<string, { definition?: BuffDefinition }>,
): boolean {
  return Array.from(buffs.values()).some(
    (buff) => (buff.definition?.triggeredEffects?.length ?? 0) > 0,
  );
}

/**
 * 0.7.7+ Uncontrollable Flames (Flame of Discordance): the strongest
 * `discordantConditions` value across held buffs, 0 when none. The runtime
 * reads it off the entity's buffs when rolling the next condition.
 */
export function getBuffDiscordantConditions(
  buffs: ReadonlyMap<string, { definition?: BuffDefinition }>,
): number {
  let discordance = 0;
  for (const buff of Array.from(buffs.values())) {
    const value = buff.definition?.discordantConditions;
    if (
      typeof value === 'number' &&
      Number.isFinite(value) &&
      value > discordance
    ) {
      discordance = value;
    }
  }
  return discordance;
}

/**
 * Runtime `O7o`: how much of a bar a single gain application moved through,
 * measured in the 1.3x-inflated threshold tiers
 * (`(tier(after) - tier(before)) * 100`). True Bifang Flame stores
 * `floor(percentGained)` blaze per `completionGained` trigger.
 */
function computeTriggerPercentGained(
  gain: number,
  barAfter: number,
  barMax: number,
): number {
  if (gain <= 0 || barMax <= 0) {
    return 0;
  }
  const before = getBonusAndChance(Math.max(0, barAfter - gain), barMax);
  const after = getBonusAndChance(Math.max(0, barAfter), barMax);
  return (
    (after.guaranteed +
      after.bonusChance -
      (before.guaranteed + before.bonusChance)) *
    100
  );
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
  {
    name: string;
    stacks: number;
    definition?: BuffDefinition;
    internalState?: Record<string, number>;
  }
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

/**
 * Normalized key of the runtime's `Completion Bonus` buff. Its stats are
 * folded from `state.completionBonus` instead of the generic buff-stat path.
 */
const COMPLETION_BONUS_BUFF_KEY = 'completion_bonus';

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
    itemEffectiveness: state.itemEffectiveness,
    pool: state.qi,
    qiDroplets: state.qiDroplets,
    maxqiDroplets: state.maxQiDroplets,
    qiCostReduction: state.qiCostReduction,
    qiCostPenalty: state.qiCostPenalty,
    stabilityCostReduction: state.stabilityCostReduction,
    stabilityCostPenalty: state.stabilityCostPenalty,
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
  if (
    cached &&
    cached.config === config &&
    cached.activeBuffs === activeBuffs
  ) {
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
    qiDroplets: state.qiDroplets,
    maxqiDroplets: state.maxQiDroplets,
    qiCostReduction: state.qiCostReduction,
    qiCostPenalty: state.qiCostPenalty,
    stabilityCostReduction: state.stabilityCostReduction,
    stabilityCostPenalty: state.stabilityCostPenalty,
    maxpool: config.maxQi,
    toxicity: state.toxicity,
    maxtoxicity: state.maxToxicity,
    resistance: 0,
    itemEffectiveness: state.itemEffectiveness,
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
    // 0.7.10 crafting boost stats. `perfectionBoost` is derived from the
    // Completion Bonus stacks (+10 per stack) tracked on the state; the buff
    // itself is excluded from the generic stat fold below to avoid
    // double-counting (the runtime re-derives both from the same progress).
    completionBoost: 0,
    perfectionBoost: state.completionBonus * 10,
    stabilityBoost: 0,
    qiBoost: 0,
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
    if (tracked.stacks <= 0) return; // Runtime K1i omits nonpositive counts.
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
    // Completion Bonus, Inscription, and Captivating Cadence buffs are simulated
    // through state-level tracking and getHarmonyStatModifiers; folding their raw
    // buff stats here would double-count their multipliers when attached to an
    // in-progress craft entity.
    const normalizedBuff = normalizeBuffName(
      definition.name || tracked.name || buffKey,
    );
    if (
      normalizedBuff === COMPLETION_BONUS_BUFF_KEY ||
      normalizedBuff === 'inscription' ||
      normalizedBuff === 'captivating_cadence' ||
      normalizedBuff === 'captivating_cadence_chain'
    ) {
      return;
    }
    // Literal stats never read a buff-local scope. Build that relatively large
    // frame lazily, and only once, if a stat actually has scaling/expression data.
    let evalVars: ScalingVariables | undefined;
    for (const [statKey, scaling] of getBuffStatEntries(definition.stats)) {
      if (!scaling) continue;
      if (!isLiteralScaling(scaling) && !evalVars) {
        evalVars = {
          ...vars,
          ...definition.additionalVariables,
          ...tracked.internalState,
          stacks: tracked.stacks,
        };
        if (tracked.stacks > 0) {
          if (normalizedBuff) evalVars[normalizedBuff] = tracked.stacks;
          evalVars[buffKey] = tracked.stacks;
        }
        // 0.7.7+ buffs scale off trigger-written internal state (e.g. True Bifang
        // Flame's `scaling: 'blaze'`); the keys share the eqn namespace.
        if (tracked.internalState) {
          for (const [stateKey, stateValue] of Object.entries(
            tracked.internalState,
          )) {
            if (typeof stateValue === 'number' && Number.isFinite(stateValue)) {
              evalVars[stateKey] = stateValue;
            }
          }
        }
        evalVars.stacks = tracked.stacks;
      }
      const raw = evaluateScalingWithMasteryUpgrades(
        scaling,
        masteryUpgrades,
        evalVars ?? vars,
        0,
      );
      switch (statKey) {
        case 'qiCostReduction':
        case 'qiCostPenalty':
        case 'stabilityCostReduction':
        case 'stabilityCostPenalty':
          adjustedVars[statKey] = combineCostStat(
            statKey.endsWith('Reduction'),
            adjustedVars[statKey] ?? 0,
            raw,
          );
          break;
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

const buffStatEntries = new WeakMap<
  NonNullable<BuffDefinition['stats']>,
  Array<[string, Scaling | undefined]>
>();
function getBuffStatEntries(
  stats: NonNullable<BuffDefinition['stats']>,
): Array<[string, Scaling | undefined]> {
  let entries = buffStatEntries.get(stats);
  if (!entries) {
    entries = Object.entries(stats);
    buffStatEntries.set(stats, entries);
  }
  return entries;
}

function buffsCanChangeMaxPool(activeBuffs: ActiveBuffMap): boolean {
  if (activeBuffs.has('maxpool')) return true;
  let changes = false;
  activeBuffs.forEach((buff) => {
    if (buff.definition?.stats?.maxpool !== undefined) changes = true;
  });
  return changes;
}

const buffedTechniqueVariablesCache = new WeakMap<
  CraftingState,
  {
    config: OptimizerConfig;
    buffs: ActiveBuffMap;
    upgrades: MasteryUpgradeMap;
    variables: ScalingVariables;
  }
>();

function getBuffedTechniqueVariables(
  state: CraftingState,
  config: OptimizerConfig,
  activeBuffs: ActiveBuffMap,
  upgrades: MasteryUpgradeMap = EMPTY_MASTERY_UPGRADES,
): ScalingVariables {
  const key = hasMasteryUpgrades(upgrades) ? upgrades : EMPTY_MASTERY_UPGRADES;
  const cached = buffedTechniqueVariablesCache.get(state);
  if (
    cached?.config === config &&
    cached.buffs === activeBuffs &&
    cached.upgrades === key
  ) {
    return cached.variables;
  }
  const base = buildTechniqueScalingVariables(
    state,
    config,
    config.baseControl,
    config.baseIntensity,
    state.critChance,
    state.critMultiplier,
    activeBuffs,
  );
  const variables = applyBuffStatContributions(state, base, key, activeBuffs);
  // Callers only read this state-derived frame; action/condition scopes copy it.
  buffedTechniqueVariablesCache.set(state, {
    config,
    buffs: activeBuffs,
    upgrades: key,
    variables,
  });
  return variables;
}

function getEffectiveMaxPool(
  state: CraftingState,
  config: OptimizerConfig,
  activeBuffs: ActiveBuffMap = getResolvedActiveBuffs(state, config),
): number {
  if (!buffsCanChangeMaxPool(activeBuffs)) return Math.max(1, config.maxQi);
  const buffedVars = getBuffedTechniqueVariables(state, config, activeBuffs);

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
  const channels = { ...vars };
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
      const key = effect.multiplier < 1 ? 'qiCostReduction' : 'qiCostPenalty';
      channels[key] = combineCostStat(
        effect.multiplier < 1,
        channels[key],
        Math.abs(1 - effect.multiplier) * 100,
      );
    } else if (effect.kind === 'stability' && effect.multiplier !== undefined) {
      stabilityCostPercentage = Math.floor(
        stabilityCostPercentage * effect.multiplier,
      );
      const key =
        effect.multiplier < 1
          ? 'stabilityCostReduction'
          : 'stabilityCostPenalty';
      channels[key] = combineCostStat(
        effect.multiplier < 1,
        channels[key],
        Math.abs(1 - effect.multiplier) * 100,
      );
    }
  }

  channels.control = control;
  channels.intensity = intensity;
  channels.successChanceBonus = successChanceBonus;
  channels.poolCostPercentage = poolCostPercentage;
  channels.stabilityCostPercentage = stabilityCostPercentage;
  return channels;
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
        buffKey === 'self'
          ? selfStacks
          : Math.max(0, state.getBuffStacks(buffKey));
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

type LiveProgress = {
  completion: number;
  perfection: number;
  stability: number;
};

/** Runtime ZS reads these three percentage conditions from live progress,
 * not the variables snapshot used by pool conditions and expressions (§19). */
function evaluateLiveProgressCondition(
  condition: CraftingTechniqueCondition | undefined,
  state: CraftingState,
  variables: ScalingVariables,
  selfStacks: number,
  progress: LiveProgress,
): ConditionEvaluation {
  const kind = condition?.kind;
  if (
    condition &&
    (kind === 'stability' || kind === 'completion' || kind === 'perfection')
  ) {
    const denominator =
      kind === 'stability'
        ? state.initialMaxStability
        : variables[kind === 'completion' ? 'maxcompletion' : 'maxperfection'];
    const percentage = (progress[kind] / Math.max(1, denominator || 1)) * 100;
    const met =
      condition.mode === 'more'
        ? percentage >= condition.percentage
        : percentage < condition.percentage;
    return { met, probability: met ? 1 : 0 };
  }
  return evaluateEffectCondition(condition, state, variables, selfStacks);
}

/** Follow the successful technique branch before success weighting. Keep
 * scaling/expression variables frozen, and do not apply turn-cleanup caps. */
function advanceTechniqueProgress(
  progress: LiveProgress,
  effect: TechniqueEffect,
  variables: ScalingVariables,
  upgrades: MasteryUpgradeMap,
  probability: number,
  critFactor: number,
): void {
  const kind = effect.kind;
  if (kind !== 'stability' && kind !== 'completion' && kind !== 'perfection')
    return;
  let amount = evaluateScalingWithMasteryUpgrades(
    effect.amount,
    upgrades,
    variables,
    0,
  );
  if (kind !== 'stability' && amount < 0 && (effect.amount?.value ?? 0) > 0)
    amount = 0;
  if (kind !== 'stability' && amount > 0) amount *= critFactor;
  const boost =
    kind === 'stability'
      ? variables.stabilityBoost
      : kind === 'completion'
        ? variables.completionBoost
        : variables.perfectionBoost;
  progress[kind] += applyGainBoost(amount, boost) * probability;
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
  const withBuffs = getBuffedTechniqueVariables(
    state,
    config,
    activeBuffs,
    masteryUpgrades,
  );
  const withConditions = applyConditionEffectsToVariables(
    withBuffs,
    conditionEffects,
  );

  // applyConditionEffectsToVariables owns this copy; do not clone the same
  // frame again for the harmony overlay. The cached buffed frame stays untouched.
  withConditions.control *= harmonyMods.controlMultiplier;
  withConditions.intensity *= harmonyMods.intensityMultiplier;
  withConditions.critchance += harmonyMods.critChanceBonus;
  withConditions.successChanceBonus += harmonyMods.successChanceBonus;
  withConditions.poolCostPercentage = Math.floor(
    (withConditions.poolCostPercentage / 100) *
      (harmonyMods.poolCostPercentage / 100) *
      100,
  );
  withConditions.stabilityCostPercentage = Math.floor(
    (withConditions.stabilityCostPercentage / 100) *
      (harmonyMods.stabilityCostPercentage / 100) *
      100,
  );
  return withConditions;
}

export interface EffectiveActionCosts {
  qiCost: number;
  stabilityCost: number;
  requiredPostStability: number;
  stabilityOutcomes?: Array<{ cost: number; probability: number }>;
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
  let qiReduction = state.qiCostReduction;
  let qiPenalty = state.qiCostPenalty;
  let stabilityReduction = state.stabilityCostReduction;
  let stabilityPenalty = state.stabilityCostPenalty;
  let legacyQiMultiplier = 1;
  let legacyStabilityMultiplier = 1;
  let harmonyPoolMultiplier = 1;
  let harmonyStabilityMultiplier = 1;

  // Only run the heavier runtime-derivation path when active buffs
  // can actually modify costs. This avoids unnecessary overhead in search.
  if (config) {
    const hasCostAffectingBuff = Array.from(activeBuffs.values()).some(
      (tracked) =>
        Boolean(
          tracked.definition?.stats?.poolCostFlat ||
          tracked.definition?.stats?.qiCostReduction ||
          tracked.definition?.stats?.qiCostPenalty ||
          tracked.definition?.stats?.stabilityCostReduction ||
          tracked.definition?.stats?.stabilityCostPenalty ||
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
      // Read only the buffed cost channels. The full action frame's condition
      // and harmony overlays would copy every variable just to neutralize both
      // cost multipliers again. Keep its legacy percentage rounding below.
      const runtimeVars = getBuffedTechniqueVariables(
        state,
        config,
        activeBuffs,
      );
      poolCostFlat = Math.max(0, Math.floor(runtimeVars.poolCostFlat ?? 0));
      qiReduction = runtimeVars.qiCostReduction;
      qiPenalty = runtimeVars.qiCostPenalty;
      stabilityReduction = runtimeVars.stabilityCostReduction;
      stabilityPenalty = runtimeVars.stabilityCostPenalty;
      // Compatibility percentages are not runtime cost channels. Their old
      // floor/ratio applies only on the side that actually has a legacy buff;
      // otherwise it would truncate a fractional modern baseline (84.5 -> 84).
      if (
        Array.from(activeBuffs.values()).some(
          (buff) => buff.definition?.stats?.poolCostPercentage !== undefined,
        )
      ) {
        legacyQiMultiplier =
          normalizeRuntimeCostPercentage(
            Math.floor(
              (normalizeRuntimeCostPercentage(runtimeVars.poolCostPercentage) /
                100) *
                100,
            ),
          ) / Math.max(1e-10, state.poolCostPercentage);
      }
      if (
        Array.from(activeBuffs.values()).some(
          (buff) =>
            buff.definition?.stats?.stabilityCostPercentage !== undefined,
        )
      ) {
        legacyStabilityMultiplier =
          normalizeRuntimeCostPercentage(
            Math.floor(
              (normalizeRuntimeCostPercentage(
                runtimeVars.stabilityCostPercentage,
              ) /
                100) *
                100,
            ),
          ) / Math.max(1e-10, state.stabilityCostPercentage);
      }
    }
  }
  // Condition effects multiply the cost *percentages* rather than the raw
  // costs, and are folded in before any rounding:
  //   e === 'poolCostPercentage' && effects.forEach(e => e.kind === 'pool' && (o *= e.multiplier))
  for (const effect of conditionEffects) {
    if (effect.multiplier === undefined) continue;
    if (effect.kind === 'pool') {
      if (effect.multiplier < 1)
        qiReduction = combineCostStat(
          true,
          qiReduction,
          (1 - effect.multiplier) * 100,
        );
      else
        qiPenalty = combineCostStat(
          false,
          qiPenalty,
          (effect.multiplier - 1) * 100,
        );
    } else if (effect.kind === 'stability') {
      if (effect.multiplier < 1)
        stabilityReduction = combineCostStat(
          true,
          stabilityReduction,
          (1 - effect.multiplier) * 100,
        );
      else
        stabilityPenalty = combineCostStat(
          false,
          stabilityPenalty,
          (effect.multiplier - 1) * 100,
        );
    }
  }

  const qiCost = skill.noQiCost
    ? 0
    : Math.floor(
        floorCost(
          (getEffectiveQiCost(skill) + poolCostFlat) *
            costMultiplier(qiReduction, qiPenalty) *
            legacyQiMultiplier,
        ) * harmonyPoolMultiplier,
      );
  const stabilityCost = Math.floor(
    floorCost(
      getEffectiveStabilityCost(skill) *
        costMultiplier(stabilityReduction, stabilityPenalty) *
        legacyStabilityMultiplier,
    ) * harmonyStabilityMultiplier,
  );

  // getPoolCost: `r = e; if (flat) r = max(0, r + flat); if (pct) r = floor(r * pct / 100)`
  // The flat surcharge is added *before* the percentage, and only one floor runs.

  // getStabilityCost: `n = -e; if (pct) n = ceil(n * pct / 100); return -n`
  // i.e. a single ceil applied to the negative stability delta.

  return {
    qiCost: Math.max(0, qiCost),
    stabilityCost,
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

  // 0.7.8 Illume Crucible seal, mirrored from `applySkill`.
  const maxStabilitySealed = hasSealedMaxStabilityBuff(state.buffs);

  if (
    consumesTurn &&
    (!skill.preventsMaxStabilityDecay || maxStabilitySealed)
  ) {
    stabilityPenaltyAfterSetup++;
  }
  stabilityPenaltyAfterSetup = Math.min(
    stabilityPenaltyAfterSetup,
    state.initialMaxStability,
  );

  let maxStabilityAfterSetup =
    state.initialMaxStability - stabilityPenaltyAfterSetup;
  if (skill.maxStabilityChange) {
    const effectiveMaxStabilityChange =
      maxStabilitySealed && skill.maxStabilityChange > 0
        ? 0
        : skill.maxStabilityChange;
    stabilityPenaltyAfterSetup = Math.min(
      state.initialMaxStability,
      Math.max(0, stabilityPenaltyAfterSetup - effectiveMaxStabilityChange),
    );
    maxStabilityAfterSetup =
      state.initialMaxStability - stabilityPenaltyAfterSetup;
  }
  if (skill.restoresMaxStabilityToFull && !maxStabilitySealed) {
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
    completion: safeFloor(
      applyGainBoost(
        safeMultiply(completionGain, critMultiplier),
        effectiveVars.completionBoost,
      ),
    ),
    perfection: safeFloor(
      applyGainBoost(
        safeMultiply(perfectionGain, critMultiplier),
        effectiveVars.perfectionBoost,
      ),
    ),
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
  if (
    !skill.isDisciplinedTouch &&
    skill.effects?.length &&
    ((skill.actionKind !== 'item' && hasEffectInterceptors(state.buffs)) ||
      hasStabilityPrevention(state.buffs))
  ) {
    const paymentCosts = calculateEffectiveActionCosts(
      state,
      skill,
      config.minStability,
      conditionEffects,
      config,
    );
    const phase: ActionPhaseContext = {
      preview: true,
      includeExpectedValue,
      paymentCosts:
        options.stabilityCost === undefined
          ? paymentCosts
          : {
              ...paymentCosts,
              stabilityCost: options.stabilityCost,
              stabilityOutcomes: undefined,
            },
      successChance: includeExpectedValue ? options.successChance : 1,
      existingBuffNames: state.buffs,
      barStart: state,
      barContributions: [],
    };
    applySkillTransition(
      state,
      { ...skill, consumesTurn: false },
      config,
      conditionEffects,
      config.targetCompletion ?? 0,
      undefined,
      config.targetPerfection ?? 0,
      phase,
    );
    return phase.previewGains!;
  }
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
  const totalSuccessChance =
    options.successChance ??
    Math.min(
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
    // 0.7.7+ triggered buff effects also consume per-application bar ordering
    // (True Bifang Flame takes the max single-application percentGained).
    const recordBars =
      needsBarContributions(config) || hasTriggeredEffectBuffs(state.buffs);
    const barContributions: BarContribution[] = [];
    const stabilityCost =
      options.stabilityCost ??
      (skill.effects.some((effect) => effect.condition?.kind === 'stability')
        ? calculateEffectiveActionCosts(
            state,
            skill,
            config.minStability,
            conditionEffects,
            config,
          ).stabilityCost
        : 0);
    const progress: LiveProgress = {
      completion: state.completion,
      perfection: state.perfection,
      stability: state.stability - stabilityCost,
    };

    for (const effect of skill.effects) {
      if (!effect) continue;
      const conditionResult = evaluateLiveProgressCondition(
        effect.condition,
        state,
        scalingVars,
        0,
        progress,
      );
      if (!conditionResult.met || conditionResult.probability <= 0) {
        continue;
      }
      const conditionFactor = conditionResult.probability;
      advanceTechniqueProgress(
        progress,
        effect,
        scalingVars,
        masteryUpgrades,
        conditionFactor,
        critFactor,
      );

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

    // 0.7.10: boost stats multiply positive gains after the crit multiplier,
    // matching the runtime apply* helpers.
    const completionWithCrit =
      completionGain > 0
        ? applyGainBoost(
            completionGain * critFactor,
            scalingVars.completionBoost,
          )
        : completionGain;
    const perfectionWithCrit =
      perfectionGain > 0
        ? applyGainBoost(
            perfectionGain * critFactor,
            scalingVars.perfectionBoost,
          )
        : perfectionGain;
    const stabilityGainBoosted =
      stabilityGain > 0
        ? applyGainBoost(stabilityGain, scalingVars.stabilityBoost)
        : stabilityGain;

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
      stability: safeFloor(safeMultiply(stabilityGainBoosted, expectedFactor)),
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
      completionGain > 0
        ? applyGainBoost(
            safeMultiply(completionGain, critFactor),
            scalingVars.completionBoost,
          )
        : safeMultiply(completionGain, critFactor),
      state.completion,
      config.maxCompletion,
      expectedFactor,
    ),
    perfection: expectedProgressGain(
      perfectionGain > 0
        ? applyGainBoost(
            safeMultiply(perfectionGain, critFactor),
            scalingVars.perfectionBoost,
          )
        : safeMultiply(perfectionGain, critFactor),
      state.perfection,
      config.maxPerfection,
      expectedFactor,
    ),
    stability: safeFloor(
      safeMultiply(
        stabilityGain > 0
          ? applyGainBoost(stabilityGain, scalingVars.stabilityBoost)
          : stabilityGain,
        expectedFactor,
      ),
    ),
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

  // 0.7.8 Illume Crucible seal: forced decay + no restoration (runtime
  // `E7o`/`D7o`), mirrored from `applySkill`.
  const maxStabilitySealed = hasSealedMaxStabilityBuff(state.buffs);

  let newStabilityPenalty = state.stabilityPenalty;
  newStabilityPenalty = Math.min(
    newStabilityPenalty,
    state.initialMaxStability,
  );

  if (skill.maxStabilityChange) {
    const effectiveMaxStabilityChange =
      maxStabilitySealed && skill.maxStabilityChange > 0
        ? 0
        : skill.maxStabilityChange;
    newStabilityPenalty = Math.min(
      state.initialMaxStability,
      Math.max(0, newStabilityPenalty - effectiveMaxStabilityChange),
    );
  }
  if (skill.restoresMaxStabilityToFull && !maxStabilitySealed) {
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

  // Payment is certain only when every payment branch loses stability. Share
  // the transition's integer-use prevention without mutating the input buffs.
  if (
    preventCertainStabilityLoss(
      newBuffs,
      -effectiveCosts.stabilityCost,
      effectiveCosts.stabilityOutcomes?.every((outcome) => outcome.cost > 0) ??
        true,
    )
  ) {
    newStability += effectiveCosts.stabilityCost;
  }

  const upsertBuffFromDefinition = (
    definition: BuffDefinition | undefined,
    stacksDelta: number,
    seedVariables?: ScalingVariables,
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
        internalState: seedBuffInternalState(definition, seedVariables),
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
      stability: baseStability,
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
        const nextStability = outcome.stability + event.stabilityDelta;
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
      if (Math.floor(Math.min(outcome.stability, outcome.maxStability)) > 0) {
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

    newStability += resolveGuaranteedContribution(
      guaranteedDirectStabilityGain,
      actionSuccessChance,
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
            upsertBuffFromDefinition(effect.buff, stacksToAdd, actionVars);
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
          upsertBuffFromDefinition(effect.buff, stacksToAdd, scalingVars);
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
      if (!resolvedActiveBuffs.has(buffKey)) continue;
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
      // 0.7.7+ buffs read trigger-written internal state from their eqns
      // (e.g. True Bifang Flame's per-action payout scaling on `blaze`).
      if (buff.internalState) {
        for (const [stateKey, stateValue] of Object.entries(
          buff.internalState,
        )) {
          if (typeof stateValue === 'number' && Number.isFinite(stateValue)) {
            scalingVars[stateKey] = stateValue;
          }
        }
      }

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
    const effectiveGuaranteedMaxStabilityDelta =
      maxStabilitySealed && guaranteedTechniqueMaxStabilityDelta > 0
        ? 0
        : guaranteedTechniqueMaxStabilityDelta;
    newStabilityPenalty = Math.min(
      state.initialMaxStability,
      Math.max(0, newStabilityPenalty - effectiveGuaranteedMaxStabilityDelta),
    );
    newMaxStability = state.initialMaxStability - newStabilityPenalty;
  }

  newStability += buffStabilityDelta;
  newQi = clampQi(newQi + buffPoolDelta);
  newToxicity = Math.max(0, newToxicity + buffToxicityDelta);
  if (buffMaxStabilityDelta !== 0) {
    const effectiveBuffMaxStabilityDelta =
      maxStabilitySealed && buffMaxStabilityDelta > 0
        ? 0
        : buffMaxStabilityDelta;
    newStabilityPenalty = Math.min(
      state.initialMaxStability,
      Math.max(0, newStabilityPenalty - effectiveBuffMaxStabilityDelta),
    );
    newMaxStability = state.initialMaxStability - newStabilityPenalty;
  }

  if (
    consumesTurn &&
    !isItemAction &&
    config.isSublimeCraft &&
    config.craftingType &&
    (state.harmonyData || config.craftingType === 'returningCycle')
  ) {
    const harmonyResult = processHarmonyEffect(
      state.harmonyData ?? { recommendedTechniqueTypes: [] },
      config.craftingType,
      skill.type,
    );
    if (harmonyResult.stabilityDelta !== 0) {
      newStability += harmonyResult.stabilityDelta;
    }
    if (harmonyResult.stabilityPenaltyDelta !== 0) {
      newStabilityPenalty += harmonyResult.stabilityPenaltyDelta;
      newStabilityPenalty = Math.min(
        newStabilityPenalty,
        state.initialMaxStability,
      );
      newMaxStability = state.initialMaxStability - newStabilityPenalty;
    }
  }

  if (
    consumesTurn &&
    (!skill.preventsMaxStabilityDecay || maxStabilitySealed)
  ) {
    newStabilityPenalty++;
  }
  newStabilityPenalty = Math.min(
    state.initialMaxStability,
    Math.max(0, Math.ceil(newStabilityPenalty)),
  );
  newMaxStability = state.initialMaxStability - newStabilityPenalty;
  const finalStability = Math.floor(
    clampStabilityToBounds(newStability, newMaxStability),
  );
  const finalMaxStability = Math.max(0, Math.floor(newMaxStability));

  return {
    stability: finalStability,
    maxStability: finalMaxStability,
    survivalProbability: calculateSurvivalProbability(
      newStability,
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
  if (state.qiDroplets < (skill.dropletCost ?? 0)) return false;
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
interface ActionPhaseContext {
  preview?: boolean;
  includeExpectedValue?: boolean;
  previewGains?: SkillGains;
  existingBuffNames: Pick<ReadonlySet<string>, 'has'>;
  successChance?: number;
  masteryPhase?: boolean;
  barStart: CraftingState;
  barContributions: BarContribution[];
  paymentCosts?: EffectiveActionCosts;
  nativeSource?: CraftingState;
}

const masteryPhaseSkills = new WeakMap<
  SkillDefinition,
  WeakMap<TechniqueEffect[], SkillDefinition>
>();

function masteryPhaseSkill(
  skill: SkillDefinition,
  effects: TechniqueEffect[],
): SkillDefinition {
  let phases = masteryPhaseSkills.get(skill);
  if (!phases) {
    phases = new WeakMap();
    masteryPhaseSkills.set(skill, phases);
  }
  const cached = phases.get(effects);
  if (cached) return cached;
  const phase: SkillDefinition = {
    name: skill.name,
    key: skill.key,
    type: skill.type,
    qiCost: 0,
    noQiCost: true,
    stabilityCost: 0,
    baseCompletionGain: 0,
    basePerfectionGain: 0,
    stabilityGain: 0,
    maxStabilityChange: 0,
    buffMultiplier: 1,
    buffType: BuffType.NONE,
    buffDuration: 0,
    consumesTurn: false,
    effects,
    masteryEntries: skill.masteryEntries?.filter(
      (entry) => entry.kind !== 'effect',
    ),
  };
  phases.set(effects, phase);
  return phase;
}

const PAYMENT_STAT_KEYS = [
  'poolCostFlat',
  'poolCostPercentage',
  'stabilityCostPercentage',
  'qiCostReduction',
  'qiCostPenalty',
  'stabilityCostReduction',
  'stabilityCostPenalty',
] as const;
type EffectMastery = {
  condition?: CraftingTechniqueCondition;
  effects: TechniqueEffect[];
};

function upsertBuffIntoMap(
  buffs: ActiveBuffMap,
  definition: BuffDefinition | undefined,
  stacksDelta: number,
  seedVariables?: ScalingVariables,
): number | undefined {
  if (!definition || !Number.isFinite(stacksDelta)) return;
  const delta = Math.floor(stacksDelta);
  if (delta === 0) return;
  const key = normalizeBuffName(definition.name);
  if (!key) return;
  const existing = buffs.get(key);
  const canStack =
    existing?.definition?.canStack ?? definition.canStack ?? true;
  const maxStacks = existing?.definition?.maxStacks ?? definition.maxStacks;
  if (existing && !canStack) return;
  let stacks = (existing?.stacks ?? 0) + delta;
  if (maxStacks) stacks = Math.min(stacks, maxStacks);
  if (existing) {
    buffs.set(key, {
      ...existing,
      definition: existing.definition ?? definition,
      stacks: Math.floor(stacks),
    });
  } else {
    buffs.set(key, {
      name: key,
      stacks: Math.floor(stacks),
      definition,
      internalState: seedBuffInternalState(definition, seedVariables),
    });
  }
  return delta > 0 ? delta : undefined;
}

function hasPaymentStats(definition: BuffDefinition | undefined): boolean {
  return PAYMENT_STAT_KEYS.some(
    (key) => definition?.stats?.[key] !== undefined,
  );
}

function isLiteralScaling(scaling: Scaling | undefined): boolean {
  return !scaling || Object.keys(scaling).every((key) => key === 'value');
}

const literalPaymentBuffs = new WeakMap<BuffDefinition, boolean>();
function hasLiteralPaymentStats(
  definition: BuffDefinition | undefined,
): boolean {
  if (!definition) return true;
  const cached = literalPaymentBuffs.get(definition);
  if (cached !== undefined) return cached;
  const literal =
    !definition.triggeredEffects?.length &&
    PAYMENT_STAT_KEYS.every((key) => isLiteralScaling(definition.stats?.[key]));
  literalPaymentBuffs.set(definition, literal);
  return literal;
}

/** Constant cost stats cannot depend on the mastery bar/resource effects.
 * Project just buff creation for those common payloads; expressions, trigger
 * hooks and other mutations retain the full phase interpreter below. */
function literalMasteryPayment(
  start: CraftingState,
  skill: SkillDefinition,
  config: OptimizerConfig,
  conditionEffects: ConditionEffect[],
  entries: EffectMastery[],
): { costs?: EffectiveActionCosts } | undefined {
  const active = getResolvedActiveBuffs(start, config);
  if (
    Array.from(active.values()).some(
      (buff) => !hasLiteralPaymentStats(buff.definition),
    )
  )
    return undefined;
  const costNames = new Set<string>();
  active.forEach((buff, key) => {
    if (hasPaymentStats(buff.definition)) costNames.add(key);
  });
  for (const entry of entries) {
    if (entry.condition && entry.condition.kind !== 'chance') return undefined;
    for (const effect of entry.effects) {
      if (effect.kind === 'createBuff') {
        if (
          !hasLiteralPaymentStats(effect.buff) ||
          !isLiteralScaling(effect.stacks) ||
          (effect.condition && effect.condition.kind !== 'chance')
        )
          return undefined;
        if (hasPaymentStats(effect.buff))
          costNames.add(normalizeBuffName(effect.buff?.name));
      } else if (
        ![
          'completion',
          'perfection',
          'stability',
          'pool',
          'maxStability',
          'cleanseToxicity',
        ].includes(effect.kind)
      ) {
        return undefined;
      }
    }
  }
  let outcomes = [{ probability: 1, buffs: active }];
  let varies = false;
  const creations = entries.map((entry) => ({
    ...entry,
    effects: entry.effects.filter(
      (effect) =>
        effect.kind === 'createBuff' &&
        costNames.has(normalizeBuffName(effect.buff?.name)),
    ),
  }));
  for (const entry of creations) {
    if (!entry.effects.length) continue;
    const probability =
      entry.condition?.kind === 'chance'
        ? Math.max(0, Math.min(1, entry.condition.percentage / 100))
        : 1;
    let next: typeof outcomes = [];
    for (const outcome of outcomes) {
      if (probability < 1)
        next.push({
          ...outcome,
          probability: outcome.probability * (1 - probability),
        });
      if (probability <= 0) continue;
      let block = [
        {
          buffs: outcome.buffs,
          probability: outcome.probability * probability,
        },
      ];
      for (const effect of entry.effects) {
        const chance =
          effect.condition?.kind === 'chance'
            ? Math.max(0, Math.min(1, effect.condition.percentage / 100))
            : 1;
        varies ||=
          (probability > 0 && probability < 1) || (chance > 0 && chance < 1);
        block = block.flatMap((branch) => {
          const result: typeof block = [];
          if (chance < 1)
            result.push({
              ...branch,
              probability: branch.probability * (1 - chance),
            });
          if (chance > 0) {
            const buffs = new Map(branch.buffs);
            upsertBuffIntoMap(
              buffs,
              effect.buff,
              evaluateScaling(effect.stacks, {} as ScalingVariables, 1),
            );
            result.push({ buffs, probability: branch.probability * chance });
          }
          return result;
        });
      }
      next = next.concat(block);
    }
    outcomes = next;
  }
  if (!varies) return {};
  const costs: EffectiveActionCosts = {
    qiCost: 0,
    stabilityCost: 0,
    requiredPostStability: Math.max(0, config.minStability),
    stabilityOutcomes: [],
  };
  let first: EffectiveActionCosts | undefined;
  let different = false;
  for (const outcome of outcomes) {
    const payment = calculateEffectiveActionCosts(
      start.copy({ buffs: outcome.buffs }),
      skill,
      config.minStability,
      conditionEffects,
      config,
    );
    if (first)
      different ||=
        payment.qiCost !== first.qiCost ||
        payment.stabilityCost !== first.stabilityCost;
    else first = payment;
    costs.qiCost += outcome.probability * payment.qiCost;
    costs.stabilityCost += outcome.probability * payment.stabilityCost;
    costs.stabilityOutcomes!.push({
      cost: payment.stabilityCost,
      probability: outcome.probability,
    });
  }
  return different ? { costs } : {};
}

/** Resolve a phase gate without building an unused variable scope. */
function evaluateMasteryPhaseCondition(
  condition: CraftingTechniqueCondition | undefined,
  state: CraftingState,
  config: OptimizerConfig,
  conditionEffects: ConditionEffect[],
): ConditionEvaluation {
  // These gates do not read any variables. In particular, unconditional and
  // chance-gated mastery blocks need no extra full action-scope construction.
  if (!condition) return { met: true, probability: 1 };
  if (condition.kind === 'chance') {
    const probability = Math.max(0, Math.min(1, condition.percentage / 100));
    return { met: probability > 0, probability };
  }
  return evaluateEffectCondition(
    condition,
    state,
    buildPreMasteryActionVariables(
      state,
      config,
      conditionEffects,
      getHarmonyStatModifiers(state.harmonyData, config.craftingType),
    ),
    0,
  );
}

/** Local payment integration only: these outcomes never enter the search tree. */
function expectedMasteryPayment(
  start: CraftingState,
  skill: SkillDefinition,
  config: OptimizerConfig,
  conditionEffects: ConditionEffect[],
  targetCompletion: number,
  currentCondition: string | undefined,
  targetPerfection: number,
  phase: ActionPhaseContext,
): EffectiveActionCosts | undefined {
  const entries = (skill.masteryEntries ?? []).filter(
    (entry) => entry.kind === 'effect' && Array.isArray(entry.effects),
  ) as EffectMastery[];
  if (
    !entries.some(
      (entry) =>
        entry.condition?.kind === 'chance' ||
        (entry.effects as TechniqueEffect[]).some(
          (effect) => effect.condition?.kind === 'chance',
        ),
    )
  ) {
    return undefined;
  }
  const literal = literalMasteryPayment(
    start,
    skill,
    config,
    conditionEffects,
    entries,
  );
  if (literal) return literal.costs;
  let outcomes = [{ probability: 1, state: start }];
  for (const entry of entries) {
    // An entry's chance gates its entire block; nested chances are independent.
    let effectOutcomes: Array<{
      probability: number;
      effects: TechniqueEffect[];
    }> = [{ probability: 1, effects: [] }];
    for (const effect of entry.effects as TechniqueEffect[]) {
      if (effect.condition?.kind !== 'chance') {
        for (const outcome of effectOutcomes) outcome.effects.push(effect);
        continue;
      }
      const probability = Math.max(
        0,
        Math.min(1, effect.condition.percentage / 100),
      );
      effectOutcomes = effectOutcomes.flatMap((outcome) => [
        ...(probability < 1
          ? [
              {
                ...outcome,
                probability: outcome.probability * (1 - probability),
              },
            ]
          : []),
        ...(probability > 0
          ? [
              {
                probability: outcome.probability * probability,
                effects: [
                  ...outcome.effects,
                  { ...effect, condition: undefined },
                ],
              },
            ]
          : []),
      ]);
    }
    const next: typeof outcomes = [];
    for (const outcome of outcomes) {
      const condition = evaluateMasteryPhaseCondition(
        entry.condition,
        outcome.state,
        config,
        conditionEffects,
      );
      if (!condition.met || condition.probability < 1) {
        next.push({
          state: outcome.state,
          probability:
            outcome.probability *
            (condition.met ? 1 - condition.probability : 1),
        });
      }
      if (!condition.met || condition.probability <= 0) continue;
      for (const effects of effectOutcomes) {
        const state =
          effects.effects.length === 0
            ? outcome.state
            : applySkillTransition(
                outcome.state,
                masteryPhaseSkill(skill, effects.effects),
                config,
                conditionEffects,
                targetCompletion,
                currentCondition,
                targetPerfection,
                {
                  ...phase,
                  successChance: 1,
                  masteryPhase: true,
                  barContributions: [],
                },
              )!;
        next.push({
          state,
          probability:
            outcome.probability * condition.probability * effects.probability,
        });
      }
    }
    outcomes = next;
  }
  const costs = outcomes.map((outcome) => ({
    ...outcome,
    costs: calculateEffectiveActionCosts(
      outcome.state,
      skill,
      config.minStability,
      conditionEffects,
      config,
    ),
  }));
  const first = costs[0]?.costs;
  if (
    !first ||
    costs.every(
      ({ costs }) =>
        costs.qiCost === first.qiCost &&
        costs.stabilityCost === first.stabilityCost,
    )
  ) {
    return undefined;
  }
  return {
    qiCost: costs.reduce(
      (sum, outcome) => sum + outcome.probability * outcome.costs.qiCost,
      0,
    ),
    stabilityCost: costs.reduce(
      (sum, outcome) => sum + outcome.probability * outcome.costs.stabilityCost,
      0,
    ),
    requiredPostStability: first.requiredPostStability,
    stabilityOutcomes: costs.map((outcome) => ({
      cost: outcome.costs.stabilityCost,
      probability: outcome.probability,
    })),
  };
}

export function applySkill(
  state: CraftingState,
  skill: SkillDefinition,
  config: OptimizerConfig,
  conditionEffects: ConditionEffect[] = [],
  targetCompletion = 0,
  currentCondition?: string,
  targetPerfection = 0,
  options: Pick<SkillGainOptions, 'successChance'> = {},
): CraftingState | null {
  if (
    !canApplySkill(
      state,
      skill,
      config.minStability,
      config.maxToxicity || 0,
      currentCondition,
      conditionEffects,
      config.pillsPerRound || 1,
      config,
    )
  )
    return null;

  const existingBuffNames = getResolvedActiveBuffs(state, config);
  const hasMasteryEffects =
    skill.masteryEntries?.some((entry) => entry.kind === 'effect') ?? false;
  const paysSetup = Boolean(
    skill.buffCost || skill.toxicityCost || skill.dropletCost,
  );
  let successChance = options.successChance;
  let working = paysSetup
    ? state.copy({
        toxicity: state.toxicity + (skill.toxicityCost ?? 0),
        qiDroplets: Math.max(0, state.qiDroplets - (skill.dropletCost ?? 0)),
      })
    : state;
  const context: ActionPhaseContext = {
    existingBuffNames,
    successChance,
    barStart: state,
    barContributions: [],
    nativeSource: working,
  };
  if (skill.buffCost) {
    const owner = existingBuffNames.get(skill.buffCost.buffName);
    if (owner) {
      working = applySkillTransition(
        working,
        masteryPhaseSkill(skill, [
          {
            kind: 'consumeBuff',
            buff: owner.definition ?? {
              name: owner.name,
              canStack: true,
              effects: [],
            },
            stacks: {
              value: skill.buffCost.consumeAll
                ? owner.stacks
                : (skill.buffCost.amount ?? 0),
            },
          },
        ]),
        config,
        conditionEffects,
        targetCompletion,
        currentCondition,
        targetPerfection,
        { ...context, successChance: 1, masteryPhase: true },
      )!;
    }
  }
  // Runtime captures success after setup payment/listeners, before masteries.
  if (successChance === undefined && (paysSetup || hasMasteryEffects)) {
    const initialVars = buildPreMasteryActionVariables(
      working,
      config,
      conditionEffects,
      getHarmonyStatModifiers(working.harmonyData, config.craftingType),
    );
    successChance =
      skill.actionKind === 'item'
        ? 1
        : Math.max(
            0,
            Math.min(
              1,
              (skill.successChance ?? 1) + initialVars.successChanceBonus,
            ),
          );
  }
  context.successChance = successChance;
  const paymentCosts = expectedMasteryPayment(
    working,
    skill,
    config,
    conditionEffects,
    targetCompletion,
    currentCondition,
    targetPerfection,
    context,
  );
  // Mastery effects use the same effect transition, but never pay again, tick
  // buffs, roll the technique's success, advance time, or resolve harmony.
  for (const entry of skill.masteryEntries ?? []) {
    if (entry.kind !== 'effect' || !Array.isArray(entry.effects)) continue;
    const condition = evaluateMasteryPhaseCondition(
      entry.condition,
      working,
      config,
      conditionEffects,
    );
    if (!condition.met || condition.probability <= 0) continue;
    const phaseSkill = masteryPhaseSkill(
      skill,
      entry.effects as TechniqueEffect[],
    );
    working = applySkillTransition(
      working,
      phaseSkill,
      config,
      conditionEffects,
      targetCompletion,
      currentCondition,
      targetPerfection,
      { ...context, successChance: condition.probability, masteryPhase: true },
    )!;
  }
  // Keep HEAD's expected-stack approximation for future turns. Only the
  // current payment uses realized costs, rounded before probability mixing.
  context.paymentCosts = paymentCosts;
  const result = applySkillTransition(
    working,
    skill,
    config,
    conditionEffects,
    targetCompletion,
    currentCondition,
    targetPerfection,
    context,
  );
  return result;
}

function applySkillTransition(
  state: CraftingState,
  skill: SkillDefinition,
  config: OptimizerConfig,
  conditionEffects: ConditionEffect[] = [],
  targetCompletion: number = 0,
  currentCondition: string | undefined,
  targetPerfection: number = 0,
  phase: ActionPhaseContext,
): CraftingState | null {
  const maxToxicity = config.maxToxicity || 0;
  const resolvedActiveBuffs = getResolvedActiveBuffs(state, config);

  const isItemAction = skill.actionKind === 'item';
  const consumesTurn = skill.consumesTurn ?? !isItemAction;
  const nextStep = state.step + (consumesTurn ? 1 : 0);
  let qiCap = getEffectiveMaxPool(state, config, resolvedActiveBuffs);
  const clampQi = (value: number): number =>
    Math.max(0, Math.min(qiCap, value));

  const effectiveCosts =
    (phase.masteryPhase
      ? { qiCost: 0, stabilityCost: 0, requiredPostStability: 0 }
      : phase.paymentCosts) ??
    calculateEffectiveActionCosts(
      state,
      skill,
      config.minStability,
      conditionEffects,
      config,
    );

  // Calculate gains BEFORE applying buffs from this skill
  const orderedNumeric =
    (!isItemAction && hasEffectInterceptors(resolvedActiveBuffs)) ||
    hasStabilityPrevention(resolvedActiveBuffs);
  const orderedEffects =
    orderedNumeric && !skill.isDisciplinedTouch && !!skill.effects?.length;
  const newBuffs = new Map(resolvedActiveBuffs);
  let certainApplication = true;
  const gains: SkillGains =
    orderedEffects ||
    (!skill.isDisciplinedTouch &&
      skill.effects?.length &&
      skill.effects.every(
        (effect) => effect.kind === 'createBuff' && !effect.condition,
      ))
      ? { completion: 0, perfection: 0, stability: 0 }
      : calculateSkillGains(state, skill, config, conditionEffects, {
          successChance: phase.successChance,
          stabilityCost: effectiveCosts.stabilityCost,
        });

  // Action-level scaling variables (carry the 0.7.10 boost stats). Pure over
  // the pre-action state, so they are built up front and shared by the cost
  // restore, technique effects, and buff effects below.
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
    ...(orderedNumeric ? { step: state.step } : {}),
  };
  actionVars.control *= 1 + (mastery.controlBonus || 0);
  actionVars.intensity *= 1 + (mastery.intensityBonus || 0);
  actionVars.critchance += mastery.critChanceBonus || 0;
  actionVars.critmultiplier += mastery.critMultiplierBonus || 0;
  actionVars.successChanceBonus += mastery.successChanceBonus || 0;

  const effectiveQiCost = effectiveCosts.qiCost;
  let effectiveStabilityCost = effectiveCosts.stabilityCost;
  const stabilityProjection = new StabilityProjection(
    state.stability,
    state.stabilityPenalty,
  );
  if (!orderedNumeric)
    stabilityProjection.pay(
      effectiveStabilityCost,
      effectiveCosts.stabilityOutcomes,
    );

  // Calculate new resource values
  let newQi = clampQi(state.qi - effectiveQiCost);
  // 0.7.7+ trigger amounts: the runtime fires `poolSpent` when the cost is
  // paid and `poolRestored` when a restore lands, each with the actual delta.
  const qiSpentByCost = Math.max(0, state.qi - newQi);
  let qiRestoredBySkill = 0;
  const hasExplicitPoolEffect =
    Array.isArray(skill.effects) &&
    skill.effects.some((effect) => effect?.kind === 'pool');
  if (
    !hasExplicitPoolEffect &&
    skill.restoresQi &&
    skill.qiRestore &&
    skill.qiRestore > 0
  ) {
    const qiBeforeRestore = newQi;
    // 0.7.10: pool restores go through the runtime's applyPool, which applies
    // the Qi Boost stat to positive amounts.
    newQi = clampQi(
      newQi + applyGainBoost(skill.qiRestore, actionVars.qiBoost),
    );
    qiRestoredBySkill = Math.max(0, newQi - qiBeforeRestore);
  }

  // Handle max stability using game's penalty system:
  // 1. Apply standard decay of 1 per turn (unless skill prevents it)
  // 2. Apply any direct max stability change from the skill effect
  // 3. Apply any full restore effect
  let newStabilityPenalty = state.stabilityPenalty;

  // 0.7.8 Illume Crucible seal: decay is forced every action and all
  // restoration is dropped while a sealed buff is held (runtime
  // `(!i.noMaxStabilityLoss||E7o(e))&&t.stabilityPenalty++` and `D7o`).
  const maxStabilitySealed = hasSealedMaxStabilityBuff(state.buffs);

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
    // A sealed max stability drops positive (restoring) changes entirely.
    const effectiveMaxStabilityChange =
      maxStabilitySealed && skill.maxStabilityChange > 0
        ? 0
        : skill.maxStabilityChange;
    newStabilityPenalty = Math.min(
      state.initialMaxStability,
      Math.max(0, newStabilityPenalty - effectiveMaxStabilityChange),
    );
    stabilityProjection.change(0, -effectiveMaxStabilityChange);
    newMaxStability = state.initialMaxStability - newStabilityPenalty;
  }

  if (skill.restoresMaxStabilityToFull && !maxStabilitySealed) {
    newStabilityPenalty = 0;
    newMaxStability = state.initialMaxStability;
    stabilityProjection.restoreMaximum();
  }

  // Calculate new stability (current stability, not max)
  let newStability =
    state.stability -
    (orderedNumeric ? 0 : effectiveStabilityCost) +
    gains.stability;
  if (!skill.effects?.length) stabilityProjection.change(gains.stability);

  // Stability can overdraw and exceed its ceiling until turn cleanup. Qi's
  // immediate clamp above is intentionally different.

  // Handle toxicity for alchemy crafting
  let newToxicity = state.toxicity;
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
    seedVariables?: ScalingVariables,
  ): void => {
    const gained = upsertBuffIntoMap(
      newBuffs,
      definition,
      stacksDelta,
      seedVariables,
    );
    if (gained !== undefined && definition)
      dispatchBuffTriggers(`stackGained.${definition.name}`, gained);
  };

  const adjustExistingBuffStacks = (
    buffKey: string,
    stacksDelta: number,
  ): void => {
    const existing = newBuffs.get(buffKey);
    if (!existing || !Number.isFinite(stacksDelta)) return;

    if (stacksDelta >= 0) {
      upsertBuffFromDefinition(existing.definition, stacksDelta);
      return;
    }
    const removal = Math.floor(-stacksDelta);
    const lost = Math.min(existing.stacks, removal);
    const nextStacks = existing.stacks - removal;
    if (nextStacks > 0) {
      newBuffs.set(buffKey, { ...existing, stacks: Math.floor(nextStacks) });
    } else {
      newBuffs.delete(buffKey);
    }
    if (lost > 0)
      dispatchBuffTriggers(
        `stackLost.${existing.definition?.name ?? existing.name}`,
        lost,
      );
  };

  const actionSuccessChance =
    phase.successChance ??
    (isItemAction
      ? 1
      : Math.max(
          0,
          Math.min(
            1,
            (skill.successChance ?? 1) + actionVars.successChanceBonus,
          ),
        ));

  const modifyBuffGroup = (
    group: string | undefined,
    mode: string | undefined,
    amount: number,
  ): void => {
    let targets = Array.from(newBuffs.entries()).filter(
      ([, buff]) =>
        buff.definition?.buffType === group || buff.definition?.name === group,
    );
    if (mode === 'highest' || mode === 'lowest') {
      targets = targets.length
        ? [
            targets.reduce((best, candidate) =>
              (
                mode === 'highest'
                  ? candidate[1].stacks > best[1].stacks
                  : candidate[1].stacks < best[1].stacks
              )
                ? candidate
                : best,
            ),
          ]
        : [];
    }
    // No stock effect selects a random member. A multi-target random mutation
    // needs persistent probabilistic buff states, not fractional stack floors.
    if (mode === 'random' && targets.length > 1) return;
    for (const [key, target] of targets) {
      if (amount < 0) adjustExistingBuffStacks(key, amount);
      else upsertBuffFromDefinition(target.definition, amount);
    }
  };

  // 0.7.7+ triggered buff effects (the runtime `_6` dispatcher). The runtime
  // fires triggers as each change lands - cost payment, technique
  // applications, then per-turn buff effects - so dispatches below run after
  // the technique effects and the buff fold re-reads the mutated state.
  const triggerBuffsPresent = hasTriggeredEffectBuffs(newBuffs);
  const activeTriggers = new Set<string>();
  let runningCompletion = state.completion;
  let runningPerfection = state.perfection;

  const dispatchBuffTriggers = (
    trigger: CraftingBuffTrigger,
    amount: number,
    percentGained: number = 0,
  ): void => {
    if (
      !Number.isFinite(amount) ||
      (amount <= 0 && !trigger.startsWith('stackLost.'))
    ) {
      return;
    }
    for (const [buffKey, buff] of Array.from(newBuffs.entries())) {
      const blocks = buff.definition?.triggeredEffects;
      if (
        !blocks?.some((block) => block.trigger === trigger) ||
        !newBuffs.get(buffKey) ||
        (newBuffs.get(buffKey)?.stacks ?? 0) <= 0
      ) {
        continue;
      }
      const guardKey = `${trigger}:${buffKey}`;
      if (activeTriggers.has(guardKey)) continue;
      activeTriggers.add(guardKey);
      const scope: ScalingVariables = {
        ...actionVars,
        roomEffectiveness: 0,
        pool: newQi,
        maxpool: qiCap,
        toxicity: newToxicity,
        maxtoxicity: config.maxToxicity || 0,
        ...buff.definition?.additionalVariables,
        ...buff.internalState,
        stacks: buff.stacks,
        amount,
        percentGained,
      };
      for (const block of blocks) {
        if (block.trigger !== trigger) {
          continue;
        }
        for (const effect of block.effects ?? []) {
          if (effect) executeBuffEffect(effect, buffKey, buff, scope);
        }
      }
      activeTriggers.delete(guardKey);
    }
  };

  let techniquePoolDelta = 0;
  let techniqueMaxStabilityDelta = 0;
  const techniqueProgress: LiveProgress = {
    completion: state.completion,
    perfection: state.perfection,
    stability: state.stability - effectiveStabilityCost,
  };
  const techniqueCritFactor = calculateExpectedCritMultiplier(
    actionVars.critchance,
    actionVars.critmultiplier,
  );
  const applyTechniqueNumeric = (
    effect: TechniqueEffect,
    factor: number,
    conditionProbability: number,
  ): void => {
    let raw = evaluateScalingWithMasteryUpgrades(
      effect.amount,
      actionMasteryUpgrades,
      actionVars,
      0,
    );
    if (
      (effect.kind === 'completion' || effect.kind === 'perfection') &&
      raw < 0 &&
      (effect.amount?.value ?? 0) > 0
    )
      raw = 0;
    // y7c: held order, first matching interceptor PER owner, floor each step.
    for (const [key] of isItemAction ? [] : Array.from(newBuffs.entries())) {
      const owner = newBuffs.get(key);
      if (!owner) continue;
      for (const interceptor of owner.definition?.craftingEffectInterceptors ??
        []) {
        if (
          !interceptor.appliesTo.some((kind) => kind === effect.kind) ||
          (interceptor.techniqueTypes &&
            !interceptor.techniqueTypes.includes(skill.type))
        )
          continue;
        const scope: ScalingVariables = {
          ...actionVars,
          step: state.step,
          ...owner.definition?.additionalVariables,
          ...owner.internalState,
          stacks: owner.stacks,
          amount: raw,
        };
        const trigger = evaluateLiveProgressCondition(
          interceptor.trigger,
          state,
          scope,
          owner.stacks,
          techniqueProgress,
        );
        if (!trigger.met || trigger.probability !== 1) continue;
        raw = Math.floor(raw * interceptor.modifier.value);
        // Optional stochastic side effects are intentionally not approximated.
        if (factor === 1)
          for (const sideEffect of interceptor.effects ?? []) {
            const sideScope = { ...actionVars, amount: raw };
            Object.assign(
              sideScope,
              owner.definition?.additionalVariables,
              newBuffs.get(key)?.internalState,
              { stacks: newBuffs.get(key)?.stacks ?? 0 },
            );
            const condition = evaluateLiveProgressCondition(
              sideEffect.condition,
              state,
              sideScope,
              owner.stacks,
              techniqueProgress,
            );
            if (condition.met && condition.probability === 1)
              executeBuffEffect(
                { ...sideEffect, condition: undefined },
                key,
                owner,
                sideScope,
              );
          }
        break;
      }
    }
    const crit =
      phase.includeExpectedValue === false
        ? 1
        : calculateExpectedCritMultiplier(
            actionVars.critchance,
            actionVars.critmultiplier,
          );
    const isBar = effect.kind === 'completion' || effect.kind === 'perfection';
    const application = prepareNumericApplication(
      effect.kind,
      raw > 0 && isBar ? safeFloor(raw * crit) : raw,
      actionVars,
    );
    if (effect.kind === 'stability' && application.realizedAmount < 0) {
      application.realizedAmount = appliedStabilityAmount(
        application.realizedAmount,
        actionVars,
        newBuffs,
      );
      application.amount = application.realizedAmount;
      if (
        preventCertainStabilityLoss(
          newBuffs,
          application.amount,
          certainApplication && factor === 1,
        )
      )
        application.amount = application.realizedAmount = 0;
    }
    const amount = application.amount * factor;
    if (isBar) {
      const completion = effect.kind === 'completion';
      const before = completion ? runningCompletion : runningPerfection;
      // Retain uncapped overflow and fractional expected listener amounts.
      // Aggregate expected progress is floored/capped in expectedBarGain below.
      if (completion) {
        gains.completion += amount;
        runningCompletion += amount;
        techniqueProgress.completion +=
          application.realizedAmount * conditionProbability;
      } else {
        gains.perfection += amount;
        runningPerfection += amount;
        techniqueProgress.perfection +=
          application.realizedAmount * conditionProbability;
      }
      if (recordBarChanges && amount !== 0)
        gains.barContributions = [
          ...(gains.barContributions ?? []),
          { bar: completion ? 'completion' : 'perfection', amount },
        ];
      if (amount > 0)
        dispatchBuffTriggers(
          completion ? 'completionGained' : 'perfectionGained',
          amount,
          computeTriggerPercentGained(
            amount,
            before + amount,
            completion ? targetCompletion : targetPerfection,
          ),
        );
    } else if (effect.kind === 'stability') {
      stabilityProjection.changeTechnique(
        application.realizedAmount,
        0,
        conditionProbability,
      );
      techniqueProgress.stability +=
        application.realizedAmount * conditionProbability;
      newStability += amount;
      gains.stability += amount;
      if (amount !== 0)
        dispatchBuffTriggers(
          amount > 0 ? 'stabilityRestored' : 'stabilitySpent',
          Math.abs(amount),
        );
    } else if (effect.kind === 'pool') {
      newQi = clampQi(newQi + amount);
      if (amount !== 0)
        dispatchBuffTriggers(
          amount > 0 ? 'poolRestored' : 'poolSpent',
          Math.abs(amount),
        );
    } else if (effect.kind === 'maxStability') {
      const applied = maxStabilitySealed ? Math.min(0, raw) : raw;
      stabilityProjection.changeTechnique(0, -applied, conditionProbability);
      techniqueMaxStabilityDelta += applied * factor;
    } else if (effect.kind === 'cleanseToxicity') {
      newToxicity = Math.max(0, newToxicity - amount);
      gains.toxicityCleanse = (gains.toxicityCleanse ?? 0) + amount;
    }
  };
  if (orderedNumeric) {
    if (qiSpentByCost > 0) dispatchBuffTriggers('poolSpent', qiSpentByCost);
    const paymentCertain =
      effectiveCosts.stabilityOutcomes?.every((outcome) => outcome.cost > 0) ??
      true;
    if (
      preventCertainStabilityLoss(
        newBuffs,
        -effectiveStabilityCost,
        paymentCertain,
      )
    )
      effectiveStabilityCost = 0;
    else
      stabilityProjection.pay(
        effectiveStabilityCost,
        effectiveCosts.stabilityOutcomes,
      );
    newStability -= effectiveStabilityCost;
    if (effectiveStabilityCost > 0)
      dispatchBuffTriggers('stabilitySpent', effectiveStabilityCost);
    if (qiRestoredBySkill > 0)
      dispatchBuffTriggers('poolRestored', qiRestoredBySkill);
    techniqueProgress.stability = stabilityProjection.meanStability();
  }
  stabilityProjection.beginTechnique(actionSuccessChance);
  if (skill.effects && skill.effects.length > 0) {
    for (const effect of skill.effects) {
      if (!effect) continue;
      const conditionResult = evaluateLiveProgressCondition(
        effect.condition,
        state,
        actionVars,
        0,
        techniqueProgress,
      );
      if (!conditionResult.met || conditionResult.probability <= 0) continue;
      const factor = actionSuccessChance * conditionResult.probability;
      if (factor <= 0) continue;
      const previousCertainty: boolean = certainApplication;
      certainApplication = previousCertainty && factor === 1;
      if (
        orderedEffects &&
        [
          'completion',
          'perfection',
          'stability',
          'pool',
          'maxStability',
          'cleanseToxicity',
        ].includes(effect.kind)
      ) {
        applyTechniqueNumeric(effect, factor, conditionResult.probability);
        certainApplication = previousCertainty;
        continue;
      }

      advanceTechniqueProgress(
        techniqueProgress,
        effect,
        actionVars,
        actionMasteryUpgrades,
        conditionResult.probability,
        techniqueCritFactor,
      );

      switch (effect.kind) {
        case 'stability': {
          const raw = evaluateScalingWithMasteryUpgrades(
            effect.amount,
            actionMasteryUpgrades,
            actionVars,
            0,
          );
          stabilityProjection.changeTechnique(
            applyGainBoost(raw, actionVars.stabilityBoost),
            0,
            conditionResult.probability,
          );
          break;
        }
        case 'pool': {
          // Runtime routes positive pool effects through applyPool, which
          // applies the 0.7.10 Qi Boost stat to the restored amount.
          const poolAmount =
            evaluateScalingWithMasteryUpgrades(
              effect.amount,
              actionMasteryUpgrades,
              actionVars,
              0,
            ) * factor;
          techniquePoolDelta +=
            poolAmount > 0
              ? applyGainBoost(poolAmount, actionVars.qiBoost)
              : poolAmount;
          break;
        }
        case 'maxStability':
          stabilityProjection.changeTechnique(
            0,
            -(maxStabilitySealed
              ? Math.min(
                  0,
                  evaluateScalingWithMasteryUpgrades(
                    effect.amount,
                    actionMasteryUpgrades,
                    actionVars,
                    0,
                  ),
                )
              : evaluateScalingWithMasteryUpgrades(
                  effect.amount,
                  actionMasteryUpgrades,
                  actionVars,
                  0,
                )),
            conditionResult.probability,
          );
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
          upsertBuffFromDefinition(effect.buff, stacksToAdd, actionVars);
          break;
        }
        case 'modifyBuffGroup':
          if (!isItemAction)
            modifyBuffGroup(
              effect.group,
              effect.mode,
              evaluateScalingWithMasteryUpgrades(
                effect.amount,
                actionMasteryUpgrades,
                actionVars,
                1,
              ) * factor,
            );
          break;
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
      certainApplication = previousCertainty;
    }
  }

  if (orderedEffects) {
    // Match the legacy preview: cap the combined successful gain, then apply
    // the shared success probability once. Never discard overflow per effect.
    const expectedBarGain = (
      bar: 'completion' | 'perfection',
      cap: number | undefined,
    ): number => {
      const gain = safeFloor(techniqueProgress[bar] - state[bar]);
      const headroom =
        cap === undefined ? Infinity : Math.max(0, cap - state[bar]);
      return safeFloor(Math.min(gain, headroom) * actionSuccessChance);
    };
    gains.completion = expectedBarGain('completion', config.maxCompletion);
    gains.perfection = expectedBarGain('perfection', config.maxPerfection);
  }
  stabilityProjection.endTechnique();

  function executeBuffEffect(
    effect: BuffEffect,
    ownerBuffKey: string,
    ownerBuff: { name: string; stacks: number; definition?: BuffDefinition },
    scalingVars: ScalingVariables,
  ): void {
    const liveOwner = newBuffs.get(ownerBuffKey);
    if (!liveOwner) return;
    Object.assign(
      scalingVars,
      { roomEffectiveness: 0 },
      liveOwner.definition?.additionalVariables,
      liveOwner.internalState,
      { stacks: liveOwner.stacks },
    );
    const conditionResult = evaluateEffectCondition(
      effect.condition,
      state,
      effect.condition?.kind === 'stability'
        ? {
            ...scalingVars,
            stability: stabilityProjection.meanStability(),
            maxstability: state.initialMaxStability,
          }
        : scalingVars,
      liveOwner.stacks,
    );
    if (!conditionResult.met || conditionResult.probability <= 0) {
      return;
    }
    const conditionFactor = conditionResult.probability;
    // 0.7.10: the runtime pipes every bar/resource application through
    // appliers that scale positive amounts by the matching boost stat
    // (completionBoost / perfectionBoost / stabilityBoost / qiBoost).
    const raw = evaluateScalingWithMasteryUpgrades(
      effect.amount,
      actionMasteryUpgrades,
      scalingVars,
      0,
    );
    const application = prepareNumericApplication(
      effect.kind,
      raw,
      scalingVars,
      conditionFactor,
    );
    const rawAmount = raw * conditionFactor;
    if (effect.kind === 'stability' && application.realizedAmount < 0) {
      application.realizedAmount = appliedStabilityAmount(
        application.realizedAmount,
        scalingVars,
        newBuffs,
      );
      application.amount = application.realizedAmount * conditionFactor;
      if (
        preventCertainStabilityLoss(
          newBuffs,
          application.realizedAmount,
          certainApplication && conditionFactor === 1,
        )
      )
        application.amount = application.realizedAmount = 0;
    }
    const amount = application.amount;
    const previousCertainty: boolean = certainApplication;
    certainApplication = previousCertainty && conditionFactor === 1;
    switch (effect.kind) {
      case 'completion':
        buffCompletion += amount;
        if (recordBarChanges && amount !== 0) {
          buffBarContributions.push({ bar: 'completion', amount });
        }
        // Buff bar applications fire the same runtime triggers as technique
        // applications (e.g. Illume Crucible's onStabilize completion feeds
        // True Bifang Flame's blaze).
        if (triggerBuffsPresent && amount > 0) {
          const barAfter = runningCompletion + amount;
          runningCompletion = barAfter;
          dispatchBuffTriggers(
            'completionGained',
            amount,
            computeTriggerPercentGained(amount, barAfter, targetCompletion),
          );
        }
        break;
      case 'perfection':
        buffPerfection += amount;
        if (recordBarChanges && amount !== 0) {
          buffBarContributions.push({ bar: 'perfection', amount });
        }
        if (triggerBuffsPresent && amount > 0) {
          const barAfter = runningPerfection + amount;
          runningPerfection = barAfter;
          dispatchBuffTriggers(
            'perfectionGained',
            amount,
            computeTriggerPercentGained(amount, barAfter, targetPerfection),
          );
        }
        break;
      case 'stability':
        stabilityProjection.change(
          application.realizedAmount,
          0,
          conditionFactor,
        );
        buffStabilityDelta += amount;
        if (triggerBuffsPresent && amount !== 0) {
          dispatchBuffTriggers(
            amount > 0 ? 'stabilityRestored' : 'stabilitySpent',
            Math.abs(amount),
          );
        }
        break;
      case 'pool':
        buffPoolDelta += amount;
        if (triggerBuffsPresent && amount !== 0) {
          dispatchBuffTriggers(
            amount > 0 ? 'poolRestored' : 'poolSpent',
            Math.abs(amount),
          );
        }
        break;
      case 'maxStability':
        stabilityProjection.change(
          0,
          -(maxStabilitySealed
            ? Math.min(0, rawAmount / conditionFactor)
            : rawAmount / conditionFactor),
          conditionFactor,
        );
        buffMaxStabilityDelta += amount;
        break;
      case 'changeToxicity':
        // Runtime `changeToxicity` does `stats.toxicity -= amount`: a positive
        // amount cleanses toxicity, a negative amount inflicts it.
        buffToxicityDelta -= amount;
        break;
      case 'negate':
        newBuffs.delete(ownerBuffKey);
        dispatchBuffTriggers(
          `stackLost.${liveOwner.definition?.name ?? liveOwner.name}`,
          liveOwner.stacks,
        );
        break;
      case 'createBuff': {
        const stacksToAdd =
          evaluateScalingWithMasteryUpgrades(
            effect.stacks,
            actionMasteryUpgrades,
            scalingVars,
            1,
          ) * conditionFactor;
        if (stacksToAdd < 0)
          adjustExistingBuffStacks(
            normalizeBuffName(effect.buff?.name),
            stacksToAdd,
          );
        else upsertBuffFromDefinition(effect.buff, stacksToAdd, scalingVars);
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
      case 'modifyBuffGroup':
        modifyBuffGroup(
          effect.group,
          effect.mode,
          evaluateScalingWithMasteryUpgrades(
            effect.amount,
            actionMasteryUpgrades,
            scalingVars,
            1,
          ) * conditionFactor,
        );
        break;
      case 'setState': {
        // 0.7.7+ per-instance state writes (Azure Depths' per-action
        // `stored = max(0, stored - 1)` decay lives in `effects`).
        const stateKey = effect.key;
        if (!stateKey) break;
        const stateValue = evaluateScalingWithMasteryUpgrades(
          effect.value,
          actionMasteryUpgrades,
          scalingVars,
          0,
        );
        if (!Number.isFinite(stateValue)) break;
        const owner = newBuffs.get(ownerBuffKey);
        if (!owner) break;
        const nextInternalState: Record<string, number> = {
          ...(owner.internalState ?? {}),
        };
        const previousValue = nextInternalState[stateKey] ?? 0;
        nextInternalState[stateKey] =
          effect.mode === 'add' ? previousValue + stateValue : stateValue;
        for (const key of effect.keys ?? []) {
          nextInternalState[key] =
            effect.mode === 'add'
              ? (nextInternalState[stateKey] ?? 0) + stateValue
              : stateValue;
        }
        scalingVars[stateKey] = nextInternalState[stateKey];
        // The runtime iterates indexes here, not the key values.
        for (const index of Object.keys(effect.keys ?? [])) {
          scalingVars[index] = nextInternalState[index] ?? 0;
        }
        newBuffs.set(ownerBuffKey, {
          ...owner,
          internalState: nextInternalState,
        });
        break;
      }
    }
    certainApplication = previousCertainty;
  }

  // Fire the cost/technique triggers before per-turn buff effects run,
  // matching the runtime order (costs, technique effects, then buff effects).
  if (phase.preview) {
    phase.previewGains = {
      ...gains,
      completion: gains.completion + buffCompletion,
      perfection: gains.perfection + buffPerfection,
      stability: gains.stability + buffStabilityDelta,
    };
    return state;
  }
  if (triggerBuffsPresent) {
    if (!orderedNumeric) {
      if (qiSpentByCost > 0) {
        dispatchBuffTriggers('poolSpent', qiSpentByCost);
      }
      if (qiRestoredBySkill > 0) {
        dispatchBuffTriggers('poolRestored', qiRestoredBySkill);
      }
    }
    if (techniquePoolDelta > 0) {
      dispatchBuffTriggers('poolRestored', techniquePoolDelta);
    } else if (techniquePoolDelta < 0) {
      dispatchBuffTriggers('poolSpent', -techniquePoolDelta);
    }
    if (!orderedNumeric && effectiveStabilityCost > 0) {
      dispatchBuffTriggers('stabilitySpent', effectiveStabilityCost);
    }
    if (!orderedEffects) {
      if (gains.stability > 0) {
        dispatchBuffTriggers('stabilityRestored', gains.stability);
      }
      // Bar applications fire per application in runtime order; True Bifang
      // Flame keys blaze on the largest single-application percentGained.
      const triggerBarContributions =
        gains.barContributions && gains.barContributions.length > 0
          ? scaleBarContributions(
              gains.barContributions,
              gains.completion,
              gains.perfection,
            )
          : synthesizeBarContributions(gains.completion, gains.perfection);
      for (const contribution of triggerBarContributions) {
        if (contribution.amount <= 0) {
          continue;
        }
        if (contribution.bar === 'completion') {
          const barAfter = runningCompletion + contribution.amount;
          dispatchBuffTriggers(
            'completionGained',
            contribution.amount,
            computeTriggerPercentGained(
              contribution.amount,
              barAfter,
              targetCompletion,
            ),
          );
          runningCompletion = barAfter;
        } else {
          const barAfter = runningPerfection + contribution.amount;
          dispatchBuffTriggers(
            'perfectionGained',
            contribution.amount,
            computeTriggerPercentGained(
              contribution.amount,
              barAfter,
              targetPerfection,
            ),
          );
          runningPerfection = barAfter;
        }
      }
    }
  }

  if (consumesTurn) {
    for (const [buffKey, buff] of Array.from(newBuffs.entries())) {
      // Triggered effects may have rewritten this buff's internal state
      // already this action, so read the live entry, not the snapshot.
      if (!phase.existingBuffNames.has(buffKey)) continue;
      const liveBuff = newBuffs.get(buffKey);
      if (!liveBuff?.definition) continue;
      const scalingVars: ScalingVariables = {
        ...actionVars,
        roomEffectiveness: 0,
        stability: newStability + buffStabilityDelta,
        maxstability: state.initialMaxStability,
        pool: newQi,
        maxpool: qiCap,
        toxicity: newToxicity,
        maxtoxicity: config.maxToxicity || 0,
        poolCostFlat: state.poolCostFlat,
        poolCostPercentage: state.poolCostPercentage,
        stabilityCostPercentage: state.stabilityCostPercentage,
        ...liveBuff.definition.additionalVariables,
        stacks: liveBuff.stacks,
      };
      // 0.7.7+ buffs read trigger-written internal state from their eqns
      // (e.g. True Bifang Flame's per-action payout scaling on `blaze`).
      if (liveBuff.internalState) {
        for (const [stateKey, stateValue] of Object.entries(
          liveBuff.internalState,
        )) {
          if (typeof stateValue === 'number' && Number.isFinite(stateValue)) {
            scalingVars[stateKey] = stateValue;
          }
        }
      }
      // Execute action-type-specific effects
      const actionEffects: BuffEffect[] | undefined =
        skill.type === 'fusion'
          ? liveBuff.definition.onFusion
          : skill.type === 'refine'
            ? liveBuff.definition.onRefine
            : skill.type === 'stabilize'
              ? liveBuff.definition.onStabilize
              : skill.type === 'support'
                ? liveBuff.definition.onSupport
                : undefined;
      if (actionEffects) {
        for (const effect of actionEffects) {
          executeBuffEffect(effect, buffKey, liveBuff, scalingVars);
        }
      }
      for (const effect of liveBuff.definition.effects ?? []) {
        executeBuffEffect(effect, buffKey, liveBuff, scalingVars);
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

  // Update Completion Bonus stacks. 0.7.10: the buff now grants +10
  // Perfection Boost per stack (pre-0.7.10 it was +10% control per stack),
  // applied in the scaling base above via `perfectionBoost`.
  let newCompletionBonus = state.completionBonus;
  if (consumesTurn && targetCompletion > 0) {
    const bonusInfo = getBonusAndChance(newCompletion, targetCompletion);
    // Completion bonus stacks are guaranteed - 1 (first threshold doesn't count)
    newCompletionBonus = Math.max(0, bonusInfo.guaranteed - 1);
  }

  if (techniqueMaxStabilityDelta !== 0) {
    // A sealed max stability drops positive (restoring) deltas entirely.
    const effectiveTechniqueMaxStabilityDelta =
      maxStabilitySealed && techniqueMaxStabilityDelta > 0
        ? 0
        : techniqueMaxStabilityDelta;
    newStabilityPenalty = Math.min(
      state.initialMaxStability,
      Math.max(0, newStabilityPenalty - effectiveTechniqueMaxStabilityDelta),
    );
  }

  // Apply buff per-turn state changes
  newStability += buffStabilityDelta;
  newQi = clampQi(newQi + buffPoolDelta);
  newToxicity = Math.max(0, newToxicity + buffToxicityDelta);
  if (buffMaxStabilityDelta !== 0) {
    const effectiveBuffMaxStabilityDelta =
      maxStabilitySealed && buffMaxStabilityDelta > 0
        ? 0
        : buffMaxStabilityDelta;
    newStabilityPenalty = Math.min(
      state.initialMaxStability,
      Math.max(0, newStabilityPenalty - effectiveBuffMaxStabilityDelta),
    );
  }

  // Process harmony effects for sublime crafts (runs in processTurn after technique)
  let newHarmony = state.harmony;
  let conditionGenerationHarmony = state.harmony;
  let newHarmonyData = state.harmonyData;
  if (
    consumesTurn &&
    !isItemAction &&
    config.isSublimeCraft &&
    config.craftingType &&
    (state.harmonyData || config.craftingType === 'returningCycle')
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
      barChanges = buildBarChangeEvents(
        phase.barStart.completion,
        phase.barStart.perfection,
        [
          ...phase.barContributions,
          ...techniqueBarContributions,
          ...buffBarContributions,
        ],
      );
    }
    const harmonyResult = processHarmonyEffect(
      state.harmonyData ?? { recommendedTechniqueTypes: [] },
      config.craftingType,
      skill.type,
      {
        poolCost: effectiveQiCost,
        startingMaxPool: config.maxQi,
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
    conditionGenerationHarmony =
      harmonyResult.harmonyOverride ??
      state.harmony + harmonyResult.harmonyDelta;
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
      newStability += harmonyResult.stabilityDelta;
      stabilityProjection.change(harmonyResult.stabilityDelta);
    }
    if (harmonyResult.poolDelta !== 0) {
      newQi = clampQi(newQi + harmonyResult.poolDelta);
    }
    if (config.craftingType === 'returningCycle') {
      // G:540988-540991: direct drain bypasses spend triggers, then normal
      // cleanup floors and caps the pool. Precision arrives after buff ticking.
      newQi = clampQi(Math.floor(newQi));
      if (harmonyResult.precisionStacksAdded) {
        upsertBuffIntoMap(
          newBuffs,
          RETURNED_PRECISION,
          harmonyResult.precisionStacksAdded,
        );
      }
    }
    if (harmonyResult.stabilityPenaltyDelta !== 0) {
      stabilityProjection.change(0, harmonyResult.stabilityPenaltyDelta);
      newStabilityPenalty += harmonyResult.stabilityPenaltyDelta;
      newStabilityPenalty = Math.min(
        newStabilityPenalty,
        state.initialMaxStability,
      );
    }
  }

  const cleanedStability = stabilityProjection.finish(
    state.initialMaxStability,
    !skill.preventsMaxStabilityDecay || hasSealedMaxStabilityBuff(newBuffs),
    consumesTurn,
  );
  newStability = cleanedStability.stability;
  newStabilityPenalty = cleanedStability.penalty;
  if (recordBarChanges && !consumesTurn) {
    phase.barContributions.push(
      ...(gains.barContributions?.length
        ? scaleBarContributions(
            gains.barContributions,
            gains.completion,
            gains.perfection,
          )
        : synthesizeBarContributions(gains.completion, gains.perfection)),
      ...buffBarContributions,
    );
  }
  const nextConsumedPillsThisTurn = consumesTurn
    ? 0
    : state.consumedPillsThisTurn + (isItemAction ? 1 : 0);
  const propagatedMaxPool = buffsCanChangeMaxPool(newBuffs)
    ? getEffectiveMaxPool(
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
      )
    : Math.max(1, config.maxQi);
  // No pre-payment phase reads nativeVariables: only the initial availability
  // gate and the completed action's export use them. Refresh aliases once at
  // that boundary, including names removed by mastery effects, not per mastery.
  const propagatedNativeVariables = phase.masteryPhase
    ? state.nativeVariables
    : propagateNativeVariablesAfterAction(
        phase.nativeSource ?? state,
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
    qiDroplets: state.qiDroplets,
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
    conditionGenerationHarmony,
    harmonyData: newHarmonyData,
    step: nextStep,
    completionBonus: newCompletionBonus,
    nativeVariables: propagatedNativeVariables,
    history: phase.masteryPhase
      ? phase.barStart.history
      : [...phase.barStart.history, skill.name],
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
