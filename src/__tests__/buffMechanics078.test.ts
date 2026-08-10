/**
 * Unit tests for the 0.7.7/0.7.8 buff mechanics:
 * - triggeredEffects + setState + internalState (True Bifang Flame, Flame of
 *   the Azure Depths)
 * - sealedMaxStability (Illume Crucible)
 * - discordantConditions (Uncontrollable Flames / Flame of Discordance)
 *
 * Every expectation is derived from the installed 0.7.8 runtime bundle, not
 * from the patch notes: trigger scope (`amount`/`percentGained`), the 1.3x
 * threshold-tier `percentGained` formula (runtime `O7o`), the seal's forced
 * decay (`(!i.noMaxStabilityLoss||E7o(e))&&t.stabilityPenalty++`) and restore
 * block (`D7o`), and the discordant gate (`if (Math.random() >= d) return
 * 'neutral'` at the stay-neutral decision).
 */

import { CraftingState, BuffType } from '../optimizer/state';
import {
  SkillDefinition,
  OptimizerConfig,
  DEFAULT_SKILLS,
  applySkill,
  getBuffDiscordantConditions,
} from '../optimizer/skills';
import {
  BuffDefinition,
  getBonusAndChance,
} from '../optimizer/gameTypes';
import { normalizeForecastConditionQueue } from '../optimizer/search';

function createTestConfig(
  overrides: Partial<OptimizerConfig> = {},
): OptimizerConfig {
  return {
    maxQi: 194,
    maxStability: 60,
    baseIntensity: 12,
    baseControl: 16,
    minStability: 0,
    skills: DEFAULT_SKILLS,
    defaultBuffMultiplier: 1.4,
    ...overrides,
  };
}

function createTestSkill(
  overrides: Partial<SkillDefinition> = {},
): SkillDefinition {
  return {
    name: 'Test Skill',
    key: 'test_skill',
    qiCost: 10,
    stabilityCost: 10,
    baseCompletionGain: 0,
    basePerfectionGain: 0,
    stabilityGain: 0,
    maxStabilityChange: 0,
    buffType: BuffType.NONE,
    buffDuration: 0,
    buffMultiplier: 1.0,
    type: 'fusion',
    scalesWithIntensity: true,
    preventsMaxStabilityDecay: false,
    ...overrides,
  };
}

function stateWithBuff(
  buffKey: string,
  definition: BuffDefinition,
  internalState?: Record<string, number>,
  stateOverrides: Record<string, unknown> = {},
): CraftingState {
  return new CraftingState({
    qi: 100,
    stability: 50,
    buffs: new Map([
      [
        buffKey,
        {
          name: definition.name,
          stacks: 1,
          definition,
          internalState,
        },
      ],
    ]),
    ...stateOverrides,
  });
}

/** Runtime-shaped True Bifang Flame buff (0.7.8 bundle, `gmi`). */
function trueBifangDefinition(): BuffDefinition {
  return {
    name: 'True Bifang Flame',
    canStack: false,
    stats: {
      control: { value: 0.03, stat: 'control', scaling: 'blaze' },
    },
    initialState: { blaze: '0' },
    effects: [],
    triggeredEffects: [
      {
        trigger: 'completionGained',
        effects: [
          {
            kind: 'setState',
            key: 'blaze',
            mode: 'set',
            value: { value: 1, eqn: 'max(blaze, floor(percentGained))' },
          },
        ],
      },
    ],
  } as unknown as BuffDefinition;
}

/** Runtime-shaped Flame of the Azure Depths IV buff (0.7.8 bundle, `Jpi`). */
function azureDepthsDefinition(): BuffDefinition {
  return {
    name: 'Flame of the Azure Depths IV',
    canStack: false,
    stats: {
      control: { value: 0.01, stat: 'control', scaling: 'stored' },
      intensity: { value: 0.01, stat: 'intensity', scaling: 'stored' },
    },
    initialState: { stored: '0', charge: '0' },
    effects: [
      {
        kind: 'setState',
        key: 'stored',
        mode: 'set',
        value: { value: 1, eqn: 'max(0, stored - 1)' },
      },
    ],
    triggeredEffects: [
      {
        trigger: 'poolSpent',
        effects: [
          {
            kind: 'setState',
            key: 'charge',
            mode: 'add',
            value: { value: 1, eqn: 'amount / 1' },
          },
          {
            kind: 'setState',
            key: 'stored',
            mode: 'add',
            value: { value: 1, eqn: 'floor(charge * 100 / maxpool)' },
          },
          {
            kind: 'setState',
            key: 'charge',
            mode: 'set',
            value: {
              value: 1,
              eqn: 'charge - floor(charge * 100 / maxpool) * maxpool / 100',
            },
          },
        ],
      },
    ],
  } as unknown as BuffDefinition;
}

