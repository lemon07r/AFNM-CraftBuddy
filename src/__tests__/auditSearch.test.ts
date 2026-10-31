import { CraftingState, BuffType } from '../optimizer/state';
import {
  SkillDefinition,
  OptimizerConfig,
  applySkill,
  calculateActionSurvivabilityFloor,
} from '../optimizer/skills';
import { lookaheadSearch as legacyLookaheadSearch } from '../optimizer/search';
import { constrainedSearch as lookaheadSearch } from '../optimizer/constrainedPlanner';
import { mergePartitionedResults } from '../optimizer/searchBackend';

function skill(overrides: Partial<SkillDefinition>): SkillDefinition {
  return {
    name: 'test',
    key: 'test',
    qiCost: 0,
    stabilityCost: 0,
    baseCompletionGain: 0,
    basePerfectionGain: 0,
    stabilityGain: 0,
    maxStabilityChange: 0,
    buffType: BuffType.NONE,
    buffDuration: 0,
    buffMultiplier: 1,
    type: 'support',
    ...overrides,
  };
}
function config(
  skills: SkillDefinition[],
  overrides: Partial<OptimizerConfig> = {},
): OptimizerConfig {
  return {
    maxQi: 1000,
    maxStability: 60,
    baseIntensity: 10,
    baseControl: 10,
    minStability: 0,
    skills,
    defaultBuffMultiplier: 1.4,
    ...overrides,
  };
}
const searchConfig = {
  timeBudgetMs: 600000,
  maxNodes: 10000,
  beamWidth: 5,
  useMonteCarloTreeSearch: false,
  conditionBranchCount: 1,
};

test('production planning rejects a lethal fifty-percent gamble when a sure goal resolution exists', () => {
  const gamble = skill({
    key: 'a_gamble',
    name: 'Gamble',
    type: 'fusion',
    stabilityCost: 10,
    baseCompletionGain: 200,
    successChance: 0.5,
  });
  const sure = skill({
    key: 'z_sure',
    name: 'Sure',
    type: 'fusion',
    stabilityCost: 10,
    baseCompletionGain: 100,
    successChance: 1,
  });
  const restore = skill({
    key: 'restore',
    name: 'Restore',
    type: 'stabilize',
    stabilityGain: 30,
    qiCost: 10,
    preventsMaxStabilityDecay: true,
  });
  const cfg = config([gamble, sure, restore], {
    maxCompletion: 200,
    maxPerfection: 0,
  });
  const state = new CraftingState({
    qi: 1000,
    stability: 10,
    initialMaxStability: 60,
  });
  const next = applySkill(state, gamble, cfg, [], 100, 'neutral')!;
  const floor = calculateActionSurvivabilityFloor(
    state,
    gamble,
    cfg,
    [],
    'neutral',
  );
  const goals = { ...searchConfig, completionBandCeiling: 1 };
  const shallow = lookaheadSearch(state, cfg, 100, 0, 1, 'neutral', [], goals);
  const deep = lookaheadSearch(
    state,
    cfg,
    100,
    0,
    4,
    'neutral',
    ['neutral', 'neutral', 'neutral'],
    goals,
  );
  expect(next.completion).toBe(100);
  expect(floor?.stability).toBe(0);
  expect([
    shallow.recommendation?.skill.key,
    deep.recommendation?.skill.key,
  ]).toEqual(['z_sure', 'z_sure']);
});

test('production planning avoids restoration when two guaranteed actions finish with stability left', () => {
  const fusion = skill({
    key: 'fusion',
    name: 'Fusion',
    type: 'fusion',
    stabilityCost: 10,
    baseCompletionGain: 10,
  });
  const refine = skill({
    key: 'refine',
    name: 'Refine',
    type: 'refine',
    stabilityCost: 10,
    basePerfectionGain: 10,
  });
  const restore = skill({
    key: 'restore',
    name: 'Restore',
    type: 'stabilize',
    stabilityGain: 40,
    qiCost: 88,
    preventsMaxStabilityDecay: true,
  });
  const cfg = config([fusion, refine, restore], {
    maxCompletion: 100,
    maxPerfection: 100,
  });
  const state = new CraftingState({
    qi: 1000,
    stability: 21,
    completion: 90,
    perfection: 90,
    initialMaxStability: 60,
  });
  const afterFusion = applySkill(state, fusion, cfg, [], 100, 'neutral')!;
  const afterRefine = applySkill(afterFusion, refine, cfg, [], 100, 'neutral')!;
  expect([
    afterRefine.completion,
    afterRefine.perfection,
    afterRefine.stability,
  ]).toEqual([100, 100, 1]);
  const shallow = lookaheadSearch(
    state,
    cfg,
    100,
    100,
    1,
    'neutral',
    ['neutral', 'neutral', 'neutral'],
    searchConfig,
  );
  const deep = lookaheadSearch(
    state,
    cfg,
    100,
    100,
    3,
    'neutral',
    ['neutral', 'neutral', 'neutral'],
    searchConfig,
  );
  expect(deep.recommendation?.skill.key).not.toBe('restore');
  expect(shallow.recommendation?.skill.key).not.toBe('restore');
});

