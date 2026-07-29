import {
  BuffType,
  FINISH_CRAFT_KEY,
  mergePartitionedResults,
  partitionRootSkillKeys,
  reviveSearchInput,
  runSearchBackendInput,
  serializeSearchInput,
  type SearchBackendInput,
} from '../optimizer';
import type {
  SearchResult,
  SkillRecommendation,
} from '../optimizer/search';
import type { SkillDefinition } from '../optimizer/skills';
import {
  getSearchBackendStatus,
  probeSearchWorkerCapability,
  requestWorkerSearch,
  __resetSearchBackendForTests,
} from '../modContent/searchBackendClient';
import {
  getReplaySearchInput,
  loadOptimizerReplaySnapshot,
} from './__fixtures__/replaySnapshots';

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
    currentCondition: input.currentCondition as SearchBackendInput['currentCondition'],
    forecast:
      input.forecastConditions as SearchBackendInput['forecast'],
    searchConfig: {
      ...(input.searchConfig as Record<string, unknown>),
      ...searchConfigOverride,
    },
  };
}

describe('searchBackend wire format', () => {
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
      const revived = reviveSearchInput(
        JSON.parse(JSON.stringify(plain)),
      );
      const overTheWire = runSearchBackendInput(revived);

      expect(overTheWire.recommendation?.skill.key).toBe(
        direct.recommendation?.skill.key,
      );
      expect(overTheWire.recommendation?.score).toBe(
        direct.recommendation?.score,
      );
      expect(
        overTheWire.alternativeSkills.map((alt) => alt.skill.key),
      ).toEqual(direct.alternativeSkills.map((alt) => alt.skill.key));
      expect(
        overTheWire.alternativeSkills.map((alt) => alt.score),
      ).toEqual(direct.alternativeSkills.map((alt) => alt.score));
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
  const keys = ['a', 'b', 'c', 'd', 'e', FINISH_CRAFT_KEY];

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
    expect(partitions[1]).toEqual(['b', FINISH_CRAFT_KEY]);
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

  function makeCandidate(
    key: string,
    score: number,
  ): SkillRecommendation {
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
      rootSkillKeys: [
        ...input.config.skills.map((skill) => skill.key),
        FINISH_CRAFT_KEY,
      ],
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
