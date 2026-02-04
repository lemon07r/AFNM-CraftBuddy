/**
 * CraftBuddy - Optimizer Module Exports
 * 
 * This module provides crafting optimization algorithms that work with
 * values read from the game API (not hardcoded defaults).
 */

export { CraftingState, BuffType, createStateFromGame } from './state';
export type { CraftingStateData } from './state';

export {
  DEFAULT_SKILLS,
  DEFAULT_CONFIG,
  applySkill,
  canApplySkill,
  getAvailableSkills,
  calculateSkillGains,
  isTerminalState,
} from './skills';
export type { SkillDefinition, SkillGains, OptimizerConfig } from './skills';

export {
  findBestSkill,
  greedySearch,
  lookaheadSearch,
} from './search';
export type { SkillRecommendation, SearchResult, CraftingConditionType } from './search';
