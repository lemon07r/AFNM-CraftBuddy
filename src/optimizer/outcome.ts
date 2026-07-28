/**
 * CraftBuddy - Craft Outcome Evaluation (AFNM 0.7.6)
 *
 * The game decides a craft's outcome tier *conjunctively*: completion and
 * perfection each have to clear their own band count, and failing either one
 * caps the result regardless of how far the other overshoots.
 *
 * Ground truth: installed runtime 0.7.6-7c586da.
 *
 * Band counting (`hH`, mirrored by `getBonusAndChance` in `./gameTypes`):
 *
 *   const qIa = 1.3;
 *   hH = (value, target) => {
 *     let n = target, r = value, i = 0;
 *     while (r > 0 && n > 0 && r >= n) { r -= n; i++; n = Math.floor(n * qIa); }
 *     return { guaranteed: i, bonusChance: r / n, nextThreshold: value + (n - r) };
 *   };
 *
 * Each band costs 1.3x the previous, so bands get progressively more expensive.
 *
 * Auto-finish predicate (there is no manual "finish craft" technique -
 * the craft ends by itself the moment this becomes true):
 *
 *   shouldFinish =
 *     stability <= 0 ||
 *     (completion >= completionFinishFlat && perfection >= perfectionFinishFlat) ||
 *     (canOvercraft && hH(completion, target).guaranteed >= 5 &&
 *      perfection >= perfectionFinishFlat);
 *
 * Tier decision, using *effective* band counts that include the fractional
 * bonus roll:
 *
 *   const a = cBand.guaranteed + (Math.random() < cBand.bonusChance ? 1 : 0);
 *   const o = pBand.guaranteed + (Math.random() < pBand.bonusChance ? 1 : 0);
 *   if (a === 0)                                   -> 'failed'
 *   else if (a > 1 && o > 1 && recipe.sublimeItem) -> 'sublime'
 *   else if (o > 0)                                -> 'perfect'
 *   else                                           -> 'basic'
 *
 * So sublime needs **two** bands on **both** bars at once. This is the reason an
 * additive weighted sum mis-plays sublime crafts: pouring everything into one
 * bar can raise the weighted score while leaving the outcome stuck at `basic`.
 */

import { getBonusAndChance } from './gameTypes';
import type { OptimizerConfig } from './skills';

/** Ratio by which each successive band's width grows (runtime `qIa`). */
export const BAND_GROWTH_RATIO = 1.3;

export type OutcomeTier = 'failed' | 'basic' | 'perfect' | 'sublime';

/** Ascending tier order, so tiers can be compared numerically. */
export const OUTCOME_TIER_ORDER: readonly OutcomeTier[] = [
  'failed',
  'basic',
  'perfect',
  'sublime',
];

/** Numeric rank of a tier; higher is better. */
export function tierRank(tier: OutcomeTier): number {
  return OUTCOME_TIER_ORDER.indexOf(tier);
}

/** Band counts a tier requires on each bar. */
export interface TierRequirement {
  readonly completion: number;
  readonly perfection: number;
}

/**
 * Band requirements per tier, straight from the runtime comparisons.
 *
 * `failed` is the absence of any requirement; every other tier is a conjunction.
 */
export const TIER_REQUIREMENTS: Readonly<Record<OutcomeTier, TierRequirement>> =
  {
    failed: { completion: 0, perfection: 0 },
    basic: { completion: 1, perfection: 0 },
    perfect: { completion: 1, perfection: 1 },
    sublime: { completion: 2, perfection: 2 },
  };

export interface OutcomeBands {
  /** Width of one completion band - the recipe's completion stat. */
  readonly completionTarget: number;
  /** Width of one perfection band - the recipe's perfection stat. */
  readonly perfectionTarget: number;
  /**
   * Completion at which the craft auto-finishes (runtime `getMaxCompletion`,
   * i.e. the summed width of every reachable band).
   */
  readonly completionFinishFlat: number;
  /** Perfection at which the craft auto-finishes (`getMaxPerfection`). */
  readonly perfectionFinishFlat: number;
  /** Whether the recipe allows overcrafting past its nominal bands. */
  readonly canOvercraft: boolean;
  /** Whether a sublime result exists at all for this recipe. */
  readonly hasSublimeOutcome: boolean;
  /** Best tier this craft can reach - the tier the search should aim at. */
  readonly targetTier: OutcomeTier;
  /**
   * Band count at the game's completion cap, set only when the cap came from
   * the game (not reconstructed from the tier requirement). Bounds overcraft
   * extras; undefined means "no known cap", i.e. uncapped.
   */
  readonly completionCapBandCount?: number;
  /** As `completionCapBandCount`, for perfection. */
  readonly perfectionCapBandCount?: number;
}

