import { CraftingState } from '../optimizer/state';
import { constrainedSearch } from '../optimizer/constrainedPlanner';
import {
  mergePartitionedResults,
  partitionRootSkillKeys,
} from '../optimizer/searchBackend';
import { retargetConfig, retargetSkill } from './fixtures/runtime0717';
import { celadonCycle, embers } from './fixtures/celadonCycle';
import { buildResultSnapshot } from '../modContent/replaySnapshot';
import type { SearchResult } from '../optimizer';

const finish = (key: string, successChance = 1) =>
  retargetSkill({
    key,
    name: key,
    qiCost: 0,
    stabilityCost: 10,
    successChance,
    effects: [{ kind: 'completion', amount: { value: 100 } }],
  });
const skills = [
  finish('first', 0.5),
  finish('second'),
  finish('third', 0.5),
  finish('last'),
];
const config = retargetConfig(skills[0], {
  skills,
  maxCompletion: 100,
  maxPerfection: 0,
  targetPerfection: 0,
});
const state = new CraftingState({ qi: 100, stability: 10 });
const run = (rootSkillKeys?: string[], maxNodes = 1, depth = 1) =>
  constrainedSearch(state, config, 100, 0, depth, 'neutral', [], {
    rootSkillKeys,
    maxNodes,
    timeBudgetMs: 60000,
  });

test('a late partition spends its budget only on its assigned root', () => {
  const result = run(['last']);
  expect(result.recommendation?.skill.key).toBe('last');
  expect(result.searchMetrics?.nodesExplored).toBe(1);
});
test('an empty root partition spends no expansion budget', () => {
  const result = run([]);
  expect(result.recommendation).toBeNull();
  expect(result.searchMetrics?.nodesExplored).toBe(0);
  expect(result.blockedReasons?.some((r) => r.reason === 'budget')).toBe(false);
});
test('fully covered bounded partitions merge to the same safe root as an unpartitioned search', () => {
  const parts = skills.map((_, i) =>
    run(
      partitionRootSkillKeys(
        skills.map((s) => s.key),
        i,
        4,
      ),
    ),
  );
  const merged = mergePartitionedResults(parts);
  const single = run(undefined, 4);
  expect(merged.recommendation?.skill.key).toBe(
    single.recommendation?.skill.key,
  );
  expect(merged.recommendation?.projectedSuccessChance).toBe(1);
});
test('genuine root exhaustion retains completed evaluation evidence and stays paused', () => {
  const result = run(undefined, 1);
  expect(result.recommendation).toBeNull();
  expect(result.alternativeSkills).toEqual([]);
  expect(result).toMatchObject({
    rootEvaluation: { complete: false, evaluatedSkillKeys: ['first'] },
  });
  expect(result.blockedReasons?.some((r) => r.reason === 'budget')).toBe(true);
  expect(
    JSON.parse(JSON.stringify(buildResultSnapshot(result))).rootEvaluation,
  ).toEqual({ complete: false, evaluatedSkillKeys: ['first'] });
});

