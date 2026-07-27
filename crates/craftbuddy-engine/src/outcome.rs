//! Craft outcome evaluation (AFNM 0.7.6).
//!
//! Rust mirror of `src/optimizer/outcome.ts`. The game decides a craft's tier
//! *conjunctively*: completion and perfection each have to clear their own band
//! count, and failing either one caps the result no matter how far the other
//! overshoots. Scoring the two bars as a weighted sum is what made the old
//! engine over-invest in whichever bar happened to be cheaper.
//!
//! Keep this file in lockstep with `outcome.ts`; `deriveBandGoals` and
//! `computeConjunctiveGoalScore` in `src/optimizer/search.ts` are the
//! TypeScript callers of the same model.

use super::{get_bonus_and_chance, EXPONENTIAL_SCALING_FACTOR};

/// Tier ranks, ascending. Mirrors `OUTCOME_TIER_ORDER`.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum OutcomeTier {
    Failed,
    Basic,
    Perfect,
    Sublime,
}

impl OutcomeTier {
    pub fn rank(self) -> i32 {
        match self {
            OutcomeTier::Failed => 0,
            OutcomeTier::Basic => 1,
            OutcomeTier::Perfect => 2,
            OutcomeTier::Sublime => 3,
        }
    }
}

/// Band counts a tier requires on each bar (runtime comparison order).
#[derive(Clone, Copy, Debug)]
pub struct TierRequirement {
    pub completion: i32,
    pub perfection: i32,
}

pub fn tier_requirement(tier: OutcomeTier) -> TierRequirement {
    match tier {
        OutcomeTier::Failed => TierRequirement {
            completion: 0,
            perfection: 0,
        },
        OutcomeTier::Basic => TierRequirement {
            completion: 1,
            perfection: 0,
        },
        OutcomeTier::Perfect => TierRequirement {
            completion: 1,
            perfection: 1,
        },
        OutcomeTier::Sublime => TierRequirement {
            completion: 2,
            perfection: 2,
        },
    }
}

#[derive(Clone, Copy, Debug)]
pub struct OutcomeBands {
    pub completion_target: f64,
    pub perfection_target: f64,
    pub completion_finish_flat: f64,
    pub perfection_finish_flat: f64,
    pub can_overcraft: bool,
    pub has_sublime_outcome: bool,
    pub target_tier: OutcomeTier,
}

#[derive(Clone, Copy, Debug)]
pub struct OutcomeClassification {
    /// Tier guaranteed by the current bars, ignoring the fractional bonus rolls.
    pub tier: OutcomeTier,
    /// Best tier reachable if both bonus rolls land.
    pub optimistic_tier: OutcomeTier,
    pub completion_bands: i32,
    pub perfection_bands: i32,
    pub completion_bonus_chance: f64,
    pub perfection_bonus_chance: f64,
    pub completion_margin: f64,
    pub perfection_margin: f64,
    pub completion_shortfall: f64,
    pub perfection_shortfall: f64,
    /// Mirrors `OutcomeClassification.willAutoFinish` in `outcome.ts`. The
    /// engine calls the free `will_auto_finish` directly at the transition
    /// site, so this is carried for parity with the TypeScript contract.
    #[allow(dead_code)]
    pub will_auto_finish: bool,
}

/// Total value needed to hold `band_count` bands (runtime `tLa`).
///
/// Widths compound by 1.3 with a floor each step; the running total is floored
/// once at the end.
pub fn band_threshold(band_width: f64, band_count: i32) -> f64 {
    if !band_width.is_finite() || band_width <= 0.0 || band_count <= 0 {
        return 0.0;
    }
    let mut width = band_width;
    let mut total = 0.0;
    for _ in 0..band_count {
        total += width;
        width = (width * EXPONENTIAL_SCALING_FACTOR).floor();
    }
    total.floor()
}

pub fn build_outcome_bands(
    target_completion: f64,
    target_perfection: f64,
    is_sublime_craft: bool,
    max_completion_cap: Option<f64>,
    max_perfection_cap: Option<f64>,
) -> OutcomeBands {
    let completion_target = target_completion.max(0.0);
    let perfection_target = target_perfection.max(0.0);
    let has_sublime_outcome = is_sublime_craft;
    let target_tier = if has_sublime_outcome {
        OutcomeTier::Sublime
    } else {
        OutcomeTier::Perfect
    };
    let requirement = tier_requirement(target_tier);

    let derived_completion_flat = band_threshold(completion_target, requirement.completion);
    let derived_perfection_flat = band_threshold(perfection_target, requirement.perfection);

    let completion_cap = max_completion_cap.filter(|cap| cap.is_finite() && *cap > 0.0);
    let perfection_cap = max_perfection_cap.filter(|cap| cap.is_finite() && *cap > 0.0);

    OutcomeBands {
        completion_target,
        perfection_target,
        completion_finish_flat: completion_cap.unwrap_or(derived_completion_flat),
        perfection_finish_flat: perfection_cap.unwrap_or(derived_perfection_flat),
        // The overcraft finish branch only exists when the caps run deeper than
        // the tier requirement.
        can_overcraft: completion_cap
            .map(|cap| cap > derived_completion_flat)
            .unwrap_or(false),
        has_sublime_outcome,
        target_tier,
    }
}

/// Tier produced by a pair of effective band counts, in the runtime's order.
pub fn tier_for_bands(
    completion_bands: i32,
    perfection_bands: i32,
    has_sublime_outcome: bool,
) -> OutcomeTier {
    if completion_bands == 0 {
        return OutcomeTier::Failed;
    }
    if completion_bands > 1 && perfection_bands > 1 && has_sublime_outcome {
        return OutcomeTier::Sublime;
    }
    if perfection_bands > 0 {
        return OutcomeTier::Perfect;
    }
    OutcomeTier::Basic
}