export interface OutcomeClassification {
  /**
   * Tier guaranteed by the current bars, ignoring the fractional bonus rolls.
   * This is the honest floor and what the UI should report.
   */
  readonly tier: OutcomeTier;
  /**
   * Best tier reachable if both bonus rolls land. Equals `tier` when no roll
   * could change the outcome.
   */
  readonly optimisticTier: OutcomeTier;
  /** Guaranteed completion bands. */
  readonly completionBands: number;
  /** Guaranteed perfection bands. */
  readonly perfectionBands: number;
  /** Probability the next completion band is granted by the bonus roll. */
  readonly completionBonusChance: number;
  /** Probability the next perfection band is granted by the bonus roll. */
  readonly perfectionBonusChance: number;
  /**
   * Fractional progress toward the target tier's completion requirement, in
   * bands, capped at the requirement. 1 means the requirement is fully met.
   */
  readonly completionMargin: number;
  /** As `completionMargin`, for perfection. */
  readonly perfectionMargin: number;
  /**
   * Which bar currently blocks the next tier. `'none'` once the target tier is
   * satisfied. This is what directs search pressure at the *binding*
   * requirement and is what removes both the "always completion" and "always
   * perfection" failure modes.
   */
  readonly blockingRequirement: 'completion' | 'perfection' | 'none';
  /** Raw completion points still needed for the target tier. */
  readonly completionShortfall: number;
  /** Raw perfection points still needed for the target tier. */
  readonly perfectionShortfall: number;
  /** True when the game's auto-finish predicate holds for this state. */
  readonly willAutoFinish: boolean;
}

interface BarProgress {
  readonly completion: number;
  readonly perfection: number;
  readonly stability: number;
}

/**
 * Total value needed to hold `bandCount` bands, given a one-band width.
 *
 * Mirrors runtime `tLa`: widths compound by `qIa` with a `Math.floor` each step,
 * and the running total is floored once at the end.
 */
export function bandThreshold(bandWidth: number, bandCount: number): number {
  if (!Number.isFinite(bandWidth) || bandWidth <= 0 || bandCount <= 0) {
    return 0;
  }
  let width = bandWidth;
  let total = 0;
  for (let i = 0; i < bandCount; i++) {
    total += width;
    width = Math.floor(width * BAND_GROWTH_RATIO);
  }
  return Math.floor(total);
}

/** Loose parameters for building outcome bands without a full optimizer config. */
export interface OutcomeBandParams {
  targetCompletion: number;
  targetPerfection: number;
  isSublimeCraft?: boolean;
  maxCompletionCap?: number;
  maxPerfectionCap?: number;
}

/**
 * Build outcome bands from the loose target/cap parameters the scorers already
 * receive. Prefer this over synthesising a fake `OptimizerConfig`.
 */
export function buildOutcomeBands(params: OutcomeBandParams): OutcomeBands {
  const completionTarget = Math.max(0, params.targetCompletion ?? 0);
  const perfectionTarget = Math.max(0, params.targetPerfection ?? 0);
  const hasSublimeOutcome = params.isSublimeCraft === true;
  const targetTier: OutcomeTier = hasSublimeOutcome ? 'sublime' : 'perfect';
  const requirement = TIER_REQUIREMENTS[targetTier];

  const derivedCompletionFlat = bandThreshold(
    completionTarget,
    requirement.completion,
  );
  const derivedPerfectionFlat = bandThreshold(
    perfectionTarget,
    requirement.perfection,
  );

  const completionCap = params.maxCompletionCap;
  const perfectionCap = params.maxPerfectionCap;

  return {
    completionTarget,
    perfectionTarget,
    completionFinishFlat:
      completionCap !== undefined && completionCap > 0
        ? completionCap
        : derivedCompletionFlat,
    perfectionFinishFlat:
      perfectionCap !== undefined && perfectionCap > 0
        ? perfectionCap
        : derivedPerfectionFlat,
    // The overcraft finish branch only exists when the caps run deeper than the
    // tier requirement, which is exactly when the recipe allows overcrafting.
    canOvercraft:
      completionCap !== undefined && completionCap > derivedCompletionFlat,
    hasSublimeOutcome,
    targetTier,
    completionCapBandCount:
      completionCap !== undefined && completionCap > 0 && completionTarget > 0
        ? getBonusAndChance(completionCap, completionTarget).guaranteed
        : undefined,
    perfectionCapBandCount:
      perfectionCap !== undefined && perfectionCap > 0 && perfectionTarget > 0
        ? getBonusAndChance(perfectionCap, perfectionTarget).guaranteed
        : undefined,
  };
}

/**
 * Derive the band thresholds and reachable tier for a craft.
 *
 * Band widths come from the recipe targets, which `modContent` has already
 * scaled by the selected harmony's complexity multiplier. The auto-finish flats
 * come from the caps the game exposes (`getMaxCompletion` / `getMaxPerfection`);
 * when those are unavailable they are reconstructed from the band requirement of
 * the reachable tier, which is the honest minimum rather than a cap-derived
 * guess.
 */
