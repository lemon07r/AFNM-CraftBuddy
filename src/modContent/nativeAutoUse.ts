/**
 * CraftBuddy - Native crafting auto-use contract (AFNM 0.7.5)
 *
 * 0.7.5 added a native crafting auto-use loadout: the player configures slots on
 * `player.player.currentCraftingAutoUseLoadout`, and the game applies the
 * matching pills/reagents *immediately before* every technique dispatch. It is a
 * pre-technique hook, not a background timer.
 *
 * This module owns the contract shared by the controller, the executor and the
 * craft-state extraction seam: what the loadout covers (so CraftBuddy never
 * proposes the same consumption) and which items it will actually apply on the
 * current turn (so a native consumption is not mistaken for the technique
 * landing).
 *
 * The selection rules mirror the runtime selector verbatim; see
 * `docs/project/RUNTIME_EVIDENCE_075.md` section 1 for the extracted source and
 * the rule table this file implements.
 */

/**
 * What the native crafting auto-use loadout will do on the next technique.
 *
 * `coveredItemNames` is the set CraftBuddy must not also consume: proposing an
 * item the loadout already handles is the duplicate-consumption bug.
 */
export interface NativeAutoUseStatus {
  /** Whether a loadout with at least one usable slot is configured. */
  readonly active: boolean;
  /** Number of configured slots, including ones that cannot fire right now. */
  readonly slotCount: number;
  /** Normalized item names the native loadout may consume. */
  readonly coveredItemNames: ReadonlySet<string>;
  /** Runtime `pillsPerRound` ceiling on how many items one turn can apply. */
  readonly pillsPerRound: number;
  /** Runtime `maxtoxicity - toxicity` headroom the selection stops at. */
  readonly availableToxicity: number;
  /** Training mode applies items without removing them from the inventory. */
  readonly trainingMode: boolean;
}

/**
 * The "no native loadout" status.
 *
 * Used as the default on runtime snapshots so the absence of a reading is
 * explicit and every consumer sees the same shape.
 */
export const INACTIVE_NATIVE_AUTO_USE: NativeAutoUseStatus = {
  active: false,
  slotCount: 0,
  coveredItemNames: new Set<string>(),
  pillsPerRound: 0,
  availableToxicity: 0,
  trainingMode: false,
};

/** A single configured auto-use row, as stored on the loadout. */
export interface NativeAutoUseSlot {
  /** Raw inventory item name, exactly as the game stores it. */
  readonly item?: string;
  /** Per-craft usage ceiling; `0` and `undefined` both mean "no limit". */
  readonly maxCount?: number;
  /**
   * Inline condition group the runtime evaluates before applying the slot.
   *
   * CraftBuddy cannot evaluate it without the game's condition engine, so it is
   * kept opaque here and treated as satisfiable unless a caller injects a real
   * evaluator.
   */
  readonly blocks?: unknown;
  readonly conditions?: unknown;
}

/** One projected native consumption. */
export interface NativeAutoUseSelection {
  /** Index of the slot in the loadout, before the step-0 reagent sort. */
  readonly rowIndex: number;
  /** Raw item name, as stored on the slot. */
  readonly itemName: string;
  /** Normalized item name, matching `SkillDefinition.itemName`. */
  readonly itemKey: string;
  /** Toxicity the runtime would charge for this application. */
  readonly toxicity: number;
}

export interface NativeAutoUseInventoryEntry {
  readonly name?: string;
  readonly stacks?: number;
}

export interface NativeAutoUseProjectionInput {
  readonly slots: readonly NativeAutoUseSlot[];
  /** `progressState.step`; reagents are only applied on step 0. */
  readonly step: number;
  /** `progressState.consumedPills`, already spent from this turn's budget. */
  readonly consumedPills: number;
  /** Aggregated `pillsPerRound`; the runtime defaults it to 1, not 0. */
  readonly pillsPerRound: number;
  /** `maxtoxicity - toxicity`. */
  readonly availableToxicity: number;
  /** `progressState.pillTracking`, the per-craft usage counter. */
  readonly pillTracking?: Readonly<Record<string, number>>;
  readonly inventory: readonly NativeAutoUseInventoryEntry[];
  /** Resolves the crafting kind of an item; unknown items are not applied. */
  readonly getItemKind?: (itemName: string) => string | undefined;
  /** Scaled per-item toxicity; defaults to 0 so an absent resolver never gates. */
  readonly getItemToxicity?: (itemName: string) => number;
  /**
   * Slot condition predicate. Defaults to `true`, matching the conservative
   * assumption that the native loadout will fire: over-estimating native
   * consumption keeps CraftBuddy from duplicating it.
   */
  readonly isSlotConditionMet?: (
    slot: NativeAutoUseSlot,
    itemName: string,
  ) => boolean;
  /** Whether the item's effects are already satisfied on the player. */
  readonly isEffectAlreadySatisfied?: (itemName: string) => boolean;
}

