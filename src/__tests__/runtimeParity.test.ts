/**
 * Runtime parity tests for AFNM 0.7.5.
 *
 * Every fixture in this file mirrors a definition read out of the installed
 * runtime bundle, and every expected number is derived from the corresponding
 * runtime expression quoted in the comments.
 */

import { CraftingState, BuffType } from '../optimizer/state';
import {
  SkillDefinition,
  OptimizerConfig,
  DEFAULT_SKILLS,
  applySkill,
  calculateActionSurvivabilityFloor,
  calculateSkillGains,
} from '../optimizer/skills';
import { BuffDefinition } from '../optimizer/gameTypes';

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
    qiCost: 0,
    stabilityCost: 0,
    baseCompletionGain: 0,
    basePerfectionGain: 0,
    stabilityGain: 0,
    maxStabilityChange: 0,
    buffType: BuffType.NONE,
    buffDuration: 0,
    buffMultiplier: 1.0,
    type: 'fusion',
    scalesWithIntensity: false,
    preventsMaxStabilityDecay: false,
    ...overrides,
  };
}

describe('mastery percentage units', () => {
  const config = createTestConfig();

  it('should treat control mastery percentage as hundredths', () => {
    // Runtime: `case 'control': a.control *= 1 + c.percentage / 100`
    const state = new CraftingState();
    const skill = createTestSkill({
      basePerfectionGain: 1,
      type: 'refine',
      scalesWithControl: true,
      masteryEntries: [{ kind: 'control', percentage: 25 }] as any,
    });

    const gains = calculateSkillGains(state, skill, config);
    // control 16 * (1 + 25/100) = 20
    expect(gains.perfection).toBe(20);
  });

  it('should treat intensity mastery percentage as hundredths', () => {
    // Runtime: `case 'intensity': a.intensity *= 1 + c.percentage / 100`
    const state = new CraftingState();
    const skill = createTestSkill({
      baseCompletionGain: 1,
      type: 'fusion',
      scalesWithIntensity: true,
      masteryEntries: [{ kind: 'intensity', percentage: 50 }] as any,
    });

    const gains = calculateSkillGains(state, skill, config);
    // intensity 12 * (1 + 50/100) = 18
    expect(gains.completion).toBe(18);
  });

  it('should add critchance mastery percentage as raw percentage points', () => {
    // Runtime: `case 'critchance': a.critchance += c.percentage` - no division.
    const state = new CraftingState({
      critChance: 0,
      critMultiplier: 200,
    });
    const skill = createTestSkill({
      baseCompletionGain: 1,
      type: 'fusion',
      scalesWithIntensity: true,
      masteryEntries: [{ kind: 'critchance', percentage: 50 }] as any,
    });

    const gains = calculateSkillGains(state, skill, config);
    // critchance 50 -> EV multiplier = 1 - 0.5 + 0.5 * 2.0 = 1.5
    // completion = floor(12 * 1.5) = 18.
    // Dividing the percentage by 100 would give critchance 0.5 -> 12.
    expect(gains.completion).toBe(18);
  });

  it('should add critmultiplier mastery percentage as raw percentage points', () => {
    // Runtime: `case 'critmultiplier': a.critmultiplier += c.percentage`.
    const state = new CraftingState({
      critChance: 100,
      critMultiplier: 100,
    });
    const skill = createTestSkill({
      baseCompletionGain: 1,
      type: 'fusion',
      scalesWithIntensity: true,
      masteryEntries: [{ kind: 'critmultiplier', percentage: 100 }] as any,
    });

    const gains = calculateSkillGains(state, skill, config);
    // critmultiplier 100 + 100 = 200 -> always crits at 2x -> 12 * 2 = 24.
    expect(gains.completion).toBe(24);
  });
});

