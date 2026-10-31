import { CraftingState } from '../optimizer/state';
import {
  applySkill,
  calculateActionSurvivabilityFloor,
} from '../optimizer/skills';
import {
  retargetSkill,
  retargetConfig,
  retargetScenarios,
} from './fixtures/runtime0717';

describe('audit: safety floor must agree with deterministic transition', () => {
  it('must account for a consumed cost-reduction buff before payment', () => {
    const skill = retargetSkill({
      stabilityCost: 10,
      qiCost: 0,
      buffCost: { buffName: 'discount', amount: 1 },
    });
    const config = retargetConfig(skill);
    const state = new CraftingState({
      qi: 100,
      stability: 6,
      buffs: new Map([
        [
          'discount',
          {
            name: 'discount',
            stacks: 1,
            definition: {
              name: 'Discount',
              canStack: true,
              effects: [],
              stats: { stabilityCostReduction: { value: 50 } },
            },
          },
        ],
      ]),
    });
    const actual = applySkill(state, skill, config)!;
    const floor = calculateActionSurvivabilityFloor(state, skill, config)!;
    expect(actual.stability).toBe(0);
    expect(floor.stability).toBeLessThanOrEqual(actual.stability);
  });

  it('must account for deterministic effect mastery restoration', () => {
    const skill = retargetSkill({
      stabilityCost: 10,
      qiCost: 0,
      masteryEntries: [
        {
          kind: 'effect',
          effects: [{ kind: 'stability', amount: { value: 20 } }],
        },
      ],
    });
    const config = retargetConfig(skill);
    const state = new CraftingState({ qi: 100, stability: 6 });
    const actual = applySkill(state, skill, config)!;
    const floor = calculateActionSurvivabilityFloor(state, skill, config)!;
    expect(actual.stability).toBe(16);
    expect(floor.stability).toBe(actual.stability);
  });

  it('must recognize the existing deterministic Fairy payment fixture as survivable', () => {
    const scenario = retargetScenarios().find(
      (s) => s.name === '0717-fairy-payment-100',
    )!;
    const state = scenario.state.copy({ stability: 20 });
    const actual = applySkill(state, scenario.skill, scenario.config)!;
    const floor = calculateActionSurvivabilityFloor(
      state,
      scenario.skill,
      scenario.config,
    )!;
    expect(actual.stability).toBeGreaterThan(0);
    expect(floor.stability).toBe(actual.stability);
  });
});
