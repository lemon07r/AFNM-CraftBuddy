//! Unit tests for the ported mechanics in `effects.rs`.
//!
//! These cover each mechanic in isolation. Cross-engine agreement is proven
//! separately by `differential_tests.rs` against the checked-in corpus; both
//! layers are needed, because a unit test can be wrong in the same way on both
//! sides while a corpus case cannot.

use super::effects::*;
use super::*;
use serde_json::json;

fn scaling(value: serde_json::Value) -> Scaling {
    serde_json::from_value(value).expect("scaling should deserialize")
}

fn buff_definition(value: serde_json::Value) -> BuffDefinition {
    serde_json::from_value(value).expect("buff definition should deserialize")
}

fn vars(entries: &[(&str, f64)]) -> Variables {
    entries
        .iter()
        .map(|(key, value)| ((*key).to_string(), *value))
        .collect()
}

fn base_config() -> EngineConfig {
    serde_json::from_value(json!({
        "max_qi": 200.0,
        "max_stability": 60.0,
        "base_intensity": 10.0,
        "base_control": 8.0,
        "min_stability": 0.0,
        "default_buff_multiplier": 1.4,
        "max_toxicity": 100.0,
        "target_completion": 100.0,
        "target_perfection": 100.0,
        "pills_per_round": 1.0
    }))
    .expect("config should deserialize")
}

fn base_state() -> EngineState {
    serde_json::from_value(json!({
        "qi": 100.0,
        "stability": 50.0,
        "initial_max_stability": 60.0,
        "crit_multiplier": 150.0,
        "max_toxicity": 100.0
    }))
    .expect("state should deserialize")
}

fn skill(value: serde_json::Value) -> EngineSkill {
    serde_json::from_value(value).expect("skill should deserialize")
}

fn minimal_skill(key: &str) -> serde_json::Value {
    json!({ "name": key, "key": key, "technique_type": "refine", "action_kind": "skill" })
}

fn merge(base: serde_json::Value, extra: serde_json::Value) -> serde_json::Value {
    let mut merged = base;
    let (Some(target), Some(source)) = (merged.as_object_mut(), extra.as_object()) else {
        return merged;
    };
    for (key, value) in source {
        target.insert(key.clone(), value.clone());
    }
    merged
}

// ---------------------------------------------------------------------------
// Expression evaluation
// ---------------------------------------------------------------------------

#[test]
fn evaluates_arithmetic_and_precedence() {
    let variables = vars(&[("control", 10.0)]);
    assert_eq!(eval_expression("1 + 2 * 3", &variables), 7.0);
    assert_eq!(eval_expression("(1 + 2) * 3", &variables), 9.0);
    assert_eq!(eval_expression("control / 4", &variables), 2.5);
    assert_eq!(eval_expression("7 % 4", &variables), 3.0);
    assert_eq!(eval_expression("-control + 1", &variables), -9.0);
}

#[test]
fn evaluates_math_helpers_like_the_runtime() {
    let variables = vars(&[("stacks", 3.0)]);
    assert_eq!(eval_expression("floor(2.9)", &variables), 2.0);
    assert_eq!(eval_expression("ceil(2.1)", &variables), 3.0);
    assert_eq!(eval_expression("round(2.5)", &variables), 3.0);
    assert_eq!(eval_expression("round(-2.5)", &variables), -2.0);
    assert_eq!(eval_expression("min(stacks, 2)", &variables), 2.0);
    assert_eq!(eval_expression("max(stacks, 5)", &variables), 5.0);
    assert_eq!(eval_expression("abs(0 - stacks)", &variables), 3.0);
}

#[test]
fn logical_operators_return_operands_like_javascript() {
    let variables = vars(&[("stacks", 4.0)]);
    // `a && b` yields `b` when `a` is truthy, and `a` otherwise.
    assert_eq!(eval_expression("stacks && 7", &variables), 7.0);
    assert_eq!(eval_expression("0 && 7", &variables), 0.0);
    assert_eq!(eval_expression("0 || stacks", &variables), 4.0);
    assert_eq!(eval_expression("stacks || 9", &variables), 4.0);
    // The runtime rewrites the word forms before evaluating.
    assert_eq!(eval_expression("stacks and 7", &variables), 7.0);
    assert_eq!(eval_expression("0 or 3", &variables), 3.0);
}

#[test]
fn comparisons_produce_one_or_zero() {
    let variables = vars(&[("completion", 50.0)]);
    assert_eq!(eval_expression("completion > 40", &variables), 1.0);
    assert_eq!(eval_expression("completion >= 50", &variables), 1.0);
    assert_eq!(eval_expression("completion < 40", &variables), 0.0);
    assert_eq!(eval_expression("completion == 50", &variables), 1.0);
    assert_eq!(eval_expression("completion != 50", &variables), 0.0);
    assert_eq!(eval_expression("!0", &variables), 1.0);
}

#[test]
fn rng_placeholder_resolves_to_the_expected_value() {
    assert_eq!(eval_expression("{rng} * 10", &vars(&[])), 5.0);
}

