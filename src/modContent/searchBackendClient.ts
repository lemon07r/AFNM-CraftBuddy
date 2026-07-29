/**
 * Worker-pool search backend client (mod layer).
 *
 * Spawns a pool of blob-URL workers running the inlined search bundle
 * (`src/worker/searchWorker.ts` via webpack's second compilation), probes
 * the blob-worker capability once per session, and dispatches searches with
 * epoch cancellation. The optimizer only sees the pure pieces in
 * `src/optimizer/searchBackend.ts`; everything environment-specific (Blob,
 * Worker, URL) lives here.
 *
 * Fallback: when the probe fails (or Worker is unavailable) the caller runs
 * the existing synchronous `findBestSkill` path, so the mod behaves exactly
 * as before on runtimes that block blob workers.
 */

import {
  mergePartitionedResults,
  type PlainSearchInput,
  type SearchWorkerRequest,
  type SearchWorkerResponse,
} from '../optimizer/searchBackend';
import type { SearchResult } from '../optimizer/search';
// Inlined worker bundle: emitted by the webpack worker compilation into
// src/worker/generated and imported as raw text (asset/source). Stubbed in
// Jest via moduleNameMapper. See webpack.config.js.
// eslint-disable-next-line import/no-unresolved
import workerBundleSource from '../worker/generated/searchWorker.js';

export type WorkerSearchOutcome =
  | { kind: 'result'; result: SearchResult }
  /** The reply arrived after a newer dispatch; the caller must drop it. */
  | { kind: 'stale' }
  /** Workers are unavailable or the search errored; caller falls back to sync. */
  | { kind: 'unavailable'; reason: string };

interface PendingSearch {
  epoch: number;
  partitionsRemaining: number;
  partials: SearchResult[];
  failed: boolean;
  resolve: (outcome: WorkerSearchOutcome) => void;
}

interface PoolWorker {
  worker: Worker;
  busyEpoch: number | null;
}

const PROBE_TIMEOUT_MS = 1500;

let blobWorkerUrl: string | null | undefined;
let probePromise: Promise<boolean> | null = null;
let pool: PoolWorker[] = [];
let poolSize = 0;
let pending: PendingSearch | null = null;
let diagnosticsHook: ((message: string) => void) | null = null;

// Session status mirrored into integrationDiagnostics by the mod layer.
let probeState: 'unprobed' | 'passed' | 'failed' = 'unprobed';
let probeDetail = 'probe has not run yet';
let workerResultCount = 0;
let syncFallbackCount = 0;

export interface SearchBackendStatus {
  probe: 'unprobed' | 'passed' | 'failed';
  detail: string;
  workerResultCount: number;
  syncFallbackCount: number;
  poolSize: number;
}

export function getSearchBackendStatus(): SearchBackendStatus {
  return {
    probe: probeState,
    detail: probeDetail,
    workerResultCount,
    syncFallbackCount,
    poolSize,
  };
}

/** Optional diagnostics sink (wired to integration diagnostics by modContent). */
export function setSearchBackendDiagnosticsHook(
  hook: (message: string) => void,
): void {
  diagnosticsHook = hook;
}

function logDiagnostics(message: string): void {
  diagnosticsHook?.(message);
}

function getWorkerConstructor(): typeof Worker | undefined {
  return typeof Worker !== 'undefined' ? Worker : undefined;
}

