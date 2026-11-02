import {
  CraftingState,
  createStateFromGame,
  buildScalingVariables,
} from '../optimizer';
import {
  applySkill,
  calculateEffectiveActionCosts,
  canApplySkill,
} from '../optimizer/skills';
import { evaluateScaling, type ScalingVariables } from '../optimizer/gameTypes';
import {
  retargetConfig,
  retargetScenarios,
  retargetSkill,
} from './fixtures/runtime0717';

const scenarios = retargetScenarios();
function run(name: string) {
  const scenario = scenarios.find((entry) => entry.name === name)!;
  const result = applySkill(
    scenario.state,
    scenario.skill,
    scenario.config,
    [],
    100,
    'neutral',
    100,
  );
  expect(result).not.toBeNull();
  return result!;
}

describe('AFNM 0.7.17 shared mechanics', () => {
  it.each([
    [0, 4],
    [50, 6],
    [-50, 2],
  ])(
    'uses additive live item effectiveness %s for the real Calming Mind payload',
    (effectiveness, stacks) => {
      const scenario = scenarios.find(
        (entry) => entry.name === `0717-calming-mind-${effectiveness}`,
      )!;
      const next = run(scenario.name);
      expect(next.getBuffStacks('calming_mind_pill')).toBe(stacks);
      expect(next.itemEffectiveness).toBe(effectiveness);
      expect(
        buildScalingVariables(scenario.state, 10, 10, 200).itemEffectiveness,
      ).toBe(effectiveness);
      const extracted = createStateFromGame({
        pool: 100,
        stability: 50,
        initialMaxStability: 60,
        completion: 0,
        perfection: 0,
        itemEffectiveness: effectiveness,
      });
      expect(extracted.itemEffectiveness).toBe(effectiveness);
      expect(extracted.copy().itemEffectiveness).toBe(effectiveness);
      expect(extracted.getCacheKey()).not.toBe(
        extracted.copy({ itemEffectiveness: effectiveness + 1 }).getCacheKey(),
      );
    },
  );

  it('adds buff item effectiveness once on top of the live base', () => {
    const scenario = scenarios.find(
      (entry) => entry.name === '0717-calming-mind-50',
    )!;
    const state = scenario.state.copy({
      buffs: new Map([
        [
          'item_boost',
          {
            name: 'item_boost',
            stacks: 1,
            definition: {
              name: 'Item boost',
              canStack: false,
              effects: [],
              stats: { itemEffectiveness: { value: 50 } },
            },
          },
        ],
      ]),
    });
    expect(
      applySkill(state, scenario.skill, scenario.config)!.getBuffStacks(
        'calming_mind_pill',
      ),
    ).toBe(8);
  });

  it.each([
    [{ poolCostFlat: { value: 0 } }, 169, 169],
    [{ poolCostPercentage: { value: 80 } }, 134, 169],
    [{ stabilityCostPercentage: { value: 80 } }, 169, 134],
  ])(
    'only adjusts the compatibility side with an actual legacy contribution: %j',
    (stats, qiCost, stabilityCost) => {
      const state = new CraftingState({
        qiCostReduction: 15.5,
        stabilityCostReduction: 15.5,
        buffs: new Map([
          [
            'cost',
            {
              name: 'cost',
              stacks: 1,
              definition: { name: 'Cost', canStack: false, effects: [], stats },
            },
          ],
        ]),
      });
      const skill = retargetSkill({ qiCost: 200, stabilityCost: 200 });
      expect(
        calculateEffectiveActionCosts(
          state,
          skill,
          0,
          [],
          retargetConfig(skill),
        ),
      ).toMatchObject({ qiCost, stabilityCost });
    },
  );

  it('keeps fractional base channels unrounded when only new cost stats contribute', () => {
    const scenario = scenarios.find(
      (entry) => entry.name === '0717-fractional-cost-channels',
    )!;
    expect(
      calculateEffectiveActionCosts(
        scenario.state,
        scenario.skill,
        0,
        [],
        scenario.config,
      ),
    ).toMatchObject({ qiCost: 152, stabilityCost: 152 });
  });

  it('feeds Jade completion into Bifang using running bars across nested applications', () => {
    const next = run('0717-jade-bifang');
    expect(next.completion).toBe(123);
    expect(next.perfection).toBe(110);
    expect(next.buffs.get('true_bifang_flame')?.internalState?.blaze).toBe(24);
  });

  it.each([
    [0, 20, 0],
    [20, 19.6, 1],
    [100, 18, 5],
  ])(
    'mixes realized current payment at %s%% without changing next-turn expected stacks',
    (percentage, payment, stacks) => {
      const result = run(`0717-fairy-payment-${percentage}`);
      expect(result.qi).toBeCloseTo(39 - payment, 10);
      expect(result.stability).toBeCloseTo(50 - payment, 10);
      expect(result.getBuffStacks('energising_enhancement')).toBe(stacks);
    },
  );
  it('composes independent reduction/penalty contributions, not stacks', () => {
    const scenario = scenarios.find(
      (entry) => entry.name === '0717-cost-channels',
    )!;
    expect(
      calculateEffectiveActionCosts(
        scenario.state,
        scenario.skill,
        0,
        [],
        scenario.config,
      ),
    ).toMatchObject({ qiCost: 59, stabilityCost: 15 });
    expect(
      calculateEffectiveActionCosts(
        scenario.state,
        scenario.skill,
        0,
        [
          { kind: 'pool', multiplier: 0.5 },
          { kind: 'stability', multiplier: 2 },
        ],
        scenario.config,
      ),
    ).toMatchObject({ qiCost: 29, stabilityCost: 30 });
  });

  it('mixes independent entry and nested payment chances after rounding each combination', () => {
    const result = run('0717-independent-payment-chances');
    // 40% * 20 + 50% * 18 + 10% * 16 = 18.6.
    expect(result.qi).toBeCloseTo(20.4, 10);
    expect(result.stability).toBeCloseTo(31.4, 10);
    expect(result.getBuffStacks('energising_enhancement')).toBe(1);
    expect(result.getBuffStacks('second_discount')).toBe(2);
  });

  it('keeps the outer harmony floor separate and bypasses all Qi costs with noQiCost', () => {
    const state = new CraftingState({
      qi: 100,
      stability: 50,
      qiCostReduction: 20,
      stabilityCostReduction: 20,
      poolCostFlat: 20,
      harmonyData: {
        recommendedTechniqueTypes: [],
        enhancingEcho: { attunedType: 'refine' },
      },
    });
    const skill = retargetSkill({ qiCost: 3, stabilityCost: 3 });
    const config = retargetConfig(skill, { craftingType: 'enhancingEcho' });
    expect(
      calculateEffectiveActionCosts(state, skill, 0, [], config),
    ).toMatchObject({ qiCost: 9, stabilityCost: 1 });
    expect(
      calculateEffectiveActionCosts(
        state,
        { ...skill, noQiCost: true },
        0,
        [],
        config,
      ).qiCost,
    ).toBe(0);
  });

  it('cleans float noise before flooring a cost', () => {
    const skill = retargetSkill({ qiCost: 100 });
    const state = new CraftingState({
      qi: 100,
      stability: 50,
      qiCostReduction: 70.000000000001,
    });
    expect(calculateEffectiveActionCosts(state, skill, 0).qiCost).toBe(30);
  });

  it('consumes toxicity/droplets/buff cost before masteries, then pays and resolves harmony even on failure', () => {
    const result = run('0717-mastery-before-cost-failed');
    expect(result.toxicity).toBe(5);
    expect(result.qiDroplets).toBe(0);
    expect(result.buffs.has('discount')).toBe(false);
    expect(result.buffs.get('mastery_surcharge')?.stacks).toBe(2);
    expect(result.qi).toBe(75); // 10 * (1 + 400/100), then echo's separate half-cost floor.
    expect(result.stability).toBe(49);
    expect(result.completion).toBe(0);
    expect(result.harmonyData?.enhancingEcho?.lastOutcome).toBe('echo');
    expect(result.step).toBe(1);
    expect(result.history).toHaveLength(1);
  });

  it('retains pre-action legality even when a mastery could make payment free', () => {
    const skill = retargetSkill({
      qiCost: 20,
      masteryEntries: [
        { kind: 'effect', effects: [{ kind: 'pool', amount: { value: 100 } }] },
      ],
    });
    expect(
      applySkill(
        new CraftingState({ qi: 10, stability: 50 }),
        skill,
        retargetConfig(skill),
      ),
    ).toBeNull();
  });

  it('consumes strengthened chance-mastery values once, independently of technique failure', () => {
    const result = run('0717-chance-mastery-as-is');
    expect(result.completion).toBe(30);
    expect(result.perfection).toBe(0);
  });

  it('runs Jade through the normal completion applier including boost', () => {
    const result = run('0717-jade');
    expect(result.perfection).toBe(100);
    expect(result.completion).toBe(60);
  });

  it('guards trigger/buff pairs against recursive re-entry, without suppressing other trigger kinds', () => {
    const result = run('0717-trigger-cycle');
    expect(result.completion).toBe(30);
    expect(result.perfection).toBe(101);
  });

  it.each(['fusion_invasion', 'refinement_invasion'])(
    'accumulates %s duration without multiplying the stat penalty',
    (key) => {
      const result = run(`0717-${key}`);
      expect(result.buffs.get(key)?.stacks).toBe(3);
      expect(result.completion).toBe(8);
    },
  );

  it('models Stablizing Circuit droplets, cooldown, cloning and no immediate new-name tick', () => {
    const scenario = scenarios.find(
      (entry) => entry.name === '0717-stablizing-circuit',
    )!;
    expect(
      canApplySkill(scenario.state.copy({ qiDroplets: 2 }), scenario.skill, 0),
    ).toBe(false);
    const result = run(scenario.name);
    expect(result.qiDroplets).toBe(0);
    expect(result.maxQiDroplets).toBe(6);
    expect(scenario.state.qiDroplets).toBe(3);
    expect(result.getCacheKey()).not.toBe(
      result.copy({ qiDroplets: 1 }).getCacheKey(),
    );
    expect(result.cooldowns.get('stablizing_circuit')).toBe(9999999);
    expect(result.buffs.get('circuit')?.internalState).toEqual({
      fusion: 1,
      refine: 1,
      stabilize: 1,
      support: 1,
    });
    const nextSkill = retargetSkill({ type: 'stabilize' });
    const next = applySkill(result, nextSkill, retargetConfig(nextSkill))!;
    expect(next.buffs.get('circuit')?.internalState).toEqual({
      fusion: 0,
      refine: 0,
      stabilize: 0,
      support: 0,
    });
  });

  it('merges instance variables/state on every effect, preserves add-mode extra-key semantics and type-before-ordinary ticks', () => {
    const state = new CraftingState({
      qi: 100,
      stability: 50,
      buffs: new Map([
        [
          'scope',
          {
            name: 'scope',
            stacks: 2,
            internalState: { primary: 1, extra: 4 },
            definition: {
              name: 'Scope',
              canStack: true,
              additionalVariables: { value: 3, roomEffectiveness: 50 },
              onRefine: [
                {
                  kind: 'setState',
                  key: 'primary',
                  keys: ['extra'],
                  mode: 'add',
                  value: { value: 2 },
                },
              ],
              effects: [
                {
                  kind: 'completion',
                  amount: {
                    value: 1,
                    eqn: 'primary + extra + value + stacks',
                    scalesWithRoomEffectiveness: true,
                  },
                },
              ],
            },
          },
        ],
      ]),
    });
    const skill = retargetSkill();
    const result = applySkill(state, skill, retargetConfig(skill))!;
    expect(result.buffs.get('scope')?.internalState).toEqual({
      primary: 3,
      extra: 5,
    });
    expect(result.completion).toBe(19); // floor((3 + 5 + 3 + 2) * 1.5).
  });

  it('evaluates nested/stepped multipliers, increasing thresholds, room scaling and final integer rounding', () => {
    const vars = {
      counter: 9,
      roomEffectiveness: 50,
    } as unknown as ScalingVariables;
    expect(
      evaluateScaling(
        {
          value: 2.4,
          multiplier: { value: 0.5, scaling: 'counter', increment: 1 },
        },
        vars,
      ),
    ).toBe(7.199999999999999);
    expect(
      evaluateScaling(
        {
          value: 2.4,
          multiplier: {
            value: 1.1,
            multiplier: { value: 0.5, scaling: 'counter' },
          },
          roundToInteger: true,
        },
        vars,
      ),
    ).toBe(19);
    expect(
      evaluateScaling(
        { value: 2.5, scalesWithRoomEffectiveness: true, roundToInteger: true },
        vars,
      ),
    ).toBe(4);
  });
});
