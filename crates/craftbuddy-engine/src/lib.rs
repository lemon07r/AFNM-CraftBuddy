use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use wasm_bindgen::prelude::*;

#[cfg(test)]
mod differential_tests;

const FINISH_CRAFT_KEY: &str = "__finish_craft__";
const FINISH_CRAFT_NAME: &str = "Finish Craft";
const EXPONENTIAL_SCALING_FACTOR: f64 = 1.3;
const TARGET_MET_MULTIPLIER: f64 = 2.0;
const SUBLIME_MET_EXTRA: f64 = 1.5;
const SUBLIME_BEYOND_BASE_WEIGHT: f64 = 0.5;
const RESOURCE_TIEBREAKER: f64 = 0.001;
const STEP_PENALTY: f64 = 0.5;
const DEATH_PENALTY_MULTIPLIER: f64 = 3.0;
const RUNWAY_GAP_FRACTION: f64 = 0.1;
const TOXICITY_PENALTY_FRACTION: f64 = 0.025;
const HARMONY_BONUS_WEIGHT: f64 = 0.15;

/// Harmony value Formless Way holds for the whole craft (runtime `dRa`).
const FORMLESS_HARMONY: f64 = 33.0;
/// Cost scaling when an action echoes the Enhancing Echo attunement.
const ENHANCING_ECHO_MATCH_COST_PERCENTAGE: f64 = 50.0;
/// Cost scaling when an action breaks the Enhancing Echo attunement.
const ENHANCING_ECHO_DISCORD_COST_PERCENTAGE: f64 = 200.0;
/// Harmony gained when Eccentric Decree's focused bar advances.
const ECCENTRIC_DECREE_OBEY_HARMONY: f64 = 5.0;
/// Harmony lost when Eccentric Decree's unfocused bar advances.
const ECCENTRIC_DECREE_STRAY_HARMONY: f64 = -5.0;
/// Qi Pool lost when Eccentric Decree's unfocused bar advances.
const ECCENTRIC_DECREE_STRAY_POOL: f64 = -5.0;

#[wasm_bindgen(js_name = runMcts)]
pub fn run_mcts(input: JsValue) -> Result<JsValue, JsValue> {
    let input: MctsInput = serde_wasm_bindgen::from_value(input)
        .map_err(|err| JsValue::from_str(&format!("invalid MCTS input: {err}")))?;
    let result = Engine::new(input).run();
    serde_wasm_bindgen::to_value(&result)
        .map_err(|err| JsValue::from_str(&format!("failed to serialize MCTS result: {err}")))
}

#[derive(Clone, Debug, Deserialize)]
struct MctsInput {
    state: EngineState,
    config: EngineConfig,
    skills: Vec<EngineSkill>,
    #[serde(default)]
    target_completion: f64,
    #[serde(default)]
    target_perfection: f64,
    #[serde(default = "default_condition")]
    current_condition: String,
    #[serde(default)]
    forecasted_conditions: Vec<String>,
    #[serde(default)]
    condition_effects: HashMap<String, ConditionEffectSummary>,
    #[serde(default)]
    search: MctsSearchConfig,
}

#[derive(Clone, Debug, Deserialize)]
struct EngineState {
    #[serde(default)]
    qi: f64,
    #[serde(default)]
    stability: f64,
    #[serde(default = "default_initial_max_stability")]
    initial_max_stability: f64,
    #[serde(default)]
    stability_penalty: f64,
    #[serde(default)]
    completion: f64,
    #[serde(default)]
    perfection: f64,
    #[serde(default)]
    crit_chance: f64,
    #[serde(default = "default_crit_multiplier")]
    crit_multiplier: f64,
    #[serde(default)]
    success_chance_bonus: f64,
    #[serde(default)]
    pool_cost_flat: f64,
    #[serde(default = "default_cost_percentage")]
    pool_cost_percentage: f64,
    #[serde(default = "default_cost_percentage")]
    stability_cost_percentage: f64,
    #[serde(default)]
    control_buff_turns: i32,
    #[serde(default)]
    intensity_buff_turns: i32,
    #[serde(default = "default_buff_multiplier")]
    control_buff_multiplier: f64,
    #[serde(default = "default_buff_multiplier")]
    intensity_buff_multiplier: f64,
    #[serde(default)]
    toxicity: f64,
    /// Kept for schema compatibility with the TypeScript bridge; toxicity is
    /// gated on the config ceiling, matching `canApplySkill`.
    #[serde(default)]
    #[allow(dead_code)]
    max_toxicity: f64,
    #[serde(default)]
    harmony: f64,
    #[serde(default)]
    harmony_data: HarmonyData,
    #[serde(default)]
    cooldowns: Vec<i32>,
    #[serde(default)]
    completion_bonus: i32,
    #[serde(default)]
    step: i32,
    #[serde(default)]
    finished: bool,
}

#[derive(Clone, Debug, Deserialize)]
struct EngineConfig {
    #[serde(default)]
    max_qi: f64,
    #[serde(default = "default_initial_max_stability")]
    #[allow(dead_code)]
    max_stability: f64,
    #[serde(default)]
    max_completion: Option<f64>,
    #[serde(default)]
    max_perfection: Option<f64>,
    #[serde(default)]
    base_intensity: f64,
    #[serde(default)]
    base_control: f64,
    /// Kept for schema compatibility; the game has no post-cost stability gate,
    /// so legality never consults it.
    #[serde(default)]
    #[allow(dead_code)]
    min_stability: f64,
    #[serde(default = "default_buff_multiplier")]
    default_buff_multiplier: f64,
    #[serde(default)]
    max_toxicity: f64,
    #[serde(default)]
    crafting_type: Option<String>,
    #[serde(default)]
    is_sublime_craft: bool,
    #[serde(default = "default_target_multiplier")]
    target_multiplier: f64,
    #[serde(default)]
    #[allow(dead_code)]
    training_mode: bool,
    #[serde(default)]
    goal_priority_bias: f64,
}

#[derive(Clone, Debug, Deserialize)]
struct EngineSkill {
    name: String,
    key: String,
    #[serde(default)]
    technique_type: String,
    #[serde(default)]
    action_kind: String,
    #[serde(default)]
    qi_cost: f64,
    #[serde(default)]
    stability_cost: f64,
    #[serde(default = "default_success_chance")]
    success_chance: f64,
    #[serde(default)]
    base_completion_gain: f64,
    #[serde(default)]
    base_perfection_gain: f64,
    #[serde(default)]
    stability_gain: f64,
    #[serde(default)]
    max_stability_change: f64,
    #[serde(default)]
    buff_type: i32,
    #[serde(default)]
    buff_duration: i32,
    #[serde(default = "default_unit")]
    buff_multiplier: f64,
    #[serde(default)]
    scales_with_control: bool,
    #[serde(default)]
    scales_with_intensity: bool,
    #[serde(default)]
    prevents_max_stability_decay: bool,
    #[serde(default)]
    toxicity_cost: f64,
    #[serde(default)]
    toxicity_cleanse: f64,
    #[serde(default)]
    cooldown: i32,
    #[serde(default)]
    restores_qi: bool,
    #[serde(default)]
    qi_restore: f64,
    #[serde(default)]
    restores_max_stability_to_full: bool,
    #[serde(default = "default_consumes_turn")]
    consumes_turn: bool,
    #[serde(default)]
    condition_requirement: Option<String>,
}

#[derive(Clone, Copy, Debug, Deserialize)]
struct ConditionEffectSummary {
    #[serde(default = "default_unit")]
    control_multiplier: f64,
    #[serde(default = "default_unit")]
    intensity_multiplier: f64,
    #[serde(default = "default_unit")]
    pool_cost_multiplier: f64,
    #[serde(default = "default_unit")]
    stability_cost_multiplier: f64,
    #[serde(default)]
    success_chance_bonus: f64,
}

impl Default for ConditionEffectSummary {
    fn default() -> Self {
        Self {
            control_multiplier: 1.0,
            intensity_multiplier: 1.0,
            pool_cost_multiplier: 1.0,
            stability_cost_multiplier: 1.0,
            success_chance_bonus: 0.0,
        }
    }
}

#[derive(Clone, Debug, Default, Deserialize)]
struct HarmonyData {
    #[serde(default)]
    forge_works: Option<ForgeWorksData>,
    #[serde(default)]
    alchemical_arts: Option<AlchemicalArtsData>,
    #[serde(default)]
    inscribed_patterns: Option<InscribedPatternsData>,
    #[serde(default)]
    resonance: Option<ResonanceData>,
    #[serde(default)]
    enhancing_echo: Option<EnhancingEchoData>,
    #[serde(default)]
    eccentric_decree: Option<EccentricDecreeData>,
    #[serde(default)]
    recommended_technique_types: Vec<String>,
    #[serde(default)]
    alchemical_reaction_modifiers: Option<HarmonyStatModifiers>,
}

#[derive(Clone, Debug, Deserialize)]
struct ForgeWorksData {
    #[serde(default)]
    heat: i32,
    /// Heat whose Heat buff is actually applied. Heat 1 skips the runtime's
    /// buff update, so the previous band's buff stays live.
    #[serde(default)]
    last_buffed_heat: Option<i32>,
}

