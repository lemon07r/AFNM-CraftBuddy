import { CraftingState } from '../optimizer/state';
import { findBestSkill, type SearchResult } from '../optimizer/search';
import { applySkillOutcomes } from '../optimizer/skills';
import { mergePartitionedResults } from '../optimizer/searchBackend';
import { projectNativeAutoUseBranches } from '../optimizer/nativeAutoUsePlan';
import { HARMONY_TYPES } from '../optimizer/harmonyRegistry';
import { prdCoefficient } from '../optimizer/stochastic';
import type { BuffDefinition } from '../optimizer/gameTypes';
import { retargetSkill, retargetConfig } from './fixtures/runtime0717';

const budget = { maxNodes: 10000, timeBudgetMs: 60000, beamWidth: 5 };

function setupPolicy(truncated: boolean, knownStreak = false) {
  const ready: BuffDefinition = {
    name: 'Ready',
    canStack: false,
    effects: truncated
      ? [
          { kind: 'completion', amount: { value: 100 } },
          ...Array.from({ length: 7 }, () => ({
            kind: 'completion' as const,
            amount: { value: 1 },
            condition: { kind: 'chance' as const, percentage: 50 },
          })),
        ]
      : [],
  };
  const setup = retargetSkill({
    key: 'setup',
    name: 'Setup',
    qiCost: 100,
    stabilityCost: 10,
    effects: [{ kind: 'createBuff', buff: ready, stacks: { value: 1 } }],
  });
  const followup = retargetSkill({
    key: 'followup',
    name: 'Followup',
    qiCost: 0,
    stabilityCost: 10,
    successChance: 0.5,
    buffRequirement: { buffName: 'ready', amount: 1 },
    effects: truncated
      ? [{ kind: 'consumeBuff', buff: ready, stacks: { value: 1 } }]
      : [{ kind: 'completion', amount: { value: 100 } }],
  });
  const config = retargetConfig(setup, {
    skills: [setup, followup],
    techniqueSuccessModel: 'prd',
    targetCompletion: 100,
    targetPerfection: 0,
    maxCompletion: 100,
    maxPerfection: 0,
  });
  const state = new CraftingState({
    qi: 100,
    stability: 20,
    initialMaxStability: 20,
    nativeVariables: knownStreak ? { prd_failures_followup: 0 } : undefined,
  });
  const result = findBestSkill(
    state,
    config,
    100,
    0,
    false,
    4,
    'neutral',
    [],
    budget,
  );
  return { state, config, setup, followup, result };
}

describe('review round 2 probability certificates', () => {
  test('omitted hidden-PRD outcomes cannot certify a route when enumerated children all succeed', () => {
    const { state, config, setup, followup, result } = setupPolicy(true);
    const afterSetup = applySkillOutcomes(
      state,
      setup,
      config,
      [],
      100,
      'neutral',
      0,
    ).outcomes[0].state;
    const bounded = applySkillOutcomes(
      afterSetup,
      followup,
      config,
      [],
      100,
      'neutral',
      0,
      64,
    );
    const complete = applySkillOutcomes(
      afterSetup,
      followup,
      config,
      [],
      100,
      'neutral',
      0,
      256,
    );
    expect(bounded.probabilityUncertain).toBe(true);
    expect(bounded.unresolvedProbability).toBeGreaterThan(0);
    expect(bounded.outcomes.every((o) => o.state.completion >= 100)).toBe(true);
    expect(complete.unresolvedProbability).toBe(0);
    expect(complete.outcomes.some((o) => o.state.completion === 0)).toBe(true);
    expect(result.recommendation?.skill.key).toBe('setup');
    expect(result.recommendation?.planning?.goalProbabilityLowerBound).toBe(0);
    expect(
      result.recommendation?.planning?.unresolvedProbability,
    ).toBeGreaterThan(0);
    expect(result.recommendation?.reasoning).not.toContain('Verified route');
    expect(result.recommendation?.projectedSuccessChance).toBeUndefined();
    // The follow-up still cannot cross the immediate-outcome execution gate.
    const followupResult = findBestSkill(
      afterSetup,
      config,
      100,
      0,
      false,
      4,
      'neutral',
      [],
      budget,
    );
    expect(followupResult.recommendation).toBeNull();
    expect(
      followupResult.blockedReasons?.some((r) => r.reason === 'unresolved'),
    ).toBe(true);
  });

  test('a deterministic setup never presents a descendant hidden-PRD bound as an exact 0% chance', () => {
    const { result } = setupPolicy(false);
    expect(result.recommendation?.skill.key).toBe('setup');
    expect(result.recommendation?.planning?.unresolvedProbability).toBe(0);
    expect(result.recommendation?.planning?.goalProbabilityLowerBound).toBe(0);
    expect(result.recommendation?.planning?.probabilityUncertain).toBe(true);
    expect(result.recommendation?.projectedSuccessChance).toBeUndefined();
    const transported: SearchResult = JSON.parse(JSON.stringify(result));
    const merged = mergePartitionedResults([transported, transported]);
    expect(merged.recommendation?.planning?.probabilityUncertain).toBe(true);
    expect(merged.recommendation?.projectedSuccessChance).toBeUndefined();
  });

  test('a fully enumerated known PRD streak still yields a genuine probability', () => {
    const { result } = setupPolicy(false, true);
    expect(result.recommendation?.projectedSuccessChance).toBeCloseTo(
      prdCoefficient(0.5),
    );
    expect(result.recommendation?.planning?.probabilityUncertain ?? false).toBe(
      false,
    );
  });
});

