/**
 * CraftBuddy - Optimizer Module Exports
 *
 * This module provides crafting optimization algorithms that work with
 * values read from the game API (not hardcoded defaults).
 *
 * Now includes game-accurate mechanics based on CraftingStuff source code.
 */

export { CraftingState, BuffType, createStateFromGame, buildScalingVariables } from './state';
export type { CraftingStateData, TrackedBuff, CreateStateOptions } from './state';

export {
  DEFAULT_SKILLS,
  DEFAULT_CONFIG,
  applySkill,
  canApplySkill,
  getAvailableSkills,
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
} from './search';

// Harmony system exports
export {
  processHarmonyEffect,
  initHarmonyData,
  getHarmonyStatModifiers,
  INSCRIBED_PATTERN_BLOCK,
} from './harmony';

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
