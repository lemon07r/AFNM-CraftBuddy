/** Regressions for the execution/integration defects found in the 6.8.0 audit. */
import { readLiveCraftStateSignature } from '../modContent/craftStateSignature';
import { createDomAutoCraftExecutor } from '../modContent/autoCraftExecutor';
import type { AutoCraftRuntimeSnapshot } from '../modContent/autoCraftController';
import { readNativeAutoUseStatus } from '../modContent/nativeAutoUse';

function liveState() {
  return {
    crafting: {
      consumedPills: 0,
      recipeStats: { stability: 100 },
      player: {
        stats: { pool: 100, qiDroplets: 2, stabilityCostPenalty: 0 },
        buffs: [],
        techniques: [{ name: 'Fusion', stabilityCost: 10 }],
      },
      progressState: {
        step: 3,
        completion: 0,
        perfection: 0,
        stability: 5,
        stabilityPenalty: 0,
        condition: 'neutral',
        nextConditions: [],
      },
    },
  };
}

describe('execution audit regressions', () => {
  it('returns item ownership when game auto-use is disabled', () => {
    const live = {
      ...liveState(),
      player: {
        player: {
          craftingAutoUseEnabled: false,
          currentCraftingAutoUseLoadout: { slots: [{ item: 'Rescue Pill' }] },
        },
      },
      inventory: { items: [{ name: 'Rescue Pill', stacks: 1 }] },
    };
    const status = readNativeAutoUseStatus(
      { getState: () => live },
      { getItemKind: () => 'pill' },
    );
    expect(status.active).toBe(false);
    expect(status.coveredItemNames.has('rescue_pill')).toBe(false);
  });

  it('detects a changed stability cost penalty or qi droplets', () => {
    const live = liveState();
    const store = { getState: () => live };
    const before = readLiveCraftStateSignature(store);
    live.crafting.player.stats.stabilityCostPenalty = 100;
    expect(readLiveCraftStateSignature(store)).not.toEqual(before);
    live.crafting.player.stats.stabilityCostPenalty = 0;
    live.crafting.player.stats.qiDroplets = 0;
    expect(readLiveCraftStateSignature(store)).not.toEqual(before);
  });

  it('reads consumedPills from the crafting slice', () => {
    const live = liveState();
    const store = { getState: () => live };
    const before = readLiveCraftStateSignature(store);
    live.crafting.consumedPills = 1;
    expect(readLiveCraftStateSignature(store)).not.toEqual(before);
    expect(before.ok && before.signature).toContain('pills:0');
  });

  it('notices changed technique costs without invalidating on cosmetic animation updates', () => {
    const live = liveState();
    const store = { getState: () => live };
    const before = readLiveCraftStateSignature(store);
    Object.assign(live.crafting.player.techniques[0], {
      justClicked: true,
      animations: ['flash'],
      tooltip: 'new tooltip',
    });
    expect(readLiveCraftStateSignature(store)).toEqual(before);
    live.crafting.player.techniques[0].stabilityCost = 20;
    expect(readLiveCraftStateSignature(store)).not.toEqual(before);
  });

  it('rejects unmodelled transitions even when live state is fresh', () => {
    const live = liveState();
    const dispatch = jest.fn();
    const executor = createDomAutoCraftExecutor({
      getStore: () => ({ getState: () => live, dispatch }),
      getRootElement: () => {
        throw new Error('DOM should not be used');
      },
      isElementVisible: () => true,
      isIgnoredElement: () => false,
    });
    const snapshot: AutoCraftRuntimeSnapshot = {
      craftSessionActive: true,
      craftActive: true,
      isCalculating: false,
      result: null,
      stateFingerprint: 'fresh',
      verifyRevision: () => ({ kind: 'match' }),
    };
    expect(() =>
      executor.execute(
        {
          kind: 'skill',
          actionName: 'Fusion',
          reason: 'audit',
          transitionUnresolvedProbability: 0.5,
        },
        snapshot,
      ),
    ).toThrow('unmodelled');
    expect(dispatch).not.toHaveBeenCalled();
    expect(live.crafting.progressState.stability).toBe(5);
  });
});