#[test]
fn rejects_unsafe_or_unparsable_expressions() {
    let variables = vars(&[("control", 10.0)]);
    // An empty formula is neutral, not zero.
    assert_eq!(eval_expression("", &variables), 1.0);
    // Assignment, blocked keywords and disallowed characters all collapse to 0.
    assert_eq!(eval_expression("control = 5", &variables), 0.0);
    assert_eq!(eval_expression("return control", &variables), 0.0);
    assert_eq!(eval_expression("control ? 1 : 2", &variables), 0.0);
    assert_eq!(eval_expression("control +", &variables), 0.0);
    assert_eq!(eval_expression("control[0]", &variables), 0.0);
    // Unknown identifiers read as 0 rather than failing the whole formula.
    assert_eq!(eval_expression("unknown_variable + 2", &variables), 2.0);
}

#[test]
fn variable_lookup_falls_back_to_normalized_spellings() {
    let variables = vars(&[("purifying_intensity", 3.0)]);
    assert_eq!(get_variable_value(&variables, "purifying_intensity"), 3.0);
    assert_eq!(get_variable_value(&variables, "Purifying Intensity"), 3.0);
    assert_eq!(get_variable_value(&variables, "missing"), 0.0);
}

// ---------------------------------------------------------------------------
// Scaling
// ---------------------------------------------------------------------------

#[test]
fn scaling_applies_stat_equation_and_custom_scaling() {
    let variables = vars(&[("intensity", 12.0), ("stacks", 4.0)]);
    assert_eq!(
        evaluate_scaling(
            Some(&scaling(json!({ "value": 2.0, "stat": "intensity" }))),
            &variables,
            0.0
        ),
        24.0
    );
    assert_eq!(
        evaluate_scaling(
            Some(&scaling(json!({ "value": 3.0, "eqn": "1 + stacks" }))),
            &variables,
            0.0
        ),
        15.0
    );
    assert_eq!(
        evaluate_scaling(
            Some(&scaling(
                json!({ "value": 10.0, "customScaling": { "multiplier": 0.5, "scaling": "stacks" } })
            )),
            &variables,
            0.0
        ),
        30.0
    );
    assert_eq!(
        evaluate_scaling(
            Some(&scaling(json!({ "value": 5.0, "additiveEqn": "stacks" }))),
            &variables,
            0.0
        ),
        9.0
    );
}

#[test]
fn scaling_rounds_by_magnitude() {
    let variables = vars(&[("intensity", 1.0)]);
    // Above 10 the runtime floors.
    assert_eq!(
        evaluate_scaling(Some(&scaling(json!({ "value": 10.7 }))), &variables, 0.0),
        10.0
    );
    // Below -10 it ceils toward zero.
    assert_eq!(
        evaluate_scaling(Some(&scaling(json!({ "value": -10.7 }))), &variables, 0.0),
        -10.0
    );
    // Within the band it keeps two decimals.
    assert_eq!(
        evaluate_scaling(Some(&scaling(json!({ "value": 2.345 }))), &variables, 0.0),
        2.35
    );
    // A whole result stays whole rather than becoming 3.00.
    assert_eq!(
        evaluate_scaling(Some(&scaling(json!({ "value": 3.0 }))), &variables, 0.0),
        3.0
    );
}

#[test]
fn scaling_max_clamps_toward_zero_on_both_signs() {
    let variables = vars(&[("intensity", 100.0)]);
    assert_eq!(
        evaluate_scaling(
            Some(&scaling(
                json!({ "value": 1.0, "stat": "intensity", "max": { "value": 40.0 } })
            )),
            &variables,
            0.0
        ),
        40.0
    );
    assert_eq!(
        evaluate_scaling(
            Some(&scaling(
                json!({ "value": -1.0, "stat": "intensity", "max": { "value": -40.0 } })
            )),
            &variables,
            0.0
        ),
        -40.0
    );
}

#[test]
fn scaling_defaults_when_absent() {
    assert_eq!(evaluate_scaling(None, &vars(&[]), 7.0), 7.0);
}

// ---------------------------------------------------------------------------
// Mastery
// ---------------------------------------------------------------------------

#[test]
fn mastery_percentages_are_treated_as_percentages() {
    let config = base_config();
    let state = base_state();
    let subject = skill(merge(
        minimal_skill("focused_refine"),
        json!({
            "base_perfection_gain": 1.0,
            "scales_with_control": true,
            "mastery_entries": [
                { "kind": "control", "percentage": 50.0 },
                { "kind": "critchance", "percentage": 10.0 }
            ]
        }),
    ));
    let skills = vec![subject.clone()];
    let env = ActionEnv {
        config: &config,
        skills: &skills,
    };
    let resolved = resolve_action(
        &env,
        &state,
        &subject,
        ConditionEffectSummary::default(),
        &[],
    );
    assert!((resolved.mastery.control_bonus - 0.5).abs() < 1e-9);
    assert!((resolved.mastery.crit_chance_bonus - 10.0).abs() < 1e-9);

    // base control 8 * 1.5 = 12 perfection before the crit expectation.
    let gains = calculate_skill_gains(&env, &state, &subject, &resolved);
    assert!(gains.perfection >= 12.0);
}

