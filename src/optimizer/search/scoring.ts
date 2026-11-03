import {
  DEFAULT_SEARCH_GOAL_PRIORITY_BIAS,
  clampSearchGoalPriorityBias,
  SEARCH_GOAL_PRIORITY_BIAS_MAX,
} from '../../utils/searchGoalPriority';

import {
  type OutcomeClassification,
  tierRank,
  type OutcomeBands,
  TIER_REQUIREMENTS,
  bandThreshold,
  type OutcomeTier,
  computeOvercraftExtras,
  classifyOutcome,
} from '../outcome';

import { CraftingState } from '../state';

import {
  type ScoringContext,
  DEFAULT_SCORING_CONTEXT,
  estimateWeightedProgressPerTurn,
  estimateTurnsRemainingFromContext,
} from './scoringContext';

import { deriveBandGoals } from './goals';

import { evaluateHarmonySubsystemQuality } from './harmonyScoring';

export { SCORING, scoreFinishedOutcome, scoreState, getGoalPriorityWeights };

// ── Scoring weights ─────────────────────────────────────────────────────────
// Each constant documents its magnitude relative to other scoring layers.
// All penalties/bonuses that depend on craft size use totalTargetMagnitude
// as the base, so they scale proportionally to any craft.
//
// Commensurability of the conjunctive goal stack (Change 1):
//   tier jump = TIER_VALUE_SCALE × magnitude (= 2×) is strictly greater than
//   the maximum within-tier stack (gate + balance + bonus + in-tier ≤ ~1.6×),
//   so banking a tier always beats pure margin progress. Death stays at
//   DEATH_PENALTY_MULTIPLIER × magnitude (= 3×), so dying never beats a tier.
const SCORING = {
  // Discrete tier value inside the conjunctive goal score.
  // 2× magnitude per tier rank — dominates the entire within-tier stack.
  TIER_VALUE_SCALE: 2,
  // Binding-bar gate: Math.min(completionMargin, perfectionMargin).
  // Once a bar is met (margin === 1), more of it cannot raise the min.
  GATE_WEIGHT: 1,
  // Weighted average of both margins — secondary pressure to keep bars even.
  // 0.35× so gate + balance ≤ 1.35× even at full margins.
  BALANCE_WEIGHT: 0.35,
  // Credit for a bonus-roll that could upgrade the tier when one band short.
  // 0.2× keeps near-miss EV below a guaranteed band step.
  BONUS_ROLL_WEIGHT: 0.2,
  // Fine-grained residual shortfall fill (0–1). Supplies early gradient while
  // tierRank is flat at `failed` before the first completion band.
  IN_TIER_PROGRESS_WEIGHT: 0.05,
  // Extra bands past the target tier. With overcraft ambition off they are
  // counted conjunctively (min of the two bars' extras) at 0.75× base
  // magnitude per pair. With ambition on they are counted unilaterally once
  // the tier is secured, matching the runtime reward: each extra perfection
  // band pays +20% of the product stacks (or +1 quality on the sublime
  // result), so it keeps the full 0.75× per band.
  EXTRA_BAND_WEIGHT: 0.75,
  // Unilateral extra completion bands pay a material refund of
  // (bands - 1) × 20% capped at 80% of the ingredients — bounded by input
  // cost rather than product value — so they earn a third of the perfection
  // weight and stop at the refund cap (OVERCRAFT_REFUND_MAX_BANDS).
  COMPLETION_EXTRA_BAND_WEIGHT: 0.25,
  // Intentionally tiny: tiebreaker only — never large enough to justify
  // spending an extra turn to preserve qi/stability.
  RESOURCE_TIEBREAKER: 0.001,
  // Per-step cost: gives the tree search a signal that shorter paths are
  // better, preventing stabilize spirals.  0.5 is small relative to
  // per-turn progress (typically 12–24 points) but enough to break ties.
  STEP_PENALTY: 0.5,
  // Live crafts can have thousand-point progress actions. Keep the dynamic
  // step penalty well below full-turn value so it remains a tiebreaker and
  // does not bulldoze harmony/setup lines that the tree search prefers.
  STEP_PENALTY_PROGRESS_FRACTION: 0.25,
  // Buff valuation: converts (multiplier − 1) into a score contribution
  // per remaining buff turn.  At default 1.4× buff, this yields
  // 0.4 × 25 = 10 points per turn, comparable to one turn of progress.
  BUFF_VALUE_PER_MULTIPLIER_POINT: 25,
  // Base floor for buff need-share weighting.  Ensures buffs retain
  // some value even when the corresponding target is nearly met.
  BUFF_NEED_FLOOR: 0.5,
  // Full user bias shifts half a weight point from one goal to the other
  // while preserving the overall score scale. This is strong enough to
  // steer close calls without overwhelming the remaining-work model.
  GOAL_PRIORITY_WEIGHT_SHIFT: 0.5,
  // Qi value when targets not yet met: qi enables future progress actions.
  // 0.05 per qi ≈ 10 points at full qi (194), meaningful but secondary.
  QI_RESOURCE_WEIGHT: 0.05,
  // Base stability value when targets not yet met.  Stability enables
  // future turns, so its value scales with remaining work.
  STABILITY_BASE_WEIGHT: 0.01,
  STABILITY_WORK_WEIGHT: 0.01,
  // Overshoot penalty: discourages exceeding targets.  0.3× means
  // 10 points of overshoot costs 3 score — enough to steer the
  // optimizer but not so large it avoids finishing a nearly-met target.
  OVERSHOOT_PENALTY_WEIGHT: 0.3,
  // Finished-craft shortfall penalty: once the craft is ended, any remaining
  // unmet work is permanent. Penalize unresolved completion/perfection at
  // full weight so live states with runway outrank shallow partial finishes.
  FINISHED_UNMET_PENALTY_WEIGHT: 1,
  // Hard-cap violation is 3× overshoot weight — strong deterrent against
  // exceeding the recipe's absolute maximum.
  HARD_CAP_PENALTY_WEIGHT: 3,
  // Normal-mode stability threshold: the stability level below which
  // a quadratic penalty applies.  Expressed as turns of runway needed
  // (2 turns base + scaling with remaining work up to ~4 turns total),
  // multiplied by the actual average stability cost per turn.
  STABILITY_THRESHOLD_TURNS_BASE: 1.4,
  STABILITY_THRESHOLD_TURNS_SCALE: 2.6,
  // Training-mode stability threshold: more aggressive (less penalty)
  // because training crafts have lower stakes.
  STABILITY_THRESHOLD_TURNS_BASE_TRAINING: 0.8,
  STABILITY_THRESHOLD_TURNS_SCALE_TRAINING: 0.8,
  // Stability penalty weight as a fraction of totalTargetMagnitude.
  // Quadratic penalty = risk² × (totalTargetMagnitude × this fraction).
  STABILITY_PENALTY_FRACTION: 0.45,
  STABILITY_PENALTY_FRACTION_TRAINING: 0.08,
  // Minimum stability penalty weight floors — prevents the penalty from
  // becoming negligible on very small crafts.
  STABILITY_PENALTY_FLOOR: 45,
  STABILITY_PENALTY_FLOOR_TRAINING: 8,
  // Near-death linear penalty: below this many stability points,
  // an additional linear penalty ramps up urgency.
  NEAR_DEATH_STABILITY: 10,
  // Death penalty multiplier: when stability=0, the craft is dead.
  // Penalty = totalTargetMagnitude × this.  Must be larger than
  // TIER_VALUE_SCALE so that dying is never worth the progress gained
  // on the way to death.  3× means: negate a full tier jump (2×) plus
  // erase residual progress score.
  DEATH_PENALTY_MULTIPLIER: 3,
  // Runway penalty: per-turn-gap fraction of totalTargetMagnitude.
  // Penalizes states where estimated turns to finish exceeds stability
  // runway.  No cap — the penalty scales with the severity of the shortfall.
  // 0.1× means each turn of shortfall costs 10% of totalTargetMagnitude.
  RUNWAY_GAP_FRACTION: 0.1,
  RUNWAY_GAP_FRACTION_TRAINING: 0.04,
  // Toxicity penalty as a fraction of totalTargetMagnitude.
  // Proportional so it scales correctly for small and large crafts.
  TOXICITY_PENALTY_FRACTION: 0.025,
  // Harmony bonus weight in sublime mode. Real 0.7.6 value is driving the
  // condition timeline (more positive/veryPositive ⇒ Harmonious/Brilliant
  // techniques), so this is worth a lot early and almost nothing once the
  // target tier is banked. Scaled by remaining work on the binding bar.
  HARMONY_BONUS_WEIGHT: 0.4,
  // Harmony sub-system quality weight.  Scales with remaining work so
  // the tree search values being in a productive harmony state (e.g.,
  // forge heat 4-6) vs a terrible one (heat 0 or 10).  0.15× means at
  // full remaining work, optimal heat adds ~15% of totalTargetMagnitude.
  HARMONY_SUBSYSTEM_QUALITY_WEIGHT: 0.15,
  // Ordering-only bonus (never added to scored values) for moves that open
  // a currently-false expression gate or unlock a buffRequirement. Sized
  // in magnitude units so delayed-payoff lines survive beam pruning.
  GOAL_UNLOCK_ORDERING_WEIGHT: 0.5,
} as const;

