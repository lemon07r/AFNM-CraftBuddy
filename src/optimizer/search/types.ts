import {
  calculateActionSurvivabilityFloor,
  SkillDefinition,
  type SkillBlockedReason,
} from '../skills';

import type { OutcomeTier } from '../outcome';

import { CraftingState } from '../state';

export type {
  ConditionTransition,
  TerminalStateClassification,
  ActionSurvivabilityFloor,
  CandidateTieBreakMetrics,
  GainPreview,
  ActionCostPreview,
  UnsafeCandidateClassification,
  SearchMoveCandidate,
  TranspositionCache,
  TranspositionCacheEntry,
};

interface GainPreview {
  completion: number;
  perfection: number;
  stability: number;
}

interface ActionCostPreview {
  qi: number;
  stability: number;
}

type ActionSurvivabilityFloor = ReturnType<
  typeof calculateActionSurvivabilityFloor
>;

export interface SkillRecommendation {
  skill: SkillDefinition;
  /** Projected expected-value gain (includes RNG EV). */
  expectedGains: GainPreview;
  /** Immediate tooltip-style gain (without RNG EV multipliers). */
  immediateGains: GainPreview;
  /** Effective action costs after runtime modifiers (buffs/condition/harmony). */
  effectiveCosts: ActionCostPreview;
  score: number;
  reasoning: string;
  /** Quality rating from 0-100 based on how close to optimal this choice is */
  qualityRating?: number;
  /** Whether this skill consumes buffs for gains (e.g., Disciplined Touch) */
  consumesBuff?: boolean;
  /** Suggested follow-up skill after this one */
  followUpSkill?: {
    name: string;
    displayName?: string;
    type: string;
    actionKind?: SkillDefinition['actionKind'];
    icon?: string;
    expectedGains: GainPreview;
    immediateGains: GainPreview;
    effectiveCosts: ActionCostPreview;
  };
  /** Whether executing this action would resolve the craft immediately. */
  endsCraft?: boolean;
  /** Whether the line depends on probabilistic survival rather than a guaranteed floor. */
  requiresProbabilisticSurvival?: boolean;
  /** Whether a viable guaranteed-safe line should outrank this one regardless of score. */
  yieldsToSafeAlternative?: boolean;
  /** Whether this action certainly ends the craft without meeting the base target. */
  endsCraftBelowTarget?: boolean;
  /**
   * Present when the action's value comes from unlocking a currently-gated
   * technique rather than from its own gains (for example rushing completion to
   * open False Fusion). Lets the UI present a setup turn as deliberate instead
   * of wasted.
   */
  setupFor?: SetupForHint;
}

/** Why an action is worth taking even though its own gains look weak. */
export interface SetupForHint {
  /** Stable key of the technique this action unlocks. */
  readonly techniqueKey: string;
  /**
   * Player-facing label for that technique, as the game labels it.
   *
   * Supplied so the panel never has to reconstruct a name from the key: 0.7.6
   * shows `false_fusion` as "Strive for Completion", which no key-to-title
   * transformation could produce.
   */
  readonly techniqueName?: string;
  /** Human-readable explanation for the panel. */
  readonly reason: string;
}

/**
 * One progress bar measured against the band ladder of the target tier.
 *
 * Every field is derived by `./outcome`, so consumers (notably the UI) never
 * recompute a threshold and can never drift from the scorer.
 */
export interface OutcomeBarStatus {
  /** Current value on this bar. */
  readonly value: number;
  /** Bands guaranteed by `value`, ignoring the bonus roll. */
  readonly bands: number;
  /** Bands the target tier requires on this bar. */
  readonly requiredBands: number;
  /** Value at which the next band becomes guaranteed. */
  readonly nextThreshold: number;
  /** Points still needed to reach `nextThreshold`. */
  readonly pointsToNextBand: number;
  /** Probability the runtime's single bonus roll grants one extra band. */
  readonly bonusChance: number;
}