export function deriveOutcomeBands(config: OptimizerConfig): OutcomeBands {
  return buildOutcomeBands({
    targetCompletion: config.targetCompletion ?? 0,
    targetPerfection: config.targetPerfection ?? 0,
    isSublimeCraft: config.isSublimeCraft === true,
    maxCompletionCap: config.maxCompletion,
    maxPerfectionCap: config.maxPerfection,
  });
}

/**
 * Effective band count including the fractional bonus roll.
 *
 * The runtime rolls once per bar; `optimistic` reports the count if that roll
 * lands, which is the ceiling on what a state can produce.
 */
function effectiveBands(
  guaranteed: number,
  bonusChance: number,
  optimistic: boolean,
): number {
  return optimistic && bonusChance > 0 ? guaranteed + 1 : guaranteed;
}

/**
 * Tier produced by a pair of effective band counts, using the runtime's exact
 * comparison order.
 */
export function tierForBands(
  completionBands: number,
  perfectionBands: number,
  hasSublimeOutcome: boolean,
): OutcomeTier {
  if (completionBands === 0) {
    return 'failed';
  }
  if (completionBands > 1 && perfectionBands > 1 && hasSublimeOutcome) {
    return 'sublime';
  }
  if (perfectionBands > 0) {
    return 'perfect';
  }
  return 'basic';
}

/**
 * Classify a craft state against its outcome bands.
 *
 * `blockingRequirement` names the bar that is short of the target tier, which
 * lets the scorer apply pressure where it actually changes the outcome instead
 * of trading the two bars off against each other.
 */
export function classifyOutcome(
  state: BarProgress,
  bands: OutcomeBands,
): OutcomeClassification {
  const completion = Math.max(0, state.completion);
  const perfection = Math.max(0, state.perfection);

  // A zero recipe target means the bar is not part of the craft (search/tests
  // use this for completion-only or perfection-only scenarios). The ladder
  // cannot award bands against a 0-width target, so treat that bar as already
  // satisfied rather than permanently failed.
  const completionBand =
    bands.completionTarget > 0
      ? getBonusAndChance(completion, bands.completionTarget)
      : { guaranteed: 1, bonusChance: 0, nextThreshold: 0 };
  const perfectionBand =
    bands.perfectionTarget > 0
      ? getBonusAndChance(perfection, bands.perfectionTarget)
      : { guaranteed: 1, bonusChance: 0, nextThreshold: 0 };

  const tier = tierForBands(
    completionBand.guaranteed,
    perfectionBand.guaranteed,
    bands.hasSublimeOutcome,
  );
  const optimisticTier = tierForBands(
    effectiveBands(completionBand.guaranteed, completionBand.bonusChance, true),
    effectiveBands(perfectionBand.guaranteed, perfectionBand.bonusChance, true),
    bands.hasSublimeOutcome,
  );

  const requirement = TIER_REQUIREMENTS[bands.targetTier];
  const completionRequired =
    bands.completionTarget > 0 ? requirement.completion : 0;
  const perfectionRequired =
    bands.perfectionTarget > 0 ? requirement.perfection : 0;

  // Progress is measured in bands rather than raw points so the two bars are
  // directly comparable even when their targets differ wildly.
  const completionMargin = requirementProgress(
    completionBand.guaranteed,
    completionBand.bonusChance,
    completionRequired,
  );
  const perfectionMargin = requirementProgress(
    perfectionBand.guaranteed,
    perfectionBand.bonusChance,
    perfectionRequired,
  );

  const completionShortfall =
    bands.completionTarget > 0
      ? Math.max(
          0,
          bandThreshold(bands.completionTarget, requirement.completion) -
            completion,
        )
      : 0;
  const perfectionShortfall =
    bands.perfectionTarget > 0
      ? Math.max(
          0,
          bandThreshold(bands.perfectionTarget, requirement.perfection) -
            perfection,
        )
      : 0;

  let blockingRequirement: 'completion' | 'perfection' | 'none' = 'none';
  if (completionMargin < 1 || perfectionMargin < 1) {
    // The binding requirement is whichever bar is further from its band count.
    // Ties break toward completion because a completion band is a prerequisite
    // for every tier above `failed`.
    blockingRequirement =
      completionMargin <= perfectionMargin ? 'completion' : 'perfection';
  }

  return {
    tier,
    optimisticTier,
    completionBands: completionBand.guaranteed,
    perfectionBands: perfectionBand.guaranteed,
    completionBonusChance: completionBand.bonusChance,
    perfectionBonusChance: perfectionBand.bonusChance,
    completionMargin,
    perfectionMargin,
    blockingRequirement,
    completionShortfall,
    perfectionShortfall,
    willAutoFinish: willAutoFinish(state, bands, completionBand.guaranteed),
  };
}