describe('Fallen Soulflame fragment triggers', () => {
  const config = createTestConfig({ maxToxicity: 100 });

  // Runtime `HM(e)` builds the fragment trigger effect list:
  //   [{ kind: 'stability', amount: { value: -5 }, condition: t },
  //    { kind: 'createBuff', buff: e, stacks: { value: 1 }, condition: t },
  //    { kind: 'addStack', stacks: { value: -9 }, condition: t }]
  // with `t = KXi(e)` = `{ kind: 'condition', condition: 'stacks >= 9' }`
  // (or `stacks >= 9 and <normalizedName> < <maxStacks>` when capped).
  const soulOfFusion: BuffDefinition = {
    name: 'Soul of Fusion',
    canStack: true,
    effects: [
      {
        kind: 'completion',
        amount: { value: 0.5, stat: 'intensity', scaling: 'stacks' },
      },
    ],
  };

  const fragmentTrigger = (buff: BuffDefinition) =>
    [
      {
        kind: 'stability' as const,
        amount: { value: -5 },
        condition: { kind: 'condition' as const, condition: 'stacks >= 9' },
      },
      {
        kind: 'createBuff' as const,
        buff,
        stacks: { value: 1 },
        condition: { kind: 'condition' as const, condition: 'stacks >= 9' },
      },
      {
        kind: 'addStack' as const,
        stacks: { value: -9 },
        condition: { kind: 'condition' as const, condition: 'stacks >= 9' },
      },
    ] as const;

  const soulFragment: BuffDefinition = {
    name: 'Soul Fragment IV',
    canStack: true,
    effects: [],
    onFusion: [...fragmentTrigger(soulOfFusion)],
  };

  const fusionSkill = createTestSkill({
    type: 'fusion',
    preventsMaxStabilityDecay: true,
  });

  const stateWithFragments = (stacks: number) =>
    new CraftingState({
      qi: 100,
      stability: 50,
      initialMaxStability: 60,
      step: 1,
      buffs: new Map([
        [
          'soul_fragment_iv',
          {
            name: 'Soul Fragment IV',
            stacks,
            definition: soulFragment,
          },
        ],
      ]),
    });

  it('should spend 5 stability, create the Soul buff and consume 9 fragments', () => {
    const result = applySkill(stateWithFragments(9), fusionSkill, config);

    expect(result).not.toBeNull();
    expect(result!.stability).toBe(45);
    expect(result!.getBuffStacks('soul_of_fusion')).toBe(1);
    expect(result!.getBuffStacks('soul_fragment_iv')).toBe(0);
  });

  it('should not trigger below the 9 stack threshold', () => {
    const result = applySkill(stateWithFragments(8), fusionSkill, config);

    expect(result).not.toBeNull();
    expect(result!.stability).toBe(50);
    expect(result!.hasBuff('soul_of_fusion')).toBe(false);
    expect(result!.getBuffStacks('soul_fragment_iv')).toBe(8);
  });

  it('should not trigger on an action family the fragment does not hook', () => {
    const refineSkill = createTestSkill({
      type: 'refine',
      preventsMaxStabilityDecay: true,
    });
    const result = applySkill(stateWithFragments(9), refineSkill, config);

    expect(result).not.toBeNull();
    expect(result!.stability).toBe(50);
    expect(result!.getBuffStacks('soul_fragment_iv')).toBe(9);
  });

  it('should account for the -5 stability loss in the survivability floor', () => {
    const floor = calculateActionSurvivabilityFloor(
      stateWithFragments(9),
      fusionSkill,
      config,
    );
    const safeFloor = calculateActionSurvivabilityFloor(
      stateWithFragments(8),
      fusionSkill,
      config,
    );

    expect(floor).not.toBeNull();
    expect(safeFloor).not.toBeNull();
    expect(floor!.stability).toBe(45);
    expect(safeFloor!.stability).toBe(50);
  });
});

describe('Turbid Qi step accrual', () => {
  const config = createTestConfig();

  // Runtime reducer: `t.step++, t.step >= Tms && t.step % Ems === 0 &&
  // K8(Cms, 1, e, e.animations, n)` with `Tms = 100` and `Ems = 3`.
  const turbidQi: BuffDefinition = {
    name: 'Turbid Qi',
    canStack: true,
    stats: { poolCostFlat: { value: 1, scaling: 'stacks' } },
    effects: [],
    onFusion: [],
    onRefine: [],
  };

  const stateAtStep = (step: number, stacks = 1) =>
    new CraftingState({
      qi: 194,
      stability: 50,
      initialMaxStability: 60,
      step,
      buffs: new Map([
        ['turbid_qi', { name: 'Turbid Qi', stacks, definition: turbidQi }],
      ]),
    });

  const skill = createTestSkill({ preventsMaxStabilityDecay: true });

  it('should not grant a stack below the step threshold', () => {
    // step 98 -> 99: divisible by 3 but below 100.
    const result = applySkill(stateAtStep(98), skill, config);

    expect(result).not.toBeNull();
    expect(result!.step).toBe(99);
    expect(result!.getBuffStacks('turbid_qi')).toBe(1);
  });

  it('should not grant a stack on steps that are not multiples of three', () => {
    // step 99 -> 100: at the threshold, but 100 % 3 === 1.
    const result = applySkill(stateAtStep(99), skill, config);

    expect(result).not.toBeNull();
    expect(result!.step).toBe(100);
    expect(result!.getBuffStacks('turbid_qi')).toBe(1);
  });

  it('should grant a stack on the first qualifying step', () => {
    // step 101 -> 102: 102 >= 100 and 102 % 3 === 0.
    const result = applySkill(stateAtStep(101), skill, config);

    expect(result).not.toBeNull();
    expect(result!.step).toBe(102);
    expect(result!.getBuffStacks('turbid_qi')).toBe(2);
  });

  it('should not grant a stack for actions that do not consume a turn', () => {
    // The reducer only bumps `t.step` for turn-consuming actions.
    const freeSkill = createTestSkill({
      key: 'test_free',
      consumesTurn: false,
      preventsMaxStabilityDecay: true,
    });
    const result = applySkill(stateAtStep(101), freeSkill, config);

    expect(result).not.toBeNull();
    expect(result!.step).toBe(101);
    expect(result!.getBuffStacks('turbid_qi')).toBe(1);
  });

  it('should never fabricate the buff when the craft is not tracking it', () => {
    const state = new CraftingState({
      qi: 194,
      stability: 50,
      initialMaxStability: 60,
      step: 101,
    });
    const result = applySkill(state, skill, config);

    expect(result).not.toBeNull();
    expect(result!.hasBuff('turbid_qi')).toBe(false);
  });
});

