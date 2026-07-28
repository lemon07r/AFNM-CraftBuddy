import { CraftingState, TrackedBuff } from './state';
import {
  getConditionEffectsForConfig,
  OptimizerConfig,
  SkillDefinition,
  SkillMastery,
} from './skills';
import type {
  BuffDefinition,
  ConditionEffect,
  HarmonyData,
  TechniqueEffect,
  TechniqueType,
} from './gameTypes';

declare const process:
  | {
      env?: Record<string, string | undefined>;
    }
  | undefined;
declare const require:
  | ((modulePath: string) => NativeMctsModule | Record<string, unknown>)
  | undefined;

const FINISH_CRAFT_KEY = '__finish_craft__';
const CANONICAL_CONDITIONS = [
  'neutral',
  'positive',
  'negative',
  'veryPositive',
  'veryNegative',
] as const;

export interface NativeMctsSearchOptions {
  iterations?: number;
  rolloutDepth?: number;
  exploration?: number;
  seed?: number;
  maxNodes?: number;
  timeBudgetMs?: number;
}

interface NativeMctsInput {
  state: NativeMctsState;
  config: NativeMctsConfig;
  skills: NativeMctsSkill[];
  target_completion: number;
  target_perfection: number;
  current_condition: string;
  forecasted_conditions: string[];
  condition_effects: Record<string, NativeConditionEffectSummary>;
  search: {
    iterations: number;
    rollout_depth: number;
    exploration: number;
    seed: number;
    max_nodes: number;
  };
}

interface NativeMctsState {
  qi: number;
  stability: number;
  initial_max_stability: number;
  stability_penalty: number;
  completion: number;
  perfection: number;
  crit_chance: number;
  crit_multiplier: number;
  success_chance_bonus: number;
  pool_cost_flat: number;
  pool_cost_percentage: number;
  stability_cost_percentage: number;
  control_buff_turns: number;
  intensity_buff_turns: number;
  control_buff_multiplier: number;
  intensity_buff_multiplier: number;
  toxicity: number;
  max_toxicity: number;
  harmony: number;
  harmony_data: NativeHarmonyData;
  cooldowns: number[];
  completion_bonus: number;
  step: number;
  /** Generic active buffs, mirroring `CraftingState.buffs` insertion order. */
  buffs: NativeTrackedBuff[];
  /** Remaining craft-usable item counts, mirroring `CraftingState.items`. */
  items: NativeItemStack[];
  consumed_pills_this_turn: number;
}

/**
 * Generic active buff crossing the bridge.
 *
 * `definition` is handed over verbatim (camelCase game shape) so the Rust
 * effect-tree evaluator sees exactly the payload `src/optimizer/skills.ts`
 * evaluates; converting it field by field would be a second model to keep in
 * sync.
 */
interface NativeTrackedBuff {
  key: string;
  name: string;
  stacks: number;
  definition?: BuffDefinition;
}

interface NativeItemStack {
  key: string;
  count: number;
}

interface NativeMctsConfig {
  max_qi: number;
  max_stability: number;
  max_completion?: number;
  max_perfection?: number;
  base_intensity: number;
  base_control: number;
  min_stability: number;
  default_buff_multiplier: number;
  max_toxicity: number;
  crafting_type?: string;
  is_sublime_craft: boolean;
  target_multiplier: number;
  training_mode: boolean;
  goal_priority_bias: number;
  /**
   * Unilateral overcraft extras scoring (RUNTIME_EVIDENCE section 12).
   * Mirrors `SearchConfig.overcraftAmbition`; defaults on in the engine when
   * the bridge omits it.
   */
  overcraft_ambition?: boolean;
  /**
   * Config-level targets. Distinct from the input-level `target_completion` /
   * `target_perfection`: the config pair seeds the `maxcompletion` /
   * `maxperfection` scaling variables, while the input pair drives the
   * completion-bonus recomputation. `src/optimizer/skills.ts` reads them from
   * two different places, so the bridge must carry both.
   */
  target_completion: number;
  target_perfection: number;
  pills_per_round: number;
}

