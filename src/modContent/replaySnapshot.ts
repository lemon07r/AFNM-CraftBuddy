import { CraftingState } from '../optimizer';
import type { HarmonyDataSource } from './harmonyState';

function sanitizeForJson(
  value: unknown,
  seen: WeakSet<object> = new WeakSet(),
): unknown {
  if (value === undefined) return null;
  if (value === null) return null;
  const valueType = typeof value;
  if (
    valueType === 'number' ||
    valueType === 'string' ||
    valueType === 'boolean'
  ) {
    return value;
  }
  if (valueType === 'bigint') {
    return value.toString();
  }
  if (valueType === 'symbol') {
    return String(value);
  }
  if (valueType === 'function') {
    return '[Function]';
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (value instanceof Map) {
    const out: Record<string, unknown> = {};
    value.forEach((entry, key) => {
      out[String(key)] = sanitizeForJson(entry, seen);
    });
    return out;
  }
  if (value instanceof Set) {
    return Array.from(value).map((entry) => sanitizeForJson(entry, seen));
  }
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeForJson(entry, seen));
  }
  if (valueType === 'object') {
    const objectValue = value as Record<string, unknown>;
    if (seen.has(objectValue)) {
      return '[Circular]';
    }
    seen.add(objectValue);
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(objectValue)) {
      if (entry === undefined) continue;
      out[key] = sanitizeForJson(entry, seen);
    }
    seen.delete(objectValue);
    return out;
  }

  return String(value);
}

function mapToPlainObject<T>(
  map: Map<string, T>,
  serialize: (value: T) => unknown = (value) => value,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  map.forEach((value, key) => {
    out[key] = serialize(value);
  });
  return out;
}

export function buildStateSnapshot(
  state: CraftingState,
  harmonyDataSource: HarmonyDataSource,
): Record<string, unknown> {
  return {
    qi: state.qi,
    stability: state.stability,
    maxStability: state.maxStability,
    initialMaxStability: state.initialMaxStability,
    stabilityPenalty: state.stabilityPenalty,
    completion: state.completion,
    perfection: state.perfection,
    critChance: state.critChance,
    critMultiplier: state.critMultiplier,
    successChanceBonus: state.successChanceBonus,
    poolCostPercentage: state.poolCostPercentage,
    stabilityCostPercentage: state.stabilityCostPercentage,
    controlBuffTurns: state.controlBuffTurns,
    intensityBuffTurns: state.intensityBuffTurns,
    controlBuffMultiplier: state.controlBuffMultiplier,
    intensityBuffMultiplier: state.intensityBuffMultiplier,
    toxicity: state.toxicity,
    maxToxicity: state.maxToxicity,
    harmony: state.harmony,
    harmonyData: state.harmonyData ? sanitizeForJson(state.harmonyData) : null,
    harmonyDataSource,
    step: state.step,
    completionBonus: state.completionBonus,
    consumedPillsThisTurn: state.consumedPillsThisTurn,
    cooldowns: mapToPlainObject(state.cooldowns),
    items: mapToPlainObject(state.items),
    buffs: mapToPlainObject(state.buffs, (buff) => ({
      name: buff.name,
      stacks: buff.stacks,
    })),
    nativeVariables: state.nativeVariables
      ? sanitizeForJson(state.nativeVariables)
      : null,
  };
}