test('AUDIT worker merge must preserve safe ranking', () => {
  const unsafe = skill({
    key: 'unsafe',
    name: 'Unsafe',
    type: 'fusion',
    qiCost: 1000,
    stabilityCost: 10,
    baseCompletionGain: 100,
    basePerfectionGain: 99,
  });
  const restore = skill({
    key: 'restore',
    name: 'Restore',
    type: 'stabilize',
    qiCost: 1000,
    stabilityGain: 40,
    preventsMaxStabilityDecay: true,
  });
  const safe = skill({
    key: 'safe',
    name: 'Safe Progress',
    type: 'fusion',
    stabilityCost: 10,
    baseCompletionGain: 20,
    basePerfectionGain: 20,
  });
  const cfg = config([unsafe, restore, safe], {
    maxCompletion: 100,
    maxPerfection: 100,
  });
  const state = new CraftingState({
    qi: 1000,
    stability: 10,
    initialMaxStability: 60,
  });
  const single = lookaheadSearch(
    state,
    cfg,
    100,
    100,
    1,
    'neutral',
    [],
    searchConfig,
  );
  const partials = cfg.skills.map((s) =>
    lookaheadSearch(state, cfg, 100, 100, 1, 'neutral', [], {
      ...searchConfig,
      rootSkillKeys: [s.key],
    }),
  );
  const merged = mergePartitionedResults(partials);
  expect(single.recommendation?.skill.key).toBe('restore');
  expect(merged.recommendation?.skill.key).toBe(
    single.recommendation?.skill.key,
  );
});

test('AUDIT max ambition must not repeatedly restore a full stability bar', () => {
  const progress = skill({
    key: 'progress',
    name: 'Progress',
    type: 'refine',
    stabilityCost: 10,
    baseCompletionGain: 20,
    basePerfectionGain: 20,
  });
  const restore = skill({
    key: 'restore',
    name: 'Restore',
    type: 'stabilize',
    qiCost: 88,
    stabilityGain: 40,
    preventsMaxStabilityDecay: true,
  });
  const cfg = config([progress, restore], {
    maxCompletion: 1000,
    maxPerfection: 1000,
  });
  const state = new CraftingState({
    qi: 1000,
    stability: 60,
    completion: 100,
    perfection: 100,
    initialMaxStability: 60,
  });
  const r = lookaheadSearch(
    state,
    cfg,
    100,
    100,
    6,
    'neutral',
    ['neutral', 'neutral', 'neutral'],
    { ...searchConfig, perfectionBandGoal: 8, completionBandCeiling: 8 },
  );
  expect(applySkill(state, restore, cfg, [], 100, 'neutral')?.stability).toBe(
    state.stability,
  );
  expect(r.recommendation?.skill.key).toBe('progress');
});

test('AUDIT terminal action value must not lose max-goal settings at deeper search', () => {
  const progress = skill({
    key: 'progress',
    name: 'Progress',
    type: 'refine',
    stabilityCost: 10,
    baseCompletionGain: 20,
    basePerfectionGain: 20,
  });
  const cfg = config([progress], { maxCompletion: 1000, maxPerfection: 1000 });
  const state = new CraftingState({
    qi: 1000,
    stability: 10,
    completion: 100,
    perfection: 100,
    initialMaxStability: 60,
  });
  const opts = {
    ...searchConfig,
    perfectionBandGoal: 8,
    completionBandCeiling: 8,
  };
  const shallow = legacyLookaheadSearch(
    state,
    cfg,
    100,
    100,
    1,
    'neutral',
    [],
    opts,
  );
  const deep = legacyLookaheadSearch(
    state,
    cfg,
    100,
    100,
    2,
    'neutral',
    [],
    opts,
  );
  expect(shallow.recommendation?.endsCraft).toBe(true);
  expect(deep.recommendation?.endsCraft).toBe(true);
  expect(deep.recommendation?.score).toBe(shallow.recommendation?.score);
});
