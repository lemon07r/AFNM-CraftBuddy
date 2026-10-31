import { CraftingState } from '../optimizer/state';
import { applySkillOutcomes } from '../optimizer/skills';
import { findBestSkill } from '../optimizer/search';
import { prdCoefficient } from '../optimizer/stochastic';
import { retargetConfig, retargetSkill } from './fixtures/runtime0717';

const skill = retargetSkill({
  key: 'probe',
  successChance: 0.5,
  qiCost: 0,
  stabilityCost: 3,
  effects: [{ kind: 'completion', amount: { value: 50 } }],
});
const config = retargetConfig(skill, {
  techniqueSuccessModel: 'prd',
  maxCompletion: 100,
  maxPerfection: 0,
  targetPerfection: 0,
  conditionEffectsData: {
    neutral: [],
    positive: [{ kind: 'chance', bonus: 0.5 }],
    negative: [],
    veryPositive: [],
    veryNegative: [],
  },
});
const state = (prior?: number) =>
  new CraftingState({
    qi: 100,
    stability: 6,
    nativeVariables:
      prior === undefined ? undefined : { prd_failures_probe: prior },
  });

test.each([undefined, 0, 2])(
  'guaranteed non-trial preserves incoming PRD streak %s',
  (prior) => {
    const first = applySkillOutcomes(
      state(prior),
      skill,
      config,
      [{ kind: 'chance', bonus: 0.5 }],
      100,
      'positive',
    ).outcomes[0].state;
    expect(first.nativeVariables?.prd_failures_probe).toBe(prior);
    const next = applySkillOutcomes(first, skill, config, [], 100, 'neutral');
    expect(next.probabilityUncertain).toBe(prior === undefined);
    if (prior !== undefined)
      expect(
        next.outcomes
          .filter((o) => o.state.completion === 100)
          .reduce((sum, o) => sum + o.probability, 0),
      ).toBeCloseTo(Math.min(1, prdCoefficient(0.5) * (prior + 1)), 12);
  },
);
test('a real PRD trial that reaches certainty still resets the streak', () => {
  const result = applySkillOutcomes(
    state(3),
    skill,
    config,
    [],
    100,
    'neutral',
  );
  expect(result.outcomes).toHaveLength(1);
  expect(result.outcomes[0].probability).toBe(1);
  expect(result.outcomes[0].state.nativeVariables?.prd_failures_probe).toBe(0);
});
test('a zero-chance trial still increments an observed streak', () => {
  const result = applySkillOutcomes(
    state(2),
    { ...skill, successChance: 0 },
    config,
  );
  expect(result.outcomes[0].state.nativeVariables?.prd_failures_probe).toBe(3);
});
test.each([undefined, 2])(
  'later neutral action keeps correct policy probability after guarantee, prior=%s',
  (prior) => {
    const result = findBestSkill(
      state(prior),
      config,
      100,
      0,
      false,
      2,
      'positive',
      ['neutral'],
      { maxNodes: 1000, timeBudgetMs: 60000 },
    );
    if (prior === undefined) {
      expect(result.recommendation?.planning?.probabilityUncertain).toBe(true);
      expect(result.recommendation?.projectedSuccessChance).toBeUndefined();
      expect(result.expectedFinalState).toBeUndefined();
    } else {
      expect(result.recommendation?.projectedSuccessChance).toBeCloseTo(
        prdCoefficient(0.5) * 3,
        12,
      );
    }
  },
);
test('a currently guaranteed finish stays certifiable with hidden carry-over', () => {
  const result = findBestSkill(
    new CraftingState({ qi: 100, stability: 3, completion: 50 }),
    config,
    100,
    0,
    false,
    1,
    'positive',
    [],
    { maxNodes: 1000, timeBudgetMs: 60000 },
  );
  expect(result.recommendation?.projectedSuccessChance).toBe(1);
  expect(result.expectedFinalState?.completion).toBe(100);
});
