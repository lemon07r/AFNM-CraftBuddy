/**
 * CraftBuddy - Search Algorithms
 * 
 * Implements greedy and lookahead search algorithms to find the optimal
 * next skill to use during crafting.
 */

import { CraftingState } from './state';
import {
  SkillDefinition,
  OptimizerConfig,
  applySkill,
  getAvailableSkills,
  calculateSkillGains,
  isTerminalState,
} from './skills';

export interface SkillRecommendation {
  skill: SkillDefinition;
  expectedGains: {
    completion: number;
    perfection: number;
    stability: number;
  };
  score: number;
  reasoning: string;
}

export interface SearchResult {
  recommendation: SkillRecommendation | null;
  alternativeSkills: SkillRecommendation[];
  isTerminal: boolean;
  targetsMet: boolean;
}

/**
 * Score a state based on progress toward targets.
 * 
 * Scoring priorities:
 * 1. Progress toward completion and perfection targets (primary)
 * 2. Bonus for meeting both targets
 * 3. Penalty for going over targets (wasted resources)
 * 4. Small bonus for resource efficiency (qi and stability remaining)
 */
function scoreState(
  state: CraftingState,
  targetCompletion: number,
  targetPerfection: number
): number {
  if (targetCompletion === 0 && targetPerfection === 0) {
    // No targets - maximize minimum of both
    return Math.min(state.completion, state.perfection);
  }

  // Score based on progress toward targets (primary scoring)
  const compProgress = Math.min(state.completion, targetCompletion);
  const perfProgress = Math.min(state.perfection, targetPerfection);
  let score = compProgress + perfProgress;

  // Large bonus for meeting both targets - this is the goal
  const targetsMet = state.completion >= targetCompletion && state.perfection >= targetPerfection;
  if (targetsMet) {
    score += 100; // Significant bonus for achieving the goal
    
    // Additional bonus for resource efficiency when targets are met
    // Prefer paths that leave more qi and stability for safety margin
    score += state.qi * 0.01;  // Small bonus for remaining qi
    score += state.stability * 0.01;  // Small bonus for remaining stability
  }

  // Penalize going over targets (wasted resources)
  const compOver = Math.max(0, state.completion - targetCompletion);
  const perfOver = Math.max(0, state.perfection - targetPerfection);
  score -= (compOver + perfOver) * 0.5;

  // Small penalty for low stability (risky state)
  if (state.stability < 20) {
    score -= (20 - state.stability) * 0.1;
  }

  return score;
}

/**
 * Generate reasoning text for why a skill is recommended.
 */
function generateReasoning(
  skill: SkillDefinition,
  state: CraftingState,
  gains: { completion: number; perfection: number; stability: number },
  targetCompletion: number,
  targetPerfection: number
): string {
  const reasons: string[] = [];

  // Check if we need stability
  if (skill.type === 'stabilize') {
    if (state.stability <= 20) {
      reasons.push('Low stability - must restore');
    } else {
      reasons.push('Restore stability for more actions');
    }
  }

  // Check buff usage
  if (state.hasControlBuff() && skill.scalesWithControl) {
    reasons.push('Control buff active - maximize perfection');
  }
  if (state.hasIntensityBuff() && skill.scalesWithIntensity) {
    reasons.push('Intensity buff active - maximize completion');
  }

  // Check if skill grants buff
  if (skill.buffDuration > 0) {
    if (skill.buffType === 1) { // CONTROL
      reasons.push('Grants control buff for next turns');
    } else if (skill.buffType === 2) { // INTENSITY
      reasons.push('Grants intensity buff for next turns');
    }
  }

  // Check progress needs
  if (targetCompletion > 0 && targetPerfection > 0) {
    const needsCompletion = state.completion < targetCompletion;
    const needsPerfection = state.perfection < targetPerfection;

    if (gains.completion > 0 && needsCompletion) {
      reasons.push(`+${gains.completion} completion toward target`);
    }
    if (gains.perfection > 0 && needsPerfection) {
      reasons.push(`+${gains.perfection} perfection toward target`);
    }
  } else {
    if (gains.completion > 0) {
      reasons.push(`+${gains.completion} completion`);
    }
    if (gains.perfection > 0) {
      reasons.push(`+${gains.perfection} perfection`);
    }
  }

  // Disciplined Touch special case
  if (skill.isDisciplinedTouch) {
    reasons.push('Converts buffs to both completion and perfection');
  }

  return reasons.length > 0 ? reasons.join('; ') : 'Best available option';
}

