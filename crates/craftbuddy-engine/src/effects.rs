//! Effect-tree evaluation, ported from `src/optimizer/skills.ts`.
//!
//! Until this module existed the Rust engine only understood a *flattened
//! scalar summary* of each technique (`base_completion_gain`,
//! `scales_with_control`, ...). Every real 0.7.5 technique is described by an
//! effect tree instead, so the fast path was also the less accurate path: any
//! game technique whose gains come from `effects`, from a mastery upgrade, from
//! a Soulflame-style buff or from a pill was invisible to it.
//!
//! Everything here mirrors the TypeScript simulator statement for statement,
//! including its rounding order, because
//! `crates/craftbuddy-engine/tests/differential_corpus.json` compares the two
//! implementations transition by transition.
//!
//! Deliberate deviations, all of them parity-preserving:
//!
//! - `Scaling` mastery upgrades only rewrite `value`. The runtime's
//!   `applyUpgradeMasteries` walks `amount` / `value` / `cooldown`, but on a
//!   `Scaling` node `value` is the only one of those that exists; `amount` and
//!   `cooldown` live on the *effect*, which the TypeScript side does not rewrite
//!   either because it starts its walk at the scaling.
//! - Buff `stats` are held in a `BTreeMap`. The TypeScript side iterates
//!   insertion order, but a single buff cannot carry the same stat key twice, and
//!   every stat contribution is either additive or scoped to its own key, so the
//!   order inside one buff is unobservable. Buff *order* is observable and is
//!   preserved by keeping the buff collection a `Vec`.

use std::cell::RefCell;
use std::collections::{BTreeMap, HashMap};
use std::rc::Rc;

use serde::Deserialize;

use crate::{normalize_cost_percentage, EngineConfig, EngineSkill, EngineState};

/// Scaling variables handed to game-authored formulas.
pub type Variables = HashMap<String, f64>;

/// `trim -> lowercase -> spaces become underscores`, mirroring
/// `normalizeIdentifier` in `src/optimizer/nameNormalization.ts`.
pub fn normalize_identifier(value: &str) -> String {
    let trimmed = value.trim();
    if trimmed.is_empty() {
        return String::new();
    }
    let lowered = trimmed.to_lowercase();
    let mut out = String::with_capacity(lowered.len());
    let mut in_space = false;
    for ch in lowered.chars() {
        if ch.is_whitespace() {
            in_space = true;
            continue;
        }
        if in_space {
            out.push('_');
            in_space = false;
        }
        out.push(ch);
    }
    out
}

// ---------------------------------------------------------------------------
// Game data shapes (camelCase pass-through from the TypeScript bridge)
// ---------------------------------------------------------------------------

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CustomScaling {
    #[serde(default)]
    pub multiplier: f64,
    #[serde(default)]
    pub scaling: String,
}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Scaling {
    #[serde(default)]
    pub value: f64,
    #[serde(default)]
    pub stat: Option<String>,
    #[serde(default)]
    pub scaling: Option<String>,
    #[serde(default)]
    pub eqn: Option<String>,
    #[serde(default)]
    pub custom_scaling: Option<CustomScaling>,
    #[serde(default)]
    pub additive_eqn: Option<String>,
    #[serde(default)]
    pub max: Option<Box<Scaling>>,
    #[serde(default)]
    pub divide_by_stance_length: bool,
    #[serde(default)]
    pub upgrade_key: Option<String>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(untagged)]
pub enum ConditionBuffRef {
    /// The literal string `"self"`.
    SelfRef(String),
    Named {
        #[serde(default)]
        name: Option<String>,
    },
}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EffectCondition {
    #[serde(default)]
    pub kind: String,
    #[serde(default)]
    pub buff: Option<ConditionBuffRef>,
    #[serde(default)]
    pub count: f64,
    #[serde(default)]
    pub mode: Option<String>,
    #[serde(default)]
    pub percentage: f64,
    #[serde(default)]
    pub condition: Option<String>,
}

/// One node of a technique or buff effect tree.
///
/// The runtime uses two nominally different unions (`TechniqueEffect` and
/// `BuffEffect`) with identical field shapes, so one struct covers both; the
/// caller decides which `kind` values it honours.
#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Effect {
    #[serde(default)]
    pub kind: String,
    #[serde(default)]
    pub amount: Option<Scaling>,
    #[serde(default)]
    pub stacks: Option<Scaling>,
    #[serde(default)]
    pub buff: Option<BuffDefinition>,
    #[serde(default)]
    pub condition: Option<EffectCondition>,
}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BuffDefinition {
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub can_stack: Option<bool>,
    #[serde(default)]
    pub max_stacks: Option<f64>,
    #[serde(default)]
    pub stats: Option<BTreeMap<String, Scaling>>,
    #[serde(default, deserialize_with = "crate::null_default")]
    pub effects: Vec<Effect>,
    #[serde(default)]
    pub on_fusion: Option<Vec<Effect>>,
    #[serde(default)]
    pub on_refine: Option<Vec<Effect>>,
    #[serde(default)]
    pub on_stabilize: Option<Vec<Effect>>,
    #[serde(default)]
    pub on_support: Option<Vec<Effect>>,
}

/// An active buff instance. Mirrors `TrackedBuff` in `src/optimizer/state.ts`.
///
/// The runtime tracks buff lifetime through stacks and explicit `negate`
/// effects rather than a duration counter, so there is deliberately no
/// `duration` field: adding one would be a field the TypeScript oracle never
/// updates, which is exactly the kind of silent divergence the differential
/// corpus exists to prevent.
#[derive(Clone, Debug, Default, Deserialize)]
pub struct ActiveBuff {
    #[serde(default)]
    pub key: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub stacks: i32,
    #[serde(default)]
    pub definition: Option<BuffDefinition>,
}

#[derive(Clone, Debug, Default, Deserialize)]
pub struct ItemStack {
    #[serde(default)]
    pub key: String,
    #[serde(default)]
    pub count: i32,
}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MasteryEntry {
    #[serde(default)]
    pub kind: String,
    #[serde(default)]
    pub percentage: f64,
    #[serde(default)]
    pub change: f64,
    #[serde(default)]
    pub upgrade_key: Option<String>,
    #[serde(default)]
    pub should_multiply: bool,
    #[serde(default)]
    pub condition: Option<EffectCondition>,
}

/// Pre-resolved mastery bonuses. Mirrors `SkillMastery`.
#[derive(Clone, Copy, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MasteryBonuses {
    #[serde(default)]
    pub control_bonus: f64,
    #[serde(default)]
    pub intensity_bonus: f64,
    #[serde(default)]
    pub pool_cost_reduction: f64,
    #[serde(default)]
    pub stability_cost_reduction: f64,
    #[serde(default)]
    pub success_chance_bonus: f64,
    #[serde(default)]
    pub crit_chance_bonus: f64,
    #[serde(default)]
    pub crit_multiplier_bonus: f64,
}

#[derive(Clone, Debug, Default, Deserialize)]
pub struct BuffRequirement {
    #[serde(default)]
    pub buff_name: String,
    #[serde(default)]
    pub amount: f64,
}

#[derive(Clone, Debug, Default, Deserialize)]
pub struct BuffCost {
    #[serde(default)]
    pub buff_name: String,
    #[serde(default)]
    pub amount: Option<f64>,
    #[serde(default)]
    pub consume_all: bool,
}

/// One `upgradeKey` rewrite rule accumulated from `upgrade` masteries.
#[derive(Clone, Copy, Debug)]
pub struct UpgradeRule {
    pub additive: f64,
    pub multiplier: f64,
}

pub type UpgradeMap = HashMap<String, UpgradeRule>;

// ---------------------------------------------------------------------------
// Expression evaluation
// ---------------------------------------------------------------------------

