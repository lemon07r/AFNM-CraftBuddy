import { CraftingState } from '../optimizer/state';
import { findBestSkill } from '../optimizer/search';
import {
  mergePartitionedResults,
  reviveSearchInput,
  serializeSearchInput,
  runSearchBackendInput,
} from '../optimizer/searchBackend';
import { retargetSkill, retargetConfig } from './fixtures/runtime0717';

const finish = retargetSkill({
  key: 'finish',
  name: 'Finish',
  stabilityCost: 10,
  qiCost: 5,
  effects: [
    { kind: 'completion', amount: { value: 50 } },
    { kind: 'perfection', amount: { value: 50 } },
  ],
});
const config = retargetConfig(finish, {
  maxCompletion: 100,
  maxPerfection: 100,
});
const state = new CraftingState({ qi: 100, stability: 20 });
const search = (cfg = config, depth = 3) =>
  findBestSkill(state, cfg, 100, 100, false, depth, 'neutral', [], {
    maxNodes: 1000,
    timeBudgetMs: 60000,
  });

test('production deterministic finishing route retains final-state preview', () => {
  const result = search();
  expect(result.expectedFinalState).toMatchObject({
    completion: 100,
    perfection: 100,
    stability: 0,
    qi: 90,
    turnsRemaining: 0,
    projectedSuccessChance: 1,
  });
  expect(result.recommendation?.planning?.goalProbabilityLowerBound).toBe(1);
});
test('one-step deterministic resolution is previewed even below the requested goal', () => {
  const result = search(
    { ...config, skills: [{ ...finish, stabilityCost: 20 }] },
    1,
  );
  expect(result.expectedFinalState).toMatchObject({
    completion: 50,
    perfection: 50,
    stability: 0,
    turnsRemaining: 0,
    projectedSuccessChance: 0,
  });
});
test('an unresolved horizon does not masquerade as a final state', () => {
  expect(search(config, 1).expectedFinalState).toBeUndefined();
});
test('a probabilistic route is not reduced to its most-likely final branch', () => {
  expect(
    search({ ...config, skills: [{ ...finish, successChance: 0.5 }] })
      .expectedFinalState,
  ).toBeUndefined();
});
test('preview survives worker transport and belongs to the winning partition', () => {
  const input = {
    state,
    config,
    targetCompletion: 100,
    targetPerfection: 100,
    lookaheadDepth: 3,
    currentCondition: 'neutral' as const,
    forecast: [],
    searchConfig: { maxNodes: 1000, timeBudgetMs: 60000 },
  };
  const result = runSearchBackendInput(
    reviveSearchInput(serializeSearchInput(input)),
  );
  const worse = search({
    ...config,
    skills: [{ ...finish, key: 'worse', stabilityCost: 20 }],
  });
  expect(mergePartitionedResults([worse, result]).expectedFinalState).toEqual(
    result.expectedFinalState,
  );
  expect(result.expectedFinalState?.completion).toBe(100);
});