/**
 * Greedy search - evaluates each skill's immediate impact.
 * Fast but may not find optimal solution.
 */
export function greedySearch(
  state: CraftingState,
  config: OptimizerConfig,
  targetCompletion: number = 0,
  targetPerfection: number = 0,
  controlCondition: number = 1.0
): SearchResult {
  // Check if targets already met
  if (targetCompletion > 0 && targetPerfection > 0) {
    if (state.targetsMet(targetCompletion, targetPerfection)) {
      return {
        recommendation: null,
        alternativeSkills: [],
        isTerminal: false,
        targetsMet: true,
      };
    }
  }

  // Check if terminal state
  if (isTerminalState(state, config)) {
    return {
      recommendation: null,
      alternativeSkills: [],
      isTerminal: true,
      targetsMet: false,
    };
  }

  const availableSkills = getAvailableSkills(state, config);
  const scoredSkills: SkillRecommendation[] = [];

  for (const skill of availableSkills) {
    const newState = applySkill(state, skill, config, controlCondition);
    if (newState === null) continue;

    const gains = calculateSkillGains(state, skill, config, controlCondition);
    const score = scoreState(newState, targetCompletion, targetPerfection);
    const reasoning = generateReasoning(skill, state, gains, targetCompletion, targetPerfection);

    scoredSkills.push({
      skill,
      expectedGains: gains,
      score,
      reasoning,
    });
  }

  // Sort by score descending
  scoredSkills.sort((a, b) => b.score - a.score);

  if (scoredSkills.length === 0) {
    return {
      recommendation: null,
      alternativeSkills: [],
      isTerminal: true,
      targetsMet: false,
    };
  }

  return {
    recommendation: scoredSkills[0],
    alternativeSkills: scoredSkills.slice(1),
    isTerminal: false,
    targetsMet: false,
  };
}

/**
 * Lookahead search with memoization.
 * Searches N moves ahead to find the best first move.
 * 
 * @param state - Current crafting state
 * @param config - Optimizer config with skills and character stats
 * @param targetCompletion - Target completion value
 * @param targetPerfection - Target perfection value
 * @param depth - How many moves to look ahead
 * @param controlCondition - Current condition multiplier
 * @param forecastedConditions - Array of upcoming condition multipliers for each depth
 */