#[test]
fn conditional_mastery_only_applies_when_its_condition_holds() {
    let config = base_config();
    let mastery = json!({
        "mastery_entries": [{
            "kind": "control",
            "percentage": 100.0,
            "condition": { "kind": "stability", "mode": "less", "percentage": 50.0 }
        }],
        "base_perfection_gain": 1.0,
        "scales_with_control": true
    });
    let subject = skill(merge(minimal_skill("conditional_refine"), mastery));
    let skills = vec![subject.clone()];
    let env = ActionEnv {
        config: &config,
        skills: &skills,
    };

    // 50/60 stability is above the 50% threshold, so the mastery is inert.
    let high = resolve_action(
        &env,
        &base_state(),
        &subject,
        ConditionEffectSummary::default(),
        &[],
    );
    assert_eq!(high.mastery.control_bonus, 0.0);

    let mut low_state = base_state();
    low_state.stability = 10.0;
    let low = resolve_action(
        &env,
        &low_state,
        &subject,
        ConditionEffectSummary::default(),
        &[],
    );
    assert!((low.mastery.control_bonus - 1.0).abs() < 1e-9);
}

#[test]
fn upgrade_mastery_rewrites_only_the_keyed_scaling() {
    let config = base_config();
    let state = base_state();
    let subject = skill(merge(
        minimal_skill("upgraded_refine"),
        json!({
            "effects": [
                { "kind": "perfection", "amount": { "value": 2.0, "stat": "control", "upgradeKey": "boost" } },
                { "kind": "completion", "amount": { "value": 2.0, "stat": "control" } }
            ],
            "mastery_entries": [
                { "kind": "upgrade", "upgradeKey": "boost", "change": 1.0 }
            ]
        }),
    ));
    let skills = vec![subject.clone()];
    let env = ActionEnv {
        config: &config,
        skills: &skills,
    };
    let resolved = resolve_action(
        &env,
        &state,
        &subject,
        ConditionEffectSummary::default(),
        &[],
    );
    assert_eq!(resolved.upgrades.len(), 1);
    let gains = calculate_skill_gains(&env, &state, &subject, &resolved);
    // Perfection uses value 3 (2 + 1) while completion keeps value 2.
    assert_eq!(gains.perfection, 24.0);
    assert_eq!(gains.completion, 16.0);
}

#[test]
fn mastery_cost_reductions_are_ratio_or_flat() {
    let ratio = skill(merge(
        minimal_skill("cheap"),
        json!({ "qi_cost": 20.0, "stability_cost": 10.0,
                "mastery": { "poolCostReduction": 0.25, "stabilityCostReduction": 0.5 } }),
    ));
    assert_eq!(effective_qi_cost(&ratio), 15.0);
    assert_eq!(effective_stability_cost(&ratio), 5.0);

    let flat = skill(merge(
        minimal_skill("cheaper"),
        json!({ "qi_cost": 20.0, "mastery": { "poolCostReduction": 6.0 } }),
    ));
    assert_eq!(effective_qi_cost(&flat), 14.0);
}

// ---------------------------------------------------------------------------
// Effect conditions
// ---------------------------------------------------------------------------

#[test]
fn buff_conditions_read_stacks_from_state_or_self() {
    let mut state = base_state();
    state.buffs = serde_json::from_value(json!([
        { "key": "soulflame", "name": "Soulflame", "stacks": 3 }
    ]))
    .expect("buffs should deserialize");
    let variables = vars(&[]);

    let more = serde_json::from_value(json!({
        "kind": "buff", "buff": { "name": "Soulflame" }, "mode": "more", "count": 2
    }))
    .expect("condition should deserialize");
    assert!(evaluate_effect_condition(Some(&more), &state, &variables, 0).met);

    let less = serde_json::from_value(json!({
        "kind": "buff", "buff": { "name": "Soulflame" }, "mode": "less", "count": 2
    }))
    .expect("condition should deserialize");
    assert!(!evaluate_effect_condition(Some(&less), &state, &variables, 0).met);

    let self_ref: EffectCondition = serde_json::from_value(json!({
        "kind": "buff", "buff": "self", "mode": "more", "count": 4
    }))
    .expect("condition should deserialize");
    assert!(!evaluate_effect_condition(Some(&self_ref), &state, &variables, 3).met);
    assert!(evaluate_effect_condition(Some(&self_ref), &state, &variables, 5).met);
}

#[test]
fn chance_conditions_become_expected_value_factors() {
    let state = base_state();
    let condition: EffectCondition =
        serde_json::from_value(json!({ "kind": "chance", "percentage": 25.0 }))
            .expect("condition should deserialize");
    let evaluation = evaluate_effect_condition(Some(&condition), &state, &vars(&[]), 0);
    assert!(evaluation.met);
    assert!((evaluation.probability - 0.25).abs() < 1e-9);
}