#[derive(Clone, Debug, Default, Deserialize)]
struct EnhancingEchoData {
    #[serde(default)]
    attuned_type: Option<String>,
    #[serde(default)]
    last_outcome: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
struct EccentricDecreeData {
    #[serde(default = "default_focused_bar")]
    focused_bar: String,
    #[serde(default)]
    last_completion: f64,
    #[serde(default)]
    last_perfection: f64,
}

impl Default for EccentricDecreeData {
    fn default() -> Self {
        Self {
            focused_bar: default_focused_bar(),
            last_completion: 0.0,
            last_perfection: 0.0,
        }
    }
}

#[derive(Clone, Debug, Default, Deserialize)]
struct AlchemicalArtsData {
    #[serde(default)]
    charges: Vec<String>,
    #[serde(default)]
    last_combo: Vec<String>,
}

#[derive(Clone, Debug, Deserialize)]
struct InscribedPatternsData {
    #[serde(default)]
    current_block: Vec<String>,
    #[serde(default)]
    completed_blocks: i32,
    #[serde(default)]
    stacks: i32,
}

#[derive(Clone, Debug, Default, Deserialize)]
struct ResonanceData {
    #[serde(default)]
    resonance: Option<String>,
    #[serde(default)]
    strength: i32,
    #[serde(default)]
    pending_resonance: Option<String>,
    #[serde(default)]
    pending_count: i32,
}

#[derive(Clone, Copy, Debug, Deserialize, Serialize)]
struct HarmonyStatModifiers {
    #[serde(default = "default_unit")]
    control_multiplier: f64,
    #[serde(default = "default_unit")]
    intensity_multiplier: f64,
    #[serde(default)]
    crit_chance_bonus: f64,
    #[serde(default)]
    success_chance_bonus: f64,
    #[serde(default = "default_cost_percentage")]
    pool_cost_percentage: f64,
    #[serde(default = "default_cost_percentage")]
    stability_cost_percentage: f64,
}

impl Default for HarmonyStatModifiers {
    fn default() -> Self {
        Self {
            control_multiplier: 1.0,
            intensity_multiplier: 1.0,
            crit_chance_bonus: 0.0,
            success_chance_bonus: 0.0,
            pool_cost_percentage: 100.0,
            stability_cost_percentage: 100.0,
        }
    }
}

#[derive(Clone, Copy, Debug)]
struct HarmonyEffectResult {
    #[allow(dead_code)]
    modifiers: HarmonyStatModifiers,
    harmony_delta: f64,
    /// Formless Way pins harmony instead of accumulating deltas.
    harmony_override: Option<f64>,
    stability_delta: f64,
    pool_delta: f64,
    stability_penalty_delta: f64,
}

/// Post-action craft figures the Eccentric Decree state machine needs.
#[derive(Clone, Copy, Debug, Default)]
struct HarmonyProcessContext {
    completion: f64,
    perfection: f64,
    max_completion: f64,
    max_perfection: f64,
    target_completion: f64,
    target_perfection: f64,
}

/// Qi Pool / Stability cost scaling a harmony applies to a single action.
#[derive(Clone, Copy, Debug)]
struct HarmonyCostMultipliers {
    pool_cost_percentage: f64,
    stability_cost_percentage: f64,
}

impl Default for HarmonyCostMultipliers {
    fn default() -> Self {
        Self {
            pool_cost_percentage: 100.0,
            stability_cost_percentage: 100.0,
        }
    }
}

#[derive(Clone, Debug, Deserialize)]
struct MctsSearchConfig {
    #[serde(default = "default_iterations")]
    iterations: usize,
    #[serde(default = "default_rollout_depth")]
    rollout_depth: usize,
    #[serde(default = "default_exploration")]
    exploration: f64,
    #[serde(default)]
    seed: u64,
    #[serde(default = "default_max_nodes")]
    max_nodes: usize,
}

impl Default for MctsSearchConfig {
    fn default() -> Self {
        Self {
            iterations: default_iterations(),
            rollout_depth: default_rollout_depth(),
            exploration: default_exploration(),
            seed: 0,
            max_nodes: default_max_nodes(),
        }
    }
}

#[derive(Clone, Debug, Serialize)]
struct MctsResult {
    backend: &'static str,
    iterations: usize,
    nodes: usize,
    rollout_depth: usize,
    best_skill_key: Option<String>,
    best_skill_name: Option<String>,
    skill_policies: Vec<SkillPolicy>,
}

#[derive(Clone, Debug, Serialize)]
struct SkillPolicy {
    key: String,
    name: String,
    visits: u32,
    policy: f64,
    average_score: f64,
    best_score: f64,
}

#[derive(Clone, Debug)]
struct Action {
    skill_index: Option<usize>,
    key: String,
    name: String,
}

#[derive(Clone, Debug)]
struct Node {
    state: EngineState,
    condition: String,
    queue: Vec<String>,
    #[allow(dead_code)]
    parent: Option<usize>,
    action: Option<Action>,
    children: Vec<usize>,
    untried: Vec<Action>,
    visits: u32,
    value_sum: f64,
    best_value: f64,
    depth: usize,
}

struct Engine {
    input: MctsInput,
    rng: SmallRng,
    score_scale: f64,
}

impl Engine {
    fn new(input: MctsInput) -> Self {
        let seed = if input.search.seed == 0 {
            build_seed(&input)
        } else {
            input.search.seed
        };
        let score_scale = input.effective_target_magnitude().max(1.0);
        Self {
            input,
            rng: SmallRng::new(seed),
            score_scale,
        }
    }

    fn run(&mut self) -> MctsResult {
        let mut nodes = Vec::<Node>::new();
        let root_queue = normalize_queue(&self.input.forecasted_conditions);
        let root_untried = self.ordered_legal_actions(
            &self.input.state,
            &self.input.current_condition,
            &root_queue,
        );
        nodes.push(Node {
            state: self.input.state.clone(),
            condition: normalize_condition(&self.input.current_condition),
            queue: root_queue,
            parent: None,
            action: None,
            children: Vec::new(),
            untried: root_untried,
            visits: 0,
            value_sum: 0.0,
            best_value: f64::NEG_INFINITY,
            depth: 0,
        });

        let max_nodes = self.input.search.max_nodes.max(1);
        let iterations = self.input.search.iterations.max(1);
        for _ in 0..iterations {
            if nodes.len() >= max_nodes {
                break;
            }

            let mut selected = 0usize;
            let mut path = vec![selected];

            loop {
                let can_descend = nodes[selected].untried.is_empty()
                    && !nodes[selected].children.is_empty()
                    && nodes[selected].depth < self.input.search.rollout_depth
                    && !nodes[selected].state.finished;
                if !can_descend {
                    break;
                }
                selected = self.select_child(&nodes, selected);
                path.push(selected);
            }

            if nodes[selected].depth < self.input.search.rollout_depth
                && !nodes[selected].state.finished
                && !nodes[selected].untried.is_empty()
                && nodes.len() < max_nodes
            {
                let action = nodes[selected]
                    .untried
                    .pop()
                    .expect("untried was checked non-empty");
                if let Some((next_state, next_condition, next_queue)) = self.apply_action(
                    &nodes[selected].state,
                    &nodes[selected].condition,
                    &nodes[selected].queue,
                    &action,
                ) {
                    let child_untried =
                        self.ordered_legal_actions(&next_state, &next_condition, &next_queue);
                    let child_index = nodes.len();
                    nodes.push(Node {
                        state: next_state,
                        condition: next_condition,
                        queue: next_queue,
                        parent: Some(selected),
                        action: Some(action),
                        children: Vec::new(),
                        untried: child_untried,
                        visits: 0,
                        value_sum: 0.0,
                        best_value: f64::NEG_INFINITY,
                        depth: nodes[selected].depth + 1,
                    });
                    nodes[selected].children.push(child_index);
                    selected = child_index;
                    path.push(selected);
                }
            }

            let raw_score = self.rollout_score(
                nodes[selected].state.clone(),
                nodes[selected].condition.clone(),
                nodes[selected].queue.clone(),
                nodes[selected].depth,
            );
            let reward = raw_score / self.score_scale;
            for node_index in path {
                nodes[node_index].visits = nodes[node_index].visits.saturating_add(1);
                nodes[node_index].value_sum += reward;
                if reward > nodes[node_index].best_value {
                    nodes[node_index].best_value = reward;
                }
            }
        }

        self.build_result(&nodes)
    }

    fn select_child(&mut self, nodes: &[Node], parent_index: usize) -> usize {
        let parent_visits = nodes[parent_index].visits.max(1) as f64;
        let exploration = self.input.search.exploration.max(0.0);
        let mut best_child = nodes[parent_index].children[0];
        let mut best_score = f64::NEG_INFINITY;
        for &child_index in &nodes[parent_index].children {
            let child = &nodes[child_index];
            if child.visits == 0 {
                return child_index;
            }
            let exploitation = child.value_sum / child.visits as f64;
            let exploration_bonus =
                exploration * ((parent_visits.ln() + 1.0) / child.visits as f64).sqrt();
            let jitter = self.rng.next_f64() * 1e-9;
            let score = exploitation + exploration_bonus + jitter;
            if score > best_score {
                best_score = score;
                best_child = child_index;
            }
        }
        best_child
    }

    fn rollout_score(
        &mut self,
        mut state: EngineState,
        mut condition: String,
        mut queue: Vec<String>,
        start_depth: usize,
    ) -> f64 {
        let mut depth = start_depth;
        while depth < self.input.search.rollout_depth && !state.finished {
            if self.goals_met(&state) {
                break;
            }
            let actions = self.ordered_legal_actions(&state, &condition, &queue);
            if actions.is_empty() {
                break;
            }
            let action = self.pick_rollout_action(&state, &condition, &queue, &actions);
            match self.apply_action(&state, &condition, &queue, &action) {
                Some((next_state, next_condition, next_queue)) => {
                    let consumed_turn = action
                        .skill_index
                        .and_then(|idx| self.input.skills.get(idx))
                        .map(|skill| skill.consumes_turn)
                        .unwrap_or(false);
                    state = next_state;
                    condition = next_condition;
                    queue = next_queue;
                    if consumed_turn {
                        depth += 1;
                    }
                    if action.skill_index.is_none() {
                        break;
                    }
                }
                None => break,
            }
        }
        self.score_state(&state)
    }

    fn pick_rollout_action(
        &mut self,
        state: &EngineState,
        condition: &str,
        queue: &[String],
        actions: &[Action],
    ) -> Action {
        if actions.len() == 1 {
            return actions[0].clone();
        }
        if self.rng.next_f64() < 0.12 {
            return actions[self.rng.next_usize(actions.len())].clone();
        }

        let mut scored: Vec<(f64, &Action)> = actions
            .iter()
            .map(|action| {
                let score = self
                    .preview_action_score(state, condition, queue, action)
                    .unwrap_or(f64::NEG_INFINITY);
                (score, action)
            })
            .collect();
        scored.sort_by(|a, b| b.0.partial_cmp(&a.0).unwrap_or(std::cmp::Ordering::Equal));
        let top_count = scored.len().min(3);
        let top_index = if top_count > 1 && self.rng.next_f64() < 0.2 {
            self.rng.next_usize(top_count)
        } else {
            0
        };
        scored[top_index].1.clone()
    }

    fn ordered_legal_actions(
        &self,
        state: &EngineState,
        condition: &str,
        queue: &[String],
    ) -> Vec<Action> {
        if state.finished || state.stability <= 0.0 || self.goals_met(state) {
            return Vec::new();
        }
        let mut actions: Vec<Action> = self
            .input
            .skills
            .iter()
            .enumerate()
            .filter(|(idx, skill)| self.can_apply_skill(state, *idx, skill, condition))
            .map(|(idx, skill)| Action {
                skill_index: Some(idx),
                key: skill.key.clone(),
                name: skill.name.clone(),
            })
            .collect();

        if self.finish_success_chance(state) > 0.0 {
            actions.push(Action {
                skill_index: None,
                key: FINISH_CRAFT_KEY.to_string(),
                name: FINISH_CRAFT_NAME.to_string(),
            });
        }

        let mut scored: Vec<(f64, Action)> = actions
            .into_iter()
            .map(|action| {
                let score = self
                    .preview_action_score(state, condition, queue, &action)
                    .unwrap_or(f64::NEG_INFINITY);
                (score, action)
            })
            .collect();
        scored.sort_by(|a, b| {
            a.0.partial_cmp(&b.0)
                .unwrap_or(std::cmp::Ordering::Equal)
                .then_with(|| b.1.key.cmp(&a.1.key))
        });
        scored.into_iter().map(|(_, action)| action).collect()
    }

    fn preview_action_score(
        &self,
        state: &EngineState,
        condition: &str,
        queue: &[String],
        action: &Action,
    ) -> Option<f64> {
        let mut rng = SmallRng::new(0x9E37_79B9_7F4A_7C15);
        let (next_state, _, _) =
            self.apply_action_with_rng(state, condition, queue, action, &mut rng)?;
        Some(self.score_state(&next_state))
    }