interface NativeMctsSkill {
  name: string;
  key: string;
  technique_type: string;
  action_kind: string;
  qi_cost: number;
  stability_cost: number;
  success_chance: number;
  base_completion_gain: number;
  base_perfection_gain: number;
  stability_gain: number;
  max_stability_change: number;
  buff_type: number;
  buff_duration: number;
  buff_multiplier: number;
  scales_with_control: boolean;
  scales_with_intensity: boolean;
  prevents_max_stability_decay: boolean;
  toxicity_cost: number;
  toxicity_cleanse: number;
  cooldown: number;
  restores_qi: boolean;
  qi_restore: number;
  restores_max_stability_to_full: boolean;
  consumes_turn: boolean;
  condition_requirement?: string;
  /** Authoritative game effect tree, passed through verbatim. */
  effects?: TechniqueEffect[];
  /** Raw mastery entries, passed through verbatim for conditional masteries. */
  mastery_entries?: Array<Record<string, unknown>>;
  /** Pre-resolved mastery bonuses (cost reductions and flat stat bonuses). */
  mastery?: SkillMastery;
  granted_buff?: BuffDefinition;
  is_disciplined_touch: boolean;
  buff_requirement?: { buff_name: string; amount: number };
  buff_cost?: { buff_name: string; amount?: number; consume_all: boolean };
  item_name?: string;
  reagent_only_at_step_zero: boolean;
}

interface NativeConditionEffectSummary {
  control_multiplier: number;
  intensity_multiplier: number;
  pool_cost_multiplier: number;
  stability_cost_multiplier: number;
  success_chance_bonus: number;
}

interface NativeHarmonyData {
  forge_works?: NativeForgeWorksData;
  alchemical_arts?: NativeAlchemicalArtsData;
  inscribed_patterns?: NativeInscribedPatternsData;
  resonance?: NativeResonanceData;
  enhancing_echo?: NativeEnhancingEchoData;
  eccentric_decree?: NativeEccentricDecreeData;
  recommended_technique_types: string[];
  alchemical_reaction_modifiers?: NativeHarmonyStatModifiers;
}

interface NativeForgeWorksData {
  heat: number;
  last_buffed_heat?: number;
}

interface NativeEnhancingEchoData {
  attuned_type?: TechniqueType;
  last_outcome?: string;
}

interface NativeEccentricDecreeData {
  focused_bar: string;
  last_completion: number;
  last_perfection: number;
}

interface NativeAlchemicalArtsData {
  charges: TechniqueType[];
  last_combo: TechniqueType[];
}

interface NativeInscribedPatternsData {
  current_block: TechniqueType[];
  completed_blocks: number;
  stacks: number;
}

interface NativeResonanceData {
  resonance?: TechniqueType;
  strength: number;
  pending_resonance?: TechniqueType;
  pending_count: number;
}

interface NativeHarmonyStatModifiers {
  control_multiplier?: number;
  intensity_multiplier?: number;
  crit_chance_bonus?: number;
  success_chance_bonus?: number;
  pool_cost_percentage?: number;
  stability_cost_percentage?: number;
}

interface RawNativeMctsSkillPolicy {
  key: string;
  name: string;
  visits: number;
  policy: number;
  average_score: number;
  best_score: number;
}

interface RawNativeMctsResult {
  backend: string;
  iterations: number;
  nodes: number;
  rollout_depth: number;
  best_skill_key?: string;
  best_skill_name?: string;
  skill_policies: RawNativeMctsSkillPolicy[];
}

interface NativeMctsModule {
  runMcts?: (input: NativeMctsInput) => RawNativeMctsResult;
}

export interface NativeMctsPolicy {
  backend: string;
  iterations: number;
  nodes: number;
  rolloutDepth: number;
  bestSkillKey?: string;
  bestSkillName?: string;
  policyBySkillKey: Map<string, RawNativeMctsSkillPolicy>;
  orderedPolicies: RawNativeMctsSkillPolicy[];
}

