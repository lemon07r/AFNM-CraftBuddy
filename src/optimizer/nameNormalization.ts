/**
 * CraftBuddy - Identifier normalization.
 *
 * Buff names, native-variable keys and expression identifiers all reduce to
 * `trim -> lowercase -> spaces become underscores`. The search calls this on the
 * same handful of names for every node it expands, and CPU profiling of a
 * Skyfall Bow replay put `normalizeBuffName` plus its whitespace regex at ~11%
 * of the whole search budget.
 *
 * The mapping is pure and its input alphabet is tiny (a craft has a few dozen
 * distinct names), so a memo table removes that cost outright without changing
 * a single result.
 */

/**
 * Upper bound on retained entries. A craft never approaches this; the cap only
 * exists so a pathological modded name set cannot grow the table without limit.
 */
const CACHE_LIMIT = 4096;

const cache = new Map<string, string>();

/**
 * Normalize a runtime identifier to its canonical lookup form.
 *
 * Accepts `unknown` because ModAPI payloads are not guaranteed to be strings.
 */
export function normalizeIdentifier(value: unknown): string {
  if (value === undefined || value === null || value === '') {
    return '';
  }
  const raw = typeof value === 'string' ? value : String(value);
  const cached = cache.get(raw);
  if (cached !== undefined) {
    return cached;
  }
  const normalized = raw.trim().toLowerCase().replace(/\s+/g, '_');
  if (cache.size < CACHE_LIMIT) {
    cache.set(raw, normalized);
  }
  return normalized;
}

/** Test seam: drop the memo table so cache growth can be asserted. */
export function clearNormalizedIdentifierCache(): void {
  cache.clear();
}