function getGoalPriorityWeights(
  completionNeedShare: number,
  perfectionNeedShare: number,
  completionGoal: number,
  perfectionGoal: number,
  goalPriorityBias: number = DEFAULT_SEARCH_GOAL_PRIORITY_BIAS,
): {
  completionWeight: number;
  perfectionWeight: number;
} {
  let completionWeight = 1 + completionNeedShare;
  let perfectionWeight = 1 + perfectionNeedShare;

  if (!(completionGoal > 0 && perfectionGoal > 0)) {
    return { completionWeight, perfectionWeight };
  }

  const normalizedBias = clampSearchGoalPriorityBias(goalPriorityBias);
  if (normalizedBias === 0) {
    return { completionWeight, perfectionWeight };
  }

  const shift =
    (normalizedBias / SEARCH_GOAL_PRIORITY_BIAS_MAX) *
    SCORING.GOAL_PRIORITY_WEIGHT_SHIFT;
  completionWeight = Math.max(0.25, completionWeight + shift);
  perfectionWeight = Math.max(0.25, perfectionWeight - shift);

  return { completionWeight, perfectionWeight };
}

/** Joint bonus-roll credit when rolls could still raise the banked tier. */
function bonusChanceCreditWhenOneBandShort(
  outcome: OutcomeClassification,
): number {
  if (tierRank(outcome.optimisticTier) <= tierRank(outcome.tier)) {
    return 0;
  }
  // Bars that already meet their requirement contribute certainty (1).
  const completionFactor =
    outcome.completionMargin >= 1
      ? 1
      : Math.max(0, Math.min(1, outcome.completionBonusChance));
  const perfectionFactor =
    outcome.perfectionMargin >= 1
      ? 1
      : Math.max(0, Math.min(1, outcome.perfectionBonusChance));
  return Math.max(0, Math.min(1, completionFactor * perfectionFactor));
}

