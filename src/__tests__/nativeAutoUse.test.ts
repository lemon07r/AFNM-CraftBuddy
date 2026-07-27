import {
  INACTIVE_NATIVE_AUTO_USE,
  isCoveredByNativeAutoUse,
  normalizeAutoUseItemName,
  projectNativeAutoUse,
  readNativeAutoUseStatus,
  type NativeAutoUseSlot,
} from '../modContent/nativeAutoUse';

const ITEM_KINDS: Record<string, string> = {
  'Qi Pill': 'pill',
  'Focus Pill': 'pill',
  'Spirit Dew': 'reagent',
  'Iron Ore': 'material',
};

const getItemKind = (itemName: string): string | undefined =>
  ITEM_KINDS[itemName];

function createStore(state: unknown) {
  return { getState: () => state };
}

function buildState({
  slots,
  inventory = [{ name: 'Qi Pill', stacks: 3 }],
  stats = { maxtoxicity: 100, toxicity: 20, pillsPerRound: 2 },
  trainingMode,
  includeTrainingMode = false,
}: {
  slots: unknown;
  inventory?: unknown;
  stats?: Record<string, unknown>;
  trainingMode?: boolean;
  includeTrainingMode?: boolean;
}) {
  return {
    player: { player: { currentCraftingAutoUseLoadout: { slots } } },
    crafting: {
      player: { stats },
      progressState: { step: 0, consumedPills: 0 },
      ...(includeTrainingMode ? { trainingMode } : {}),
    },
    inventory: { items: inventory },
  };
}

describe('readNativeAutoUseStatus', () => {
  it('reports an active loadout with covered names, pillsPerRound and toxicity headroom', () => {
    const status = readNativeAutoUseStatus(
      createStore(
        buildState({
          slots: [{ item: 'Qi Pill' }, { item: 'Spirit Dew', maxCount: 1 }],
          inventory: [
            { name: 'Qi Pill', stacks: 3 },
            { name: 'Spirit Dew', stacks: 1 },
          ],
        }),
      ),
      { getItemKind },
    );

    expect(status.active).toBe(true);
    expect(status.slotCount).toBe(2);
    expect(Array.from(status.coveredItemNames).sort()).toEqual([
      'qi_pill',
      'spirit_dew',
    ]);
    expect(status.pillsPerRound).toBe(2);
    expect(status.availableToxicity).toBe(80);
    expect(status.trainingMode).toBe(false);
  });

  it('defaults pillsPerRound to 1 rather than 0 when the stat is absent', () => {
    const status = readNativeAutoUseStatus(
      createStore(
        buildState({
          slots: [{ item: 'Qi Pill' }],
          stats: { maxtoxicity: 50, toxicity: 0 },
        }),
      ),
      { getItemKind },
    );

    expect(status.pillsPerRound).toBe(1);
  });

  it('treats a defined-but-false trainingMode as training mode', () => {
    const status = readNativeAutoUseStatus(
      createStore(
        buildState({
          slots: [{ item: 'Qi Pill' }],
          includeTrainingMode: true,
          trainingMode: false,
        }),
      ),
      { getItemKind },
    );

    expect(status.trainingMode).toBe(true);
  });

  it('treats an empty loadout as inactive', () => {
    expect(
      readNativeAutoUseStatus(createStore(buildState({ slots: [] })), {
        getItemKind,
      }),
    ).toEqual(INACTIVE_NATIVE_AUTO_USE);
  });

  it('treats slots with no matching inventory as inactive but still reports the slot count', () => {
    const status = readNativeAutoUseStatus(
      createStore(buildState({ slots: [{ item: 'Qi Pill' }], inventory: [] })),
      { getItemKind },
    );

    expect(status.active).toBe(false);
    expect(status.slotCount).toBe(1);
    expect(status.coveredItemNames.size).toBe(0);
  });

  it('ignores slots whose item is not a crafting item', () => {
    const status = readNativeAutoUseStatus(
      createStore(
        buildState({
          slots: [{ item: 'Iron Ore' }],
          inventory: [{ name: 'Iron Ore', stacks: 5 }],
        }),
      ),
      { getItemKind },
    );

    expect(status.active).toBe(false);
  });

  it('reports inactive for an unreadable or throwing store', () => {
    expect(readNativeAutoUseStatus(null)).toEqual(INACTIVE_NATIVE_AUTO_USE);
    expect(readNativeAutoUseStatus({})).toEqual(INACTIVE_NATIVE_AUTO_USE);
    expect(
      readNativeAutoUseStatus({
        getState: () => {
          throw new Error('store torn down');
        },
      }),
    ).toEqual(INACTIVE_NATIVE_AUTO_USE);
  });

  it('reports inactive when the crafting slice is missing entirely', () => {
    const status = readNativeAutoUseStatus(
      createStore({
        player: { player: { currentCraftingAutoUseLoadout: { slots: [] } } },
      }),
      { getItemKind },
    );

    expect(status.active).toBe(false);
  });
});

