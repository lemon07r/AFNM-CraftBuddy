import {
  isSupportedCraftingExpression,
  isCeladonStackGainTrigger,
  CELADON_EMBER_NAMES,
} from './gameTypes';
import { unsupportedNativeTechnique } from './nativeAvailability';
import { normalizeIdentifier } from './nameNormalization';

const techniqueKinds = new Set([
  'completion',
  'perfection',
  'stability',
  'maxStability',
  'pool',
  'createBuff',
  'consumeBuff',
  'cleanseToxicity',
]);
const buffKinds = new Set([
  'completion',
  'perfection',
  'stability',
  'maxStability',
  'pool',
  'createBuff',
  'addStack',
  'negate',
  'changeToxicity',
  'setState',
]);
const triggerKinds = new Set([
  'actionFailed',
  'poolSpent',
  'poolRestored',
  'stabilitySpent',
  'stabilityRestored',
  'completionGained',
  'perfectionGained',
]);
const masteryKinds = new Set([
  'control',
  'intensity',
  'critchance',
  'critmultiplier',
  'poolcost',
  'stabilitycost',
  'successchance',
  'upgrade',
  'effect',
]);
const scalingKeys = new Set([
  'value',
  'stat',
  'scaling',
  'eqn',
  'customScaling',
  'additiveEqn',
  'multiplier',
  'scalingMax',
  'roundToInteger',
  'scalesWithRoomEffectiveness',
  'scalesWithCharisma',
  'charismaScalingPivot',
  'isItem',
  'multiplyByStanceLength',
  'max',
  'divideByStanceLength',
  'upgradeKey',
  'increment',
]);
class UnsupportedPayload extends Error {
  constructor(message: string) {
    super(message);
    Object.setPrototypeOf(this, UnsupportedPayload.prototype);
  }
}
const fail = (message: string): never => {
  throw new UnsupportedPayload(message);
};
function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return fail(`Unsupported ${label} shape`);
  return value as Record<string, unknown>;
}
function finite(value: unknown, label: string): void {
  if (typeof value !== 'number' || !Number.isFinite(value))
    fail(`Unsupported ${label} value`);
}
function list(value: unknown, label: string): unknown[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) return fail(`Unsupported ${label} list`);
  return value;
}
function expression(value: unknown): void {
  if (!isSupportedCraftingExpression(value))
    fail('Unsupported crafting expression');
}

/** Do not license arbitrary stack-event programs. This verified block reads
 * only the captured Ember counts, maximum Qi and literal payout values. */
function celadonBlock(value: unknown): void {
  const effects = list(value, 'Celadon effects');
  if (effects.length !== 6) fail('Unsupported Celadon stack-trigger block');
  const expectedCondition = CELADON_EMBER_NAMES.map(
    (name) => `${name.replace(/[^\w]/g, '_')}>=1`,
  ).join('&&');
  const seen = new Set<string>();
  effects.forEach((value, index) => {
    const e = record(value, 'Celadon effect');
    const c = record(e.condition, 'Celadon condition');
    if (
      c.kind !== 'condition' ||
      typeof c.condition !== 'string' ||
      c.condition.replace(/\band\b/g, '&&').replace(/\s/g, '') !==
        expectedCondition
    )
      fail('Unsupported Celadon stack-trigger condition');
    const scaling = record(index < 2 ? e.amount : e.stacks, 'Celadon scaling');
    finite(scaling.value, 'Celadon scaling');
    if (index < 2 && (scaling.value as number) < 0)
      fail('Unsupported negative Celadon payout');
    if (
      Object.entries(scaling).some(
        ([key, value]) => value != null && !['value', 'stat'].includes(key),
      )
    )
      fail('Unsupported Celadon stack-trigger scaling');
    if (index === 0) {
      if (e.kind !== 'pool' || scaling.stat !== 'maxpool')
        fail('Unsupported Celadon Qi payout');
    } else if (index === 1) {
      if (e.kind !== 'stability' || scaling.stat != null)
        fail('Unsupported Celadon stability payout');
    } else {
      const b = record(e.buff, 'Celadon ember');
      if (
        e.kind !== 'createBuff' ||
        scaling.value !== -1 ||
        scaling.stat != null ||
        !CELADON_EMBER_NAMES.includes(
          b.name as (typeof CELADON_EMBER_NAMES)[number],
        ) ||
        seen.has(String(b.name))
      )
        fail('Unsupported Celadon ember consumption');
      seen.add(String(b.name));
    }
  });
}