let cachedNativeModule: NativeMctsModule | null | undefined;
let warnedNativeLoadFailure = false;
let warnedNativeRunFailure = false;

function normalizeConditionForMcts(condition: string | undefined): string {
  const normalized = String(condition || '').toLowerCase();
  switch (normalized) {
    case 'verypositive':
    case 'very_positive':
    case 'excellent':
    case 'brilliant':
      return 'veryPositive';
    case 'verynegative':
    case 'very_negative':
    case 'corrupted':
      return 'veryNegative';
    case 'positive':
    case 'harmonious':
      return 'positive';
    case 'negative':
    case 'resistant':
      return 'negative';
    case 'neutral':
    case 'balanced':
    case '':
      return 'neutral';
    default:
      return normalized;
  }
}

function finiteNumber(value: unknown, fallback: number = 0): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function optionalFiniteNumber(value: unknown): number | undefined {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : undefined;
}

/**
 * Deep-copies verbatim game data, dropping every `null` and `undefined`.
 *
 * `serde` treats an explicit `null` as a *present* value, so a `null` on a
 * non-optional engine field - `mastery`, `effects`, `masteryEntries` - fails
 * the whole `MctsInput` deserialization and silently costs the search its
 * native prior, while an *absent* key falls back to `#[serde(default)]`. Game
 * objects and replay snapshots both use `null` for "no value", so the
 * difference is normalized here, at the one boundary that crosses into Rust.
 */
function stripNullish<T>(value: T): T | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  if (Array.isArray(value)) {
    return value
      .map((entry: unknown) => stripNullish(entry))
      .filter((entry: unknown) => entry !== undefined) as T;
  }
  if (typeof value === 'object') {
    const cleaned: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(
      value as Record<string, unknown>,
    )) {
      const cleanedEntry = stripNullish(entry);
      if (cleanedEntry !== undefined) {
        cleaned[key] = cleanedEntry;
      }
    }
    return cleaned as T;
  }
  return value;
}

function actionConsumesTurn(skill: SkillDefinition): boolean {
  return skill.consumesTurn !== undefined
    ? skill.consumesTurn
    : skill.actionKind !== 'item';
}

function summarizeConditionEffects(
  effects: ConditionEffect[],
): NativeConditionEffectSummary {
  const summary: NativeConditionEffectSummary = {
    control_multiplier: 1,
    intensity_multiplier: 1,
    pool_cost_multiplier: 1,
    stability_cost_multiplier: 1,
    success_chance_bonus: 0,
  };

  for (const effect of effects) {
    if (!effect) continue;
    if (effect.kind === 'control' && effect.multiplier !== undefined) {
      summary.control_multiplier *= 1 + effect.multiplier;
    } else if (effect.kind === 'intensity' && effect.multiplier !== undefined) {
      summary.intensity_multiplier *= 1 + effect.multiplier;
    } else if (effect.kind === 'pool' && effect.multiplier !== undefined) {
      summary.pool_cost_multiplier *= effect.multiplier;
    } else if (effect.kind === 'stability' && effect.multiplier !== undefined) {
      summary.stability_cost_multiplier *= effect.multiplier;
    } else if (effect.kind === 'chance' && effect.bonus !== undefined) {
      summary.success_chance_bonus += effect.bonus;
    }
  }

  return summary;
}

function convertHarmonyStatModifiers(
  value: unknown,
): NativeHarmonyStatModifiers | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }
  const source = value as Record<string, unknown>;
  const converted: NativeHarmonyStatModifiers = {};
  const controlMultiplier = optionalFiniteNumber(source.controlMultiplier);
  const intensityMultiplier = optionalFiniteNumber(source.intensityMultiplier);
  const critChanceBonus = optionalFiniteNumber(source.critChanceBonus);
  const successChanceBonus = optionalFiniteNumber(source.successChanceBonus);
  const poolCostPercentage = optionalFiniteNumber(source.poolCostPercentage);
  const stabilityCostPercentage = optionalFiniteNumber(
    source.stabilityCostPercentage,
  );
  if (controlMultiplier !== undefined) {
    converted.control_multiplier = controlMultiplier;
  }
  if (intensityMultiplier !== undefined) {
    converted.intensity_multiplier = intensityMultiplier;
  }
  if (critChanceBonus !== undefined) {
    converted.crit_chance_bonus = critChanceBonus;
  }
  if (successChanceBonus !== undefined) {
    converted.success_chance_bonus = successChanceBonus;
  }
  if (poolCostPercentage !== undefined) {
    converted.pool_cost_percentage = poolCostPercentage;
  }
  if (stabilityCostPercentage !== undefined) {
    converted.stability_cost_percentage = stabilityCostPercentage;
  }
  return Object.keys(converted).length > 0 ? converted : undefined;
}

