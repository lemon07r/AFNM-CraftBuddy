import {
  applySkill,
  calculateActionSurvivabilityFloor,
} from '../optimizer/skills';
import {
  mechanics0719Scenarios,
  stackEventScenarios,
  buffGroupScenarios,
} from './fixtures/mechanics0719';
import { CraftingState } from '../optimizer/state';
import { retargetConfig, retargetSkill } from './fixtures/runtime0717';

describe('AFNM 0.7.19 audited mechanics', () => {
  it.each([
    ['all', [4, 5, 4, 5, 2]],
    ['highest', [1, 5, 4, 2, 2]],
    ['lowest', [4, 4, 4, 2, 2]],
    ['negative', [0, 0, 0, 0, 2]],
    ['source-scope', [4, 5, 4, 5, 2]],
    ['random-single', [4, 4, 4, 2, 2]],
    ['no-match', [1, 4, 4, 2, 2]],
  ])(
    'modifies exact buff groups with stable selection and source scope: %s',
    (edge, expected) => {
      const { state, skill, config } = buffGroupScenarios().find(
        (s) => s.name === `0719-group-${edge}`,
      )!;
      const next = applySkill(state, skill, config)!;
      expect(
        ['pill_a', 'pill_b', 'pill_c', 'pill', 'not_a_pill'].map((key) =>
          next.getBuffStacks(key),
        ),
      ).toEqual(expected);
      const events = next.buffs.get('group_source')?.internalState;
      expect(events?.gained ?? 0).toBe(
        ['all', 'lowest', 'source-scope', 'random-single'].includes(edge)
          ? 3
          : 0,
      );
      expect(events?.lost ?? 0).toBe(edge === 'negative' ? 1 : 0);
    },
  );
  it.each([
    ['capped', 3, 5, 0, 0],
    ['nonstackable', 3, 0, 0, 0],
    ['zero-cap', 5, 2, 0, 0],
    ['negative-technique', -2, 0, 0, 0],
    ['negative-buff', 0, 0, 3, 1],
    ['expiry', 2, 0, 1, 1],
    ['buff-cost', 2, 1, 2, 1],
    ['recursive', 6, 3, 0, 0],
    ['negate-zero', 0, 0, 0, 1],
  ])(
    'dispatches synchronous stack events: %s',
    (edge, stacks, gained, lost, calls) => {
      const { state, skill, config } = stackEventScenarios().find(
        (s) => s.name === `0719-stack-${edge}`,
      )!;
      const next = applySkill(state, skill, config)!;
      expect(next.getBuffStacks('pressure')).toBe(stacks);
      const internal = next.buffs.get('observer')?.internalState;
      expect(internal?.gained ?? 0).toBe(gained);
      expect(internal?.lost ?? 0).toBe(lost);
      expect(internal?.lossCalls ?? 0).toBe(calls);
      if (edge === 'buff-cost') expect(next.qi).toBe(95);
      if (edge === 'negative-technique')
        expect(next.buffs.has('pressure')).toBe(true);
    },
  );
  it('retains pre-cleanup harmony for condition generation', () => {
    const skill = retargetSkill({
      qiCost: 0,
      stabilityCost: 0,
      type: 'refine',
    });
    const state = new CraftingState({
      harmony: 99,
      stability: 50,
      harmonyData: {
        recommendedTechniqueTypes: [],
        captivatingCadence: { chain: 1, lastAction: 'fusion' },
      },
    });
    const next = applySkill(
      state,
      skill,
      retargetConfig(skill, {
        isSublimeCraft: true,
        craftingType: 'captivatingCadence',
      }),
    )!;
    expect(next.harmony).toBe(100);
    expect(next.conditionGenerationHarmony).toBe(105);
    expect(next.copy().conditionGenerationHarmony).toBe(105);
  });
  it('rounds stability and penalty only at cleanup, retaining maximum-repair excess', () => {
    const skill = retargetSkill({
      qiCost: 0,
      stabilityCost: 0,
      effects: [
        { kind: 'stability', amount: { value: 6.25 } },
        { kind: 'maxStability', amount: { value: 10 } },
        { kind: 'maxStability', amount: { value: -5 } },
      ],
    });
    const next = applySkill(
      new CraftingState({ stability: 8 }),
      skill,
      retargetConfig(skill),
    )!;
    expect(next.stability).toBe(14);
    expect(next.stabilityPenalty).toBe(0);
  });

  it('clamps each chance outcome before averaging instead of clamping its mean', () => {
    const skill = retargetSkill({
      qiCost: 0,
      stabilityCost: 0,
      preventsMaxStabilityDecay: true,
      effects: [
        {
          kind: 'stability',
          amount: { value: 7 },
          condition: { kind: 'chance', percentage: 75 },
        },
      ],
    });
    const next = applySkill(
      new CraftingState({
        stability: 48,
        initialMaxStability: 56,
        stabilityPenalty: 5,
      }),
      skill,
      retargetConfig(skill),
    )!;
    expect(next.stability).toBe(0.25 * 48 + 0.75 * 51);
  });
  it.each([
    ['overdraft', 0],
    ['overdraft-rescue', 3],
    ['temporary-excess', 58],
    ['fractional-cleanup', 14],
  ])('keeps stability intermediates until cleanup: %s', (name, expected) => {
    const { state, skill, config } = mechanics0719Scenarios().find(
      (scenario) => scenario.name === `0719-${name}`,
    )!;
    expect(applySkill(state, skill, config)!.stability).toBe(expected);
    expect(
      calculateActionSurvivabilityFloor(state, skill, config)!.stability,
    ).toBe(expected);
  });
});
