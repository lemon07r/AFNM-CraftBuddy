import {
  SkillDefinition,
  OptimizerConfig,
  getBuffDiscordantConditions,
  isTerminalState,
  getConditionEffectsForConfig,
  calculateActionSurvivabilityFloor,
  getAvailableSkills,
  applySkill,
  getBlockedSkillReasons,
  techniqueDisplayName,
} from '../skills';

import { CraftingState } from '../state';

import type {
  CraftingConditionType,
  SearchConfig,
  SearchResult,
  SearchMoveCandidate,
  ActionSurvivabilityFloor,
  TranspositionCache,
  TranspositionCacheEntry,
  CandidateTieBreakMetrics,
  SkillRecommendation,
  GainPreview,
  ActionCostPreview,
  UnsafeCandidateClassification,
} from './types';

import {
  withOutcomeProjection,
  calculateRecommendationGains,
  generateReasoning,
  populateSetupHints,
  buildOutcomeProjection,
} from './presentation';

import { DEFAULT_SEARCH_CONFIG, getAdaptiveBeamWidth } from './config';

import {
  normalizeConditionType,
  normalizeForecastConditionQueue,
  VISIBLE_CONDITION_QUEUE_LENGTH,
  getConditionTransitionsWithProvider,
} from './conditions';

import {
  buildScoringContext,
  estimateWeightedProgressPerTurn,
  estimateTurnsRemainingFromContext,
} from './scoringContext';

import {
  deriveBandGoals,
  goalsMet,
  calculateImmediateProgressTowardGoals,
  calculateFinishSuccessChance,
} from './goals';

import {
  computeScoreTieWindow,
  compareTieBreakMetrics,
  rankRecommendations,
} from './ranking';

import { willAutoFinish } from '../outcome';

import {
  scoreFinishedOutcome,
  scoreState,
  getGoalPriorityWeights,
  SCORING,
} from './scoring';

import {
  hasFatalTechniqueFailure,
  shouldUseSurvivabilityFloorForContinuation,
  applySurvivabilityFloorToState,
  hasGuaranteedSafeStabilizeAction,
  shouldDeprioritizeAgainstGuaranteedSafeStabilize,
  orderRecommendationsBySafety,
  classifyTerminalState,
} from './safety';

import { getNormalizedCacheKey } from './cacheKey';

import { estimateGoalUnlockOrderingBonus } from './unlocks';

function actionConsumesTurn(skill: SkillDefinition): boolean {
  if (skill.consumesTurn !== undefined) {
    return skill.consumesTurn;
  }
  return skill.actionKind !== 'item';
}

