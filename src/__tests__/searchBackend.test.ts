import {
  BuffType,
  CraftingState,
  mergePartitionedResults,
  partitionRootSkillKeys,
  reviveSearchInput,
  runSearchBackendInput,
  serializeSearchInput,
  type SearchBackendInput,
} from '../optimizer';
import type { SearchResult, SkillRecommendation } from '../optimizer/search';
import type { SkillDefinition } from '../optimizer/skills';
import {
  getSearchBackendStatus,
  probeSearchWorkerCapability,
  requestWorkerSearch,
  __resetSearchBackendForTests,
} from '../modContent/searchBackendClient';
import {
  freezeSearchClock,
  getReplaySearchInput,
  loadOptimizerReplaySnapshot,
} from './__fixtures__/replaySnapshots';

freezeSearchClock();

const REPLAY_FIXTURES = [
  'forge-heat-runway-step-2.snapshot.json',
  'forge-heat-runway-step-3.snapshot.json',
  'low-stability-regression.snapshot.json',
  'low-stability-step-before.snapshot.json',
  'premature-finish-proc-floor.snapshot.json',
  'skyfall-bow-heat-regression.snapshot.json',
  'user-report-alchemical-sequence.snapshot.json',
  'user-report-fairy-recovery.snapshot.json',
  'user-report-live-workshop-step-1.snapshot.json',
  'user-report-live-workshop-step-2.snapshot.json',
  'user-report-pattern-step-1.snapshot.json',
  'user-report-pattern-step-2.snapshot.json',
  'user-report-premature-finish-runway.snapshot.json',
  'user-report-resonance-regression.snapshot.json',
];

function toBackendInput(
  fixture: string,
  searchConfigOverride: Record<string, unknown>,
): SearchBackendInput {
  const snapshot = loadOptimizerReplaySnapshot(fixture);
  const input = getReplaySearchInput(snapshot);
  return {
    state: input.state,
    config: input.config,
    targetCompletion: input.targetCompletion,
    targetPerfection: input.targetPerfection,
    lookaheadDepth: input.lookaheadDepth,
    currentCondition:
      input.currentCondition as SearchBackendInput['currentCondition'],
    forecast: input.forecastConditions as SearchBackendInput['forecast'],
    searchConfig: {
      ...(input.searchConfig as Record<string, unknown>),
      ...searchConfigOverride,
    },
  };
}

describe('searchBackend wire format', () => {
  it('retains transient pre-cleanup harmony through JSON serialization', () => {
    const input = toBackendInput('forge-heat-runway-step-3.snapshot.json', {});
    input.state = input.state.copy({ conditionGenerationHarmony: 105 });
    const revived = reviveSearchInput(
      JSON.parse(JSON.stringify(serializeSearchInput(input))),
    );
    expect(revived.state.conditionGenerationHarmony).toBe(105);
  });
  it.each([15.5, 100])(
    'preserves every state field, including %s%% reduction, through a worker hop',
    (qiCostReduction) => {
      const input = toBackendInput(
        'forge-heat-runway-step-3.snapshot.json',
        {},
      );
      input.state = new CraftingState({
        ...input.state,
        qiDroplets: 3,
        maxQiDroplets: 7,
        itemEffectiveness: 25,
        qiCostReduction,
        qiCostPenalty: 25,
        stabilityCostReduction: 32.5,
        stabilityCostPenalty: 40,
        harmonyData: {
          recommendedTechniqueTypes: [],
          returningCycle: {
            charges: 3,
            storedQi: 4.5,
            chargeSize: 19.4,
            pulseKey: 7,
            lastOutcome: 'charge',
          },
        },
        nativeVariables: { custom_live_stat: 42, charismaMultiplier: 1.25 },
        history: ['previous action'],
      });
      const plain = serializeSearchInput(input);
      const revived = reviveSearchInput(JSON.parse(JSON.stringify(plain)));
      // Check the whole field roster, not a list that can become stale with the
      // serializer. Only the memoized, derived cache key is intentionally omitted.
      const original = input.state as unknown as Record<string, unknown>;
      const restored = revived.state as unknown as Record<string, unknown>;
      const keys = Object.keys(original).filter((key) => key !== '_cacheKey');
      expect(Object.keys(plain.state).sort()).toEqual([...keys].sort());
      for (const key of keys) expect(restored[key]).toEqual(original[key]);
    },
  );

  // Node-bounded so both runs explore the identical frontier: the contract is
  // that the wire round-trip changes nothing, not machine speed or depth.
  const PARITY_BUDGET = { timeBudgetMs: 120000, maxNodes: 500 };

  it.each(REPLAY_FIXTURES)(
    'round-trips %s to a byte-identical recommendation',
    (fixture) => {
      const input = toBackendInput(fixture, PARITY_BUDGET);
      const direct = runSearchBackendInput(input);

      // Simulate the worker hop: serialize, then cross a structured-clone
      // boundary (JSON is the strictest plain-data approximation), then revive.
      const plain = serializeSearchInput(input);
      expect(plain.searchConfig.transpositionCache).toBeUndefined();
      expect(plain.searchConfig.shouldAbort).toBeUndefined();
      const revived = reviveSearchInput(JSON.parse(JSON.stringify(plain)));
      const overTheWire = runSearchBackendInput(revived);

      expect(overTheWire.recommendation?.skill.key).toBe(
        direct.recommendation?.skill.key,
      );
      expect(overTheWire.recommendation?.score).toBe(
        direct.recommendation?.score,
      );
      expect(overTheWire.alternativeSkills.map((alt) => alt.skill.key)).toEqual(
        direct.alternativeSkills.map((alt) => alt.skill.key),
      );
      expect(overTheWire.alternativeSkills.map((alt) => alt.score)).toEqual(
        direct.alternativeSkills.map((alt) => alt.score),
      );
      expect(overTheWire.isTerminal).toBe(direct.isTerminal);
      expect(overTheWire.targetsMet).toBe(direct.targetsMet);
    },
  );

  it('drops the in-process transposition cache and abort hook from the wire', () => {
    const input = toBackendInput('user-report-pattern-step-1.snapshot.json', {
      transpositionCache: new Map(),
      shouldAbort: () => false,
    } as unknown as Record<string, unknown>);
    const plain = serializeSearchInput(input);
    expect('transpositionCache' in plain.searchConfig).toBe(false);
    expect('shouldAbort' in plain.searchConfig).toBe(false);
  });
});