describe('0.7.8 sealedMaxStability (Illume Crucible)', () => {
  const sealedDefinition = {
    name: 'Illume Crucible',
    canStack: false,
    sealedMaxStability: true,
    effects: [],
  } as unknown as BuffDefinition;

  it('forces max stability decay even when the technique prevents it', () => {
    const config = createTestConfig();
    const skill = createTestSkill({ preventsMaxStabilityDecay: true });

    const unsealed = applySkill(
      new CraftingState({ qi: 100, stability: 50 }),
      skill,
      config,
    );
    expect(unsealed?.stabilityPenalty).toBe(0);

    const sealed = applySkill(
      stateWithBuff('illume_crucible', sealedDefinition),
      skill,
      config,
    );
    expect(sealed?.stabilityPenalty).toBe(1);
  });

  it('blocks restoresMaxStabilityToFull while sealed', () => {
    const config = createTestConfig();
    const skill = createTestSkill({ restoresMaxStabilityToFull: true });

    const unsealed = applySkill(
      new CraftingState({ qi: 100, stability: 50, stabilityPenalty: 5 }),
      skill,
      config,
    );
    expect(unsealed?.stabilityPenalty).toBe(0);

    // Sealed: the full restore is dropped and the per-action decay still runs.
    const sealed = applySkill(
      stateWithBuff('illume_crucible', sealedDefinition, undefined, {
        stabilityPenalty: 5,
      }),
      skill,
      config,
    );
    expect(sealed?.stabilityPenalty).toBe(6);
  });

  it('blocks positive maxStabilityChange but still applies reductions', () => {
    const config = createTestConfig();
    const restoring = createTestSkill({ maxStabilityChange: 3 });
    const sealedRestore = applySkill(
      stateWithBuff('illume_crucible', sealedDefinition, undefined, {
        stabilityPenalty: 5,
      }),
      restoring,
      config,
    );
    // Decay (5 -> 6) lands; the +3 restore is dropped.
    expect(sealedRestore?.stabilityPenalty).toBe(6);

    const reducing = createTestSkill({ maxStabilityChange: -2 });
    const sealedReduce = applySkill(
      stateWithBuff('illume_crucible', sealedDefinition, undefined, {
        stabilityPenalty: 5,
      }),
      reducing,
      config,
    );
    // Decay (5 -> 6) lands and the -2 max stability reduction still applies.
    expect(sealedReduce?.stabilityPenalty).toBe(8);
  });
});

describe('0.7.7 triggeredEffects + setState (True Bifang Flame)', () => {
  it('stores floor(percentGained) blaze on completionGained', () => {
    const config = createTestConfig();
    // One deterministic completion application of 25 against a 100 target:
    // tier progress 0 -> 0.25, so percentGained = 25 and blaze = 25.
    const skill = createTestSkill({
      qiCost: 0,
      stabilityCost: 0,
      effects: [{ kind: 'completion', amount: { value: 25 } } as never],
    });
    const next = applySkill(
      stateWithBuff('true_bifang_flame', trueBifangDefinition(), {
        blaze: 0,
      }),
      skill,
      config,
      [],
      100,
    );
    const buff = next?.buffs.get('true_bifang_flame');
    expect(buff?.internalState?.blaze).toBe(25);
  });

  it('keeps the largest single application instead of the latest one', () => {
    const config = createTestConfig();
    const skill = createTestSkill({
      qiCost: 0,
      stabilityCost: 0,
      effects: [{ kind: 'completion', amount: { value: 10 } } as never],
    });
    // blaze already holds 40 from an earlier, bigger application.
    const next = applySkill(
      stateWithBuff('true_bifang_flame', trueBifangDefinition(), {
        blaze: 40,
      }),
      skill,
      config,
      [],
      100,
    );
    const buff = next?.buffs.get('true_bifang_flame');
    expect(buff?.internalState?.blaze).toBe(40);
  });

  it('matches the runtime tier formula when a threshold tier is crossed', () => {
    const config = createTestConfig();
    // Completion 90 -> 140 against target 100 crosses the first threshold.
    const skill = createTestSkill({
      qiCost: 0,
      stabilityCost: 0,
      effects: [{ kind: 'completion', amount: { value: 50 } } as never],
    });
    const next = applySkill(
      stateWithBuff('true_bifang_flame', trueBifangDefinition(), { blaze: 0 }, {
        completion: 90,
      }),
      skill,
      config,
      [],
      100,
    );
    const before = getBonusAndChance(90, 100);
    const after = getBonusAndChance(140, 100);
    const expectedPercent =
      (after.guaranteed +
        after.bonusChance -
        (before.guaranteed + before.bonusChance)) *
      100;
    const buff = next?.buffs.get('true_bifang_flame');
    expect(buff?.internalState?.blaze).toBe(Math.floor(expectedPercent));
    // Sanity: the second tier is 130 wide (1.3x inflation), so progress past
    // the threshold counts less per point and the total is below the raw 50%.
    expect(expectedPercent).toBeCloseTo(40.769, 3);
  });
});