/**
 * Lookahead search with memoization and performance optimizations.
 * Searches N moves ahead to find the best first move.
 *
 * Performance features:
 * - Beam search to limit branches at each level
 * - Time budget to prevent UI freezes
 * - Progress bucketing for better cache hits with large numbers
 *
 * @param state - Current crafting state
 * @param config - Optimizer config with skills and character stats
 * @param targetCompletion - Target completion value
 * @param targetPerfection - Target perfection value
 * @param depth - How many moves to look ahead
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
  currentConditionType?: CraftingConditionType,
  forecastedConditionTypes: CraftingConditionType[] = [],
  searchConfig: Partial<SearchConfig> = {},
): SearchResult {
  return withOutcomeProjection(
    runLookaheadSearch(
      state,
      config,
      targetCompletion,
      targetPerfection,
      depth,
      currentConditionType,
      forecastedConditionTypes,
      searchConfig,
    ),
    state,
    config,
    targetCompletion,
    targetPerfection,
  );
}

function runLookaheadSearch(
  state: CraftingState,
  config: OptimizerConfig,
  targetCompletion: number,
  targetPerfection: number,
  depth: number,
  currentConditionType: CraftingConditionType | undefined,
  forecastedConditionTypes: CraftingConditionType[],
  searchConfig: Partial<SearchConfig>,
): SearchResult {
  // Merge with default search config
  const cfg: SearchConfig = { ...DEFAULT_SEARCH_CONFIG, ...searchConfig };
  // Stock Uncontrollable Flames is equipment-granted and permanent for the
  // craft, so snapshot discordance once from root buffs. Dynamic custom buff
  // grants/removals are a documented gap (MECHANICS_PARITY, Dynamic discordance).
  if (cfg.conditionDiscordance === undefined) {
    cfg.conditionDiscordance = getBuffDiscordantConditions(state.buffs);
  }
  const normalizedCurrentCondition =
    normalizeConditionType(currentConditionType);
  const initialConditionQueue = normalizeForecastConditionQueue(
    normalizedCurrentCondition,
    forecastedConditionTypes,
    state.harmony,
    VISIBLE_CONDITION_QUEUE_LENGTH,
    cfg.conditionDiscordance,
  );

  // Search metrics for performance monitoring
  const metrics: NonNullable<SearchResult['searchMetrics']> = {
    nodesExplored: 0,
    cacheHits: 0,
    timeTakenMs: 0,
    depthReached: 0,
    pruned: 0,
  };
  const startTime = Date.now();

  // Extract settings from config
  const isSublime = config.isSublimeCraft || false;
  // targetMultiplier retained for diagnostics/compat; goals use band thresholds.
  const targetMult = config.targetMultiplier || 2.0;
  const isTraining = config.trainingMode || false;
  const scoringCtx = buildScoringContext(
    config,
    state,
    normalizedCurrentCondition,
  );
  const bandGoals = deriveBandGoals(
    targetCompletion,
    targetPerfection,
    isSublime,
    config.maxCompletion,
    config.maxPerfection,
    cfg.perfectionBandGoal,
    cfg.completionBandCeiling,
  );
  const {
    baseCompGoal,
    basePerfGoal,
    effectiveCompGoal,
    effectivePerfGoal,
    bands: outcomeBands,
  } = bandGoals;
  const modeCompGoal = effectiveCompGoal;
  const modePerfGoal = effectivePerfGoal;
  const totalTargetMagnitudeForOrdering = Math.max(
    1,
    effectiveCompGoal + effectivePerfGoal,
  );
  const scoreTieWindow = computeScoreTieWindow(totalTargetMagnitudeForOrdering);
  const stateWillAutoFinish = (candidate: CraftingState): boolean =>
    willAutoFinish(candidate, outcomeBands);
  const targetsMetForCurrentMode = (candidate: CraftingState): boolean =>
    goalsMet(candidate, modeCompGoal, modePerfGoal);
  const compareMoveCandidatesForTie = (
    a: SearchMoveCandidate,
    b: SearchMoveCandidate,
    currentState: CraftingState,
  ): number => {
    return compareTieBreakMetrics(
      {
        immediateProgress: a.immediateProgress,
        isStabilize: a.skill.type === 'stabilize',
        requiresProbabilisticSurvival: a.requiresProbabilisticSurvival,
        qiSpent: Math.max(0, currentState.qi - a.nextState.qi),
        skillKey: a.skill.key,
      },
      {
        immediateProgress: b.immediateProgress,
        isStabilize: b.skill.type === 'stabilize',
        requiresProbabilisticSurvival: b.requiresProbabilisticSurvival,
        qiSpent: Math.max(0, currentState.qi - b.nextState.qi),
        skillKey: b.skill.key,
      },
    );
  };
  const scoreStateWithTerminalPenalty = (
    candidate: CraftingState,
    conditionAtDepth: CraftingConditionType,
    knownBlocked?: boolean,
  ): number => {
    // Blocked bars are final even though the game has not resolved the craft.
    // Playable goal-met nodes retain live continuation value.
    if (
      stateWillAutoFinish(candidate) ||
      (knownBlocked ?? isTerminalState(candidate, config, conditionAtDepth))
    ) {
      return scoreFinishedOutcome(
        candidate,
        targetCompletion,
        targetPerfection,
        isSublime,
        targetMult,
        config.maxCompletion,
        config.maxPerfection,
        scoringCtx,
        cfg.goalPriorityBias,
        cfg.overcraftAmbition,
        cfg.perfectionBandGoal,
        cfg.completionBandCeiling,
      );
    }

    let baseScore = scoreState(
      candidate,
      targetCompletion,
      targetPerfection,
      isSublime,
      targetMult,
      isTraining,
      config.maxCompletion,
      config.maxPerfection,
      scoringCtx,
      cfg.goalPriorityBias,
      cfg.overcraftAmbition,
      cfg.perfectionBandGoal,
      cfg.completionBandCeiling,
    );
    const remainingCompletion = Math.max(
      0,
      modeCompGoal - candidate.completion,
    );
    const remainingPerfection = Math.max(
      0,
      modePerfGoal - candidate.perfection,
    );
    const totalRemaining = remainingCompletion + remainingPerfection;
    if (totalRemaining > 0) {
      const compNeedShare = remainingCompletion / totalRemaining;
      const perfNeedShare = remainingPerfection / totalRemaining;
      const { completionWeight, perfectionWeight } = getGoalPriorityWeights(
        compNeedShare,
        perfNeedShare,
        modeCompGoal,
        modePerfGoal,
        cfg.goalPriorityBias,
      );
      const totalPriorityWeight = completionWeight + perfectionWeight;
      const completionPriorityShare =
        totalPriorityWeight > 0 ? completionWeight / totalPriorityWeight : 0.5;
      const perfectionPriorityShare =
        totalPriorityWeight > 0 ? perfectionWeight / totalPriorityWeight : 0.5;
      const conditionEffects = getConditionEffectsForConfig(
        config,
        conditionAtDepth,
      );
      let intensityScale = 1;
      let controlScale = 1;
      for (const effect of conditionEffects) {
        if (effect.kind === 'intensity' && effect.multiplier !== undefined) {
          intensityScale += effect.multiplier;
        }
        if (effect.kind === 'control' && effect.multiplier !== undefined) {
          controlScale += effect.multiplier;
        }
      }
      const conditionedPotential =
        completionPriorityShare * intensityScale +
        perfectionPriorityShare * controlScale;
      const neutralPotential =
        completionPriorityShare + perfectionPriorityShare;
      const conditionWeightedProgress = estimateWeightedProgressPerTurn(
        completionPriorityShare,
        perfectionPriorityShare,
        scoringCtx,
      );
      baseScore +=
        (conditionedPotential - neutralPotential) * conditionWeightedProgress;
    }
    return baseScore;
  };
  const buildSearchStateForContinuation = (
    currentState: CraftingState,
    skill: SkillDefinition,
    displayState: CraftingState,
    conditionEffectsAtDepth: ReturnType<typeof getConditionEffectsForConfig>,
    currentConditionAtDepth: CraftingConditionType,
    hasGuaranteedSafeStabilize: boolean,
    minimumGuaranteedContinuationStability: number = 0,
  ): {
    searchState: CraftingState;
    survivabilityFloor: ActionSurvivabilityFloor;
    requiresProbabilisticSurvival: boolean;
    fatalTechniqueFailure: boolean;
  } => {
    const goalsMetAfterAction = targetsMetForCurrentMode(displayState);
    const baseSuccessSecuredAfterAction = goalsMet(
      displayState,
      targetCompletion,
      targetPerfection,
    );
    const survivabilityFloor = calculateActionSurvivabilityFloor(
      currentState,
      skill,
      config,
      conditionEffectsAtDepth,
      currentConditionAtDepth,
    );
    const floorStability =
      survivabilityFloor?.stability ?? displayState.stability;
    const fatalTechniqueFailure = hasFatalTechniqueFailure(
      currentState,
      skill,
      config,
      conditionEffectsAtDepth,
      currentConditionAtDepth,
      targetCompletion,
      targetPerfection,
    );
    const requiresProbabilisticSurvival =
      fatalTechniqueFailure ||
      shouldUseSurvivabilityFloorForContinuation({
        currentStability: currentState.stability,
        displayStability: displayState.stability,
        floorStability,
        goalsMetAfterAction,
        baseSuccessSecuredAfterAction,
        hasGuaranteedSafeStabilize,
        minimumGuaranteedContinuationStability,
      });

    return {
      searchState: requiresProbabilisticSurvival
        ? applySurvivabilityFloorToState(displayState, survivabilityFloor)
        : displayState,
      survivabilityFloor,
      requiresProbabilisticSurvival,
      fatalTechniqueFailure,
    };
  };
  const getGuaranteedSafeStabilizeContext = (
    currentState: CraftingState,
    availableSkills: SkillDefinition[],
    conditionEffectsAtDepth: ReturnType<typeof getConditionEffectsForConfig>,
    currentConditionAtDepth: CraftingConditionType,
    enabled: boolean,
  ): {
    hasGuaranteedSafeStabilize: boolean;
    minimumGuaranteedContinuationStability: number;
  } => {
    const gateThreshold = Math.max(
      SCORING.NEAR_DEATH_STABILITY,
      Math.ceil(scoringCtx.avgStabilityCostPerTurn),
    );
    if (
      !enabled ||
      currentState.stability > gateThreshold ||
      (currentState !== state &&
        isSublime &&
        goalsMet(currentState, targetCompletion, targetPerfection))
    ) {
      return {
        hasGuaranteedSafeStabilize: false,
        minimumGuaranteedContinuationStability: 0,
      };
    }

    const hasGuaranteedSafeStabilize = hasGuaranteedSafeStabilizeAction(
      currentState,
      availableSkills,
      config,
      conditionEffectsAtDepth,
      currentConditionAtDepth,
    );

    return {
      hasGuaranteedSafeStabilize,
      minimumGuaranteedContinuationStability: hasGuaranteedSafeStabilize
        ? Math.max(1, scoringCtx.avgStabilityCostPerTurn)
        : 0,
    };
  };
  // The working table is always per call. A caller-supplied cross-step table
  // acts as a second level underneath it: it only ever holds completed-pass
  // content merged in at the end of earlier searches (see the merge after the
  // deepening loop), so probing it can never read this call's partial
  // frontier — the same discipline the acceptedCache snapshot enforces within
  // one call.
  const crossStepTable = cfg.transpositionCache;
  let cache: TranspositionCache = new Map();
  let acceptedCache: TranspositionCache = new Map();

  // Probe the cross-step table for a completed-pass entry from an earlier
  // step of this craft scope. Used for budget-truncated frontier fallbacks
  // and principal-variation move hints, never as a substitute for a
  // completed pass at the requested depth. Note the cache key carries the
  // realized condition-queue context (including stochastic tail draws), so
  // cross-call equality is exact for unchanged-state redispatches and
  // coincident contexts, and structurally rare for step-advanced states —
  // relaxing that would mix scoring contexts that genuinely differ.
  const probeCrossStepEntry = (
    candidate: CraftingState,
    conditionAtDepth: CraftingConditionType,
    nextConditionQueueAtDepth: CraftingConditionType[],
    maxRemainingDepth: number,
  ): TranspositionCacheEntry | undefined => {
    if (!crossStepTable) {
      return undefined;
    }
    for (let probeDepth = maxRemainingDepth; probeDepth >= 1; probeDepth--) {
      const probeEntry = crossStepTable.get(
        getNormalizedCacheKey(
          candidate,
          effectiveCompGoal,
          effectivePerfGoal,
          probeDepth,
          conditionAtDepth,
          nextConditionQueueAtDepth,
          cfg.progressBucketSize,
        ),
      );
      if (probeEntry) {
        metrics.crossStepHits = (metrics.crossStepHits ?? 0) + 1;
        return probeEntry;
      }
    }
    return undefined;
  };

  const getDeepestCachedEntry = (
    cacheToProbe: TranspositionCache,
    candidate: CraftingState,
    conditionAtDepth: CraftingConditionType,
    nextConditionQueueAtDepth: CraftingConditionType[],
    maxRemainingDepth: number,
  ): TranspositionCacheEntry | undefined => {
    for (let probeDepth = maxRemainingDepth; probeDepth >= 1; probeDepth--) {
      const probeCacheKey = getNormalizedCacheKey(
        candidate,
        effectiveCompGoal,
        effectivePerfGoal,
        probeDepth,
        conditionAtDepth,
        nextConditionQueueAtDepth,
        cfg.progressBucketSize,
      );
      const probeEntry = cacheToProbe.get(probeCacheKey);
      if (probeEntry) {
        return probeEntry;
      }
    }
    return undefined;
  };

  const getCachedBestMoveKey = (
    cacheToProbe: TranspositionCache,
    candidate: CraftingState,
    conditionAtDepth: CraftingConditionType,
    nextConditionQueueAtDepth: CraftingConditionType[],
    maxRemainingDepth: number,
  ): string | null =>
    getDeepestCachedEntry(
      cacheToProbe,
      candidate,
      conditionAtDepth,
      nextConditionQueueAtDepth,
      maxRemainingDepth,
    )?.bestMove || null;

  const scoreStateFromBestAvailableFrontier = (
    candidate: CraftingState,
    conditionAtDepth: CraftingConditionType,
    nextConditionQueueAtDepth: CraftingConditionType[],
    remainingDepth: number,
  ): number => {
    const accepted = getDeepestCachedEntry(
      acceptedCache,
      candidate,
      conditionAtDepth,
      nextConditionQueueAtDepth,
      Math.max(0, remainingDepth - 1),
    )?.score;
    // A budget-truncated node wants the most informed answer available.
    // Prefer this call's accepted frontier; when it has nothing, entries from
    // earlier steps of this craft scope qualify even at deeper remaining
    // depths, since a deeper completed pass knows strictly more about the
    // same state.
    if (typeof accepted === 'number' && Number.isFinite(accepted)) {
      return accepted;
    }
    const crossStep = probeCrossStepEntry(
      candidate,
      conditionAtDepth,
      nextConditionQueueAtDepth,
      depth,
    )?.score;
    return typeof crossStep === 'number' && Number.isFinite(crossStep)
      ? crossStep
      : scoreStateWithTerminalPenalty(candidate, conditionAtDepth);
  };

  function estimatePostMoveStateScore(
    newState: CraftingState,
    skill: SkillDefinition,
    conditionAtDepth: CraftingConditionType,
    nextConditionQueueAtDepth: CraftingConditionType[],
  ): number {
    if (!actionConsumesTurn(skill)) {
      return scoreStateWithTerminalPenalty(newState, conditionAtDepth);
    }

    const transitions = getConditionTransitionsWithProvider(
      conditionAtDepth,
      nextConditionQueueAtDepth,
      newState.conditionGenerationHarmony ?? newState.harmony,
      cfg,
    );
    if (transitions.length === 0) {
      return scoreStateWithTerminalPenalty(newState, conditionAtDepth);
    }

    let expectedScore = 0;
    for (const transition of transitions) {
      expectedScore +=
        transition.probability *
        scoreStateWithTerminalPenalty(newState, transition.nextCondition);
    }
    return expectedScore;
  }

  function buildOrderedMoveCandidates(
    currentState: CraftingState,
    remainingDepth: number,
    currentConditionAtDepth: CraftingConditionType,
    nextConditionQueueAtDepth: CraftingConditionType[],
    conditionEffectsAtDepth: ReturnType<typeof getConditionEffectsForConfig>,
    useGuaranteedSafeStabilizeGate: boolean = false,
  ): SearchMoveCandidate[] {
    const availableSkills = getAvailableSkills(
      currentState,
      config,
      currentConditionAtDepth,
    );
    const {
      hasGuaranteedSafeStabilize,
      minimumGuaranteedContinuationStability,
    } = getGuaranteedSafeStabilizeContext(
      currentState,
      availableSkills,
      conditionEffectsAtDepth,
      currentConditionAtDepth,
      useGuaranteedSafeStabilizeGate,
    );
    const candidates: SearchMoveCandidate[] = [];

    for (const skill of availableSkills) {
      const nextState = applySkill(
        currentState,
        skill,
        config,
        conditionEffectsAtDepth,
        targetCompletion,
        currentConditionAtDepth,
      );
      if (nextState === null) {
        continue;
      }
      const {
        searchState,
        survivabilityFloor,
        requiresProbabilisticSurvival,
        fatalTechniqueFailure,
      } = buildSearchStateForContinuation(
        currentState,
        skill,
        nextState,
        conditionEffectsAtDepth,
        currentConditionAtDepth,
        hasGuaranteedSafeStabilize,
        minimumGuaranteedContinuationStability,
      );
      const floorStability =
        survivabilityFloor?.stability ?? nextState.stability;
      const baseSuccessSecuredAfterAction = goalsMet(
        nextState,
        targetCompletion,
        targetPerfection,
      );
      const unsafeWithGuaranteedSafeAlternative =
        fatalTechniqueFailure ||
        shouldDeprioritizeAgainstGuaranteedSafeStabilize({
          currentStability: currentState.stability,
          displayStability: nextState.stability,
          floorStability,
          goalsMetAfterAction: targetsMetForCurrentMode(nextState),
          baseSuccessSecuredAfterAction,
          hasGuaranteedSafeStabilize,
          minimumGuaranteedContinuationStability,
        });

      const immediateProgress = calculateImmediateProgressTowardGoals(
        currentState,
        nextState,
        modeCompGoal,
        modePerfGoal,
        targetCompletion,
        targetPerfection,
      );

      const postMoveScore = estimatePostMoveStateScore(
        searchState,
        skill,
        currentConditionAtDepth,
        nextConditionQueueAtDepth,
      );
      // Ordering-only unlock bonus — must not flow into scored values.
      const unlockOrderingBonus = estimateGoalUnlockOrderingBonus(
        currentState,
        nextState,
        config,
        config.skills,
        totalTargetMagnitudeForOrdering,
      );
      candidates.push({
        skill,
        nextState,
        searchState,
        survivabilityFloor,
        orderingScore: postMoveScore + unlockOrderingBonus,
        immediateProgress,
        requiresProbabilisticSurvival,
        unsafeWithGuaranteedSafeAlternative,
      });
    }

    const filteredCandidates = candidates;

    filteredCandidates.sort((a, b) => {
      const scoreDiff = b.orderingScore - a.orderingScore;
      if (Math.abs(scoreDiff) > scoreTieWindow) {
        return scoreDiff;
      }
      return compareMoveCandidatesForTie(b, a, currentState);
    });

    // Promote only previously accepted principal-variation moves. Using the
    // live in-progress cache here can let a partially explored sibling branch
    // steer beam truncation for the current frontier. The cross-step table
    // qualifies the same way: it only holds completed passes from earlier
    // steps of this craft scope.
    const cachedBestMoveKey =
      getCachedBestMoveKey(
        acceptedCache,
        currentState,
        currentConditionAtDepth,
        nextConditionQueueAtDepth,
        Math.max(0, remainingDepth - 1),
      ) ??
      probeCrossStepEntry(
        currentState,
        currentConditionAtDepth,
        nextConditionQueueAtDepth,
        Math.max(0, remainingDepth - 1),
      )?.bestMove ??
      null;
    if (cachedBestMoveKey) {
      const cachedIndex = filteredCandidates.findIndex(
        (candidate) => candidate.skill.key === cachedBestMoveKey,
      );
      if (cachedIndex > 0) {
        const [cachedCandidate] = filteredCandidates.splice(cachedIndex, 1);
        filteredCandidates.unshift(cachedCandidate);
      }
    }

    return filteredCandidates;
  }

  if (stateWillAutoFinish(state)) {
    return {
      status: 'autoResolved',
      recommendation: null,
      alternativeSkills: [],
      isTerminal: true,
      targetsMet: targetsMetForCurrentMode(state),
      searchMetrics: metrics,
    };
  }

  // Check if terminal state (use current condition type for filtering)
  if (isTerminalState(state, config, normalizedCurrentCondition)) {
    return {
      status: 'blocked',
      recommendation: null,
      alternativeSkills: [],
      isTerminal: true,
      targetsMet: targetsMetForCurrentMode(state),
      blockedReasons: getBlockedSkillReasons(
        state,
        config,
        normalizedCurrentCondition,
      ),
      searchMetrics: metrics,
    };
  }

  // Flag to signal early termination due to time/node budget
  let shouldTerminate = false;

  /**
   * Check if we should terminate search early due to budget constraints
   */
  function checkBudget(): boolean {
    if (shouldTerminate) return true;

    if (cfg.shouldAbort?.()) {
      shouldTerminate = true;
      return true;
    }

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
   * Count only cache-miss expansions against the node budget.
   * Cache hits are already solved subproblems and should not consume the same
   * budget as exploring a new frontier node.
   */
  function consumeNodeBudget(): boolean {
    if (metrics.nodesExplored >= cfg.maxNodes) {
      shouldTerminate = true;
      return false;
    }

    metrics.nodesExplored++;
    return true;
  }

  /**
   * Recursive single-player search function
   * Uses forecasted conditions at each depth level for more accurate simulation
   *
   * @param currentState - Current state to evaluate
   * @param remainingDepth - Remaining search depth
   * @param depthIndex - Current depth index for condition lookups
   */
  function search(
    currentState: CraftingState,
    remainingDepth: number,
    depthIndex: number,
    currentConditionAtDepth: CraftingConditionType,
    nextConditionQueueAtDepth: CraftingConditionType[],
  ): number {
    // Check budget constraints
    if (checkBudget()) {
      return scoreStateFromBestAvailableFrontier(
        currentState,
        currentConditionAtDepth,
        nextConditionQueueAtDepth,
        remainingDepth,
      );
    }

    const stateIsTerminal = isTerminalState(
      currentState,
      config,
      currentConditionAtDepth,
    );

    // Base case: depth exhausted or terminal
    if (remainingDepth === 0 || stateIsTerminal) {
      return scoreStateWithTerminalPenalty(
        currentState,
        currentConditionAtDepth,
        stateIsTerminal,
      );
    }

    // Auto-finish horizon: craft ends here — finished scorer, no further search.
    if (stateWillAutoFinish(currentState)) {
      return scoreFinishedOutcome(
        currentState,
        targetCompletion,
        targetPerfection,
        isSublime,
        targetMult,
        config.maxCompletion,
        config.maxPerfection,
        scoringCtx,
        cfg.goalPriorityBias,
        cfg.overcraftAmbition,
        cfg.perfectionBandGoal,
        cfg.completionBandCeiling,
      );
    }

    // Goal-met but not auto-finishing: keep the live score as a leaf when we
    // choose not to expand, but do NOT force early exit — overcraft/extra-band
    // lines still need to expand. Fall through to normal search.

    // Check cache with normalized key (buckets large progress values)
    const cacheKey = getNormalizedCacheKey(
      currentState,
      effectiveCompGoal,
      effectivePerfGoal,
      remainingDepth,
      currentConditionAtDepth,
      nextConditionQueueAtDepth,
      cfg.progressBucketSize,
    );
    const localHit = cache.get(cacheKey);
    if (localHit) {
      metrics.cacheHits++;
      return localHit.score;
    }
    // Second level: completed-pass entries from earlier steps of this craft
    // scope (unchanged-state repolls and cross-branch transpositions hit
    // these). Copy through so this call's accepted snapshot carries them.
    const crossStepHit = crossStepTable?.get(cacheKey);
    if (crossStepHit) {
      metrics.cacheHits++;
      metrics.crossStepHits = (metrics.crossStepHits ?? 0) + 1;
      cache.set(cacheKey, crossStepHit);
      return crossStepHit.score;
    }

    if (!consumeNodeBudget()) {
      return scoreStateFromBestAvailableFrontier(
        currentState,
        currentConditionAtDepth,
        nextConditionQueueAtDepth,
        remainingDepth,
      );
    }

    // Get condition effects for this depth.
    const conditionEffectsAtDepth = getConditionEffectsForConfig(
      config,
      currentConditionAtDepth,
    );
    const orderedCandidates = buildOrderedMoveCandidates(
      currentState,
      remainingDepth,
      currentConditionAtDepth,
      nextConditionQueueAtDepth,
      conditionEffectsAtDepth,
      true,
    );
    if (orderedCandidates.length === 0) {
      return scoreStateWithTerminalPenalty(
        currentState,
        currentConditionAtDepth,
      );
    }

    // Apply adaptive beam search: use narrower beam for deep searches
    const effectiveBeamWidth = cfg.useAdaptiveBeamWidth
      ? getAdaptiveBeamWidth(cfg.beamWidth, remainingDepth)
      : cfg.beamWidth;
    const beamCandidates = orderedCandidates.slice(0, effectiveBeamWidth);

    let bestScore = -Infinity;
    let bestCandidate: SearchMoveCandidate | null = null;
    let bestMoveKey = ''; // tracks which skill achieved bestScore

    for (const candidate of beamCandidates) {
      const { skill, searchState: newState } = candidate;

      let score = 0;
      if (stateWillAutoFinish(newState)) {
        // Action ends the craft via auto-finish — finished scorer, no recurse.
        score = scoreFinishedOutcome(
          newState,
          targetCompletion,
          targetPerfection,
          isSublime,
          targetMult,
          config.maxCompletion,
          config.maxPerfection,
          scoringCtx,
          cfg.goalPriorityBias,
          cfg.overcraftAmbition,
          cfg.perfectionBandGoal,
          cfg.completionBandCeiling,
        );
      } else if (!actionConsumesTurn(skill)) {
        score = search(
          newState,
          remainingDepth,
          depthIndex,
          currentConditionAtDepth,
          nextConditionQueueAtDepth,
        );
      } else {
        const transitions = getConditionTransitionsWithProvider(
          currentConditionAtDepth,
          nextConditionQueueAtDepth,
          newState.conditionGenerationHarmony ?? newState.harmony,
          cfg,
        );
        for (const transition of transitions) {
          const branchScore = search(
            newState,
            remainingDepth - 1,
            depthIndex + 1,
            transition.nextCondition,
            transition.nextQueue,
          );
          score += transition.probability * branchScore;
        }
      }
      const scoreDelta = score - bestScore;
      const isClearImprovement = scoreDelta > scoreTieWindow;
      const isScoreTie =
        Math.abs(scoreDelta) <= scoreTieWindow && bestCandidate;
      const winsTie =
        isScoreTie &&
        compareMoveCandidatesForTie(candidate, bestCandidate!, currentState) >
          0;

      if (isClearImprovement || winsTie || bestCandidate === null) {
        bestScore = score;
        bestCandidate = candidate;
        bestMoveKey = skill.key;
      }
    }

    if (!Number.isFinite(bestScore)) {
      bestScore = scoreStateWithTerminalPenalty(
        currentState,
        currentConditionAtDepth,
      );
      bestMoveKey = '';
    }

    cache.set(cacheKey, { score: bestScore, bestMove: bestMoveKey });
    return bestScore;
  }

  function evaluateFutureScoreAfterSkill(
    newState: CraftingState,
    remainingDepth: number,
    depthIndex: number,
    conditionAtDepth: CraftingConditionType,
    conditionQueueAtDepth: CraftingConditionType[],
    skill: SkillDefinition,
  ): number {
    if (stateWillAutoFinish(newState)) {
      return scoreFinishedOutcome(
        newState,
        targetCompletion,
        targetPerfection,
        isSublime,
        targetMult,
        config.maxCompletion,
        config.maxPerfection,
        scoringCtx,
        cfg.goalPriorityBias,
        cfg.overcraftAmbition,
        cfg.perfectionBandGoal,
        cfg.completionBandCeiling,
      );
    }

    if (!actionConsumesTurn(skill)) {
      return search(
        newState,
        remainingDepth,
        depthIndex,
        conditionAtDepth,
        conditionQueueAtDepth,
      );
    }

    const transitions = getConditionTransitionsWithProvider(
      conditionAtDepth,
      conditionQueueAtDepth,
      newState.conditionGenerationHarmony ?? newState.harmony,
      cfg,
    );
    let expectedScore = 0;
    for (const transition of transitions) {
      const branchScore = search(
        newState,
        remainingDepth,
        depthIndex,
        transition.nextCondition,
        transition.nextQueue,
      );
      expectedScore += transition.probability * branchScore;
    }
    return expectedScore;
  }

  function getMostLikelyConditionStateAfterSkill(
    newState: CraftingState,
    conditionAtDepth: CraftingConditionType,
    conditionQueueAtDepth: CraftingConditionType[],
    skill: SkillDefinition,
  ): {
    nextCondition: CraftingConditionType;
    nextQueue: CraftingConditionType[];
  } {
    if (!actionConsumesTurn(skill)) {
      return {
        nextCondition: conditionAtDepth,
        nextQueue: conditionQueueAtDepth,
      };
    }

    const transitions = getConditionTransitionsWithProvider(
      conditionAtDepth,
      conditionQueueAtDepth,
      newState.conditionGenerationHarmony ?? newState.harmony,
      cfg,
    );
    const bestTransition = transitions[0];
    if (!bestTransition) {
      return {
        nextCondition: conditionAtDepth,
        nextQueue: conditionQueueAtDepth,
      };
    }
    return {
      nextCondition: bestTransition.nextCondition,
      nextQueue: bestTransition.nextQueue,
    };
  }

  /**
   * Find the optimal path (rotation) from a given state
   * Returns the sequence of skill names and the final state
   *
   * @param startState - State to start from
   * @param maxDepth - Maximum depth to search
   * @param startDepthIndex - The depth index to start from (for condition lookups)
   *
   * Uses the transposition table's bestMove entries to reconstruct the tree
   * search's actual chosen path.  Falls back to greedy evaluation for any
   * step where the cache does not contain a best-move entry.
   */
  function findOptimalPath(
    startState: CraftingState,
    maxDepth: number,
    startDepthIndex: number = 0,
    startConditionAtDepth: CraftingConditionType = normalizedCurrentCondition,
    startConditionQueueAtDepth: CraftingConditionType[] = initialConditionQueue,
  ): { path: string[]; finalState: CraftingState } {
    const path: string[] = [];
    let currentState = startState;
    let currentDepth = 0;
    let conditionAtDepth = startConditionAtDepth;
    let conditionQueueAtDepth = startConditionQueueAtDepth;

    while (
      currentDepth < maxDepth &&
      !isTerminalState(currentState, config, conditionAtDepth)
    ) {
      if (stateWillAutoFinish(currentState)) {
        break;
      }

      const globalDepth = startDepthIndex + currentDepth;
      const conditionEffectsAtDepth = getConditionEffectsForConfig(
        config,
        conditionAtDepth,
      );
      const skills = getAvailableSkills(currentState, config, conditionAtDepth);
      if (skills.length === 0) break;
      const {
        hasGuaranteedSafeStabilize,
        minimumGuaranteedContinuationStability,
      } = getGuaranteedSafeStabilizeContext(
        currentState,
        skills,
        conditionEffectsAtDepth,
        conditionAtDepth,
        true,
      );

      // Try to use the transposition table's recorded best move.
      // With iterative deepening, the exact remaining depth may not have
      // been searched (budget exhausted mid-iteration).  Probe backwards
      // from the deepest remaining depth to find the best available entry.
      const remainingDepth = maxDepth - currentDepth;
      let chosenSkill: SkillDefinition | null = null;
      let chosenNextState: CraftingState | null = null;

      const cachedBestMove =
        getCachedBestMoveKey(
          acceptedCache,
          currentState,
          conditionAtDepth,
          conditionQueueAtDepth,
          remainingDepth,
        ) ??
        probeCrossStepEntry(
          currentState,
          conditionAtDepth,
          conditionQueueAtDepth,
          remainingDepth,
        )?.bestMove ??
        null;
      if (cachedBestMove) {
        const cachedSkill = skills.find(
          (skill) => skill.key === cachedBestMove,
        );
        if (cachedSkill) {
          const nextState = applySkill(
            currentState,
            cachedSkill,
            config,
            conditionEffectsAtDepth,
            targetCompletion,
            conditionAtDepth,
          );
          if (nextState !== null) {
            const { searchState } = buildSearchStateForContinuation(
              currentState,
              cachedSkill,
              nextState,
              conditionEffectsAtDepth,
              conditionAtDepth,
              hasGuaranteedSafeStabilize,
              minimumGuaranteedContinuationStability,
            );
            chosenSkill = cachedSkill;
            chosenNextState = searchState;
          }
        }
      }

      // Fallback: greedy evaluation when cache miss or cached skill unavailable.
      if (!chosenSkill || !chosenNextState) {
        let bestScore = -Infinity;
        let bestCandidate: SearchMoveCandidate | null = null;
        const orderedFallbackCandidates = buildOrderedMoveCandidates(
          currentState,
          remainingDepth,
          conditionAtDepth,
          conditionQueueAtDepth,
          conditionEffectsAtDepth,
          true,
        );
        for (const candidate of orderedFallbackCandidates) {
          const skill = candidate.skill;
          const nextState = candidate.searchState;
          const score = evaluateFutureScoreAfterSkill(
            nextState,
            Math.max(0, remainingDepth - 1),
            globalDepth + 1,
            conditionAtDepth,
            conditionQueueAtDepth,
            skill,
          );
          const scoredCandidate: SearchMoveCandidate = {
            ...candidate,
            orderingScore: score,
          };

          const scoreDelta = score - bestScore;
          const isClearImprovement = scoreDelta > scoreTieWindow;
          const isScoreTie =
            Math.abs(scoreDelta) <= scoreTieWindow && bestCandidate;
          const winsTie =
            isScoreTie &&
            compareMoveCandidatesForTie(
              scoredCandidate,
              bestCandidate!,
              currentState,
            ) > 0;

          if (isClearImprovement || winsTie || bestCandidate === null) {
            bestScore = score;
            bestCandidate = scoredCandidate;
            chosenSkill = skill;
            chosenNextState = nextState;
          }
        }
      }

      if (!chosenSkill || !chosenNextState) {
        break;
      }

      path.push(chosenSkill.name);
      // Always land on the chosen successor before deciding whether the craft
      // ends here. Skipping this assignment on auto-finish left finalState one
      // action behind the rotation (e.g. False Fusion setup without the push).
      currentState = chosenNextState;
      if (stateWillAutoFinish(chosenNextState)) {
        break;
      }

      const nextConditionState = getMostLikelyConditionStateAfterSkill(
        chosenNextState,
        conditionAtDepth,
        conditionQueueAtDepth,
        chosenSkill,
      );

      conditionAtDepth = nextConditionState.nextCondition;
      conditionQueueAtDepth = nextConditionState.nextQueue;
      currentDepth++;
    }

    return { path, finalState: currentState };
  }

  /**
   * Evaluate all first moves at a specific depth.
   */
  const rootConditionEffects = getConditionEffectsForConfig(
    config,
    normalizedCurrentCondition,
  );
  let unsafeRootRecommendationKeys = new Set<string>();
  const recommendationTieMetricCache = new Map<
    string,
    CandidateTieBreakMetrics
  >();
  const getRecommendationTieMetrics = (
    recommendation: SkillRecommendation,
  ): CandidateTieBreakMetrics => {
    const cached = recommendationTieMetricCache.get(recommendation.skill.key);
    if (cached) {
      return cached;
    }

    const displayState =
      applySkill(
        state,
        recommendation.skill,
        config,
        rootConditionEffects,
        targetCompletion,
        normalizedCurrentCondition,
      ) ?? state;
    const metrics: CandidateTieBreakMetrics = {
      immediateProgress: calculateImmediateProgressTowardGoals(
        state,
        displayState,
        modeCompGoal,
        modePerfGoal,
        targetCompletion,
        targetPerfection,
      ),
      isStabilize: recommendation.skill.type === 'stabilize',
      requiresProbabilisticSurvival:
        recommendation.requiresProbabilisticSurvival === true,
      qiSpent: Math.max(0, state.qi - displayState.qi),
      skillKey: recommendation.skill.key,
    };
    recommendationTieMetricCache.set(recommendation.skill.key, metrics);
    return metrics;
  };
  const compareRecommendationScores = (
    a: SkillRecommendation,
    b: SkillRecommendation,
  ): number => {
    const scoreDiff = b.score - a.score;
    if (Math.abs(scoreDiff) > scoreTieWindow) {
      return scoreDiff;
    }

    const tieDiff = compareTieBreakMetrics(
      getRecommendationTieMetrics(a),
      getRecommendationTieMetrics(b),
    );
    if (tieDiff !== 0) {
      return tieDiff > 0 ? -1 : 1;
    }

    return a.skill.key.localeCompare(b.skill.key);
  };
  const orderRootRecommendations = (
    recommendations: SkillRecommendation[],
    unsafeKeys: ReadonlySet<string>,
  ): SkillRecommendation[] =>
    orderRecommendationsBySafety(
      recommendations,
      compareRecommendationScores,
      (recommendation) => unsafeKeys.has(recommendation.skill.key),
    );

  function findFollowUpSkill(
    stateAfterSkill: CraftingState,
    depthToSearch: number,
    depthIndex: number,
    conditionAtDepth: CraftingConditionType,
    nextConditionQueueAtDepth: CraftingConditionType[],
    useDeepLookahead: boolean = false,
  ): SkillRecommendation['followUpSkill'] | undefined {
    if (stateWillAutoFinish(stateAfterSkill)) {
      return undefined;
    }
    if (isTerminalState(stateAfterSkill, config, conditionAtDepth)) {
      return undefined;
    }

    const followUpConditionEffects = getConditionEffectsForConfig(
      config,
      conditionAtDepth,
    );
    const skills = getAvailableSkills(
      stateAfterSkill,
      config,
      conditionAtDepth,
    );
    const maxRemainingDepth = Math.max(0, depthToSearch - depthIndex);
    const cachedBestMove =
      getCachedBestMoveKey(
        acceptedCache,
        stateAfterSkill,
        conditionAtDepth,
        nextConditionQueueAtDepth,
        maxRemainingDepth,
      ) ??
      probeCrossStepEntry(
        stateAfterSkill,
        conditionAtDepth,
        nextConditionQueueAtDepth,
        maxRemainingDepth,
      )?.bestMove ??
      null;
    if (cachedBestMove) {
      const cachedSkill = skills.find((skill) => skill.key === cachedBestMove);
      if (cachedSkill) {
        const { expectedGains, immediateGains, effectiveCosts } =
          calculateRecommendationGains(
            stateAfterSkill,
            cachedSkill,
            config,
            followUpConditionEffects,
            applySkill(
              stateAfterSkill,
              cachedSkill,
              config,
              followUpConditionEffects,
              targetCompletion,
              conditionAtDepth,
            ),
          );
        return {
          name: cachedSkill.name,
          displayName: cachedSkill.displayName,
          type: cachedSkill.type,
          actionKind: cachedSkill.actionKind,
          icon: cachedSkill.icon,
          expectedGains,
          immediateGains,
          effectiveCosts,
        };
      }
    }

    const orderedFollowUpCandidates = buildOrderedMoveCandidates(
      stateAfterSkill,
      Math.max(1, maxRemainingDepth),
      conditionAtDepth,
      nextConditionQueueAtDepth,
      followUpConditionEffects,
      true,
    );
    if (orderedFollowUpCandidates.length === 0) {
      return undefined;
    }

    if (!useDeepLookahead || maxRemainingDepth <= 0) {
      const fallbackCandidate = orderedFollowUpCandidates[0];
      const followUpSkill = fallbackCandidate.skill;
      const { expectedGains, immediateGains, effectiveCosts } =
        calculateRecommendationGains(
          stateAfterSkill,
          followUpSkill,
          config,
          followUpConditionEffects,
          fallbackCandidate.searchState,
        );
      return {
        name: followUpSkill.name,
        displayName: followUpSkill.displayName,
        type: followUpSkill.type,
        actionKind: followUpSkill.actionKind,
        icon: followUpSkill.icon,
        expectedGains,
        immediateGains,
        effectiveCosts,
      };
    }

    let bestFollowUp: SkillDefinition | null = null;
    let bestFollowUpCandidate: SearchMoveCandidate | null = null;
    let bestFollowUpScore = -Infinity;
    let bestFollowUpExpectedGains: GainPreview = {
      completion: 0,
      perfection: 0,
      stability: 0,
    };
    let bestFollowUpImmediateGains: GainPreview = {
      completion: 0,
      perfection: 0,
      stability: 0,
    };
    let bestFollowUpEffectiveCosts: ActionCostPreview = {
      qi: 0,
      stability: 0,
    };
    let bestFollowUpSuccessChance: number | undefined = undefined;

    for (const candidate of orderedFollowUpCandidates) {
      const followUp = candidate.skill;
      const nextState = candidate.searchState;

      const { expectedGains, immediateGains, effectiveCosts } =
        calculateRecommendationGains(
          stateAfterSkill,
          followUp,
          config,
          followUpConditionEffects,
          nextState,
        );
      const followUpScore = evaluateFutureScoreAfterSkill(
        nextState,
        Math.max(0, depthToSearch - 1 - depthIndex),
        depthIndex + 1,
        conditionAtDepth,
        nextConditionQueueAtDepth,
        followUp,
      );

      const scoreDelta = followUpScore - bestFollowUpScore;
      const isClearImprovement = scoreDelta > scoreTieWindow;
      const isScoreTie =
        Math.abs(scoreDelta) <= scoreTieWindow && bestFollowUpCandidate;
      const winsTie =
        isScoreTie &&
        compareMoveCandidatesForTie(
          candidate,
          bestFollowUpCandidate!,
          stateAfterSkill,
        ) > 0;

      if (isClearImprovement || winsTie || bestFollowUpCandidate === null) {
        bestFollowUpScore = followUpScore;
        bestFollowUp = followUp;
        bestFollowUpCandidate = candidate;
        bestFollowUpExpectedGains = expectedGains;
        bestFollowUpImmediateGains = immediateGains;
        bestFollowUpEffectiveCosts = effectiveCosts;
        bestFollowUpSuccessChance = candidate.projectedSuccessChance;
      }
    }

    if (!bestFollowUp) {
      return undefined;
    }

    return {
      name: bestFollowUp.name,
      displayName: bestFollowUp.displayName,
      type: bestFollowUp.type,
      actionKind: bestFollowUp.actionKind,
      icon: bestFollowUp.icon,
      expectedGains: bestFollowUpExpectedGains,
      immediateGains: bestFollowUpImmediateGains,
      effectiveCosts: bestFollowUpEffectiveCosts,
      projectedSuccessChance: bestFollowUpSuccessChance,
    };
  }

  function evaluateFirstMoves(
    depthToSearch: number,
    useDeepSearch: boolean,
  ): {
    recommendations: SkillRecommendation[];
    unsafeRecommendationKeys: Set<string>;
    completed: boolean;
    evaluatedDepth: number;
  } {
    const currentConditionEffects = getConditionEffectsForConfig(
      config,
      normalizedCurrentCondition,
    );
    const rootAvailableSkills = getAvailableSkills(
      state,
      config,
      normalizedCurrentCondition,
    );
    const {
      hasGuaranteedSafeStabilize,
      minimumGuaranteedContinuationStability,
    } = getGuaranteedSafeStabilizeContext(
      state,
      rootAvailableSkills,
      currentConditionEffects,
      normalizedCurrentCondition,
      true,
    );
    const orderedCandidatesAll = buildOrderedMoveCandidates(
      state,
      depthToSearch,
      normalizedCurrentCondition,
      initialConditionQueue,
      currentConditionEffects,
      true,
    );
    // Worker-pool root partitioning: restrict this call to its slice of the
    // root candidates. Deeper frontiers always see the full move set.
    const rootSkillKeyFilter = cfg.rootSkillKeys
      ? new Set(cfg.rootSkillKeys)
      : null;
    const orderedCandidates = rootSkillKeyFilter
      ? orderedCandidatesAll.filter((candidate) =>
          rootSkillKeyFilter.has(candidate.skill.key),
        )
      : orderedCandidatesAll;
    const evaluatedFirstMoves: Array<
      SkillRecommendation & UnsafeCandidateClassification
    > = [];
    const unsafeRecommendationKeys = new Set<string>();

    // First pass: evaluate ALL first-level skills with basic scoring
    // This ensures we always have alternatives even if deep search times out
    for (const candidate of orderedCandidates) {
      const skill = candidate.skill;
      const newState = candidate.searchState;
      if (candidate.unsafeWithGuaranteedSafeAlternative) {
        unsafeRecommendationKeys.add(skill.key);
      }

      const firstMoveConditionState = getMostLikelyConditionStateAfterSkill(
        newState,
        normalizedCurrentCondition,
        initialConditionQueue,
        skill,
      );
      const terminalState = classifyTerminalState(
        newState,
        config,
        firstMoveConditionState.nextCondition,
        modeCompGoal,
        modePerfGoal,
      );
      const endsCraft = stateWillAutoFinish(newState);

      const { expectedGains, immediateGains, effectiveCosts } =
        calculateRecommendationGains(
          state,
          skill,
          config,
          currentConditionEffects,
          newState,
        );
      const reasoning = generateReasoning(
        skill,
        state,
        expectedGains,
        targetCompletion,
        targetPerfection,
        { endsCraft },
      );

      const immediateScore = estimatePostMoveStateScore(
        newState,
        skill,
        normalizedCurrentCondition,
        initialConditionQueue,
      );

      evaluatedFirstMoves.push({
        skill,
        expectedGains,
        immediateGains,
        effectiveCosts,
        score: immediateScore,
        reasoning,
        consumesBuff: skill.isDisciplinedTouch === true,
        followUpSkill: undefined,
        projectedSuccessChance: candidate.projectedSuccessChance,
        endsCraft,
        endsCraftBelowTarget:
          (endsCraft || terminalState.isTerminal) &&
          !goalsMet(newState, targetCompletion, targetPerfection),
        requiresProbabilisticSurvival: candidate.requiresProbabilisticSurvival,
        ...terminalState,
      });
    }

    const scored: SkillRecommendation[] = orderRootRecommendations(
      evaluatedFirstMoves.map(({ isTerminal, isTerminalUnmet, ...rec }) => rec),
      unsafeRecommendationKeys,
    );
    unsafeRootRecommendationKeys = unsafeRecommendationKeys;

    if (!useDeepSearch || depthToSearch <= 1) {
      return {
        recommendations: scored,
        unsafeRecommendationKeys,
        completed: true,
        evaluatedDepth: Math.min(1, depthToSearch),
      };
    }

    // Second pass: enhance scores with deep lookahead if budget allows.
    // Follow-up generation stays out of the critical path so recommendation
    // budget is spent on first-move ranking, not auxiliary UI details.
    const deepenedRecommendations = scored.map((rec) => ({ ...rec }));

    for (const rec of deepenedRecommendations) {
      if (checkBudget()) {
        break;
      }

      const displayState = applySkill(
        state,
        rec.skill,
        config,
        currentConditionEffects,
        targetCompletion,
        normalizedCurrentCondition,
      );
      if (displayState === null) continue;
      const { searchState } = buildSearchStateForContinuation(
        state,
        rec.skill,
        displayState,
        currentConditionEffects,
        normalizedCurrentCondition,
        hasGuaranteedSafeStabilize,
        minimumGuaranteedContinuationStability,
      );

      rec.score = evaluateFutureScoreAfterSkill(
        searchState,
        Math.max(0, depthToSearch - 1),
        1,
        normalizedCurrentCondition,
        initialConditionQueue,
        rec.skill,
      );
    }

    if (shouldTerminate) {
      return {
        recommendations: scored,
        unsafeRecommendationKeys,
        completed: false,
        evaluatedDepth: 1,
      };
    }

    return {
      recommendations: orderRootRecommendations(
        deepenedRecommendations,
        unsafeRecommendationKeys,
      ),
      unsafeRecommendationKeys,
      completed: true,
      evaluatedDepth: depthToSearch,
    };
  }

  function populateFollowUpSkills(
    recommendations: SkillRecommendation[],
    depthToSearch: number,
  ): void {
    if (recommendations.length === 0) {
      return;
    }

    const currentConditionEffects = getConditionEffectsForConfig(
      config,
      normalizedCurrentCondition,
    );
    const rootAvailableSkills = getAvailableSkills(
      state,
      config,
      normalizedCurrentCondition,
    );
    const {
      hasGuaranteedSafeStabilize,
      minimumGuaranteedContinuationStability,
    } = getGuaranteedSafeStabilizeContext(
      state,
      rootAvailableSkills,
      currentConditionEffects,
      normalizedCurrentCondition,
      true,
    );
    const fallbackFollowUpCount = 3;

    for (
      let index = 0;
      index < Math.min(fallbackFollowUpCount, recommendations.length);
      index++
    ) {
      const rec = recommendations[index];
      const displayStateAfterSkill = applySkill(
        state,
        rec.skill,
        config,
        currentConditionEffects,
        targetCompletion,
        normalizedCurrentCondition,
      );
      if (displayStateAfterSkill === null) {
        continue;
      }
      const { searchState: stateAfterSkill } = buildSearchStateForContinuation(
        state,
        rec.skill,
        displayStateAfterSkill,
        currentConditionEffects,
        normalizedCurrentCondition,
        hasGuaranteedSafeStabilize,
        minimumGuaranteedContinuationStability,
      );

      const followUpConditionState = getMostLikelyConditionStateAfterSkill(
        stateAfterSkill,
        normalizedCurrentCondition,
        initialConditionQueue,
        rec.skill,
      );
      // Follow-up display must not consume the remaining search budget after
      // ranking is finished. Use cache-probed best moves first, then the
      // shallow ordered fallback inside findFollowUpSkill.
      const canUseDeepLookahead = false;
      rec.followUpSkill = findFollowUpSkill(
        stateAfterSkill,
        depthToSearch,
        1,
        followUpConditionState.nextCondition,
        followUpConditionState.nextQueue,
        canUseDeepLookahead,
      );
    }
  }

  const depthPlan = (() => {
    if (!cfg.useIterativeDeepening || depth <= 1) {
      return [depth];
    }
    const minDepth = Math.max(
      1,
      Math.min(cfg.iterativeDeepeningMinDepth, depth),
    );
    const depths: number[] = [];
    for (let d = minDepth; d <= depth; d++) {
      depths.push(d);
    }
    return depths;
  })();

  const baselineDepth = depth > 0 ? 1 : 0;
  const baselineResult = evaluateFirstMoves(baselineDepth, false);
  let usedDepth = baselineResult.evaluatedDepth;
  let scoredSkills: SkillRecommendation[] = baselineResult.recommendations;
  unsafeRootRecommendationKeys = baselineResult.unsafeRecommendationKeys;

  if (baselineResult.recommendations.length > 0) {
    metrics.depthReached = baselineResult.evaluatedDepth;
  }

  // Early exit stability tracking: stop deepening when the top recommendation
  // has been the same for several consecutive fully completed passes with a
  // comfortable score margin. Requires a minimum depth so trivial 1-step states
  // don't exit before a meaningful frontier is established. The minimum depth
  // sits far below the old 35%-of-depth gate: replay instrumentation shows
  // real 2s searches are time-bound around depth 3-7, where the old gate
  // (depth 22+ for a 64-deep plan) could never fire. The margin and
  // risky-challenger checks stay conservative so contested states keep
  // searching.
  const EARLY_EXIT_STABLE_PASSES = 3;
  const EARLY_EXIT_MIN_DEPTH = baselineDepth + 2;
  const EARLY_EXIT_MARGIN_MULTIPLIER = 10;
  const recentTopKeys: string[] = [];

  for (const candidateDepth of depthPlan) {
    if (candidateDepth <= baselineDepth) {
      continue;
    }
    if (checkBudget()) break;
    const candidateResult = evaluateFirstMoves(candidateDepth, true);
    const candidateSkills = candidateResult.recommendations;
    const candidateUnsafeKeys = candidateResult.unsafeRecommendationKeys;
    const iterationCompleted = candidateResult.completed;
    const evaluatedDepth = candidateResult.evaluatedDepth;

    // Preserve the last fully completed iteration. A deeper pass that hits a
    // budget limit mid-evaluation is only a partial frontier and should not
    // overwrite a fully completed shallower pass.
    if (iterationCompleted && candidateSkills.length > 0) {
      scoredSkills = candidateSkills;
      unsafeRootRecommendationKeys = candidateUnsafeKeys;
      usedDepth = evaluatedDepth;
      acceptedCache = new Map(cache);
      metrics.depthReached = evaluatedDepth;

      // Track the top recommendation for early exit detection.
      // Only check stability at meaningful depths.
      if (evaluatedDepth >= EARLY_EXIT_MIN_DEPTH) {
        const topRecommendation = candidateSkills[0];
        const topKey = topRecommendation?.skill?.key ?? '';
        recentTopKeys.push(topKey);
        if (recentTopKeys.length > EARLY_EXIT_STABLE_PASSES) {
          recentTopKeys.shift();
        }
        // Exit early when the top recommendation is stable, has a comfortable
        // score margin over the runner-up, and no risky/terminal line is close
        // enough to plausibly change the recommendation at a deeper frontier.
        const topScore = topRecommendation?.score ?? -Infinity;
        const runnerUpScore = candidateSkills[1]?.score ?? -Infinity;
        const margin = topScore - runnerUpScore;
        const stableMarginThreshold = Math.max(
          EARLY_EXIT_MARGIN_MULTIPLIER * scoreTieWindow,
          scoringCtx.avgGainPerTurn * 2,
        );
        const isTopKeyStable =
          recentTopKeys.length === EARLY_EXIT_STABLE_PASSES &&
          recentTopKeys.every((k) => k === recentTopKeys[0]) &&
          recentTopKeys[0] !== '';
        // Scan challengers only: the top line's own risk flags were already
        // priced into its score by the completed passes, so they must not
        // block the exit — what matters is whether a *challenger* close
        // enough to overtake at a deeper frontier is risky or terminal.
        const hasRiskyNearTopLine = candidateSkills
          .slice(1, Math.min(4, candidateSkills.length))
          .some(
            (rec) =>
              topScore - rec.score <= stableMarginThreshold &&
              (rec.endsCraft ||
                rec.requiresProbabilisticSurvival === true ||
                candidateUnsafeKeys.has(rec.skill.key)),
          );
        if (
          isTopKeyStable &&
          margin > stableMarginThreshold &&
          !hasRiskyNearTopLine
        ) {
          metrics.earlyExit = {
            reason: 'stableRecommendation',
            depth: evaluatedDepth,
            stablePasses: EARLY_EXIT_STABLE_PASSES,
            scoreMargin: margin,
          };
          break;
        }
      }
    }

    if (shouldTerminate) {
      break;
    }
  }

  if (metrics.depthReached === 0) {
    metrics.depthReached = usedDepth;
  }

  // Publish this call's accepted (completed-pass) frontier into the
  // cross-step table so the next step of this craft scope can reuse it.
  // acceptedCache is empty when no pass completed, so truncated searches
  // never publish partial frontiers.
  if (crossStepTable && acceptedCache.size > 0) {
    acceptedCache.forEach((entry, key) => {
      crossStepTable.set(key, entry);
    });
  }

  if (scoredSkills.length === 0) {
    metrics.timeTakenMs = Date.now() - startTime;
    return {
      status: 'blocked',
      recommendation: null,
      alternativeSkills: [],
      isTerminal: true,
      targetsMet: targetsMetForCurrentMode(state),
      blockedReasons: getBlockedSkillReasons(
        state,
        config,
        normalizedCurrentCondition,
      ),
      searchMetrics: metrics,
    };
  }

  const rankedSkills = rankRecommendations(
    scoredSkills,
    scoreTieWindow,
    unsafeRootRecommendationKeys,
    (a, b) => {
      return compareTieBreakMetrics(
        getRecommendationTieMetrics(a),
        getRecommendationTieMetrics(b),
      );
    },
  );
  populateFollowUpSkills(rankedSkills, usedDepth);
  populateSetupHints(
    rankedSkills,
    state,
    config,
    targetCompletion,
    normalizedCurrentCondition,
  );

  // Find the optimal rotation starting from the best first move
  const bestFirstMove = rankedSkills[0].skill;
  const currentConditionEffects = getConditionEffectsForConfig(
    config,
    normalizedCurrentCondition,
  );
  const stateAfterFirstMoveDisplay = applySkill(
    state,
    bestFirstMove,
    config,
    currentConditionEffects,
    targetCompletion,
    normalizedCurrentCondition,
  );
  const rootAvailableSkillsForRotation = getAvailableSkills(
    state,
    config,
    normalizedCurrentCondition,
  );
  const {
    hasGuaranteedSafeStabilize: rotationHasGuaranteedSafeStabilize,
    minimumGuaranteedContinuationStability:
      rotationMinimumGuaranteedContinuationStability,
  } = getGuaranteedSafeStabilizeContext(
    state,
    rootAvailableSkillsForRotation,
    currentConditionEffects,
    normalizedCurrentCondition,
    true,
  );

  let optimalRotation: string[] = [bestFirstMove.name];
  let expectedFinalState: SearchResult['expectedFinalState'] = undefined;

  // The rotation carries internal names so callers can match it against
  // `SkillDefinition.name`; the labels are resolved once here for display.
  const rotationLabelsByName = new Map<string, string>();
  for (const skill of config.skills) {
    rotationLabelsByName.set(skill.name, techniqueDisplayName(skill));
  }
  const rotationLabelForName = (name: string): string =>
    rotationLabelsByName.get(name) ?? name;

  if (stateAfterFirstMoveDisplay) {
    const { searchState: stateAfterFirstMove } =
      buildSearchStateForContinuation(
        state,
        bestFirstMove,
        stateAfterFirstMoveDisplay,
        currentConditionEffects,
        normalizedCurrentCondition,
        rotationHasGuaranteedSafeStabilize,
        rotationMinimumGuaranteedContinuationStability,
      );
    const firstMoveConditionState = getMostLikelyConditionStateAfterSkill(
      stateAfterFirstMove,
      normalizedCurrentCondition,
      initialConditionQueue,
      bestFirstMove,
    );
    const { path, finalState } = findOptimalPath(
      stateAfterFirstMove,
      Math.max(0, usedDepth - 1),
      1,
      firstMoveConditionState.nextCondition,
      firstMoveConditionState.nextQueue,
    );
    optimalRotation = [bestFirstMove.name, ...path];

    // Ensure the top recommendation's follow-up matches the rotation.
    // findFollowUpSkill may diverge from the rotation under budget pressure
    // (shallow fallback), but the rotation uses cache-probed bestMove entries
    // which are more authoritative.  If the rotation's second move differs
    // from the current follow-up, update it.
    if (path.length > 0) {
      const rotationSecondSkillName = path[0];
      const topRec = rankedSkills[0];
      if (
        topRec &&
        topRec.skill.key === bestFirstMove.key &&
        (!topRec.followUpSkill ||
          topRec.followUpSkill.name !== rotationSecondSkillName)
      ) {
        const secondSkill = config.skills.find(
          (s) => s.name === rotationSecondSkillName,
        );
        if (secondSkill) {
          const secondConditionEffects = getConditionEffectsForConfig(
            config,
            firstMoveConditionState.nextCondition,
          );
          const { expectedGains, immediateGains, effectiveCosts } =
            calculateRecommendationGains(
              stateAfterFirstMove,
              secondSkill,
              config,
              secondConditionEffects,
              applySkill(
                stateAfterFirstMove,
                secondSkill,
                config,
                secondConditionEffects,
                targetCompletion,
                firstMoveConditionState.nextCondition,
              ),
            );
          topRec.followUpSkill = {
            name: secondSkill.name,
            displayName: secondSkill.displayName,
            type: secondSkill.type,
            actionKind: secondSkill.actionKind,
            icon: secondSkill.icon,
            expectedGains,
            immediateGains,
            effectiveCosts,
          };
        }
      }
    }

    // Calculate turns remaining (estimate based on progress needed)
    const compRemaining = Math.max(
      0,
      effectiveCompGoal - finalState.completion,
    );
    const perfRemaining = Math.max(
      0,
      effectivePerfGoal - finalState.perfection,
    );
    const projectedSuccessChance = calculateFinishSuccessChance(
      finalState,
      targetCompletion,
    );
    const turnsRemaining = stateWillAutoFinish(finalState)
      ? 0
      : estimateTurnsRemainingFromContext(
          compRemaining,
          perfRemaining,
          scoringCtx,
        );

    expectedFinalState = {
      targetsMet: targetsMetForCurrentMode(finalState),
      outcomeProjection: buildOutcomeProjection(finalState, outcomeBands),
      completion: finalState.completion,
      perfection: finalState.perfection,
      stability: finalState.stability,
      maxStability: finalState.maxStability,
      qi: finalState.qi,
      turnsRemaining: turnsRemaining > 0 ? turnsRemaining : 0,
      projectedSuccessChance,
    };
  }

  // Record final metrics
  metrics.timeTakenMs = Date.now() - startTime;

  return {
    status: 'live',
    recommendation: rankedSkills[0],
    alternativeSkills: rankedSkills.slice(1),
    isTerminal: false,
    targetsMet: targetsMetForCurrentMode(state),
    optimalRotation,
    optimalRotationLabels: optimalRotation.map(rotationLabelForName),
    expectedFinalState,
    searchMetrics: metrics,
  };
}
