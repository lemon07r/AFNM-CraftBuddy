//! Engine profiling and behavioural-neutrality harness.
//!
//! These tests are `#[ignore]`d: they are measurement tools, not assertions
//! about correctness, and they need an input corpus that is not checked in
//! (`tmp/` is git-ignored). Produce it first, then run them:
//!
//! ```text
//! bun run scripts/optimizer/dump-native-mcts-inputs.ts
//! cargo test --manifest-path crates/craftbuddy-engine/Cargo.toml --release --lib \
//!   -- --ignored --nocapture --test-threads 1 profile_
//! ```
//!
//! Add `--features profiling` to the second command to also get the
//! instrumentation counts from `src/profiling.rs`.
//!
//! `profile_ranked_policy_digest` is the neutrality proof for any performance
//! change: it prints one deterministic line per fixture at a fixed node budget,
//! so `diff` over the captured output is a byte-level comparison of the ranked
//! candidate scores before and after.

use std::env;
use std::path::PathBuf;
use std::time::Instant;

use super::*;
use crate::profiling::Metric;

const DEFAULT_INPUTS: &str = "tmp/native-mcts-inputs.json";
/// Repetitions per fixture. Enough to keep run-to-run noise under ~2% on a
/// warm machine while keeping the whole harness well under a minute.
const REPEATS: usize = 8;

#[derive(Debug, serde::Deserialize)]
struct InputCorpus {
    #[allow(dead_code)]
    version: u32,
    inputs: Vec<InputEntry>,
}

#[derive(Debug, serde::Deserialize)]
struct InputEntry {
    fixture: String,
    input: MctsInput,
}

fn inputs_path() -> PathBuf {
    if let Ok(explicit) = env::var("CRAFTBUDDY_MCTS_INPUTS") {
        return PathBuf::from(explicit);
    }
    // CARGO_MANIFEST_DIR is `<repo>/crates/craftbuddy-engine`.
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../..")
        .join(DEFAULT_INPUTS)
}

/// Returns `None` (with an explanation) instead of failing when the corpus has
/// not been dumped, so `cargo test -- --ignored` stays usable on a fresh clone.
fn load_inputs() -> Option<Vec<InputEntry>> {
    let path = inputs_path();
    let raw = match std::fs::read_to_string(&path) {
        Ok(raw) => raw,
        Err(err) => {
            println!(
                "skipped: cannot read {} ({err}).\n  run `bun run scripts/optimizer/dump-native-mcts-inputs.ts` first",
                path.display()
            );
            return None;
        }
    };
    let corpus: InputCorpus =
        serde_json::from_str(&raw).expect("native MCTS input corpus must parse");
    assert!(!corpus.inputs.is_empty(), "input corpus must not be empty");
    Some(corpus.inputs)
}

fn print_counters(label: &str, divisor: u64) {
    if !profiling::AVAILABLE {
        println!("{label}: counters unavailable (build with --features profiling)");
        return;
    }
    let counts = profiling::snapshot();
    println!("{label} (per run, {divisor} runs):");
    for metric in Metric::ALL {
        let total = counts[metric as usize];
        println!(
            "  {:<24} {:>12} total  {:>10.1} per run",
            metric.label(),
            total,
            total as f64 / divisor.max(1) as f64
        );
    }
}

/// Wall-clock throughput of the whole MCTS search over production-shaped
/// payloads. This is the number a performance change has to move.
#[test]
#[ignore = "profiling harness; run explicitly with --ignored"]
fn profile_mcts_throughput() {
    let Some(inputs) = load_inputs() else {
        return;
    };

    // Warm the allocator and the instruction cache before measuring.
    for entry in &inputs {
        let _ = Engine::new(entry.input.clone()).run();
    }

    profiling::reset();
    let mut total_nanos = 0u128;
    let mut total_nodes = 0usize;
    let mut total_iterations = 0usize;

    println!(
        "{:<40} {:>7} {:>8} {:>10} {:>12}",
        "fixture", "nodes", "iters", "ms/run", "ns/node"
    );
    for entry in &inputs {
        let started = Instant::now();
        let mut nodes = 0usize;
        let mut iterations = 0usize;
        for _ in 0..REPEATS {
            let result = Engine::new(entry.input.clone()).run();
            nodes = result.nodes;
            iterations = result.iterations;
        }
        let elapsed = started.elapsed().as_nanos();
        total_nanos += elapsed;
        total_nodes += nodes * REPEATS;
        total_iterations += iterations * REPEATS;
        println!(
            "{:<40} {:>7} {:>8} {:>10.3} {:>12.0}",
            entry.fixture,
            nodes,
            iterations,
            elapsed as f64 / REPEATS as f64 / 1e6,
            elapsed as f64 / (nodes * REPEATS).max(1) as f64
        );
    }

    println!(
        "TOTAL {:.3} ms for {} runs ({} nodes, {} iterations) => {:.3} ms/run, {:.0} ns/node",
        total_nanos as f64 / 1e6,
        inputs.len() * REPEATS,
        total_nodes,
        total_iterations,
        total_nanos as f64 / (inputs.len() * REPEATS) as f64 / 1e6,
        total_nanos as f64 / total_nodes.max(1) as f64
    );
    print_counters("counters", (inputs.len() * REPEATS) as u64);
}

