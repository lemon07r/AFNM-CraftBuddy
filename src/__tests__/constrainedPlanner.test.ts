import {
  constrainedSearch,
  comparePlanningValues,
} from '../optimizer/constrainedPlanner';
import { findBestSkill } from '../optimizer/search';
import { mergePartitionedResults } from '../optimizer/searchBackend';
import { CraftingState } from '../optimizer/state';
import { applySkill, applySkillOutcomes } from '../optimizer/skills';
import { retargetSkill, retargetConfig } from './fixtures/runtime0717';
import { generatedConditions } from '../optimizer/conditionOutcomes';

const settings = {
  timeBudgetMs: 60000,
  maxNodes: 50000,
  beamWidth: 8,
  completionBandCeiling: 1,
  perfectionBandGoal: 1,
};
const progress = retargetSkill({
  key: 'progress',
  name: 'Progress',
  qiCost: 0,
  stabilityCost: 10,
  baseCompletionGain: 20,
  basePerfectionGain: 20,
});
const restore = retargetSkill({
  key: 'restore',
  name: 'Restore',
  qiCost: 20,
  stabilityCost: 0,
  stabilityGain: 40,
  preventsMaxStabilityDecay: true,
});

test('chooses guaranteed goal over a terminal gamble, via production entrypoint', () => {
  const gamble = retargetSkill({
    key: 'a_gamble',
    name: 'Gamble',
    qiCost: 0,
    stabilityCost: 10,
    baseCompletionGain: 200,
    successChance: 0.5,
  });
  const sure = {
    ...gamble,
    key: 'z_sure',
    name: 'Sure',
    baseCompletionGain: 100,
    successChance: 1,
  };
  const config = retargetConfig(gamble, {
    skills: [gamble, sure, restore],
    maxCompletion: 200,
    maxPerfection: 0,
  });
  const result = findBestSkill(
    new CraftingState({ qi: 100, stability: 10 }),
    config,
    100,
    0,
    false,
    6,
    'neutral',
    [],
    settings,
  );
  expect(result.recommendation?.skill.key).toBe('z_sure');
  expect(
    result.recommendation?.planning?.goalProbabilityLowerBound,
  ).toBeCloseTo(1);
  expect(result.recommendation?.planning?.prematureEndProbability).toBe(0);
});

test('does not restore a full bar even with far away maximum goals', () => {
  const config = retargetConfig(progress, {
    maxQi: 1000,
    skills: [progress, { ...restore, qiCost: 88 }],
    maxCompletion: 1000,
    maxPerfection: 1000,
  });
  const state = new CraftingState({
    qi: 1000,
    stability: 60,
    initialMaxStability: 60,
    completion: 100,
    perfection: 100,
  });
  const result = constrainedSearch(state, config, 100, 100, 6, 'neutral', [], {
    ...settings,
    completionBandCeiling: 8,
    perfectionBandGoal: 8,
  });
  expect(result.recommendation?.skill.key).toBe('progress');
});

test('preserves a recovery route instead of exhausting stability below the goal', () => {
  const unsafe = retargetSkill({
    key: 'unsafe',
    name: 'Unsafe',
    qiCost: 100,
    stabilityCost: 10,
    baseCompletionGain: 100,
    basePerfectionGain: 99,
  });
  const config = retargetConfig(progress, {
    skills: [unsafe, restore, progress],
    maxCompletion: 100,
    maxPerfection: 100,
  });
  const state = new CraftingState({
    qi: 100,
    stability: 10,
    initialMaxStability: 60,
  });
  const result = constrainedSearch(
    state,
    config,
    100,
    100,
    6,
    'neutral',
    [],
    settings,
  );
  expect(result.recommendation?.skill.key).toBe('restore');
  expect(
    result.recommendation?.planning?.goalProbabilityLowerBound,
  ).toBeCloseTo(1);
  const partials = config.skills.map((skill) =>
    constrainedSearch(state, config, 100, 100, 6, 'neutral', [], {
      ...settings,
      rootSkillKeys: [skill.key],
    }),
  );
  expect(mergePartitionedResults(partials).recommendation?.skill.key).toBe(
    'restore',
  );
});

test('uses the two remaining productive actions without unnecessary restoration', () => {
  const fusion = {
    ...progress,
    key: 'fusion',
    baseCompletionGain: 10,
    basePerfectionGain: 0,
  };
  const refine = {
    ...progress,
    key: 'refine',
    baseCompletionGain: 0,
    basePerfectionGain: 10,
  };
  const config = retargetConfig(fusion, {
    skills: [fusion, refine, restore],
    maxCompletion: 100,
    maxPerfection: 100,
  });
  const state = new CraftingState({
    qi: 100,
    stability: 21,
    completion: 90,
    perfection: 90,
  });
  const result = constrainedSearch(
    state,
    config,
    100,
    100,
    3,
    'neutral',
    [],
    settings,
  );
  expect(result.recommendation?.skill.key).not.toBe('restore');
  expect(
    result.recommendation?.planning?.goalProbabilityLowerBound,
  ).toBeCloseTo(1);
});