/**
 * Point-level fill of the target-tier thresholds (0–1). Supplies a smooth
 * early gradient while `tierRank` is flat at `failed`.
 */
function residualShortfallProgress(
  outcome: OutcomeClassification,
  bands: OutcomeBands,
): number {
  const req = TIER_REQUIREMENTS[bands.targetTier];
  const compNeed =
    bands.completionTarget > 0
      ? bandThreshold(bands.completionTarget, req.completion)
      : 0;
  const perfNeed =
    bands.perfectionTarget > 0
      ? bandThreshold(bands.perfectionTarget, req.perfection)
      : 0;
  const totalNeed = compNeed + perfNeed;
  if (totalNeed <= 0) {
    return 1;
  }
  const filled =
    Math.max(0, compNeed - outcome.completionShortfall) +
    Math.max(0, perfNeed - outcome.perfectionShortfall);
  return Math.max(0, Math.min(1, filled / totalNeed));
}

function weightedMarginAverage(
  completionMargin: number,
  perfectionMargin: number,
  completionWeight: number,
  perfectionWeight: number,
): number {
  const total = completionWeight + perfectionWeight;
  if (!(total > 0)) {
    return (completionMargin + perfectionMargin) / 2;
  }
  return (
    (completionMargin * completionWeight +
      perfectionMargin * perfectionWeight) /
    total
  );
}

function extraResolvedBands(
  outcome: OutcomeClassification,
  bands: OutcomeBands,
): number {
  const req = TIER_REQUIREMENTS[bands.targetTier];
  const completionRequired = bands.completionTarget > 0 ? req.completion : 0;
  const perfectionRequired = bands.perfectionTarget > 0 ? req.perfection : 0;
  const extraCompletion = Math.max(
    0,
    outcome.completionBands - completionRequired,
  );
  const extraPerfection = Math.max(
    0,
    outcome.perfectionBands - perfectionRequired,
  );
  // Conjunctive extras: only bands cleared on BOTH bars count.
  if (completionRequired > 0 && perfectionRequired > 0) {
    return Math.min(extraCompletion, extraPerfection);
  }
  if (completionRequired > 0) {
    return extraCompletion;
  }
  if (perfectionRequired > 0) {
    return extraPerfection;
  }
  return 0;
}