/** Conservative schema preflight for certificates, never for legacy EV previews.
 * An unsupported payload makes the entire action unresolved, including effects
 * gated off on this turn. We do not cache mutable live definitions across calls.
 */
export function findUnsupportedCraftingPayload(
  skillValue: unknown,
  activeBuffs: readonly unknown[],
  conditionEffects: unknown,
): string | undefined {
  const doneBuffs = new Set<object>(),
    visiting = new Set<object>();
  // Progress gains are reconstructed after a technique block. Never certify
  // programs whose later effects/callbacks depend on intermediate bar values.
  const progressPatterns = {
    completion: /\bcompletion(?:_?percentage)?\b/i,
    perfection: /\bperfection(?:_?percentage)?\b/i,
  };
  type ProgressBar = keyof typeof progressPatterns;
  const bars: ProgressBar[] = ['completion', 'perfection'];
  function readsProgress(
    value: unknown,
    bar: ProgressBar,
    key = '',
    includeLiveGate = true,
  ): boolean {
    if (typeof value === 'string')
      return (
        ['eqn', 'additiveEqn', 'condition', 'stat', 'scaling'].includes(key) &&
        progressPatterns[bar].test(value)
      );
    if (Array.isArray(value))
      return value.some((entry) =>
        readsProgress(entry, bar, key, includeLiveGate),
      );
    if (!value || typeof value !== 'object') return false;
    const object = value as Record<string, unknown>;
    if (includeLiveGate && key === 'condition' && object.kind === bar)
      return true;
    if (
      key === 'initialState' &&
      Object.values(object).some(
        (v) => typeof v === 'string' && progressPatterns[bar].test(v),
      )
    )
      return true;
    return Object.entries(object).some(([k, v]) =>
      readsProgress(v, bar, k, includeLiveGate),
    );
  }
  function enter(value: object, depth: number): void {
    if (depth > 64 || visiting.has(value))
      fail('Unsupported cyclic or excessively deep crafting payload');
    visiting.add(value);
  }
  function scaling(value: unknown, depth = 0): void {
    if (value === undefined || value === null) return;
    const s = record(value, 'scaling');
    enter(s, depth);
    for (const key of Object.keys(s))
      if (s[key] !== undefined && !scalingKeys.has(key))
        fail(`Unsupported scaling field: ${key}`);
    finite(s.value, 'scaling');
    for (const key of ['stat', 'scaling', 'upgradeKey'])
      if (s[key] != null && typeof s[key] !== 'string')
        fail(`Unsupported scaling ${key}`);
    for (const key of ['eqn', 'additiveEqn'])
      if (s[key] != null) expression(s[key]);
    for (const key of ['charismaScalingPivot', 'increment'])
      if (s[key] != null) finite(s[key], key);
    for (const key of [
      'roundToInteger',
      'scalesWithRoomEffectiveness',
      'scalesWithCharisma',
      'isItem',
      'multiplyByStanceLength',
      'divideByStanceLength',
    ])
      if (s[key] != null && typeof s[key] !== 'boolean')
        fail(`Unsupported scaling ${key}`);
    for (const key of ['multiplier', 'scalingMax', 'max'])
      scaling(s[key], depth + 1);
    if (s.customScaling != null) {
      const custom = record(s.customScaling, 'custom scaling');
      if (
        Object.keys(custom).some(
          (key) => !['scaling', 'multiplier', 'upgradeKey'].includes(key),
        )
      )
        fail('Unsupported custom scaling field');
      finite(custom.multiplier, 'custom scaling multiplier');
      if (typeof custom.scaling !== 'string')
        fail('Unsupported custom scaling variable');
      if (custom.upgradeKey != null && typeof custom.upgradeKey !== 'string')
        fail('Unsupported custom scaling upgrade key');
    }
    visiting.delete(s);
  }
  function condition(value: unknown): void {
    if (value === undefined || value === null) return;
    const c = record(value, 'condition');
    if (c.kind === 'chance') finite(c.percentage, 'chance');
    else if (c.kind === 'condition') expression(c.condition);
    else if (c.kind === 'buff') {
      if (
        c.buff !== 'self' &&
        typeof record(c.buff, 'condition buff').name !== 'string'
      )
        fail('Unsupported condition buff');
      finite(c.count, 'buff condition count');
      if (!['more', 'less', 'equal'].includes(String(c.mode)))
        fail('Unsupported buff condition mode');
    } else if (
      ['pool', 'completion', 'perfection', 'stability', 'toxicity'].includes(
        String(c.kind),
      )
    ) {
      finite(c.percentage, 'condition percentage');
      if (!['more', 'less'].includes(String(c.mode)))
        fail('Unsupported resource condition mode');
    } else fail(`Unsupported condition kind: ${String(c.kind)}`);
  }
  function effect(value: unknown, buffEffect: boolean, depth: number): void {
    const e = record(value, 'effect');
    if (!(buffEffect ? buffKinds : techniqueKinds).has(String(e.kind)))
      fail(
        `Unsupported ${buffEffect ? 'buff' : 'technique'} effect kind: ${String(e.kind)}`,
      );
    condition(e.condition);
    for (const key of ['amount', 'stacks', 'value']) scaling(e[key], depth + 1);
    if (e.kind === 'createBuff') buff(e.buff, depth + 1);
    if (
      e.kind === 'consumeBuff' &&
      typeof record(e.buff, 'consumed buff').name !== 'string'
    )
      fail('Unsupported consumed buff');
    if (e.kind === 'setState') {
      if (typeof e.key !== 'string') fail('Unsupported setState key');
      if (e.mode !== undefined && e.mode !== 'set' && e.mode !== 'add')
        fail('Unsupported setState mode');
      if (list(e.keys, 'setState keys').some((key) => typeof key !== 'string'))
        fail('Unsupported setState keys');
    }
  }
  function buff(value: unknown, depth = 0): void {
    const b = record(value, 'buff definition');
    if (doneBuffs.has(b)) return;
    enter(b, depth);
    if (typeof b.name !== 'string') fail('Unsupported buff name');
    if (b.additionalVariables != null)
      for (const value of Object.values(
        record(b.additionalVariables, 'buff variables'),
      ))
        finite(value, 'buff variable');
    if (b.stats != null)
      for (const s of Object.values(record(b.stats, 'buff stats')))
        scaling(s, depth + 1);
    if (b.initialState != null)
      for (const e of Object.values(record(b.initialState, 'initial state')))
        expression(e);
    for (const key of [
      'effects',
      'onFusion',
      'onRefine',
      'onStabilize',
      'onSupport',
    ])
      for (const e of list(b[key], key)) effect(e, true, depth + 1);
    for (const value of list(b.triggeredEffects, 'triggered effects')) {
      const block = record(value, 'trigger');
      if (isCeladonStackGainTrigger(block.trigger)) celadonBlock(block.effects);
      else if (!triggerKinds.has(String(block.trigger)))
        fail(`Unsupported crafting trigger: ${String(block.trigger)}`);
      for (const e of list(block.effects, 'trigger effects'))
        effect(e, true, depth + 1);
    }
    visiting.delete(b);
    doneBuffs.add(b);
  }
  try {
    const skill = record(skillValue, 'skill');
    const nativeReason = unsupportedNativeTechnique(skill.nativeTechnique);
    if (nativeReason) fail(nativeReason);
    if (skill.nativeTechnique != null) {
      const native = record(skill.nativeTechnique, 'native technique');
      for (const e of list(native.effects, 'native effects'))
        effect(e, false, 0);
      // Gates alone are insufficient if the normalized transition would omit
      // the corresponding payment. Native construction has already applied
      // masteries to costs, so check the directly copied payment fields only.
      for (const key of ['dropletCost', 'toxicityCost'])
        if (native[key] != null && native[key] !== (skill[key] ?? 0))
          fail(`Native payment differs from projected ${key}`);
      if (native.buffCost != null) {
        const rawCost = record(native.buffCost, 'native buff cost');
        const rawBuff = record(rawCost.buff, 'native cost buff');
        const cost = record(skill.buffCost, 'projected buff cost');
        if (
          cost.buffName !== normalizeIdentifier(String(rawBuff.name)) ||
          cost.amount !== rawCost.amount ||
          cost.consumeAll
        )
          fail('Native buff payment differs from projected cost');
      }
    }
    for (const e of list(skill.effects, 'technique effects'))
      effect(e, false, 0);
    if (skill.grantedBuff != null) buff(skill.grantedBuff);
    for (const value of list(skill.masteryEntries, 'masteries')) {
      const m = record(value, 'mastery');
      if (!masteryKinds.has(String(m.kind)))
        fail(`Unsupported mastery kind: ${String(m.kind)}`);
      condition(m.condition);
      for (const key of ['percentage', 'change'])
        if (m[key] != null) finite(m[key], `mastery ${key}`);
      if (m.upgradeKey != null && typeof m.upgradeKey !== 'string')
        fail('Unsupported mastery upgrade key');
      if (m.shouldMultiply != null && typeof m.shouldMultiply !== 'boolean')
        fail('Unsupported mastery multiplier mode');
      if (m.kind === 'effect')
        for (const e of list(m.effects, 'mastery effects')) effect(e, false, 0);
    }
    for (const definition of activeBuffs)
      if (definition !== undefined) buff(definition);
    for (const value of list(conditionEffects, 'condition effects')) {
      const effect = record(value, 'condition effect');
      if (
        !['control', 'intensity', 'pool', 'stability', 'chance'].includes(
          String(effect.kind),
        )
      )
        fail(`Unsupported condition effect: ${String(effect.kind)}`);
      finite(
        effect.kind === 'chance' ? effect.bonus : effect.multiplier,
        'condition modifier',
      );
    }
    const resourceProgress = new Set<ProgressBar>();
    const barListeners = new Map<string, Set<ProgressBar>>();
    for (const definition of Array.from(doneBuffs)) {
      const b = record(definition, 'buff');
      for (const value of list(b.triggeredEffects, 'triggered effects')) {
        const block = record(value, 'trigger');
        for (const bar of bars) {
          if (block.trigger !== `${bar}Gained`) continue;
          const name = normalizeIdentifier(String(b.name));
          const listeners = barListeners.get(name) ?? new Set<ProgressBar>();
          listeners.add(bar);
          barListeners.set(name, listeners);
        }
        if (
          [
            'poolSpent',
            'poolRestored',
            'stabilitySpent',
            'stabilityRestored',
          ].includes(String(block.trigger))
        )
          for (const bar of bars)
            if (readsProgress(block.effects, bar)) resourceProgress.add(bar);
      }
    }
    const blocks = [list(skill.effects, 'technique effects')];
    // Masteries share a captured variable frame while native progress gates
    // can read live bars. Do not conflate those scopes across mastery blocks.
    const masteryProgress = new Set<ProgressBar>();
    for (const value of list(skill.masteryEntries, 'masteries')) {
      const m = record(value, 'mastery');
      for (const bar of Array.from(masteryProgress))
        if (readsProgress(m, bar, '', false))
          fail('Unsupported progress observation order across mastery blocks');
      if (m.kind === 'effect') {
        const effects = list(m.effects, 'mastery effects');
        blocks.push(effects);
        for (const value of effects) {
          const kind = record(value, 'mastery effect').kind;
          if (kind === 'completion' || kind === 'perfection')
            masteryProgress.add(kind);
        }
      }
    }
    for (const block of blocks) {
      const changed = new Set<ProgressBar>();
      const blockBars = new Set(
        block.map((value) => record(value, 'effect').kind),
      );
      for (const value of block) {
        const e = record(value, 'effect');
        const subscriptions =
          e.kind === 'createBuff' || e.kind === 'consumeBuff'
            ? barListeners.get(
                normalizeIdentifier(String(record(e.buff, 'effect buff').name)),
              )
            : undefined;
        if (
          e.kind === 'createBuff' &&
          subscriptions &&
          Array.from(subscriptions).some((bar) => blockBars.has(bar))
        )
          fail(
            'Unsupported progress trigger subscription order in crafting effects',
          );
        for (const bar of Array.from(changed)) {
          if (
            (e.condition != null &&
              record(e.condition, 'condition').kind === bar) ||
            (resourceProgress.has(bar) &&
              ['pool', 'stability', 'createBuff'].includes(String(e.kind)))
          )
            fail(
              'Unsupported intermediate progress observation order in crafting effects',
            );
          if (e.kind === 'consumeBuff' && subscriptions?.has(bar))
            fail(
              'Unsupported progress trigger subscription order in crafting effects',
            );
        }
        if (e.kind === 'completion' || e.kind === 'perfection')
          changed.add(e.kind);
      }
    }
  } catch (error) {
    if (error instanceof UnsupportedPayload) return error.message;
    throw error;
  }
  return undefined;
}