/**
 * Outcome the current state is on track for, in the shared evaluator's terms.
 *
 * Attached to `SearchResult` so presentation layers can explain a
 * recommendation ("perfection is the binding bar, 42 points to the next band")
 * without duplicating any band logic.
 */
export interface OutcomeProjection {
  /** Tier guaranteed by the current bars. */
  readonly tier: OutcomeTier;
  /** Tier reachable if both bonus rolls land. */
  readonly optimisticTier: OutcomeTier;
  /** Best tier this craft can reach at all — what the search aims at. */
  readonly targetTier: OutcomeTier;
  readonly completion: OutcomeBarStatus;
  readonly perfection: OutcomeBarStatus;
  /** Bar that is short of the target tier, or `'none'` once both are met. */
  readonly bindingBar: 'completion' | 'perfection' | 'none';
  /** True when the game's auto-finish predicate already holds. */
  readonly willAutoFinish: boolean;
}

export interface SearchResult {
  /** Resolution is independent of goal achievement and action legality. */
  status: 'live' | 'autoResolved' | 'blocked';
  recommendation: SkillRecommendation | null;
  alternativeSkills: SkillRecommendation[];
  /** Compatibility flag: true for either automatic resolution or blocked legality. */
  isTerminal: boolean;
  /** Whether the root meets the effective goals; never a resolution instruction. */
  targetsMet: boolean;
  /**
   * Outcome the searched-from state is on track for. Optional so older replay
   * snapshots and hand-built fixtures stay valid; consumers must degrade to a
   * legacy layout when it is absent.
   */
  outcomeProjection?: OutcomeProjection;
  /** Diagnostic info for why no skills are available (when isTerminal is true) */
  blockedReasons?: SkillBlockedReason[];
  /** Full optimal rotation (sequence of skills) to reach targets */
  optimalRotation?: string[];
  /**
   * `optimalRotation` rendered with the game's own technique labels.
   *
   * Parallel to `optimalRotation`, which stays on internal names because callers
   * compare it against `SkillDefinition.name`. Absent on older replay fixtures,
   * in which case the UI falls back to the internal names.
   */
  optimalRotationLabels?: string[];
  /** Expected final state if following the optimal rotation */
  expectedFinalState?: {
    completion: number;
    perfection: number;
    stability: number;
    maxStability: number;
    qi: number;
    turnsRemaining: number;
    projectedSuccessChance?: number;
    targetsMet?: boolean;
    outcomeProjection?: OutcomeProjection;
  };
  /** Search performance metrics */
  searchMetrics?: {
    /** Cache-miss frontier nodes that were actually expanded. */
    nodesExplored: number;
    cacheHits: number;
    /** Hits served from the shared cross-step table (completed passes from earlier steps of this craft scope). */
    crossStepHits?: number;
    timeTakenMs: number;
    /** Deepest fully completed frontier kept for the returned result set. */
    depthReached: number;
    /** Iterative-deepening exited after a stable completed frontier. */
    earlyExit?: {
      reason: 'stableRecommendation';
      depth: number;
      stablePasses: number;
      scoreMargin: number;
    };
  };
}

/**
 * Search configuration for performance tuning
 */