#[test]
fn resource_conditions_compare_percentages() {
    let state = base_state();
    let variables = vars(&[("pool", 20.0), ("maxpool", 100.0)]);
    let less: EffectCondition =
        serde_json::from_value(json!({ "kind": "pool", "mode": "less", "percentage": 30.0 }))
            .expect("condition should deserialize");
    assert!(evaluate_effect_condition(Some(&less), &state, &variables, 0).met);
    let more: EffectCondition =
        serde_json::from_value(json!({ "kind": "pool", "mode": "more", "percentage": 30.0 }))
            .expect("condition should deserialize");
    assert!(!evaluate_effect_condition(Some(&more), &state, &variables, 0).met);
}

// ---------------------------------------------------------------------------
// Effect-tree techniques
// ---------------------------------------------------------------------------

#[test]
fn effect_tree_supersedes_the_scalar_summary() {
    let config = base_config();
    let state = base_state();
    let subject = skill(merge(
        minimal_skill("tree_refine"),
        json!({
            // The scalar summary claims nothing; the tree is authoritative.
            "effects": [
                { "kind": "perfection", "amount": { "value": 3.0, "stat": "control" } },
                { "kind": "stability", "amount": { "value": -4.0 } },
                { "kind": "cleanseToxicity", "amount": { "value": 5.0 } }
            ]
        }),
    ));
    let skills = vec![subject.clone()];
    let env = ActionEnv {
        config: &config,
        skills: &skills,
    };
    let resolved = resolve_action(
        &env,
        &state,
        &subject,
        ConditionEffectSummary::default(),
        &[],
    );
    let gains = calculate_skill_gains(&env, &state, &subject, &resolved);
    assert_eq!(gains.perfection, 24.0);
    assert_eq!(gains.stability, -4.0);
    assert_eq!(gains.toxicity_cleanse, 5.0);
}

#[test]
fn negative_scaling_cannot_flip_a_positive_progress_effect() {
    let config = base_config();
    let mut state = base_state();
    state.completion = 0.0;
    let subject = skill(merge(
        minimal_skill("guarded"),
        json!({
            "effects": [
                { "kind": "completion", "amount": { "value": 5.0, "eqn": "0 - 2" } }
            ]
        }),
    ));
    let skills = vec![subject.clone()];
    let env = ActionEnv {
        config: &config,
        skills: &skills,
    };
    let resolved = resolve_action(
        &env,
        &state,
        &subject,
        ConditionEffectSummary::default(),
        &[],
    );
    assert_eq!(
        calculate_skill_gains(&env, &state, &subject, &resolved).completion,
        0.0
    );
}

#[test]
fn technique_pool_and_max_stability_effects_apply() {
    let config = base_config();
    let mut state = base_state();
    state.qi = 40.0;
    state.stability_penalty = 10.0;
    state.stability = 30.0;
    let subject = skill(merge(
        minimal_skill("restorer"),
        json!({
            "technique_type": "support",
            "effects": [
                { "kind": "pool", "amount": { "value": 25.0 } },
                { "kind": "maxStability", "amount": { "value": 5.0 } }
            ]
        }),
    ));
    let skills = vec![subject.clone()];
    let env = ActionEnv {
        config: &config,
        skills: &skills,
    };
    let next = apply_skill(
        &env,
        &state,
        0,
        &subject,
        "none",
        ConditionEffectSummary::default(),
        100.0,
    )
    .expect("action should be legal");
    assert_eq!(next.qi, 65.0);
    // One turn of decay (+1) then a 5-point restore leaves a penalty of 6.
    assert_eq!(next.stability_penalty, 6.0);
}

// ---------------------------------------------------------------------------
// Buffs
// ---------------------------------------------------------------------------

#[test]
fn create_buff_respects_stack_and_max_stack_rules() {
    let mut set = BuffSet::new(Vec::new());
    let stackable =
        buff_definition(json!({ "name": "Soulflame", "canStack": true, "maxStacks": 3 }));
    set.upsert_from_definition(Some(&stackable), 2.0);
    assert_eq!(set.stacks("soulflame"), 2);
    set.upsert_from_definition(Some(&stackable), 5.0);
    assert_eq!(set.stacks("soulflame"), 3);

    let unstackable = buff_definition(json!({ "name": "Unique", "canStack": false }));
    set.upsert_from_definition(Some(&unstackable), 1.0);
    assert_eq!(set.stacks("unique"), 1);
    set.upsert_from_definition(Some(&unstackable), 1.0);
    assert_eq!(set.stacks("unique"), 1);
}