describe('projectNativeAutoUse', () => {
  const inventory = [
    { name: 'Qi Pill', stacks: 2 },
    { name: 'Focus Pill', stacks: 1 },
    { name: 'Spirit Dew', stacks: 1 },
  ];

  function project(
    slots: NativeAutoUseSlot[],
    overrides: Partial<Parameters<typeof projectNativeAutoUse>[0]> = {},
  ) {
    return projectNativeAutoUse({
      slots,
      step: 0,
      consumedPills: 0,
      pillsPerRound: 2,
      availableToxicity: 100,
      inventory,
      getItemKind,
      ...overrides,
    });
  }

  it('selects nothing without slots or budget', () => {
    expect(project([])).toEqual([]);
    expect(project([{ item: 'Qi Pill' }], { consumedPills: 2 })).toEqual([]);
    expect(project([{ item: 'Qi Pill' }], { pillsPerRound: 0 })).toEqual([]);
  });

  it('stops once the pillsPerRound budget is filled', () => {
    const selected = project(
      [{ item: 'Qi Pill' }, { item: 'Focus Pill' }, { item: 'Qi Pill' }],
      { pillsPerRound: 2 },
    );

    expect(selected.map((entry) => entry.itemName)).toEqual([
      'Qi Pill',
      'Focus Pill',
    ]);
  });

  it('sorts reagents first on step 0 only', () => {
    const slots = [{ item: 'Qi Pill' }, { item: 'Spirit Dew' }];

    expect(project(slots).map((entry) => entry.itemName)).toEqual([
      'Spirit Dew',
      'Qi Pill',
    ]);
    expect(project(slots, { step: 3 }).map((entry) => entry.itemName)).toEqual([
      'Qi Pill',
    ]);
  });

  it('skips reagents after the first step', () => {
    expect(project([{ item: 'Spirit Dew' }], { step: 1 })).toEqual([]);
  });

  it('skips slots without remaining inventory stacks', () => {
    const selected = project([{ item: 'Focus Pill' }, { item: 'Focus Pill' }]);

    expect(selected).toHaveLength(1);
  });

  it('enforces maxCount against pillTracking plus this turn', () => {
    expect(
      project([{ item: 'Qi Pill', maxCount: 2 }], {
        pillTracking: { 'Qi Pill': 2 },
      }),
    ).toEqual([]);

    const selected = project(
      [
        { item: 'Qi Pill', maxCount: 1 },
        { item: 'Qi Pill', maxCount: 1 },
      ],
      { step: 5 },
    );
    expect(selected).toHaveLength(1);
  });

  it('treats maxCount 0 as unlimited', () => {
    const selected = project(
      [
        { item: 'Qi Pill', maxCount: 0 },
        { item: 'Qi Pill', maxCount: 0 },
      ],
      { step: 5, pillTracking: { 'Qi Pill': 9 } },
    );

    expect(selected).toHaveLength(2);
  });

  it('honours injected condition and already-satisfied predicates', () => {
    expect(
      project([{ item: 'Qi Pill' }], { isSlotConditionMet: () => false }),
    ).toEqual([]);
    expect(
      project([{ item: 'Qi Pill' }], {
        isEffectAlreadySatisfied: (itemName) => itemName === 'Qi Pill',
      }),
    ).toEqual([]);
  });

  it('defaults an unrecognised slot condition kind to "will fire"', () => {
    // 0.7.6 added a `(This Effect)` self-reference condition to auto-use rules.
    // CraftBuddy has no condition engine, so any unmodelled condition shape must
    // stay permissive: over-estimating native consumption keeps CraftBuddy from
    // duplicating it, whereas under-estimating would double-consume the item.
    const selfReferenceSlot: NativeAutoUseSlot = {
      item: 'Qi Pill',
      blocks: [
        {
          conditions: [{ kind: 'thisEffect', comparison: 'lessThan', value: 1 }],
        },
      ],
      conditions: [{ kind: 'thisEffect' }],
    };

    expect(
      project([selfReferenceSlot], { pillsPerRound: 1 }).map(
        (entry) => entry.itemName,
      ),
    ).toEqual(['Qi Pill']);
  });

  it('stops at the toxicity ceiling but keeps scanning later slots', () => {
    const selected = project([{ item: 'Qi Pill' }, { item: 'Focus Pill' }], {
      step: 5,
      availableToxicity: 5,
      getItemToxicity: (itemName) => (itemName === 'Qi Pill' ? 9 : 4),
    });

    expect(selected.map((entry) => entry.itemName)).toEqual(['Focus Pill']);
  });

  it('reports normalized keys alongside the raw item names', () => {
    expect(project([{ item: 'Qi Pill' }], { pillsPerRound: 1 })).toEqual([
      { rowIndex: 0, itemName: 'Qi Pill', itemKey: 'qi_pill', toxicity: 0 },
    ]);
  });
});

describe('isCoveredByNativeAutoUse', () => {
  const status = readNativeAutoUseStatus(
    createStore(buildState({ slots: [{ item: 'Qi Pill' }] })),
    { getItemKind },
  );

  it('matches on the normalized item name', () => {
    expect(isCoveredByNativeAutoUse(status, 'qi_pill')).toBe(true);
    expect(isCoveredByNativeAutoUse(status, 'Qi Pill')).toBe(true);
    expect(isCoveredByNativeAutoUse(status, 'focus_pill')).toBe(false);
    expect(isCoveredByNativeAutoUse(status, undefined)).toBe(false);
  });

  it('covers nothing while the loadout is inactive', () => {
    expect(isCoveredByNativeAutoUse(INACTIVE_NATIVE_AUTO_USE, 'qi_pill')).toBe(
      false,
    );
  });
});

describe('normalizeAutoUseItemName', () => {
  it('matches the optimizer item key format', () => {
    expect(normalizeAutoUseItemName('  Spirit   Dew ')).toBe('spirit_dew');
    expect(normalizeAutoUseItemName(undefined)).toBe('');
  });
});
