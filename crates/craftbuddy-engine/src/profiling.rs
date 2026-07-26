//! Feature-gated instrumentation counters.
//!
//! There is no `perf`, `valgrind` or `flamegraph` on the development machines
//! this engine is tuned on, so hotspot attribution is done with explicit
//! counters instead of sampling. The counters are compiled out entirely unless
//! the `profiling` feature is enabled, so the WASM artefact and the normal test
//! build are byte-for-byte unaffected:
//!
//! ```text
//! cargo test --release --features profiling --lib -- --ignored --nocapture profile_
//! ```
//!
//! Counts alone do not prove where time goes, so
//! `profile_tests::profile_component_microbench` pairs them with per-call costs
//! measured in isolation. `count x cost` is what actually justifies (or
//! rejects) an optimisation.

// Every helper here is unused when the feature is off; that is the point.
#![allow(dead_code)]

/// One instrumented event. Keep the discriminants dense: they index the counter
/// array directly.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[repr(usize)]
pub enum Metric {
    /// One MCTS select/expand/rollout/backprop cycle.
    Iteration,
    /// A node was appended to the tree arena.
    NodeCreated,
    /// `EngineState::clone()`, at any call site.
    StateClone,
    /// `Engine::ordered_legal_actions` entered.
    OrderedLegalActions,
    /// `effects::can_apply_skill` entered.
    CanApplySkill,
    /// `effects::apply_skill` entered (a full transition).
    ApplySkill,
    /// `effects::resolve_active_buffs` entered.
    ResolveActiveBuffs,
    /// `Engine::score_state` entered.
    ScoreState,
    /// `Engine::preview_action_score` entered (a throwaway transition used only
    /// for move ordering).
    PreviewActionScore,
    /// One rollout step that actually applied an action.
    RolloutStep,
}

impl Metric {
    pub const COUNT: usize = 10;

    pub const ALL: [Metric; Metric::COUNT] = [
        Metric::Iteration,
        Metric::NodeCreated,
        Metric::StateClone,
        Metric::OrderedLegalActions,
        Metric::CanApplySkill,
        Metric::ApplySkill,
        Metric::ResolveActiveBuffs,
        Metric::ScoreState,
        Metric::PreviewActionScore,
        Metric::RolloutStep,
    ];

    pub fn label(self) -> &'static str {
        match self {
            Metric::Iteration => "iteration",
            Metric::NodeCreated => "node_created",
            Metric::StateClone => "state_clone",
            Metric::OrderedLegalActions => "ordered_legal_actions",
            Metric::CanApplySkill => "can_apply_skill",
            Metric::ApplySkill => "apply_skill",
            Metric::ResolveActiveBuffs => "resolve_active_buffs",
            Metric::ScoreState => "score_state",
            Metric::PreviewActionScore => "preview_action_score",
            Metric::RolloutStep => "rollout_step",
        }
    }
}

#[cfg(feature = "profiling")]
mod enabled {
    use super::Metric;
    use std::cell::Cell;

    thread_local! {
        static COUNTS: [Cell<u64>; Metric::COUNT] =
            std::array::from_fn(|_| Cell::new(0));
    }

    #[inline]
    pub fn bump(metric: Metric) {
        COUNTS.with(|counts| {
            let cell = &counts[metric as usize];
            cell.set(cell.get() + 1);
        });
    }

    pub fn reset() {
        COUNTS.with(|counts| {
            for cell in counts {
                cell.set(0);
            }
        });
    }

    pub fn snapshot() -> [u64; Metric::COUNT] {
        COUNTS.with(|counts| std::array::from_fn(|index| counts[index].get()))
    }

    pub const AVAILABLE: bool = true;
}

#[cfg(not(feature = "profiling"))]
mod enabled {
    use super::Metric;

    #[inline(always)]
    pub fn bump(_metric: Metric) {}

    pub fn reset() {}

    pub fn snapshot() -> [u64; Metric::COUNT] {
        [0; Metric::COUNT]
    }

    pub const AVAILABLE: bool = false;
}

#[allow(unused_imports)]
pub use enabled::{bump, reset, snapshot, AVAILABLE};

/// Records one instrumented event. Expands to nothing without the `profiling`
/// feature.
macro_rules! profile_count {
    ($metric:ident) => {
        $crate::profiling::bump($crate::profiling::Metric::$metric)
    };
}