    fn can_apply_skill(
        &self,
        state: &EngineState,
        skill_index: usize,
        skill: &EngineSkill,
        condition: &str,
    ) -> bool {
        if state.finished || state.stability <= 0.0 {
            return false;
        }
        if let Some(required) = &skill.condition_requirement {
            if normalize_condition(required) != normalize_condition(condition) {
                return false;
            }
        }
        if state.cooldowns.get(skill_index).copied().unwrap_or(0) > 0 {
            return false;
        }
        let effects = self.condition_effects(condition);
        let costs = self.effective_costs(state, skill, effects);
        if state.qi + 1e-9 < costs.qi {
            return false;
        }
        // No post-cost stability gate: the game lets you spend into a failed
        // craft, and `canApplySkill` in `src/optimizer/skills.ts` matches that.
        // Gating here would hide survivable lines from the native prior that
        // the TypeScript search still explores, and scoring already prices
        // death far below any progress path.
        //
        // The TypeScript simulator gates toxicity on the *config* ceiling only;
        // using the state's own max here would reject actions the game allows.
        let max_toxicity = self.input.config.max_toxicity.max(0.0);
        if max_toxicity > 0.0 && state.toxicity + skill.toxicity_cost > max_toxicity {
            return false;
        }
        true
    }

    fn apply_action(
        &mut self,
        state: &EngineState,
        condition: &str,
        queue: &[String],
        action: &Action,
    ) -> Option<(EngineState, String, Vec<String>)> {
        let mut rng = self.rng.clone();
        let result = self.apply_action_with_rng(state, condition, queue, action, &mut rng);
        self.rng = rng;
        result
    }

    fn apply_action_with_rng(
        &self,
        state: &EngineState,
        condition: &str,
        queue: &[String],
        action: &Action,
        rng: &mut SmallRng,
    ) -> Option<(EngineState, String, Vec<String>)> {
        if action.skill_index.is_none() {
            let mut finished = state.clone();
            finished.finished = true;
            return Some((finished, normalize_condition(condition), queue.to_vec()));
        }

        let skill_index = action.skill_index?;
        let skill = self.input.skills.get(skill_index)?;
        if !self.can_apply_skill(state, skill_index, skill, condition) {
            return None;
        }

        let condition = normalize_condition(condition);
        let effects = self.condition_effects(&condition);
        let costs = self.effective_costs(state, skill, effects);
        let gains = self.skill_gains(state, skill, effects);
        let consumes_turn = skill.consumes_turn;

        let mut next = state.clone();
        next.step += if consumes_turn { 1 } else { 0 };
        next.qi = clamp(next.qi - costs.qi, 0.0, self.max_qi_for_state(state));
        if skill.restores_qi && skill.qi_restore > 0.0 {
            next.qi = clamp(
                next.qi + skill.qi_restore,
                0.0,
                self.max_qi_for_state(state),
            );
        }

        if consumes_turn && !skill.prevents_max_stability_decay {
            next.stability_penalty += 1.0;
        }
        next.stability_penalty = clamp(next.stability_penalty, 0.0, state.initial_max_stability);
        if skill.max_stability_change != 0.0 {
            next.stability_penalty = clamp(
                next.stability_penalty - skill.max_stability_change,
                0.0,
                state.initial_max_stability,
            );
        }
        if skill.restores_max_stability_to_full {
            next.stability_penalty = 0.0;
        }

        let max_stability = next.max_stability();
        next.stability = clamp(
            (next.stability - costs.stability + gains.stability).floor(),
            0.0,
            max_stability,
        );

        next.completion = (next.completion + gains.completion).floor();
        next.perfection = (next.perfection + gains.perfection).floor();
        if let Some(cap) = self.input.config.max_completion {
            if cap.is_finite() {
                next.completion = next.completion.min(cap);
            }
        }
        if let Some(cap) = self.input.config.max_perfection {
            if cap.is_finite() {
                next.perfection = next.perfection.min(cap);
            }
        }

        next.toxicity = (next.toxicity + skill.toxicity_cost - gains.toxicity_cleanse).max(0.0);

        if consumes_turn {
            if next.control_buff_turns > 0 {
                next.control_buff_turns -= 1;
            }
            if next.intensity_buff_turns > 0 {
                next.intensity_buff_turns -= 1;
            }
        }

        if skill.buff_type == 1 {
            next.control_buff_turns = skill.buff_duration;
            next.control_buff_multiplier =
                if skill.buff_multiplier > 0.0 && skill.buff_multiplier != 1.0 {
                    skill.buff_multiplier
                } else {
                    self.input.config.default_buff_multiplier
                };
        } else if skill.buff_type == 2 {
            next.intensity_buff_turns = skill.buff_duration;
            next.intensity_buff_multiplier =
                if skill.buff_multiplier > 0.0 && skill.buff_multiplier != 1.0 {
                    skill.buff_multiplier
                } else {
                    self.input.config.default_buff_multiplier
                };
        }

        if next.cooldowns.len() < self.input.skills.len() {
            next.cooldowns.resize(self.input.skills.len(), 0);
        }
        if consumes_turn {
            for turns in &mut next.cooldowns {
                if *turns > 1 {
                    *turns -= 1;
                } else {
                    *turns = 0;
                }
            }
            if skill.cooldown > 0 {
                next.cooldowns[skill_index] = skill.cooldown;
            }
        }

        if consumes_turn && self.input.target_completion > 0.0 {
            let bonus = get_bonus_and_chance(next.completion, self.input.target_completion);
            next.completion_bonus = (bonus.guaranteed - 1).max(0);
        }

        if consumes_turn
            && skill.action_kind != "item"
            && self.input.config.is_sublime_craft
            && self.input.config.crafting_type.is_some()
        {
            // Eccentric Decree reads the *post-action* bars, so this must run
            // after completion/perfection have been updated.
            let harmony_context = HarmonyProcessContext {
                completion: next.completion,
                perfection: next.perfection,
                max_completion: self.input.config.max_completion.unwrap_or(next.completion),
                max_perfection: self.input.config.max_perfection.unwrap_or(next.perfection),
                target_completion: self.input.target_completion,
                target_perfection: self.input.target_perfection,
            };
            let harmony_result = process_harmony_effect(
                &mut next.harmony_data,
                self.input.config.crafting_type.as_deref().unwrap_or(""),
                &skill.technique_type,
                harmony_context,
            );
            next.harmony = clamp(
                harmony_result
                    .harmony_override
                    .unwrap_or(next.harmony + harmony_result.harmony_delta),
                -100.0,
                100.0,
            );
            next.qi = clamp(
                next.qi + harmony_result.pool_delta,
                0.0,
                self.max_qi_for_state(&next),
            );
            next.stability = clamp(
                next.stability + harmony_result.stability_delta,
                0.0,
                next.max_stability(),
            );
            if harmony_result.stability_penalty_delta != 0.0 {
                next.stability_penalty = clamp(
                    next.stability_penalty + harmony_result.stability_penalty_delta,
                    0.0,
                    next.initial_max_stability,
                );
                next.stability = next.stability.min(next.max_stability());
            }
        }

        let (next_condition, next_queue) = if consumes_turn {
            advance_condition(&condition, queue, next.harmony, rng)
        } else {
            (condition, queue.to_vec())
        };

        Some((next, next_condition, next_queue))
    }

    /// Action costs, in the runtime's own order and rounding.
    ///
    /// Mirrors `calculateEffectiveActionCosts` in `src/optimizer/skills.ts`:
    /// - condition `pool`/`stability` effects scale the cost *percentages*,
    ///   unrounded, rather than the raw costs;
    /// - pool adds the flat surcharge first, then a single floor;
    /// - stability applies a single ceil to the negative delta;
    /// - the harmony multiplier is a *separate outer* floor, not folded into
    ///   the percentage - folding it drifts by 1 on fractional cases.
    fn effective_costs(
        &self,
        state: &EngineState,
        skill: &EngineSkill,
        effects: ConditionEffectSummary,
    ) -> ActionCosts {
        let crafting_type = self.input.config.crafting_type.as_deref();
        let harmony_mods = get_harmony_stat_modifiers(&state.harmony_data, crafting_type);
        let harmony_cost =
            get_harmony_cost_multipliers(&state.harmony_data, crafting_type, &skill.technique_type);
        let harmony_pool_multiplier = (harmony_mods.pool_cost_percentage / 100.0)
            * (harmony_cost.pool_cost_percentage / 100.0);
        let harmony_stability_multiplier = (harmony_mods.stability_cost_percentage / 100.0)
            * (harmony_cost.stability_cost_percentage / 100.0);

        let pool_cost_flat = state.pool_cost_flat.floor().max(0.0);
        let pool_cost_percentage =
            normalize_cost_percentage(state.pool_cost_percentage) * effects.pool_cost_multiplier;
        let stability_cost_percentage = normalize_cost_percentage(state.stability_cost_percentage)
            * effects.stability_cost_multiplier;

        let mut qi_cost = skill.qi_cost.max(0.0).ceil();
        if pool_cost_flat > 0.0 {
            qi_cost = (qi_cost + pool_cost_flat).max(0.0);
        }
        if pool_cost_percentage != 100.0 {
            qi_cost = (qi_cost * pool_cost_percentage / 100.0).floor();
        }
        if harmony_pool_multiplier != 1.0 {
            qi_cost = (qi_cost.max(0.0) * harmony_pool_multiplier).floor();
        }

        let mut stability_delta = -skill.stability_cost.max(0.0).ceil();
        if stability_delta < 0.0 && stability_cost_percentage != 100.0 {
            stability_delta = (stability_delta * stability_cost_percentage / 100.0).ceil();
        }
        if stability_delta < 0.0 && harmony_stability_multiplier != 1.0 {
            stability_delta = (stability_delta * harmony_stability_multiplier).floor();
        }

        ActionCosts {
            qi: qi_cost.max(0.0),
            stability: (-stability_delta).max(0.0),
        }
    }

    fn skill_gains(
        &self,
        state: &EngineState,
        skill: &EngineSkill,
        effects: ConditionEffectSummary,
    ) -> SkillGains {
        let harmony_mods = get_harmony_stat_modifiers(
            &state.harmony_data,
            self.input.config.crafting_type.as_deref(),
        );
        // No rounding between steps: the TypeScript simulator (and the game)
        // keep control/intensity fractional until the gain itself is floored.
        let mut control =
            self.input.config.base_control * (1.0 + state.completion_bonus as f64 * 0.1);
        if state.control_buff_turns > 0 {
            control *= state.control_buff_multiplier;
        }
        control *= effects.control_multiplier;
        control *= harmony_mods.control_multiplier;

        let mut intensity = self.input.config.base_intensity;
        if state.intensity_buff_turns > 0 {
            intensity *= state.intensity_buff_multiplier;
        }
        intensity *= effects.intensity_multiplier;
        intensity *= harmony_mods.intensity_multiplier;

        let crit_chance = state.crit_chance + harmony_mods.crit_chance_bonus;
        let crit_multiplier = state.crit_multiplier;
        let crit_factor = expected_crit_multiplier(crit_chance, crit_multiplier);
        let success_chance = clamp(
            skill.success_chance
                + state.success_chance_bonus
                + harmony_mods.success_chance_bonus
                + effects.success_chance_bonus,
            0.0,
            1.0,
        );

        let mut completion = skill.base_completion_gain;
        let mut perfection = skill.base_perfection_gain;
        if skill.scales_with_control {
            perfection = (skill.base_perfection_gain * control).floor();
            completion = if skill.base_completion_gain > 0.0 {
                (skill.base_completion_gain * control).floor()
            } else {
                0.0
            };
        }
        if skill.scales_with_intensity && skill.technique_type == "fusion" {
            completion = (skill.base_completion_gain * intensity).floor();
        }

        completion = (completion * crit_factor * success_chance).floor();
        perfection = (perfection * crit_factor * success_chance).floor();

        if let Some(cap) = self.input.config.max_completion {
            if cap.is_finite() {
                completion = completion.min((cap - state.completion).max(0.0));
            }
        }
        if let Some(cap) = self.input.config.max_perfection {
            if cap.is_finite() {
                perfection = perfection.min((cap - state.perfection).max(0.0));
            }
        }

        SkillGains {
            completion,
            perfection,
            stability: (skill.stability_gain * success_chance).floor(),
            toxicity_cleanse: (skill.toxicity_cleanse * success_chance).floor(),
        }
    }