/// Fractional progress toward a band requirement, capped at 1.
fn requirement_progress(guaranteed: i32, bonus_chance: f64, required: i32) -> f64 {
    if required <= 0 {
        return 1.0;
    }
    let achieved = guaranteed as f64 + bonus_chance.clamp(0.0, 1.0);
    (achieved / required as f64).clamp(0.0, 1.0)
}

/// The game's auto-finish predicate.
///
/// Once this holds the craft ends whether the player wants it to or not, which
/// is what lets the search stop one action short instead of banking perfection
/// it will never keep.
pub fn will_auto_finish(
    completion: f64,
    perfection: f64,
    stability: f64,
    bands: &OutcomeBands,
    completion_bands_hint: Option<i32>,
) -> bool {
    if stability <= 0.0 {
        return true;
    }
    let perfection_ready = perfection >= bands.perfection_finish_flat;
    if completion >= bands.completion_finish_flat && perfection_ready {
        return true;
    }
    if bands.can_overcraft && perfection_ready {
        let completion_bands = completion_bands_hint.unwrap_or_else(|| {
            get_bonus_and_chance(completion.max(0.0), bands.completion_target).guaranteed
        });
        if completion_bands >= 5 {
            return true;
        }
    }
    false
}

pub fn classify_outcome(
    completion: f64,
    perfection: f64,
    stability: f64,
    bands: &OutcomeBands,
) -> OutcomeClassification {
    let completion = completion.max(0.0);
    let perfection = perfection.max(0.0);

    // A zero recipe target means the bar is not part of the craft. The ladder
    // cannot award bands against a 0-width target, so treat it as satisfied
    // rather than permanently failed.
    let (completion_guaranteed, completion_bonus_chance) = if bands.completion_target > 0.0 {
        let band = get_bonus_and_chance(completion, bands.completion_target);
        (band.guaranteed, band.bonus_chance)
    } else {
        (1, 0.0)
    };
    let (perfection_guaranteed, perfection_bonus_chance) = if bands.perfection_target > 0.0 {
        let band = get_bonus_and_chance(perfection, bands.perfection_target);
        (band.guaranteed, band.bonus_chance)
    } else {
        (1, 0.0)
    };

    let tier = tier_for_bands(
        completion_guaranteed,
        perfection_guaranteed,
        bands.has_sublime_outcome,
    );
    let optimistic_tier = tier_for_bands(
        completion_guaranteed + if completion_bonus_chance > 0.0 { 1 } else { 0 },
        perfection_guaranteed + if perfection_bonus_chance > 0.0 { 1 } else { 0 },
        bands.has_sublime_outcome,
    );

    let requirement = tier_requirement(bands.target_tier);
    let completion_required = if bands.completion_target > 0.0 {
        requirement.completion
    } else {
        0
    };
    let perfection_required = if bands.perfection_target > 0.0 {
        requirement.perfection
    } else {
        0
    };

    OutcomeClassification {
        tier,
        optimistic_tier,
        completion_bands: completion_guaranteed,
        perfection_bands: perfection_guaranteed,
        completion_bonus_chance,
        perfection_bonus_chance,
        completion_margin: requirement_progress(
            completion_guaranteed,
            completion_bonus_chance,
            completion_required,
        ),
        perfection_margin: requirement_progress(
            perfection_guaranteed,
            perfection_bonus_chance,
            perfection_required,
        ),
        completion_shortfall: if bands.completion_target > 0.0 {
            (band_threshold(bands.completion_target, requirement.completion) - completion).max(0.0)
        } else {
            0.0
        },
        perfection_shortfall: if bands.perfection_target > 0.0 {
            (band_threshold(bands.perfection_target, requirement.perfection) - perfection).max(0.0)
        } else {
            0.0
        },
        will_auto_finish: will_auto_finish(
            completion,
            perfection,
            stability,
            bands,
            Some(completion_guaranteed),
        ),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn band_thresholds_compound_by_the_growth_ratio() {
        assert_eq!(band_threshold(100.0, 1), 100.0);
        assert_eq!(band_threshold(100.0, 2), 230.0);
        assert_eq!(band_threshold(0.0, 3), 0.0);
    }

    /// The whole point of the rework: overshooting completion cannot buy a
    /// sublime tier while perfection is a band short.
    #[test]
    fn sublime_requires_two_bands_on_both_bars() {
        let bands = build_outcome_bands(100.0, 80.0, true, None, None);
        let over_completed = classify_outcome(1000.0, 100.0, 50.0, &bands);
        assert_eq!(over_completed.tier, OutcomeTier::Perfect);
        assert!(over_completed.completion_margin >= 1.0);
        assert!(over_completed.perfection_margin < 1.0);

        let balanced = classify_outcome(230.0, 184.0, 50.0, &bands);
        assert_eq!(balanced.tier, OutcomeTier::Sublime);
    }

    #[test]
    fn zero_completion_bands_is_a_failed_craft() {
        let bands = build_outcome_bands(100.0, 80.0, false, None, None);
        assert_eq!(
            classify_outcome(50.0, 500.0, 50.0, &bands).tier,
            OutcomeTier::Failed
        );
    }

    #[test]
    fn auto_finish_fires_once_both_flats_are_met() {
        let bands = build_outcome_bands(100.0, 80.0, false, None, None);
        assert!(!will_auto_finish(99.0, 80.0, 50.0, &bands, None));
        assert!(will_auto_finish(100.0, 80.0, 50.0, &bands, None));
        assert!(will_auto_finish(0.0, 0.0, 0.0, &bands, None));
    }
}