test('replans a full deterministic craft to both caps with a replenishable stability budget', () => {
  const config = retargetConfig(progress, {
    maxQi: 200,
    skills: [progress, restore],
    maxCompletion: 200,
    maxPerfection: 200,
  });
  let state = new CraftingState({
    qi: 200,
    stability: 30,
    initialMaxStability: 60,
  });
  let wasted = 0;
  for (let turn = 0; turn < 30 && state.completion < 200; turn++) {
    const result = findBestSkill(
      state,
      config,
      100,
      100,
      false,
      12,
      'neutral',
      [],
      { timeBudgetMs: 60000, maxNodes: 20000, beamWidth: 5 },
    );
    expect(result.recommendation).not.toBeNull();
    const skill = result.recommendation!.skill;
    const next = applySkill(state, skill, config, [], 100, 'neutral', 100)!;
    if (skill.key === 'restore' && next.stability <= state.stability) wasted++;
    state = next;
    if (state.stability === 0) break;
  }
  expect(state.completion).toBe(200);
  expect(state.perfection).toBe(200);
  expect(wasted).toBe(0);
});

test('recovery selection accounts for a harmful failure branch instead of mean stability', () => {
  const risky = {
    ...restore,
    key: 'a_risky',
    successChance: 0.5,
    stabilityCost: 10,
    stabilityGain: 40,
  };
  const safe = { ...restore, key: 'z_safe', stabilityGain: 20 };
  const config = retargetConfig(progress, {
    skills: [risky, safe, progress],
    maxCompletion: 100,
    maxPerfection: 100,
  });
  const result = constrainedSearch(
    new CraftingState({ qi: 100, stability: 10 }),
    config,
    100,
    100,
    5,
    'neutral',
    [],
    settings,
  );
  expect(result.recommendation?.skill.key).toBe('z_safe');
});

test('budget exhaustion is unknown, not reported as proof of success', () => {
  const config = retargetConfig(progress, {
    skills: [progress, restore],
    maxCompletion: 1000,
    maxPerfection: 1000,
  });
  const result = constrainedSearch(
    new CraftingState({ qi: 100, stability: 60 }),
    config,
    100,
    100,
    40,
    'neutral',
    [],
    { maxNodes: 4, timeBudgetMs: 60000 },
  );
  expect(result.recommendation?.planning?.goalProbabilityLowerBound ?? 0).toBe(
    0,
  );
  expect(result.searchMetrics!.depthReached).toBeLessThan(40);
});

test('selected lower limits use real safe actions to resolve the item', () => {
  const config = retargetConfig(progress, {
    skills: [progress],
    maxCompletion: 200,
    maxPerfection: 200,
  });
  const result = constrainedSearch(
    new CraftingState({
      qi: 100,
      stability: 20,
      completion: 100,
      perfection: 100,
    }),
    config,
    100,
    100,
    4,
    'neutral',
    [],
    settings,
  );
  expect(result.targetsMet).toBe(false);
  expect(result.recommendation?.skill.key).toBe('progress');
  expect(result.recommendation?.planning?.goalProbabilityLowerBound).toBe(1);
});

test('discordance follows installed early branch and retains all probability', () => {
  const result = generatedConditions('positive', ['veryPositive'], 0, 0.5);
  expect(result.reduce((p, o) => p + o.probability, 0)).toBeCloseTo(1);
  expect(
    result.find((o) => o.condition === 'veryNegative')?.probability,
  ).toBeCloseTo(0.09);
  expect(result.find((o) => o.condition === 'neutral')?.probability).toBe(0.5);
});

test('uncertain success produces a contingent recovery policy that reaches the cap on every branch', () => {
  const gamble = {
    ...progress,
    key: 'gamble',
    baseCompletionGain: 100,
    basePerfectionGain: 100,
    successChance: 0.5,
    stabilityCost: 10,
  };
  const sure = {
    ...progress,
    key: 'sure',
    baseCompletionGain: 50,
    basePerfectionGain: 50,
  };
  const config = retargetConfig(progress, {
    skills: [gamble, sure, restore],
    maxCompletion: 100,
    maxPerfection: 100,
  });
  const visit = (state: CraftingState, remaining: number): void => {
    if (state.completion >= 100 && state.perfection >= 100) return;
    expect(remaining).toBeGreaterThan(0);
    const result = constrainedSearch(
      state,
      config,
      100,
      100,
      6,
      'neutral',
      [],
      settings,
    );
    expect(result.recommendation).not.toBeNull();
    const distribution = applySkillOutcomes(
      state,
      result.recommendation!.skill,
      config,
      [],
      100,
      'neutral',
      100,
    );
    expect(distribution.unresolvedProbability).toBe(0);
    for (const branch of distribution.outcomes) {
      expect(
        branch.state.stability > 0 ||
          (branch.state.completion >= 100 && branch.state.perfection >= 100),
      ).toBe(true);
      visit(branch.state, remaining - 1);
    }
  };
  visit(new CraftingState({ qi: 100, stability: 10 }), 8);
});