/**
 * Discrete tier rank inside the conjunctive goal score.
 *
 * Finished crafts use the raw runtime tier (basic is a real item floor).
 * Live search toward perfect/sublime suppresses the completion-only `basic`
 * checkpoint: banking completion alone must not outrank binding-bar perfection
 * progress. Gate/balance/residual already price completion; perfect and sublime
 * remain full discrete checkpoints because both bars are required.
 */
function goalScoreTierRank(
  outcome: OutcomeClassification,
  targetTier: OutcomeTier,
  options: { readonly countBasicCheckpoint: boolean },
): number {
  if (
    !options.countBasicCheckpoint &&
    outcome.tier === 'basic' &&
    tierRank(targetTier) >= tierRank('perfect')
  ) {
    return tierRank('failed');
  }
  return tierRank(outcome.tier);
}

/**
 * Conjunctive goal score. Math.min on margins is the whole point: once a bar's
 * requirement is met, more of it cannot raise the gate, so search is forced
 * onto the blocking bar.
 *
 * Overcraft extras (`overcraft.enabled`) are credited unilaterally per bar by
 * `computeOvercraftExtras`, which returns zero until the tier is secured — so
 * they can never raise the effective tier or trade off the binding bar. With
 * ambition off the legacy conjunctive `extraResolvedBands` term is kept
 * bit-identical.
 */
function computeConjunctiveGoalScore(
  outcome: OutcomeClassification,
  bands: OutcomeBands,
  baseCompGoal: number,
  basePerfGoal: number,
  effectiveCompGoal: number,
  effectivePerfGoal: number,
  completionWeight: number,
  perfectionWeight: number,
  options: { readonly countBasicCheckpoint: boolean } = {
    countBasicCheckpoint: false,
  },
  overcraft: {
    readonly enabled: boolean;
    readonly fractionalExtras: boolean;
  } = {
    enabled: false,
    fractionalExtras: false,
  },
): number {
  const totalTargetMagnitude = Math.max(
    1,
    Math.max(0, effectiveCompGoal) + Math.max(0, effectivePerfGoal),
  );
  const baseTargetMagnitude = Math.max(
    1,
    Math.max(0, baseCompGoal) + Math.max(0, basePerfGoal),
  );
  const gate = Math.min(outcome.completionMargin, outcome.perfectionMargin);
  const balance = weightedMarginAverage(
    outcome.completionMargin,
    outcome.perfectionMargin,
    completionWeight,
    perfectionWeight,
  );
  const bonusCredit = bonusChanceCreditWhenOneBandShort(outcome);
  const residual = residualShortfallProgress(outcome, bands);
  const extrasScore = overcraft.enabled
    ? (() => {
        const extras = computeOvercraftExtras(outcome, bands, {
          fractional: overcraft.fractionalExtras,
        });
        return (
          SCORING.EXTRA_BAND_WEIGHT * extras.perfectionBands +
          SCORING.COMPLETION_EXTRA_BAND_WEIGHT * extras.completionBands
        );
      })()
    : SCORING.EXTRA_BAND_WEIGHT * extraResolvedBands(outcome, bands);
  const scoredTierRank = goalScoreTierRank(outcome, bands.targetTier, options);

  return (
    totalTargetMagnitude *
      (SCORING.TIER_VALUE_SCALE * scoredTierRank +
        SCORING.GATE_WEIGHT * gate +
        SCORING.BALANCE_WEIGHT * balance +
        SCORING.BONUS_ROLL_WEIGHT * bonusCredit +
        SCORING.IN_TIER_PROGRESS_WEIGHT * residual) +
    extrasScore * baseTargetMagnitude
  );
}

/**
 * Score a live craft state.
 *
 * Architecture:
 * 1. Conjunctive band-threshold goal score (tier + binding gate + balance).
 * 2. Value buffs by expected future return while the target tier is unmet.
 * 3. Score resources as future turns of progress they enable.
 * 4. Survivability layer — only while the active mode goal is unmet.
 *
 * @param targetMultiplier - retained for compatibility/diagnostics; goals are
 *   derived from band thresholds, not from this multiplier.
 */
