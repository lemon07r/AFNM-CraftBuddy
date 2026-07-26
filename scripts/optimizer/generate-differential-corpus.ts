/**
 * Regenerate the cross-engine differential corpus.
 *
 *   bun run optimizer:differential-corpus
 *
 * Writes `crates/craftbuddy-engine/tests/differential_corpus.json` from the
 * TypeScript simulator. The Rust engine replays the same file in
 * `cargo test`, so any divergence between the two implementations fails a test
 * instead of silently changing recommendations.
 *
 * Run this after intentional TypeScript mechanics changes, then re-run
 * `bun run wasm:test` to see what the Rust engine still gets wrong.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { buildDifferentialCorpus } from '../../src/__tests__/fixtures/differentialCorpus';

const OUTPUT_PATH = resolve(
  __dirname,
  '../../crates/craftbuddy-engine/tests/differential_corpus.json',
);

function main(): void {
  const corpus = buildDifferentialCorpus();
  mkdirSync(dirname(OUTPUT_PATH), { recursive: true });
  writeFileSync(OUTPUT_PATH, `${JSON.stringify(corpus, null, 2)}\n`, 'utf8');

  const cases = corpus.scenarios.reduce(
    (total, scenario) => total + scenario.cases.length,
    0,
  );
  console.log(
    `Wrote ${corpus.scenarios.length} scenarios / ${cases} transitions to ${OUTPUT_PATH}`,
  );
}

main();
