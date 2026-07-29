/**
 * Pool-capable search backend plumbing.
 *
 * This module is the optimizer-side half of the worker protocol: the wire
 * format for search inputs (the mod layer ships them across
 * `postMessage`), the deterministic root-partition helper, and the merge
 * that reassembles partitioned results. It stays pure per the optimizer
 * boundary rule — the worker entry and the mod-layer client both import
 * from here, never the other way round.
 *
 * Merge semantics (also documented in
 * `docs/project/OPTIMIZER_ENGINE_FINDINGS.md`):
 *
 * - TypeScript beam search: root candidates are partitioned across workers
 *   by stride (`key i % N`), each worker searches its subset at full
 *   depth/budget, and ranked candidates merge by score with a skill-key
 *   tiebreak. Per-candidate deep scores are absolute (not relative to the
 *   root sibling set), so the merged ranking matches an unpartitioned
 *   search up to the per-partition early-exit frontier.
 * - Native MCTS prior: root-parallel. Worker i runs an independent tree
 *   with `seed = baseSeed + i` (`SearchConfig.mctsSeed`); the policy merge
 *   sums root-child visits and value and argmax-picks. In the composed
 *   pipeline each worker's prior covers only its own root subset, so the
 *   beam merge above remains the combining step.
 */

import { CraftingState } from './state';
import type { OptimizerConfig } from './skills';
import {
  findBestSkill,
  FINISH_CRAFT_KEY,
  type CraftingConditionType,
  type SearchConfig,
  type SearchResult,
  type SkillRecommendation,
} from './search';

export { FINISH_CRAFT_KEY };

// ── Worker protocol ─────────────────────────────────────────────────────────
// Shared by the worker entry (`src/worker/searchWorker.ts`) and the
// mod-layer client (`src/modContent/searchBackendClient.ts`).

export interface SearchWorkerProbeRequest {
  kind: 'probe';
}

export interface SearchWorkerSearchRequest {
  kind: 'search';
  /** Cancellation/staleness token; replies with a stale epoch are dropped. */
  epoch: number;
  /** Cross-step cache scope signature; the worker drops its table on change. */
  scope: string;
  partition: { index: number; of: number };
  /** Base seed for the native MCTS policy; worker i runs baseSeed + i. */
  baseSeed: number;
  /** Every key that could appear at the root; the worker strides its slice. */
  rootSkillKeys: string[];
  input: PlainSearchInput;
}

export interface SearchWorkerCancelRequest {
  kind: 'cancel';
  epoch: number;
}

export type SearchWorkerRequest =
  | SearchWorkerProbeRequest
  | SearchWorkerSearchRequest
  | SearchWorkerCancelRequest;

export interface SearchWorkerProbeResponse {
  kind: 'probe';
  ok: true;
}

export interface SearchWorkerResultResponse {
  kind: 'result';
  epoch: number;
  result: SearchResult;
}

export interface SearchWorkerErrorResponse {
  kind: 'error';
  epoch: number;
  message: string;
}

export type SearchWorkerResponse =
  | SearchWorkerProbeResponse
  | SearchWorkerResultResponse
  | SearchWorkerErrorResponse;

/** Everything a backend needs to run one recommendation search. */
export interface SearchBackendInput {
  state: CraftingState;
  config: OptimizerConfig;
  targetCompletion: number;
  targetPerfection: number;
  lookaheadDepth: number;
  currentCondition?: CraftingConditionType;
  forecast: CraftingConditionType[];
  searchConfig: Partial<SearchConfig>;
}

/** Run a search input in-process (the sync backend and the worker share this). */
export function runSearchBackendInput(input: SearchBackendInput): SearchResult {
  return findBestSkill(
    input.state,
    input.config,
    input.targetCompletion,
    input.targetPerfection,
    false,
    input.lookaheadDepth,
    input.currentCondition,
    input.forecast,
    input.searchConfig,
  );
}

// ── Wire format ─────────────────────────────────────────────────────────────
// Structured clone cannot carry class instances or Maps, so the state and
// config cross as plain records. The field list mirrors
// `CraftingStateData`; a missing field here silently drops live game state
// into the worker, so `searchBackend.test.ts` pins a byte-identical
// round-trip over every replay fixture.