function scoreState(
  state: CraftingState,
  targetCompletion: number,
  targetPerfection: number,
  isSublimeCraft: boolean = false,
  targetMultiplier: number = 2.0,
  trainingMode: boolean = false,
  maxCompletionCap?: number,
  maxPerfectionCap?: number,
  ctx: ScoringContext = DEFAULT_SCORING_CONTEXT,
  goalPriorityBias: number = DEFAULT_SEARCH_GOAL_PRIORITY_BIAS,
  overcraftAmbition: boolean = true,
  perfectionBandGoal: number = 0,
  completionBandCeiling: number = 0,
): number {
  if (targetCompletion === 0 && targetPerfection === 0) {
    return Math.min(state.completion, state.perfection);
  }

  // Kept for signature compatibility and call-site diagnostics only.
  void targetMultiplier;

  const {
    baseCompGoal,
    basePerfGoal,
    effectiveCompGoal,
    effectivePerfGoal,
    bands,
  } = deriveBandGoals(
    targetCompletion,
    targetPerfection,
    isSublimeCraft,
    maxCompletionCap,
    maxPerfectionCap,
    perfectionBandGoal,
    completionBandCeiling,
  );

  const outcome = classifyOutcome(state, bands);
  const baseTargetsMet =
    (baseCompGoal <= 0 || state.completion >= baseCompGoal) &&
    (basePerfGoal <= 0 || state.perfection >= basePerfGoal);
  const modeTargetsMet =
    (effectiveCompGoal <= 0 || state.completion >= effectiveCompGoal) &&
    (effectivePerfGoal <= 0 || state.perfection >= effectivePerfGoal);

  // ── remaining work metrics ───────────────────────────────────────────
  const compRemaining = Math.max(0, effectiveCompGoal - state.completion);
  const perfRemaining = Math.max(0, effectivePerfGoal - state.perfection);
  const totalRemaining = compRemaining + perfRemaining;
  const compNeedShare =
    totalRemaining > 0 ? compRemaining / totalRemaining : 0.5;
  const perfNeedShare =
    totalRemaining > 0 ? perfRemaining / totalRemaining : 0.5;
  const compNeedPct =
    effectiveCompGoal > 0
      ? Math.max(0, Math.min(1, compRemaining / effectiveCompGoal))
      : 0;
  const perfNeedPct =
    effectivePerfGoal > 0
      ? Math.max(0, Math.min(1, perfRemaining / effectivePerfGoal))
      : 0;
  const remainingWorkPct = Math.max(
    compNeedPct,
    perfNeedPct,
    (compNeedPct + perfNeedPct) / 2,
  );
  // Goal work is independent of the tier ledger, including higher ambition.
  const bindingRemainingWork = Math.max(compNeedPct, perfNeedPct);
  const estimatedProgressPerTurn = estimateWeightedProgressPerTurn(
    compNeedShare,
    perfNeedShare,
    ctx,
  );
  const estimatedTurnsRemaining = estimateTurnsRemainingFromContext(
    compRemaining,
    perfRemaining,
    ctx,
  );

  const baseCompRemaining =
    baseCompGoal > 0
      ? Math.max(0, baseCompGoal - Math.min(state.completion, baseCompGoal))
      : 0;
  const basePerfRemaining =
    basePerfGoal > 0
      ? Math.max(0, basePerfGoal - Math.min(state.perfection, basePerfGoal))
      : 0;
  const baseTotalRemaining = baseCompRemaining + basePerfRemaining;
  const baseCompNeedShare =
    baseTotalRemaining > 0 ? baseCompRemaining / baseTotalRemaining : 0.5;
  const basePerfNeedShare =
    baseTotalRemaining > 0 ? basePerfRemaining / baseTotalRemaining : 0.5;
  const baseCompNeedPct =
    baseCompGoal > 0
      ? Math.max(0, Math.min(1, baseCompRemaining / baseCompGoal))
      : 0;
  const basePerfNeedPct =
    basePerfGoal > 0
      ? Math.max(0, Math.min(1, basePerfRemaining / basePerfGoal))
      : 0;
  const baseRemainingWorkPct = Math.max(
    baseCompNeedPct,
    basePerfNeedPct,
    (baseCompNeedPct + basePerfNeedPct) / 2,
  );
  const baseEstimatedTurnsRemaining = estimateTurnsRemainingFromContext(
    baseCompRemaining,
    basePerfRemaining,
    ctx,
  );
  const stepPenaltyWeight = Math.max(
    SCORING.STEP_PENALTY,
    estimatedProgressPerTurn * SCORING.STEP_PENALTY_PROGRESS_FRACTION,
  );

  const { completionWeight, perfectionWeight } = getGoalPriorityWeights(
    compNeedShare,
    perfNeedShare,
    effectiveCompGoal,
    effectivePerfGoal,
    goalPriorityBias,
  );
  const totalPriorityWeight = completionWeight + perfectionWeight;
  const completionPriorityShare =
    totalPriorityWeight > 0 ? completionWeight / totalPriorityWeight : 0.5;
  const perfectionPriorityShare =
    totalPriorityWeight > 0 ? perfectionWeight / totalPriorityWeight : 0.5;

  // ── 1. conjunctive goal score (primary) ──────────────────────────────
  // Live search does not count the completion-only basic checkpoint toward
  // perfect/sublime targets (gate/balance already price completion).
  // Overcraft extras bank guaranteed bands only in live scoring: fractional
  // bonus-roll EV made band-fraction noise at the horizon decide between
  // strategically different lines (e.g. buff setup vs immediate progress)
  // and rewarded front-loading sub-band overshoot, neither of which the
  // tier model can price honestly. Terminal scoring makes the opposite
  // trade-off on purpose (see scoreFinishedOutcome): once the craft has
  // actually resolved, the bonus-roll fraction is the final expected reward.
  let score = computeConjunctiveGoalScore(
    outcome,
    bands,
    baseCompGoal,
    basePerfGoal,
    effectiveCompGoal,
    effectivePerfGoal,
    completionWeight,
    perfectionWeight,
    { countBasicCheckpoint: false },
    { enabled: overcraftAmbition, fractionalExtras: false },
  );

  const totalTargetMagnitude = Math.max(
    1,
    Math.max(0, effectiveCompGoal) + Math.max(0, effectivePerfGoal),
  );
  const baseTargetMagnitude = Math.max(
    1,
    Math.max(0, baseCompGoal) + Math.max(0, basePerfGoal),
  );

  const resourceRemainingWorkPct = baseTargetsMet
    ? remainingWorkPct
    : baseRemainingWorkPct;
  const resourceEstimatedTurnsRemaining = baseTargetsMet
    ? estimatedTurnsRemaining
    : baseEstimatedTurnsRemaining;
  const resourceEstimatedProgressPerTurn = baseTargetsMet
    ? estimatedProgressPerTurn
    : estimateWeightedProgressPerTurn(
        baseCompNeedShare,
        basePerfNeedShare,
        ctx,
      );
  const survivabilityTargetMagnitude = baseTargetsMet
    ? totalTargetMagnitude
    : baseTargetMagnitude;

  if (modeTargetsMet) {
    score += state.qi * SCORING.RESOURCE_TIEBREAKER;
    score += state.stability * SCORING.RESOURCE_TIEBREAKER;
    score -= state.step * stepPenaltyWeight;
  }

  if (!modeTargetsMet) {
    // ── 3. buff valuation (when targets not yet met) ──────────────────
    if (state.hasControlBuff()) {
      const controlBuffBoost =
        (state.controlBuffMultiplier - 1) *
        SCORING.BUFF_VALUE_PER_MULTIPLIER_POINT;
      score +=
        state.controlBuffTurns *
        controlBuffBoost *
        (SCORING.BUFF_NEED_FLOOR + perfectionPriorityShare) *
        remainingWorkPct;
    }
    if (state.hasIntensityBuff()) {
      const intensityBuffBoost =
        (state.intensityBuffMultiplier - 1) *
        SCORING.BUFF_VALUE_PER_MULTIPLIER_POINT;
      score +=
        state.intensityBuffTurns *
        intensityBuffBoost *
        (SCORING.BUFF_NEED_FLOOR + completionPriorityShare) *
        remainingWorkPct;
    }

    // ── 4. resource value (qi & stability as future-progress enablers) ─
    if (ctx.avgQiCostPerTurn > 0 && estimatedTurnsRemaining > 0) {
      const estimatedQiNeeded =
        resourceEstimatedTurnsRemaining * ctx.avgQiCostPerTurn;
      const qiShortfall = Math.max(0, estimatedQiNeeded - state.qi);
      if (qiShortfall > 0) {
        const turnsShortByQi = qiShortfall / ctx.avgQiCostPerTurn;
        score -= turnsShortByQi * resourceEstimatedProgressPerTurn;
      }
    }

    score +=
      state.stability *
      (SCORING.STABILITY_BASE_WEIGHT +
        resourceRemainingWorkPct * SCORING.STABILITY_WORK_WEIGHT);

    score -= state.step * stepPenaltyWeight;
  }

  // ── 5. overshoot penalty ─────────────────────────────────────────────
  // Soft overshoot past the active mode goal (band threshold, cap-clamped).
  // This stays on even with overcraft ambition: banked extras are priced
  // against the step penalty, and the overshoot term keeps pressure against
  // dead sub-band weight (it is also the only ranking signal between two
  // overshooting live lines — removing it flipped the forge-heat runway
  // replay's heat-recovery pick).
  const modeCompLimit = effectiveCompGoal;
  const modePerfLimit = effectivePerfGoal;
  const compOver =
    modeCompLimit > 0 ? Math.max(0, state.completion - modeCompLimit) : 0;
  const perfOver =
    modePerfLimit > 0 ? Math.max(0, state.perfection - modePerfLimit) : 0;
  score -= (compOver + perfOver) * SCORING.OVERSHOOT_PENALTY_WEIGHT;

  // Hard-cap violation penalty
  if (maxCompletionCap !== undefined && Number.isFinite(maxCompletionCap)) {
    score -=
      Math.max(0, state.completion - maxCompletionCap) *
      SCORING.HARD_CAP_PENALTY_WEIGHT;
  }
  if (maxPerfectionCap !== undefined && Number.isFinite(maxPerfectionCap)) {
    score -=
      Math.max(0, state.perfection - maxPerfectionCap) *
      SCORING.HARD_CAP_PENALTY_WEIGHT;
  }

  // ── 6. survivability ────────────────────────────────────────────────
  // Once the active mode goals are met, the craft's tier is banked. Until
  // then, low runway still matters, including sublime continuation after
  // base success. Structure matches the pre-existing survivability lock
  // (quadratic risk + death cliff + runway) — do not retune constants.
  if (!modeTargetsMet) {
    const thresholdBase = trainingMode
      ? SCORING.STABILITY_THRESHOLD_TURNS_BASE_TRAINING
      : SCORING.STABILITY_THRESHOLD_TURNS_BASE;
    const thresholdScale = trainingMode
      ? SCORING.STABILITY_THRESHOLD_TURNS_SCALE_TRAINING
      : SCORING.STABILITY_THRESHOLD_TURNS_SCALE;
    const stabilityThreshold =
      (thresholdBase + resourceRemainingWorkPct * thresholdScale) *
      ctx.avgStabilityCostPerTurn;

    const penaltyFraction = trainingMode
      ? SCORING.STABILITY_PENALTY_FRACTION_TRAINING
      : SCORING.STABILITY_PENALTY_FRACTION;
    const penaltyFloor = trainingMode
      ? SCORING.STABILITY_PENALTY_FLOOR_TRAINING
      : SCORING.STABILITY_PENALTY_FLOOR;
    const stabilityPenaltyWeight = Math.max(
      penaltyFloor,
      survivabilityTargetMagnitude * penaltyFraction,
    );

    if (state.stability < stabilityThreshold) {
      const stabilityRisk =
        (stabilityThreshold - state.stability) / stabilityThreshold;
      score -= stabilityRisk * stabilityRisk * stabilityPenaltyWeight;
    }

    // Hard cliff: craft dead at 0 stability.
    if (state.stability <= 0) {
      score -= totalTargetMagnitude * SCORING.DEATH_PENALTY_MULTIPLIER;
    } else if (state.stability <= SCORING.NEAR_DEATH_STABILITY) {
      score -=
        (SCORING.NEAR_DEATH_STABILITY - state.stability) *
        stabilityPenaltyWeight;
    }

    // Runway penalty: penalize states where estimated turns to finish
    // exceeds stability runway. Proportional and uncapped.
    const estimatedRunwayTurns =
      ctx.avgStabilityCostPerTurn > 0
        ? Math.floor(Math.max(0, state.stability) / ctx.avgStabilityCostPerTurn)
        : Infinity;
    if (resourceEstimatedTurnsRemaining > estimatedRunwayTurns) {
      const gap = resourceEstimatedTurnsRemaining - estimatedRunwayTurns;
      const gapFraction = trainingMode
        ? SCORING.RUNWAY_GAP_FRACTION_TRAINING
        : SCORING.RUNWAY_GAP_FRACTION;
      score -= gap * survivabilityTargetMagnitude * gapFraction;
    }
  }

  // ── 7. toxicity & harmony ──────────────────────────────────────────
  if (state.maxToxicity > 0 && state.hasDangerousToxicity()) {
    score -= totalTargetMagnitude * SCORING.TOXICITY_PENALTY_FRACTION;
  }
  if (isSublimeCraft) {
    if (!modeTargetsMet) {
      const normalizedHarmony = Math.max(-1, Math.min(1, state.harmony / 100));
      score +=
        normalizedHarmony *
        bindingRemainingWork *
        totalTargetMagnitude *
        SCORING.HARMONY_BONUS_WEIGHT;
    }

    if (!modeTargetsMet && state.harmonyData) {
      const quality = evaluateHarmonySubsystemQuality(
        state.harmonyData,
        completionPriorityShare,
        perfectionPriorityShare,
      );
      score +=
        quality *
        remainingWorkPct *
        totalTargetMagnitude *
        SCORING.HARMONY_SUBSYSTEM_QUALITY_WEIGHT;
    }
  }

  return score;
}