function convertHarmonyData(
  harmonyData: HarmonyData | undefined,
): NativeHarmonyData {
  const additionalData = harmonyData?.additionalData as
    | Record<string, unknown>
    | undefined;
  return {
    forge_works: harmonyData?.forgeWorks
      ? {
          heat: harmonyData.forgeWorks.heat,
          last_buffed_heat: harmonyData.forgeWorks.lastBuffedHeat,
        }
      : undefined,
    alchemical_arts: harmonyData?.alchemicalArts
      ? {
          charges: [...harmonyData.alchemicalArts.charges],
          last_combo: [...harmonyData.alchemicalArts.lastCombo],
        }
      : undefined,
    inscribed_patterns: harmonyData?.inscribedPatterns
      ? {
          current_block: [...harmonyData.inscribedPatterns.currentBlock],
          completed_blocks: harmonyData.inscribedPatterns.completedBlocks,
          stacks: harmonyData.inscribedPatterns.stacks,
        }
      : undefined,
    resonance: harmonyData?.resonance
      ? {
          resonance: harmonyData.resonance.resonance,
          strength: harmonyData.resonance.strength,
          pending_resonance: harmonyData.resonance.pendingResonance,
          pending_count: harmonyData.resonance.pendingCount,
        }
      : undefined,
    enhancing_echo: harmonyData?.enhancingEcho
      ? {
          attuned_type: harmonyData.enhancingEcho.attunedType,
          last_outcome: harmonyData.enhancingEcho.lastOutcome,
        }
      : undefined,
    eccentric_decree: harmonyData?.eccentricDecree
      ? {
          focused_bar: harmonyData.eccentricDecree.focusedBar,
          last_completion: harmonyData.eccentricDecree.lastCompletion,
          last_perfection: harmonyData.eccentricDecree.lastPerfection,
        }
      : undefined,
    recommended_technique_types: [
      ...(harmonyData?.recommendedTechniqueTypes || []),
    ],
    alchemical_reaction_modifiers: convertHarmonyStatModifiers(
      additionalData?.alchemicalReactionModifiers,
    ),
  };
}

function deriveMctsIterations(options: NativeMctsSearchOptions): number {
  if (options.iterations !== undefined) {
    return Math.max(1, Math.floor(options.iterations));
  }
  const timeBudget = finiteNumber(options.timeBudgetMs, 2000);
  const maxNodes = finiteNumber(options.maxNodes, 750000);
  return Math.max(
    64,
    Math.min(30000, Math.floor(Math.min(maxNodes / 35, timeBudget / 3))),
  );
}

function buildConditionEffectMap(
  config: OptimizerConfig,
  currentConditionType: string | undefined,
  forecastedConditionTypes: string[],
): Record<string, NativeConditionEffectSummary> {
  const conditionSet = new Set<string>();
  for (const condition of CANONICAL_CONDITIONS) {
    conditionSet.add(condition);
  }
  conditionSet.add(normalizeConditionForMcts(currentConditionType));
  for (const condition of forecastedConditionTypes) {
    conditionSet.add(normalizeConditionForMcts(condition));
  }

  const result: Record<string, NativeConditionEffectSummary> = {};
  conditionSet.forEach((condition) => {
    result[condition] = summarizeConditionEffects(
      getConditionEffectsForConfig(config, condition),
    );
  });
  return result;
}

