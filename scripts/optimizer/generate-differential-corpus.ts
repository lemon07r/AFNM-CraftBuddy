/**
 * Regenerate the TypeScript transition golden corpus.
 *
 *   bun run optimizer:transition-corpus
 *
 * Writes `src/__tests__/fixtures/transition_corpus.json` from the TypeScript
 * simulator. Run only after intentional mechanics changes and inspect the
 * expected-output diff before accepting it.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { buildDifferentialCorpus } from '../../src/__tests__/fixtures/differentialCorpus';

const OUTPUT_PATH = resolve(
  __dirname,
  '../../src/__tests__/fixtures/transition_corpus.json',
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
