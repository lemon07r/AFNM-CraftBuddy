//! Cross-engine differential guard (Rust side).
//!
//! Replays `tests/differential_corpus.json` - generated from the TypeScript
//! simulator by `bun run optimizer:differential-corpus` - and asserts this
//! engine produces the same post-action state for every recorded transition.
//!
//! The corpus is the contract that makes promoting this engine to the canonical
//! simulator safe: without it, a Rust/TypeScript divergence shows up as a
//! silently worse recommendation instead of a failing test.

use super::*;
use serde::Deserialize;

const CORPUS: &str = include_str!("../tests/differential_corpus.json");

#[derive(Debug, Deserialize)]
struct Corpus {
    version: u32,
    scenarios: Vec<Scenario>,
}

#[derive(Debug, Deserialize)]
struct Scenario {
    name: String,
    /// Already snake_case: produced by `buildNativeMctsInput`, which emits the
    /// Rust field names directly.
    input: MctsInput,
    cases: Vec<Case>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Case {
    skill_index: usize,
    skill_key: String,
    expected: Option<Expectation>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct Expectation {
    qi: f64,
    stability: f64,
    stability_penalty: f64,
    completion: f64,
    perfection: f64,
    toxicity: f64,
    harmony: f64,
    step: i32,
    completion_bonus: i32,
    control_buff_turns: i32,
    intensity_buff_turns: i32,
    cooldowns: Vec<i32>,
    buffs: Vec<BuffExpectation>,
    items: Vec<ItemExpectation>,
    consumed_pills_this_turn: i32,
    harmony_data: HarmonyDigest,
}

#[derive(Debug, Deserialize)]
struct BuffExpectation {
    key: String,
    stacks: i32,
}

#[derive(Debug, Deserialize)]
struct ItemExpectation {
    key: String,
    count: i32,
}

/// Flattened harmony-subsystem digest, mirroring `DifferentialHarmonyDigest`.
#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct HarmonyDigest {
    forge_heat: Option<i32>,
    forge_last_buffed_heat: Option<i32>,
    alchemical_charges: Option<Vec<String>>,
    alchemical_last_combo: Option<Vec<String>>,
    inscription_current_block: Option<Vec<String>>,
    inscription_completed_blocks: Option<i32>,
    inscription_stacks: Option<i32>,
    resonance_type: Option<String>,
    resonance_strength: Option<i32>,
    resonance_pending: Option<String>,
    resonance_pending_count: Option<i32>,
    echo_attuned_type: Option<String>,
    echo_last_outcome: Option<String>,
    decree_focused_bar: Option<String>,
    decree_last_completion: Option<f64>,
    decree_last_perfection: Option<f64>,
}

fn parse_corpus() -> Corpus {
    serde_json::from_str(CORPUS).expect("differential corpus matches the schema")
}

fn diff_field(
    failures: &mut Vec<String>,
    scenario: &str,
    skill_key: &str,
    field: &str,
    actual: f64,
    expected: f64,
) {
    if (actual - expected).abs() > 1e-6 {
        failures.push(format!(
            "{scenario}/{skill_key}: {field} = {actual}, expected {expected}"
        ));
    }
}

fn diff_debug<T: std::fmt::Debug + PartialEq>(
    failures: &mut Vec<String>,
    scenario: &str,
    skill_key: &str,
    field: &str,
    actual: T,
    expected: T,
) {
    if actual != expected {
        failures.push(format!(
            "{scenario}/{skill_key}: {field} = {actual:?}, expected {expected:?}"
        ));
    }
}

fn diff_opt_number(
    failures: &mut Vec<String>,
    scenario: &str,
    skill_key: &str,
    field: &str,
    actual: Option<f64>,
    expected: Option<f64>,
) {
    let matches = match (actual, expected) {
        (None, None) => true,
        (Some(a), Some(b)) => (a - b).abs() <= 1e-6,
        _ => false,
    };
    if !matches {
        failures.push(format!(
            "{scenario}/{skill_key}: {field} = {actual:?}, expected {expected:?}"
        ));
    }
}

/// Compare the harmony subsystem state field by field.
///
/// The scalar `harmony` value alone is not enough: a wrong Forge heat or a stale
/// Resonance pending switch can produce the same delta this turn and diverge on
/// the next one.
fn diff_harmony(
    failures: &mut Vec<String>,
    scenario: &str,
    skill_key: &str,
    actual: &HarmonyData,
    expected: &HarmonyDigest,
) {
    let forge = actual.forge_works.as_ref();
    diff_debug(
        failures,
        scenario,
        skill_key,
        "harmonyData.forgeHeat",
        forge.map(|data| data.heat),
        expected.forge_heat,
    );
    diff_debug(
        failures,
        scenario,
        skill_key,
        "harmonyData.forgeLastBuffedHeat",
        forge.and_then(|data| data.last_buffed_heat),
        expected.forge_last_buffed_heat,
    );

    let alchemical = actual.alchemical_arts.as_ref();
    diff_debug(
        failures,
        scenario,
        skill_key,
        "harmonyData.alchemicalCharges",
        alchemical.map(|data| data.charges.clone()),
        expected.alchemical_charges.clone(),
    );
    diff_debug(
        failures,
        scenario,
        skill_key,
        "harmonyData.alchemicalLastCombo",
        alchemical.map(|data| data.last_combo.clone()),
        expected.alchemical_last_combo.clone(),
    );

    let inscription = actual.inscribed_patterns.as_ref();
    diff_debug(
        failures,
        scenario,
        skill_key,
        "harmonyData.inscriptionCurrentBlock",
        inscription.map(|data| data.current_block.clone()),
        expected.inscription_current_block.clone(),
    );
    diff_debug(
        failures,
        scenario,
        skill_key,
        "harmonyData.inscriptionCompletedBlocks",
        inscription.map(|data| data.completed_blocks),
        expected.inscription_completed_blocks,
    );
    diff_debug(
        failures,
        scenario,
        skill_key,
        "harmonyData.inscriptionStacks",
        inscription.map(|data| data.stacks),
        expected.inscription_stacks,
    );

    let resonance = actual.resonance.as_ref();
    diff_debug(
        failures,
        scenario,
        skill_key,
        "harmonyData.resonanceType",
        resonance.and_then(|data| data.resonance.clone()),
        expected.resonance_type.clone(),
    );
    diff_debug(
        failures,
        scenario,
        skill_key,
        "harmonyData.resonanceStrength",
        resonance.map(|data| data.strength),
        expected.resonance_strength,
    );
    diff_debug(
        failures,
        scenario,
        skill_key,
        "harmonyData.resonancePending",
        resonance.and_then(|data| data.pending_resonance.clone()),
        expected.resonance_pending.clone(),
    );
    diff_debug(
        failures,
        scenario,
        skill_key,
        "harmonyData.resonancePendingCount",
        resonance.map(|data| data.pending_count),
        expected.resonance_pending_count,
    );

    let echo = actual.enhancing_echo.as_ref();
    diff_debug(
        failures,
        scenario,
        skill_key,
        "harmonyData.echoAttunedType",
        echo.and_then(|data| data.attuned_type.clone()),
        expected.echo_attuned_type.clone(),
    );
    diff_debug(
        failures,
        scenario,
        skill_key,
        "harmonyData.echoLastOutcome",
        echo.and_then(|data| data.last_outcome.clone()),
        expected.echo_last_outcome.clone(),
    );

    let decree = actual.eccentric_decree.as_ref();
    diff_debug(
        failures,
        scenario,
        skill_key,
        "harmonyData.decreeFocusedBar",
        decree.map(|data| data.focused_bar.clone()),
        expected.decree_focused_bar.clone(),
    );
    diff_opt_number(
        failures,
        scenario,
        skill_key,
        "harmonyData.decreeLastCompletion",
        decree.map(|data| data.last_completion),
        expected.decree_last_completion,
    );
    diff_opt_number(
        failures,
        scenario,
        skill_key,
        "harmonyData.decreeLastPerfection",
        decree.map(|data| data.last_perfection),
        expected.decree_last_perfection,
    );
}

#[test]
fn matches_the_typescript_simulator() {
    let corpus = parse_corpus();
    assert_eq!(corpus.version, 2, "unexpected differential corpus version");
    assert!(
        corpus.scenarios.len() >= 120,
        "differential corpus is suspiciously small"
    );

    let mut failures: Vec<String> = Vec::new();
    let mut compared = 0usize;

    for scenario in corpus.scenarios {
        let name = scenario.name.clone();
        let engine = Engine::new(scenario.input.clone());
        let queue = normalize_queue(&scenario.input.forecasted_conditions);

        for case in scenario.cases {
            let skill = match scenario.input.skills.get(case.skill_index) {
                Some(skill) => skill,
                None => {
                    failures.push(format!("{name}/{}: missing skill", case.skill_key));
                    continue;
                }
            };
            let action = Action {
                skill_index: Some(case.skill_index),
                key: skill.key.clone(),
                name: skill.name.clone(),
            };
            let mut rng = SmallRng::new(1);
            let applied = engine.apply_action_with_rng(
                &scenario.input.state,
                &scenario.input.current_condition,
                &queue,
                &action,
                &mut rng,
                None,
            );

            match (applied, case.expected) {
                (None, None) => {}
                (Some(_), None) => failures.push(format!(
                    "{name}/{}: Rust allowed an action TypeScript rejects",
                    case.skill_key
                )),
                (None, Some(_)) => failures.push(format!(
                    "{name}/{}: Rust rejected an action TypeScript allows",
                    case.skill_key
                )),
                (Some((next, _, _)), Some(expected)) => {
                    compared += 1;
                    let key = case.skill_key.as_str();
                    diff_field(&mut failures, &name, key, "qi", next.qi, expected.qi);
                    diff_field(
                        &mut failures,
                        &name,
                        key,
                        "stability",
                        next.stability,
                        expected.stability,
                    );
                    diff_field(
                        &mut failures,
                        &name,
                        key,
                        "stability_penalty",
                        next.stability_penalty,
                        expected.stability_penalty,
                    );
                    diff_field(
                        &mut failures,
                        &name,
                        key,
                        "completion",
                        next.completion,
                        expected.completion,
                    );
                    diff_field(
                        &mut failures,
                        &name,
                        key,
                        "perfection",
                        next.perfection,
                        expected.perfection,
                    );
                    diff_field(
                        &mut failures,
                        &name,
                        key,
                        "toxicity",
                        next.toxicity,
                        expected.toxicity,
                    );
                    diff_field(
                        &mut failures,
                        &name,
                        key,
                        "harmony",
                        next.harmony,
                        expected.harmony,
                    );
                    diff_field(
                        &mut failures,
                        &name,
                        key,
                        "step",
                        next.step as f64,
                        expected.step as f64,
                    );
                    diff_field(
                        &mut failures,
                        &name,
                        key,
                        "completion_bonus",
                        next.completion_bonus as f64,
                        expected.completion_bonus as f64,
                    );
                    diff_field(
                        &mut failures,
                        &name,
                        key,
                        "control_buff_turns",
                        next.control_buff_turns as f64,
                        expected.control_buff_turns as f64,
                    );
                    diff_field(
                        &mut failures,
                        &name,
                        key,
                        "intensity_buff_turns",
                        next.intensity_buff_turns as f64,
                        expected.intensity_buff_turns as f64,
                    );
                    for (index, expected_cd) in expected.cooldowns.iter().enumerate() {
                        let actual = next.cooldowns.get(index).copied().unwrap_or(0);
                        diff_field(
                            &mut failures,
                            &name,
                            key,
                            &format!("cooldown[{index}]"),
                            actual as f64,
                            *expected_cd as f64,
                        );
                    }
                    diff_field(
                        &mut failures,
                        &name,
                        key,
                        "consumed_pills_this_turn",
                        next.consumed_pills_this_turn as f64,
                        expected.consumed_pills_this_turn as f64,
                    );
                    // Order matters: buff iteration order decides which buff
                    // composes its cost percentage first.
                    diff_debug(
                        &mut failures,
                        &name,
                        key,
                        "buffs",
                        next.buffs
                            .iter()
                            .map(|buff| (buff.key.clone(), buff.stacks))
                            .collect::<Vec<_>>(),
                        expected
                            .buffs
                            .iter()
                            .map(|buff| (buff.key.clone(), buff.stacks))
                            .collect::<Vec<_>>(),
                    );
                    diff_debug(
                        &mut failures,
                        &name,
                        key,
                        "items",
                        next.items
                            .iter()
                            .map(|item| (item.key.clone(), item.count))
                            .collect::<Vec<_>>(),
                        expected
                            .items
                            .iter()
                            .map(|item| (item.key.clone(), item.count))
                            .collect::<Vec<_>>(),
                    );
                    diff_harmony(
                        &mut failures,
                        &name,
                        key,
                        &next.harmony_data,
                        &expected.harmony_data,
                    );
                }
            }
        }
    }

    assert!(compared > 900, "compared only {compared} transitions");
    println!("differential corpus: compared {compared} transitions");

    if !failures.is_empty() {
        let shown = failures.iter().take(40).cloned().collect::<Vec<_>>();
        panic!(
            "{} cross-engine divergences ({} shown):\n{}",
            failures.len(),
            shown.len(),
            shown.join("\n")
        );
    }
}

/// The search must return the same ranking for the same input, every time.
///
/// This is not a theoretical property: `normalize_distribution` used to merge
/// the generated condition distribution through a `HashMap`, so the probability
/// total was summed in hash order and exact ties (`positive` vs `negative` at
/// harmony 0) were broken by hash order too. One in roughly four runs of the
/// same craft produced a different forecast and therefore a different policy.
/// A non-deterministic recommender cannot be regression-tested at all, so this
/// guards the property directly.
#[test]
fn mcts_search_is_deterministic() {
    let corpus = parse_corpus();
    let mut checked = 0usize;
    for scenario in corpus.scenarios.iter() {
        let mut input = scenario.input.clone();
        // Small but rollout-exercising budget: the property under test is
        // reproducibility, not search quality.
        input.search.iterations = 12;
        input.search.rollout_depth = 6;
        input.search.max_nodes = 96;

        let first = Engine::new(input.clone()).run();
        let second = Engine::new(input.clone()).run();
        assert_eq!(
            serde_json::to_string(&first).expect("result serializes"),
            serde_json::to_string(&second).expect("result serializes"),
            "scenario {} produced two different policies for one input",
            scenario.name
        );
        checked += 1;
    }
    assert!(checked > 100, "checked only {checked} scenarios");
    println!("determinism: {checked} scenarios re-ran identically");
}