#[derive(Clone, Debug)]
enum Expr {
    Number(f64),
    Ident(String),
    Unary(char, Box<Expr>),
    Binary(BinOp, Box<Expr>, Box<Expr>),
    /// JavaScript `&&` / `||` return an *operand*, not a boolean.
    And(Box<Expr>, Box<Expr>),
    Or(Box<Expr>, Box<Expr>),
    Call(String, Vec<Expr>),
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum BinOp {
    Add,
    Sub,
    Mul,
    Div,
    Rem,
    Lt,
    Lte,
    Gt,
    Gte,
    Eq,
    Neq,
}

#[derive(Clone, Debug, PartialEq)]
enum Token {
    Number(f64),
    Ident(String),
    Op(&'static str),
    LParen,
    RParen,
    Comma,
}

thread_local! {
    /// Compiled-expression memo. Mirrors `EXPRESSION_CACHE` in
    /// `src/optimizer/gameTypes.ts`; without it every node re-parses the same
    /// handful of game formulas.
    static EXPRESSION_CACHE: RefCell<HashMap<String, Option<Rc<Expr>>>> =
        RefCell::new(HashMap::new());
}

const MAX_EXPRESSION_LENGTH: usize = 1024;
const MAX_EXPRESSION_CACHE_SIZE: usize = 256;

const BLOCKED_KEYWORDS: &[&str] = &[
    "while", "for", "do", "switch", "try", "catch", "finally", "class", "function", "new",
    "return", "throw", "import", "export", "await", "yield", "with", "const", "let", "var",
    "delete", "this", "super",
];

fn allowed_expression_chars(eqn: &str) -> bool {
    eqn.chars().all(|ch| {
        ch.is_alphanumeric()
            || ch == '_'
            || ch.is_whitespace()
            || matches!(
                ch,
                '+' | '-'
                    | '*'
                    | '/'
                    | '%'
                    | '('
                    | ')'
                    | '.'
                    | ','
                    | '<'
                    | '>'
                    | '='
                    | '!'
                    | '&'
                    | '|'
                    | ':'
                    | '{'
                    | '}'
            )
    })
}

fn is_word_char(ch: char) -> bool {
    ch.is_alphanumeric() || ch == '_'
}

/// Replace whole-word `needle` occurrences, mirroring `\bword\b`.
fn replace_word(input: &str, needle: &str, replacement: &str) -> String {
    let mut out = String::with_capacity(input.len());
    let bytes: Vec<char> = input.chars().collect();
    let needle_chars: Vec<char> = needle.chars().collect();
    let mut index = 0usize;
    while index < bytes.len() {
        let matches_here = index + needle_chars.len() <= bytes.len()
            && bytes[index..index + needle_chars.len()] == needle_chars[..];
        let boundary_before = index == 0 || !is_word_char(bytes[index - 1]);
        let after = index + needle_chars.len();
        let boundary_after = after >= bytes.len() || !is_word_char(bytes[after]);
        if matches_here && boundary_before && boundary_after {
            out.push_str(replacement);
            index = after;
        } else {
            out.push(bytes[index]);
            index += 1;
        }
    }
    out
}

fn contains_blocked_keyword(eqn: &str) -> bool {
    let lowered = eqn.to_lowercase();
    BLOCKED_KEYWORDS
        .iter()
        .any(|keyword| replace_word(&lowered, keyword, "\u{0}") != lowered)
}

/// Mirrors `ASSIGNMENT_OPERATOR_RE`: `(^|[^=!<>])=($|[^=])`.
fn contains_assignment(eqn: &str) -> bool {
    let chars: Vec<char> = eqn.chars().collect();
    for (index, ch) in chars.iter().enumerate() {
        if *ch != '=' {
            continue;
        }
        let before_ok = index == 0 || !matches!(chars[index - 1], '=' | '!' | '<' | '>');
        let after_ok = index + 1 >= chars.len() || chars[index + 1] != '=';
        if before_ok && after_ok {
            return true;
        }
    }
    false
}

fn tokenize(eqn: &str) -> Option<Vec<Token>> {
    let chars: Vec<char> = eqn.chars().collect();
    let mut tokens = Vec::new();
    let mut index = 0usize;
    while index < chars.len() {
        let ch = chars[index];
        if ch.is_whitespace() {
            index += 1;
            continue;
        }
        if ch.is_ascii_digit()
            || (ch == '.' && index + 1 < chars.len() && chars[index + 1].is_ascii_digit())
        {
            let start = index;
            while index < chars.len() && (chars[index].is_ascii_digit() || chars[index] == '.') {
                index += 1;
            }
            let literal: String = chars[start..index].iter().collect();
            tokens.push(Token::Number(literal.parse::<f64>().ok()?));
            continue;
        }
        if is_word_char(ch) {
            let start = index;
            while index < chars.len() && is_word_char(chars[index]) {
                index += 1;
            }
            tokens.push(Token::Ident(chars[start..index].iter().collect()));
            continue;
        }
        match ch {
            '(' => {
                tokens.push(Token::LParen);
                index += 1;
            }
            ')' => {
                tokens.push(Token::RParen);
                index += 1;
            }
            ',' => {
                tokens.push(Token::Comma);
                index += 1;
            }
            '+' | '-' | '*' | '/' | '%' => {
                tokens.push(Token::Op(match ch {
                    '+' => "+",
                    '-' => "-",
                    '*' => "*",
                    '/' => "/",
                    _ => "%",
                }));
                index += 1;
            }
            '&' => {
                if chars.get(index + 1) == Some(&'&') {
                    tokens.push(Token::Op("&&"));
                    index += 2;
                } else {
                    return None;
                }
            }
            '|' => {
                if chars.get(index + 1) == Some(&'|') {
                    tokens.push(Token::Op("||"));
                    index += 2;
                } else {
                    return None;
                }
            }
            '<' | '>' => {
                if chars.get(index + 1) == Some(&'=') {
                    tokens.push(Token::Op(if ch == '<' { "<=" } else { ">=" }));
                    index += 2;
                } else {
                    tokens.push(Token::Op(if ch == '<' { "<" } else { ">" }));
                    index += 1;
                }
            }
            '=' => {
                // `=` alone is rejected earlier; only `==` / `===` reach here.
                let mut width = 1usize;
                while chars.get(index + width) == Some(&'=') {
                    width += 1;
                }
                if width < 2 {
                    return None;
                }
                tokens.push(Token::Op("=="));
                index += width;
            }
            '!' => {
                let mut width = 1usize;
                while chars.get(index + width) == Some(&'=') {
                    width += 1;
                }
                if width == 1 {
                    tokens.push(Token::Op("!"));
                    index += 1;
                } else {
                    tokens.push(Token::Op("!="));
                    index += width;
                }
            }
            _ => return None,
        }
    }
    Some(tokens)
}

struct Parser {
    tokens: Vec<Token>,
    position: usize,
}

impl Parser {
    fn peek(&self) -> Option<&Token> {
        self.tokens.get(self.position)
    }

    fn eat_op(&mut self, op: &str) -> bool {
        if let Some(Token::Op(found)) = self.peek() {
            if *found == op {
                self.position += 1;
                return true;
            }
        }
        false
    }

    fn parse_expression(&mut self) -> Option<Expr> {
        self.parse_or()
    }

    fn parse_or(&mut self) -> Option<Expr> {
        let mut left = self.parse_and()?;
        while self.eat_op("||") {
            let right = self.parse_and()?;
            left = Expr::Or(Box::new(left), Box::new(right));
        }
        Some(left)
    }

    fn parse_and(&mut self) -> Option<Expr> {
        let mut left = self.parse_equality()?;
        while self.eat_op("&&") {
            let right = self.parse_equality()?;
            left = Expr::And(Box::new(left), Box::new(right));
        }
        Some(left)
    }

    fn parse_equality(&mut self) -> Option<Expr> {
        let mut left = self.parse_relational()?;
        loop {
            if self.eat_op("==") {
                let right = self.parse_relational()?;
                left = Expr::Binary(BinOp::Eq, Box::new(left), Box::new(right));
            } else if self.eat_op("!=") {
                let right = self.parse_relational()?;
                left = Expr::Binary(BinOp::Neq, Box::new(left), Box::new(right));
            } else {
                return Some(left);
            }
        }
    }

    fn parse_relational(&mut self) -> Option<Expr> {
        let mut left = self.parse_additive()?;
        loop {
            let op = if self.eat_op("<=") {
                BinOp::Lte
            } else if self.eat_op(">=") {
                BinOp::Gte
            } else if self.eat_op("<") {
                BinOp::Lt
            } else if self.eat_op(">") {
                BinOp::Gt
            } else {
                return Some(left);
            };
            let right = self.parse_additive()?;
            left = Expr::Binary(op, Box::new(left), Box::new(right));
        }
    }

    fn parse_additive(&mut self) -> Option<Expr> {
        let mut left = self.parse_multiplicative()?;
        loop {
            let op = if self.eat_op("+") {
                BinOp::Add
            } else if self.eat_op("-") {
                BinOp::Sub
            } else {
                return Some(left);
            };
            let right = self.parse_multiplicative()?;
            left = Expr::Binary(op, Box::new(left), Box::new(right));
        }
    }

    fn parse_multiplicative(&mut self) -> Option<Expr> {
        let mut left = self.parse_unary()?;
        loop {
            let op = if self.eat_op("*") {
                BinOp::Mul
            } else if self.eat_op("/") {
                BinOp::Div
            } else if self.eat_op("%") {
                BinOp::Rem
            } else {
                return Some(left);
            };
            let right = self.parse_unary()?;
            left = Expr::Binary(op, Box::new(left), Box::new(right));
        }
    }

    fn parse_unary(&mut self) -> Option<Expr> {
        if self.eat_op("-") {
            return Some(Expr::Unary('-', Box::new(self.parse_unary()?)));
        }
        if self.eat_op("+") {
            return self.parse_unary();
        }
        if self.eat_op("!") {
            return Some(Expr::Unary('!', Box::new(self.parse_unary()?)));
        }
        self.parse_primary()
    }

