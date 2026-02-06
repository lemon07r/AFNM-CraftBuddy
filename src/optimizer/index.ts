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
} from './skills';
export type { SkillDefinition, SkillGains, OptimizerConfig, SkillMastery, SkillBlockedReason } from './skills';

export {
  findBestSkill,
  greedySearch,
  lookaheadSearch,
} from './search';
export type { SkillRecommendation, SearchResult, CraftingConditionType, SearchConfig } from './search';

// Game-accurate type exports
export {
  evaluateScaling,
  calculateExpectedCritMultiplier,
  getConditionEffects,
  getBonusAndChance,
  EXPONENTIAL_SCALING_FACTOR,
} from './gameTypes';
export type {
  CraftingCondition,
  TechniqueType,
  RecipeConditionEffectType,
  HarmonyType,
  HarmonyData,
  Scaling,
  ScalingVariables,
  ConditionEffect,
  TechniqueDefinition,
  TechniqueEffect,
  TechniqueMastery,
  BuffDefinition,
  BuffEffect,
  ActiveBuff,
} from './gameTypes';