export interface PlainSearchInput {
  state: Record<string, unknown>;
  config: Record<string, unknown>;
  targetCompletion: number;
  targetPerfection: number;
  lookaheadDepth: number;
  currentCondition: string | null;
  forecast: string[];
  searchConfig: Record<string, unknown>;
}

function mapToRecord<T>(map: Map<string, T>): Record<string, T> {
  const out: Record<string, T> = {};
  map.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

function recordToMap<T>(record: unknown): Map<string, T> {
  return new Map(
    Object.entries((record as Record<string, T> | null | undefined) ?? {}),
  );
}

export function serializeSearchInput(
  input: SearchBackendInput,
): PlainSearchInput {
  const state = input.state;
  return {
    state: {
      qi: state.qi,
      stability: state.stability,
      initialMaxStability: state.initialMaxStability,
      stabilityPenalty: state.stabilityPenalty,
      completion: state.completion,
      perfection: state.perfection,
      critChance: state.critChance,
      critMultiplier: state.critMultiplier,
      successChanceBonus: state.successChanceBonus,
      poolCostFlat: state.poolCostFlat,
      poolCostPercentage: state.poolCostPercentage,
      stabilityCostPercentage: state.stabilityCostPercentage,
      controlBuffTurns: state.controlBuffTurns,
      intensityBuffTurns: state.intensityBuffTurns,
      controlBuffMultiplier: state.controlBuffMultiplier,
      intensityBuffMultiplier: state.intensityBuffMultiplier,
      toxicity: state.toxicity,
      maxToxicity: state.maxToxicity,
      harmony: state.harmony,
      harmonyData: state.harmonyData ?? null,
      step: state.step,
      completionBonus: state.completionBonus,
      consumedPillsThisTurn: state.consumedPillsThisTurn,
      cooldowns: mapToRecord(state.cooldowns),
      items: mapToRecord(state.items),
      buffs: mapToRecord(state.buffs),
      nativeVariables: state.nativeVariables ?? null,
      history: state.history ?? [],
    },
    config: input.config as unknown as Record<string, unknown>,
    targetCompletion: input.targetCompletion,
    targetPerfection: input.targetPerfection,
    lookaheadDepth: input.lookaheadDepth,
    currentCondition: input.currentCondition ?? null,
    forecast: [...input.forecast],
    // Strip non-serializable entries (transpositionCache, shouldAbort); the
    // worker installs its own per-instance table and abort hook.
    searchConfig: stripInProcessOnlySearchConfig(input.searchConfig),
  };
}

export function reviveSearchInput(plain: PlainSearchInput): SearchBackendInput {
  const stateRecord = plain.state;
  return {
    state: new CraftingState({
      ...(stateRecord as unknown as ConstructorParameters<
        typeof CraftingState
      >[0]),
      cooldowns: recordToMap(stateRecord.cooldowns),
      items: recordToMap(stateRecord.items),
      buffs: recordToMap(stateRecord.buffs),
      harmonyData:
        (stateRecord.harmonyData as CraftingState['harmonyData']) ?? undefined,
      nativeVariables:
        (stateRecord.nativeVariables as CraftingState['nativeVariables']) ??
        undefined,
    }),
    config: plain.config as unknown as OptimizerConfig,
    targetCompletion: plain.targetCompletion,
    targetPerfection: plain.targetPerfection,
    lookaheadDepth: plain.lookaheadDepth,
    currentCondition: (plain.currentCondition ??
      undefined) as CraftingConditionType | undefined,
    forecast: plain.forecast as CraftingConditionType[],
    searchConfig: plain.searchConfig as Partial<SearchConfig>,
  };
}

/**
 * SearchConfig fields that must not cross the wire: the transposition table
 * (per-instance by steering rule) and the cooperative-abort callback (a
 * function). Everything else is plain data.
 */
function stripInProcessOnlySearchConfig(
  searchConfig: Partial<SearchConfig>,
): Record<string, unknown> {
  const { transpositionCache, shouldAbort, ...serializable } = searchConfig;
  return serializable as Record<string, unknown>;
}

// ── Root partitioning ───────────────────────────────────────────────────────

/**
 * Deterministic stride partition of the root candidate key space. The client
 * partitions every key that could appear at the root (roster + the synthetic
 * finish action); unavailable keys simply never materialize as candidates.
 */
export function partitionRootSkillKeys(
  allRootKeys: readonly string[],
  partitionIndex: number,
  partitionCount: number,
): string[] {
  if (partitionCount <= 1) {
    return [...allRootKeys];
  }
  return allRootKeys.filter((_, index) => index % partitionCount === partitionIndex);
}

// ── Merging partitioned results ─────────────────────────────────────────────

function compareMergedCandidates(
  a: SkillRecommendation,
  b: SkillRecommendation,
): number {
  if (b.score !== a.score) {
    return b.score - a.score;
  }
  return a.skill.key.localeCompare(b.skill.key);
}

function recomputeQualityRatings(candidates: SkillRecommendation[]): void {
  if (candidates.length === 0) {
    return;
  }
  const best = candidates[0].score;
  const worst = candidates[candidates.length - 1].score;
  const range = best - worst;
  for (const candidate of candidates) {
    candidate.qualityRating =
      range > 0 ? Math.round(((candidate.score - worst) / range) * 100) : 100;
  }
}

/**
 * Reassemble the per-partition results into one result. Deterministic given
 * the same partials: candidates from every partition are pooled, deduped by
 * skill key, sorted by score with a key tiebreak, and quality ratings are
 * recomputed over the merged range (they are relative to the candidate set).
 */
export function mergePartitionedResults(
  partials: readonly SearchResult[],
): SearchResult {
  if (partials.length === 1) {
    return partials[0];
  }

  const pooled = new Map<string, SkillRecommendation>();
  let winningPartial: SearchResult | undefined;
  let bestScore = -Infinity;
  for (const partial of partials) {
    const candidates = [
      ...(partial.recommendation ? [partial.recommendation] : []),
      ...partial.alternativeSkills,
    ];
    for (const candidate of candidates) {
      const existing = pooled.get(candidate.skill.key);
      if (!existing || candidate.score > existing.score) {
        pooled.set(candidate.skill.key, candidate);
      }
      if (candidate.score > bestScore) {
        bestScore = candidate.score;
        winningPartial = partial;
      }
    }
  }

  // es5 target: collect via forEach instead of spreading the Map iterator.
  const pooledCandidates: SkillRecommendation[] = [];
  pooled.forEach((candidate) => pooledCandidates.push(candidate));
  const merged = pooledCandidates.sort(compareMergedCandidates);
  recomputeQualityRatings(merged);

  const anyCandidates = merged.length > 0;
  const nodesExplored = partials.reduce(
    (sum, partial) => sum + (partial.searchMetrics?.nodesExplored ?? 0),
    0,
  );
  const cacheHits = partials.reduce(
    (sum, partial) => sum + (partial.searchMetrics?.cacheHits ?? 0),
    0,
  );
  const crossStepHits = partials.reduce(
    (sum, partial) => sum + (partial.searchMetrics?.crossStepHits ?? 0),
    0,
  );
  const pruned = partials.reduce(
    (sum, partial) => sum + (partial.searchMetrics?.pruned ?? 0),
    0,
  );
  const referencePartial = winningPartial ?? partials[0];

  return {
    recommendation: merged[0] ?? null,
    alternativeSkills: merged.slice(1),
    isTerminal: !anyCandidates && partials.every((partial) => partial.isTerminal),
    targetsMet: partials.some((partial) => partial.targetsMet),
    outcomeProjection: referencePartial?.outcomeProjection,
    blockedReasons: anyCandidates
      ? undefined
      : referencePartial?.blockedReasons,
    optimalRotation: referencePartial?.optimalRotation,
    optimalRotationLabels: referencePartial?.optimalRotationLabels,
    expectedFinalState: referencePartial?.expectedFinalState,
    searchMetrics: {
      nodesExplored,
      cacheHits,
      crossStepHits: crossStepHits > 0 ? crossStepHits : undefined,
      timeTakenMs: Math.max(
        ...partials.map((partial) => partial.searchMetrics?.timeTakenMs ?? 0),
      ),
      depthReached: Math.max(
        ...partials.map((partial) => partial.searchMetrics?.depthReached ?? 0),
      ),
      pruned,
    },
  };
}