describe('partitionRootSkillKeys', () => {
  const keys = ['a', 'b', 'c', 'd', 'e', 'wait'];

  it('returns a copy of all keys for a single partition', () => {
    const partition = partitionRootSkillKeys(keys, 0, 1);
    expect(partition).toEqual(keys);
    expect(partition).not.toBe(keys);
  });

  it('strides keys deterministically and covers the space disjointly', () => {
    const partitions = [0, 1, 2, 3].map((index) =>
      partitionRootSkillKeys(keys, index, 4),
    );
    expect(partitions[0]).toEqual(['a', 'e']);
    expect(partitions[1]).toEqual(['b', 'wait']);
    expect(partitions[2]).toEqual(['c']);
    expect(partitions[3]).toEqual(['d']);
    const flat = partitions.reduce<string[]>(
      (acc, partition) => acc.concat(partition),
      [],
    );
    expect(new Set(flat).size).toBe(keys.length);
    expect([...flat].sort()).toEqual([...keys].sort());
  });
});

describe('mergePartitionedResults', () => {
  function makeSkill(key: string): SkillDefinition {
    return {
      name: key,
      key,
      qiCost: 1,
      stabilityCost: 1,
      baseCompletionGain: 1,
      basePerfectionGain: 1,
      stabilityGain: 0,
      maxStabilityChange: -1,
      buffType: BuffType.NONE,
      buffDuration: 0,
      buffMultiplier: 1,
      type: 'stabilize',
    };
  }

  function makeCandidate(key: string, score: number): SkillRecommendation {
    const emptyGains = { completion: 0, perfection: 0, stability: 0 };
    return {
      skill: makeSkill(key),
      expectedGains: emptyGains,
      immediateGains: emptyGains,
      effectiveCosts: {},
      score,
      reasoning: '',
    } as SkillRecommendation;
  }

  function makePartial(
    candidates: Array<[string, number]>,
    metrics: { nodes: number; hits: number; depth: number },
  ): SearchResult {
    const ordered = candidates
      .map(([key, score]) => makeCandidate(key, score))
      .sort((a, b) => b.score - a.score);
    return {
      status: ordered.length ? 'live' : 'blocked',
      recommendation: ordered[0] ?? null,
      alternativeSkills: ordered.slice(1),
      isTerminal: ordered.length === 0,
      targetsMet: true,
      searchMetrics: {
        nodesExplored: metrics.nodes,
        cacheHits: metrics.hits,
        timeTakenMs: 1,
        depthReached: metrics.depth,
        pruned: 0,
      },
    };
  }

  it('passes a single partial through unchanged', () => {
    const partial = makePartial([['a', 10]], { nodes: 5, hits: 1, depth: 3 });
    expect(mergePartitionedResults([partial])).toBe(partial);
  });

  it('pools, dedupes by key, and ranks the union by score', () => {
    const left = makePartial(
      [
        ['a', 100],
        ['c', 40],
      ],
      { nodes: 10, hits: 2, depth: 4 },
    );
    const right = makePartial(
      [
        ['b', 60],
        ['c', 55],
      ],
      { nodes: 20, hits: 3, depth: 6 },
    );

    const merged = mergePartitionedResults([left, right]);

    expect(merged.recommendation?.skill.key).toBe('a');
    expect(merged.alternativeSkills.map((alt) => alt.skill.key)).toEqual([
      'b',
      'c',
    ]);
    // Dedupe keeps the higher-scoring duplicate.
    expect(
      merged.alternativeSkills.find((alt) => alt.skill.key === 'c')?.score,
    ).toBe(55);
    // Quality ratings recompute over the merged range (best 100, worst 0).
    expect(merged.recommendation?.qualityRating).toBe(100);
    expect(merged.alternativeSkills[1].qualityRating).toBe(0);
    // Metrics aggregate: sums for work counters, max for frontier markers.
    expect(merged.searchMetrics?.nodesExplored).toBe(30);
    expect(merged.searchMetrics?.cacheHits).toBe(5);
    expect(merged.searchMetrics?.depthReached).toBe(6);
  });

  it('breaks score ties by skill key for deterministic ordering', () => {
    const left = makePartial([['b', 50]], { nodes: 1, hits: 0, depth: 1 });
    const right = makePartial([['a', 50]], { nodes: 1, hits: 0, depth: 1 });
    const merged = mergePartitionedResults([left, right]);
    expect(merged.recommendation?.skill.key).toBe('a');
    expect(merged.alternativeSkills[0]?.skill.key).toBe('b');
  });

  it('ranks guaranteed survival ahead of a higher-scoring probabilistic line', () => {
    const risky = makePartial([['gamble', 100]], {
      nodes: 1,
      hits: 0,
      depth: 2,
    });
    risky.recommendation!.yieldsToSafeAlternative = true;
    const safe = makePartial([['sure', 50]], { nodes: 1, hits: 0, depth: 2 });
    const merged = mergePartitionedResults([risky, safe]);
    expect(merged.recommendation?.skill.key).toBe('sure');
    expect(merged.alternativeSkills[0]?.skill.key).toBe('gamble');
    expect(merged.recommendation?.qualityRating).toBeGreaterThanOrEqual(0);
    expect(merged.alternativeSkills[0]?.qualityRating).toBeLessThanOrEqual(100);
  });

  it('merges autoResolved before candidates without exposing an executable action', () => {
    const risky = makePartial([['live', 100]], { nodes: 1, hits: 0, depth: 2 });
    risky.recommendation!.yieldsToSafeAlternative = true;
    const resolved = makePartial([], {
      nodes: 1,
      hits: 0,
      depth: 2,
    });
    resolved.status = 'autoResolved';
    for (const partials of [
      [risky, resolved],
      [resolved, risky],
    ]) {
      const merged = mergePartitionedResults(partials);
      expect(merged.status).toBe('autoResolved');
      expect(merged.recommendation).toBeNull();
      expect(merged.alternativeSkills).toEqual([]);
    }
  });

  it('orders real safe and risky candidates the same in every partition order', () => {
    const build = (): SearchResult[] => {
      const safe = makePartial([['safe', 50]], { nodes: 1, hits: 0, depth: 2 });
      const risky = makePartial([['risky', 100]], {
        nodes: 1,
        hits: 0,
        depth: 2,
      });
      risky.recommendation!.yieldsToSafeAlternative = true;
      const wait = makePartial([['wait', 75]], {
        nodes: 1,
        hits: 0,
        depth: 2,
      });
      return [safe, risky, wait];
    };
    const permutations = [
      [0, 1, 2],
      [0, 2, 1],
      [1, 0, 2],
      [1, 2, 0],
      [2, 0, 1],
      [2, 1, 0],
    ];
    const orders = permutations.map((order) => {
      const partials = build();
      const merged = mergePartitionedResults(order.map((i) => partials[i]));
      return [merged.recommendation, ...merged.alternativeSkills].map(
        (candidate) => candidate?.skill.key,
      );
    });
    for (const order of orders) {
      expect(order).toEqual(['wait', 'safe', 'risky']);
    }
  });

  it('keeps score order when the only safe line ends the craft below target', () => {
    const risky = makePartial([['gamble', 100]], {
      nodes: 1,
      hits: 0,
      depth: 2,
    });
    risky.recommendation!.yieldsToSafeAlternative = true;
    const doomed = makePartial([['doomed', 10]], {
      nodes: 1,
      hits: 0,
      depth: 2,
    });
    doomed.recommendation!.endsCraftBelowTarget = true;
    const merged = mergePartitionedResults([doomed, risky]);
    expect(merged.recommendation?.skill.key).toBe('gamble');
    expect(merged.alternativeSkills[0]?.skill.key).toBe('doomed');
  });

  it('drops rotation details when merging promotes a partition alternative', () => {
    const left = makePartial(
      [
        ['risky', 100],
        ['doomed', 75],
      ],
      { nodes: 1, hits: 0, depth: 2 },
    );
    left.recommendation!.yieldsToSafeAlternative = true;
    left.alternativeSkills[0].endsCraftBelowTarget = true;
    left.optimalRotation = ['risky'];
    const right = makePartial([['safe', 50]], { nodes: 1, hits: 0, depth: 2 });
    right.recommendation!.endsCraftBelowTarget = true;
    right.optimalRotation = ['safe'];
    const merged = mergePartitionedResults([left, right]);
    // With no viable safe line, score order wins across partitions.
    expect(merged.recommendation?.skill.key).toBe('risky');
    expect(merged.optimalRotation).toEqual(['risky']);

    right.recommendation!.endsCraftBelowTarget = false;
    const viable = mergePartitionedResults([left, right]);
    // A viable safe line leads; the certain failure ranks with the gamble.
    expect(
      [viable.recommendation, ...viable.alternativeSkills].map(
        (candidate) => candidate?.skill.key,
      ),
    ).toEqual(['safe', 'risky', 'doomed']);
    expect(viable.optimalRotation).toEqual(['safe']);

    const withSafeAlternative = makePartial(
      [
        ['risky', 100],
        ['steady', 60],
      ],
      { nodes: 1, hits: 0, depth: 2 },
    );
    withSafeAlternative.recommendation!.yieldsToSafeAlternative = true;
    withSafeAlternative.optimalRotation = ['risky'];
    const promoted = mergePartitionedResults([withSafeAlternative, right]);
    expect(promoted.recommendation?.skill.key).toBe('steady');
    expect(promoted.optimalRotation).toBeUndefined();
  });

  it('stays terminal only when every partition is terminal', () => {
    const empty = makePartial([], { nodes: 0, hits: 0, depth: 0 });
    const live = makePartial([['a', 1]], { nodes: 1, hits: 0, depth: 1 });
    expect(mergePartitionedResults([empty, empty]).isTerminal).toBe(true);
    expect(mergePartitionedResults([empty, live]).isTerminal).toBe(false);
  });
});