function convertTrackedBuffs(
  buffs: ReadonlyMap<string, TrackedBuff>,
): NativeTrackedBuff[] {
  const converted: NativeTrackedBuff[] = [];
  buffs.forEach((tracked, key) => {
    if (!Number.isFinite(tracked.stacks)) return;
    converted.push({
      key,
      name: tracked.name || key,
      stacks: Math.floor(tracked.stacks),
      definition: tracked.definition,
    });
  });
  return converted;
}

function convertItemStacks(
  items: ReadonlyMap<string, number>,
): NativeItemStack[] {
  const converted: NativeItemStack[] = [];
  items.forEach((count, key) => {
    if (!Number.isFinite(count)) return;
    converted.push({ key, count: Math.floor(count) });
  });
  return converted;
}

function buildNativeSkill(skill: SkillDefinition): NativeMctsSkill {
  return {
    name: skill.name,
    key: skill.key,
    technique_type: skill.type || 'support',
    action_kind: skill.actionKind || 'skill',
    qi_cost: finiteNumber(skill.qiCost),
    stability_cost: finiteNumber(skill.stabilityCost),
    success_chance: finiteNumber(skill.successChance, 1),
    base_completion_gain: finiteNumber(skill.baseCompletionGain),
    base_perfection_gain: finiteNumber(skill.basePerfectionGain),
    stability_gain: finiteNumber(skill.stabilityGain),
    max_stability_change: finiteNumber(skill.maxStabilityChange),
    buff_type: finiteNumber(skill.buffType),
    buff_duration: finiteNumber(skill.buffDuration),
    buff_multiplier: finiteNumber(skill.buffMultiplier, 1),
    scales_with_control: skill.scalesWithControl === true,
    scales_with_intensity: skill.scalesWithIntensity === true,
    prevents_max_stability_decay: skill.preventsMaxStabilityDecay === true,
    toxicity_cost: finiteNumber(skill.toxicityCost),
    toxicity_cleanse: finiteNumber(skill.toxicityCleanse),
    cooldown: finiteNumber(skill.cooldown),
    restores_qi: skill.restoresQi === true,
    qi_restore: finiteNumber(skill.qiRestore),
    restores_max_stability_to_full: skill.restoresMaxStabilityToFull === true,
    consumes_turn: actionConsumesTurn(skill),
    condition_requirement: skill.conditionRequirement
      ? normalizeConditionForMcts(String(skill.conditionRequirement))
      : undefined,
    effects: stripNullish(skill.effects),
    mastery_entries: stripNullish(skill.masteryEntries) as
      | Array<Record<string, unknown>>
      | undefined,
    mastery: stripNullish(skill.mastery),
    granted_buff: stripNullish(skill.grantedBuff),
    is_disciplined_touch: skill.isDisciplinedTouch === true,
    buff_requirement: skill.buffRequirement
      ? {
          buff_name: skill.buffRequirement.buffName,
          amount: finiteNumber(skill.buffRequirement.amount),
        }
      : undefined,
    buff_cost: skill.buffCost
      ? {
          buff_name: skill.buffCost.buffName,
          amount: optionalFiniteNumber(skill.buffCost.amount),
          consume_all: skill.buffCost.consumeAll === true,
        }
      : undefined,
    item_name: skill.itemName ?? undefined,
    reagent_only_at_step_zero: skill.reagentOnlyAtStepZero === true,
  };
}