describe('review round 2 worker diagnostics', () => {
  test('deduplicates identical diagnostics while keeping distinct reasons/details', () => {
    const diagnostic = {
      skillName: 'Restore',
      reason: 'dominated' as const,
      details: 'No benefit',
    };
    const result: SearchResult = {
      recommendation: null,
      alternativeSkills: [],
      isTerminal: false,
      targetsMet: false,
      blockedReasons: [diagnostic],
    };
    const additional = { ...diagnostic, details: 'Other detail' };
    const merged = mergePartitionedResults([
      result,
      result,
      {
        ...result,
        blockedReasons: [
          diagnostic,
          additional,
          { ...diagnostic, reason: 'unresolved' },
        ],
      },
    ]);
    expect(merged.blockedReasons).toEqual([
      diagnostic,
      additional,
      { ...diagnostic, reason: 'unresolved' },
    ]);
  });
  test('reports inert root actions only in the owning partition', () => {
    const restore = retargetSkill({
      key: 'restore',
      name: 'Restore',
      qiCost: 1,
      stabilityCost: 0,
      stabilityGain: 40,
      preventsMaxStabilityDecay: true,
    });
    const blocked = retargetSkill({
      key: 'blocked',
      name: 'Blocked',
      qiCost: 1000,
    });
    const config = retargetConfig(restore, {
      skills: [restore, blocked],
      maxCompletion: 100,
      maxPerfection: 100,
    });
    const state = new CraftingState({
      qi: 100,
      stability: 60,
      initialMaxStability: 60,
    });
    const run = (key: string) =>
      findBestSkill(state, config, 100, 100, false, 1, 'neutral', [], {
        ...budget,
        rootSkillKeys: [key],
      });
    expect(
      run('blocked').blockedReasons?.some((r) => r.reason === 'dominated'),
    ).toBe(false);
    expect(
      run('restore').blockedReasons?.filter((r) => r.reason === 'dominated'),
    ).toHaveLength(1);
  });
});

describe('installed 0.7.18 native harmony rule indices', () => {
  test('valid native indices preserve equality and inequality across all playable harmonies', () => {
    const pill = retargetSkill({
      key: 'pill',
      name: 'Pill',
      itemName: 'pill',
      actionKind: 'item',
      consumesTurn: false,
      qiCost: 0,
      stabilityCost: 0,
    });
    for (const harmony of HARMONY_TYPES)
      for (const index of [0, 1, 2, 3, 4, 5, 6])
        for (const check of ['==', '!=']) {
          const matches =
            (harmony === HARMONY_TYPES[index]) === (check === '==');
          const config = retargetConfig(pill, {
            craftingType: harmony,
            pillsPerRound: 1,
            nativeAutoUsePlan: {
              slots: [
                {
                  item: 'Pill',
                  rule: { condition: 'Harmony Type', check, value: index },
                },
              ],
              items: { Pill: { action: pill, toxicityBeforeResistance: 0 } },
              initialUsage: {},
              baseResistance: 0,
            },
          });
          const result = projectNativeAutoUseBranches(
            new CraftingState({
              qi: 100,
              stability: 20,
              items: new Map([['pill', 1]]),
            }),
            config,
            'neutral',
          );
          expect(result.unresolvedProbability).toBe(0);
          expect(result.outcomes[0].state.items.get('pill') ?? 0).toBe(
            matches ? 0 : 1,
          );
        }
  });
  // Wmo is the selector's seven-entry whitelist, distinct from the nine-entry
  // gameplay registry. rho returns expression "0" for an absent index, even !=.
  test.each([7, 8, -1, 9])(
    'native rule index %i does not fire for either comparison',
    (index) => {
      expect(HARMONY_TYPES).toHaveLength(9);
      const pill = retargetSkill({
        key: 'pill',
        name: 'Pill',
        itemName: 'pill',
        actionKind: 'item',
        consumesTurn: false,
        qiCost: 0,
        stabilityCost: 0,
        stabilityGain: 10,
      });
      for (const check of ['==', '!=']) {
        const config = retargetConfig(pill, {
          craftingType: index === 7 ? 'captivatingCadence' : 'returningCycle',
          pillsPerRound: 1,
          nativeAutoUsePlan: {
            slots: [
              {
                item: 'Pill',
                rule: { condition: 'Harmony Type', check, value: index },
              },
            ],
            items: { Pill: { action: pill, toxicityBeforeResistance: 0 } },
            initialUsage: {},
            baseResistance: 0,
          },
        });
        const projected = projectNativeAutoUseBranches(
          new CraftingState({
            qi: 100,
            stability: 20,
            items: new Map([['pill', 1]]),
          }),
          config,
          'neutral',
        );
        expect(projected.unresolvedProbability).toBe(0);
        expect(projected.outcomes[0].state.items.get('pill')).toBe(1);
      }
    },
  );
});
