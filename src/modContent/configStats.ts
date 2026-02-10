import { CraftingEntity } from 'afnm-types';
import { parseGameNumber } from '../utils/largeNumbers';

export interface ResolvedBaseCraftingStats {
  baseControl: number;
  baseIntensity: number;
  rawControl: number;
  rawIntensity: number;
  realmModifier: number;
  source: 'entity_stats';
}

/**
 * Resolve baseline crafting stats for optimizer simulation.
 *
 * We treat entity stats as already realm-adjusted values. Applying realmModifier
 * again causes inflated predictions after load/reload paths where the game has
 * already materialized final stats.
 */
export function resolveBaseCraftingStats(
  entity: CraftingEntity,
): ResolvedBaseCraftingStats {
  const stats = (entity as any)?.stats;
  const rawControl = parseGameNumber(stats?.control, 10);
  const rawIntensity = parseGameNumber(stats?.intensity, 10);

  const rawModifier =
    Number((entity as any)?.realmModifier) ||
    Number((entity as any)?.craftingModifier) ||
    1;
  const realmModifier = Number.isFinite(rawModifier) ? rawModifier : 1;

  return {
    baseControl: rawControl,
    baseIntensity: rawIntensity,
    rawControl,
    rawIntensity,
    realmModifier,
    source: 'entity_stats',
  };
}