/// Per-call cost of the components the search spends its time in. Multiplied by
/// the counts from `profile_mcts_throughput --features profiling`, this is what
/// attributes the search budget without a sampling profiler.
#[test]
#[ignore = "profiling harness; run explicitly with --ignored"]
fn profile_component_microbench() {
    let Some(inputs) = load_inputs() else {
        return;
    };

    const CALLS: usize = 20_000;
    println!(
        "{:<38} {:>10} {:>10} {:>10} {:>10} {:>8} {:>10} {:>10} {:>10}",
        "fixture", "clone", "buffs", "canApply", "apply", "score", "maxpool", "resolveAct", "gains"
    );

    let mut totals = [0f64; 8];
    for entry in &inputs {
        let engine = Engine::new(entry.input.clone());
        let state = &engine.input.state;
        let env = engine.action_env();
        let condition = normalize_condition(&engine.input.current_condition);
        let condition_effects = engine.condition_effects(&condition);
        let skill_index = 0usize;
        let skill = &engine.input.skills[skill_index];

        let started = Instant::now();
        for _ in 0..CALLS {
            std::hint::black_box(state.clone());
        }
        let clone_ns = started.elapsed().as_nanos() as f64 / CALLS as f64;

        let started = Instant::now();
        for _ in 0..CALLS {
            std::hint::black_box(effects::resolve_active_buffs(state, env.config, env.skills));
        }
        let buffs_ns = started.elapsed().as_nanos() as f64 / CALLS as f64;

        let active = effects::resolve_active_buffs(state, env.config, env.skills);
        let started = Instant::now();
        for _ in 0..CALLS {
            std::hint::black_box(effects::can_apply_skill(
                &env,
                state,
                skill_index,
                skill,
                &condition,
                condition_effects,
                &active,
            ));
        }
        let can_apply_ns = started.elapsed().as_nanos() as f64 / CALLS as f64;

        let started = Instant::now();
        for _ in 0..CALLS {
            std::hint::black_box(effects::apply_skill(
                &env,
                state,
                skill_index,
                skill,
                &condition,
                condition_effects,
                engine.input.target_completion,
            ));
        }
        let apply_ns = started.elapsed().as_nanos() as f64 / CALLS as f64;

        let started = Instant::now();
        for _ in 0..CALLS {
            std::hint::black_box(engine.score_state(state));
        }
        let score_ns = started.elapsed().as_nanos() as f64 / CALLS as f64;

        // `apply_skill` internals: one transition calls `effective_max_pool`
        // twice, `resolve_action` once and `calculate_skill_gains` once.
        let started = Instant::now();
        for _ in 0..CALLS {
            std::hint::black_box(effects::effective_max_pool(state, env.config, &active));
        }
        let max_pool_ns = started.elapsed().as_nanos() as f64 / CALLS as f64;

        let started = Instant::now();
        for _ in 0..CALLS {
            std::hint::black_box(effects::resolve_action(
                &env,
                state,
                skill,
                condition_effects,
                &active,
            ));
        }
        let resolve_action_ns = started.elapsed().as_nanos() as f64 / CALLS as f64;

        let resolved = effects::resolve_action(&env, state, skill, condition_effects, &active);
        let started = Instant::now();
        for _ in 0..CALLS {
            std::hint::black_box(effects::calculate_skill_gains(
                &env, state, skill, &resolved,
            ));
        }
        let gains_ns = started.elapsed().as_nanos() as f64 / CALLS as f64;

        let row = [
            clone_ns,
            buffs_ns,
            can_apply_ns,
            apply_ns,
            score_ns,
            max_pool_ns,
            resolve_action_ns,
            gains_ns,
        ];
        println!(
            "{:<38} {:>10.1} {:>10.1} {:>10.1} {:>10.1} {:>8.1} {:>10.1} {:>10.1} {:>10.1}",
            entry.fixture, row[0], row[1], row[2], row[3], row[4], row[5], row[6], row[7]
        );
        for (slot, value) in totals.iter_mut().zip(row) {
            *slot += value;
        }
    }

    let count = inputs.len() as f64;
    println!(
        "{:<38} {:>10.1} {:>10.1} {:>10.1} {:>10.1} {:>8.1} {:>10.1} {:>10.1} {:>10.1}",
        "MEAN",
        totals[0] / count,
        totals[1] / count,
        totals[2] / count,
        totals[3] / count,
        totals[4] / count,
        totals[5] / count,
        totals[6] / count,
        totals[7] / count
    );
    println!(
        "clone share of one transition: {:.2}%",
        100.0 * totals[0] / totals[3].max(f64::MIN_POSITIVE)
    );
}

/// Neutrality proof. Prints the full ranked policy (key, visits, policy,
/// average and best score) for every fixture at a fixed node budget. Capture
/// before and after a performance change and `diff` the two files: any
/// behavioural delta shows up as a text difference.
#[test]
#[ignore = "profiling harness; run explicitly with --ignored"]
fn profile_ranked_policy_digest() {
    let Some(inputs) = load_inputs() else {
        return;
    };

    for entry in &inputs {
        let result = Engine::new(entry.input.clone()).run();
        println!(
            "fixture={} nodes={} iterations={} rollout_depth={} best={:?}",
            entry.fixture,
            result.nodes,
            result.iterations,
            result.rollout_depth,
            result.best_skill_key
        );
        for policy in &result.skill_policies {
            println!(
                "  {:<32} visits={:<6} policy={:.17e} avg={:.17e} best={:.17e}",
                policy.key, policy.visits, policy.policy, policy.average_score, policy.best_score
            );
        }

        // Determinism guard: the same input must produce the same ranking, or
        // the digest cannot be used as a neutrality proof at all.
        let repeat = Engine::new(entry.input.clone()).run();
        assert_eq!(
            serde_json::to_string(&result).unwrap(),
            serde_json::to_string(&repeat).unwrap(),
            "{} is not deterministic",
            entry.fixture
        );
    }
}