    fn score_state(&self, state: &EngineState) -> f64 {
        if state.finished {
            return self.score_finished_outcome(state);
        }

        let goals = self.goals();
        let total_target_magnitude = (goals.mode_completion + goals.mode_perfection).max(1.0);
        let remaining_completion = (goals.mode_completion - state.completion).max(0.0);
        let remaining_perfection = (goals.mode_perfection - state.perfection).max(0.0);
        let total_remaining = remaining_completion + remaining_perfection;
        let (completion_weight, perfection_weight) = self.goal_priority_weights(
            remaining_completion,
            remaining_perfection,
            goals.mode_completion,
            goals.mode_perfection,
        );

        let mut score = state.completion.min(goals.mode_completion) * completion_weight
            + state.perfection.min(goals.mode_perfection) * perfection_weight;

        let base_targets_met = (goals.base_completion <= 0.0
            || state.completion >= goals.base_completion)
            && (goals.base_perfection <= 0.0 || state.perfection >= goals.base_perfection);
        let mode_targets_met = (goals.mode_completion <= 0.0
            || state.completion >= goals.mode_completion)
            && (goals.mode_perfection <= 0.0 || state.perfection >= goals.mode_perfection);
        let target_met_bonus = total_target_magnitude * TARGET_MET_MULTIPLIER;

        if mode_targets_met {
            score += if self.input.config.is_sublime_craft {
                target_met_bonus * SUBLIME_MET_EXTRA
            } else {
                target_met_bonus
            };
        } else if base_targets_met {
            score += target_met_bonus;
            if self.input.config.is_sublime_craft {
                let beyond_base = (state.completion - goals.base_completion).max(0.0)
                    + (state.perfection - goals.base_perfection).max(0.0);
                score += beyond_base * SUBLIME_BEYOND_BASE_WEIGHT;
            }
        }

        if !mode_targets_met {
            score += state.qi * 0.05;
            score += state.stability * (0.01 + total_remaining / total_target_magnitude * 0.01);
            if state.stability <= 0.0 {
                score -= total_target_magnitude * DEATH_PENALTY_MULTIPLIER;
            } else {
                let average_turn_cost = self.estimate_average_stability_cost().max(1.0);
                let runway_turns = state.stability / average_turn_cost;
                let estimated_turns =
                    (total_remaining / self.estimate_average_gain().max(1.0)).ceil();
                if estimated_turns > runway_turns {
                    score -= (estimated_turns - runway_turns)
                        * total_target_magnitude
                        * RUNWAY_GAP_FRACTION;
                }
            }
        } else {
            score += (state.qi + state.stability) * RESOURCE_TIEBREAKER;
        }

        if self.input.config.max_toxicity > 0.0 {
            score -= (state.toxicity / self.input.config.max_toxicity).max(0.0)
                * total_target_magnitude
                * TOXICITY_PENALTY_FRACTION;
        }

        if self.input.config.is_sublime_craft {
            score += (state.harmony / 100.0) * total_target_magnitude * HARMONY_BONUS_WEIGHT;
            score += harmony_quality(
                &state.harmony_data,
                self.input.config.crafting_type.as_deref(),
            ) * total_target_magnitude
                * 0.08;
        }

        score - state.step as f64 * STEP_PENALTY
    }

    fn score_finished_outcome(&self, state: &EngineState) -> f64 {
        let goals = self.goals();
        let total_target_magnitude = (goals.mode_completion + goals.mode_perfection).max(1.0);
        let (completion_weight, perfection_weight) = self.goal_priority_weights(
            (goals.mode_completion - state.completion).max(0.0),
            (goals.mode_perfection - state.perfection).max(0.0),
            goals.mode_completion,
            goals.mode_perfection,
        );
        let completion_outcomes = bonus_outcomes(state.completion, self.input.target_completion);
        let perfection_outcomes = bonus_outcomes(state.perfection, self.input.target_perfection);
        let mut expected_score = 0.0;

        for comp in &completion_outcomes {
            for perf in &perfection_outcomes {
                let probability = comp.probability * perf.probability;
                if probability <= 0.0 {
                    continue;
                }
                if self.input.target_completion > 0.0 && comp.guaranteed <= 0 {
                    expected_score -= probability * total_target_magnitude;
                    continue;
                }
                let resolved_comp = progress_toward_raw_goal(
                    comp.threshold,
                    goals.mode_completion,
                    self.input.target_completion,
                );
                let resolved_perf = progress_toward_raw_goal(
                    perf.threshold,
                    goals.mode_perfection,
                    self.input.target_perfection,
                );
                let shortfall = (goals.mode_completion - resolved_comp).max(0.0)
                    + (goals.mode_perfection - resolved_perf).max(0.0);
                expected_score += probability
                    * (resolved_comp * completion_weight + resolved_perf * perfection_weight
                        - shortfall);
            }
        }

        let base_targets_met = (goals.base_completion <= 0.0
            || state.completion >= goals.base_completion)
            && (goals.base_perfection <= 0.0 || state.perfection >= goals.base_perfection);
        let mode_targets_met = (goals.mode_completion <= 0.0
            || state.completion >= goals.mode_completion)
            && (goals.mode_perfection <= 0.0 || state.perfection >= goals.mode_perfection);
        let target_met_bonus = total_target_magnitude * TARGET_MET_MULTIPLIER;
        if mode_targets_met {
            expected_score += target_met_bonus
                * if self.input.config.is_sublime_craft {
                    SUBLIME_MET_EXTRA
                } else {
                    1.0
                };
        } else if base_targets_met {
            expected_score += target_met_bonus;
        }
        expected_score - state.step as f64 * STEP_PENALTY
    }

    fn finish_success_chance(&self, state: &EngineState) -> f64 {
        let outcomes = bonus_outcomes(state.completion, self.input.target_completion);
        let fail = outcomes
            .iter()
            .filter(|outcome| self.input.target_completion > 0.0 && outcome.guaranteed <= 0)
            .map(|outcome| outcome.probability)
            .sum::<f64>();
        clamp(1.0 - fail, 0.0, 1.0)
    }

    fn condition_effects(&self, condition: &str) -> ConditionEffectSummary {
        self.input
            .condition_effects
            .get(&normalize_condition(condition))
            .copied()
            .unwrap_or_default()
    }

    fn max_qi_for_state(&self, _state: &EngineState) -> f64 {
        self.input.config.max_qi.max(1.0)
    }

    fn goals(&self) -> Goals {
        let target_multiplier = if self.input.config.target_multiplier > 0.0 {
            self.input.config.target_multiplier
        } else {
            default_target_multiplier()
        };
        let raw_mode_completion = if self.input.config.is_sublime_craft {
            self.input.target_completion * target_multiplier
        } else {
            self.input.target_completion
        };
        let raw_mode_perfection = if self.input.config.is_sublime_craft {
            self.input.target_perfection * target_multiplier
        } else {
            self.input.target_perfection
        };
        let mode_completion = self
            .input
            .config
            .max_completion
            .filter(|value| value.is_finite())
            .map(|cap| raw_mode_completion.min(cap))
            .unwrap_or(raw_mode_completion);
        let mode_perfection = self
            .input
            .config
            .max_perfection
            .filter(|value| value.is_finite())
            .map(|cap| raw_mode_perfection.min(cap))
            .unwrap_or(raw_mode_perfection);
        let base_completion = self
            .input
            .config
            .max_completion
            .filter(|value| value.is_finite())
            .map(|cap| self.input.target_completion.min(cap))
            .unwrap_or(self.input.target_completion);
        let base_perfection = self
            .input
            .config
            .max_perfection
            .filter(|value| value.is_finite())
            .map(|cap| self.input.target_perfection.min(cap))
            .unwrap_or(self.input.target_perfection);
        Goals {
            mode_completion,
            mode_perfection,
            base_completion,
            base_perfection,
        }
    }

    fn goals_met(&self, state: &EngineState) -> bool {
        let goals = self.goals();
        (goals.mode_completion <= 0.0 || state.completion >= goals.mode_completion)
            && (goals.mode_perfection <= 0.0 || state.perfection >= goals.mode_perfection)
    }

    fn goal_priority_weights(
        &self,
        completion_remaining: f64,
        perfection_remaining: f64,
        completion_goal: f64,
        perfection_goal: f64,
    ) -> (f64, f64) {
        let total_remaining = completion_remaining.max(0.0) + perfection_remaining.max(0.0);
        let mut completion_share = if total_remaining > 0.0 {
            completion_remaining.max(0.0) / total_remaining
        } else if completion_goal > 0.0 && perfection_goal <= 0.0 {
            1.0
        } else {
            0.5
        };
        let mut perfection_share = if total_remaining > 0.0 {
            perfection_remaining.max(0.0) / total_remaining
        } else if perfection_goal > 0.0 && completion_goal <= 0.0 {
            1.0
        } else {
            0.5
        };
        if completion_goal <= 0.0 {
            completion_share = 0.0;
        }
        if perfection_goal <= 0.0 {
            perfection_share = 0.0;
        }
        let bias = clamp(self.input.config.goal_priority_bias, -100.0, 100.0) / 100.0;
        let shift = bias * 0.5;
        let completion_weight = (completion_share + shift).max(0.0);
        let perfection_weight = (perfection_share - shift).max(0.0);
        let total = completion_weight + perfection_weight;
        if total <= 0.0 {
            (0.5, 0.5)
        } else {
            (completion_weight / total, perfection_weight / total)
        }
    }

    fn estimate_average_gain(&self) -> f64 {
        let mut gains: Vec<f64> = self
            .input
            .skills
            .iter()
            .filter(|skill| skill.consumes_turn)
            .map(|skill| {
                let completion = if skill.scales_with_intensity {
                    skill.base_completion_gain * self.input.config.base_intensity.max(1.0)
                } else {
                    skill.base_completion_gain
                };
                let perfection = if skill.scales_with_control {
                    skill.base_perfection_gain * self.input.config.base_control.max(1.0)
                } else {
                    skill.base_perfection_gain
                };
                completion.max(0.0) + perfection.max(0.0)
            })
            .filter(|gain| *gain > 0.0)
            .collect();
        gains.sort_by(|a, b| b.partial_cmp(a).unwrap_or(std::cmp::Ordering::Equal));
        gains.truncate(2);
        if gains.is_empty() {
            self.input
                .config
                .base_intensity
                .max(self.input.config.base_control)
                .max(1.0)
        } else {
            gains.iter().sum::<f64>() / gains.len() as f64
        }
    }

