/**
 * CraftBuddy - Search Algorithms
 * 
 * Implements greedy and lookahead search algorithms to find the optimal
 * next skill to use during crafting.
 * 
 * Performance optimizations:
 * - Move ordering: Search promising skills first (buff skills when no buff, high-gain skills)
 * - Memoization: Cache search results by state key with progress bucketing for large numbers
 * - Alpha-beta pruning: Cut off branches that can't improve the result
 * - Beam search: Limit branches explored at each depth level
 * - Early termination: Stop when targets are met
 * - Time budget: Prevent UI freezes with configurable time limits
 */

import { CraftingState, BuffType } from './state';
import {
  SkillDefinition,
  OptimizerConfig,
  applySkill,
  getAvailableSkills,
  calculateSkillGains,
  isTerminalState,
} from './skills';
import { debugLog } from '../utils/debug';

export interface SkillRecommendation {
  skill: SkillDefinition;
  expectedGains: {
    completion: number;
    perfection: number;
    stability: number;
  };
  score: number;
  reasoning: string;
  /** Quality rating from 0-100 based on how close to optimal this choice is */
  qualityRating?: number;
  /** Whether this skill consumes buffs for gains (e.g., Disciplined Touch) */
  consumesBuff?: boolean;
  /** Suggested follow-up skill after this one */
  followUpSkill?: {
    name: string;
    type: string;
    icon?: string;
    expectedGains: {
      completion: number;
      perfection: number;
      stability: number;
    };
  };
}

export interface SearchResult {
  recommendation: SkillRecommendation | null;
  alternativeSkills: SkillRecommendation[];
  isTerminal: boolean;
  targetsMet: boolean;
  /** Full optimal rotation (sequence of skills) to reach targets */
  optimalRotation?: string[];
  /** Expected final state if following the optimal rotation */
  expectedFinalState?: {
    completion: number;
    perfection: number;
    stability: number;
    qi: number;
    turnsRemaining: number;
  };
  /** Search performance metrics */
  searchMetrics?: {
    nodesExplored: number;
    cacheHits: number;
    timeTakenMs: number;
    depthReached: number;
    pruned: number;
  };
}

/**
 * Search configuration for performance tuning
 */
export interface SearchConfig {
  /** Maximum time budget in milliseconds (default: 100ms) */
  timeBudgetMs: number;
  /** Maximum nodes to explore before stopping (default: 50000) */
  maxNodes: number;
  /** Beam width - max branches to explore at each level (default: 8) */
  beamWidth: number;
  /** Whether to use alpha-beta pruning (default: true) */
  useAlphaBeta: boolean;
  /** Progress bucket size for cache key normalization (default: 100) */
  progressBucketSize: number;
}

/** Default search configuration */
const DEFAULT_SEARCH_CONFIG: SearchConfig = {
  timeBudgetMs: 100,
  maxNodes: 50000,
  beamWidth: 8,
  useAlphaBeta: true,
  progressBucketSize: 100,
};

/**
 * Bucket a progress value for cache key normalization.
 * Large numbers are grouped into buckets to improve cache hit rates.
 * 
 * For values < 1000: exact value (fine-grained for early game)
 * For values >= 1000: bucketed by progressBucketSize
 * 
 * This dramatically improves cache efficiency in late game where
 * completion/perfection values can be in the millions.
 */
function bucketProgress(value: number, bucketSize: number = 100): number {
  if (value < 1000) {
    return value;
  }
  return Math.floor(value / bucketSize) * bucketSize;
}

/**
 * Generate a normalized cache key that buckets large progress values.
 * This improves cache hit rates significantly in late game scenarios.
 */
