/**
 * CraftBuddy - Optimizer Module Exports
 *
 * This module provides crafting optimization algorithms that work with
 * values read from the game API (not hardcoded defaults).
 *
 * Now includes game-accurate mechanics based on CraftingStuff source code.
 */

export {
  CraftingState,
  BuffType,
  createStateFromGame,
  buildScalingVariables,
} from './state';
export type {
  CraftingStateData,
  TrackedBuff,
  CreateStateOptions,
} from './state';

export {
  DEFAULT_SKILLS,
  DEFAULT_CONFIG,
  applySkill,
  canApplySkill,
  getAvailableSkills,
  techniqueDisplayName,
  calculateSkillGains,
  isTerminalState,
  getEffectiveQiCost,
  getEffectiveStabilityCost,
  getBlockedSkillReasons,
  getConditionEffectsForConfig,
  setNativeCanUseActionProvider,
} from './skills';
export type {
  SkillDefinition,
  SkillGains,
  OptimizerConfig,
  SkillMastery,
  SkillBlockedReason,
  NativeCanUseActionContext,
  NativeCanUseActionProvider,
} from './skills';

export {
  findBestSkill,
  greedySearch,
  lookaheadSearch,
  normalizeForecastConditionQueue,
  setConditionTransitionProvider,
  VISIBLE_CONDITION_QUEUE_LENGTH,
} from './search';
export type {
  SkillRecommendation,
  SearchResult,
  CraftingConditionType,
  SearchConfig,
  ConditionTransitionProvider,
  OutcomeBarStatus,
  OutcomeProjection,
  SetupForHint,
} from './search';

// Conjunctive outcome evaluator: the single authority on band
// thresholds, tier requirements and the auto-finish predicate. Presentation and
// runtime code must consume these instead of recomputing any of them.
export {
  deriveOutcomeBands,
  buildOutcomeBands,
  classifyOutcome,
  bandThreshold,
  tierForBands,
  tierRank,
  willAutoFinish,
  BAND_GROWTH_RATIO,
  OUTCOME_TIER_ORDER,
  TIER_REQUIREMENTS,
} from './outcome';
export type {
  OutcomeTier,
  OutcomeBands,
  OutcomeBandParams,
  OutcomeClassification,
  TierRequirement,
} from './outcome';

// Harmony system exports
export {
  processHarmonyEffect,
  initHarmonyData,
  getHarmonyStatModifiers,
  getHarmonyCostMultipliers,
  clampForgeHeat,
  getForgeRecommendedTechniqueTypes,
  INSCRIBED_PATTERN_BLOCK,
} from './harmony';
export type {
  BarChangeEvent,
  HarmonyEffectResult,
  HarmonyStatModifiers,
  HarmonyProcessContext,
  HarmonyCostMultipliers,
} from './harmony';

// Harmony registry: static per-harmony data
export {
  HARMONY_TYPES,
  FORMLESS_HARMONY,
  DEFAULT_STARTING_HARMONY,
  BODY_FORGING_STARTING_HARMONY,
  isHarmonyType,
  normalizeHarmonyType,
  getHarmonyDefinition,
  getComplexityMultiplier,
  applyComplexityMultiplier,
  removeComplexityMultiplier,
  resolveStartingHarmony,
} from './harmonyRegistry';
export type { HarmonyDefinition } from './harmonyRegistry';

// Native-runtime bridges. Exported so `src/modContent/*` never reaches past
// this facade: the search already depends on both, so this adds no coupling.
export { preloadNativeMctsPolicyEngine } from './nativeMcts';
export { buildCanonicalNativeVariables } from './nativeVariables';

// Cross-step transposition cache: one instance per search backend, scoped by
// the caller's craft/config signature.
export { CrossStepSearchCache } from './crossStepCache';
export type { TranspositionCache } from './crossStepCache';

// Game-accurate type exports
export {
  evaluateScaling,
  calculateExpectedCritMultiplier,
  getConditionEffects,
  getBonusAndChance,
  parseRecipeConditionEffects,
  EXPONENTIAL_SCALING_FACTOR,
  setNativeCraftingUtils,
} from './gameTypes';
export type {
  CraftingCondition,
  TechniqueType,
  RecipeConditionEffectType,
  HarmonyType,
  HarmonyData,
  ForgeWorksData,
  AlchemicalArtsData,
  InscribedPatternsData,
  ResonanceData,
  EnhancingEchoData,
  EccentricDecreeData,
  Scaling,
  ScalingVariables,
  ConditionEffect,
  TechniqueDefinition,
  TechniqueEffect,
  TechniqueMastery,
  BuffDefinition,
  BuffEffect,
  ActiveBuff,
  NativeCraftingUtils,
} from './gameTypes';
