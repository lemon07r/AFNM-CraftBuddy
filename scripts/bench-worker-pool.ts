/**
 * Worker-pool sweep (steering addendum 2.4): quality-per-ms at 1/2/4 threads.
 *
 * Drives real Bun workers running `src/worker/searchWorker.ts` over replay
 * fixtures at the captured production budgets (fast preset: 2s wall budget).
 * With a wall-clock budget, pooling does not shorten a search — it multiplies
 * explored nodes and reachable depth in the same wall time — so the sweep
 * reports nodes/ms, depthReached, and top-line agreement with the in-process
 * sync backend.
 *
 * Usage: bun scripts/bench-worker-pool.ts
 * Output: tmp/engine-worker-bench.json + console table.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import {
  FINISH_CRAFT_KEY,
  mergePartitionedResults,
  reviveSearchInput,
  runSearchBackendInput,
  serializeSearchInput,
  type SearchBackendInput,
  type SearchWorkerRequest,
  type SearchWorkerResponse,
} from '../src/optimizer';
import type { SearchResult } from '../src/optimizer/search';
import {
  getReplaySearchInput,
  loadOptimizerReplaySnapshot,
} from '../src/__tests__/__fixtures__/replaySnapshots';

const FIXTURES = [
  'low-stability-regression.snapshot.json',
  'low-stability-step-before.snapshot.json',
  'skyfall-bow-heat-regression.snapshot.json',
  'user-report-alchemical-sequence.snapshot.json',
  'user-report-live-workshop-step-1.snapshot.json',
  'user-report-premature-finish-runway.snapshot.json',
];

const THREAD_COUNTS = [1, 2, 4];

function toBackendInput(fixture: string): SearchBackendInput {
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
    searchConfig: input.searchConfig as Record<string, unknown>,
  };
}

interface TimedResult {
  result: SearchResult;
  wallMs: number;
}

async function runWorkerPoolSearch(
  workers: Worker[],
  input: SearchBackendInput,
  scope: string,
): Promise<TimedResult> {
  const plain = serializeSearchInput(input);
  const rootSkillKeys = [
    ...input.config.skills.map((skill) => skill.key),
    FINISH_CRAFT_KEY,
  ];
  const epoch = Date.now();
  const started = performance.now();
  const partials = await Promise.all(
    workers.map(
      (worker, index) =>
        new Promise<SearchResult>((resolve, reject) => {
          worker.onmessage = (event: MessageEvent<SearchWorkerResponse>) => {
            const message = event.data;
            if (!message || message.kind === 'probe') return;
            if (message.kind === 'error') {
              reject(new Error(message.message));
              return;
            }
            resolve(message.result);
          };
          const request: SearchWorkerRequest = {
            kind: 'search',
            epoch,
            scope,
            partition: { index, of: workers.length },
            baseSeed: epoch,
            rootSkillKeys,
            input: plain,
          };
          worker.postMessage(request);
        }),
    ),
  );
  return {
    result: mergePartitionedResults(partials),
    wallMs: performance.now() - started,
  };
}

async function spawnPool(size: number): Promise<Worker[]> {
  const workers: Worker[] = [];
  for (let i = 0; i < size; i++) {
    const worker = new Worker(
      new URL('../src/worker/searchWorker.ts', import.meta.url).href,
    );
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('probe timeout')), 10000);
      worker.onmessage = (event: MessageEvent<SearchWorkerResponse>) => {
        if (event.data?.kind === 'probe') {
          clearTimeout(timer);
          resolve();
        }
      };
      worker.onerror = (event) => {
        clearTimeout(timer);
        reject(new Error(event.message ?? 'worker spawn failed'));
      };
      const probe: SearchWorkerRequest = { kind: 'probe' };
      worker.postMessage(probe);
    });
    workers.push(worker);
  }
  return workers;
}

interface FixtureRow {
  fixture: string;
  syncMs: number;
  syncNodes: number;
  syncDepth: number;
  syncTopKey: string | null;
  byThreads: Record<
    number,
    {
      wallMs: number;
      totalNodes: number;
      depthReached: number;
      topKey: string | null;
      topScore: number | null;
      agreesWithSync: boolean;
      nodesPerMsVsSync: number;
    }
  >;
}

async function main(): Promise<void> {
  const rows: FixtureRow[] = [];

  for (const fixture of FIXTURES) {
    const input = toBackendInput(fixture);

    const syncStart = performance.now();
    const syncResult = runSearchBackendInput(input);
    const syncMs = performance.now() - syncStart;

    const row: FixtureRow = {
      fixture,
      syncMs: Math.round(syncMs),
      syncNodes: syncResult.searchMetrics?.nodesExplored ?? 0,
      syncDepth: syncResult.searchMetrics?.depthReached ?? 0,
      syncTopKey: syncResult.recommendation?.skill.key ?? null,
      byThreads: {},
    };

    for (const threads of THREAD_COUNTS) {
      const pool = await spawnPool(threads);
      try {
        const { result, wallMs } = await runWorkerPoolSearch(
          pool,
          input,
          'bench-scope',
        );
        const totalNodes = result.searchMetrics?.nodesExplored ?? 0;
        row.byThreads[threads] = {
          wallMs: Math.round(wallMs),
          totalNodes,
          depthReached: result.searchMetrics?.depthReached ?? 0,
          topKey: result.recommendation?.skill.key ?? null,
          topScore: result.recommendation?.score ?? null,
          agreesWithSync:
            (result.recommendation?.skill.key ?? null) === row.syncTopKey,
          nodesPerMsVsSync:
            syncMs > 0 && row.syncNodes > 0
              ? Number(
                  (totalNodes / wallMs / (row.syncNodes / syncMs)).toFixed(2),
                )
              : 0,
        };
      } finally {
        for (const worker of pool) worker.terminate();
      }
    }
    rows.push(row);
    console.log(
      `${fixture}: sync ${row.syncMs}ms/${row.syncNodes}n/d${row.syncDepth} ` +
        THREAD_COUNTS.map(
          (t) =>
            `t${t}=${row.byThreads[t].wallMs}ms/${row.byThreads[t].totalNodes}n/d${row.byThreads[t].depthReached}` +
            `${row.byThreads[t].agreesWithSync ? '' : ' DISAGREE'}`,
        ).join(' '),
    );
  }

  mkdirSync('tmp', { recursive: true });
  writeFileSync(
    path.join('tmp', 'engine-worker-bench.json'),
    JSON.stringify({ generatedAt: new Date().toISOString(), rows }, null, 2),
  );
  console.log('\nwrote tmp/engine-worker-bench.json');
}

await main();
