/**
 * Self-contained search worker entry (webpack second compilation, inlined
 * into the main bundle as a string and instantiated from a Blob URL).
 *
 * Purity rule: imports only `src/optimizer/*`. React/MUI are webpack
 * externals that do not exist inside a worker, and `src/modContent/*` would
 * drag the game-integration layer in, so neither may appear here. The inline
 * WASM engine is worker-safe as-is (`initSync` over the embedded base64
 * module, no fetch/URL dependency); each worker instantiates its own copy.
 *
 * Cancellation: a `cancel` message for the in-flight epoch flips a flag that
 * the search polls through `SearchConfig.shouldAbort`, so the synchronous
 * search unwinds at the next budget check. The client additionally drops any
 * reply whose epoch is stale, and may hard-terminate the worker as a last
 * resort.
 */

import { CrossStepSearchCache } from '../optimizer/crossStepCache';
import {
  partitionRootSkillKeys,
  reviveSearchInput,
  runSearchBackendInput,
  type SearchWorkerRequest,
  type SearchWorkerResponse,
} from '../optimizer/searchBackend';

const workerScope = self as unknown as {
  onmessage: ((event: MessageEvent<SearchWorkerRequest>) => void) | null;
  postMessage: (message: SearchWorkerResponse) => void;
};

// Per-instance cross-step cache: never shared with or merged into another
// worker's table (steering rule), scoped exactly like the sync backend's.
const crossStepCache = new CrossStepSearchCache();

let activeEpoch = 0;
let abortRequested = false;

workerScope.onmessage = (event: MessageEvent<SearchWorkerRequest>) => {
  const message = event.data;
  if (!message || typeof message !== 'object') {
    return;
  }

  if (message.kind === 'probe') {
    workerScope.postMessage({ kind: 'probe', ok: true });
    return;
  }

  if (message.kind === 'cancel') {
    if (message.epoch === activeEpoch) {
      abortRequested = true;
    }
    return;
  }

  const { epoch, scope, partition, baseSeed, rootSkillKeys, input } = message;
  activeEpoch = epoch;
  abortRequested = false;

  try {
    const revived = reviveSearchInput(input);
    const result = runSearchBackendInput({
      ...revived,
      searchConfig: {
        ...revived.searchConfig,
        transpositionCache: crossStepCache.tableFor(scope),
        rootSkillKeys: partitionRootSkillKeys(
          rootSkillKeys,
          partition.index,
          partition.of,
        ),
        mctsSeed: baseSeed + partition.index,
        shouldAbort: () => abortRequested,
      },
    });
    workerScope.postMessage({ kind: 'result', epoch, result });
  } catch (error) {
    workerScope.postMessage({
      kind: 'error',
      epoch,
      message: error instanceof Error ? error.message : String(error),
    });
  }
};