function getNormalizedCacheKey(
  state: CraftingState,
  targetCompletion: number,
  targetPerfection: number,
  remainingDepth: number,
  condition: number,
  conditionType: string | undefined,
  bucketSize: number
): string {
  // For progress values, we care about:
  // 1. Whether we've met the target (exact match matters)
  // 2. How far we are from the target (bucketed for large values)
  const compMet = state.completion >= targetCompletion;
  const perfMet = state.perfection >= targetPerfection;
  
  // If targets are met, we don't need fine-grained progress tracking
  const compKey = compMet ? 'MET' : bucketProgress(state.completion, bucketSize);
  const perfKey = perfMet ? 'MET' : bucketProgress(state.perfection, bucketSize);
  
  return `${state.getCacheKey()}:${compKey}:${perfKey}:${remainingDepth}:${condition}:${conditionType || 'n'}`;
}

/**
 * Score a state based on progress toward targets.
 * 
 * Scoring priorities:
 * 1. Progress toward completion and perfection targets (primary)
 * 2. Large bonus for meeting both targets
 * 3. Bonus for active buffs (they enable higher gains on future turns)
 * 4. Penalty for going over targets (wasted resources)
 * 5. Resource efficiency bonuses (qi and stability remaining)
 * 6. Penalty for risky states (low stability)
 * 
 * The scoring is designed to:
 * - Strongly prefer states that meet targets
 * - Value buff setup as investment for future gains
 * - Balance progress with resource conservation
 */
