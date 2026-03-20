import {
  buildKnownCraftingTechniqueNameMap,
  resolveLiveCraftingTechnique,
} from '../modContent/techniqueResolution';

describe('techniqueResolution', () => {
  it('resolves a live technique through the known-technique map by canonical name', () => {
    const liveTechnique = {
      name: 'Cloud Hammer',
      icon: 'live-icon',
      poolCost: 17,
      stabilityCost: 9,
      successChance: 0.75,
      cooldown: 4,
      currentCooldown: 2,
      effects: [],
      type: 'support',
      realm: 'foundationEstablishment',
      justClicked: true,
    } as any;

    const knownTechniqueByName = buildKnownCraftingTechniqueNameMap([
      {
        technique: 'Cloud Hammer',
        mastery: [{ name: 'Cloud Hammer Mastery', tier: 'mundane' }],
      },
    ]);

    const resolved = resolveLiveCraftingTechnique({
      liveTechnique,
      knownTechniqueByName,
      resolveTechniqueFromKnown: jest.fn(() => ({
        ...liveTechnique,
        icon: 'resolved-icon',
        poolCost: 11,
        currentCooldown: 0,
        justClicked: undefined,
      })),
    });

    expect(resolved.source).toBe('known');
    expect(resolved.matchedKnownTechnique).toEqual(
      expect.objectContaining({ technique: 'Cloud Hammer' }),
    );
    expect(resolved.technique.icon).toBe('resolved-icon');
    expect(resolved.technique.poolCost).toBe(11);
    expect(resolved.technique.currentCooldown).toBe(2);
    expect(resolved.technique.justClicked).toBe(true);
  });

  it('falls back to the live technique when no known-technique match exists', () => {
    const liveTechnique = {
      name: 'Hidden Needle',
      icon: 'live-icon',
      poolCost: 13,
      stabilityCost: 3,
      successChance: 1,
      cooldown: 0,
      currentCooldown: 0,
      effects: [],
      type: 'refine',
      realm: 'foundationEstablishment',
    } as any;
    const resolveTechniqueFromKnown = jest.fn();

    const resolved = resolveLiveCraftingTechnique({
      liveTechnique,
      knownTechniqueByName: buildKnownCraftingTechniqueNameMap([
        { technique: 'Cloud Hammer' },
      ]),
      resolveTechniqueFromKnown,
    });

    expect(resolved.source).toBe('live');
    expect(resolved.technique).toBe(liveTechnique);
    expect(resolveTechniqueFromKnown).not.toHaveBeenCalled();
  });

  it('ignores blank or duplicate known-technique names when building the lookup map', () => {
    const knownTechniqueByName = buildKnownCraftingTechniqueNameMap([
      { technique: '  Cloud Hammer  ' },
      { technique: 'Cloud Hammer' },
      { technique: '   ' },
      {} as any,
    ]);

    expect(Array.from(knownTechniqueByName.keys())).toEqual(['Cloud Hammer']);
  });
});