#[test]
fn buff_stats_contribute_additively_and_multiplicatively() {
    let config = base_config();
    let mut state = base_state();
    state.buffs = serde_json::from_value(json!([
        {
            "key": "purifying_intensity",
            "name": "Purifying Intensity",
            "stacks": 2,
            "definition": {
                "name": "Purifying Intensity",
                "stats": {
                    "intensity": { "value": 3.0, "scaling": "stacks" },
                    "poolCostPercentage": { "value": 50.0 }
                }
            }
        }
    ]))
    .expect("buffs should deserialize");

    let skills: Vec<EngineSkill> = Vec::new();
    let active = resolve_active_buffs(&state, &config, &skills);
    let base = build_technique_scaling_base(&state, &config, &active);
    let adjusted = apply_buff_stat_contributions(&state, &base, &UpgradeMap::new(), &active);
    // The base intensity variable starts at 0 here, so this isolates the buff.
    assert_eq!(get_variable_value(&adjusted, "intensity"), 6.0);
    // 100% * 50% composes multiplicatively into 50.
    assert_eq!(get_variable_value(&adjusted, "poolCostPercentage"), 50.0);
}

#[test]
fn buff_cost_percentage_reduces_the_action_cost() {
    let config = base_config();
    let mut state = base_state();
    state.buffs = serde_json::from_value(json!([
        {
            "key": "efficient",
            "name": "Efficient",
            "stacks": 1,
            "definition": {
                "name": "Efficient",
                "stats": { "poolCostPercentage": { "value": 50.0 } }
            }
        }
    ]))
    .expect("buffs should deserialize");
    let subject = skill(merge(minimal_skill("spender"), json!({ "qi_cost": 30.0 })));
    let skills = vec![subject.clone()];
    let env = ActionEnv {
        config: &config,
        skills: &skills,
    };
    let active = resolve_active_buffs(&state, &config, &skills);
    let costs = calculate_effective_action_costs(
        &env,
        &state,
        &subject,
        ConditionEffectSummary::default(),
        &active,
    );
    assert_eq!(costs.qi_cost, 15.0);
}

#[test]
fn per_turn_buff_effects_run_once_per_turn_and_can_expire() {
    let config = base_config();
    let mut state = base_state();
    state.buffs = serde_json::from_value(json!([
        {
            "key": "lingering_perfection",
            "name": "Lingering Perfection",
            "stacks": 1,
            "definition": {
                "name": "Lingering Perfection",
                "effects": [
                    { "kind": "perfection", "amount": { "value": 7.0 } },
                    { "kind": "negate" }
                ]
            }
        }
    ]))
    .expect("buffs should deserialize");
    let subject = skill(merge(minimal_skill("plain"), json!({})));
    let skills = vec![subject.clone()];
    let env = ActionEnv {
        config: &config,
        skills: &skills,
    };
    let next = apply_skill(
        &env,
        &state,
        0,
        &subject,
        "none",
        ConditionEffectSummary::default(),
        100.0,
    )
    .expect("action should be legal");
    assert_eq!(next.perfection, 7.0);
    // `negate` removes the buff after it fires.
    assert_eq!(next.buff_stacks("lingering_perfection"), 0);
}

#[test]
fn action_type_hooks_only_fire_for_matching_technique_types() {
    let config = base_config();
    let mut state = base_state();
    state.buffs = serde_json::from_value(json!([
        {
            "key": "fusion_echo",
            "name": "Fusion Echo",
            "stacks": 1,
            "definition": {
                "name": "Fusion Echo",
                "onFusion": [{ "kind": "completion", "amount": { "value": 11.0 } }]
            }
        }
    ]))
    .expect("buffs should deserialize");

    let refine = skill(merge(minimal_skill("refiner"), json!({})));
    let fusion = skill(merge(
        minimal_skill("fuser"),
        json!({ "technique_type": "fusion" }),
    ));
    let skills = vec![refine.clone(), fusion.clone()];
    let env = ActionEnv {
        config: &config,
        skills: &skills,
    };

    let after_refine = apply_skill(
        &env,
        &state,
        0,
        &refine,
        "none",
        ConditionEffectSummary::default(),
        100.0,
    )
    .expect("refine should be legal");
    assert_eq!(after_refine.completion, 0.0);

    let after_fusion = apply_skill(
        &env,
        &state,
        1,
        &fusion,
        "none",
        ConditionEffectSummary::default(),
        100.0,
    )
    .expect("fusion should be legal");
    assert_eq!(after_fusion.completion, 11.0);
}

// ---------------------------------------------------------------------------
// Soulflame
// ---------------------------------------------------------------------------

