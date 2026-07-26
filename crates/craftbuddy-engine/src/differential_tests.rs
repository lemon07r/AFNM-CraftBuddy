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

#[test]
fn matches_the_typescript_simulator() {
    let corpus = parse_corpus();
    assert_eq!(corpus.version, 1, "unexpected differential corpus version");
    assert!(
        corpus.scenarios.len() >= 40,
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
                }
            }
        }
    }

    assert!(compared > 300, "compared only {compared} transitions");

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