    fn parse_primary(&mut self) -> Option<Expr> {
        match self.peek().cloned() {
            Some(Token::Number(value)) => {
                self.position += 1;
                Some(Expr::Number(value))
            }
            Some(Token::Ident(name)) => {
                self.position += 1;
                if self.peek() == Some(&Token::LParen) {
                    self.position += 1;
                    let mut args = Vec::new();
                    if self.peek() == Some(&Token::RParen) {
                        self.position += 1;
                    } else {
                        loop {
                            args.push(self.parse_expression()?);
                            if self.peek() == Some(&Token::Comma) {
                                self.position += 1;
                                continue;
                            }
                            if self.peek() == Some(&Token::RParen) {
                                self.position += 1;
                                break;
                            }
                            return None;
                        }
                    }
                    return Some(Expr::Call(name, args));
                }
                Some(Expr::Ident(name))
            }
            Some(Token::LParen) => {
                self.position += 1;
                let inner = self.parse_expression()?;
                if self.peek() == Some(&Token::RParen) {
                    self.position += 1;
                    Some(inner)
                } else {
                    None
                }
            }
            _ => None,
        }
    }
}

fn compile_expression(eqn: &str) -> Option<Rc<Expr>> {
    if let Some(cached) = EXPRESSION_CACHE.with(|cache| cache.borrow().get(eqn).cloned()) {
        return cached;
    }

    let compiled = compile_expression_uncached(eqn);
    EXPRESSION_CACHE.with(|cache| {
        let mut cache = cache.borrow_mut();
        if !cache.contains_key(eqn) && cache.len() >= MAX_EXPRESSION_CACHE_SIZE {
            if let Some(oldest) = cache.keys().next().cloned() {
                cache.remove(&oldest);
            }
        }
        cache.insert(eqn.to_string(), compiled.clone());
    });
    compiled
}

fn compile_expression_uncached(eqn: &str) -> Option<Rc<Expr>> {
    if eqn.is_empty() || eqn.len() > MAX_EXPRESSION_LENGTH {
        return None;
    }
    if !allowed_expression_chars(eqn) {
        return None;
    }

    let normalized = replace_word(eqn, "and", "&&");
    let normalized = replace_word(&normalized, "or", "||");
    let normalized = normalized.replace("{rng}", "0.5");

    if contains_blocked_keyword(&normalized) {
        return None;
    }
    if contains_assignment(&normalized) {
        return None;
    }

    let tokens = tokenize(&normalized)?;
    let mut parser = Parser {
        tokens,
        position: 0,
    };
    let expr = parser.parse_expression()?;
    if parser.position != parser.tokens.len() {
        return None;
    }
    Some(Rc::new(expr))
}

fn truthy(value: f64) -> bool {
    value != 0.0 && !value.is_nan()
}

fn js_round(value: f64) -> f64 {
    // JavaScript `Math.round` breaks ties toward +Infinity, which differs from
    // Rust's `f64::round` for negative halves (-0.5 -> 0 vs -1).
    (value + 0.5).floor()
}

fn eval_expr(expr: &Expr, variables: &Variables) -> f64 {
    match expr {
        Expr::Number(value) => *value,
        Expr::Ident(name) => match name.as_str() {
            // `Math` helpers are injected into the evaluation scope by
            // `evalExpression`; referencing one without calling it yields a
            // function object, which coerces to NaN -> 0 downstream.
            "floor" | "ceil" | "round" | "min" | "max" | "abs" => 0.0,
            _ => get_variable_value(variables, name),
        },
        Expr::Unary(op, inner) => {
            let value = eval_expr(inner, variables);
            match op {
                '-' => -value,
                '!' => {
                    if truthy(value) {
                        0.0
                    } else {
                        1.0
                    }
                }
                _ => value,
            }
        }
        Expr::Binary(op, left, right) => {
            let a = eval_expr(left, variables);
            let b = eval_expr(right, variables);
            match op {
                BinOp::Add => a + b,
                BinOp::Sub => a - b,
                BinOp::Mul => a * b,
                BinOp::Div => a / b,
                BinOp::Rem => a % b,
                BinOp::Lt => bool_value(a < b),
                BinOp::Lte => bool_value(a <= b),
                BinOp::Gt => bool_value(a > b),
                BinOp::Gte => bool_value(a >= b),
                BinOp::Eq => bool_value(a == b),
                BinOp::Neq => bool_value(a != b),
            }
        }
        Expr::And(left, right) => {
            let a = eval_expr(left, variables);
            if truthy(a) {
                eval_expr(right, variables)
            } else {
                a
            }
        }
        Expr::Or(left, right) => {
            let a = eval_expr(left, variables);
            if truthy(a) {
                a
            } else {
                eval_expr(right, variables)
            }
        }
        Expr::Call(name, args) => {
            let values: Vec<f64> = args.iter().map(|arg| eval_expr(arg, variables)).collect();
            match name.as_str() {
                "floor" => values.first().copied().unwrap_or(f64::NAN).floor(),
                "ceil" => values.first().copied().unwrap_or(f64::NAN).ceil(),
                "round" => js_round(values.first().copied().unwrap_or(f64::NAN)),
                "abs" => values.first().copied().unwrap_or(f64::NAN).abs(),
                "min" => values.iter().copied().fold(f64::INFINITY, f64::min),
                "max" => values.iter().copied().fold(f64::NEG_INFINITY, f64::max),
                // Calling a non-function throws in JavaScript, and
                // `evalExpression` swallows that into 0.
                _ => f64::NAN,
            }
        }
    }
}

fn bool_value(value: bool) -> f64 {
    if value {
        1.0
    } else {
        0.0
    }
}

/// Look up a scaling variable the way `getVariableValue` does: exact key, then
/// the lowercase spelling, then the normalized spelling, then 0.
pub fn get_variable_value(variables: &Variables, key: &str) -> f64 {
    if key.is_empty() {
        return 0.0;
    }
    if let Some(value) = variables.get(key) {
        return *value;
    }
    let lower = key.to_lowercase();
    if let Some(value) = variables.get(&lower) {
        return *value;
    }
    let normalized = normalize_identifier(key);
    if let Some(value) = variables.get(&normalized) {
        return *value;
    }
    0.0
}

/// Mirrors `evalExpression`: an empty formula is 1, an unusable formula is 0.
pub fn eval_expression(eqn: &str, variables: &Variables) -> f64 {
    if eqn.is_empty() {
        return 1.0;
    }
    let Some(compiled) = compile_expression(eqn) else {
        return 0.0;
    };
    let result = eval_expr(&compiled, variables);
    if result.is_finite() {
        result
    } else {
        0.0
    }
}

/// JavaScript `Number(value.toFixed(2))`.
fn to_fixed_2(value: f64) -> f64 {
    // `toFixed` rounds half away from zero on the exact binary value, which is
    // what `f64::round` does; scaling by 100 reproduces the same decision.
    (value * 100.0).round() / 100.0
}

/// Mirrors `evaluateScaling` in `src/optimizer/gameTypes.ts`, including its
/// magnitude-dependent rounding.
pub fn evaluate_scaling(
    scaling: Option<&Scaling>,
    variables: &Variables,
    default_value: f64,
) -> f64 {
    let Some(scaling) = scaling else {
        return default_value;
    };

    let mut result = scaling.value;

    if let Some(stat) = &scaling.stat {
        result *= get_variable_value(variables, stat);
    }
    if let Some(name) = &scaling.scaling {
        result *= get_variable_value(variables, name);
    }
    if let Some(eqn) = &scaling.eqn {
        result *= eval_expression(eqn, variables);
    }
    if let Some(custom) = &scaling.custom_scaling {
        let scale_value = get_variable_value(variables, &custom.scaling);
        result *= 1.0 + custom.multiplier * scale_value;
    }
    if let Some(eqn) = &scaling.additive_eqn {
        result += eval_expression(eqn, variables);
    }

    if result > 10.0 {
        result = result.floor();
    } else if result < -10.0 {
        result = result.ceil();
    } else {
        result = to_fixed_2(result);
        if result % 1.0 == 0.0 {
            result = result.floor();
        }
    }

    if let Some(max) = &scaling.max {
        let max_value = evaluate_scaling(Some(max), variables, f64::INFINITY);
        result = if max_value < 0.0 {
            result.max(max_value)
        } else {
            result.min(max_value)
        };
    }

    if scaling.divide_by_stance_length {
        result = result.floor();
    }

    result
}

fn apply_upgrades_to_scaling(scaling: &Scaling, upgrades: &UpgradeMap) -> Scaling {
    let mut upgraded = scaling.clone();
    if let Some(key) = scaling
        .upgrade_key
        .as_ref()
        .map(|key| key.trim().to_string())
    {
        if let Some(rule) = upgrades.get(&key) {
            let candidate = (upgraded.value + rule.additive) * rule.multiplier;
            if candidate.is_finite() {
                upgraded.value = candidate;
            }
        }
    }
    if let Some(max) = &scaling.max {
        upgraded.max = Some(Box::new(apply_upgrades_to_scaling(max, upgrades)));
    }
    upgraded
}

/// `evaluateScalingWithMasteryUpgrades`.
pub fn evaluate_scaling_with_upgrades(
    scaling: Option<&Scaling>,
    upgrades: &UpgradeMap,
    variables: &Variables,
    default_value: f64,
) -> f64 {
    match scaling {
        None => default_value,
        Some(scaling) if upgrades.is_empty() => {
            evaluate_scaling(Some(scaling), variables, default_value)
        }
        Some(scaling) => {
            let upgraded = apply_upgrades_to_scaling(scaling, upgrades);
            evaluate_scaling(Some(&upgraded), variables, default_value)
        }
    }
}

// ---------------------------------------------------------------------------
// Progress bonus helpers
// ---------------------------------------------------------------------------

pub struct BonusProgress {
    pub guaranteed: i32,
    pub bonus_chance: f64,
}

/// `getBonusAndChance`.
pub fn bonus_and_chance(value: f64, target: f64) -> BonusProgress {
    if target <= 0.0 {
        return BonusProgress {
            guaranteed: 0,
            bonus_chance: 0.0,
        };
    }
    let mut current_target = target;
    let mut remaining = value;
    let mut guaranteed = 0;
    while remaining > 0.0 && current_target > 0.0 && remaining >= current_target {
        remaining -= current_target;
        guaranteed += 1;
        current_target = (current_target * crate::EXPONENTIAL_SCALING_FACTOR).floor();
    }
    BonusProgress {
        guaranteed,
        bonus_chance: if current_target > 0.0 {
            remaining / current_target
        } else {
            0.0
        },
    }
}

// ---------------------------------------------------------------------------
// Condition evaluation
// ---------------------------------------------------------------------------

pub struct ConditionEvaluation {
    pub met: bool,
    pub probability: f64,
}

const MET: ConditionEvaluation = ConditionEvaluation {
    met: true,
    probability: 1.0,
};

fn hard_condition(met: bool) -> ConditionEvaluation {
    ConditionEvaluation {
        met,
        probability: if met { 1.0 } else { 0.0 },
    }
}

fn percentage_check(value: f64, denominator: f64, mode: &Option<String>, threshold: f64) -> bool {
    let percentage = if denominator > 0.0 {
        (value / denominator) * 100.0
    } else {
        0.0
    };
    if mode.as_deref() == Some("more") {
        percentage >= threshold
    } else {
        percentage < threshold
    }
}

/// Mirrors `evaluateEffectCondition`.
pub fn evaluate_effect_condition(
    condition: Option<&EffectCondition>,
    state: &EngineState,
    variables: &Variables,
    self_stacks: i32,
) -> ConditionEvaluation {
    let Some(condition) = condition else {
        return MET;
    };

    match condition.kind.as_str() {
        "buff" => {
            let is_self = matches!(&condition.buff, Some(ConditionBuffRef::SelfRef(value)) if value == "self");
            let count = if is_self {
                self_stacks as f64
            } else {
                let key = match &condition.buff {
                    Some(ConditionBuffRef::Named { name }) => {
                        normalize_identifier(name.as_deref().unwrap_or(""))
                    }
                    _ => String::new(),
                };
                state.buff_stacks(&key) as f64
            };
            let met = match condition.mode.as_deref() {
                Some("more") => count >= condition.count,
                Some("less") => count < condition.count,
                _ => count == condition.count,
            };
            hard_condition(met)
        }
        "pool" => hard_condition(percentage_check(
            get_variable_value(variables, "pool"),
            get_variable_value(variables, "maxpool"),
            &condition.mode,
            condition.percentage,
        )),
        "perfection" => hard_condition(percentage_check(
            get_variable_value(variables, "perfection"),
            get_variable_value(variables, "maxperfection").max(1.0),
            &condition.mode,
            condition.percentage,
        )),
        "stability" => hard_condition(percentage_check(
            get_variable_value(variables, "stability"),
            get_variable_value(variables, "maxstability").max(1.0),
            &condition.mode,
            condition.percentage,
        )),
        "completion" => hard_condition(percentage_check(
            get_variable_value(variables, "completion"),
            get_variable_value(variables, "maxcompletion").max(1.0),
            &condition.mode,
            condition.percentage,
        )),
        "toxicity" => hard_condition(percentage_check(
            get_variable_value(variables, "toxicity"),
            get_variable_value(variables, "maxtoxicity").max(1.0),
            &condition.mode,
            condition.percentage,
        )),
        "condition" => {
            let mut scoped = variables.clone();
            scoped.insert("stacks".to_string(), self_stacks as f64);
            let scaling = Scaling {
                value: 1.0,
                eqn: condition.condition.clone(),
                ..Scaling::default()
            };
            hard_condition(evaluate_scaling(Some(&scaling), &scoped, 0.0) > 0.0)
        }
        "chance" => {
            let probability = (condition.percentage / 100.0).clamp(0.0, 1.0);
            ConditionEvaluation {
                met: probability > 0.0,
                probability,
            }
        }
        _ => MET,
    }
}

// ---------------------------------------------------------------------------
// Scaling variable construction
// ---------------------------------------------------------------------------

fn insert_progress_percentages(
    variables: &mut Variables,
    completion: &BonusProgress,
    perfection: &BonusProgress,
) {
    let completion_percentage = ((completion.guaranteed as f64 + completion.bonus_chance) * 100.0)
        .floor()
        .max(0.0);
    let perfection_percentage = ((perfection.guaranteed as f64 + perfection.bonus_chance) * 100.0)
        .floor()
        .max(0.0);
    variables.insert("completionPercentage".to_string(), completion_percentage);
    variables.insert("perfectionPercentage".to_string(), perfection_percentage);
    variables.insert("completionpercentage".to_string(), completion_percentage);
    variables.insert("perfectionpercentage".to_string(), perfection_percentage);
}

/// Mirrors `buildTechniqueScalingBase` + the derived-alias pass.
pub fn build_technique_scaling_base(
    state: &EngineState,
    config: &EngineConfig,
    active_buffs: &[ActiveBuff],
) -> Variables {
    let completion_target = config.target_completion.max(0.0);
    let perfection_target = config.target_perfection.max(0.0);
    let completion_info = if completion_target > 0.0 {
        bonus_and_chance(state.completion, completion_target)
    } else {
        BonusProgress {
            guaranteed: 0,
            bonus_chance: 0.0,
        }
    };
    let perfection_info = if perfection_target > 0.0 {
        bonus_and_chance(state.perfection, perfection_target)
    } else {
        BonusProgress {
            guaranteed: 0,
            bonus_chance: 0.0,
        }
    };

    let mut variables: Variables = HashMap::new();
    variables.insert("control".to_string(), 0.0);
    variables.insert("intensity".to_string(), 0.0);
    variables.insert("critchance".to_string(), 0.0);
    variables.insert("critmultiplier".to_string(), 0.0);
    variables.insert("pool".to_string(), state.qi);
    variables.insert("maxpool".to_string(), config.max_qi);
    variables.insert("toxicity".to_string(), state.toxicity);
    variables.insert("maxtoxicity".to_string(), state.max_toxicity);
    variables.insert("resistance".to_string(), 0.0);
    variables.insert("itemEffectiveness".to_string(), 100.0);
    variables.insert("pillsPerRound".to_string(), config.pills_per_round.max(1.0));
    variables.insert(
        "poolCostFlat".to_string(),
        state.pool_cost_flat.floor().max(0.0),
    );
    variables.insert(
        "poolCostPercentage".to_string(),
        normalize_cost_percentage(state.pool_cost_percentage),
    );
    variables.insert(
        "stabilityCostPercentage".to_string(),
        normalize_cost_percentage(state.stability_cost_percentage),
    );
    variables.insert("successChanceBonus".to_string(), state.success_chance_bonus);
    variables.insert("stacks".to_string(), 0.0);
    variables.insert("completion".to_string(), state.completion);
    variables.insert("perfection".to_string(), state.perfection);
    insert_progress_percentages(&mut variables, &completion_info, &perfection_info);
    variables.insert("stability".to_string(), state.stability);
    variables.insert("maxcompletion".to_string(), completion_target);
    variables.insert("maxperfection".to_string(), perfection_target);
    variables.insert("maxstability".to_string(), state.initial_max_stability);
    variables.insert("stabilitypenalty".to_string(), state.stability_penalty);

    for buff in active_buffs {
        variables.insert(buff.key.clone(), buff.stacks as f64);
        let normalized = normalize_identifier(&buff.key);
        variables.entry(normalized).or_insert(buff.stacks as f64);
    }

    apply_derived_harmony_aliases(&mut variables, state);

    variables
}

/// Mirrors `applyDerivedNativeVariableAliases` for the harmony half; the buff
/// half is already covered by the loop above.
fn apply_derived_harmony_aliases(variables: &mut Variables, state: &EngineState) {
    if let Some(forge) = state.harmony_data.forge_works.as_ref() {
        let heat = (forge.heat as f64).clamp(0.0, 10.0).floor();
        variables.insert("Heat".to_string(), heat);
        variables.insert("heat".to_string(), heat);
    }
    for (key, value) in &state.harmony_data.additional_data {
        if !value.is_finite() {
            continue;
        }
        variables.entry(key.clone()).or_insert(*value);
        let normalized = normalize_identifier(key);
        if !normalized.is_empty() {
            variables.entry(normalized).or_insert(*value);
        }
    }
}

/// Mirrors `applyBuffStatContributions`.
pub fn apply_buff_stat_contributions(
    state: &EngineState,
    variables: &Variables,
    upgrades: &UpgradeMap,
    active_buffs: &[ActiveBuff],
) -> Variables {
    let has_explicit_control = active_buffs.iter().any(|buff| {
        buff.definition
            .as_ref()
            .and_then(|definition| definition.stats.as_ref())
            .is_some_and(|stats| stats.contains_key("control"))
    });
    let has_explicit_intensity = active_buffs.iter().any(|buff| {
        buff.definition
            .as_ref()
            .and_then(|definition| definition.stats.as_ref())
            .is_some_and(|stats| stats.contains_key("intensity"))
    });

    let mut adjusted = variables.clone();
    if state.control_buff_turns > 0 && !has_explicit_control {
        let control = get_variable_value(variables, "control") * state.control_buff_multiplier;
        adjusted.insert("control".to_string(), control);
    }
    if state.intensity_buff_turns > 0 && !has_explicit_intensity {
        let intensity =
            get_variable_value(variables, "intensity") * state.intensity_buff_multiplier;
        adjusted.insert("intensity".to_string(), intensity);
    }

    for buff in active_buffs {
        let Some(definition) = buff.definition.as_ref() else {
            continue;
        };
        let Some(stats) = definition.stats.as_ref() else {
            continue;
        };

        let mut eval_vars = variables.clone();
        eval_vars.insert("stacks".to_string(), buff.stacks as f64);
        let normalized_key = normalize_identifier(if !definition.name.is_empty() {
            &definition.name
        } else if !buff.name.is_empty() {
            &buff.name
        } else {
            &buff.key
        });
        if !normalized_key.is_empty() {
            eval_vars.insert(normalized_key, buff.stacks as f64);
        }
        eval_vars.insert(buff.key.clone(), buff.stacks as f64);

        for (stat_key, scaling) in stats {
            let raw = evaluate_scaling_with_upgrades(Some(scaling), upgrades, &eval_vars, 0.0);
            match stat_key.as_str() {
                "poolCostPercentage" => {
                    let current = get_variable_value(&adjusted, "poolCostPercentage");
                    adjusted.insert(
                        "poolCostPercentage".to_string(),
                        ((current / 100.0) * (raw / 100.0) * 100.0).floor(),
                    );
                }
                "stabilityCostPercentage" => {
                    let current = get_variable_value(&adjusted, "stabilityCostPercentage");
                    adjusted.insert(
                        "stabilityCostPercentage".to_string(),
                        ((current / 100.0) * (raw / 100.0) * 100.0).floor(),
                    );
                }
                _ => {
                    // The TypeScript version only touches keys that already hold
                    // a finite number, so unknown stat names are ignored.
                    if let Some(current) = adjusted.get(stat_key).copied() {
                        if current.is_finite() {
                            adjusted.insert(stat_key.clone(), current + raw);
                        }
                    }
                }
            }
        }
    }

    adjusted
}

/// Mirrors `applyConditionEffectsToVariables`, expressed against the summarized
/// condition effects the bridge already sends.
pub fn apply_condition_effects_to_variables(
    variables: &Variables,
    effects: crate::ConditionEffectSummary,
) -> Variables {
    let mut adjusted = variables.clone();
    let control = get_variable_value(variables, "control") * effects.control_multiplier;
    let intensity = get_variable_value(variables, "intensity") * effects.intensity_multiplier;
    let success =
        get_variable_value(variables, "successChanceBonus") + effects.success_chance_bonus;
    let pool = (normalize_cost_percentage(get_variable_value(variables, "poolCostPercentage"))
        * effects.pool_cost_multiplier)
        .floor();
    let stability =
        (normalize_cost_percentage(get_variable_value(variables, "stabilityCostPercentage"))
            * effects.stability_cost_multiplier)
            .floor();
    adjusted.insert("control".to_string(), control);
    adjusted.insert("intensity".to_string(), intensity);
    adjusted.insert("successChanceBonus".to_string(), success);
    adjusted.insert("poolCostPercentage".to_string(), pool);
    adjusted.insert("stabilityCostPercentage".to_string(), stability);
    adjusted
}

/// Mirrors `resolveMasteryBonuses`.
pub fn resolve_mastery_bonuses(
    state: &EngineState,
    skill: &EngineSkill,
    variables: &Variables,
) -> (MasteryBonuses, UpgradeMap) {
    if skill.mastery_entries.is_empty() {
        return (skill.mastery, UpgradeMap::new());
    }

    let mut bonuses = MasteryBonuses::default();
    let mut upgrades = UpgradeMap::new();

    for entry in &skill.mastery_entries {
        let evaluation = evaluate_effect_condition(entry.condition.as_ref(), state, variables, 0);
        if !evaluation.met || evaluation.probability <= 0.0 {
            continue;
        }
        let factor = evaluation.probability;

        match entry.kind.as_str() {
            "control" => bonuses.control_bonus += (entry.percentage / 100.0) * factor,
            "intensity" => bonuses.intensity_bonus += (entry.percentage / 100.0) * factor,
            "critchance" => bonuses.crit_chance_bonus += entry.percentage * factor,
            "critmultiplier" => bonuses.crit_multiplier_bonus += entry.percentage * factor,
            "upgrade" => {
                let key = entry
                    .upgrade_key
                    .as_deref()
                    .unwrap_or("")
                    .trim()
                    .to_string();
                if key.is_empty() {
                    continue;
                }
                if !entry.change.is_finite() || entry.change == 0.0 {
                    continue;
                }
                let rule = upgrades.entry(key).or_insert(UpgradeRule {
                    additive: 0.0,
                    multiplier: 1.0,
                });
                if entry.should_multiply {
                    let multiplier = 1.0 + entry.change;
                    if multiplier.is_finite() && multiplier != 0.0 {
                        rule.multiplier *= multiplier;
                    }
                } else {
                    rule.additive += entry.change;
                }
            }
            _ => {}
        }
    }

    (bonuses, upgrades)
}

/// Mirrors `buildPreMasteryActionVariables`.
pub fn build_pre_mastery_action_variables(
    state: &EngineState,
    config: &EngineConfig,
    active_buffs: &[ActiveBuff],
    condition_effects: crate::ConditionEffectSummary,
    harmony: crate::HarmonyStatModifiers,
    upgrades: &UpgradeMap,
) -> Variables {
    let mut base = build_technique_scaling_base(state, config, active_buffs);
    base.insert(
        "control".to_string(),
        config.base_control * (1.0 + state.completion_bonus as f64 * 0.1),
    );
    base.insert("intensity".to_string(), config.base_intensity);
    base.insert("critchance".to_string(), state.crit_chance);
    base.insert("critmultiplier".to_string(), state.crit_multiplier);

    let with_buffs = apply_buff_stat_contributions(state, &base, upgrades, active_buffs);
    let mut with_conditions = apply_condition_effects_to_variables(&with_buffs, condition_effects);

    let control = get_variable_value(&with_conditions, "control") * harmony.control_multiplier;
    let intensity =
        get_variable_value(&with_conditions, "intensity") * harmony.intensity_multiplier;
    let critchance = get_variable_value(&with_conditions, "critchance") + harmony.crit_chance_bonus;
    let success =
        get_variable_value(&with_conditions, "successChanceBonus") + harmony.success_chance_bonus;
    let pool = ((get_variable_value(&with_conditions, "poolCostPercentage") / 100.0)
        * (harmony.pool_cost_percentage / 100.0)
        * 100.0)
        .floor();
    let stability = ((get_variable_value(&with_conditions, "stabilityCostPercentage") / 100.0)
        * (harmony.stability_cost_percentage / 100.0)
        * 100.0)
        .floor();
    with_conditions.insert("control".to_string(), control);
    with_conditions.insert("intensity".to_string(), intensity);
    with_conditions.insert("critchance".to_string(), critchance);
    with_conditions.insert("successChanceBonus".to_string(), success);
    with_conditions.insert("poolCostPercentage".to_string(), pool);
    with_conditions.insert("stabilityCostPercentage".to_string(), stability);
    with_conditions
}

/// `getEffectiveMaxPool`.
pub fn effective_max_pool(
    state: &EngineState,
    config: &EngineConfig,
    active_buffs: &[ActiveBuff],
) -> f64 {
    let mut base = build_technique_scaling_base(state, config, active_buffs);
    base.insert(
        "control".to_string(),
        config.base_control * (1.0 + state.completion_bonus as f64 * 0.1),
    );
    base.insert("intensity".to_string(), config.base_intensity);
    base.insert("critchance".to_string(), state.crit_chance);
    base.insert("critmultiplier".to_string(), state.crit_multiplier);
    let buffed = apply_buff_stat_contributions(state, &base, &UpgradeMap::new(), active_buffs);
    let maxpool = get_variable_value(&buffed, "maxpool");
    if maxpool.is_finite() {
        maxpool.max(1.0)
    } else {
        config.max_qi.max(1.0)
    }
}

// ---------------------------------------------------------------------------
// Resolved active buffs
// ---------------------------------------------------------------------------

/// Mirrors `resolveActiveBuffs`: fills in missing definitions from the skill
/// set and drops the derived Forge Heat buff, whose contribution the harmony
/// state machine already applies.
pub fn resolve_active_buffs(
    state: &EngineState,
    config: &EngineConfig,
    skills: &[EngineSkill],
) -> Vec<ActiveBuff> {
    let mut resolved: Vec<ActiveBuff> = Vec::with_capacity(state.buffs.len());
    let needs_lookup = state.buffs.iter().any(|buff| buff.definition.is_none());
    let lookup = if needs_lookup {
        build_buff_definition_lookup(skills)
    } else {
        HashMap::new()
    };

    let strip_forge_heat = config.crafting_type.as_deref() == Some("forge")
        && state.harmony_data.forge_works.is_some();

    for buff in &state.buffs {
        let mut entry = buff.clone();
        if entry.definition.is_none() && !lookup.is_empty() {
            let normalized_name = normalize_identifier(if !entry.name.is_empty() {
                &entry.name
            } else {
                &entry.key
            });
            if let Some(definition) = lookup
                .get(&normalized_name)
                .or_else(|| lookup.get(&entry.key))
            {
                entry.definition = Some(definition.clone());
            }
        }
        if strip_forge_heat {
            let key_is_heat = normalize_identifier(&entry.key) == "heat";
            let name_is_heat = normalize_identifier(if !entry.name.is_empty() {
                &entry.name
            } else {
                &entry.key
            }) == "heat";
            if key_is_heat || name_is_heat {
                continue;
            }
        }
        resolved.push(entry);
    }

    resolved
}

fn build_buff_definition_lookup(skills: &[EngineSkill]) -> HashMap<String, BuffDefinition> {
    let mut lookup: HashMap<String, BuffDefinition> = HashMap::new();
    let add = |definition: Option<&BuffDefinition>,
               lookup: &mut HashMap<String, BuffDefinition>| {
        let Some(definition) = definition else { return };
        if definition.name.is_empty() {
            return;
        }
        let key = normalize_identifier(&definition.name);
        if key.is_empty() || lookup.contains_key(&key) {
            return;
        }
        lookup.insert(key, definition.clone());
    };
    for skill in skills {
        add(skill.granted_buff.as_ref(), &mut lookup);
        for effect in &skill.effects {
            if effect.kind == "createBuff" {
                add(effect.buff.as_ref(), &mut lookup);
            }
        }
    }
    lookup
}

// ---------------------------------------------------------------------------
// Turbid Qi
// ---------------------------------------------------------------------------

const TURBID_QI_FIRST_STEP: i32 = 100;
const TURBID_QI_STEP_INTERVAL: i32 = 3;
const TURBID_QI_BUFF_KEY: &str = "turbid_qi";

pub fn grants_turbid_qi_stack(next_step: i32) -> bool {
    next_step >= TURBID_QI_FIRST_STEP && next_step % TURBID_QI_STEP_INTERVAL == 0
}

pub fn find_turbid_qi_buff_key(buffs: &[ActiveBuff]) -> Option<String> {
    let mut fallback: Option<String> = None;
    for buff in buffs {
        let Some(definition) = buff.definition.as_ref() else {
            continue;
        };
        let flat_scales_with_stacks = definition
            .stats
            .as_ref()
            .and_then(|stats| stats.get("poolCostFlat"))
            .and_then(|scaling| scaling.scaling.as_deref())
            == Some("stacks");
        if flat_scales_with_stacks {
            return Some(buff.key.clone());
        }
        let normalized = normalize_identifier(if !buff.name.is_empty() {
            &buff.name
        } else {
            &buff.key
        });
        if normalized == TURBID_QI_BUFF_KEY {
            fallback = Some(buff.key.clone());
        }
    }
    fallback
}

// ---------------------------------------------------------------------------
// Buff collection mutation
// ---------------------------------------------------------------------------

/// Insertion-ordered buff collection, mirroring the JavaScript `Map` the
/// TypeScript simulator threads through `applySkill`.
pub struct BuffSet {
    entries: Vec<ActiveBuff>,
}

impl BuffSet {
    pub fn new(entries: Vec<ActiveBuff>) -> Self {
        Self { entries }
    }