/// Soulflame is not special-cased anywhere: it is a generic buff whose effect
/// tree trades stability for perfection and consumes a stack per turn. Modelling
/// the generic machinery is what makes it work, so this test pins the reported
/// "stability loss from soulflame triggers" behaviour end to end.
#[test]
fn soulflame_trades_stability_for_perfection_and_consumes_a_stack() {
    let config = base_config();
    let mut state = base_state();
    state.buffs = serde_json::from_value(json!([
        {
            "key": "soulflame",
            "name": "Soulflame",
            "stacks": 3,
            "definition": {
                "name": "Soulflame",
                "canStack": true,
                "maxStacks": 5,
                "effects": [
                    { "kind": "perfection", "amount": { "value": 4.0, "scaling": "stacks" } },
                    { "kind": "stability", "amount": { "value": -3.0 } },
                    { "kind": "addStack", "stacks": { "value": -1.0 } }
                ]
            }
        }
    ]))
    .expect("buffs should deserialize");

    let subject = skill(merge(minimal_skill("plain"), json!({})));
    let skills = vec![subject.clone()];
    let env = ActionEnv {
        config: &config,
        skills: &skills,
    };
    let next = apply_skill(
        &env,
        &state,
        0,
        &subject,
        "none",
        ConditionEffectSummary::default(),
        100.0,
    )
    .expect("action should be legal");

    assert_eq!(next.perfection, 12.0);
    // 50 stability, minus the 3-point Soulflame bite.
    assert_eq!(next.stability, 47.0);
    assert_eq!(next.buff_stacks("soulflame"), 2);
}

#[test]
fn soulflame_stack_consumption_removes_the_buff_at_zero() {
    let config = base_config();
    let mut state = base_state();
    state.buffs = serde_json::from_value(json!([
        {
            "key": "soulflame",
            "name": "Soulflame",
            "stacks": 1,
            "definition": {
                "name": "Soulflame",
                "effects": [{ "kind": "addStack", "stacks": { "value": -1.0 } }]
            }
        }
    ]))
    .expect("buffs should deserialize");
    let subject = skill(merge(minimal_skill("plain"), json!({})));
    let skills = vec![subject.clone()];
    let env = ActionEnv {
        config: &config,
        skills: &skills,
    };
    let next = apply_skill(
        &env,
        &state,
        0,
        &subject,
        "none",
        ConditionEffectSummary::default(),
        100.0,
    )
    .expect("action should be legal");
    assert!(next.buffs.is_empty());
}

// ---------------------------------------------------------------------------
// Toxicity
// ---------------------------------------------------------------------------

#[test]
fn toxicity_gate_uses_the_config_ceiling() {
    let mut config = base_config();
    config.max_toxicity = 30.0;
    let mut state = base_state();
    state.toxicity = 25.0;
    let subject = skill(merge(
        minimal_skill("toxic"),
        json!({ "action_kind": "skill", "toxicity_cost": 10.0 }),
    ));
    let skills = vec![subject.clone()];
    let env = ActionEnv {
        config: &config,
        skills: &skills,
    };
    assert!(!can_apply_skill(
        &env,
        &state,
        0,
        &subject,
        "none",
        ConditionEffectSummary::default(),
        &[]
    ));

    state.toxicity = 15.0;
    assert!(can_apply_skill(
        &env,
        &state,
        0,
        &subject,
        "none",
        ConditionEffectSummary::default(),
        &[]
    ));
}

#[test]
fn buff_change_toxicity_cleanses_on_a_positive_amount() {
    let config = base_config();
    let mut state = base_state();
    state.toxicity = 20.0;
    state.buffs = serde_json::from_value(json!([
        {
            "key": "cleanser",
            "name": "Cleanser",
            "stacks": 1,
            "definition": {
                "name": "Cleanser",
                "effects": [{ "kind": "changeToxicity", "amount": { "value": 6.0 } }]
            }
        }
    ]))
    .expect("buffs should deserialize");
    let subject = skill(merge(minimal_skill("plain"), json!({})));
    let skills = vec![subject.clone()];
    let env = ActionEnv {
        config: &config,
        skills: &skills,
    };
    let next = apply_skill(
        &env,
        &state,
        0,
        &subject,
        "none",
        ConditionEffectSummary::default(),
        100.0,
    )
    .expect("action should be legal");
    assert_eq!(next.toxicity, 14.0);
}

// ---------------------------------------------------------------------------
// Items (pills and reagents)
// ---------------------------------------------------------------------------

fn pill_skill() -> serde_json::Value {
    json!({
        "name": "Qi Restoring Pill",
        "key": "qi_restoring_pill",
        "technique_type": "support",
        "action_kind": "item",
        "consumes_turn": false,
        "item_name": "Qi Restoring Pill",
        "toxicity_cost": 8.0,
        "effects": [{ "kind": "pool", "amount": { "value": 40.0 } }]
    })
}

#[test]
fn item_actions_consume_inventory_without_advancing_the_turn() {
    let config = base_config();
    let mut state = base_state();
    state.qi = 20.0;
    state.items = serde_json::from_value(json!([{ "key": "qi_restoring_pill", "count": 2 }]))
        .expect("items should deserialize");
    let subject = skill(pill_skill());
    let skills = vec![subject.clone()];
    let env = ActionEnv {
        config: &config,
        skills: &skills,
    };
    let next = apply_skill(
        &env,
        &state,
        0,
        &subject,
        "none",
        ConditionEffectSummary::default(),
        100.0,
    )
    .expect("pill should be usable");
    assert_eq!(next.qi, 60.0);
    assert_eq!(next.step, state.step);
    assert_eq!(next.item_count("qi_restoring_pill"), 1);
    assert_eq!(next.consumed_pills_this_turn, 1);
    assert_eq!(next.toxicity, 8.0);
    // Max stability does not decay on a free action.
    assert_eq!(next.stability_penalty, state.stability_penalty);
}

