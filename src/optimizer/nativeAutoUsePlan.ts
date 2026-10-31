import { evalExpression, type ScalingVariables } from './gameTypes';
import { CraftingState } from './state';
import {
  applySkillOutcomes,
  getConditionEffectsForConfig,
  getCraftingActionVariables,
  getUnsupportedTransitionReason,
  type ActionOutcomeDistribution,
  type OptimizerConfig,
  type SkillDefinition,
} from './skills';

export interface NativeAutoUsePlanItem {
  action: SkillDefinition;
  /** Raw toxicity multiplied by the runtime's item/player realm factor. */
  toxicityBeforeResistance: number;
}

export interface NativeAutoUsePlan {
  slots: Array<{ item: string; maxCount?: number; rule?: unknown }>;
  items: Record<string, NativeAutoUsePlanItem>;
  initialUsage: Record<string, number>;
  baseResistance: number;
  recipeConditionNames?: string[];
  recipeConditionName?: string;
  /** Slot/item payloads that cannot be faithfully decoded are never guessed. */
  unsupportedReason?: string;
}

const keyFor = (name: string): string =>
  name.toLowerCase().trim().replace(/\s+/g, '_');
const usageKey = (name: string): string =>
  `native_auto_use_count_${keyFor(name)}`;
const record = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
const conditions = [
  'veryNegative',
  'negative',
  'neutral',
  'positive',
  'veryPositive',
];
// Native slot rule indices come from 0.7.18's Wmo whitelist, which still has
// seven entries despite nine playable harmonies. Do not substitute the broader
// HARMONY_TYPES registry: unknown indices compile to false even for != rules.
const nativeRuleHarmonies = [
  'forge',
  'alchemical',
  'inscription',
  'resonance',
  'formless',
  'enhancingEcho',
  'eccentricDecree',
];

function compare(
  left: number,
  check: unknown,
  right: unknown,
): boolean | undefined {
  if (
    typeof right !== 'number' ||
    !Number.isFinite(left) ||
    !Number.isFinite(right)
  )
    return undefined;
  if (!['==', '!=', '<', '<=', '>', '>='].includes(String(check)))
    return undefined;
  return (
    evalExpression(`left ${String(check)} right`, {
      left,
      right,
    } as unknown as ScalingVariables) > 0
  );
}

function conditionMatches(
  raw: unknown,
  state: CraftingState,
  config: OptimizerConfig,
  variables: ScalingVariables,
  currentCondition: string | undefined,
  selfBuff: string | undefined,
): boolean | undefined {
  const condition = record(raw);
  if (!condition || typeof condition.condition !== 'string') return undefined;
  const label = condition.condition;
  const ratio = (value: number, maximum: number) =>
    maximum > 0 ? (value / maximum) * 100 : Number.NaN;
  let value: number;
  switch (label) {
    case 'Qi Pool':
      value = ratio(variables.pool, variables.maxpool);
      break;
    case 'Toxicity':
      value = ratio(variables.toxicity, variables.maxtoxicity);
      break;
    case 'Completion':
      value = ratio(state.completion, config.targetCompletion ?? 0);
      break;
    case 'Perfection':
      value = ratio(state.perfection, config.targetPerfection ?? 0);
      break;
    // Native NF uses the recipe's original maximum here, not its decayed cap.
    case 'Stability':
      value = ratio(state.stability, state.initialMaxStability);
      break;
    case 'Step':
      value = state.step;
      break;
    case 'Qi Droplets':
      value = state.qiDroplets;
      break;
    case 'Harmony Value':
      value = state.harmony;
      break;
    case 'Harmony Type':
      if (!nativeRuleHarmonies[Number(condition.value)]) return false;
      value =
        nativeRuleHarmonies[Number(condition.value)] === config.craftingType
          ? 1
          : 0;
      return compare(value, condition.check, 1);
    case 'Current Condition':
      if (!currentCondition) return undefined;
      if (!conditions[Number(condition.value)]) return false;
      value = conditions[Number(condition.value)] === currentCondition ? 1 : 0;
      return compare(value, condition.check, 1);
    case 'Recipe Condition':
      if (!config.nativeAutoUsePlan?.recipeConditionNames) return undefined;
      {
        const selected =
          config.nativeAutoUsePlan.recipeConditionNames[
            Number(condition.value)
          ];
        if (!selected) return false;
        value =
          selected === config.nativeAutoUsePlan.recipeConditionName ? 1 : 0;
        return compare(value, condition.check, 1);
      }
    case '(This Effect)':
      value = selfBuff ? state.getBuffStacks(keyFor(selfBuff)) : 0;
      if (!selfBuff) return false;
      break;
    default: {
      const key = keyFor(label);
      const known =
        state.buffs.has(key) ||
        Object.values(config.nativeAutoUsePlan?.items ?? {}).some(
          (item) =>
            Array.isArray(item.action.effects) &&
            item.action.effects.some(
              (effect) =>
                effect?.kind === 'createBuff' &&
                effect.buff &&
                typeof effect.buff.name === 'string' &&
                keyFor(effect.buff.name) === key,
            ),
        );
      if (!known) return undefined;
      value = state.getBuffStacks(key);
    }
  }
  return compare(value, condition.check, condition.value);
}