    fn estimate_average_stability_cost(&self) -> f64 {
        let mut costs: Vec<f64> = self
            .input
            .skills
            .iter()
            .filter(|skill| {
                skill.consumes_turn && skill.base_completion_gain + skill.base_perfection_gain > 0.0
            })
            .map(|skill| skill.stability_cost.max(0.0))
            .filter(|cost| *cost > 0.0)
            .collect();
        costs.sort_by(|a, b| b.partial_cmp(a).unwrap_or(std::cmp::Ordering::Equal));
        costs.truncate(2);
        if costs.is_empty() {
            10.0
        } else {
            costs.iter().sum::<f64>() / costs.len() as f64
        }
    }

    fn build_result(&self, nodes: &[Node]) -> MctsResult {
        let root = &nodes[0];
        let total_child_visits = root
            .children
            .iter()
            .map(|idx| nodes[*idx].visits as f64)
            .sum::<f64>()
            .max(1.0);
        let mut skill_policies: Vec<SkillPolicy> = root
            .children
            .iter()
            .filter_map(|idx| {
                let child = &nodes[*idx];
                let action = child.action.as_ref()?;
                let visits = child.visits;
                let average_score = if visits > 0 {
                    child.value_sum / visits as f64 * self.score_scale
                } else {
                    f64::NEG_INFINITY
                };
                Some(SkillPolicy {
                    key: action.key.clone(),
                    name: action.name.clone(),
                    visits,
                    policy: visits as f64 / total_child_visits,
                    average_score,
                    best_score: child.best_value * self.score_scale,
                })
            })
            .collect();
        skill_policies.sort_by(|a, b| {
            b.visits
                .cmp(&a.visits)
                .then_with(|| {
                    b.average_score
                        .partial_cmp(&a.average_score)
                        .unwrap_or(std::cmp::Ordering::Equal)
                })
                .then_with(|| a.key.cmp(&b.key))
        });
        let best = skill_policies.first();
        MctsResult {
            backend: "rust-wasm",
            iterations: root.visits as usize,
            nodes: nodes.len(),
            rollout_depth: self.input.search.rollout_depth,
            best_skill_key: best.map(|policy| policy.key.clone()),
            best_skill_name: best.map(|policy| policy.name.clone()),
            skill_policies,
        }
    }
}

#[derive(Clone, Copy)]
struct ActionCosts {
    qi: f64,
    stability: f64,
}

#[derive(Clone, Copy)]
struct SkillGains {
    completion: f64,
    perfection: f64,
    stability: f64,
    toxicity_cleanse: f64,
}

#[derive(Clone, Copy)]
struct Goals {
    mode_completion: f64,
    mode_perfection: f64,
    base_completion: f64,
    base_perfection: f64,
}

impl MctsInput {
    fn effective_target_magnitude(&self) -> f64 {
        let target_multiplier = if self.config.target_multiplier > 0.0 {
            self.config.target_multiplier
        } else {
            default_target_multiplier()
        };
        let completion = if self.config.is_sublime_craft {
            self.target_completion * target_multiplier
        } else {
            self.target_completion
        };
        let perfection = if self.config.is_sublime_craft {
            self.target_perfection * target_multiplier
        } else {
            self.target_perfection
        };
        completion + perfection
    }
}

impl EngineState {
    fn max_stability(&self) -> f64 {
        (self.initial_max_stability - self.stability_penalty).max(0.0)
    }
}

#[derive(Clone, Copy)]
struct BonusProgress {
    guaranteed: i32,
    bonus_chance: f64,
    #[allow(dead_code)]
    next_threshold: f64,
}

#[derive(Clone, Copy)]
struct BonusOutcome {
    guaranteed: i32,
    probability: f64,
    threshold: f64,
}

fn get_bonus_and_chance(value: f64, target: f64) -> BonusProgress {
    if target <= 0.0 {
        return BonusProgress {
            guaranteed: 0,
            bonus_chance: 0.0,
            next_threshold: 0.0,
        };
    }
    let mut current_target = target;
    let mut remaining_value = value;
    let mut guaranteed = 0;
    while remaining_value > 0.0 && current_target > 0.0 && remaining_value >= current_target {
        remaining_value -= current_target;
        guaranteed += 1;
        current_target = (current_target * EXPONENTIAL_SCALING_FACTOR).floor();
    }
    let bonus_chance = if current_target > 0.0 {
        remaining_value / current_target
    } else {
        0.0
    };
    BonusProgress {
        guaranteed,
        bonus_chance,
        next_threshold: value + (current_target - remaining_value),
    }
}

fn bonus_outcomes(value: f64, target: f64) -> Vec<BonusOutcome> {
    if target <= 0.0 {
        return vec![BonusOutcome {
            guaranteed: 0,
            probability: 1.0,
            threshold: 0.0,
        }];
    }
    let progress = get_bonus_and_chance(value, target);
    let mut outcomes = vec![BonusOutcome {
        guaranteed: progress.guaranteed,
        probability: (1.0 - progress.bonus_chance).max(0.0),
        threshold: threshold_for_guaranteed_count(target, progress.guaranteed),
    }];
    if progress.bonus_chance > 0.0 {
        outcomes.push(BonusOutcome {
            guaranteed: progress.guaranteed + 1,
            probability: progress.bonus_chance,
            threshold: threshold_for_guaranteed_count(target, progress.guaranteed + 1),
        });
    }
    outcomes
        .into_iter()
        .filter(|outcome| outcome.probability > 0.0)
        .collect()
}

fn threshold_for_guaranteed_count(target: f64, guaranteed: i32) -> f64 {
    if target <= 0.0 || guaranteed <= 0 {
        return 0.0;
    }
    let mut total = 0.0;
    let mut current = target;
    for _ in 0..guaranteed {
        total += current;
        current = (current * EXPONENTIAL_SCALING_FACTOR).floor();
    }
    total
}

fn progress_toward_raw_goal(value: f64, raw_goal: f64, base_target: f64) -> f64 {
    if raw_goal <= 0.0 {
        return 0.0;
    }
    if base_target <= 0.0 {
        return value.min(raw_goal);
    }
    let progress = get_bonus_and_chance(value, base_target);
    threshold_for_guaranteed_count(base_target, progress.guaranteed).min(raw_goal)
}

fn expected_crit_multiplier(crit_chance: f64, crit_multiplier: f64) -> f64 {
    let excess_crit = (crit_chance - 100.0).max(0.0);
    let effective_multiplier = crit_multiplier + excess_crit * 3.0;
    let actual_chance = clamp(crit_chance, 0.0, 100.0) / 100.0;
    let multiplier_ratio = effective_multiplier / 100.0;
    1.0 - actual_chance + actual_chance * multiplier_ratio
}

/// Heat whose buff is actually active.
///
/// Heat 1 skips the runtime's buff update, so the previous band's Heat buff
/// stays in place instead of clearing.
fn effective_forge_heat(data: Option<&ForgeWorksData>) -> i32 {
    let heat = clamp_i32(data.map(|fw| fw.heat).unwrap_or(0), 0, 10);
    if heat != 1 {
        return heat;
    }
    clamp_i32(data.and_then(|fw| fw.last_buffed_heat).unwrap_or(heat), 0, 10)
}

fn eccentric_decree_modifiers(focused_bar: &str) -> HarmonyStatModifiers {
    if focused_bar == "perfection" {
        HarmonyStatModifiers {
            control_multiplier: 1.5,
            ..HarmonyStatModifiers::default()
        }
    } else {
        HarmonyStatModifiers {
            intensity_multiplier: 1.5,
            ..HarmonyStatModifiers::default()
        }
    }
}

/// Qi Pool / Stability cost scaling the active harmony applies to one action.
///
/// Only Enhancing Echo defines these in 0.7.5: echoing the attuned type halves
/// both costs, breaking the attunement doubles them. Resolved from the harmony
/// state *before* the action is processed.
fn get_harmony_cost_multipliers(
    harmony_data: &HarmonyData,
    harmony_type: Option<&str>,
    technique_type: &str,
) -> HarmonyCostMultipliers {
    if harmony_type != Some("enhancingEcho") {
        return HarmonyCostMultipliers::default();
    }
    let attuned = harmony_data
        .enhancing_echo
        .as_ref()
        .and_then(|echo| echo.attuned_type.clone());
    let Some(attuned) = attuned else {
        return HarmonyCostMultipliers::default();
    };
    let percentage = if attuned == normalize_technique_type(technique_type) {
        ENHANCING_ECHO_MATCH_COST_PERCENTAGE
    } else {
        ENHANCING_ECHO_DISCORD_COST_PERCENTAGE
    };
    HarmonyCostMultipliers {
        pool_cost_percentage: percentage,
        stability_cost_percentage: percentage,
    }
}

fn get_harmony_stat_modifiers(
    harmony_data: &HarmonyData,
    harmony_type: Option<&str>,
) -> HarmonyStatModifiers {
    match harmony_type.unwrap_or("") {
        "forge" => forge_modifiers(effective_forge_heat(harmony_data.forge_works.as_ref())),
        "alchemical" => harmony_data
            .alchemical_reaction_modifiers
            .unwrap_or_default(),
        "inscription" => {
            let stacks = harmony_data
                .inscribed_patterns
                .as_ref()
                .map(|ip| ip.stacks)
                .unwrap_or(0);
            let stack_bonus = stacks as f64 * 0.02;
            HarmonyStatModifiers {
                control_multiplier: 1.0 + stack_bonus,
                intensity_multiplier: 1.0 + stack_bonus,
                ..HarmonyStatModifiers::default()
            }
        }
        "resonance" => {
            let strength = harmony_data
                .resonance
                .as_ref()
                .map(|res| res.strength)
                .unwrap_or(0);
            HarmonyStatModifiers {
                crit_chance_bonus: strength as f64 * 3.0,
                success_chance_bonus: strength as f64 * 0.03,
                ..HarmonyStatModifiers::default()
            }
        }
        "eccentricDecree" => eccentric_decree_modifiers(
            harmony_data
                .eccentric_decree
                .as_ref()
                .map(|decree| decree.focused_bar.as_str())
                .unwrap_or("completion"),
        ),
        // Formless Way grants no stat modifiers; Enhancing Echo only scales
        // action costs, resolved by `get_harmony_cost_multipliers`.
        _ => HarmonyStatModifiers::default(),
    }
}

fn process_harmony_effect(
    harmony_data: &mut HarmonyData,
    harmony_type: &str,
    technique_type: &str,
    context: HarmonyProcessContext,
) -> HarmonyEffectResult {
    match harmony_type {
        "forge" => process_forge(harmony_data, technique_type),
        "alchemical" => process_alchemical(harmony_data, technique_type),
        "inscription" => process_inscription(harmony_data, technique_type),
        "resonance" => process_resonance(harmony_data, technique_type),
        "formless" => process_formless(harmony_data),
        "enhancingEcho" => process_enhancing_echo(harmony_data, technique_type),
        "eccentricDecree" => process_eccentric_decree(harmony_data, context),
        _ => HarmonyEffectResult {
            modifiers: HarmonyStatModifiers::default(),
            harmony_delta: 0.0,
            harmony_override: None,
            stability_delta: 0.0,
            pool_delta: 0.0,
            stability_penalty_delta: 0.0,
        },
    }
}

/// Formless Way has no sub-system state: it pins harmony at its peak every
/// action and pays for it with a 1.5x complexity multiplier on the targets.
fn process_formless(harmony_data: &mut HarmonyData) -> HarmonyEffectResult {
    harmony_data.recommended_technique_types.clear();
    HarmonyEffectResult {
        modifiers: HarmonyStatModifiers::default(),
        harmony_delta: 0.0,
        harmony_override: Some(FORMLESS_HARMONY),
        stability_delta: 0.0,
        pool_delta: 0.0,
        stability_penalty_delta: 0.0,
    }
}

/// Enhancing Echo alternates attune -> echo/discord. The cost scaling itself is
/// resolved before the action by `get_harmony_cost_multipliers`.
fn process_enhancing_echo(
    harmony_data: &mut HarmonyData,
    technique_type: &str,
) -> HarmonyEffectResult {
    let mut echo = harmony_data.enhancing_echo.clone().unwrap_or_default();
    let technique = normalize_technique_type(technique_type);
    let mut harmony_delta = 0.0;

    match echo.attuned_type.clone() {
        Some(attuned) => {
            if attuned == technique {
                harmony_delta = 10.0;
                echo.last_outcome = Some("echo".to_string());
            } else {
                harmony_delta = -10.0;
                echo.last_outcome = Some("discord".to_string());
            }
            echo.attuned_type = None;
        }
        None => {
            echo.attuned_type = Some(technique);
            echo.last_outcome = Some("attune".to_string());
        }
    }

    harmony_data.recommended_technique_types = echo
        .attuned_type
        .as_ref()
        .map(|entry| vec![entry.clone()])
        .unwrap_or_default();
    harmony_data.enhancing_echo = Some(echo);
    HarmonyEffectResult {
        modifiers: HarmonyStatModifiers::default(),
        harmony_delta,
        harmony_override: None,
        stability_delta: 0.0,
        pool_delta: 0.0,
        stability_penalty_delta: 0.0,
    }
}

/// Eccentric Decree rewards advancing the focused bar and punishes the other,
/// then swaps focus whenever the focused bar clears a band.
fn process_eccentric_decree(
    harmony_data: &mut HarmonyData,
    context: HarmonyProcessContext,
) -> HarmonyEffectResult {
    let mut decree = harmony_data.eccentric_decree.clone().unwrap_or_default();

    let completion = clamp(context.completion.floor(), 0.0, context.max_completion);
    let perfection = clamp(context.perfection.floor(), 0.0, context.max_perfection);
    let completion_delta = completion - decree.last_completion;
    let perfection_delta = perfection - decree.last_perfection;
    let focused_completion = decree.focused_bar != "perfection";
    let focused_delta = if focused_completion {
        completion_delta
    } else {
        perfection_delta
    };
    let stray_delta = if focused_completion {
        perfection_delta
    } else {
        completion_delta
    };

    let mut harmony_delta = 0.0;
    let mut pool_delta = 0.0;
    if focused_delta > 0.0 {
        harmony_delta += ECCENTRIC_DECREE_OBEY_HARMONY;
    }
    if stray_delta > 0.0 {
        harmony_delta += ECCENTRIC_DECREE_STRAY_HARMONY;
        pool_delta += ECCENTRIC_DECREE_STRAY_POOL;
    }

    let band_target = if focused_completion {
        context.target_completion
    } else {
        context.target_perfection
    };
    let previous_focused = if focused_completion {
        decree.last_completion
    } else {
        decree.last_perfection
    };
    let next_focused = if focused_completion {
        completion
    } else {
        perfection
    };

    decree.last_completion = completion;
    decree.last_perfection = perfection;

    let cleared_band = get_bonus_and_chance(next_focused, band_target).guaranteed
        > get_bonus_and_chance(previous_focused, band_target).guaranteed;
    if cleared_band {
        decree.focused_bar = if focused_completion {
            "perfection".to_string()
        } else {
            "completion".to_string()
        };
    }

    let modifiers = eccentric_decree_modifiers(&decree.focused_bar);
    harmony_data.recommended_technique_types = if decree.focused_bar == "perfection" {
        vec!["refine".to_string()]
    } else {
        vec!["fusion".to_string()]
    };
    harmony_data.eccentric_decree = Some(decree);
    HarmonyEffectResult {
        modifiers,
        harmony_delta,
        harmony_override: None,
        stability_delta: 0.0,
        pool_delta,
        stability_penalty_delta: 0.0,
    }
}

fn process_forge(harmony_data: &mut HarmonyData, technique_type: &str) -> HarmonyEffectResult {
    let mut heat = harmony_data
        .forge_works
        .as_ref()
        .map(|fw| fw.heat)
        .unwrap_or(0);
    if technique_type == "fusion" {
        heat += 2;
    } else {
        heat -= 1;
    }
    heat = clamp_i32(heat, 0, 10);
    let previous_buffed_heat = harmony_data
        .forge_works
        .as_ref()
        .and_then(|fw| fw.last_buffed_heat);
    // The runtime skips its Heat buff update at heat 1, so the previous band's
    // buff stays live instead of clearing.
    let last_buffed_heat = if heat != 1 {
        Some(heat)
    } else {
        previous_buffed_heat
    };
    harmony_data.forge_works = Some(ForgeWorksData {
        heat,
        last_buffed_heat,
    });
    harmony_data.recommended_technique_types = if heat <= 4 {
        vec!["fusion".to_string()]
    } else {
        vec![
            "refine".to_string(),
            "support".to_string(),
            "stabilize".to_string(),
        ]
    };
    let harmony_delta = match forge_heat_band(heat) {
        ForgeHeatBand::Optimal => 10.0,
        ForgeHeatBand::ControlPenalty | ForgeHeatBand::IntensityPenalty => -10.0,
        ForgeHeatBand::ControlCollapse | ForgeHeatBand::IntensityCollapse => -20.0,
        ForgeHeatBand::Neutral => 0.0,
    };
    HarmonyEffectResult {
        modifiers: forge_modifiers(effective_forge_heat(harmony_data.forge_works.as_ref())),
        harmony_delta,
        harmony_override: None,
        stability_delta: 0.0,
        pool_delta: 0.0,
        stability_penalty_delta: 0.0,
    }
}

fn process_alchemical(harmony_data: &mut HarmonyData, technique_type: &str) -> HarmonyEffectResult {
    let mut arts = harmony_data.alchemical_arts.clone().unwrap_or_default();
    arts.charges.push(normalize_technique_type(technique_type));
    arts.charges.sort();
    let mut harmony_delta = 0.0;
    let mut modifiers = harmony_data
        .alchemical_reaction_modifiers
        .unwrap_or_default();

    if arts.charges.len() < 3 {
        harmony_data.recommended_technique_types = next_valid_alchemical_charges(&arts.charges);
        harmony_data.alchemical_arts = Some(arts);
        return HarmonyEffectResult {
            modifiers,
            harmony_delta,
            harmony_override: None,
            stability_delta: 0.0,
            pool_delta: 0.0,
            stability_penalty_delta: 0.0,
        };
    }

    let key = arts.charges[arts.charges.len() - 3..].join(",");
    let matched = alchemical_combo_modifier(&key);
    if let Some(combo_modifiers) = matched {
        harmony_delta = 20.0;
        modifiers = combo_modifiers;
    } else {
        harmony_delta = -20.0;
        modifiers = HarmonyStatModifiers {
            control_multiplier: 0.75,
            ..HarmonyStatModifiers::default()
        };
    }
    arts.last_combo = arts.charges[arts.charges.len() - 3..].to_vec();
    arts.charges.clear();
    harmony_data.alchemical_reaction_modifiers = Some(modifiers);
    harmony_data.recommended_technique_types.clear();
    harmony_data.alchemical_arts = Some(arts);
    HarmonyEffectResult {
        modifiers,
        harmony_delta,
        harmony_override: None,
        stability_delta: 0.0,
        pool_delta: 0.0,
        stability_penalty_delta: 0.0,
    }
}

fn process_inscription(
    harmony_data: &mut HarmonyData,
    technique_type: &str,
) -> HarmonyEffectResult {
    let mut patterns = harmony_data
        .inscribed_patterns
        .clone()
        .unwrap_or_else(default_inscribed_patterns);
    let technique = normalize_technique_type(technique_type);
    let mut harmony_delta = -20.0;
    let mut pool_delta = -25.0;
    let mut stability_penalty_delta = 1.0;

    if let Some(index) = patterns
        .current_block
        .iter()
        .position(|entry| *entry == technique)
    {
        patterns.current_block.remove(index);
        patterns.stacks += 1;
        harmony_delta = 10.0;
        pool_delta = 0.0;
        stability_penalty_delta = 0.0;
        if patterns.current_block.is_empty() {
            patterns.completed_blocks += 1;
            patterns.current_block = inscribed_pattern_block();
        }
    } else {
        patterns.stacks = (patterns.stacks as f64 * 0.5).floor() as i32;
    }

    let stack_bonus = patterns.stacks as f64 * 0.02;
    let modifiers = HarmonyStatModifiers {
        control_multiplier: 1.0 + stack_bonus,
        intensity_multiplier: 1.0 + stack_bonus,
        ..HarmonyStatModifiers::default()
    };
    harmony_data.recommended_technique_types = patterns.current_block.clone();
    harmony_data.inscribed_patterns = Some(patterns);
    HarmonyEffectResult {
        modifiers,
        harmony_delta,
        harmony_override: None,
        stability_delta: 0.0,
        pool_delta,
        stability_penalty_delta,
    }
}

fn process_resonance(harmony_data: &mut HarmonyData, technique_type: &str) -> HarmonyEffectResult {
    let mut resonance = harmony_data.resonance.clone().unwrap_or_default();
    let technique = normalize_technique_type(technique_type);
    let mut harmony_delta = 0.0;
    let mut stability_delta = 0.0;

    match resonance.resonance.clone() {
        None => {
            resonance.resonance = Some(technique.clone());
            resonance.strength = 1;
            resonance.pending_count = 0;
            resonance.pending_resonance = None;
        }
        Some(current) if current == technique => {
            resonance.strength += 1;
            resonance.pending_resonance = None;
            resonance.pending_count = 0;
            harmony_delta = 3.0 * resonance.strength as f64;
        }
        Some(_) => {
            let continuing = resonance
                .pending_resonance
                .as_ref()
                .map(|pending| pending == &technique)
                .unwrap_or(false);
            let second_of_change = continuing && resonance.pending_count == 1;
            if !second_of_change {
                harmony_delta = -9.0;
                stability_delta = -3.0;
                resonance.strength = (resonance.strength - 1).max(0);
            }
            if continuing {
                resonance.pending_count += 1;
                if resonance.pending_count >= 2 {
                    resonance.resonance = Some(technique.clone());
                    resonance.pending_resonance = None;
                    resonance.pending_count = 0;
                }
            } else {
                resonance.pending_resonance = Some(technique.clone());
                resonance.pending_count = 1;
            }
        }
    }

    let modifiers = HarmonyStatModifiers {
        crit_chance_bonus: resonance.strength as f64 * 3.0,
        success_chance_bonus: resonance.strength as f64 * 0.03,
        ..HarmonyStatModifiers::default()
    };
    harmony_data.recommended_technique_types = resonance
        .resonance
        .as_ref()
        .map(|entry| vec![entry.clone()])
        .unwrap_or_default();
    harmony_data.resonance = Some(resonance);
    HarmonyEffectResult {
        modifiers,
        harmony_delta,
        harmony_override: None,
        stability_delta,
        pool_delta: 0.0,
        stability_penalty_delta: 0.0,
    }
}

#[derive(Clone, Copy)]
enum ForgeHeatBand {
    ControlCollapse,
    ControlPenalty,
    Neutral,
    Optimal,
    IntensityPenalty,
    IntensityCollapse,
}

fn forge_heat_band(heat: i32) -> ForgeHeatBand {
    match heat {
        4..=6 => ForgeHeatBand::Optimal,
        2..=3 => ForgeHeatBand::ControlPenalty,
        7..=9 => ForgeHeatBand::IntensityPenalty,
        0 => ForgeHeatBand::ControlCollapse,
        10 => ForgeHeatBand::IntensityCollapse,
        _ => ForgeHeatBand::Neutral,
    }
}

fn forge_modifiers(heat: i32) -> HarmonyStatModifiers {
    match forge_heat_band(heat) {
        ForgeHeatBand::Optimal => HarmonyStatModifiers {
            control_multiplier: 1.5,
            intensity_multiplier: 1.5,
            ..HarmonyStatModifiers::default()
        },
        ForgeHeatBand::ControlPenalty => HarmonyStatModifiers {
            control_multiplier: 0.5,
            ..HarmonyStatModifiers::default()
        },
        ForgeHeatBand::IntensityPenalty => HarmonyStatModifiers {
            intensity_multiplier: 0.5,
            ..HarmonyStatModifiers::default()
        },
        ForgeHeatBand::ControlCollapse => HarmonyStatModifiers {
            control_multiplier: -9.0,
            ..HarmonyStatModifiers::default()
        },
        ForgeHeatBand::IntensityCollapse => HarmonyStatModifiers {
            intensity_multiplier: -9.0,
            ..HarmonyStatModifiers::default()
        },
        ForgeHeatBand::Neutral => HarmonyStatModifiers::default(),
    }
}

fn alchemical_combo_modifier(key: &str) -> Option<HarmonyStatModifiers> {
    match key {
        "fusion,refine,support" => Some(HarmonyStatModifiers {
            stability_cost_percentage: 75.0,
            ..HarmonyStatModifiers::default()
        }),
        "fusion,refine,refine" => Some(HarmonyStatModifiers {
            intensity_multiplier: 1.25,
            ..HarmonyStatModifiers::default()
        }),
        "fusion,fusion,refine" => Some(HarmonyStatModifiers {
            control_multiplier: 1.25,
            ..HarmonyStatModifiers::default()
        }),
        "fusion,refine,stabilize" => Some(HarmonyStatModifiers {
            crit_chance_bonus: 25.0,
            ..HarmonyStatModifiers::default()
        }),
        "refine,refine,support" => Some(HarmonyStatModifiers {
            pool_cost_percentage: 75.0,
            ..HarmonyStatModifiers::default()
        }),
        "refine,stabilize,support" => Some(HarmonyStatModifiers {
            success_chance_bonus: 0.25,
            ..HarmonyStatModifiers::default()
        }),
        _ => None,
    }
}

fn next_valid_alchemical_charges(charges: &[String]) -> Vec<String> {
    let combos = [
        ["fusion", "refine", "support"],
        ["fusion", "refine", "refine"],
        ["fusion", "fusion", "refine"],
        ["fusion", "refine", "stabilize"],
        ["refine", "refine", "support"],
        ["refine", "stabilize", "support"],
    ];
    let mut valid = Vec::<String>::new();
    for combo in combos {
        let mut remaining = combo.iter().map(|s| s.to_string()).collect::<Vec<_>>();
        let mut missing = false;
        for charge in charges {
            if let Some(index) = remaining.iter().position(|entry| entry == charge) {
                remaining.remove(index);
            } else {
                missing = true;
                break;
            }
        }
        if !missing {
            for entry in remaining {
                if !valid.contains(&entry) {
                    valid.push(entry);
                }
            }
        }
    }
    valid.sort();
    valid
}

fn inscribed_pattern_block() -> Vec<String> {
    vec![
        "stabilize".to_string(),
        "support".to_string(),
        "fusion".to_string(),
        "refine".to_string(),
        "refine".to_string(),
    ]
}

fn default_inscribed_patterns() -> InscribedPatternsData {
    InscribedPatternsData {
        current_block: inscribed_pattern_block(),
        completed_blocks: 0,
        stacks: 0,
    }
}

fn harmony_quality(harmony_data: &HarmonyData, harmony_type: Option<&str>) -> f64 {
    match harmony_type.unwrap_or("") {
        "forge" => {
            let heat = harmony_data
                .forge_works
                .as_ref()
                .map(|fw| fw.heat)
                .unwrap_or(0);
            match forge_heat_band(heat) {
                ForgeHeatBand::Optimal => 1.0,
                ForgeHeatBand::Neutral => 0.2,
                ForgeHeatBand::ControlPenalty | ForgeHeatBand::IntensityPenalty => -0.35,
                ForgeHeatBand::ControlCollapse | ForgeHeatBand::IntensityCollapse => -1.0,
            }
        }
        "alchemical" => harmony_data
            .alchemical_arts
            .as_ref()
            .map(|aa| aa.charges.len() as f64 / 3.0)
            .unwrap_or(0.0),
        "inscription" => harmony_data
            .inscribed_patterns
            .as_ref()
            .map(|ip| (ip.stacks as f64 * 0.08).min(1.0))
            .unwrap_or(0.0),
        "resonance" => harmony_data
            .resonance
            .as_ref()
            .map(|res| (res.strength as f64 * 0.12).min(1.0))
            .unwrap_or(0.0),
        _ => 0.0,
    }
}

fn advance_condition(
    current_condition: &str,
    queue: &[String],
    harmony: f64,
    rng: &mut SmallRng,
) -> (String, Vec<String>) {
    let normalized_queue = normalize_queue(queue);
    if !normalized_queue.is_empty() {
        let next_condition = normalized_queue[0].clone();
        let shifted = normalized_queue[1..].to_vec();
        let appended_distribution =
            generated_condition_distribution(&next_condition, &shifted, harmony);
        let appended = sample_distribution(&appended_distribution, rng);
        let mut next_queue = shifted;
        next_queue.push(appended);
        (next_condition, next_queue)
    } else {
        let generated = generated_condition_distribution(current_condition, &[], harmony);
        let next_condition = sample_distribution(&generated, rng);
        let appended_distribution = generated_condition_distribution(&next_condition, &[], harmony);
        let appended = most_likely_condition(&appended_distribution);
        (next_condition, vec![appended])
    }
}

fn generated_condition_distribution(
    current_condition: &str,
    next_conditions: &[String],
    harmony: f64,
) -> Vec<(String, f64)> {
    let current = normalize_condition(current_condition);
    let queue = normalize_queue(next_conditions);
    let clamped_harmony = clamp(harmony, -100.0, 100.0);
    let negative_delta = if clamped_harmony < 0.0 {
        clamped_harmony.abs() / 100.0
    } else {
        0.0
    };
    let positive_delta = if clamped_harmony > 0.0 {
        clamped_harmony.abs() / 100.0
    } else {
        0.0
    };
    let last_condition = queue.last().map(|s| s.as_str());
    match last_condition {
        Some("veryPositive") | Some("veryNegative") => {
            return vec![("neutral".to_string(), 1.0)];
        }
        Some("positive") => {
            let upgrade = clamp(0.3 * positive_delta, 0.0, 1.0);
            return normalize_distribution(vec![
                ("veryPositive".to_string(), upgrade),
                ("neutral".to_string(), 1.0 - upgrade),
            ]);
        }
        Some("negative") => {
            let upgrade = clamp(0.3 * negative_delta, 0.0, 1.0);
            return normalize_distribution(vec![
                ("veryNegative".to_string(), upgrade),
                ("neutral".to_string(), 1.0 - upgrade),
            ]);
        }
        _ => {}
    }

    let change_probability = if current == "neutral" && queue.iter().all(|c| c == "neutral") {
        1.0
    } else {
        let mut neutral_count = 0.0;
        for condition in queue.iter().rev() {
            if condition == "neutral" {
                neutral_count += 1.0;
            } else {
                break;
            }
        }
        clamp(
            neutral_count * (0.15 + 0.15 * negative_delta.max(positive_delta)),
            0.0,
            1.0,
        )
    };
    let positive_chance = clamp((clamped_harmony + 100.0) / 200.0, 0.0, 1.0);
    normalize_distribution(vec![
        ("neutral".to_string(), 1.0 - change_probability),
        ("positive".to_string(), change_probability * positive_chance),
        (
            "negative".to_string(),
            change_probability * (1.0 - positive_chance),
        ),
    ])
}

fn normalize_distribution(entries: Vec<(String, f64)>) -> Vec<(String, f64)> {
    let mut merged = HashMap::<String, f64>::new();
    for (condition, probability) in entries {
        let probability = clamp(probability, 0.0, 1.0);
        if probability > 0.0 {
            *merged.entry(condition).or_insert(0.0) += probability;
        }
    }
    let total = merged.values().sum::<f64>();
    if total <= 0.0 {
        return vec![("neutral".to_string(), 1.0)];
    }
    let mut result = merged
        .into_iter()
        .map(|(condition, probability)| (condition, probability / total))
        .collect::<Vec<_>>();
    result.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    result
}

fn sample_distribution(distribution: &[(String, f64)], rng: &mut SmallRng) -> String {
    let mut threshold = rng.next_f64();
    for (condition, probability) in distribution {
        if threshold <= *probability {
            return condition.clone();
        }
        threshold -= probability;
    }
    distribution
        .last()
        .map(|(condition, _)| condition.clone())
        .unwrap_or_else(|| "neutral".to_string())
}

fn most_likely_condition(distribution: &[(String, f64)]) -> String {
    distribution
        .first()
        .map(|(condition, _)| condition.clone())
        .unwrap_or_else(|| "neutral".to_string())
}

fn normalize_condition(condition: &str) -> String {
    match condition.trim().to_ascii_lowercase().as_str() {
        "verypositive" | "very_positive" | "excellent" | "brilliant" => "veryPositive".to_string(),
        "verynegative" | "very_negative" | "corrupted" => "veryNegative".to_string(),
        "positive" | "harmonious" => "positive".to_string(),
        "negative" | "resistant" => "negative".to_string(),
        "neutral" | "balanced" | "" => "neutral".to_string(),
        other => other.to_string(),
    }
}

fn normalize_queue(queue: &[String]) -> Vec<String> {
    queue
        .iter()
        .map(|condition| normalize_condition(condition))
        .collect()
}

fn normalize_technique_type(technique_type: &str) -> String {
    match technique_type.trim().to_ascii_lowercase().as_str() {
        "fusion" => "fusion".to_string(),
        "refine" => "refine".to_string(),
        "stabilize" => "stabilize".to_string(),
        _ => "support".to_string(),
    }
}

fn normalize_cost_percentage(value: f64) -> f64 {
    if !value.is_finite() || value <= 0.0 {
        100.0
    } else {
        value
    }
}

fn build_seed(input: &MctsInput) -> u64 {
    let mut hash = 0xcbf2_9ce4_8422_2325u64;
    fn mix(hash: &mut u64, value: u64) {
        *hash ^= value;
        *hash = hash.wrapping_mul(0x1000_0000_01b3);
    }
    for value in [
        input.state.qi,
        input.state.stability,
        input.state.completion,
        input.state.perfection,
        input.state.harmony,
        input.target_completion,
        input.target_perfection,
    ] {
        mix(&mut hash, value.to_bits());
    }
    for skill in &input.skills {
        for byte in skill.key.as_bytes() {
            mix(&mut hash, *byte as u64);
        }
    }
    hash
}

#[derive(Clone)]
struct SmallRng {
    state: u64,
}

impl SmallRng {
    fn new(seed: u64) -> Self {
        Self {
            state: if seed == 0 {
                0xA076_1D64_78BD_642F
            } else {
                seed
            },
        }
    }