#[test]
fn item_actions_are_illegal_without_stock() {
    let config = base_config();
    let state = base_state();
    let subject = skill(pill_skill());
    let skills = vec![subject.clone()];
    let env = ActionEnv {
        config: &config,
        skills: &skills,
    };
    assert!(!can_apply_skill(
        &env,
        &state,
        0,
        &subject,
        "none",
        ConditionEffectSummary::default(),
        &[]
    ));
}

#[test]
fn pills_per_round_limits_items_within_one_turn() {
    let config = base_config();
    let mut state = base_state();
    state.items = serde_json::from_value(json!([{ "key": "qi_restoring_pill", "count": 5 }]))
        .expect("items should deserialize");
    state.consumed_pills_this_turn = 1;
    let subject = skill(pill_skill());
    let skills = vec![subject.clone()];
    let env = ActionEnv {
        config: &config,
        skills: &skills,
    };
    assert!(!can_apply_skill(
        &env,
        &state,
        0,
        &subject,
        "none",
        ConditionEffectSummary::default(),
        &[]
    ));
}

#[test]
fn reagents_are_restricted_to_the_first_step() {
    let config = base_config();
    let mut state = base_state();
    state.items = serde_json::from_value(json!([{ "key": "spirit_reagent", "count": 1 }]))
        .expect("items should deserialize");
    let subject = skill(json!({
        "name": "Spirit Reagent",
        "key": "spirit_reagent",
        "technique_type": "support",
        "action_kind": "item",
        "consumes_turn": false,
        "item_name": "Spirit Reagent",
        "reagent_only_at_step_zero": true
    }));
    let skills = vec![subject.clone()];
    let env = ActionEnv {
        config: &config,
        skills: &skills,
    };
    assert!(can_apply_skill(
        &env,
        &state,
        0,
        &subject,
        "none",
        ConditionEffectSummary::default(),
        &[]
    ));

    state.step = 1;
    assert!(!can_apply_skill(
        &env,
        &state,
        0,
        &subject,
        "none",
        ConditionEffectSummary::default(),
        &[]
    ));
}

#[test]
fn a_turn_consuming_action_resets_the_per_turn_pill_counter() {
    let config = base_config();
    let mut state = base_state();
    state.consumed_pills_this_turn = 1;
    let subject = skill(merge(minimal_skill("plain"), json!({})));
    let skills = vec![subject.clone()];
    let env = ActionEnv {
        config: &config,
        skills: &skills,
    };
    let next = apply_skill(
        &env,
        &state,
        0,
        &subject,
        "none",
        ConditionEffectSummary::default(),
        100.0,
    )
    .expect("action should be legal");
    assert_eq!(next.consumed_pills_this_turn, 0);
}

// ---------------------------------------------------------------------------
// Gated techniques
// ---------------------------------------------------------------------------

#[test]
fn buff_requirements_gate_availability_and_buff_costs_consume_stacks() {
    let config = base_config();
    let mut state = base_state();
    let subject = skill(merge(
        minimal_skill("false_fusion"),
        json!({
            "technique_type": "fusion",
            "buff_requirement": { "buff_name": "false_fusion_ready", "amount": 1.0 },
            "buff_cost": { "buff_name": "false_fusion_ready", "amount": 1.0, "consume_all": false },
            "effects": [{ "kind": "completion", "amount": { "value": 5.0, "stat": "intensity" } }]
        }),
    ));
    let skills = vec![subject.clone()];
    let env = ActionEnv {
        config: &config,
        skills: &skills,
    };
    assert!(!can_apply_skill(
        &env,
        &state,
        0,
        &subject,
        "none",
        ConditionEffectSummary::default(),
        &[]
    ));

    state.buffs = serde_json::from_value(json!([
        { "key": "false_fusion_ready", "name": "False Fusion Ready", "stacks": 1 }
    ]))
    .expect("buffs should deserialize");
    let next = apply_skill(
        &env,
        &state,
        0,
        &subject,
        "none",
        ConditionEffectSummary::default(),
        100.0,
    )
    .expect("gated technique should now be legal");
    assert_eq!(next.buff_stacks("false_fusion_ready"), 0);
    assert_eq!(next.completion, 50.0);
}

// ---------------------------------------------------------------------------
// Turbid Qi
// ---------------------------------------------------------------------------

#[test]
fn turbid_qi_gains_a_stack_on_the_scheduled_steps() {
    assert!(!grants_turbid_qi_stack(99));
    assert!(grants_turbid_qi_stack(102));
    assert!(!grants_turbid_qi_stack(103));
    assert!(grants_turbid_qi_stack(105));
}