    pub fn into_vec(self) -> Vec<ActiveBuff> {
        self.entries
    }

    pub fn as_slice(&self) -> &[ActiveBuff] {
        &self.entries
    }

    fn index_of(&self, key: &str) -> Option<usize> {
        self.entries.iter().position(|buff| buff.key == key)
    }

    pub fn stacks(&self, key: &str) -> i32 {
        self.index_of(key)
            .map(|index| self.entries[index].stacks)
            .unwrap_or(0)
    }

    pub fn remove(&mut self, key: &str) {
        if let Some(index) = self.index_of(key) {
            self.entries.remove(index);
        }
    }

    pub fn set_stacks(&mut self, key: &str, stacks: i32) {
        if let Some(index) = self.index_of(key) {
            if stacks > 0 {
                self.entries[index].stacks = stacks;
            } else {
                self.entries.remove(index);
            }
        }
    }

    /// Mirrors `upsertBuffFromDefinition`.
    pub fn upsert_from_definition(
        &mut self,
        definition: Option<&BuffDefinition>,
        stacks_delta: f64,
    ) {
        let Some(definition) = definition else { return };
        if !stacks_delta.is_finite() {
            return;
        }
        let delta = stacks_delta.floor() as i32;
        if delta == 0 {
            return;
        }
        let buff_key = normalize_identifier(&definition.name);
        if buff_key.is_empty() {
            return;
        }

        if let Some(index) = self.index_of(&buff_key) {
            let existing_can_stack = self.entries[index]
                .definition
                .as_ref()
                .and_then(|existing| existing.can_stack);
            let can_stack = definition.can_stack.or(existing_can_stack).unwrap_or(true);
            if !can_stack {
                return;
            }
            let max_stacks = definition.max_stacks.or_else(|| {
                self.entries[index]
                    .definition
                    .as_ref()
                    .and_then(|existing| existing.max_stacks)
            });
            let mut next = self.entries[index].stacks + delta;
            if let Some(max) = max_stacks {
                next = next.min(max.floor() as i32);
            }
            if next > 0 {
                if self.entries[index].definition.is_none() {
                    self.entries[index].definition = Some(definition.clone());
                }
                self.entries[index].stacks = next;
            } else {
                self.entries.remove(index);
            }
            return;
        }

        if delta > 0 {
            let mut next = delta;
            if let Some(max) = definition.max_stacks {
                next = next.min(max.floor() as i32);
            }
            self.entries.push(ActiveBuff {
                key: buff_key.clone(),
                name: buff_key,
                stacks: next,
                definition: Some(definition.clone()),
            });
        }
    }