    fn next_u64(&mut self) -> u64 {
        let mut x = self.state;
        x ^= x >> 12;
        x ^= x << 25;
        x ^= x >> 27;
        self.state = x;
        x.wrapping_mul(0x2545_F491_4F6C_DD1D)
    }

    fn next_f64(&mut self) -> f64 {
        let bits = self.next_u64() >> 11;
        (bits as f64) * (1.0 / ((1u64 << 53) as f64))
    }

    fn next_usize(&mut self, upper: usize) -> usize {
        if upper <= 1 {
            0
        } else {
            (self.next_u64() as usize) % upper
        }
    }
}

fn clamp(value: f64, min: f64, max: f64) -> f64 {
    value.max(min).min(max)
}

fn clamp_i32(value: i32, min: i32, max: i32) -> i32 {
    value.max(min).min(max)
}

fn default_focused_bar() -> String {
    "completion".to_string()
}

fn default_condition() -> String {
    "neutral".to_string()
}

fn default_initial_max_stability() -> f64 {
    60.0
}

fn default_crit_multiplier() -> f64 {
    150.0
}

fn default_cost_percentage() -> f64 {
    100.0
}

fn default_buff_multiplier() -> f64 {
    1.4
}

fn default_target_multiplier() -> f64 {
    2.0
}

fn default_success_chance() -> f64 {
    1.0
}

fn default_unit() -> f64 {
    1.0
}

fn default_consumes_turn() -> bool {
    true
}

fn default_iterations() -> usize {
    12_000
}

fn default_rollout_depth() -> usize {
    32
}

fn default_exploration() -> f64 {
    1.15
}

fn default_max_nodes() -> usize {
    50_000
}

#[cfg(test)]
mod tests {
    use super::*;