export function buildNativeMctsInput(params: {
  state: CraftingState;
  config: OptimizerConfig;
  targetCompletion: number;
  targetPerfection: number;
  currentConditionType?: string;
  forecastedConditionTypes?: string[];
  goalPriorityBias?: number;
  overcraftAmbition?: boolean;
  search?: NativeMctsSearchOptions;
}): NativeMctsInput {
  const {
    state,
    config,
    targetCompletion,
    targetPerfection,
    currentConditionType,
    forecastedConditionTypes = [],
    goalPriorityBias = 0,
    overcraftAmbition = true,
    search = {},
  } = params;
  // Item (pill/reagent) actions are part of the searchable action space: the
  // Rust engine models them, so filtering them out here would hand the native
  // prior a strictly smaller action space than the TypeScript search.
  const skills = config.skills || [];

  return {
    state: {
      qi: finiteNumber(state.qi),
      stability: finiteNumber(state.stability),
      initial_max_stability: finiteNumber(state.initialMaxStability, 60),
      stability_penalty: finiteNumber(state.stabilityPenalty),
      completion: finiteNumber(state.completion),
      perfection: finiteNumber(state.perfection),
      crit_chance: finiteNumber(state.critChance),
      crit_multiplier: finiteNumber(state.critMultiplier, 150),
      success_chance_bonus: finiteNumber(state.successChanceBonus),
      pool_cost_flat: finiteNumber(state.poolCostFlat),
      pool_cost_percentage: finiteNumber(state.poolCostPercentage, 100),
      stability_cost_percentage: finiteNumber(
        state.stabilityCostPercentage,
        100,
      ),
      control_buff_turns: finiteNumber(state.controlBuffTurns),
      intensity_buff_turns: finiteNumber(state.intensityBuffTurns),
      control_buff_multiplier: finiteNumber(state.controlBuffMultiplier, 1.4),
      intensity_buff_multiplier: finiteNumber(
        state.intensityBuffMultiplier,
        1.4,
      ),
      toxicity: finiteNumber(state.toxicity),
      max_toxicity: finiteNumber(state.maxToxicity),
      harmony: finiteNumber(state.harmony),
      harmony_data: convertHarmonyData(state.harmonyData),
      cooldowns: skills.map((skill) =>
        finiteNumber(state.getCooldown(skill.key)),
      ),
      completion_bonus: finiteNumber(state.completionBonus),
      step: finiteNumber(state.step),
      buffs: convertTrackedBuffs(state.buffs),
      items: convertItemStacks(state.items),
      consumed_pills_this_turn: finiteNumber(state.consumedPillsThisTurn),
    },
    config: {
      max_qi: finiteNumber(config.maxQi),
      max_stability: finiteNumber(config.maxStability, 60),
      max_completion: optionalFiniteNumber(config.maxCompletion),
      max_perfection: optionalFiniteNumber(config.maxPerfection),
      base_intensity: finiteNumber(config.baseIntensity),
      base_control: finiteNumber(config.baseControl),
      min_stability: finiteNumber(config.minStability),
      default_buff_multiplier: finiteNumber(config.defaultBuffMultiplier, 1.4),
      max_toxicity: finiteNumber(config.maxToxicity),
      crafting_type: config.craftingType,
      is_sublime_craft: config.isSublimeCraft === true,
      target_multiplier: finiteNumber(config.targetMultiplier, 2),
      training_mode: config.trainingMode === true,
      goal_priority_bias: finiteNumber(goalPriorityBias),
      overcraft_ambition: overcraftAmbition,
      target_completion: finiteNumber(config.targetCompletion),
      target_perfection: finiteNumber(config.targetPerfection),
      pills_per_round: Math.max(
        1,
        Math.floor(finiteNumber(config.pillsPerRound, 1)),
      ),
    },
    skills: skills.map(buildNativeSkill),
    target_completion: finiteNumber(targetCompletion),
    target_perfection: finiteNumber(targetPerfection),
    current_condition: normalizeConditionForMcts(currentConditionType),
    forecasted_conditions: forecastedConditionTypes.map(
      normalizeConditionForMcts,
    ),
    condition_effects: buildConditionEffectMap(
      config,
      currentConditionType,
      forecastedConditionTypes,
    ),
    search: {
      iterations: deriveMctsIterations(search),
      rollout_depth: Math.max(
        1,
        Math.min(96, finiteNumber(search.rolloutDepth, 32)),
      ),
      exploration: Math.max(0, finiteNumber(search.exploration, 1.15)),
      seed: Math.max(0, Math.floor(finiteNumber(search.seed))),
      max_nodes: Math.max(
        100,
        Math.floor(finiteNumber(search.maxNodes, 50000)),
      ),
    },
  };
}