const CRAFTING_ITEM_KINDS = new Set(['pill', 'reagent']);

/**
 * Normalize an item name to the optimizer's `itemName` form.
 *
 * `convertGameItemsToActions` keys item actions this way, so the covered set and
 * the action space compare on the same string.
 */
export function normalizeAutoUseItemName(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_');
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function readNumber(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readSlots(value: unknown): NativeAutoUseSlot[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => readRecord(entry))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry))
    .map((entry) => ({
      item: typeof entry.item === 'string' ? entry.item : undefined,
      maxCount: typeof entry.maxCount === 'number' ? entry.maxCount : undefined,
      blocks: entry.blocks,
      conditions: entry.conditions,
    }));
}

function readInventory(value: unknown): NativeAutoUseInventoryEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => readRecord(entry))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry))
    .map((entry) => ({
      name: typeof entry.name === 'string' ? entry.name : undefined,
      stacks: readNumber(entry.stacks, 0),
    }));
}

function totalStacks(
  inventory: readonly NativeAutoUseInventoryEntry[],
  itemName: string,
): number {
  return inventory.reduce(
    (sum, entry) =>
      entry?.name === itemName ? sum + readNumber(entry.stacks, 0) : sum,
    0,
  );
}

function defaultItemKindResolver(itemName: string): string | undefined {
  const items = readRecord(
    readRecord(
      readRecord((globalThis as Record<string, unknown>).modAPI)?.gameData,
    )?.items,
  );
  const kind = readRecord(items?.[itemName])?.kind;
  return typeof kind === 'string' ? kind : undefined;
}

/**
 * Mirror the runtime's slot selection for the current turn.
 *
 * Implements the rule order from `RUNTIME_EVIDENCE_075.md` section 1.2. The two
 * rules that need the game's own evaluators - the slot condition expression and
 * the "effects already satisfied" check - are injectable and default to
 * permissive, so an unmodelled predicate makes CraftBuddy expect *more* native
 * consumption rather than less.
 */
export function projectNativeAutoUse(
  input: NativeAutoUseProjectionInput,
): readonly NativeAutoUseSelection[] {
  const slots = input.slots ?? [];
  if (slots.length === 0) {
    return [];
  }

  const budget =
    Math.floor(readNumber(input.pillsPerRound, 1)) -
    readNumber(input.consumedPills, 0);
  if (budget <= 0) {
    return [];
  }

  const getItemKind = input.getItemKind ?? defaultItemKindResolver;
  const isReagent = (slot: NativeAutoUseSlot | undefined): boolean =>
    slot?.item ? getItemKind(slot.item) === 'reagent' : false;

  const isFirstStep = readNumber(input.step, 0) === 0;
  const order = slots.map((_slot, index) => index);
  if (isFirstStep) {
    // Step 0 puts reagents first, stable within each group.
    order.sort((left, right) => {
      const leftRank = isReagent(slots[left]) ? 0 : 1;
      const rightRank = isReagent(slots[right]) ? 0 : 1;
      return leftRank === rightRank ? left - right : leftRank - rightRank;
    });
  }

  const claimedStacks = new Map<string, number>();
  const usedThisTurn = new Map<string, number>();
  const selected: NativeAutoUseSelection[] = [];
  let spentToxicity = 0;

  for (const rowIndex of order) {
    if (selected.length >= budget) {
      break;
    }

    const slot = slots[rowIndex];
    const itemName = slot?.item;
    if (!slot || !itemName) {
      continue;
    }

    const claimed = claimedStacks.get(itemName) ?? 0;
    if (totalStacks(input.inventory ?? [], itemName) - claimed <= 0) {
      continue;
    }

    const kind = getItemKind(itemName);
    if (!kind || !CRAFTING_ITEM_KINDS.has(kind)) {
      continue;
    }
    if (kind === 'reagent' && !isFirstStep) {
      continue;
    }

    const maxCount = slot.maxCount;
    if (maxCount !== undefined && maxCount > 0) {
      const tracked = readNumber(input.pillTracking?.[itemName], 0);
      if (tracked + (usedThisTurn.get(itemName) ?? 0) >= maxCount) {
        continue;
      }
    }

    if (input.isSlotConditionMet && !input.isSlotConditionMet(slot, itemName)) {
      continue;
    }
    if (input.isEffectAlreadySatisfied?.(itemName)) {
      continue;
    }

    const toxicity = Math.max(
      0,
      readNumber(input.getItemToxicity?.(itemName), 0),
    );
    if (toxicity + spentToxicity > readNumber(input.availableToxicity, 0)) {
      // The runtime keeps scanning later slots instead of stopping here.
      continue;
    }

    claimedStacks.set(itemName, claimed + 1);
    usedThisTurn.set(itemName, (usedThisTurn.get(itemName) ?? 0) + 1);
    spentToxicity += toxicity;
    selected.push({
      rowIndex,
      itemName,
      itemKey: normalizeAutoUseItemName(itemName),
      toxicity,
    });
  }

  return selected;
}