    fn basic_input() -> MctsInput {
        MctsInput {
            state: EngineState {
                qi: 120.0,
                stability: 60.0,
                initial_max_stability: 60.0,
                stability_penalty: 0.0,
                completion: 0.0,
                perfection: 0.0,
                crit_chance: 0.0,
                crit_multiplier: 150.0,
                success_chance_bonus: 0.0,
                pool_cost_flat: 0.0,
                pool_cost_percentage: 100.0,
                stability_cost_percentage: 100.0,
                control_buff_turns: 0,
                intensity_buff_turns: 0,
                control_buff_multiplier: 1.4,
                intensity_buff_multiplier: 1.4,
                toxicity: 0.0,
                max_toxicity: 0.0,
                harmony: 0.0,
                harmony_data: HarmonyData::default(),
                cooldowns: vec![0, 0, 0],
                completion_bonus: 0,
                step: 0,
                finished: false,
            },
            config: EngineConfig {
                max_qi: 120.0,
                max_stability: 60.0,
                max_completion: None,
                max_perfection: None,
                base_intensity: 12.0,
                base_control: 16.0,
                min_stability: 0.0,
                default_buff_multiplier: 1.4,
                max_toxicity: 0.0,
                crafting_type: None,
                is_sublime_craft: false,
                target_multiplier: 2.0,
                training_mode: false,
                goal_priority_bias: 0.0,
            },
            skills: vec![
                EngineSkill {
                    name: "Fusion".to_string(),
                    key: "fusion".to_string(),
                    technique_type: "fusion".to_string(),
                    action_kind: "skill".to_string(),
                    qi_cost: 0.0,
                    stability_cost: 10.0,
                    success_chance: 1.0,
                    base_completion_gain: 1.0,
                    base_perfection_gain: 0.0,
                    stability_gain: 0.0,
                    max_stability_change: 0.0,
                    buff_type: 0,
                    buff_duration: 0,
                    buff_multiplier: 1.0,
                    scales_with_control: false,
                    scales_with_intensity: true,
                    prevents_max_stability_decay: false,
                    toxicity_cost: 0.0,
                    toxicity_cleanse: 0.0,
                    cooldown: 0,
                    restores_qi: false,
                    qi_restore: 0.0,
                    restores_max_stability_to_full: false,
                    consumes_turn: true,
                    condition_requirement: None,
                },
                EngineSkill {
                    name: "Refine".to_string(),
                    key: "refine".to_string(),
                    technique_type: "refine".to_string(),
                    action_kind: "skill".to_string(),
                    qi_cost: 10.0,
                    stability_cost: 10.0,
                    success_chance: 1.0,
                    base_completion_gain: 0.0,
                    base_perfection_gain: 1.0,
                    stability_gain: 0.0,
                    max_stability_change: 0.0,
                    buff_type: 0,
                    buff_duration: 0,
                    buff_multiplier: 1.0,
                    scales_with_control: true,
                    scales_with_intensity: false,
                    prevents_max_stability_decay: false,
                    toxicity_cost: 0.0,
                    toxicity_cleanse: 0.0,
                    cooldown: 0,
                    restores_qi: false,
                    qi_restore: 0.0,
                    restores_max_stability_to_full: false,
                    consumes_turn: true,
                    condition_requirement: None,
                },
                EngineSkill {
                    name: "Stabilize".to_string(),
                    key: "stabilize".to_string(),
                    technique_type: "stabilize".to_string(),
                    action_kind: "skill".to_string(),
                    qi_cost: 0.0,
                    stability_cost: 0.0,
                    success_chance: 1.0,
                    base_completion_gain: 0.0,
                    base_perfection_gain: 0.0,
                    stability_gain: 20.0,
                    max_stability_change: 0.0,
                    buff_type: 0,
                    buff_duration: 0,
                    buff_multiplier: 1.0,
                    scales_with_control: false,
                    scales_with_intensity: false,
                    prevents_max_stability_decay: true,
                    toxicity_cost: 0.0,
                    toxicity_cleanse: 0.0,
                    cooldown: 0,
                    restores_qi: false,
                    qi_restore: 0.0,
                    restores_max_stability_to_full: false,
                    consumes_turn: true,
                    condition_requirement: None,
                },
            ],
            target_completion: 24.0,
            target_perfection: 16.0,
            current_condition: "neutral".to_string(),
            forecasted_conditions: vec!["neutral".to_string(), "neutral".to_string()],
            condition_effects: HashMap::new(),
            search: MctsSearchConfig {
                iterations: 1_000,
                rollout_depth: 8,
                exploration: 1.0,
                seed: 42,
                max_nodes: 5_000,
            },
        }
    }