/** The runtime joins blocks with rootOperator and their members with its inverse. */
function ruleMatches(
  rule: unknown,
  state: CraftingState,
  config: OptimizerConfig,
  variables: ScalingVariables,
  currentCondition: string | undefined,
  selfBuff: string | undefined,
): boolean | undefined {
  const source = record(rule);
  if (!source) return rule === undefined || rule === null ? true : undefined;
  if (
    (source.blocks !== undefined && !Array.isArray(source.blocks)) ||
    (source.conditions !== undefined && !Array.isArray(source.conditions))
  )
    return undefined;
  let blocks: unknown[][];
  let root = source.rootOperator ?? 'AND';
  if (Array.isArray(source.blocks) && source.blocks.length > 0) {
    blocks = source.blocks.map((block) => {
      const value = record(block)?.conditions;
      return Array.isArray(value) ? value : [null];
    });
  } else if (Array.isArray(source.conditions) && source.conditions.length > 0) {
    blocks =
      source.operator === 'OR'
        ? [source.conditions]
        : source.conditions.map((c) => [c]);
    root = 'AND';
  } else if (source.condition !== undefined) {
    blocks = [[source]];
    root = 'AND';
  } else {
    return true;
  }
  if (root !== 'AND' && root !== 'OR') return undefined;
  const join = (
    values: Array<boolean | undefined>,
    and: boolean,
  ): boolean | undefined => {
    if (values.some((value) => value === !and)) return !and;
    if (values.some((value) => value === undefined)) return undefined;
    return and;
  };
  const active = blocks.filter((block) => block.length > 0);
  if (!active.length) return true;
  return join(
    active.map((block) =>
      join(
        block.map((c) =>
          conditionMatches(
            c,
            state,
            config,
            variables,
            currentCondition,
            selfBuff,
          ),
        ),
        root !== 'AND',
      ),
    ),
    root === 'AND',
  );
}

function selectItems(
  state: CraftingState,
  config: OptimizerConfig,
  currentCondition?: string,
): Array<{ item: NativeAutoUsePlanItem; toxicity: number }> | undefined {
  const plan = config.nativeAutoUsePlan;
  if (!plan) return [];
  const variables = getCraftingActionVariables(
    state,
    config,
    getConditionEffectsForConfig(config, currentCondition),
  );
  const limit =
    Math.floor(variables.pillsPerRound) - state.consumedPillsThisTurn;
  if (!Number.isFinite(limit)) return undefined;
  if (limit <= 0) return [];
  if (plan.unsupportedReason) return undefined;
  const slots = [...plan.slots];
  if (state.step === 0)
    slots.sort(
      (a, b) =>
        Number(!plan.items[a.item]?.action.reagentOnlyAtStepZero) -
        Number(!plan.items[b.item]?.action.reagentOnlyAtStepZero),
    );
  const selected: Array<{ item: NativeAutoUsePlanItem; toxicity: number }> = [];
  const claimed = new Map<string, number>();
  let toxicity = 0;
  for (const slot of slots) {
    if (selected.length >= limit) break;
    const item = plan.items[slot.item];
    if (!item) continue;
    const key = keyFor(item.action.itemName ?? slot.item);
    const used = claimed.get(key) ?? 0;
    if ((state.items.get(key) ?? 0) <= used) continue;
    if (item.action.reagentOnlyAtStepZero && state.step !== 0) continue;
    const tracked =
      state.nativeVariables?.[usageKey(slot.item)] ??
      plan.initialUsage[slot.item] ??
      0;
    if (
      slot.maxCount !== undefined &&
      slot.maxCount > 0 &&
      tracked + used >= slot.maxCount
    )
      continue;
    if (
      item.action.effects != null &&
      (!Array.isArray(item.action.effects) ||
        item.action.effects.some(
          (effect) =>
            !effect ||
            typeof effect.kind !== 'string' ||
            (effect.kind === 'createBuff' &&
              (!effect.buff ||
                !record(effect.buff) ||
                typeof effect.buff.name !== 'string' ||
                !effect.buff.name.trim())),
        ))
    )
      return undefined;
    const buffs =
      item.action.effects?.filter((effect) => effect.kind === 'createBuff') ??
      [];
    const match = ruleMatches(
      slot.rule,
      state,
      config,
      variables,
      currentCondition,
      buffs[0]?.buff?.name,
    );
    if (match === undefined) return undefined;
    if (!match) continue;
    if (
      buffs.some(
        (effect) =>
          effect.buff &&
          !effect.buff.canStack &&
          state.getBuffStacks(keyFor(effect.buff.name)) > 0,
      )
    )
      continue;
    const resistance = variables.resistance;
    if (
      !Number.isFinite(resistance) ||
      !Number.isFinite(item.toxicityBeforeResistance)
    )
      return undefined;
    const cost =
      item.toxicityBeforeResistance === 0
        ? 0
        : Math.max(
            1,
            Math.floor(
              (item.toxicityBeforeResistance *
                (100 - Math.min(resistance, 90))) /
                100,
            ),
          );
    if (toxicity + cost > state.maxToxicity - state.toxicity) continue;
    claimed.set(key, used + 1);
    toxicity += cost;
    selected.push({ item, toxicity: cost });
  }
  return selected;
}

