import {
  comparePlanningValues,
  type PlanningValue,
} from '../optimizer/constrainedPlanner';

const value = (overrides: Partial<PlanningValue>): PlanningValue => ({
  goalProbabilityLowerBound: 0,
  prematureEndProbability: 0,
  frontierProgress: 0,
  resourceReserve: 0,
  expectedSteps: 0,
  unresolvedProbability: 0,
  ...overrides,
});

test('fully resolved alternatives prefer the greater goal probability', () => {
  const better = value({
    goalProbabilityLowerBound: 0.95,
    prematureEndProbability: 0.05,
  });
  const worse = value({
    goalProbabilityLowerBound: 0.8,
    prematureEndProbability: 0.2,
  });
  expect(comparePlanningValues(better, worse)).toBeLessThan(0);
  expect(comparePlanningValues(worse, better)).toBeGreaterThan(0);
});

test('an incomplete frontier remains conservatively ordered by known ending risk', () => {
  const incomplete = value({ unresolvedProbability: 1, frontierProgress: 0.1 });
  const gamble = value({
    goalProbabilityLowerBound: 0.95,
    prematureEndProbability: 0.05,
  });
  expect(comparePlanningValues(incomplete, gamble)).toBeLessThan(0);
  // This preference is not a claim that the unfinished policy succeeds.
  expect(incomplete.goalProbabilityLowerBound).toBe(0);
});

test('a certain completed goal outranks an unresolved continuation without known ending risk', () => {
  const completed = value({ goalProbabilityLowerBound: 1, expectedSteps: 3 });
  const incomplete = value({ unresolvedProbability: 1, resourceReserve: 2 });
  expect(comparePlanningValues(completed, incomplete)).toBeLessThan(0);
});

test('worker ordering is transitive even across mixed frontier metadata', () => {
  const candidates = [
    value({ goalProbabilityLowerBound: 0.9, prematureEndProbability: 0.1 }),
    value({ goalProbabilityLowerBound: 0.8, prematureEndProbability: 0 }),
    value({ unresolvedProbability: 1 }),
  ];
  for (const a of candidates)
    for (const b of candidates)
      for (const c of candidates) {
        if (
          comparePlanningValues(a, b) <= 0 &&
          comparePlanningValues(b, c) <= 0
        )
          expect(comparePlanningValues(a, c)).toBeLessThanOrEqual(0);
      }
});
