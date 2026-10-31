import { CraftingState } from './state';
import {
  applySkillOutcomes,
  calculateDisplayedSkillGains,
  calculateEffectiveActionCosts,
  canApplySkill,
  getUnsupportedTransitionReason,
  getBlockedSkillReasons,
  getBuffDiscordantConditions,
  getConditionEffectsForConfig,
  techniqueDisplayName,
  type OptimizerConfig,
  type SkillDefinition,
} from './skills';
import {
  resolvePlanningGoals,
  classifyOutcome,
  willAutoFinish,
  TIER_REQUIREMENTS,
} from './outcome';
import { getBonusAndChance, type CraftingCondition } from './gameTypes';
import type {
  SearchConfig,
  SearchResult,
  SkillRecommendation,
  OutcomeProjection,
} from './search';
import { generatedConditions } from './conditionOutcomes';
import { projectNativeAutoUseBranches } from './nativeAutoUsePlan';
import { buildCanonicalNativeVariables } from './nativeVariables';
import { clampSearchGoalPriorityBias } from '../utils/searchGoalPriority';
import { isHarmonyType } from './harmonyRegistry';

export interface PlanningValue {
  goalProbabilityLowerBound: number;
  prematureEndProbability: number;
  /** Heuristic only; never presented as a goal probability. */
  frontierProgress: number;
  resourceReserve: number;
  expectedSteps: number;
  unresolvedProbability: number;
  /** A policy contains hidden PRD probabilities; bounds are not exact chances. */
  probabilityUncertain?: boolean;
  transitionUnresolvedProbability?: number;
}

/** One ordering for recursive policies, root actions and worker merges. */
export function comparePlanningValues(
  a: PlanningValue,
  b: PlanningValue,
): number {
  const goalDifference =
    b.goalProbabilityLowerBound - a.goalProbabilityLowerBound;
  const failureDifference =
    a.prematureEndProbability - b.prematureEndProbability;
  const values = [
    // A single lexicographic order is essential for transitive worker merging.
    // On resolved policies failure and goal probability are complements, so
    // minimizing failure also maximizes goal probability. Unresolved policies
    // retain the conservative preference without a pair-dependent comparator.
    failureDifference,
    goalDifference,
    b.frontierProgress - a.frontierProgress,
    a.expectedSteps - b.expectedSteps,
    b.resourceReserve - a.resourceReserve,
  ];
  return values.find((v) => Math.abs(v) > 1e-10) ?? 0;
}

type ForecastEntry = CraftingCondition | number;
interface PendingCondition {
  current: CraftingCondition;
  queue: ForecastEntry[];
  harmony: number;
  discordance: number;
}
interface NodeState {
  state: CraftingState;
  condition: CraftingCondition;
  queue: ForecastEntry[];
  pending: Record<number, PendingCondition>;
}
interface Child extends NodeState {
  probability: number;
}
interface Action {
  skill: SkillDefinition;
  before: Array<{ state: CraftingState; probability: number }>;
  children: Child[];
  unresolved: number;
  uncertain?: boolean;
  immediate: PlanningValue;
  unsupportedReason?: string;
}
interface Policy {
  value: PlanningValue;
  action?: Action;
  next?: Policy;
}
class SearchBudgetReached extends Error {
  constructor() {
    super('Search budget reached');
    Object.setPrototypeOf(this, SearchBudgetReached.prototype);
  }
}

/** Exact per-call identity: all state fields, buff definitions, step and forecast. */
function stateKey(node: NodeState): string {
  return JSON.stringify(
    [node.condition, node.queue, node.pending, node.state],
    function (key, value: unknown) {
      // Only omit bookkeeping owned by this CraftingState. Identically named
      // nested counters are mechanics (e.g. buff internalState.history).
      if (this === node.state && (key === 'history' || key === '_cacheKey'))
        return undefined;
      if (value instanceof Map)
        return Array.from(value.entries()).sort(([a], [b]) =>
          String(a).localeCompare(String(b)),
        );
      return value;
    },
  );
}