#[test]
fn turbid_qi_stacks_grow_on_long_crafts() {
    let config = base_config();
    let mut state = base_state();
    state.step = 101;
    state.buffs = serde_json::from_value(json!([
        {
            "key": "turbid_qi",
            "name": "Turbid Qi",
            "stacks": 4,
            "definition": {
                "name": "Turbid Qi",
                "canStack": true,
                "stats": { "poolCostFlat": { "value": 1.0, "scaling": "stacks" } }
            }
        }
    ]))
    .expect("buffs should deserialize");
    let subject = skill(merge(minimal_skill("plain"), json!({})));
    let skills = vec![subject.clone()];
    let env = ActionEnv {
        config: &config,
        skills: &skills,
    };
    let next = apply_skill(
        &env,
        &state,
        0,
        &subject,
        "none",
        ConditionEffectSummary::default(),
        100.0,
    )
    .expect("action should be legal");
    assert_eq!(next.step, 102);
    assert_eq!(next.buff_stacks("turbid_qi"), 5);
}

// ---------------------------------------------------------------------------
// Disciplined Touch
// ---------------------------------------------------------------------------

#[test]
fn disciplined_touch_scales_perfection_off_intensity() {
    let mut config = base_config();
    config.base_control = 4.0;
    config.base_intensity = 9.0;
    let state = base_state();
    let subject = skill(merge(
        minimal_skill("disciplined_touch"),
        json!({
            "base_completion_gain": 1.0,
            "base_perfection_gain": 1.0,
            "is_disciplined_touch": true
        }),
    ));
    let skills = vec![subject.clone()];
    let env = ActionEnv {
        config: &config,
        skills: &skills,
    };
    let resolved = resolve_action(
        &env,
        &state,
        &subject,
        ConditionEffectSummary::default(),
        &[],
    );
    let gains = calculate_skill_gains(&env, &state, &subject, &resolved);
    // Both halves use intensity (9), not control (4).
    assert_eq!(gains.completion, 9.0);
    assert_eq!(gains.perfection, 9.0);
}

#[test]
fn disciplined_touch_clears_the_legacy_buff_timers() {
    let config = base_config();
    let mut state = base_state();
    state.control_buff_turns = 3;
    state.intensity_buff_turns = 2;
    let subject = skill(merge(
        minimal_skill("disciplined_touch"),
        json!({ "base_perfection_gain": 1.0, "is_disciplined_touch": true }),
    ));
    let skills = vec![subject.clone()];
    let env = ActionEnv {
        config: &config,
        skills: &skills,
    };
    let next = apply_skill(
        &env,
        &state,
        0,
        &subject,
        "none",
        ConditionEffectSummary::default(),
        100.0,
    )
    .expect("action should be legal");
    assert_eq!(next.control_buff_turns, 0);
    assert_eq!(next.intensity_buff_turns, 0);
}

// ---------------------------------------------------------------------------
// Cooldowns
// ---------------------------------------------------------------------------

#[test]
fn item_actions_never_set_a_cooldown() {
    let config = base_config();
    let mut state = base_state();
    state.items = serde_json::from_value(json!([{ "key": "qi_restoring_pill", "count": 1 }]))
        .expect("items should deserialize");
    let subject = skill(merge(pill_skill(), json!({ "cooldown": 3 })));
    let skills = vec![subject.clone()];
    let env = ActionEnv {
        config: &config,
        skills: &skills,
    };
    let next = apply_skill(
        &env,
        &state,
        0,
        &subject,
        "none",
        ConditionEffectSummary::default(),
        100.0,
    )
    .expect("pill should be usable");
    assert!(next.cooldowns.iter().all(|turns| *turns == 0));
}

// ---------------------------------------------------------------------------
// Harmony-derived scaling variables
// ---------------------------------------------------------------------------

#[test]
fn forge_heat_is_exposed_as_a_scaling_variable() {
    let mut config = base_config();
    config.crafting_type = Some("forge".to_string());
    let mut state = base_state();
    state.harmony_data = serde_json::from_value(json!({
        "forge_works": { "heat": 7, "last_buffed_heat": 0 }
    }))
    .expect("harmony data should deserialize");
    let variables = build_technique_scaling_base(&state, &config, &[]);
    assert_eq!(get_variable_value(&variables, "Heat"), 7.0);
    assert_eq!(get_variable_value(&variables, "heat"), 7.0);
}

#[test]
fn derived_forge_heat_buff_is_not_double_counted() {
    let mut config = base_config();
    config.crafting_type = Some("forge".to_string());
    let mut state = base_state();
    state.harmony_data = serde_json::from_value(json!({
        "forge_works": { "heat": 3, "last_buffed_heat": 0 }
    }))
    .expect("harmony data should deserialize");
    state.buffs = serde_json::from_value(json!([
        { "key": "heat", "name": "Heat", "stacks": 3 },
        { "key": "other", "name": "Other", "stacks": 1 }
    ]))
    .expect("buffs should deserialize");
    let skills: Vec<EngineSkill> = Vec::new();
    let active = resolve_active_buffs(&state, &config, &skills);
    assert_eq!(active.len(), 1);
    assert_eq!(active[0].key, "other");
}
