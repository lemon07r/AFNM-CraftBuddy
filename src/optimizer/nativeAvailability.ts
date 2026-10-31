import type { CraftingState } from './state';
import { normalizeIdentifier } from './nameNormalization';

// Audited 0.7.18 CraftingTechnique fields. New fields require inspection before
// a worker (which has no native canUseAction callback) can certify the action.
const nativeFields = new Set([
  'name',
  'displayName',
  'icon',
  'poolCost',
  'noQiCost',
  'toxicityCost',
  'dropletCost',
  'stabilityCost',
  'noMaxStabilityLoss',
  'maxStabilityLossTooltip',
  'successChance',
  'cooldown',
  'buffCost',
  'conditionRequirement',
  'firstActionOnly',
  'minStability',
  'buffRequirement',
  'effects',
  'triggeredEffects',
  'type',
  'realm',
  'tooltip',
  'showCreatesBuff',
  'disableAtMaxStacks',
  'currentCooldown',
  'justClicked',
  'mastery',
  'masteryKindPools',
  'upgradeMasteries',
  'upgradeKey',
]);
type NativeGate = { buff: { name: string }; amount: number };
interface NativeTechnique {
  firstActionOnly?: boolean;
  minStability?: number;
  disableAtMaxStacks?: boolean;
  conditionRequirement?: string;
  dropletCost?: number;
  toxicityCost?: number;
  buffRequirement?: NativeGate;
  buffCost?: NativeGate;
  effects?: Array<{
    kind: string;
    buff?: { name: string; maxStacks?: number };
  }>;
}
function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
const finite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

export function unsupportedNativeTechnique(value: unknown): string | undefined {
  if (value == null) return undefined;
  if (!object(value)) return 'Unsupported native technique shape';
  for (const key of Object.keys(value))
    if (!nativeFields.has(key) && value[key] !== undefined)
      return `Unsupported native technique field: ${key}`;
  for (const key of [
    'firstActionOnly',
    'disableAtMaxStacks',
    'noQiCost',
    'noMaxStabilityLoss',
  ])
    // Mechanics flags must not depend on truthiness or JSON null coercion.
    if (value[key] !== undefined && typeof value[key] !== 'boolean')
      return `Unsupported native availability field: ${key}`;
  for (const key of [
    'minStability',
    'dropletCost',
    'toxicityCost',
    'currentCooldown',
    'poolCost',
    'successChance',
    'stabilityCost',
    'cooldown',
  ])
    // Explicit null is not an omitted field: JSON converts NaN/Infinity to
    // null, so accepting it would launder malformed replay/worker payloads.
    if (value[key] !== undefined && !finite(value[key]))
      return `Unsupported native availability field: ${key}`;
  if (
    value.conditionRequirement != null &&
    ![
      'neutral',
      'positive',
      'veryPositive',
      'negative',
      'veryNegative',
    ].includes(String(value.conditionRequirement))
  )
    return 'Unsupported native condition requirement';
  for (const key of ['buffRequirement', 'buffCost']) {
    const gate = value[key];
    if (gate == null) continue;
    if (
      !object(gate) ||
      !object(gate.buff) ||
      typeof gate.buff.name !== 'string' ||
      !gate.buff.name.trim() ||
      !finite(gate.amount) ||
      Object.keys(gate).some((k) => k !== 'buff' && k !== 'amount')
    )
      return `Unsupported native ${key}`;
  }
  if (value.effects != null && !Array.isArray(value.effects))
    return 'Unsupported native effects';
  for (const effect of (value.effects ?? []) as unknown[]) {
    if (!object(effect) || typeof effect.kind !== 'string')
      return 'Unsupported native effect';
    if (
      effect.kind === 'createBuff' &&
      (!object(effect.buff) ||
        typeof effect.buff.name !== 'string' ||
        (effect.buff.maxStacks !== undefined && !finite(effect.buff.maxStacks)))
    )
      return 'Unsupported native max-stack gate';
  }
  if (
    value.triggeredEffects != null &&
    (!Array.isArray(value.triggeredEffects) ||
      value.triggeredEffects.length > 0)
  )
    return 'Unsupported native technique triggered effects';
  return undefined;
}

/** Local mirror of dcu's raw gates. Costs/cooldowns come from the simulated
 * state and projected skill, never the stale native currentCooldown snapshot. */
export function meetsNativeAvailability(
  value: unknown,
  state: CraftingState,
  currentCondition: string | undefined,
): boolean {
  if (value == null) return true;
  if (unsupportedNativeTechnique(value)) return false;
  const t = value as NativeTechnique;
  if (t.firstActionOnly && state.step !== 0) return false;
  if (t.minStability != null && state.stability <= t.minStability) return false;
  if (t.conditionRequirement && currentCondition !== t.conditionRequirement)
    return false;
  if (state.qiDroplets < (t.dropletCost ?? 0)) return false;
  if (t.toxicityCost && state.maxToxicity - state.toxicity < t.toxicityCost)
    return false;
  for (const gate of [t.buffRequirement, t.buffCost])
    if (
      gate &&
      state.getBuffStacks(normalizeIdentifier(gate.buff.name)) < gate.amount
    )
      return false;
  if (
    t.disableAtMaxStacks &&
    t.effects?.some(
      (e) =>
        e.kind === 'createBuff' &&
        e.buff &&
        e.buff.maxStacks != null &&
        state.getBuffStacks(normalizeIdentifier(e.buff.name)) > 0 &&
        state.getBuffStacks(normalizeIdentifier(e.buff.name)) >=
          e.buff.maxStacks,
    )
  )
    return false;
  return true;
}