/** Unknown expressions/callbacks prevent proving that waiting cannot help. */
// Expiry of an optional step-zero reagent only removes a choice; retaining the
// earlier state is no worse. Forced native auto-use is excluded separately.
function hasDynamicRecoveryDependencies(
  value: unknown,
  seen = new Set<object>(),
): boolean {
  if (typeof value === 'function') return true;
  if (!value || typeof value !== 'object' || seen.has(value)) return false;
  seen.add(value);
  return Object.entries(value).some(
    ([key, child]) =>
      ([
        'eqn',
        'scaling',
        'stat',
        'condition',
        'conditionRequirement',
        'firstActionOnly',
        'additionalVariables',
      ].includes(key) &&
        child !== undefined &&
        child !== null &&
        child !== false) ||
      hasDynamicRecoveryDependencies(child, seen),
  );
}

/** Bounded finite-horizon AND/OR search. Missing branches remain unknown. */
export function constrainedSearch(
  state: CraftingState,
  config: OptimizerConfig,
  targetCompletion: number,
  targetPerfection: number,
  depth = 48,
  currentCondition: CraftingCondition = 'neutral',
  forecast: CraftingCondition[] = [],
  settings: Partial<SearchConfig> = {},
): SearchResult {
  const started = Date.now();
  const goals = resolvePlanningGoals(
    config,
    targetCompletion,
    targetPerfection,
    settings,
  );
  const attained = (s: CraftingState) =>
    s.completion >= goals.completion && s.perfection >= goals.perfection;
  const ended = (s: CraftingState) => willAutoFinish(s, goals.bands);
  const reached = (s: CraftingState) => attained(s) && ended(s);
  const budget = Math.max(1, settings.maxNodes ?? 100000);
  const time = Math.max(1, settings.timeBudgetMs ?? 2000);
  const horizon = Math.max(1, Math.min(96, Math.floor(depth)));
  const width = Math.max(2, Math.floor(settings.beamWidth ?? 8));
  let nodes = 0,
    hits = 0,
    pruned = 0;
  const memo = new Map<string, Policy>();
  const transitions = new Map<string, Action[]>();
  const inertRootActions: SkillDefinition[] = [];
  const rootKeys =
    settings.rootSkillKeys === undefined
      ? undefined
      : new Set(settings.rootSkillKeys);
  const evaluatedRootSkillKeys: string[] = [];
  let rootBudgetExhausted = false;
  const goalBias =
    clampSearchGoalPriorityBias(settings.goalPriorityBias ?? 0) / 100;
  const check = () => {
    if (
      nodes >= budget ||
      Date.now() - started >= time ||
      settings.shouldAbort?.()
    )
      throw new SearchBudgetReached();
  };
  const progress = (s: CraftingState) => {
    const c =
      goals.completion > 0 ? Math.min(1, s.completion / goals.completion) : 1;
    const p =
      goals.perfection > 0 ? Math.min(1, s.perfection / goals.perfection) : 1;
    const average = (c + p) / 2;
    // Bias changes only the secondary progress heuristic, never safety or goals.
    return (Math.min(c, p) + average + (goalBias * (c - p)) / 2) / 2;
  };
  const reserve = (s: CraftingState) =>
    Math.max(0, s.qi) / Math.max(1, config.maxQi) +
    ((attained(s) ? -1 : 1) * Math.max(0, s.stability)) /
      Math.max(1, s.initialMaxStability);
  const leaf = (s: CraftingState): PlanningValue => ({
    goalProbabilityLowerBound: reached(s) ? 1 : 0,
    prematureEndProbability: !reached(s) && ended(s) ? 1 : 0,
    frontierProgress: progress(s),
    resourceReserve: reserve(s),
    expectedSteps: 0,
    unresolvedProbability: !reached(s) && !ended(s) ? 1 : 0,
  });
  const combine = (action: Action, values: PlanningValue[]): PlanningValue => {
    const probabilityUncertain =
      action.uncertain || values.some((value) => value.probabilityUncertain);
    if (action.uncertain && values.length) {
      // Enumeration weights are not true probabilities for a hidden PRD streak.
      // An omitted outcome may be the worst case: include a zero goal bound and
      // unit risk/unknown bound instead of scaling by nominal explored mass.
      const omitted = action.unresolved > 0;
      return {
        goalProbabilityLowerBound: omitted
          ? 0
          : Math.min(...values.map((v) => v.goalProbabilityLowerBound)),
        prematureEndProbability: Math.max(
          omitted ? 1 : 0,
          ...values.map((v) => v.prematureEndProbability),
        ),
        frontierProgress: Math.min(...values.map((v) => v.frontierProgress)),
        resourceReserve: Math.min(...values.map((v) => v.resourceReserve)),
        expectedSteps: 1 + Math.max(...values.map((v) => v.expectedSteps)),
        unresolvedProbability: Math.max(
          omitted ? 1 : 0,
          ...values.map((v) => v.unresolvedProbability),
        ),
        probabilityUncertain: true,
      };
    }
    const value: PlanningValue = {
      goalProbabilityLowerBound: 0,
      prematureEndProbability: action.unresolved,
      frontierProgress: 0,
      resourceReserve: 0,
      expectedSteps: 1,
      unresolvedProbability: action.unresolved,
      probabilityUncertain: probabilityUncertain || undefined,
    };
    action.children.forEach((child, i) => {
      const p = child.probability,
        v = values[i];
      value.goalProbabilityLowerBound += p * v.goalProbabilityLowerBound;
      value.prematureEndProbability += p * v.prematureEndProbability;
      value.frontierProgress += p * v.frontierProgress;
      value.resourceReserve += p * v.resourceReserve;
      value.expectedSteps += p * v.expectedSteps;
      value.unresolvedProbability += p * v.unresolvedProbability;
    });
    return value;
  };
  // If conditions cannot change any mechanics, their labels need not multiply states.
  const conditionRelevant = Boolean(
    config.nativeAutoUsePlan ||
    config.conditionEffectsData ||
    config.conditionEffectType ||
    config.skills.some((s) => s.conditionRequirement),
  );
  const canProveWaitingInert =
    !config.nativeAutoUsePlan &&
    (config.craftingType === undefined || isHarmonyType(config.craftingType)) &&
    !hasDynamicRecoveryDependencies(config.skills) &&
    !(
      [
        'neutral',
        'positive',
        'negative',
        'veryPositive',
        'veryNegative',
      ] as const
    ).some(
      (condition) => getConditionEffectsForConfig(config, condition).length > 0,
    );
  const isInertRecovery = (node: NodeState, action: Action): boolean => {
    const before = node.state;
    if (
      !canProveWaitingInert ||
      attained(before) ||
      action.unresolved > 0 ||
      !action.children.length ||
      before.stability < before.maxStability ||
      before.buffs.size ||
      before.controlBuffTurns ||
      before.intensityBuffTurns ||
      (before.harmonyData && !isHarmonyType(config.craftingType)) ||
      hasDynamicRecoveryDependencies(before.harmonyData) ||
      !(
        action.skill.stabilityGain > 0 ||
        action.skill.effects?.some((effect) => effect.kind === 'stability')
      )
    )
      return false;
    // Compare every modeled field, ignoring only a useless turn and resources
    // that strictly cannot improve. Cooldown progress, buffs, cleansing, item
    // budgets, harmony, and other state changes all keep the action available.
    // Sublime is a tier/goal flag, not a reason to exempt a no-op. The known
    // harmony processors use retained subsystem state and action context, not
    // absolute step/history; their complete data and harmony value remain in
    // this identity. Cooling, charges, attunement, patterns and releases must
    // therefore stay available whenever their transition changes that state.
    const identity = (s: CraftingState): string => {
      const nativeVariables = { ...buildCanonicalNativeVariables(s) };
      // Availability propagation may materialize aliases absent at extraction.
      // Their authoritative state fields are compared below, including droplets.
      for (const key of [
        'itemEffectiveness',
        'qiDroplets',
        'maxqiDroplets',
        'qiCostReduction',
        'qiCostPenalty',
        'stabilityCostReduction',
        'stabilityCostPenalty',
      ])
        delete nativeVariables[key];
      if ((action.skill.successChance ?? 1) + before.successChanceBonus >= 1)
        delete nativeVariables['prd_failures_' + action.skill.key];
      return stateKey({
        ...node,
        state: s.copy({
          qi: before.qi,
          stability: before.stability,
          stabilityPenalty: before.stabilityPenalty,
          step: before.step,
          nativeVariables,
        }),
      });
    };
    const original = identity(before);
    return action.children.every(
      ({ state: after }) =>
        after.qi <= before.qi &&
        after.stability <= before.stability &&
        after.maxStability <= before.maxStability &&
        identity(after) === original,
    );
  };
  const expand = (node: NodeState, atRoot = false): Action[] => {
    const key = stateKey(node),
      // A filtered or partial root must never poison the full continuation cache.
      cached = atRoot ? undefined : transitions.get(key);
    if (cached) {
      hits++;
      return cached;
    }
    const actions: Action[] = [];
    // Native auto-use runs inside an enabled technique click. It cannot rescue
    // an action that fails the pre-click availability gate. Validate payloads
    // first so unsupported data is reported as unknown, not silently evaluated.
    let native: ReturnType<typeof projectNativeAutoUseBranches> | undefined;
    for (const skill of config.skills) {
      if (atRoot && rootKeys && !rootKeys.has(skill.key)) continue;
      if (skill.actionKind === 'finish') continue;
      const effects = getConditionEffectsForConfig(config, node.condition);
      const unsupportedReason = getUnsupportedTransitionReason(
        node.state,
        skill,
        config,
        effects,
      );
      if (
        !unsupportedReason &&
        !canApplySkill(
          node.state,
          skill,
          config.minStability,
          config.maxToxicity ?? 0,
          node.condition,
          effects,
          config.pillsPerRound ?? 1,
          config,
        )
      )
        continue;
      try {
        check();
      } catch (error) {
        if (!atRoot || !(error instanceof SearchBudgetReached)) throw error;
        rootBudgetExhausted = true;
        break;
      }
      nodes++;
      const before = unsupportedReason
        ? { outcomes: [], unresolvedProbability: 1, unsupportedReason }
        : skill.actionKind === 'item'
          ? {
              outcomes: [{ state: node.state, probability: 1 }],
              unresolvedProbability: 0,
            }
          : (native ??= projectNativeAutoUseBranches(
              node.state,
              config,
              node.condition,
            ));
      const distribution: {
        outcomes: Array<{ state: CraftingState; probability: number }>;
        unresolvedProbability: number;
        probabilityUncertain?: boolean;
        unsupportedReason?: string;
      } = {
        outcomes: [],
        unresolvedProbability: before.unresolvedProbability,
        unsupportedReason: before.unsupportedReason,
      };
      for (const branch of before.outcomes) {
        if (branch.state.stability <= 0) {
          distribution.unresolvedProbability += branch.probability;
          continue;
        }
        const after = applySkillOutcomes(
          branch.state,
          skill,
          config,
          effects,
          targetCompletion,
          node.condition,
          targetPerfection,
          64,
        );
        distribution.probabilityUncertain ||= after.probabilityUncertain;
        distribution.unsupportedReason ??= after.unsupportedReason;
        distribution.unresolvedProbability +=
          branch.probability * after.unresolvedProbability;
        for (const o of after.outcomes)
          distribution.outcomes.push({
            state: o.state,
            probability: branch.probability * o.probability,
          });
        // An action illegal on a pre-use branch cannot be assumed to execute.
        if (!after.outcomes.length && after.unresolvedProbability === 0)
          distribution.unresolvedProbability += branch.probability;
      }
      const action: Action = {
        skill,
        before: before.outcomes,
        children: [],
        unresolved: distribution.unresolvedProbability,
        uncertain: distribution.probabilityUncertain,
        immediate: leaf(node.state),
        unsupportedReason: distribution.unsupportedReason,
      };
      const consumes = skill.consumesTurn ?? skill.actionKind !== 'item';
      for (const outcome of distribution.outcomes) {
        if (
          !consumes ||
          reached(outcome.state) ||
          ended(outcome.state) ||
          !conditionRelevant
        ) {
          action.children.push({
            state: outcome.state,
            condition: node.condition,
            queue: node.queue,
            pending: node.pending,
            probability: outcome.probability,
          });
          continue;
        }
        // Preserve each future roll's generation-time harmony, but branch only
        // when that roll becomes visible as the next condition. Earlier queued
        // rolls are then observed and substituted into its exact dependencies.
        const id = outcome.state.step;
        const pending = {
          ...node.pending,
          [id]: {
            current: node.condition,
            queue: node.queue,
            harmony: outcome.state.harmony,
            discordance: getBuffDiscordantConditions(outcome.state.buffs),
          },
        };
        const nextEntry = node.queue[0] ?? id;
        const spec =
          typeof nextEntry === 'number' ? pending[nextEntry] : undefined;
        if (spec?.queue.some((c) => typeof c === 'number'))
          throw new Error('Unobserved condition dependency');
        const generated = spec
          ? generatedConditions(
              spec.current,
              spec.queue as CraftingCondition[],
              spec.harmony,
              spec.discordance,
            )
          : [{ condition: nextEntry as CraftingCondition, probability: 1 }];
        for (const next of generated) {
          const known: Record<number, PendingCondition> = {};
          for (const key of Object.keys(pending)) {
            if (Number(key) === nextEntry) continue;
            const p = pending[Number(key)];
            known[Number(key)] = {
              ...p,
              queue: p.queue.map((c) => (c === nextEntry ? next.condition : c)),
            };
          }
          action.children.push({
            state: outcome.state,
            condition: next.condition,
            queue: node.queue.length ? [...node.queue.slice(1), id] : [],
            pending: known,
            probability: outcome.probability * next.probability,
          });
        }
      }
      if (atRoot) evaluatedRootSkillKeys.push(skill.key);
      if (!action.children.length && action.unresolved === 0) continue;
      if (isInertRecovery(node, action)) {
        pruned++;
        if (atRoot) inertRootActions.push(skill);
        continue;
      }
      action.immediate = combine(
        action,
        action.children.map((child) => leaf(child.state)),
      );
      actions.push(action);
    }
    actions.sort(
      (a, b) =>
        comparePlanningValues(a.immediate, b.immediate) ||
        a.skill.key.localeCompare(b.skill.key),
    );
    if (!atRoot) transitions.set(key, actions);
    return actions;
  };
  const solve = (node: NodeState, remaining: number): Policy => {
    check();
    if (reached(node.state) || ended(node.state) || remaining <= 0)
      return { value: leaf(node.state) };
    const key = remaining + '|' + stateKey(node),
      cached = memo.get(key);
    if (cached) {
      hits++;
      return cached;
    }
    const all = expand(node);
    if (!all.length)
      return {
        value: {
          ...leaf(node.state),
          prematureEndProbability: 1,
          unresolvedProbability: 0,
        },
      };
    // Retain a representative of each action family, then fill by immediate value.
    const candidates: Action[] = [];
    const families = new Set<string>();
    for (const a of all) {
      const family = a.skill.actionKind === 'item' ? 'item' : a.skill.type;
      if (!families.has(family)) {
        families.add(family);
        candidates.push(a);
      }
    }
    for (const a of all) {
      if (candidates.length >= Math.max(width, families.size)) break;
      if (!candidates.includes(a)) candidates.push(a);
    }
    pruned += all.length - candidates.length;
    let best: Policy | undefined;
    for (const action of candidates) {
      const continuations = action.children.map((child) =>
        solve(child, remaining - 1),
      );
      const value = combine(
        action,
        continuations.map((p) => p.value),
      );
      const likely = action.children.reduce(
        (best, c, i) =>
          c.probability > (action.children[best]?.probability ?? -1) ? i : best,
        0,
      );
      const policy = { value, action, next: continuations[likely] };
      if (!best || comparePlanningValues(value, best.value) < 0) best = policy;
    }
    memo.set(key, best!);
    return best!;
  };
  const root: NodeState = {
    state,
    condition: currentCondition,
    queue: forecast.slice(0, 3),
    pending: {},
  };
  let actions: Action[] = [];
  let policies: Policy[] = [];
  let completed = 0;
  let unresolvedActions: Action[] = [];
  if (!reached(state) && !ended(state)) {
    try {
      actions = expand(root, true);
    } catch (error) {
      if (!(error instanceof SearchBudgetReached)) throw error;
      rootBudgetExhausted = true;
    }
    // Root outcomes must be evaluated for every action before claiming a ranking.
    unresolvedActions = actions.filter((action) => action.unresolved >= 1e-10);
    actions = actions.filter((action) => action.unresolved < 1e-10);
    // Keep completed diagnostics on a truncated root, but never publish its
    // partial ranking: an unevaluated action may be the guaranteed alternative.
    policies = rootBudgetExhausted
      ? []
      : actions.map((action) => ({ action, value: action.immediate }));
    if (policies.length) completed = 1;
    for (let d = 2; d <= horizon && policies.length; d++) {
      try {
        const next = actions.map((action) => {
          const children = action.children.map((child) => solve(child, d - 1));
          const likely = action.children.reduce(
            (best, c, i) =>
              c.probability > (action.children[best]?.probability ?? -1)
                ? i
                : best,
            0,
          );
          return {
            action,
            value: combine(
              action,
              children.map((p) => p.value),
            ),
            next: children[likely],
          };
        });
        policies = next;
        completed = d;
        if (
          policies.some((p) => p.value.goalProbabilityLowerBound >= 1 - 1e-10)
        )
          break;
      } catch (error) {
        if (!(error instanceof SearchBudgetReached)) throw error;
        break;
      }
    }
  }
  policies.sort(
    (a, b) =>
      comparePlanningValues(a.value, b.value) ||
      a.action!.skill.key.localeCompare(b.action!.skill.key),
  );
  const recommend = (p: Policy): SkillRecommendation => {
    const a = p.action!,
      effects = getConditionEffectsForConfig(config, currentCondition);
    // Preview the technique on the same pre-use states as the transition.
    // Stability previews are direct recovery, not net payment/decay deltas.
    const previews = a.before.map((branch) => ({
      probability: branch.probability,
      costs: calculateEffectiveActionCosts(
        branch.state,
        a.skill,
        config.minStability,
        effects,
        config,
      ),
      expected: calculateDisplayedSkillGains(
        branch.state,
        a.skill,
        config,
        effects,
      ),
      immediate: calculateDisplayedSkillGains(
        branch.state,
        a.skill,
        config,
        effects,
        { includeExpectedValue: false },
      ),
    }));
    const average = (read: (preview: (typeof previews)[number]) => number) =>
      previews.reduce(
        (sum, preview) => sum + preview.probability * read(preview),
        0,
      );
    const gains = (kind: 'expected' | 'immediate') => ({
      completion: average((preview) => preview[kind].completion),
      perfection: average((preview) => preview[kind].perfection),
      stability: average((preview) => preview[kind].stability),
    });
    const expected = gains('expected');
    // Progress still includes triggered buffs/harmony from the real transition.
    // A direct-skill-only preview would hide legitimate end-of-action procs.
    for (const bar of ['completion', 'perfection'] as const) {
      expected[bar] = a.uncertain
        ? Math.min(...a.children.map((child) => child.state[bar] - state[bar]))
        : a.children.reduce(
            (sum, child) =>
              sum + child.probability * (child.state[bar] - state[bar]),
            0,
          );
    }
    return {
      skill: a.skill,
      expectedGains: expected,
      immediateGains: gains('immediate'),
      effectiveCosts: {
        qi: average((preview) => preview.costs.qiCost),
        stability: average((preview) => preview.costs.stabilityCost),
      },
      score: p.value.goalProbabilityLowerBound,
      planning: { ...p.value, transitionUnresolvedProbability: a.unresolved },
      reasoning:
        p.value.goalProbabilityLowerBound >= 1 - 1e-10
          ? 'Verified route to both selected goals.'
          : a.children.every((c) => ended(c.state))
            ? 'Ends the craft; reaching both selected goals is not guaranteed.'
            : p.value.prematureEndProbability > 1e-10
              ? 'Risk of ending below the selected goals remains in this continuation.'
              : p.value.goalProbabilityLowerBound > 0
                ? 'An evaluated route reaches both goals; other outcomes remain uncertain.'
                : 'Goal route not yet proved within the search budget; this action preserves the evaluated continuation.',
      requiresProbabilisticSurvival: p.value.prematureEndProbability > 1e-10,
      endsCraft: a.unresolved === 0 && a.children.every((c) => ended(c.state)),
      // A horizon lower bound of zero means unproved, not a 0%-success craft.
      projectedSuccessChance:
        p.value.unresolvedProbability <= 1e-10 && !p.value.probabilityUncertain
          ? p.value.goalProbabilityLowerBound
          : undefined,
    };
  };
  const outcome = classifyOutcome(state, goals.bands);
  const bar = (value: number, width: number, requiredBands: number) => {
    const counted =
      width > 0
        ? getBonusAndChance(value, width)
        : { guaranteed: 0, bonusChance: 0, nextThreshold: 0 };
    return {
      value,
      bands: counted.guaranteed,
      requiredBands: width > 0 ? requiredBands : 0,
      bonusChance: counted.bonusChance,
      nextThreshold: counted.nextThreshold,
      pointsToNextBand: Math.max(0, counted.nextThreshold - value),
    };
  };
  const requirement = TIER_REQUIREMENTS[goals.bands.targetTier];
  const requestedBar = (target: number, width: number) => {
    const info =
      width > 0
        ? getBonusAndChance(target, width)
        : { guaranteed: 0, bonusChance: 0 };
    return { target, bands: info.guaranteed, bonusChance: info.bonusChance };
  };
  const projection: OutcomeProjection = {
    tier: outcome.tier,
    optimisticTier: outcome.optimisticTier,
    targetTier: goals.bands.targetTier,
    completion: bar(state.completion, targetCompletion, requirement.completion),
    perfection: bar(state.perfection, targetPerfection, requirement.perfection),
    bindingBar: outcome.blockingRequirement,
    willAutoFinish: ended(state),
    requestedGoals: {
      completion: requestedBar(goals.completion, targetCompletion),
      perfection: requestedBar(goals.perfection, targetPerfection),
      attained: attained(state),
      bindingBar: attained(state)
        ? 'none'
        : (goals.completion > 0 ? state.completion / goals.completion : 1) <
            (goals.perfection > 0 ? state.perfection / goals.perfection : 1)
          ? 'completion'
          : 'perfection',
      needsResolution: attained(state) && !ended(state),
    },
  };
  const recommendations = policies.map(recommend);
  recommendations.forEach((r, i) => {
    r.qualityRating = Math.round(
      (100 * (recommendations.length - i)) / recommendations.length,
    );
  });
  const rotation: SkillDefinition[] = [];
  let cursor = policies[0];
  while (cursor?.action && rotation.length < horizon) {
    rotation.push(cursor.action.skill);
    cursor = cursor.next!;
  }
  // Preview only an actual, completely resolved deterministic continuation.
  // `next` follows the most-likely branch for rotation display; it is not a
  // probabilistic final-state expectation or a substitute for policy bounds.
  const finalPreview = (): SearchResult['expectedFinalState'] => {
    const best = policies[0];
    if (
      !best ||
      best.value.unresolvedProbability > 0 ||
      best.value.probabilityUncertain
    )
      return undefined;
    let policy: Policy | undefined = best;
    let final = state;
    let steps = 0;
    while (policy?.action && steps++ < horizon) {
      const action = policy.action;
      if (
        action.unresolved > 0 ||
        action.uncertain ||
        action.children.length !== 1 ||
        action.children[0].probability !== 1
      )
        return undefined;
      final = action.children[0].state;
      policy = policy.next;
    }
    if (!ended(final)) return undefined;
    return {
      completion: final.completion,
      perfection: final.perfection,
      stability: final.stability,
      maxStability: final.maxStability,
      qi: final.qi,
      turnsRemaining: 0,
      projectedSuccessChance: best.value.goalProbabilityLowerBound,
    };
  };
  return {
    recommendation: recommendations[0] ?? null,
    alternativeSkills: recommendations.slice(1),
    isTerminal: ended(state),
    targetsMet: reached(state),
    rootEvaluation: {
      complete: !rootBudgetExhausted,
      evaluatedSkillKeys: evaluatedRootSkillKeys,
    },
    outcomeProjection: projection,
    expectedFinalState: finalPreview(),
    optimalRotation: rotation.map((s) => s.name),
    optimalRotationLabels: rotation.map(techniqueDisplayName),
    blockedReasons: recommendations.length
      ? undefined
      : [
          ...getBlockedSkillReasons(
            state,
            {
              ...config,
              skills: config.skills.filter(
                (skill) =>
                  (!rootKeys || rootKeys.has(skill.key)) &&
                  !getUnsupportedTransitionReason(
                    state,
                    skill,
                    config,
                    getConditionEffectsForConfig(config, currentCondition),
                  ),
              ),
            },
            currentCondition,
          ),
          ...inertRootActions.map((skill) => ({
            skillName: techniqueDisplayName(skill),
            reason: 'dominated' as const,
            details:
              'Recovery adds no modeled benefit here and only spends resources or a turn.',
          })),
          ...unresolvedActions.map((action) => ({
            skillName: techniqueDisplayName(action.skill),
            reason: 'unresolved' as const,
            details:
              action.unsupportedReason ??
              config.nativeAutoUsePlan?.unsupportedReason ??
              'Immediate outcomes are not fully modelled. Automatic execution is paused; no safe recommendation is certified.',
          })),
          ...(rootBudgetExhausted
            ? [
                {
                  skillName: 'Planner',
                  reason: 'budget' as const,
                  details:
                    'Search budget exhausted before all root actions could be evaluated. Increase the search budget or recalculate; automatic execution remains paused.',
                },
              ]
            : []),
        ],
    searchMetrics: {
      nodesExplored: nodes,
      cacheHits: hits,
      timeTakenMs: Date.now() - started,
      depthReached: completed,
      pruned,
    },
  };
}
