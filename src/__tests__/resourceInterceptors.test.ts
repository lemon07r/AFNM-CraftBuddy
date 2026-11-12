import { CraftingState } from '../optimizer/state';
import type {
  BuffDefinition,
  CraftingEffectInterceptor,
} from '../optimizer/gameTypes';
import {
  applySkill,
  calculateActionSurvivabilityFloor,
  calculateDisplayedSkillGains,
  calculateSkillGains,
} from '../optimizer/skills';
import { hanBuff, hanScenarios, suBuff } from './fixtures/companions';
import { retargetConfig, retargetSkill } from './fixtures/runtime0717';

function owner(interceptors: CraftingEffectInterceptor[]): BuffDefinition {
  return {
    name: 'Resource perk',
    canStack: false,
    effects: [],
    craftingEffectInterceptors: interceptors,
  };
}

function held(definition: BuffDefinition, stacks = 1): CraftingState {
  return new CraftingState({
    qi: 50,
    stability: 30,
    toxicity: 20,
    step: 2,
    buffs: new Map([['perk', { name: definition.name, stacks, definition }]]),
  });
}

describe('0.7.20 resource-scope crafting interceptors', () => {
  it('normalizes legacy replay prevention, including its old zero-stack behavior', () => {
    const base = hanScenarios().find(
      ({ name }) => name === 'companion-han-certain-effect',
    )!;
    const legacy: BuffDefinition = {
      name: 'Legacy Han',
      canStack: false,
      effects: [],
      stabilityLossPrevention: { uses: 2 },
    };
    const state = held(legacy, 0);
    const next = applySkill(state, base.skill, base.config)!;
    expect(next.stability).toBe(30);
    expect(next.buffs.get('perk')?.internalState).toEqual({
      preventedStabilityLosses: 2,
    });
    expect(state.buffs.get('perk')?.internalState).toBeUndefined();
  });

  it.each(['cost', 'effect', 'uncertain-success', 'uncertain-condition'])(
    'uses native stability prevention only on certain priced losses: %s',
    (source) => {
      const definition = hanBuff();
      definition.stats = { stabilityCostReduction: { value: 50 } };
      const state = held(definition);
      const uncertain = source.startsWith('uncertain');
      const skill = retargetSkill({
        qiCost: 0,
        stabilityCost: source === 'cost' ? 10 : 0,
        successChance: source === 'uncertain-success' ? 0.5 : 1,
        effects:
          source === 'cost'
            ? []
            : [
                {
                  kind: 'stability',
                  amount: { value: -10 },
                  condition:
                    source === 'uncertain-condition'
                      ? { kind: 'chance', percentage: 50 }
                      : undefined,
                },
              ],
      });
      const next = applySkill(state, skill, retargetConfig(skill))!;
      expect(next.stability).toBe(uncertain ? 27.5 : 30);
      expect(
        next.buffs.get('perk')?.internalState?.preventedStabilityLosses ?? 0,
      ).toBe(uncertain ? 0 : 1);
    },
  );

  it('prevents exactly the configured number of per-turn max-stability losses', () => {
    const definition = owner([
      {
        scope: 'resource',
        appliesTo: ['maxStability'],
        trigger: {
          kind: 'condition',
          condition:
            'amount < 0 && preventedMaxStabilityLosses < preventionLimit',
        },
        modifier: { kind: 'multiply', value: 0 },
        effects: [
          {
            kind: 'setState',
            key: 'preventedMaxStabilityLosses',
            mode: 'add',
            value: { value: 1 },
          },
        ],
      },
    ]);
    definition.additionalVariables = {
      preventedMaxStabilityLosses: 0,
      preventionLimit: 2,
    };
    const skill = retargetSkill({ qiCost: 0, stabilityCost: 0, effects: [] });
    const config = retargetConfig(skill);
    let state = held(definition);
    for (const penalty of [0, 0, 1, 2]) {
      expect(
        calculateActionSurvivabilityFloor(state, skill, config)?.maxStability,
      ).toBe(60 - penalty);
      state = applySkill(state, skill, config)!;
      expect(state.stabilityPenalty).toBe(penalty);
    }
    expect(
      state.buffs.get('perk')?.internalState?.preventedMaxStabilityLosses,
    ).toBe(2);
  });

  it('previews restoration against the intercepted max-stability decay', () => {
    const definition = owner([
      {
        scope: 'resource',
        appliesTo: ['maxStability'],
        trigger: { kind: 'condition', condition: 'amount < 0' },
        modifier: { kind: 'multiply', value: 0 },
      },
    ]);
    const skill = retargetSkill({
      qiCost: 0,
      stabilityCost: 0,
      effects: [{ kind: 'stability', amount: { value: 5 } }],
    });
    const config = retargetConfig(skill);
    const state = held(definition).copy({ stability: 59 });
    const next = applySkill(state, skill, config)!;
    expect(next.stabilityPenalty).toBe(0);
    expect(next.stability).toBe(60);
    expect(calculateDisplayedSkillGains(state, skill, config).stability).toBe(
      1,
    );
  });

  it.each([true, false])(
    'halves pool before boost and reacts with originalAmount only when certain: %s',
    (certain) => {
      const definition = owner([
        {
          scope: 'resource',
          appliesTo: ['pool'],
          trigger: { kind: 'condition', condition: 'amount > 0' },
          modifier: { kind: 'multiply', value: 0.5 },
          effects: [
            {
              kind: 'stability',
              amount: {
                value: 0.1,
                eqn: 'originalAmount * (1 + qiBoost / 100)',
              },
            },
          ],
        },
      ]);
      definition.stats = {
        qiBoost: { value: 100 },
        stabilityBoost: { value: 100 },
      };
      const skill = retargetSkill({
        qiCost: 0,
        stabilityCost: 0,
        successChance: certain ? 1 : 0.5,
        effects: [{ kind: 'pool', amount: { value: 20 } }],
      });
      const next = applySkill(held(definition), skill, retargetConfig(skill))!;
      expect(next.qi).toBe(70);
      expect(next.stability).toBe(certain ? 38 : 30);
    },
  );

  it('re-reads owner state before each reaction condition', () => {
    const definition = owner([
      {
        scope: 'resource',
        appliesTo: ['completion'],
        trigger: { kind: 'condition', condition: 'amount > 0' },
        modifier: { kind: 'multiply', value: 1 },
        effects: [
          {
            kind: 'setState',
            key: 'charged',
            mode: 'add',
            value: { value: 1 },
          },
          {
            kind: 'setState',
            key: 'hits',
            mode: 'add',
            value: { value: 1 },
            condition: { kind: 'condition', condition: 'charged >= 1' },
          },
        ],
      },
    ]);
    definition.additionalVariables = { charged: 0, hits: 0 };
    const skill = retargetSkill({
      qiCost: 0,
      stabilityCost: 0,
      effects: [{ kind: 'completion', amount: { value: 10 } }],
    });
    const next = applySkill(held(definition), skill, retargetConfig(skill))!;
    expect(next.buffs.get('perk')?.internalState).toMatchObject({
      charged: 1,
      hits: 1,
    });
  });

  it('still multiplies uncertain applications when the interceptor has no effects', () => {
    const definition = owner([
      {
        scope: 'resource',
        appliesTo: ['pool'],
        modifier: { kind: 'multiply', value: 0.5 },
      },
    ]);
    const skill = retargetSkill({
      qiCost: 0,
      stabilityCost: 0,
      successChance: 0.5,
      effects: [{ kind: 'pool', amount: { value: 20 } }],
    });
    expect(applySkill(held(definition), skill, retargetConfig(skill))!.qi).toBe(
      55,
    );
  });

  it('evaluates Scaling additiveEqn without rounding, once in the resource scope, after Su', () => {
    const definition = suBuff();
    definition.additionalVariables = { unique_Pill: 1 };
    definition.craftingEffectInterceptors!.push({
      scope: 'resource',
      appliesTo: ['completion'],
      modifier: {
        kind: 'multiply',
        value: { value: 1, additiveEqn: '0.034 * unique_Pill' },
      },
    });
    // First match per owner is independent in the two scopes.
    const state = held(definition).copy({
      critChance: 100,
      critMultiplier: 200,
    });
    const skill = retargetSkill({
      qiCost: 0,
      stabilityCost: 0,
      effects: [{ kind: 'completion', amount: { value: 100 } }],
    });
    const config = retargetConfig(skill);
    expect(applySkill(state, skill, config)!.completion).toBe(310);
    expect(calculateSkillGains(state, skill, config).completion).toBe(310);
  });

  it('ignores native interceptors whose live owner has zero stacks', () => {
    const definition = owner([
      {
        scope: 'resource',
        appliesTo: ['pool'],
        modifier: { kind: 'multiply', value: 0 },
      },
    ]);
    const skill = retargetSkill({
      qiCost: 0,
      stabilityCost: 0,
      effects: [{ kind: 'pool', amount: { value: 10 } }],
    });
    expect(
      applySkill(held(definition, 0), skill, retargetConfig(skill))!.qi,
    ).toBe(60);
  });

  it('intercepts already-priced pool costs, buff restoration, and item restoration', () => {
    const definition = owner([
      {
        scope: 'resource',
        appliesTo: ['pool'],
        modifier: { kind: 'multiply', value: 0.5 },
      },
    ]);
    definition.effects = [{ kind: 'pool', amount: { value: 20 } }];
    const skill = retargetSkill({ qiCost: 10, stabilityCost: 0, effects: [] });
    expect(applySkill(held(definition), skill, retargetConfig(skill))!.qi).toBe(
      55,
    );
    const item = retargetSkill({
      actionKind: 'item',
      itemName: 'pill',
      consumesTurn: false,
      qiCost: 0,
      stabilityCost: 0,
      effects: [{ kind: 'pool', amount: { value: 20 } }],
    });
    const state = held(definition).copy({ items: new Map([['pill', 1]]) });
    expect(applySkill(state, item, retargetConfig(item))!.qi).toBe(60);
  });

  it('intercepts toxicity cleansing and explicit maximum changes before sealing', () => {
    const definition = owner([
      {
        scope: 'resource',
        appliesTo: ['maxStability', 'cleanseToxicity'],
        modifier: { kind: 'multiply', value: 0.5 },
      },
    ]);
    definition.effects = [{ kind: 'changeToxicity', amount: { value: 4 } }];
    const skill = retargetSkill({
      qiCost: 0,
      stabilityCost: 0,
      preventsMaxStabilityDecay: true,
      effects: [
        { kind: 'maxStability', amount: { value: -10 } },
        { kind: 'cleanseToxicity', amount: { value: 6 } },
      ],
    });
    const next = applySkill(held(definition), skill, retargetConfig(skill))!;
    expect(next.stabilityPenalty).toBe(5);
    expect(next.toxicity).toBe(15);
  });

  it('does not fire a reaction or spend a charge on zero amounts', () => {
    const state = held(hanBuff());
    const skill = retargetSkill({
      qiCost: 0,
      stabilityCost: 0,
      effects: [{ kind: 'stability', amount: { value: 0 } }],
    });
    const next = applySkill(state, skill, retargetConfig(skill))!;
    expect(next.buffs.get('perk')?.internalState).toBeUndefined();
  });
});