/**
 * Score a finished/terminal craft outcome.
 *
 * The tier comes from `classifyOutcome` on guaranteed bands only (no
 * bonus-roll EV): full tier EV was found to make finishing beat live lines
 * that could still secure the missing bar. Overcraft extras are different -
 * they are zero until the tier is secured on guaranteed bands, and past that
 * point the craft-end bonus roll pays each bar's bonusChance as a fraction
 * of the next band's reward (RUNTIME_EVIDENCE section 12), so a finished
 * state prices that fraction as expected value. Order is strictly by banked
 * tier first, then permanent shortfall penalties so a live state with runway
 * outranks a shallow finish.
 *
 * @param targetMultiplier - retained for compatibility/diagnostics only.
 */
function scoreFinishedOutcome(
  state: CraftingState,
  targetCompletion: number,
  targetPerfection: number,
  isSublimeCraft: boolean = false,
  targetMultiplier: number = 2.0,
  maxCompletionCap?: number,
  maxPerfectionCap?: number,
  ctx: ScoringContext = DEFAULT_SCORING_CONTEXT,
  goalPriorityBias: number = DEFAULT_SEARCH_GOAL_PRIORITY_BIAS,
  overcraftAmbition: boolean = true,
  perfectionBandGoal: number = 0,
  completionBandCeiling: number = 0,
): number {
  if (targetCompletion === 0 && targetPerfection === 0) {
    return Math.min(state.completion, state.perfection);
  }

  void targetMultiplier;

  const {
    baseCompGoal,
    basePerfGoal,
    effectiveCompGoal,
    effectivePerfGoal,
    bands,
  } = deriveBandGoals(
    targetCompletion,
    targetPerfection,
    isSublimeCraft,
    maxCompletionCap,
    maxPerfectionCap,
    perfectionBandGoal,
    completionBandCeiling,
  );

  const outcome = classifyOutcome(state, bands);
  const compRemaining = Math.max(0, effectiveCompGoal - state.completion);
  const perfRemaining = Math.max(0, effectivePerfGoal - state.perfection);
  const totalRemaining = compRemaining + perfRemaining;
  const compNeedShare =
    totalRemaining > 0 ? compRemaining / totalRemaining : 0.5;
  const perfNeedShare =
    totalRemaining > 0 ? perfRemaining / totalRemaining : 0.5;
  const { completionWeight, perfectionWeight } = getGoalPriorityWeights(
    compNeedShare,
    perfNeedShare,
    effectiveCompGoal,
    effectivePerfGoal,
    goalPriorityBias,
  );

  // Finished crafts count the real runtime tier, including basic as a floor.
  // Tier rank banks guaranteed bands only: overvaluing the roll made
  // finishing beat live lines that could still secure the missing bar.
  // Extras, however, only exist once the tier is already secured, and at a
  // terminal state the bonus-roll fraction *is* the final expected reward -
  // pricing it is what stops every craft-ending line from collapsing onto
  // one identical score. Live horizon leaves stay guaranteed-only (band-
  // fraction noise must not steer strategy mid-search); see scoreState.
  let score = computeConjunctiveGoalScore(
    outcome,
    bands,
    baseCompGoal,
    basePerfGoal,
    effectiveCompGoal,
    effectivePerfGoal,
    completionWeight,
    perfectionWeight,
    { countBasicCheckpoint: true },
    { enabled: overcraftAmbition, fractionalExtras: true },
  );

  const totalTargetMagnitude = Math.max(
    1,
    Math.max(0, effectiveCompGoal) + Math.max(0, effectivePerfGoal),
  );

  // Stability hit 0 ends the craft. If the target-tier goals are already
  // banked this is a successful resolution (last-hit finish), not a wipe.
  // Only unmet finishes pay the death cliff, matching live scoreState's
  // "dying never beats progress" lock for failed lines.
  const targetGoalsMet =
    outcome.completionMargin >= 1 && outcome.perfectionMargin >= 1;
  if (state.stability <= 0 && !targetGoalsMet) {
    score -= totalTargetMagnitude * SCORING.DEATH_PENALTY_MULTIPLIER;
  }

  // Permanent shortfall once the craft has ended.
  score -=
    (compRemaining + perfRemaining) * SCORING.FINISHED_UNMET_PENALTY_WEIGHT;

  const stepPenaltyWeight = Math.max(
    SCORING.STEP_PENALTY,
    ctx.avgGainPerTurn * SCORING.STEP_PENALTY_PROGRESS_FRACTION,
  );
  return score - state.step * stepPenaltyWeight;
}