/** Fractional progress toward a band requirement, capped at 1. */
function requirementProgress(
  guaranteed: number,
  bonusChance: number,
  required: number,
): number {
  if (required <= 0) {
    return 1;
  }
  const achieved = guaranteed + Math.max(0, Math.min(1, bonusChance));
  return Math.max(0, Math.min(1, achieved / required));
}

/**
 * The game's auto-finish predicate.
 *
 * Knowing this is what lets the optimizer stop one action off the goal instead
 * of spending leftover qi on perfection it will never bank: once this holds, the
 * craft ends whether the player wants it to or not.
 */
export function willAutoFinish(
  state: BarProgress,
  bands: OutcomeBands,
  completionBandsHint?: number,
): boolean {
  if (state.stability <= 0) {
    return true;
  }
  const perfectionReady = state.perfection >= bands.perfectionFinishFlat;
  if (state.completion >= bands.completionFinishFlat && perfectionReady) {
    return true;
  }
  if (bands.canOvercraft && perfectionReady) {
    const completionBands =
      completionBandsHint ??
      getBonusAndChance(Math.max(0, state.completion), bands.completionTarget)
        .guaranteed;
    if (completionBands >= 5) {
      return true;
    }
  }
  return false;
}

/**
 * Last completion band that still increases the material refund.
 *
 * Runtime: refund percentage is `(completionSuccess - 1) * 20` clamped to
 * `[0, 80]` (`docs/project/RUNTIME_EVIDENCE.md` section 12.3), so the fifth
 * band is the last one that pays.
 */
export const OVERCRAFT_REFUND_MAX_BANDS = 5;

/** Extra bands past the target tier that the game still pays for, per bar. */
export interface OvercraftExtras {
  /**
   * Value-adding completion bands past the target tier's requirement. The
   * material refund caps at 80%, so this never exceeds the refund band cap,
   * and only sublime-capable crafts refund at all.
   */
  readonly completionBands: number;
  /**
   * Value-adding perfection bands past the target tier's requirement. The
   * stacks/quality reward scales per band with no cap of its own, so this is
   * bounded only by the game's perfection cap when one is known.
   */
  readonly perfectionBands: number;
}

/**
 * Count the extra bands the game rewards *unilaterally* once the target tier
 * is secured (RUNTIME_EVIDENCE section 12): each extra perfection band scales
 * the result (`stacks * (1 + (bands - baseline) * 0.2)` or +1 harmony-augment
 * quality on the sublime result), and each extra completion band grows the
 * material refund, independently of the other bar.
 *
 * Returns zero on both bars while the tier is not secured, so extras can never
 * raise the effective tier or trade off the binding bar.
 *
 * Both live and terminal scoring bank guaranteed bands only (`fractional:
 * false`), so horizon leaves and finished states price overshoot identically.
 * The fractional mode (adds each bar's bonus-roll chance as a fraction of the
 * next band, i.e. the runtime's expected band count) is kept for analysis
 * tooling; it proved too noisy for search, where band-fraction artifacts
 * overrode real strategy.
 */
export function computeOvercraftExtras(
  outcome: OutcomeClassification,
  bands: OutcomeBands,
  options: { readonly fractional: boolean },
): OvercraftExtras {
  const zero: OvercraftExtras = { completionBands: 0, perfectionBands: 0 };
  if (outcome.completionMargin < 1 || outcome.perfectionMargin < 1) {
    return zero;
  }
  const requirement = TIER_REQUIREMENTS[bands.targetTier];
  const completionRequired =
    bands.completionTarget > 0 ? requirement.completion : 0;
  const perfectionRequired =
    bands.perfectionTarget > 0 ? requirement.perfection : 0;

  const completionCount =
    outcome.completionBands +
    (options.fractional ? Math.max(0, outcome.completionBonusChance) : 0);
  const perfectionCount =
    outcome.perfectionBands +
    (options.fractional ? Math.max(0, outcome.perfectionBonusChance) : 0);

  const completionCeiling = Math.min(
    bands.completionCapBandCount ?? Number.POSITIVE_INFINITY,
    bands.hasSublimeOutcome
      ? OVERCRAFT_REFUND_MAX_BANDS
      : completionRequired,
  );
  const perfectionCeiling =
    bands.perfectionCapBandCount ?? Number.POSITIVE_INFINITY;

  return {
    completionBands: Math.max(
      0,
      Math.min(completionCount, completionCeiling) - completionRequired,
    ),
    perfectionBands: Math.max(
      0,
      Math.min(perfectionCount, perfectionCeiling) - perfectionRequired,
    ),
  };
}
