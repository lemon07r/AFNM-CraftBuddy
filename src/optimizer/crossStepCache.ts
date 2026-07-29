/**
 * CraftBuddy - cross-step transposition cache for the lookahead search.
 *
 * The in-search transposition table is normally recreated per recommendation,
 * so every step of a craft re-explores subtrees the previous step already
 * scored. This holder carries one table across the steps of a craft: the
 * caller passes `tableFor(scope)` in as `SearchConfig.transpositionCache` and
 * the search writes into it instead of a fresh map.
 *
 * `scope` is the caller-computed signature of everything that changes what a
 * cached score means (craft targets/caps, player stats, technique roster,
 * condition model, and the search settings that steer scoring). When the
 * scope changes the table is dropped, because entries are keyed only by
 * state/depth/condition and would otherwise leak across crafts.
 *
 * Each search backend instance (main thread or one worker of a pool) holds
 * its own cache. Caches are never shared or merged across instances: two
 * instances exploring different root subsets must not see each other's
 * partial frontiers.
 */

export interface TranspositionCacheEntry {
  score: number;
  bestMove: string;
}

export type TranspositionCache = Map<string, TranspositionCacheEntry>;

/** Rough bound on retained entries; a deep craft's table stays well under. */
const DEFAULT_MAX_ENTRIES = 400_000;

export class CrossStepSearchCache {
  private scope: string | null = null;
  private table: TranspositionCache = new Map();

  constructor(private readonly maxEntries: number = DEFAULT_MAX_ENTRIES) {}

  /**
   * Return the table for `scope`, dropping it when the scope changed (craft
   * or config change) or when it grew past the entry cap.
   */
  tableFor(scope: string): TranspositionCache {
    if (scope !== this.scope || this.table.size > this.maxEntries) {
      this.table = new Map();
      this.scope = scope;
    }
    return this.table;
  }

  clear(): void {
    this.table = new Map();
    this.scope = null;
  }

  get size(): number {
    return this.table.size;
  }
}