function scoreState(
  state: CraftingState,
  targetCompletion: number,
  targetPerfection: number
): number {
  if (targetCompletion === 0 && targetPerfection === 0) {
    // No targets - maximize minimum of both (balanced progress)
    return Math.min(state.completion, state.perfection);
  }

  // Calculate progress toward each target as a percentage (0-1)
  // Guard against zero targets (e.g., recipes that only require completion OR perfection)
  const compProgressPct = targetCompletion > 0 ? Math.min(state.completion / targetCompletion, 1) : 1;
  const perfProgressPct = targetPerfection > 0 ? Math.min(state.perfection / targetPerfection, 1) : 1;
  
  // Score based on progress toward targets (primary scoring)
  // Use actual progress values for the base score
  const compProgress = targetCompletion > 0 ? Math.min(state.completion, targetCompletion) : 0;
  const perfProgress = targetPerfection > 0 ? Math.min(state.perfection, targetPerfection) : 0;
  let score = compProgress + perfProgress;

  // Large bonus for meeting both targets - this is the goal
  const targetsMet =
    (targetCompletion <= 0 || state.completion >= targetCompletion) &&
    (targetPerfection <= 0 || state.perfection >= targetPerfection);
  if (targetsMet) {
    score += 200; // Significant bonus for achieving the goal
    
    // Additional bonus for resource efficiency when targets are met
    // Prefer paths that leave more qi and stability for safety margin
    score += state.qi * 0.05;  // Bonus for remaining qi
    score += state.stability * 0.05;  // Bonus for remaining stability
  } else {
    // Bonus for active buffs when targets not yet met
    // Buffs are valuable because they amplify future skill gains
    // The value of buffs decreases as we get closer to targets (less future turns to use them)
    const remainingWorkPct = 1 - (compProgressPct + perfProgressPct) / 2;
    
    if (state.hasControlBuff()) {
      // Control buff helps with perfection - value it more when perfection is needed
      const perfNeedPct = 1 - perfProgressPct;
      score += state.controlBuffTurns * 3 * perfNeedPct * remainingWorkPct;
    }
    if (state.hasIntensityBuff()) {
      // Intensity buff helps with completion - value it more when completion is needed
      const compNeedPct = 1 - compProgressPct;
      score += state.intensityBuffTurns * 3 * compNeedPct * remainingWorkPct;
    }
    
    // Small bonus for resource efficiency even when targets not met
    // This helps break ties between similar states
    score += state.qi * 0.01;
    score += state.stability * 0.01;
  }

  // Penalize going over targets (wasted resources)
  // Use a smaller penalty to not overly discourage skills that overshoot slightly
  const compOver = targetCompletion > 0 ? Math.max(0, state.completion - targetCompletion) : 0;
  const perfOver = targetPerfection > 0 ? Math.max(0, state.perfection - targetPerfection) : 0;
  score -= (compOver + perfOver) * 0.3;

  // Penalty for low stability (risky state)
  // Graduated penalty that increases as stability gets dangerously low
  if (state.stability < 25) {
    const stabilityRisk = (25 - state.stability) / 25; // 0 to 1
    score -= stabilityRisk * stabilityRisk * 10; // Quadratic penalty for very low stability
  }

  // Small penalty for high toxicity in alchemy crafting
  if (state.maxToxicity > 0 && state.hasDangerousToxicity()) {
    score -= 5;
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
    if (skill.buffType === BuffType.CONTROL) {
      reasons.push('Grants control buff for next turns');
    } else if (skill.buffType === BuffType.INTENSITY) {
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
 * Move ordering heuristic - orders skills to search most promising first.
 * This improves search efficiency by finding good solutions early.
 * 
 * Priority order:
 * 1. Stabilize skills when stability is low (<= 25)
 * 2. Buff-granting skills when no buff is active
 * 3. Buff-consuming skills (Disciplined Touch) when buffs are active
 * 4. High-gain skills (completion/perfection > 10)
 * 5. Other skills
 */
function orderSkillsForSearch(
  skills: SkillDefinition[],
  state: CraftingState,
  config: OptimizerConfig,
  targetCompletion: number,
  targetPerfection: number
): SkillDefinition[] {
  const needsCompletion = state.completion < targetCompletion;
  const needsPerfection = state.perfection < targetPerfection;
  const hasControlBuff = state.hasControlBuff();
  const hasIntensityBuff = state.hasIntensityBuff();
  const lowStability = state.stability <= 25;
  
  // Score each skill for ordering (higher = search first)
  const scored = skills.map(skill => {
    let priority = 0;
    
    // Highest priority: stabilize when low
    if (lowStability && skill.type === 'stabilize') {
      priority += 1000;
    }
    
    // High priority: buff-consuming skills when buffs active
    if (skill.isDisciplinedTouch && (hasControlBuff || hasIntensityBuff)) {
      priority += 500;
    }
    
    // High priority: buff-granting skills when no buff
    if (skill.buffDuration > 0) {
      if (skill.buffType === BuffType.CONTROL && !hasControlBuff && needsPerfection) {
        priority += 400;
      }
      if (skill.buffType === BuffType.INTENSITY && !hasIntensityBuff && needsCompletion) {
        priority += 400;
      }
    }
    
    // Medium priority: skills that address current needs
    if (needsCompletion && skill.baseCompletionGain > 0) {
      priority += skill.baseCompletionGain * 2;
    }
    if (needsPerfection && skill.basePerfectionGain > 0) {
      priority += skill.basePerfectionGain * 2;
    }
    
    // Bonus for using buffs effectively
    if (hasControlBuff && skill.scalesWithControl) {
      priority += 100;
    }
    if (hasIntensityBuff && skill.scalesWithIntensity) {
      priority += 100;
    }
    
    return { skill, priority };
  });
  
  // Sort by priority descending
  scored.sort((a, b) => b.priority - a.priority);
  
  return scored.map(s => s.skill);
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
  controlCondition: number = 1.0,
  currentConditionType?: CraftingConditionType
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
  if (isTerminalState(state, config, currentConditionType)) {
    return {
      recommendation: null,
      alternativeSkills: [],
      isTerminal: true,
      targetsMet: false,
    };
  }

  const availableSkills = getAvailableSkills(state, config, currentConditionType);
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
 * Lookahead search with memoization and performance optimizations.
 * Searches N moves ahead to find the best first move.
 * 
 * Performance features:
 * - Alpha-beta pruning to cut off unpromising branches
 * - Beam search to limit branches at each level
 * - Time budget to prevent UI freezes
 * - Progress bucketing for better cache hits with large numbers
 * 
 * @param state - Current crafting state
 * @param config - Optimizer config with skills and character stats
 * @param targetCompletion - Target completion value
 * @param targetPerfection - Target perfection value
 * @param depth - How many moves to look ahead
 * @param controlCondition - Current condition multiplier
 * @param forecastedConditions - Array of upcoming condition multipliers for each depth
 * @param currentConditionType - Current condition type for skill filtering
 * @param forecastedConditionTypes - Array of upcoming condition types for skill filtering
 * @param searchConfig - Optional search configuration for performance tuning
 */
export function lookaheadSearch(
  state: CraftingState,
  config: OptimizerConfig,
  targetCompletion: number = 0,
  targetPerfection: number = 0,
  depth: number = 3,
  controlCondition: number = 1.0,
  forecastedConditions: number[] = [],
  currentConditionType?: CraftingConditionType,
  forecastedConditionTypes: CraftingConditionType[] = [],
  searchConfig: Partial<SearchConfig> = {}
): SearchResult {
  // Merge with default search config
  const cfg: SearchConfig = { ...DEFAULT_SEARCH_CONFIG, ...searchConfig };
  
  // Search metrics for performance monitoring
  const metrics = {
    nodesExplored: 0,
    cacheHits: 0,
    timeTakenMs: 0,
    depthReached: depth,
    pruned: 0,
  };
  const startTime = Date.now();
  
  // Check if targets already met
  if (targetCompletion > 0 && targetPerfection > 0) {
    if (state.targetsMet(targetCompletion, targetPerfection)) {
      return {
        recommendation: null,
        alternativeSkills: [],
        isTerminal: false,
        targetsMet: true,
        searchMetrics: metrics,
      };
    }
  }

  // Check if terminal state (use current condition type for filtering)
  if (isTerminalState(state, config, currentConditionType)) {
    return {
      recommendation: null,
      alternativeSkills: [],
      isTerminal: true,
      targetsMet: false,
      searchMetrics: metrics,
    };
  }

  // Memoization cache: cacheKey -> best score achievable from that state
  const cache = new Map<string, number>();
  
  // Flag to signal early termination due to time/node budget
  let shouldTerminate = false;

  /**
   * Check if we should terminate search early due to budget constraints
   */
  function checkBudget(): boolean {
    if (shouldTerminate) return true;
    
    // Check time budget
    if (Date.now() - startTime > cfg.timeBudgetMs) {
      shouldTerminate = true;
      return true;
    }
    
    // Check node budget
    if (metrics.nodesExplored >= cfg.maxNodes) {
      shouldTerminate = true;
      return true;
    }
    
    return false;
  }

  /**
   * Recursive search function with alpha-beta pruning
   * Uses forecasted conditions at each depth level for more accurate simulation
   * 
   * @param currentState - Current state to evaluate
   * @param remainingDepth - Remaining search depth
   * @param depthIndex - Current depth index for condition lookups
   * @param alpha - Best score achievable by maximizer (for pruning)
   * @param beta - Best score achievable by minimizer (for pruning, unused in single-player)
   */
  function search(
    currentState: CraftingState, 
    remainingDepth: number, 
    depthIndex: number,
    alpha: number = -Infinity,
    beta: number = Infinity
  ): number {
    metrics.nodesExplored++;
    
    // Check budget constraints
    if (checkBudget()) {
      return scoreState(currentState, targetCompletion, targetPerfection);
    }
    
    // Get condition type for this depth from forecasted conditions
    // depthIndex 0 = current turn, 1+ = future turns
    const conditionTypeAtDepth = depthIndex < forecastedConditionTypes.length 
      ? forecastedConditionTypes[depthIndex] 
      : (depthIndex === 0 ? currentConditionType : 'neutral');

    // Base case: depth exhausted or terminal
    if (remainingDepth === 0 || isTerminalState(currentState, config, conditionTypeAtDepth)) {
      return scoreState(currentState, targetCompletion, targetPerfection);
    }

    // Check if targets met - early termination with bonus
    if (targetCompletion > 0 && targetPerfection > 0) {
      if (currentState.targetsMet(targetCompletion, targetPerfection)) {
        return scoreState(currentState, targetCompletion, targetPerfection);
      }
    }

    // Get condition multiplier for this depth from forecasted conditions
    const conditionAtDepth = depthIndex < forecastedConditions.length 
      ? forecastedConditions[depthIndex] 
      : controlCondition;

    // Check cache with normalized key (buckets large progress values)
    const cacheKey = getNormalizedCacheKey(
      currentState,
      targetCompletion,
      targetPerfection,
      remainingDepth,
      conditionAtDepth,
      conditionTypeAtDepth,
      cfg.progressBucketSize
    );
    if (cache.has(cacheKey)) {
      metrics.cacheHits++;
      return cache.get(cacheKey)!;
    }

    const availableSkills = getAvailableSkills(currentState, config, conditionTypeAtDepth);
    // Apply move ordering to search promising skills first
    const orderedSkills = orderSkillsForSearch(
      availableSkills, currentState, config, targetCompletion, targetPerfection
    );
    
    // Apply beam search: limit the number of branches explored
    const beamSkills = orderedSkills.slice(0, cfg.beamWidth);
    
    let bestScore = scoreState(currentState, targetCompletion, targetPerfection);

    for (const skill of beamSkills) {
      const newState = applySkill(currentState, skill, config, conditionAtDepth);
      if (newState === null) continue;

      const score = search(newState, remainingDepth - 1, depthIndex + 1, bestScore, beta);
      if (score > bestScore) {
        bestScore = score;
      }
      
      // Alpha-beta pruning: if we found a score better than what the parent
      // could guarantee, we can prune this branch
      if (cfg.useAlphaBeta && bestScore >= beta) {
        metrics.pruned++;
        break;
      }
    }

    cache.set(cacheKey, bestScore);
    return bestScore;
  }

  /**
   * Find the optimal path (rotation) from a given state
   * Returns the sequence of skill names and the final state
   * 
   * @param startState - State to start from
   * @param maxDepth - Maximum depth to search
   * @param startCondition - Default condition multiplier
   * @param startDepthIndex - The depth index to start from (for condition lookups)
   */
  function findOptimalPath(
    startState: CraftingState,
    maxDepth: number,
    startCondition: number,
    startDepthIndex: number = 0
  ): { path: string[]; finalState: CraftingState } {
    const path: string[] = [];
    let currentState = startState;
    let currentDepth = 0;

    // Get condition type for this depth, offset by startDepthIndex
    const getConditionTypeAtDepth = (localDepth: number) => {
      const globalDepth = startDepthIndex + localDepth;
      if (globalDepth < forecastedConditionTypes.length) return forecastedConditionTypes[globalDepth];
      return globalDepth === 0 ? currentConditionType : 'neutral';
    };

    while (currentDepth < maxDepth && !isTerminalState(currentState, config, getConditionTypeAtDepth(currentDepth))) {
      // Check if targets met
      if (targetCompletion > 0 && targetPerfection > 0) {
        if (currentState.targetsMet(targetCompletion, targetPerfection)) {
          break;
        }
      }

      const globalDepth = startDepthIndex + currentDepth;
      const conditionAtDepth = globalDepth < forecastedConditions.length
        ? forecastedConditions[globalDepth]
        : startCondition;
      const conditionTypeAtDepth = getConditionTypeAtDepth(currentDepth);

      const skills = getAvailableSkills(currentState, config, conditionTypeAtDepth);
      // Apply move ordering for faster path finding
      const orderedSkills = orderSkillsForSearch(
        skills, currentState, config, targetCompletion, targetPerfection
      );
      let bestSkill: SkillDefinition | null = null;
      let bestScore = -Infinity;
      let bestNextState: CraftingState | null = null;

      for (const skill of orderedSkills) {
        const nextState = applySkill(currentState, skill, config, conditionAtDepth);
        if (nextState === null) continue;

        const score = search(nextState, maxDepth - currentDepth - 1, globalDepth + 1);
        if (score > bestScore) {
          bestScore = score;
          bestSkill = skill;
          bestNextState = nextState;
        }
      }

      if (bestSkill && bestNextState) {
        path.push(bestSkill.name);
        currentState = bestNextState;
        currentDepth++;
      } else {
        break;
      }
    }

    return { path, finalState: currentState };
  }

  // Evaluate each first move using current condition
  // Apply move ordering to evaluate promising skills first
  const availableSkills = getAvailableSkills(state, config, currentConditionType);
  const orderedSkills = orderSkillsForSearch(
    availableSkills, state, config, targetCompletion, targetPerfection
  );
  const scoredSkills: SkillRecommendation[] = [];

  /**
   * Find the best follow-up skill after applying a skill.
   * Uses the same search logic as findOptimalPath to ensure consistency
   * between the follow-up recommendation and the suggested rotation.
   */
  function findFollowUpSkill(
    stateAfterSkill: CraftingState,
    depthIndex: number
  ): SkillRecommendation['followUpSkill'] | undefined {
    // Get condition type for the follow-up turn
    const followUpConditionType = depthIndex < forecastedConditionTypes.length
      ? forecastedConditionTypes[depthIndex]
      : 'neutral';
    const followUpCondition = depthIndex < forecastedConditions.length
      ? forecastedConditions[depthIndex]
      : controlCondition;

    // Check if targets already met or terminal
    if (stateAfterSkill.targetsMet(targetCompletion, targetPerfection)) {
      return undefined;
    }
    if (isTerminalState(stateAfterSkill, config, followUpConditionType)) {
      return undefined;
    }

    const followUpSkills = getAvailableSkills(stateAfterSkill, config, followUpConditionType);
    if (followUpSkills.length === 0) return undefined;

    // Apply move ordering for consistency with findOptimalPath
    const orderedFollowUpSkills = orderSkillsForSearch(
      followUpSkills, stateAfterSkill, config, targetCompletion, targetPerfection
    );

    let bestFollowUp: SkillDefinition | null = null;
    let bestFollowUpScore = -Infinity;
    let bestFollowUpGains = { completion: 0, perfection: 0, stability: 0 };

    for (const followUp of orderedFollowUpSkills) {
      const nextState = applySkill(stateAfterSkill, followUp, config, followUpCondition);
      if (nextState === null) continue;

      const followUpGains = calculateSkillGains(stateAfterSkill, followUp, config, followUpCondition);
      // Use depth - 1 - depthIndex to match findOptimalPath's remaining depth calculation
      const remainingDepth = depth - 1 - depthIndex;
      const followUpScore = search(nextState, remainingDepth, depthIndex + 1);

      if (followUpScore > bestFollowUpScore) {
        bestFollowUpScore = followUpScore;
        bestFollowUp = followUp;
        bestFollowUpGains = followUpGains;
      }
    }

    if (bestFollowUp) {
      return {
        name: bestFollowUp.name,
        type: bestFollowUp.type,
        icon: bestFollowUp.icon,
        expectedGains: bestFollowUpGains,
      };
    }
    return undefined;
  }

  for (const skill of orderedSkills) {
    const newState = applySkill(state, skill, config, controlCondition);
    if (newState === null) continue;

    const gains = calculateSkillGains(state, skill, config, controlCondition);
    // Start recursive search from depth index 1 (next turn uses first forecasted condition)
    const score = search(newState, depth - 1, 1);
    const reasoning = generateReasoning(skill, state, gains, targetCompletion, targetPerfection);
    
    // Check if this skill consumes buffs
    const consumesBuff = skill.isDisciplinedTouch === true;

    // Find the best follow-up skill
    const followUpSkill = findFollowUpSkill(newState, 1);

    scoredSkills.push({
      skill,
      expectedGains: gains,
      score,
      reasoning,
      consumesBuff,
      followUpSkill,
    });
  }

  // Sort by score descending
  scoredSkills.sort((a, b) => b.score - a.score);

  if (scoredSkills.length === 0) {
    metrics.timeTakenMs = Date.now() - startTime;
    return {
      recommendation: null,
      alternativeSkills: [],
      isTerminal: true,
      targetsMet: false,
      searchMetrics: metrics,
    };
  }

  // Calculate quality ratings (0-100) based on score difference from best
  const bestScore = scoredSkills[0].score;
  const worstScore = scoredSkills.length > 1 ? scoredSkills[scoredSkills.length - 1].score : bestScore;
  const scoreRange = bestScore - worstScore;
  
  for (const rec of scoredSkills) {
    if (scoreRange > 0) {
      rec.qualityRating = Math.round(((rec.score - worstScore) / scoreRange) * 100);
    } else {
      rec.qualityRating = 100; // All skills are equally good
    }
  }

  // Find the optimal rotation starting from the best first move
  const bestFirstMove = scoredSkills[0].skill;
  const stateAfterFirstMove = applySkill(state, bestFirstMove, config, controlCondition);
  
  let optimalRotation: string[] = [bestFirstMove.name];
  let expectedFinalState: SearchResult['expectedFinalState'] = undefined;
  
  if (stateAfterFirstMove) {
    // Find the rest of the optimal path, starting from depth index 1 (after first move)
    const { path, finalState } = findOptimalPath(stateAfterFirstMove, depth - 1, controlCondition, 1);
    optimalRotation = [bestFirstMove.name, ...path];
    
    // Calculate turns remaining (estimate based on progress needed)
    const compRemaining = Math.max(0, targetCompletion - finalState.completion);
    const perfRemaining = Math.max(0, targetPerfection - finalState.perfection);
    const avgGainPerTurn = 15; // Rough estimate
    const turnsRemaining = Math.ceil((compRemaining + perfRemaining) / avgGainPerTurn);
    
    expectedFinalState = {
      completion: finalState.completion,
      perfection: finalState.perfection,
      stability: finalState.stability,
      qi: finalState.qi,
      turnsRemaining: turnsRemaining > 0 ? turnsRemaining : 0,
    };
  }

  // Record final metrics
  metrics.timeTakenMs = Date.now() - startTime;
  
  return {
    recommendation: scoredSkills[0],
    alternativeSkills: scoredSkills.slice(1),
    isTerminal: false,
    targetsMet: false,
    optimalRotation,
    expectedFinalState,
    searchMetrics: metrics,
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
 * @param currentConditionType - Current condition type for skill filtering (e.g., 'veryPositive')
 * @param forecastedConditionTypes - Array of upcoming condition types for skill filtering
 * @param searchConfig - Optional search configuration for performance tuning
 */
export function findBestSkill(
  state: CraftingState,
  config: OptimizerConfig,
  targetCompletion: number = 0,
  targetPerfection: number = 0,
  controlCondition: number = 1.0,
  useGreedy: boolean = false,
  lookaheadDepth: number = 3,
  forecastedConditionMultipliers: number[] = [],
  currentConditionType?: CraftingConditionType,
  forecastedConditionTypes: CraftingConditionType[] = [],
  searchConfig: Partial<SearchConfig> = {}
): SearchResult {
  // Log that we're using game-provided data
  if (forecastedConditionMultipliers.length > 0) {
    debugLog(
      `[CraftBuddy] Using ${forecastedConditionMultipliers.length} forecasted condition multipliers: ${forecastedConditionMultipliers.join(', ')}`
    );
  }
  
  if (useGreedy) {
    return greedySearch(state, config, targetCompletion, targetPerfection, controlCondition, currentConditionType);
  }
  
  // Pass forecasted condition multipliers and types to lookahead search for accurate simulation
  return lookaheadSearch(
    state, config, targetCompletion, targetPerfection, lookaheadDepth, 
    controlCondition, forecastedConditionMultipliers, currentConditionType, 
    forecastedConditionTypes, searchConfig
  );
}
