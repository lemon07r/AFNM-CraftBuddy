import type { CraftingEntity, ProgressState } from 'afnm-types';
import {
  BuffType,
  type NativeAutoUsePlan,
  type SkillDefinition,
} from '../optimizer';
import type { InventoryItemLike } from './craftStateExtraction';

const REALMS = [
  'mundane',
  'bodyForging',
  'meridianOpening',
  'qiCondensation',
  'coreFormation',
  'pillarCreation',
  'lifeFlourishing',
  'worldShaping',
  'innerGenesis',
  'soulAscension',
];
const record = (value: unknown): Record<string, unknown> | undefined =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
const keyFor = (name: string): string =>
  name.toLowerCase().trim().replace(/\s+/g, '_');

/** Serialize native slot rules and item definitions; no game actions run here. */
export function extractNativeAutoUsePlan(
  rootState: unknown,
  entity: CraftingEntity,
  progress: ProgressState,
  inventory: readonly InventoryItemLike[],
  gameItems: Record<string, unknown>,
  recipeConditionTypes?: readonly { name: string }[],
): { plan?: NativeAutoUsePlan; inventoryCounts: Map<string, number> } {
  const owner = record(record(record(rootState)?.player)?.player);
  const inventoryCounts = new Map<string, number>();
  if (owner?.craftingAutoUseEnabled === false) return { inventoryCounts };
  const slots = record(owner?.currentCraftingAutoUseLoadout)?.slots;
  if (!Array.isArray(slots) || !slots.length) return { inventoryCounts };
  const plan: NativeAutoUsePlan = {
    slots: [],
    items: {},
    initialUsage: {},
    baseResistance: Number(entity.stats?.resistance ?? 0),
    recipeConditionNames: recipeConditionTypes?.map(
      (condition) => condition.name,
    ),
    recipeConditionName: (() => {
      const recipeStats = record(
        record(record(rootState)?.crafting)?.recipeStats,
      );
      const name = record(recipeStats?.conditionType)?.name;
      return typeof name === 'string' ? name : undefined;
    })(),
  };
  for (const raw of slots) {
    const slot = record(raw);
    if (!slot || typeof slot.item !== 'string' || !slot.item) continue;
    const name = slot.item;
    const count = inventory
      .filter((item) => item.name === name)
      .reduce((sum, item) => sum + item.stacks, 0);
    if (!(count > 0)) continue;
    const item = record(gameItems[name]);
    if (!item) {
      plan.unsupportedReason = `Native auto-use item ${name} is not available in the game item registry.`;
      continue;
    }
    if (
      item.kind !== 'reagent' &&
      !(item.kind === 'pill' && item.pillKind === 'crafting')
    )
      continue;
    if (!Array.isArray(item.effects)) {
      plan.unsupportedReason = `Native auto-use item ${name} has no readable effects.`;
      continue;
    }
    const playerRealm = REALMS.indexOf(entity.realm);
    const itemRealm = REALMS.indexOf(String(item.realm));
    if (item.realm !== 'any' && (playerRealm < 0 || itemRealm < 0)) {
      plan.unsupportedReason = `Native auto-use item ${name} has unsupported realm scaling.`;
      continue;
    }
    const key = keyFor(name);
    const action: SkillDefinition = {
      name: `Use ${name}`,
      key: `item_${key}`,
      itemName: key,
      actionKind: 'item',
      consumesTurn: false,
      reagentOnlyAtStepZero: item.kind === 'reagent',
      qiCost: 0,
      stabilityCost: 0,
      successChance: 1,
      baseCompletionGain: 0,
      basePerfectionGain: 0,
      stabilityGain: 0,
      maxStabilityChange: 0,
      buffType: BuffType.NONE,
      buffDuration: 0,
      buffMultiplier: 1,
      type: 'support',
      effects: item.effects as SkillDefinition['effects'],
    };
    plan.slots.push({
      item: name,
      maxCount: typeof slot.maxCount === 'number' ? slot.maxCount : undefined,
      rule: slot,
    });
    plan.items[name] = {
      action,
      toxicityBeforeResistance:
        Number(item.toxicity ?? 0) *
        (item.realm === 'any'
          ? 1
          : 1 + Math.max(0, itemRealm - playerRealm) * 0.3),
    };
    plan.initialUsage[name] = progress.pillTracking?.[name] ?? 0;
    inventoryCounts.set(key, count);
  }
  return {
    plan: plan.slots.length || plan.unsupportedReason ? plan : undefined,
    inventoryCounts,
  };
}