/** Project the actual pre-technique hook, preserving branch probability mass. */
export function projectNativeAutoUseBranches(
  state: CraftingState,
  config: OptimizerConfig,
  currentCondition?: string,
): ActionOutcomeDistribution {
  const selected = selectItems(state, config, currentCondition);
  if (!selected) return { outcomes: [], unresolvedProbability: 1 };
  for (const { item } of selected) {
    const unsupportedReason = getUnsupportedTransitionReason(
      state,
      item.action,
      config,
      getConditionEffectsForConfig(config, currentCondition),
    );
    if (unsupportedReason)
      return { outcomes: [], unresolvedProbability: 1, unsupportedReason };
  }
  let outcomes = [{ state, probability: 1 }];
  let unresolvedProbability = 0;
  let unsupportedReason: string | undefined;
  for (const { item } of selected) {
    const next: ActionOutcomeDistribution['outcomes'] = [];
    for (const branch of outcomes) {
      // Selection uses the original state and budget, while effects run in slot
      // order. This is exactly how the native hook dispatches its selected list.
      const itemConfig = {
        ...config,
        pillsPerRound: Math.max(
          config.pillsPerRound ?? 1,
          branch.state.consumedPillsThisTurn + 1,
        ),
      };
      // The selector budgets every slot against the original resistance. The
      // consumePill reducer recomputes it after earlier selected items land.
      const paymentVariables = getCraftingActionVariables(
        branch.state,
        config,
        getConditionEffectsForConfig(config, currentCondition),
      );
      const toxicity =
        item.toxicityBeforeResistance > 0
          ? Math.max(
              1,
              Math.floor(
                (item.toxicityBeforeResistance *
                  (100 - Math.min(paymentVariables.resistance, 90))) /
                  100,
              ),
            )
          : 0;
      const distribution = applySkillOutcomes(
        branch.state,
        { ...item.action, toxicityCost: toxicity },
        itemConfig,
        getConditionEffectsForConfig(config, currentCondition),
        config.targetCompletion ?? 0,
        currentCondition,
        config.targetPerfection ?? 0,
      );
      unresolvedProbability +=
        branch.probability * distribution.unresolvedProbability;
      unsupportedReason ??= distribution.unsupportedReason;
      const mass =
        distribution.outcomes.reduce(
          (sum, child) => sum + child.probability,
          0,
        ) + distribution.unresolvedProbability;
      unresolvedProbability += branch.probability * Math.max(0, 1 - mass);
      for (const child of distribution.outcomes) {
        if (next.length >= 64) {
          unresolvedProbability += branch.probability * child.probability;
          continue;
        }
        const itemName =
          Object.keys(config.nativeAutoUsePlan?.items ?? {}).find(
            (name) => config.nativeAutoUsePlan?.items[name] === item,
          ) ??
          item.action.itemName ??
          item.action.key;
        const counter = usageKey(itemName);
        const nativeVariables = {
          ...child.state.nativeVariables,
          [counter]:
            (branch.state.nativeVariables?.[counter] ??
              config.nativeAutoUsePlan?.initialUsage[itemName] ??
              0) + 1,
        };
        next.push({
          state: child.state.copy({
            nativeVariables,
            items: config.trainingMode ? branch.state.items : child.state.items,
          }),
          probability: branch.probability * child.probability,
        });
      }
    }
    outcomes = next;
  }
  return {
    outcomes,
    unresolvedProbability,
    ...(unsupportedReason ? { unsupportedReason } : {}),
  };
}
