import {
  applySkill,
  calculateActionSurvivabilityFloor,
} from '../optimizer/skills';
import { mechanics0719Scenarios } from './fixtures/mechanics0719';
import { CraftingState } from '../optimizer/state';
import { retargetConfig, retargetSkill } from './fixtures/runtime0717';

describe('AFNM 0.7.19 audited mechanics', () => {
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
