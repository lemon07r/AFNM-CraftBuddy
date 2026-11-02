import { CraftingState } from '../optimizer/state';
import { applySkill } from '../optimizer/skills';
import {
  buildConfigSnapshot,
  buildStateSnapshot,
  reviveConfigSnapshot,
  reviveStateSnapshot,
  replayOptimizerSnapshot,
  type OptimizerReplaySnapshot,
} from '../modContent/replaySnapshot';
import { retargetConfig, retargetSkill } from './fixtures/runtime0717';
import {
  freezeSearchClock,
  loadOptimizerReplaySnapshot,
} from './__fixtures__/replaySnapshots';

describe('0.7.17 replay boundary', () => {
  it.each(['legacy', 'experimental'])(
    'replays old snapshots with retired %s engine and MCTS fields',
    (optimizerEngine) => {
      freezeSearchClock();
      try {
        const snapshot = loadOptimizerReplaySnapshot(
          'user-report-overcraft-endgame.snapshot.json',
        );
        snapshot.input.searchConfig = {
          timeBudgetMs: 600000,
          maxNodes: 120,
          beamWidth: 5,
          goalPriorityBias: 0,
        };
        const clean = replayOptimizerSnapshot(snapshot).result;
        const old: OptimizerReplaySnapshot = JSON.parse(
          JSON.stringify({
            ...snapshot,
            input: {
              ...snapshot.input,
              settings: { ...snapshot.input.settings, optimizerEngine },
              searchConfig: {
                ...snapshot.input.searchConfig,
                useMonteCarloTreeSearch: true,
                mctsIterations: 250,
                mctsRolloutDepth: 16,
                mctsMaxNodes: 5000,
                mctsExploration: 1.15,
                mctsSeed: 42,
              },
            },
          }),
        );
        const replayed = replayOptimizerSnapshot(old).result;
        expect(replayed.searchMetrics?.nodesExplored).toBeGreaterThan(0);
        expect(replayed.recommendation).not.toBeNull();
        expect(replayed).toEqual(clean);
      } finally {
        jest.useRealTimers();
      }
    },
  );

  it('separates legacy flattened masteries using the saved native effect tree', () => {
    const base = { kind: 'completion' as const, amount: { value: 10 } };
    const mastery = { kind: 'completion' as const, amount: { value: 30 } };
    const skill = retargetSkill({
      effects: [base, mastery],
      masteryEntries: [{ kind: 'effect', effects: [mastery] }],
      nativeTechnique: { effects: [base] },
    });
    const config = reviveConfigSnapshot({ ...retargetConfig(skill) });
    expect(config.skills[0].effects).toEqual([base]);
    expect(config.skills[0].masteryEntries).toEqual(skill.masteryEntries);
    const result = applySkill(
      new CraftingState({ qi: 100, stability: 50 }),
      config.skills[0],
      config,
    )!;
    expect(result.completion).toBe(40);
  });

  it('round-trips separated effects, droplets, cost channels and per-instance state', () => {
    const skill = retargetSkill({
      noQiCost: true,
      dropletCost: 3,
      effects: [{ kind: 'completion', amount: { value: 7 } }],
      nativeTechnique: { effects: [] },
    });
    const config = reviveConfigSnapshot(
      buildConfigSnapshot(retargetConfig(skill)),
    );
    expect(config.skills[0]).toMatchObject({
      noQiCost: true,
      dropletCost: 3,
      effects: skill.effects,
    });
    const state = new CraftingState({
      qi: 100,
      stability: 50,
      itemEffectiveness: 37.5,
      qiDroplets: 3,
      maxQiDroplets: 6,
      qiCostReduction: 20,
      qiCostPenalty: 25,
      stabilityCostReduction: 30,
      stabilityCostPenalty: 35,
      buffs: new Map([
        [
          'stateful',
          { name: 'stateful', stacks: 1, internalState: { count: 2 } },
        ],
      ]),
    });
    const revived = reviveStateSnapshot(buildStateSnapshot(state, 'missing'));
    expect(revived).toMatchObject({
      itemEffectiveness: 37.5,
      qiDroplets: 3,
      maxQiDroplets: 6,
      qiCostReduction: 20,
      qiCostPenalty: 25,
      stabilityCostReduction: 30,
      stabilityCostPenalty: 35,
    });
    expect(revived.buffs.get('stateful')?.internalState).toEqual({ count: 2 });
  });
});
