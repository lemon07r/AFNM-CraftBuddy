import {
  buildCraftStateSignature,
  diffCraftStateSignatures,
  readLiveCraftStateSignature,
  serializeHarmonyData,
  serializeTechniqueRoster,
  type CraftStateSignatureInput,
} from '../modContent/craftStateSignature';

function baseInput(
  overrides: Partial<CraftStateSignatureInput> = {},
): CraftStateSignatureInput {
  return {
    step: 3,
    qi: 120,
    completion: 400,
    perfection: 250,
    stability: 42,
    maxStability: 60,
    toxicity: 10,
    condition: 'positive',
    forecastConditions: ['neutral', 'veryPositive'],
    buffs: [{ name: 'Inner Focus', stacks: 2 }],
    techniques: [
      { name: 'Simple Fusion', currentCooldown: 0 },
      { name: 'Focused Refine', currentCooldown: 2 },
    ],
    quickAccess: ['Qi Pill'],
    inventory: [{ name: 'Qi Pill', stacks: 4 }],
    harmony: 12,
    harmonyData: { heat: 3, lastBuffedHeat: 1 },
    consumedPills: 1,
    ...overrides,
  };
}

function changedFields(overrides: Partial<CraftStateSignatureInput>): string[] {
  return [
    ...diffCraftStateSignatures(
      buildCraftStateSignature(baseInput()),
      buildCraftStateSignature(baseInput(overrides)),
    ),
  ];
}

describe('buildCraftStateSignature', () => {
  it('is stable for an unchanged state', () => {
    expect(buildCraftStateSignature(baseInput())).toBe(
      buildCraftStateSignature(baseInput()),
    );
  });

  it.each<[string, Partial<CraftStateSignatureInput>, string]>([
    ['step', { step: 4 }, 'step'],
    ['qi', { qi: 119 }, 'qi'],
    ['completion', { completion: 401 }, 'comp'],
    ['perfection', { perfection: 251 }, 'perf'],
    ['stability', { stability: 41 }, 'stab'],
    ['max stability', { maxStability: 50 }, 'max'],
    ['toxicity', { toxicity: 11 }, 'tox'],
    ['consumed pills', { consumedPills: 2 }, 'pills'],
    ['condition', { condition: 'negative' }, 'cond'],
    ['forecast queue', { forecastConditions: ['neutral'] }, 'queue'],
    ['buffs', { buffs: [{ name: 'Inner Focus', stacks: 3 }] }, 'buffs'],
    [
      'quick-access inventory',
      { inventory: [{ name: 'Qi Pill', stacks: 3 }] },
      'items',
    ],
  ])('detects a change in %s', (_label, overrides, field) => {
    expect(changedFields(overrides)).toEqual([field]);
  });

  it('detects a harmony value change on its own', () => {
    expect(changedFields({ harmony: 13 })).toEqual(['harmony']);
  });

  it('detects a harmonyData change on its own', () => {
    expect(
      changedFields({ harmonyData: { heat: 4, lastBuffedHeat: 1 } }),
    ).toEqual(['harmonyData']);
  });

  it('detects an available-technique set change on its own', () => {
    expect(
      changedFields({
        techniques: [
          { name: 'Simple Fusion', currentCooldown: 0 },
          { name: 'Focused Refine', currentCooldown: 2 },
          { name: 'False Fusion', currentCooldown: 0 },
        ],
      }),
    ).toEqual(['techniques']);
  });

  it('separates a cooldown change from a roster change', () => {
    expect(
      changedFields({
        techniques: [
          { name: 'Simple Fusion', currentCooldown: 1 },
          { name: 'Focused Refine', currentCooldown: 2 },
        ],
      }),
    ).toEqual(['cooldowns']);
  });

  it('ignores buff and technique ordering', () => {
    const reordered = baseInput({
      buffs: [{ name: 'Inner Focus', stacks: 2 }],
      techniques: [
        { name: 'Focused Refine', currentCooldown: 2 },
        { name: 'Simple Fusion', currentCooldown: 0 },
      ],
    });

    expect(buildCraftStateSignature(reordered)).toBe(
      buildCraftStateSignature(baseInput()),
    );
  });
});