export function lookaheadSearch(
  state: CraftingState,
  config: OptimizerConfig,
  targetCompletion: number = 0,
  targetPerfection: number = 0,
  depth: number = 3,
  controlCondition: number = 1.0,
  forecastedConditions: number[] = []
): SearchResult {
  // Check if targets already met
  if (targetCompletion > 0 && targetPerfection > 0) {
    if (state.targetsMet(targetCompletion, targetPerfection)) {
      return {
        recommendation: null,
        alternativeSkills: [],
        isTerminal: false,
        targetsMet: true,
      };
    }
  }

  // Check if terminal state
  if (isTerminalState(state, config)) {
    return {
      recommendation: null,
      alternativeSkills: [],
      isTerminal: true,
      targetsMet: false,
    };
  }

  // Memoization cache: cacheKey -> best score achievable from that state
  const cache = new Map<string, number>();

  /**
   * Recursive search function
   * Uses forecasted conditions at each depth level for more accurate simulation
   */
  function search(currentState: CraftingState, remainingDepth: number, depthIndex: number): number {
    // Base case: depth exhausted or terminal
    if (remainingDepth === 0 || isTerminalState(currentState, config)) {
      return scoreState(currentState, targetCompletion, targetPerfection);
    }

    // Check if targets met - early termination with bonus
    if (targetCompletion > 0 && targetPerfection > 0) {
      if (currentState.targetsMet(targetCompletion, targetPerfection)) {
        return scoreState(currentState, targetCompletion, targetPerfection);
      }
    }

    // Get condition multiplier for this depth from forecasted conditions
    // depthIndex 0 = current turn (use controlCondition), 1+ = future turns
    const conditionAtDepth = depthIndex < forecastedConditions.length 
      ? forecastedConditions[depthIndex] 
      : controlCondition;

    // Check cache - include condition in cache key for accuracy
    const cacheKey = `${currentState.getCacheKey()}:${currentState.completion}:${currentState.perfection}:${remainingDepth}:${conditionAtDepth}`;
    if (cache.has(cacheKey)) {
      return cache.get(cacheKey)!;
    }

    const availableSkills = getAvailableSkills(currentState, config);
    let bestScore = scoreState(currentState, targetCompletion, targetPerfection);

    for (const skill of availableSkills) {
      const newState = applySkill(currentState, skill, config, conditionAtDepth);
      if (newState === null) continue;

      const score = search(newState, remainingDepth - 1, depthIndex + 1);
      if (score > bestScore) {
        bestScore = score;
      }
    }

    cache.set(cacheKey, bestScore);
    return bestScore;
  }

  // Evaluate each first move using current condition
  const availableSkills = getAvailableSkills(state, config);
  const scoredSkills: SkillRecommendation[] = [];

  for (const skill of availableSkills) {
    const newState = applySkill(state, skill, config, controlCondition);
    if (newState === null) continue;

    const gains = calculateSkillGains(state, skill, config, controlCondition);
    // Start recursive search from depth index 1 (next turn uses first forecasted condition)
    const score = search(newState, depth - 1, 1);
    const reasoning = generateReasoning(skill, state, gains, targetCompletion, targetPerfection);

    scoredSkills.push({
      skill,
      expectedGains: gains,
      score,
      reasoning,
    });
  }

  // Sort by score descending
  scoredSkills.sort((a, b) => b.score - a.score);

  if (scoredSkills.length === 0) {
    return {
      recommendation: null,
      alternativeSkills: [],
      isTerminal: true,
      targetsMet: false,
    };
  }

  return {
    recommendation: scoredSkills[0],
    alternativeSkills: scoredSkills.slice(1),
    isTerminal: false,
    targetsMet: false,
  };
}

/**
 * Type for crafting conditions (matches game's CraftingCondition type)
 */
export type CraftingConditionType = 'neutral' | 'positive' | 'negative' | 'veryPositive' | 'veryNegative';

/**
 * Main optimizer function - uses lookahead by default.
 * 
 * @param state - Current crafting state
 * @param config - Optimizer config with character stats and skills (from game)
 * @param targetCompletion - Target completion value (from recipe)
 * @param targetPerfection - Target perfection value (from recipe)
 * @param controlCondition - Current condition multiplier for control (from game)
 * @param useGreedy - Use greedy search instead of lookahead
 * @param lookaheadDepth - How many moves to look ahead
 * @param forecastedConditionMultipliers - Array of upcoming condition multipliers (converted from game's nextConditions)
 */
export function findBestSkill(
  state: CraftingState,
  config: OptimizerConfig,
  targetCompletion: number = 0,
  targetPerfection: number = 0,
  controlCondition: number = 1.0,
  useGreedy: boolean = false,
  lookaheadDepth: number = 3,
  forecastedConditionMultipliers: number[] = []
): SearchResult {
  // Log that we're using game-provided data
  if (forecastedConditionMultipliers.length > 0) {
    console.log(`[CraftBuddy] Using ${forecastedConditionMultipliers.length} forecasted condition multipliers: ${forecastedConditionMultipliers.join(', ')}`);
  }
  
  if (useGreedy) {
    return greedySearch(state, config, targetCompletion, targetPerfection, controlCondition);
  }
  
  // Pass forecasted condition multipliers to lookahead search for accurate simulation
  return lookaheadSearch(state, config, targetCompletion, targetPerfection, lookaheadDepth, controlCondition, forecastedConditionMultipliers);
}