    #[test]
    fn mcts_returns_root_policy() {
        let mut engine = Engine::new(basic_input());
        let result = engine.run();
        assert!(result.iterations > 0);
        assert!(result.nodes > 1);
        assert!(!result.skill_policies.is_empty());
        assert!(result.best_skill_key.is_some());
    }

    #[test]
    fn forge_heat_tracks_harmony_state() {
        let mut data = HarmonyData {
            forge_works: Some(ForgeWorksData {
                heat: 2,
                last_buffed_heat: Some(2),
            }),
            ..HarmonyData::default()
        };
        let result = process_harmony_effect(
            &mut data,
            "forge",
            "fusion",
            HarmonyProcessContext::default(),
        );
        assert_eq!(data.forge_works.unwrap().heat, 4);
        assert_eq!(result.harmony_delta, 10.0);
    }

    /// Heat 1 skips the runtime's Heat buff update, so the heat-2 control
    /// penalty must persist rather than clearing to neutral.
    #[test]
    fn forge_heat_one_keeps_the_previous_heat_buff() {
        let mut data = HarmonyData {
            forge_works: Some(ForgeWorksData {
                heat: 2,
                last_buffed_heat: Some(2),
            }),
            ..HarmonyData::default()
        };
        process_harmony_effect(
            &mut data,
            "forge",
            "refine",
            HarmonyProcessContext::default(),
        );
        let forge = data.forge_works.clone().unwrap();
        assert_eq!(forge.heat, 1);
        assert_eq!(forge.last_buffed_heat, Some(2));
        assert_eq!(
            get_harmony_stat_modifiers(&data, Some("forge")).control_multiplier,
            0.5
        );
    }

    #[test]
    fn formless_pins_harmony_at_its_peak() {
        let mut data = HarmonyData::default();
        let result = process_harmony_effect(
            &mut data,
            "formless",
            "fusion",
            HarmonyProcessContext::default(),
        );
        assert_eq!(result.harmony_override, Some(FORMLESS_HARMONY));
    }

    #[test]
    fn enhancing_echo_halves_costs_on_an_echo_and_doubles_on_discord() {
        let data = HarmonyData {
            enhancing_echo: Some(EnhancingEchoData {
                attuned_type: Some("fusion".to_string()),
                last_outcome: Some("attune".to_string()),
            }),
            ..HarmonyData::default()
        };
        assert_eq!(
            get_harmony_cost_multipliers(&data, Some("enhancingEcho"), "fusion").pool_cost_percentage,
            ENHANCING_ECHO_MATCH_COST_PERCENTAGE
        );
        assert_eq!(
            get_harmony_cost_multipliers(&data, Some("enhancingEcho"), "refine").pool_cost_percentage,
            ENHANCING_ECHO_DISCORD_COST_PERCENTAGE
        );
    }

    #[test]
    fn eccentric_decree_swaps_focus_once_the_focused_bar_clears_a_band() {
        let mut data = HarmonyData {
            eccentric_decree: Some(EccentricDecreeData {
                focused_bar: "completion".to_string(),
                last_completion: 90.0,
                last_perfection: 0.0,
            }),
            ..HarmonyData::default()
        };
        let result = process_harmony_effect(
            &mut data,
            "eccentricDecree",
            "fusion",
            HarmonyProcessContext {
                completion: 120.0,
                perfection: 0.0,
                max_completion: 1000.0,
                max_perfection: 1000.0,
                target_completion: 100.0,
                target_perfection: 80.0,
            },
        );
        assert_eq!(result.harmony_delta, ECCENTRIC_DECREE_OBEY_HARMONY);
        assert_eq!(
            data.eccentric_decree.unwrap().focused_bar,
            "perfection".to_string()
        );
    }

    #[test]
    fn bonus_outcomes_match_expected_thresholds() {
        let outcomes = bonus_outcomes(130.0, 100.0);
        assert_eq!(outcomes.len(), 2);
        assert_eq!(outcomes[0].guaranteed, 1);
        assert_eq!(outcomes[0].threshold, 100.0);
        assert_eq!(outcomes[1].threshold, 230.0);
    }
}