describe('serializeHarmonyData', () => {
  it('is key-order independent', () => {
    expect(serializeHarmonyData({ a: 1, b: { c: 2, d: 3 } })).toBe(
      serializeHarmonyData({ b: { d: 3, c: 2 }, a: 1 }),
    );
  });

  it('distinguishes absent from empty harmony data', () => {
    expect(serializeHarmonyData(undefined)).toBe('none');
    expect(serializeHarmonyData({})).toBe('{}');
  });

  it('keeps nested resonance state visible', () => {
    expect(
      serializeHarmonyData({
        resonance: { resonance: 'fusion', strength: 2, pendingCount: 0 },
      }),
    ).not.toBe(
      serializeHarmonyData({
        resonance: { resonance: 'fusion', strength: 1, pendingCount: 0 },
      }),
    );
  });
});

describe('serializeTechniqueRoster', () => {
  it('normalizes and sorts technique keys', () => {
    expect(
      serializeTechniqueRoster([
        { name: 'Focused Refine' },
        { name: 'simple fusion' },
      ]),
    ).toBe('focused_refine|simple_fusion');
  });

  it('reports none for an absent roster', () => {
    expect(serializeTechniqueRoster(undefined)).toBe('none');
    expect(serializeTechniqueRoster([])).toBe('none');
  });
});

describe('readLiveCraftStateSignature', () => {
  function createStore(state: unknown) {
    return { getState: () => state };
  }

  const liveState = {
    crafting: {
      player: {
        stats: { pool: 90, toxicity: 5 },
        buffs: [{ name: 'Inner Fire', stacks: 1 }],
        techniques: [{ name: 'Simple Fusion', currentCooldown: 0 }],
        craftingQuickAccess: ['Qi Pill'],
      },
      progressState: {
        step: 2,
        completion: 100,
        perfection: 50,
        stability: 40,
        stabilityPenalty: 5,
        condition: 'neutral',
        nextConditions: ['positive'],
        harmony: 6,
        harmonyTypeData: { heat: 2 },
        consumedPills: 0,
      },
      recipeStats: { stability: 60 },
    },
    inventory: { items: [{ name: 'Qi Pill', stacks: 2 }] },
  };

  it('signatures a readable live state', () => {
    const reading = readLiveCraftStateSignature(createStore(liveState));

    expect(reading.ok).toBe(true);
    if (!reading.ok) return;
    expect(reading.step).toBe(2);
    expect(reading.signature).toContain('harmony:6');
    expect(reading.signature).toContain('max:55');
    expect(reading.signature).toContain('techniques:simple_fusion');
  });

  it('is unverifiable when the store cannot be reached', () => {
    expect(readLiveCraftStateSignature(null)).toEqual({
      ok: false,
      reason: 'The game store is not available to read.',
    });
    expect(readLiveCraftStateSignature({})).toEqual({
      ok: false,
      reason: 'The game store is not available to read.',
    });
  });

  it('is unverifiable when reading the store throws', () => {
    const reading = readLiveCraftStateSignature({
      getState: () => {
        throw new Error('store torn down');
      },
    });

    expect(reading.ok).toBe(false);
    if (reading.ok) return;
    expect(reading.reason).toContain('store torn down');
  });

  it('is unverifiable when crafting.player is missing', () => {
    const reading = readLiveCraftStateSignature(
      createStore({ crafting: { progressState: { step: 1 } } }),
    );

    expect(reading).toEqual({
      ok: false,
      reason: 'Live crafting player state is missing.',
    });
  });

  it('is unverifiable when the progress state is missing', () => {
    const reading = readLiveCraftStateSignature(
      createStore({ crafting: { player: { stats: {} } } }),
    );

    expect(reading).toEqual({
      ok: false,
      reason: 'Live crafting progress state is missing.',
    });
  });

  it('detects a live harmonyData change through the signature', () => {
    const before = readLiveCraftStateSignature(createStore(liveState));
    const after = readLiveCraftStateSignature(
      createStore({
        ...liveState,
        crafting: {
          ...liveState.crafting,
          progressState: {
            ...liveState.crafting.progressState,
            harmonyTypeData: { heat: 3 },
          },
        },
      }),
    );

    expect(before.ok && after.ok).toBe(true);
    if (!before.ok || !after.ok) return;
    expect([
      ...diffCraftStateSignatures(before.signature, after.signature),
    ]).toEqual(['harmonyData']);
  });
});

describe('diffCraftStateSignatures', () => {
  it('reports every changed field name, sorted', () => {
    expect([
      ...diffCraftStateSignatures(
        buildCraftStateSignature(baseInput()),
        buildCraftStateSignature(baseInput({ qi: 1, harmony: 99 })),
      ),
    ]).toEqual(['harmony', 'qi']);
  });

  it('reports nothing for identical signatures', () => {
    const signature = buildCraftStateSignature(baseInput());
    expect(diffCraftStateSignatures(signature, signature)).toEqual([]);
  });
});