describe('changeToxicity sign', () => {
  const config = createTestConfig({ maxToxicity: 100 });

  // Runtime `changeToxicity` handler does `t.stats.toxicity -= amount` on both
  // branches; the tooltip builder reads `amount.value > 0` as "cleanse
  // toxicity by X" and anything else as "gain X toxicity".
  const toxicityBuff = (value: number): BuffDefinition => ({
    name: 'Toxic Tick',
    canStack: true,
    effects: [{ kind: 'changeToxicity', amount: { value } }],
  });

  const stateWithBuff = (value: number) =>
    new CraftingState({
      qi: 100,
      stability: 50,
      initialMaxStability: 60,
      toxicity: 10,
      buffs: new Map([
        [
          'toxic_tick',
          { name: 'Toxic Tick', stacks: 1, definition: toxicityBuff(value) },
        ],
      ]),
    });

  const skill = createTestSkill({
    type: 'support',
    preventsMaxStabilityDecay: true,
  });

  it('should increase toxicity for a negative amount', () => {
    const result = applySkill(stateWithBuff(-5), skill, config);

    expect(result).not.toBeNull();
    expect(result!.toxicity).toBe(15);
  });

  it('should decrease toxicity for a positive amount', () => {
    const result = applySkill(stateWithBuff(5), skill, config);

    expect(result).not.toBeNull();
    expect(result!.toxicity).toBe(5);
  });
});

describe('progress percentage scaling variables', () => {
  // Runtime builds these in camelCase only:
  //   vars.completionPercentage = Math.floor((c.guaranteed + c.bonusChance) * 100)
  //   vars.perfectionPercentage = Math.floor((l.guaranteed + l.bonusChance) * 100)
  // where c/l come from getBonusAndChance(progress, target).
  const config = createTestConfig({
    targetCompletion: 100,
    targetPerfection: 200,
  });

  it('should expose completionPercentage to scaling equations', () => {
    const state = new CraftingState({ completion: 50, perfection: 0 });
    const skill = createTestSkill({
      effects: [
        {
          kind: 'completion',
          amount: { value: 1, eqn: 'completionPercentage' },
        },
      ] as any,
    });

    const gains = calculateSkillGains(state, skill, config);
    // getBonusAndChance(50, 100) -> guaranteed 0, bonusChance 0.5 -> 50
    expect(gains.completion).toBe(50);
  });

  it('should expose perfectionPercentage to scaling equations', () => {
    const state = new CraftingState({ completion: 0, perfection: 50 });
    const skill = createTestSkill({
      type: 'refine',
      effects: [
        {
          kind: 'perfection',
          amount: { value: 1, eqn: 'perfectionPercentage' },
        },
      ] as any,
    });

    const gains = calculateSkillGains(state, skill, config);
    // getBonusAndChance(50, 200) -> guaranteed 0, bonusChance 0.25 -> 25
    expect(gains.perfection).toBe(25);
  });

  it('should keep the lowercase aliases working', () => {
    const state = new CraftingState({ completion: 50, perfection: 0 });
    const skill = createTestSkill({
      effects: [
        {
          kind: 'completion',
          amount: { value: 1, eqn: 'completionpercentage' },
        },
      ] as any,
    });

    const gains = calculateSkillGains(state, skill, config);
    expect(gains.completion).toBe(50);
  });
});