test('explicit incomplete coverage pauses a merge even without a diagnostic string', () => {
  const incomplete = {
    ...run(['first']),
    blockedReasons: undefined,
    rootEvaluation: { complete: false, evaluatedSkillKeys: ['first'] },
  };
  const merged = mergePartitionedResults([run(['second']), incomplete]);
  expect(merged.recommendation).toBeNull();
  expect(merged.rootEvaluation).toEqual({
    complete: false,
    evaluatedSkillKeys: ['first', 'second'],
  });
  expect(merged.blockedReasons?.some((r) => r.reason === 'budget')).toBe(true);
});
test('an incomplete partition cannot disappear behind another partition’s candidate', () => {
  const complete = run(['second'], 4);
  const incomplete = run(['third', 'last'], 1);
  const merged = mergePartitionedResults([complete, incomplete]);
  expect(complete.recommendation).not.toBeNull();
  expect(merged.recommendation).toBeNull();
  expect(merged.expectedFinalState).toBeUndefined();
  expect(merged.alternativeSkills).toEqual([]);
  expect(merged.blockedReasons?.some((r) => r.reason === 'budget')).toBe(true);
});
test('root filtering does not remove other skills from future continuations', () => {
  const setup = retargetSkill({
    key: 'setup',
    type: 'support',
    qiCost: 0,
    stabilityCost: 1,
    cooldown: 10,
    preventsMaxStabilityDecay: true,
  });
  const final = { ...finish('final'), stabilityCost: 1 };
  const cfg = retargetConfig(setup, {
    skills: [setup, final],
    maxCompletion: 100,
    maxPerfection: 0,
    targetPerfection: 0,
  });
  const s = new CraftingState({
    qi: 100,
    stability: 2,
    cooldowns: new Map([['final', 1]]),
  });
  const result = constrainedSearch(s, cfg, 100, 0, 3, 'neutral', [], {
    rootSkillKeys: ['setup'],
    maxNodes: 50,
    timeBudgetMs: 60000,
  });
  expect(result.recommendation?.skill.key).toBe('setup');
  expect(result.recommendation?.planning?.goalProbabilityLowerBound).toBe(1);
  expect(result.optimalRotation).toContain('final');
});
test('cancellation retains the completed root without publishing a partial ranking', () => {
  let checks = 0;
  const result = constrainedSearch(state, config, 100, 0, 1, 'neutral', [], {
    maxNodes: 100,
    timeBudgetMs: 60000,
    shouldAbort: () => ++checks > 1,
  });
  expect(result.recommendation).toBeNull();
  expect(result).toMatchObject({
    rootEvaluation: { complete: false, evaluatedSkillKeys: ['first'] },
  });
});
test('Celadon’s fourth-ember safe finish remains available in a late single-node partition', () => {
  const action = retargetSkill({
    key: 'celadon',
    type: 'stabilize',
    qiCost: 10,
    stabilityCost: 12,
    effects: [
      { kind: 'completion', amount: { value: 230 } },
      { kind: 'perfection', amount: { value: 230 } },
    ],
  });
  const cfg = retargetConfig(action, {
    skills: [...skills, action],
    maxQi: 200,
    maxCompletion: 230,
    maxPerfection: 230,
    isSublimeCraft: true,
    craftingType: 'formless',
  });
  const buffs = new Map([
    [
      'celadon_cycle',
      { name: celadonCycle.name, stacks: 1, definition: celadonCycle },
    ],
    ...embers
      .slice(0, 3)
      .map(
        (b) =>
          [
            b.name.toLowerCase().replace(/ /g, '_'),
            { name: b.name, stacks: 1, definition: b },
          ] as const,
      ),
  ]);
  const s = new CraftingState({
    qi: 100,
    stability: 3,
    harmony: 33,
    harmonyData: { recommendedTechniqueTypes: [] },
    buffs,
  });
  const result = constrainedSearch(s, cfg, 100, 100, 1, 'neutral', [], {
    rootSkillKeys: ['celadon'],
    maxNodes: 1,
    timeBudgetMs: 60000,
    completionBandCeiling: 2,
    perfectionBandGoal: 2,
  });
  expect(result.recommendation?.skill.key).toBe('celadon');
  expect(result.expectedFinalState?.stability).toBe(1);
  expect(result.recommendation?.projectedSuccessChance).toBe(1);
});

test.each([false, true])(
  'merged diagnostics are independent of worker arrival order (incomplete: %s)',
  (incomplete) => {
    const qi = {
      skillName: 'Alpha',
      reason: 'qi' as const,
      details: 'Need Qi',
    };
    const otherQi = { ...qi, details: 'Need more Qi' };
    const stability = { ...qi, reason: 'stability' as const };
    const otherSkill = { ...qi, skillName: 'Beta' };
    const base = run([]);
    const partials: SearchResult[] = [
      {
        ...base,
        rootEvaluation: {
          complete: !incomplete,
          evaluatedSkillKeys: ['third', 'first'],
        },
        blockedReasons: [otherSkill, qi],
      },
      {
        ...base,
        rootEvaluation: {
          complete: true,
          evaluatedSkillKeys: ['second', 'first'],
        },
        blockedReasons: [stability, otherQi],
      },
      {
        ...base,
        rootEvaluation: { complete: true, evaluatedSkillKeys: ['last'] },
        blockedReasons: [qi, otherSkill],
      },
    ];
    const before = JSON.stringify(partials);
    const permutations = [
      [0, 1, 2],
      [0, 2, 1],
      [1, 0, 2],
      [1, 2, 0],
      [2, 0, 1],
      [2, 1, 0],
    ];
    const expected = mergePartitionedResults(partials);
    expect(expected.rootEvaluation).toEqual({
      complete: !incomplete,
      evaluatedSkillKeys: ['first', 'last', 'second', 'third'],
    });
    expect(expected.blockedReasons).toHaveLength(incomplete ? 5 : 4);
    expect(expected.blockedReasons).toEqual(
      expect.arrayContaining([qi, otherQi, stability, otherSkill]),
    );
    for (const order of permutations) {
      const result = mergePartitionedResults(order.map((i) => partials[i]));
      expect(buildResultSnapshot(result)).toEqual(
        buildResultSnapshot(expected),
      );
      expect(result.recommendation).toBeNull();
      expect(result.alternativeSkills).toEqual([]);
      expect(
        result.blockedReasons?.some((reason) => reason.reason === 'budget'),
      ).toBe(incomplete);
    }
    expect(JSON.stringify(partials)).toBe(before);
  },
);