export interface ReadNativeAutoUseOptions {
  /** Resolves the crafting kind of an item; defaults to the ModAPI item table. */
  readonly getItemKind?: (itemName: string) => string | undefined;
}

interface StoreLike {
  getState?: () => unknown;
}

/**
 * Resolve the live native auto-use status from the game store.
 *
 * Every hop is optional-chained: a store that cannot be read reports the
 * inactive status, which leaves CraftBuddy behaving exactly as it does without a
 * loadout instead of guessing.
 */
export function readNativeAutoUseStatus(
  store: unknown,
  options: ReadNativeAutoUseOptions = {},
): NativeAutoUseStatus {
  const getState = (store as StoreLike | null | undefined)?.getState;
  if (typeof getState !== 'function') {
    return INACTIVE_NATIVE_AUTO_USE;
  }

  let state: Record<string, unknown> | undefined;
  try {
    state = readRecord(getState.call(store));
  } catch {
    return INACTIVE_NATIVE_AUTO_USE;
  }
  if (!state) {
    return INACTIVE_NATIVE_AUTO_USE;
  }

  const player = readRecord(readRecord(state.player)?.player);
  const slots = readSlots(
    readRecord(player?.currentCraftingAutoUseLoadout)?.slots,
  );
  if (slots.length === 0) {
    return INACTIVE_NATIVE_AUTO_USE;
  }

  const crafting = readRecord(state.crafting);
  const craftingPlayer = readRecord(crafting?.player);
  const stats = readRecord(craftingPlayer?.stats);
  const inventory = readInventory(readRecord(state.inventory)?.items);
  const getItemKind = options.getItemKind ?? defaultItemKindResolver;

  const coveredItemNames = new Set<string>();
  for (const slot of slots) {
    const itemName = slot.item;
    if (!itemName) {
      continue;
    }
    // A slot only covers an item CraftBuddy could also use: a real crafting item
    // the player actually holds. Anything else leaves the action space alone.
    if (totalStacks(inventory, itemName) <= 0) {
      continue;
    }
    const kind = getItemKind(itemName);
    if (!kind || !CRAFTING_ITEM_KINDS.has(kind)) {
      continue;
    }
    coveredItemNames.add(normalizeAutoUseItemName(itemName));
  }

  if (coveredItemNames.size === 0) {
    return {
      ...INACTIVE_NATIVE_AUTO_USE,
      slotCount: slots.length,
    };
  }

  const maxToxicity = readNumber(stats?.maxtoxicity, 0);
  const toxicity = readNumber(stats?.toxicity, 0);

  return {
    active: true,
    slotCount: slots.length,
    coveredItemNames,
    // The runtime defaults the aggregated stat to 1, never 0.
    pillsPerRound: Math.max(1, Math.floor(readNumber(stats?.pillsPerRound, 1))),
    availableToxicity: maxToxicity - toxicity,
    // Definedness, not truthiness: a defined-but-false trainingMode still
    // suppresses inventory removal.
    trainingMode: crafting ? crafting.trainingMode !== undefined : false,
  };
}

/**
 * Whether the native loadout owns an item, so CraftBuddy must not use it.
 */
export function isCoveredByNativeAutoUse(
  status: NativeAutoUseStatus,
  itemName: string | undefined,
): boolean {
  if (!status.active || !itemName) {
    return false;
  }
  return status.coveredItemNames.has(normalizeAutoUseItemName(itemName));
}
