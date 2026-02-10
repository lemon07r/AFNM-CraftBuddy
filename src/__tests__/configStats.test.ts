import { resolveBaseCraftingStats } from '../modContent/configStats';

describe('resolveBaseCraftingStats', () => {
  it('uses entity stats as final base values without reapplying realm modifier', () => {
    const entity = {
      stats: { control: 2481, intensity: 1518 },
      realmModifier: 4,
    } as any;

    const resolved = resolveBaseCraftingStats(entity);

    expect(resolved.baseControl).toBe(2481);
    expect(resolved.baseIntensity).toBe(1518);
    expect(resolved.rawControl).toBe(2481);
    expect(resolved.rawIntensity).toBe(1518);
    expect(resolved.realmModifier).toBe(4);
    expect(resolved.source).toBe('entity_stats');
  });

  it('normalizes numeric string stats and falls back to defaults', () => {
    const entity = {
      stats: { control: '320', intensity: undefined },
      craftingModifier: 2,
    } as any;

    const resolved = resolveBaseCraftingStats(entity);

    expect(resolved.baseControl).toBe(320);
    expect(resolved.baseIntensity).toBe(10);
    expect(resolved.realmModifier).toBe(2);
  });
});
