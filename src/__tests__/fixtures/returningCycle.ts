import {
  CraftingState,
  initHarmonyData,
  RETURNED_PRECISION,
  type OptimizerConfig,
  type SkillDefinition,
} from '../../optimizer';
import { retargetConfig, retargetSkill } from './runtime0717';

export function cycleState(
  overrides: ConstructorParameters<typeof CraftingState>[0] = {},
): CraftingState {
  return new CraftingState({
    qi: 100,
    stability: 50,
    harmony: 0,
    harmonyData: initHarmonyData('returningCycle', 100),
    ...overrides,
  });
}

export function cycleConfig(
  skill: SkillDefinition,
  overrides: Partial<OptimizerConfig> = {},
): OptimizerConfig {
  return retargetConfig(skill, {
    maxQi: 100,
    isSublimeCraft: true,
    craftingType: 'returningCycle',
    ...overrides,
  });
}

export function precisionBuff(stacks: number) {
  return { name: 'Returned Precision', stacks, definition: RETURNED_PRECISION };
}

export function returningCycleScenarios() {
  const scenarios: Array<{
    name: string;
    state: CraftingState;
    skill: SkillDefinition;
    config: OptimizerConfig;
  }> = [];
  const add = (
    name: string,
    state: CraftingState,
    skill: SkillDefinition,
    config: Partial<OptimizerConfig> = {},
  ) => {
    scenarios.push({
      name: `0717-cycle-${name}`,
      state,
      skill,
      config: cycleConfig(skill, config),
    });
  };
  const paid = retargetSkill({ qiCost: 25 });
  add('accrue', cycleState(), paid);
  add('failed-accrue', cycleState(), { ...paid, successChance: 0 });
  add('restore-does-not-erase-payment', cycleState(), {
    ...paid,
    restoresQi: true,
    qiRestore: 25,
  });
  add(
    'drain',
    cycleState({
      harmonyData: {
        returningCycle: { charges: 3, storedQi: 4, chargeSize: 10 },
        recommendedTechniqueTypes: ['fusion'],
      },
    }),
    retargetSkill({ qiCost: 0 }),
  );
  const release = cycleState({
    harmonyData: {
      returningCycle: { charges: 2, storedQi: 7, chargeSize: 10 },
      recommendedTechniqueTypes: [],
    },
  });
  const stabilize = retargetSkill({ type: 'stabilize', qiCost: 15 });
  add('release', release, stabilize);
  const watcher = {
    name: 'Precision observer',
    stacks: 1,
    definition: {
      name: 'Precision observer',
      canStack: true,
      effects: [],
      triggeredEffects: [
        {
          trigger: 'stackGained.Returned Precision',
          effects: [
            {
              kind: 'setState' as const,
              key: 'gained',
              mode: 'add' as const,
              value: { value: 1, eqn: 'amount' },
            },
          ],
        },
        {
          trigger: 'stackLost.Returned Precision',
          effects: [
            {
              kind: 'setState' as const,
              key: 'lost',
              mode: 'add' as const,
              value: { value: 1, eqn: 'amount' },
            },
          ],
        },
      ],
    },
  };
  add(
    'release-silent',
    release.copy({
      buffs: new Map([
        ['returned_precision', precisionBuff(3)],
        ['precision_observer', watcher],
      ]),
    }),
    stabilize,
  );
  add('failed-release', release, { ...stabilize, successChance: 0 });
  add(
    'release-after-decay',
    release.copy({
      buffs: new Map([['returned_precision', precisionBuff(3)]]),
    }),
    stabilize,
  );
  add(
    'precision-decay',
    cycleState({ buffs: new Map([['returned_precision', precisionBuff(10)]]) }),
    retargetSkill({
      qiCost: 0,
      effects: [{ kind: 'completion', amount: { value: 100 } }],
    }),
  );
  add(
    'epsilon',
    cycleState({
      harmonyData: {
        returningCycle: { charges: 0, storedQi: 10 - 5e-9, chargeSize: 10 },
        recommendedTechniqueTypes: [],
      },
    }),
    retargetSkill({ qiCost: 0 }),
  );
  add(
    'fixed-initial-size',
    cycleState({
      buffs: new Map([
        [
          'larger_pool',
          {
            name: 'Larger pool',
            stacks: 1,
            definition: {
              name: 'Larger pool',
              canStack: false,
              effects: [],
              stats: { maxpool: { value: 100 } },
            },
          },
        ],
      ]),
    }),
    paid,
    { maxQi: 300 },
  );
  add('missing', cycleState({ harmonyData: undefined }), paid);
  add(
    'invalid-size',
    cycleState({
      harmonyData: {
        returningCycle: { charges: 8, storedQi: 9, chargeSize: 0 },
        recommendedTechniqueTypes: [],
      },
    }),
    paid,
  );
  add(
    'invalid-number',
    cycleState({
      harmonyData: {
        returningCycle: { charges: NaN, storedQi: 9, chargeSize: 10 },
        recommendedTechniqueTypes: [],
      },
    }),
    paid,
  );
  add(
    'uncapped-and-clamped',
    cycleState({
      harmonyData: {
        returningCycle: { charges: 1000, storedQi: 0, chargeSize: 10 },
        recommendedTechniqueTypes: [],
      },
    }),
    stabilize,
  );
  add(
    'fractional-drain-cleanup',
    cycleState({
      harmonyData: {
        returningCycle: { charges: 1, storedQi: 0, chargeSize: 3 },
        recommendedTechniqueTypes: [],
      },
    }),
    retargetSkill({ qiCost: 0 }),
  );
  add(
    'spend-trigger',
    cycleState({
      buffs: new Map([
        [
          'watch_spending',
          {
            name: 'Watch spending',
            stacks: 1,
            definition: {
              name: 'Watch spending',
              canStack: false,
              effects: [],
              triggeredEffects: [
                {
                  trigger: 'poolSpent',
                  effects: [{ kind: 'completion', amount: { value: 1 } }],
                },
              ],
            },
          },
        ],
      ]),
    }),
    retargetSkill({ qiCost: 10 }),
  );
  return scenarios;
}