function isJestRuntime(): boolean {
  return (
    typeof process !== 'undefined' &&
    process?.env?.JEST_WORKER_ID !== undefined &&
    process?.env?.CRAFTBUDDY_ENABLE_WASM_MCTS_TESTS !== '1'
  );
}

function loadNativeMctsModule(): NativeMctsModule | null {
  if (cachedNativeModule !== undefined) {
    return cachedNativeModule;
  }

  if (isJestRuntime()) {
    cachedNativeModule = null;
    return cachedNativeModule;
  }

  try {
    if (typeof require !== 'function') {
      throw new Error('CommonJS require is unavailable');
    }
    const loaded = require('./wasm/generated/craftbuddy_engine_inline.js');
    cachedNativeModule =
      loaded && typeof loaded.runMcts === 'function'
        ? (loaded as NativeMctsModule)
        : null;
  } catch (error) {
    cachedNativeModule = null;
    if (!warnedNativeLoadFailure) {
      console.warn(
        '[CraftBuddy] Native WASM MCTS engine unavailable; using TypeScript search only.',
        error,
      );
      warnedNativeLoadFailure = true;
    }
  }

  return cachedNativeModule;
}

export function preloadNativeMctsPolicyEngine(): void {
  if (!isJestRuntime()) {
    loadNativeMctsModule();
  }
}

function normalizeNativeMctsResult(
  raw: RawNativeMctsResult,
  validSkillKeys: ReadonlySet<string>,
): NativeMctsPolicy | null {
  if (!raw || !Array.isArray(raw.skill_policies)) {
    return null;
  }
  const orderedPolicies = raw.skill_policies
    .filter((policy) => {
      if (!policy || typeof policy.key !== 'string') return false;
      if (policy.key !== FINISH_CRAFT_KEY && !validSkillKeys.has(policy.key)) {
        return false;
      }
      return (
        Number.isFinite(policy.visits) &&
        Number.isFinite(policy.policy) &&
        Number.isFinite(policy.average_score)
      );
    })
    .map((policy) => ({ ...policy }))
    .sort((a, b) => b.policy - a.policy || a.key.localeCompare(b.key));

  if (orderedPolicies.length === 0) {
    return null;
  }

  const policyBySkillKey = new Map<string, RawNativeMctsSkillPolicy>();
  for (const policy of orderedPolicies) {
    policyBySkillKey.set(policy.key, policy);
  }

  return {
    backend: raw.backend || 'rust-wasm',
    iterations: finiteNumber(raw.iterations),
    nodes: finiteNumber(raw.nodes),
    rolloutDepth: finiteNumber(raw.rollout_depth),
    bestSkillKey: raw.best_skill_key,
    bestSkillName: raw.best_skill_name,
    policyBySkillKey,
    orderedPolicies,
  };
}

export function getNativeMctsPolicy(params: {
  state: CraftingState;
  config: OptimizerConfig;
  targetCompletion: number;
  targetPerfection: number;
  currentConditionType?: string;
  forecastedConditionTypes?: string[];
  goalPriorityBias?: number;
  overcraftAmbition?: boolean;
  search?: NativeMctsSearchOptions;
}): NativeMctsPolicy | null {
  const nativeModule = loadNativeMctsModule();
  if (!nativeModule?.runMcts) {
    return null;
  }

  try {
    const input = buildNativeMctsInput(params);
    const validSkillKeys = new Set<string>(
      (params.config.skills || []).map((skill) => skill.key),
    );
    const raw = nativeModule.runMcts(input);
    return normalizeNativeMctsResult(raw, validSkillKeys);
  } catch (error) {
    if (!warnedNativeRunFailure) {
      console.warn(
        '[CraftBuddy] Native WASM MCTS policy failed; using TypeScript search only.',
        error,
      );
      warnedNativeRunFailure = true;
    }
    return null;
  }
}

export const __testing = {
  buildNativeMctsInput,
  deriveMctsIterations,
  normalizeConditionForMcts,
  summarizeConditionEffects,
  convertHarmonyData,
} as const;