export interface SearchConfig {
  /** Maximum time budget in milliseconds (default: 500ms) */
  timeBudgetMs: number;
  /** Maximum cache-miss frontier nodes to expand before stopping (default: 200000) */
  maxNodes: number;
  /** Beam width - max branches to explore at each level (default: 8) */
  beamWidth: number;
  /**
   * Completion/perfection search bias.
   * -100 = perfection priority, 0 = balanced, 100 = completion priority.
   */
  goalPriorityBias: number;
  /** Progress bucket size for cache key normalization (default: 100) */
  progressBucketSize: number;
  /**
   * Use iterative deepening for long crafts (default: true).
   * Starts with shallow search and increases depth incrementally.
   */
  useIterativeDeepening: boolean;
  /**
   * Minimum depth for iterative deepening (default: 3).
   */
  iterativeDeepeningMinDepth: number;
  /**
   * Adaptive beam width based on local remaining depth (default: true).
   * Narrows short-horizon subproblems without making cache validity depend on
   * the original root depth.
   */
  useAdaptiveBeamWidth: boolean;
  /**
   * Enable probability-weighted condition branching once forecast queue is exhausted.
   */
  enableConditionBranchingAfterForecast: boolean;
  /**
   * Max number of condition branches to keep per step when branching.
   */
  conditionBranchLimit: number;
  /**
   * Minimum branch probability retained before top-N fallback.
   */
  conditionBranchMinProbability: number;
  /**
   * 0.7.7+ Uncontrollable Flames discordance (0-1): while a buff carrying
   * `discordantConditions` is held, would-be Balanced queue rolls only stay
   * Balanced (1 - d) of the time. Computed from the root state's buffs when
   * unset; equipment-granted and constant for the craft.
   */
  conditionDiscordance?: number;
  /**
   * Overcraft ambition (default: true). When true, extra bands past the
   * target tier earn unilateral value up to the game's caps, mirroring the
   * runtime's per-bar rewards; when false, scoring is tier-only with the
   * legacy conjunctive extras term.
   */
  overcraftAmbition?: boolean;
  /**
   * Desired perfection bands ("stars"). 0/undefined is auto - the target
   * tier's requirement is the goal, exactly as before. A higher value raises
   * the effective perfection goal to that band's threshold so the search keeps
   * working past the tier without touching the tier gates themselves.
   */
  perfectionBandGoal?: number;
  /**
   * Completion band ceiling. 0/undefined is auto. A higher value stops
   * overcraft extras from paying for completion past that band, which is what
   * redirects leftover effort into perfection.
   */
  completionBandCeiling?: number;
  /**
   * Shared transposition table carried across the steps of a craft (see
   * `CrossStepSearchCache`). Entries are keyed by state/depth/condition and
   * assume the caller drops the table whenever the craft or any scoring input
   * changes. When omitted the search uses a fresh per-call table.
   */
  transpositionCache?: TranspositionCache;
  /**
   * Restricts the root move candidates to these skill keys (worker-pool root
   * partitioning). Deeper frontiers are unaffected. Keys that are unavailable
   * at the root are simply absent from the candidate set.
   */
  rootSkillKeys?: readonly string[];
  /**
   * Cooperative cancellation polled alongside the budget checks. Not
   * serializable: set by an in-process wrapper (search worker), never sent
   * across the wire.
   */
  shouldAbort?: () => boolean;
}

interface ConditionTransition {
  nextCondition: CraftingConditionType;
  nextQueue: CraftingConditionType[];
  probability: number;
}

export type ConditionTransitionProvider = (
  currentCondition: CraftingConditionType,
  nextConditions: CraftingConditionType[],
  harmony: number,
  cfg: SearchConfig,
) => ConditionTransition[];

interface TerminalStateClassification {
  isTerminal: boolean;
}

interface UnsafeCandidateClassification extends TerminalStateClassification {
  requiresProbabilisticSurvival?: boolean;
}

interface CandidateTieBreakMetrics {
  immediateProgress: number;
  isStabilize: boolean;
  requiresProbabilisticSurvival: boolean;
  qiSpent: number;
  skillKey: string;
}

interface SearchMoveCandidate {
  skill: SkillDefinition;
  nextState: CraftingState;
  searchState: CraftingState;
  survivabilityFloor: ActionSurvivabilityFloor;
  orderingScore: number;
  immediateProgress: number;
  requiresProbabilisticSurvival: boolean;
  unsafeWithGuaranteedSafeAlternative?: boolean;
}

// Structural aliases for the shared types; `CrossStepSearchCache` in
// crossStepCache.ts hands one table across the steps of a craft.
type TranspositionCacheEntry =
  import('../crossStepCache').TranspositionCacheEntry;

type TranspositionCache = import('../crossStepCache').TranspositionCache;

/**
 * Type for crafting conditions (matches game's CraftingCondition type)
 */
export type CraftingConditionType = string;