describe('search backend client fallback', () => {
  beforeEach(() => {
    __resetSearchBackendForTests();
  });

  it('reports the sync fallback when blob workers are unavailable', async () => {
    // Jest runs in Node without Worker/Blob URLs, and the bundle stub is an
    // empty string, so the probe must fail and the caller must fall back.
    const input = toBackendInput('user-report-pattern-step-1.snapshot.json', {
      timeBudgetMs: 120000,
      maxNodes: 500,
    });

    const outcome = await requestWorkerSearch({
      epoch: 1,
      scope: 'test-scope',
      threads: 1,
      baseSeed: 0,
      rootSkillKeys: [...input.config.skills.map((skill) => skill.key)],
      input: serializeSearchInput(input),
    });

    expect(outcome.kind).toBe('unavailable');
    const status = getSearchBackendStatus();
    expect(status.probe).toBe('failed');
    expect(status.syncFallbackCount).toBe(1);
    expect(status.workerResultCount).toBe(0);

    // The probe is once per session: a second dispatch does not re-probe.
    const second = await requestWorkerSearch({
      epoch: 2,
      scope: 'test-scope',
      threads: 1,
      baseSeed: 0,
      rootSkillKeys: [],
      input: serializeSearchInput(input),
    });
    expect(second.kind).toBe('unavailable');
    expect(getSearchBackendStatus().syncFallbackCount).toBe(2);
  });

  it('probes false exactly once per session', async () => {
    await expect(probeSearchWorkerCapability()).resolves.toBe(false);
    await expect(probeSearchWorkerCapability()).resolves.toBe(false);
    expect(getSearchBackendStatus().probe).toBe('failed');
  });
});