    /// Mirrors `adjustExistingBuffStacks`.
    pub fn adjust_existing(&mut self, key: &str, stacks_delta: f64) {
        let Some(index) = self.index_of(key) else {
            return;
        };
        if !stacks_delta.is_finite() {
            return;
        }
        let delta = stacks_delta.floor() as i32;
        if delta == 0 {
            return;
        }
        let mut next = self.entries[index].stacks + delta;
        if let Some(max) = self.entries[index]
            .definition
            .as_ref()
            .and_then(|definition| definition.max_stacks)
        {
            next = next.min(max.floor() as i32);
        }
        if next > 0 {
            self.entries[index].stacks = next;
        } else {
            self.entries.remove(index);
        }
    }
}

// ---------------------------------------------------------------------------
// Cost and gain calculation
// ---------------------------------------------------------------------------

pub struct EffectiveActionCosts {
    pub qi_cost: f64,
    pub stability_cost: f64,
}

/// `getEffectiveQiCost`.
pub fn effective_qi_cost(skill: &EngineSkill) -> f64 {
    let reduction = skill.mastery.pool_cost_reduction;
    if reduction.abs() <= 1.0 {
        (skill.qi_cost * (1.0 - reduction)).ceil().max(0.0)
    } else {
        (skill.qi_cost - reduction).max(0.0)
    }
}

/// `getEffectiveStabilityCost`.
pub fn effective_stability_cost(skill: &EngineSkill) -> f64 {
    let reduction = skill.mastery.stability_cost_reduction;
    if reduction.abs() <= 1.0 {
        (skill.stability_cost * (1.0 - reduction)).ceil().max(0.0)
    } else {
        (skill.stability_cost - reduction).max(0.0)
    }
}

pub struct SkillGains {
    pub completion: f64,
    pub perfection: f64,
    pub stability: f64,
    pub toxicity_cleanse: f64,
}

fn clamp_predicted_progress_gain(gain: f64, current: f64, cap: Option<f64>) -> f64 {
    let Some(cap) = cap else { return gain };
    if !cap.is_finite() || gain <= 0.0 {
        return gain;
    }
    let remaining = cap - current;
    if remaining <= 0.0 {
        return 0.0;
    }
    gain.min(remaining)
}

/// `safeFloor`: non-finite collapses to 0.
pub fn safe_floor(value: f64) -> f64 {
    if !value.is_finite() {
        return 0.0;
    }
    value.floor()
}

fn clamp(value: f64, min: f64, max: f64) -> f64 {
    if max < min {
        return min;
    }
    value.max(min).min(max)
}

/// Everything an action needs beyond the state it is applied to.
pub struct ActionEnv<'a> {
    pub config: &'a EngineConfig,
    pub skills: &'a [EngineSkill],
}

/// Pre-mastery action variables plus the mastery bonuses and upgrade rules they
/// resolved to. Mirrors the two-pass resolution in `calculateSkillGains`:
/// upgrades can change the variables the *next* condition check reads, so the
/// build/resolve pair runs twice when any upgrade rule fires.
pub struct ResolvedAction {
    pub variables: Variables,
    pub mastery: MasteryBonuses,
    pub upgrades: UpgradeMap,
}

pub fn resolve_action(
    env: &ActionEnv<'_>,
    state: &EngineState,
    skill: &EngineSkill,
    condition_effects: crate::ConditionEffectSummary,
    active_buffs: &[ActiveBuff],
) -> ResolvedAction {
    let harmony =
        crate::get_harmony_stat_modifiers(&state.harmony_data, env.config.crafting_type.as_deref());
    let mut variables = build_pre_mastery_action_variables(
        state,
        env.config,
        active_buffs,
        condition_effects,
        harmony,
        &UpgradeMap::new(),
    );
    let (mut mastery, mut upgrades) = resolve_mastery_bonuses(state, skill, &variables);
    if !upgrades.is_empty() {
        variables = build_pre_mastery_action_variables(
            state,
            env.config,
            active_buffs,
            condition_effects,
            harmony,
            &upgrades,
        );
        let resolved = resolve_mastery_bonuses(state, skill, &variables);
        mastery = resolved.0;
        upgrades = resolved.1;
    }
    ResolvedAction {
        variables,
        mastery,
        upgrades,
    }
}

/// Apply the mastery stat bonuses on top of the pre-mastery variables.
fn apply_mastery_to_variables(variables: &Variables, mastery: &MasteryBonuses) -> Variables {
    let mut adjusted = variables.clone();
    adjusted.insert(
        "control".to_string(),
        get_variable_value(variables, "control") * (1.0 + mastery.control_bonus),
    );
    adjusted.insert(
        "intensity".to_string(),
        get_variable_value(variables, "intensity") * (1.0 + mastery.intensity_bonus),
    );
    adjusted.insert(
        "critchance".to_string(),
        get_variable_value(variables, "critchance") + mastery.crit_chance_bonus,
    );
    adjusted.insert(
        "critmultiplier".to_string(),
        get_variable_value(variables, "critmultiplier") + mastery.crit_multiplier_bonus,
    );
    adjusted.insert(
        "successChanceBonus".to_string(),
        get_variable_value(variables, "successChanceBonus") + mastery.success_chance_bonus,
    );
    adjusted
}

/// Mirrors `calculateEffectiveActionCosts`, including its rounding order.
pub fn calculate_effective_action_costs(
    env: &ActionEnv<'_>,
    state: &EngineState,
    skill: &EngineSkill,
    condition_effects: crate::ConditionEffectSummary,
    active_buffs: &[ActiveBuff],
) -> EffectiveActionCosts {
    let crafting_type = env.config.crafting_type.as_deref();
    let base_harmony = crate::get_harmony_stat_modifiers(&state.harmony_data, crafting_type);
    let harmony_cost = crate::get_harmony_cost_multipliers(
        &state.harmony_data,
        crafting_type,
        &skill.technique_type,
    );
    let harmony_pool_multiplier =
        (base_harmony.pool_cost_percentage / 100.0) * (harmony_cost.pool_cost_percentage / 100.0);
    let harmony_stability_multiplier = (base_harmony.stability_cost_percentage / 100.0)
        * (harmony_cost.stability_cost_percentage / 100.0);

    let mut pool_cost_flat = state.pool_cost_flat.floor().max(0.0);
    let mut pool_cost_percentage = normalize_cost_percentage(state.pool_cost_percentage);
    let mut stability_cost_percentage = normalize_cost_percentage(state.stability_cost_percentage);

    let has_cost_affecting_buff = active_buffs.iter().any(|buff| {
        buff.definition
            .as_ref()
            .and_then(|definition| definition.stats.as_ref())
            .is_some_and(|stats| {
                stats.contains_key("poolCostFlat")
                    || stats.contains_key("poolCostPercentage")
                    || stats.contains_key("stabilityCostPercentage")
            })
    });
    if has_cost_affecting_buff {
        // The harmony multiplier is applied separately below, so the variable
        // build must see neutral harmony cost percentages.
        let neutral_harmony = crate::HarmonyStatModifiers {
            pool_cost_percentage: 100.0,
            stability_cost_percentage: 100.0,
            ..base_harmony
        };
        let runtime_vars = build_pre_mastery_action_variables(
            state,
            env.config,
            active_buffs,
            crate::ConditionEffectSummary::default(),
            neutral_harmony,
            &UpgradeMap::new(),
        );
        pool_cost_flat = get_variable_value(&runtime_vars, "poolCostFlat")
            .floor()
            .max(0.0);
        pool_cost_percentage =
            normalize_cost_percentage(get_variable_value(&runtime_vars, "poolCostPercentage"));
        stability_cost_percentage =
            normalize_cost_percentage(get_variable_value(&runtime_vars, "stabilityCostPercentage"));
    }

    pool_cost_percentage *= condition_effects.pool_cost_multiplier;
    stability_cost_percentage *= condition_effects.stability_cost_multiplier;

    let mut qi_cost = effective_qi_cost(skill);
    let mut stability_delta = -effective_stability_cost(skill);

    if pool_cost_flat > 0.0 {
        qi_cost = (qi_cost + pool_cost_flat).max(0.0);
    }
    if pool_cost_percentage != 100.0 {
        qi_cost = (qi_cost * pool_cost_percentage / 100.0).floor();
    }
    if harmony_pool_multiplier != 1.0 {
        qi_cost = (qi_cost.max(0.0) * harmony_pool_multiplier).floor();
    }

    if stability_delta < 0.0 && stability_cost_percentage != 100.0 {
        stability_delta = (stability_delta * stability_cost_percentage / 100.0).ceil();
    }
    if stability_delta < 0.0 && harmony_stability_multiplier != 1.0 {
        stability_delta = (stability_delta * harmony_stability_multiplier).floor();
    }

    EffectiveActionCosts {
        qi_cost: qi_cost.max(0.0),
        stability_cost: (-stability_delta).max(0.0),
    }
}

/// Mirrors `calculateDisciplinedTouchGains`: both halves scale off Qi Intensity
/// in 0.7.5, not control.
fn calculate_disciplined_touch_gains(
    state: &EngineState,
    skill: &EngineSkill,
    resolved: &ResolvedAction,
) -> SkillGains {
    let effective = apply_mastery_to_variables(&resolved.variables, &resolved.mastery);
    let intensity = get_variable_value(&effective, "intensity");
    let completion_gain = safe_floor(skill.base_completion_gain * intensity);
    let perfection_gain = safe_floor(skill.base_perfection_gain * intensity);
    let crit = crate::expected_crit_multiplier(
        get_variable_value(&effective, "critchance"),
        get_variable_value(&effective, "critmultiplier"),
    );
    let _ = state;
    SkillGains {
        completion: safe_floor(completion_gain * crit),
        perfection: safe_floor(perfection_gain * crit),
        stability: 0.0,
        toxicity_cleanse: 0.0,
    }
}

/// Mirrors `calculateSkillGains`, preferring the authoritative effect tree and
/// falling back to the scalar summary when a technique has no effects.
pub fn calculate_skill_gains(
    env: &ActionEnv<'_>,
    state: &EngineState,
    skill: &EngineSkill,
    resolved: &ResolvedAction,
) -> SkillGains {
    let config = env.config;

    if skill.is_disciplined_touch {
        let gains = calculate_disciplined_touch_gains(state, skill, resolved);
        return SkillGains {
            completion: safe_floor(clamp_predicted_progress_gain(
                gains.completion,
                state.completion,
                config.max_completion,
            )),
            perfection: safe_floor(clamp_predicted_progress_gain(
                gains.perfection,
                state.perfection,
                config.max_perfection,
            )),
            stability: gains.stability,
            toxicity_cleanse: gains.toxicity_cleanse,
        };
    }

    let scaling_vars = apply_mastery_to_variables(&resolved.variables, &resolved.mastery);
    let upgrades = &resolved.upgrades;

    let crit_factor = crate::expected_crit_multiplier(
        get_variable_value(&scaling_vars, "critchance"),
        get_variable_value(&scaling_vars, "critmultiplier"),
    );
    let total_success_chance = clamp(
        skill.success_chance + get_variable_value(&scaling_vars, "successChanceBonus"),
        0.0,
        1.0,
    );
    let expected_factor = total_success_chance;

    if !skill.effects.is_empty() {
        let mut completion_gain = 0.0;
        let mut perfection_gain = 0.0;
        let mut stability_gain = 0.0;
        let mut toxicity_cleanse = 0.0;

        for effect in &skill.effects {
            let evaluation =
                evaluate_effect_condition(effect.condition.as_ref(), state, &scaling_vars, 0);
            if !evaluation.met || evaluation.probability <= 0.0 {
                continue;
            }
            let condition_factor = evaluation.probability;
            let amount = evaluate_scaling_with_upgrades(
                effect.amount.as_ref(),
                upgrades,
                &scaling_vars,
                0.0,
            ) * condition_factor;

            match effect.kind.as_str() {
                "completion" => {
                    let base = effect.amount.as_ref().map(|a| a.value).unwrap_or(0.0);
                    completion_gain += if amount < 0.0 && base > 0.0 {
                        0.0
                    } else {
                        amount
                    };
                }
                "perfection" => {
                    let base = effect.amount.as_ref().map(|a| a.value).unwrap_or(0.0);
                    perfection_gain += if amount < 0.0 && base > 0.0 {
                        0.0
                    } else {
                        amount
                    };
                }
                "stability" => stability_gain += amount,
                "cleanseToxicity" => toxicity_cleanse += amount,
                _ => {}
            }
        }

        let completion_with_crit = if completion_gain > 0.0 {
            completion_gain * crit_factor
        } else {
            completion_gain
        };
        let perfection_with_crit = if perfection_gain > 0.0 {
            perfection_gain * crit_factor
        } else {
            perfection_gain
        };

        return SkillGains {
            completion: safe_floor(clamp_predicted_progress_gain(
                safe_floor(completion_with_crit * expected_factor),
                state.completion,
                config.max_completion,
            )),
            perfection: safe_floor(clamp_predicted_progress_gain(
                safe_floor(perfection_with_crit * expected_factor),
                state.perfection,
                config.max_perfection,
            )),
            stability: safe_floor(stability_gain * expected_factor),
            toxicity_cleanse: safe_floor(toxicity_cleanse * expected_factor),
        };
    }

    // Legacy scalar path, used by offline fixtures and by techniques the runtime
    // exposes without an effect tree.
    let mut completion_gain = skill.base_completion_gain;
    let mut perfection_gain = skill.base_perfection_gain;
    let mut stability_gain = skill.stability_gain;
    let mut toxicity_cleanse = skill.toxicity_cleanse;

    if let Some(buff_cost) = skill.buff_cost.as_ref() {
        if !skill.scales_with_control && !skill.scales_with_intensity {
            let have = state.buff_stacks(&buff_cost.buff_name) as f64;
            let stacks_used = if buff_cost.consume_all {
                have
            } else {
                have.min(buff_cost.amount.unwrap_or(0.0))
            };
            if stacks_used > 1.0 {
                completion_gain *= stacks_used;
                perfection_gain *= stacks_used;
                stability_gain *= stacks_used;
                toxicity_cleanse *= stacks_used;
            }
        }
    }

    let control = get_variable_value(&scaling_vars, "control");
    let intensity = get_variable_value(&scaling_vars, "intensity");
    if skill.scales_with_control {
        perfection_gain = safe_floor(skill.base_perfection_gain * control);
        completion_gain = if skill.base_completion_gain > 0.0 {
            safe_floor(skill.base_completion_gain * control)
        } else {
            0.0
        };
    }
    if skill.scales_with_intensity && skill.technique_type == "fusion" {
        completion_gain = safe_floor(skill.base_completion_gain * intensity);
    }

    SkillGains {
        completion: safe_floor(clamp_predicted_progress_gain(
            safe_floor(completion_gain * crit_factor * expected_factor),
            state.completion,
            config.max_completion,
        )),
        perfection: safe_floor(clamp_predicted_progress_gain(
            safe_floor(perfection_gain * crit_factor * expected_factor),
            state.perfection,
            config.max_perfection,
        )),
        stability: safe_floor(stability_gain * expected_factor),
        toxicity_cleanse: safe_floor(toxicity_cleanse * expected_factor),
    }
}

/// Mirrors `canApplySkill`.
pub fn can_apply_skill(
    env: &ActionEnv<'_>,
    state: &EngineState,
    skill_index: usize,
    skill: &EngineSkill,
    condition: &str,
    condition_effects: crate::ConditionEffectSummary,
    active_buffs: &[ActiveBuff],
) -> bool {
    if state.finished || state.stability <= 0.0 {
        return false;
    }

    let is_item = skill.action_kind == "item";

    if !is_item && state.cooldowns.get(skill_index).copied().unwrap_or(0) > 0 {
        return false;
    }

    if !is_item {
        if let Some(required) = &skill.condition_requirement {
            if crate::normalize_condition(required) != crate::normalize_condition(condition) {
                return false;
            }
        }
        if let Some(requirement) = skill.buff_requirement.as_ref() {
            if (state.buff_stacks(&requirement.buff_name) as f64) < requirement.amount {
                return false;
            }
        }
        if let Some(buff_cost) = skill.buff_cost.as_ref() {
            let have = state.buff_stacks(&buff_cost.buff_name) as f64;
            let required = if buff_cost.consume_all {
                1.0
            } else {
                buff_cost.amount.unwrap_or(0.0)
            };
            if required > 0.0 && have < required {
                return false;
            }
        }
    }

    if is_item {
        let item_key = normalize_identifier(
            skill
                .item_name
                .as_deref()
                .filter(|name| !name.is_empty())
                .unwrap_or(&skill.key),
        );
        if state.item_count(&item_key) <= 0 {
            return false;
        }
        if skill.reagent_only_at_step_zero && state.step != 0 {
            return false;
        }
        let per_turn_limit = env.config.pills_per_round.floor().max(1.0);
        if (state.consumed_pills_this_turn as f64) >= per_turn_limit {
            return false;
        }
    }

    let costs =
        calculate_effective_action_costs(env, state, skill, condition_effects, active_buffs);
    // The TypeScript check is a strict `state.qi < qiCost`; the epsilon only
    // absorbs float noise in the cost derivation.
    if state.qi + 1e-9 < costs.qi_cost {
        return false;
    }

    // No post-cost stability gate: the game lets you spend into a failed craft,
    // and `canApplySkill` matches that. Toxicity is gated on the *config*
    // ceiling only, exactly as the TypeScript simulator does.
    let max_toxicity = env.config.max_toxicity.max(0.0);
    if max_toxicity > 0.0
        && skill.toxicity_cost != 0.0
        && state.toxicity + skill.toxicity_cost > max_toxicity
    {
        return false;
    }

    true
}

/// Mirrors `applySkill`.
///
/// Returns the post-action state without advancing the condition timeline or
/// evaluating the auto-finish predicate; both are the caller's job because they
/// depend on the search's condition queue.
pub fn apply_skill(
    env: &ActionEnv<'_>,
    state: &EngineState,
    skill_index: usize,
    skill: &EngineSkill,
    condition: &str,
    condition_effects: crate::ConditionEffectSummary,
    target_completion: f64,
) -> Option<EngineState> {
    let config = env.config;
    let active_buffs = resolve_active_buffs(state, config, env.skills);
    if !can_apply_skill(
        env,
        state,
        skill_index,
        skill,
        condition,
        condition_effects,
        &active_buffs,
    ) {
        return None;
    }

    let is_item = skill.action_kind == "item";
    let consumes_turn = skill.consumes_turn;
    let next_step = state.step + i32::from(consumes_turn);

    let mut qi_cap = effective_max_pool(state, config, &active_buffs);
    let resolved = resolve_action(env, state, skill, condition_effects, &active_buffs);
    let gains = calculate_skill_gains(env, state, skill, &resolved);
    let costs =
        calculate_effective_action_costs(env, state, skill, condition_effects, &active_buffs);

    let mut new_qi = clamp(state.qi - costs.qi_cost, 0.0, qi_cap);
    let has_explicit_pool_effect = skill.effects.iter().any(|effect| effect.kind == "pool");
    if !has_explicit_pool_effect && skill.restores_qi && skill.qi_restore > 0.0 {
        new_qi = clamp(new_qi + skill.qi_restore, 0.0, qi_cap);
    }

    let initial_max = state.initial_max_stability;
    let mut penalty = state.stability_penalty;
    if consumes_turn && !skill.prevents_max_stability_decay {
        penalty += 1.0;
    }
    penalty = penalty.min(initial_max);
    let mut new_max_stability = initial_max - penalty;
    if skill.max_stability_change != 0.0 {
        penalty = (penalty - skill.max_stability_change)
            .max(0.0)
            .min(initial_max);
        new_max_stability = initial_max - penalty;
    }
    if skill.restores_max_stability_to_full {
        penalty = 0.0;
        new_max_stability = initial_max;
    }

    let mut new_stability = (state.stability - costs.stability_cost + gains.stability).floor();
    new_stability = clamp(new_stability, 0.0, new_max_stability);

    let mut new_toxicity = state.toxicity + skill.toxicity_cost;
    if gains.toxicity_cleanse > 0.0 {
        new_toxicity = (new_toxicity - gains.toxicity_cleanse).max(0.0);
    }

    let mut control_buff_turns = if consumes_turn && state.control_buff_turns > 0 {
        state.control_buff_turns - 1
    } else {
        state.control_buff_turns
    };
    let mut intensity_buff_turns = if consumes_turn && state.intensity_buff_turns > 0 {
        state.intensity_buff_turns - 1
    } else {
        state.intensity_buff_turns
    };
    if skill.is_disciplined_touch {
        control_buff_turns = 0;
        intensity_buff_turns = 0;
    }

    let mut control_buff_multiplier = state.control_buff_multiplier;
    let mut intensity_buff_multiplier = state.intensity_buff_multiplier;
    if skill.buff_type == 1 {
        control_buff_turns = skill.buff_duration;
        control_buff_multiplier = if skill.buff_multiplier != 0.0 && skill.buff_multiplier != 1.0 {
            skill.buff_multiplier
        } else {
            config.default_buff_multiplier
        };
    } else if skill.buff_type == 2 {
        intensity_buff_turns = skill.buff_duration;
        intensity_buff_multiplier = if skill.buff_multiplier != 0.0 && skill.buff_multiplier != 1.0
        {
            skill.buff_multiplier
        } else {
            config.default_buff_multiplier
        };
    }

    let mut cooldowns = state.cooldowns.clone();
    if cooldowns.len() < env.skills.len() {
        cooldowns.resize(env.skills.len(), 0);
    }
    if consumes_turn {
        for turns in &mut cooldowns {
            if *turns > 1 {
                *turns -= 1;
            } else {
                *turns = 0;
            }
        }
        if !is_item && skill.cooldown > 0 {
            cooldowns[skill_index] = skill.cooldown;
        }
    }

    let mut items = state.items.clone();
    if is_item {
        let item_key = normalize_identifier(
            skill
                .item_name
                .as_deref()
                .filter(|name| !name.is_empty())
                .unwrap_or(&skill.key),
        );
        if let Some(index) = items.iter().position(|entry| entry.key == item_key) {
            if items[index].count <= 1 {
                items.remove(index);
            } else {
                items[index].count -= 1;
            }
        }
    }

    let mut buffs = BuffSet::new(active_buffs.clone());
    if let Some(buff_cost) = skill.buff_cost.as_ref() {
        let have = buffs.stacks(&buff_cost.buff_name);
        if have > 0 {
            let consume = if buff_cost.consume_all {
                have
            } else {
                have.min(buff_cost.amount.unwrap_or(0.0).floor() as i32)
            };
            buffs.set_stacks(&buff_cost.buff_name, (have - consume).max(0));
        }
    }

    // The TypeScript simulator refreshes the Qi ceiling here - after the buff
    // cost has been paid but *before* any technique effect runs - so a buff this
    // action creates cannot raise the cap the same action is clamped against.
    qi_cap = effective_max_pool(
        &EngineState {
            qi: new_qi,
            stability: new_stability,
            stability_penalty: penalty,
            toxicity: new_toxicity,
            buffs: buffs.as_slice().to_vec(),
            ..state.clone()
        },
        config,
        buffs.as_slice(),
    );

    let action_vars = apply_mastery_to_variables(&resolved.variables, &resolved.mastery);
    let action_success_chance = if is_item {
        1.0
    } else {
        clamp(
            skill.success_chance + get_variable_value(&action_vars, "successChanceBonus"),
            0.0,
            1.0,
        )
    };

    let mut technique_pool_delta = 0.0;
    let mut technique_max_stability_delta = 0.0;
    for effect in &skill.effects {
        let evaluation =
            evaluate_effect_condition(effect.condition.as_ref(), state, &action_vars, 0);
        if !evaluation.met || evaluation.probability <= 0.0 {
            continue;
        }
        let factor = action_success_chance * evaluation.probability;
        if factor <= 0.0 {
            continue;
        }
        match effect.kind.as_str() {
            "pool" => {
                technique_pool_delta += evaluate_scaling_with_upgrades(
                    effect.amount.as_ref(),
                    &resolved.upgrades,
                    &action_vars,
                    0.0,
                ) * factor;
            }
            "maxStability" => {
                technique_max_stability_delta += evaluate_scaling_with_upgrades(
                    effect.amount.as_ref(),
                    &resolved.upgrades,
                    &action_vars,
                    0.0,
                ) * factor;
            }
            "createBuff" => {
                let stacks = evaluate_scaling_with_upgrades(
                    effect.stacks.as_ref(),
                    &resolved.upgrades,
                    &action_vars,
                    1.0,
                ) * factor;
                buffs.upsert_from_definition(effect.buff.as_ref(), stacks);
            }
            "consumeBuff" => {
                let buff_key = effect
                    .buff
                    .as_ref()
                    .map(|buff| normalize_identifier(&buff.name))
                    .unwrap_or_default();
                if buff_key.is_empty() {
                    continue;
                }
                let stacks = evaluate_scaling_with_upgrades(
                    effect.stacks.as_ref(),
                    &resolved.upgrades,
                    &action_vars,
                    1.0,
                ) * factor;
                if stacks > 0.0 {
                    buffs.adjust_existing(&buff_key, -stacks.floor());
                }
            }
            _ => {}
        }
    }

    let mut buff_completion = 0.0;
    let mut buff_perfection = 0.0;
    let mut buff_stability_delta = 0.0;
    let mut buff_pool_delta = 0.0;
    let mut buff_toxicity_delta = 0.0;
    let mut buff_max_stability_delta = 0.0;

    if consumes_turn {
        // The TypeScript loop iterates a snapshot (`Array.from(...)`), so buffs
        // created while executing effects do not execute in the same turn.
        let snapshot = buffs.as_slice().to_vec();
        for owner in &snapshot {
            let Some(definition) = owner.definition.as_ref() else {
                continue;
            };
            let mut scaling_vars = action_vars.clone();
            scaling_vars.insert("pool".to_string(), new_qi);
            scaling_vars.insert("maxpool".to_string(), qi_cap);
            scaling_vars.insert("toxicity".to_string(), new_toxicity);
            scaling_vars.insert("maxtoxicity".to_string(), config.max_toxicity);
            scaling_vars.insert("poolCostFlat".to_string(), state.pool_cost_flat);
            scaling_vars.insert("poolCostPercentage".to_string(), state.pool_cost_percentage);
            scaling_vars.insert(
                "stabilityCostPercentage".to_string(),
                state.stability_cost_percentage,
            );
            scaling_vars.insert("stacks".to_string(), owner.stacks as f64);

            let mut run = |effects: &[Effect]| {
                for effect in effects {
                    let evaluation = evaluate_effect_condition(
                        effect.condition.as_ref(),
                        state,
                        &scaling_vars,
                        owner.stacks,
                    );
                    if !evaluation.met || evaluation.probability <= 0.0 {
                        continue;
                    }
                    let condition_factor = evaluation.probability;
                    let amount = evaluate_scaling_with_upgrades(
                        effect.amount.as_ref(),
                        &resolved.upgrades,
                        &scaling_vars,
                        0.0,
                    ) * condition_factor;
                    match effect.kind.as_str() {
                        "completion" => buff_completion += amount,
                        "perfection" => buff_perfection += amount,
                        "stability" => buff_stability_delta += amount,
                        "pool" => buff_pool_delta += amount,
                        "maxStability" => buff_max_stability_delta += amount,
                        // Runtime `changeToxicity` does `toxicity -= amount`, so a
                        // positive amount cleanses and a negative amount inflicts.
                        "changeToxicity" => buff_toxicity_delta -= amount,
                        "negate" => buffs.remove(&owner.key),
                        "createBuff" => {
                            let stacks = evaluate_scaling_with_upgrades(
                                effect.stacks.as_ref(),
                                &resolved.upgrades,
                                &scaling_vars,
                                1.0,
                            ) * condition_factor;
                            buffs.upsert_from_definition(effect.buff.as_ref(), stacks);
                        }
                        "addStack" => {
                            let change = evaluate_scaling_with_upgrades(
                                effect.stacks.as_ref(),
                                &resolved.upgrades,
                                &scaling_vars,
                                1.0,
                            ) * condition_factor;
                            if change != 0.0 {
                                buffs.adjust_existing(&owner.key, change);
                            }
                        }
                        _ => {}
                    }
                }
            };

            run(&definition.effects);
            let action_effects = match skill.technique_type.as_str() {
                "fusion" => definition.on_fusion.as_deref(),
                "refine" => definition.on_refine.as_deref(),
                "stabilize" => definition.on_stabilize.as_deref(),
                "support" => definition.on_support.as_deref(),
                _ => None,
            };
            if let Some(effects) = action_effects {
                run(effects);
            }
        }

        if grants_turbid_qi_stack(next_step) {
            if let Some(key) = find_turbid_qi_buff_key(buffs.as_slice()) {
                buffs.adjust_existing(&key, 1.0);
            }
        }
    }

    let mut new_completion = state.completion + gains.completion + buff_completion;
    let mut new_perfection = state.perfection + gains.perfection + buff_perfection;
    new_qi = clamp(new_qi + technique_pool_delta, 0.0, qi_cap);

    if let Some(cap) = config.max_completion {
        if cap.is_finite() {
            new_completion = new_completion.min(cap);
        }
    }
    if let Some(cap) = config.max_perfection {
        if cap.is_finite() {
            new_perfection = new_perfection.min(cap);
        }
    }

    let mut completion_bonus = state.completion_bonus;
    if consumes_turn && target_completion > 0.0 {
        let bonus = bonus_and_chance(new_completion, target_completion);
        completion_bonus = (bonus.guaranteed - 1).max(0);
    }

    if technique_max_stability_delta != 0.0 {
        penalty = (penalty - technique_max_stability_delta)
            .max(0.0)
            .min(initial_max);
        let bound = initial_max - penalty;
        if new_stability > bound {
            new_stability = bound;
        }
    }

    new_stability = clamp(
        new_stability + buff_stability_delta,
        0.0,
        initial_max - penalty,
    );
    new_qi = clamp(new_qi + buff_pool_delta, 0.0, qi_cap);
    new_toxicity = (new_toxicity + buff_toxicity_delta).max(0.0);
    if buff_max_stability_delta != 0.0 {
        penalty = (penalty - buff_max_stability_delta)
            .max(0.0)
            .min(initial_max);
        let bound = initial_max - penalty;
        if new_stability > bound {
            new_stability = bound;
        }
    }

    let mut next = EngineState {
        qi: new_qi,
        stability: new_stability,
        stability_penalty: penalty,
        completion: new_completion,
        perfection: new_perfection,
        control_buff_turns,
        intensity_buff_turns,
        control_buff_multiplier,
        intensity_buff_multiplier,
        toxicity: new_toxicity,
        cooldowns,
        items,
        consumed_pills_this_turn: if consumes_turn {
            0
        } else {
            state.consumed_pills_this_turn + i32::from(is_item)
        },
        buffs: buffs.into_vec(),
        step: next_step,
        completion_bonus,
        ..state.clone()
    };

    if consumes_turn && !is_item && config.is_sublime_craft && config.crafting_type.is_some() {
        // Eccentric Decree reads the *post-action* bars, so this must run after
        // completion/perfection have been updated.
        let context = crate::HarmonyProcessContext {
            completion: next.completion,
            perfection: next.perfection,
            max_completion: config.max_completion.unwrap_or(next.completion),
            max_perfection: config.max_perfection.unwrap_or(next.perfection),
            target_completion: config.target_completion,
            target_perfection: config.target_perfection,
        };
        let result = crate::process_harmony_effect(
            &mut next.harmony_data,
            config.crafting_type.as_deref().unwrap_or(""),
            &skill.technique_type,
            context,
        );
        next.harmony = clamp(
            result
                .harmony_override
                .unwrap_or(state.harmony + result.harmony_delta),
            -100.0,
            100.0,
        );
        if result.stability_delta != 0.0 {
            next.stability = clamp(
                next.stability + result.stability_delta,
                0.0,
                initial_max - next.stability_penalty,
            );
        }
        if result.pool_delta != 0.0 {
            next.qi = clamp(next.qi + result.pool_delta, 0.0, qi_cap);
        }
        if result.stability_penalty_delta != 0.0 {
            next.stability_penalty =
                (next.stability_penalty + result.stability_penalty_delta).min(initial_max);
            let bound = initial_max - next.stability_penalty;
            if next.stability > bound {
                next.stability = bound;
            }
        }
    }

    Some(next)
}