describe('0.7.7 triggeredEffects (Flame of the Azure Depths)', () => {
  it('stores 1 Qi per 1% of max pool spent, then decays by 1 per action', () => {
    const config = createTestConfig();
    const skill = createTestSkill({ qiCost: 10, stabilityCost: 10 });
    const next = applySkill(
      stateWithBuff('flame_of_the_azure_depths_iv', azureDepthsDefinition(), {
        stored: 0,
        charge: 0,
      }),
      skill,
      config,
    );
    const buff = next?.buffs.get('flame_of_the_azure_depths_iv');
    // poolSpent(10): charge = 10, stored += floor(10 * 100 / 194) = 5,
    // charge keeps the 0.3 remainder; the per-action decay then removes 1.
    expect(buff?.internalState?.stored).toBe(4);
    expect(buff?.internalState?.charge).toBeCloseTo(0.3, 5);
  });

  it('accumulates the charge remainder across actions', () => {
    const config = createTestConfig();
    const skill = createTestSkill({ qiCost: 10, stabilityCost: 10 });
    const first = applySkill(
      stateWithBuff('flame_of_the_azure_depths_iv', azureDepthsDefinition(), {
        stored: 0,
        charge: 0,
      }),
      skill,
      config,
    );
    expect(first).not.toBeNull();
    const second = applySkill(first!, skill, config);
    const buff = second?.buffs.get('flame_of_the_azure_depths_iv');
    // Second action: charge 0.3 + 10 = 10.3 -> stored += floor(1030/194) = 5,
    // then decay: 4 + 5 - 1 = 8; charge keeps 10.3 - 5 * 1.94 = 0.6.
    expect(buff?.internalState?.stored).toBe(8);
    expect(buff?.internalState?.charge).toBeCloseTo(0.6, 5);
  });
});

describe('0.7.7 initialState seeding', () => {
  it('seeds internal state when a buff is created mid-craft', () => {
    const config = createTestConfig();
    const skill = createTestSkill({
      qiCost: 0,
      stabilityCost: 0,
      effects: [
        {
          kind: 'createBuff',
          stacks: { value: 1 },
          buff: {
            name: 'Seeded Buff',
            canStack: false,
            initialState: { blaze: '0', charge: '1' },
            effects: [],
          },
        } as never,
      ],
    });
    const next = applySkill(
      new CraftingState({ qi: 100, stability: 50 }),
      skill,
      config,
    );
    const buff = next?.buffs.get('seeded_buff');
    expect(buff?.stacks).toBe(1);
    expect(buff?.internalState).toEqual({ blaze: 0, charge: 1 });
  });
});

describe('0.7.7 discordantConditions (Uncontrollable Flames)', () => {
  it('picks the strongest discordance across held buffs', () => {
    const buffs = new Map([
      [
        'uncontrollable_flames',
        {
          name: 'Uncontrollable Flames',
          stacks: 1,
          definition: {
            name: 'Uncontrollable Flames',
            discordantConditions: 0.7,
            effects: [],
          } as unknown as BuffDefinition,
        },
      ],
      [
        'other_buff',
        {
          name: 'Other Buff',
          stacks: 1,
          definition: {
            name: 'Other Buff',
            discordantConditions: 0.2,
            effects: [],
          } as unknown as BuffDefinition,
        },
      ],
    ]);
    expect(getBuffDiscordantConditions(buffs)).toBe(0.7);
    expect(getBuffDiscordantConditions(new Map())).toBe(0);
  });

  it('shifts the generated condition away from Balanced 70% of the time', () => {
    // Empty queue with a non-neutral current condition and harmony 0: no
    // trailing neutrals, so the change probability is 0 and the forecast
    // normally stays Balanced forever.
    const normal = normalizeForecastConditionQueue('positive', [], 0);
    expect(normal[0]).toBe('neutral');

    // With d = 0.7 the stay-neutral outcome only holds 30% of the time; the
    // harmony roll (50/50 at harmony 0) becomes the most likely branch.
    const discordant = normalizeForecastConditionQueue(
      'positive',
      [],
      0,
      undefined,
      0.7,
    );
    expect(discordant[0]).toBe('positive');
  });
});