function getBlobUrl(): string | null {
  if (blobWorkerUrl !== undefined) {
    return blobWorkerUrl;
  }
  try {
    if (
      typeof Blob === 'undefined' ||
      typeof URL === 'undefined' ||
      typeof URL.createObjectURL !== 'function' ||
      typeof workerBundleSource !== 'string' ||
      workerBundleSource.length === 0
    ) {
      blobWorkerUrl = null;
      return blobWorkerUrl;
    }
    blobWorkerUrl = URL.createObjectURL(
      new Blob([workerBundleSource], { type: 'text/javascript' }),
    );
  } catch (error) {
    logDiagnostics(
      `search-backend: blob URL creation failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    blobWorkerUrl = null;
  }
  return blobWorkerUrl;
}

function spawnWorker(url: string): Worker | null {
  const WorkerCtor = getWorkerConstructor();
  if (!WorkerCtor) {
    return null;
  }
  try {
    return new WorkerCtor(url);
  } catch (error) {
    logDiagnostics(
      `search-backend: worker spawn failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return null;
  }
}

/**
 * One blob-worker smoke test per session: create, echo, terminate. The
 * result decides the backend for the whole session (sync fallback on
 * failure), and the outcome is logged through integration diagnostics.
 */
export function probeSearchWorkerCapability(): Promise<boolean> {
  if (probePromise) {
    return probePromise;
  }
  probePromise = new Promise<boolean>((resolve) => {
    const url = getBlobUrl();
    if (!url) {
      probeState = 'failed';
      probeDetail = 'no blob URL (Worker/Blob unavailable or empty bundle)';
      logDiagnostics(`search-backend: probe skipped, ${probeDetail}`);
      resolve(false);
      return;
    }
    const worker = spawnWorker(url);
    if (!worker) {
      probeState = 'failed';
      probeDetail = 'worker spawn failed';
      resolve(false);
      return;
    }
    let settled = false;
    const finish = (ok: boolean) => {
      if (settled) {
        return;
      }
      settled = true;
      worker.terminate();
      probeState = ok ? 'passed' : 'failed';
      probeDetail = ok
        ? 'blob worker echo succeeded'
        : 'blob worker echo timed out or errored';
      logDiagnostics(
        `search-backend: blob worker smoke probe ${ok ? 'passed' : 'failed'}`,
      );
      resolve(ok);
    };
    const timer = setTimeout(() => finish(false), PROBE_TIMEOUT_MS);
    worker.onmessage = (event: MessageEvent<SearchWorkerResponse>) => {
      if (event.data?.kind === 'probe' && event.data.ok) {
        clearTimeout(timer);
        finish(true);
      }
    };
    worker.onerror = () => {
      clearTimeout(timer);
      finish(false);
    };
    const probeMessage: SearchWorkerRequest = { kind: 'probe' };
    worker.postMessage(probeMessage);
  });
  return probePromise;
}

function ensurePool(size: number): boolean {
  if (poolSize !== size) {
    for (const entry of pool) {
      entry.worker.terminate();
    }
    pool = [];
    poolSize = size;
  }
  while (pool.length < size) {
    const url = getBlobUrl();
    if (!url) {
      return false;
    }
    const worker = spawnWorker(url);
    if (!worker) {
      return false;
    }
    pool.push({ worker, busyEpoch: null });
  }
  return true;
}

function cancelPending(reason: 'superseded' | 'cancelled'): void {
  if (!pending) {
    return;
  }
  const stale = pending;
  pending = null;
  const cancelMessage: SearchWorkerRequest = {
    kind: 'cancel',
    epoch: stale.epoch,
  };
  for (const entry of pool) {
    if (entry.busyEpoch === stale.epoch) {
      try {
        entry.worker.postMessage(cancelMessage);
      } catch {
        // A worker that cannot receive messages is torn down on demand.
      }
      entry.busyEpoch = null;
    }
  }
  stale.resolve({ kind: 'stale' });
  void reason;
}

/** Drop every in-flight search (epoch bump from a newer dispatch). */
export function cancelSearchBackendPool(): void {
  cancelPending('superseded');
}

/** Tear the pool down (session end). A new probe is not required on reuse. */
export function terminateSearchBackendPool(): void {
  cancelPending('cancelled');
  for (const entry of pool) {
    entry.worker.terminate();
  }
  pool = [];
  poolSize = 0;
}

/**
 * Dispatch one search across the pool. `threads === 1` sends the whole root
 * candidate set to a single worker (no partitioning); `threads > 1` strides
 * root candidates across workers and merges by score. One outstanding search
 * at a time: a new dispatch supersedes the previous one.
 */
export async function requestWorkerSearch(options: {
  epoch: number;
  scope: string;
  threads: number;
  baseSeed: number;
  rootSkillKeys: string[];
  input: PlainSearchInput;
}): Promise<WorkerSearchOutcome> {
  const probed = await probeSearchWorkerCapability();
  if (!probed) {
    syncFallbackCount += 1;
    return { kind: 'unavailable', reason: 'probe-failed' };
  }
  const threads = Math.max(1, Math.floor(options.threads));
  if (!ensurePool(threads)) {
    syncFallbackCount += 1;
    return { kind: 'unavailable', reason: 'spawn-failed' };
  }

  cancelPending('superseded');

  return new Promise<WorkerSearchOutcome>((resolve) => {
    const current: PendingSearch = {
      epoch: options.epoch,
      partitionsRemaining: threads,
      partials: [],
      failed: false,
      resolve,
    };
    pending = current;

    for (let index = 0; index < threads; index++) {
      const entry = pool[index];
      entry.busyEpoch = options.epoch;
      entry.worker.onmessage = (
        event: MessageEvent<SearchWorkerResponse>,
      ) => {
        const message = event.data;
        if (!message || message.kind === 'probe') {
          return;
        }
        entry.busyEpoch = null;
        if (!pending || pending.epoch !== options.epoch || message.epoch !== options.epoch) {
          return;
        }
        if (message.kind === 'error') {
          pending = null;
          syncFallbackCount += 1;
          logDiagnostics(
            `search-backend: worker ${index} errored: ${message.message}`,
          );
          current.resolve({ kind: 'unavailable', reason: message.message });
          return;
        }
        current.partials.push(message.result);
        current.partitionsRemaining -= 1;
        if (current.partitionsRemaining <= 0) {
          pending = null;
          workerResultCount += 1;
          const merged = mergePartitionedResults(current.partials);
          current.resolve({ kind: 'result', result: merged });
        }
      };
      entry.worker.onerror = (event) => {
        entry.busyEpoch = null;
        if (pending && pending.epoch === options.epoch) {
          pending = null;
          syncFallbackCount += 1;
          logDiagnostics(
            `search-backend: worker ${index} failed: ${event.message ?? 'unknown'}`,
          );
          current.resolve({
            kind: 'unavailable',
            reason: event.message ?? 'worker-error',
          });
        }
      };
      const request: SearchWorkerRequest = {
        kind: 'search',
        epoch: options.epoch,
        scope: options.scope,
        partition: { index, of: threads },
        baseSeed: options.baseSeed,
        rootSkillKeys: options.rootSkillKeys,
        input: options.input,
      };
      entry.worker.postMessage(request);
    }
  });
}

/** Test-only escape hatch: force the next probe to be re-run. */
export function __resetSearchBackendForTests(): void {
  terminateSearchBackendPool();
  probePromise = null;
  blobWorkerUrl = undefined;
  probeState = 'unprobed';
  probeDetail = 'probe has not run yet';
  workerResultCount = 0;
  syncFallbackCount = 0;
}
