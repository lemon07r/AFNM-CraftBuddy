/**
 * Cross-engine differential guard (TypeScript side).
 *
 * `crates/craftbuddy-engine/tests/differential_corpus.json` is the contract
 * between the TypeScript simulator and the Rust engine. This suite asserts the
 * checked-in file still describes what TypeScript actually does; the matching
 * Rust test asserts the Rust engine reproduces it.
 *
 * When this fails after an intentional mechanics change, regenerate with
 * `bun run optimizer:differential-corpus` and then run `bun run wasm:test` to
 * find out which Rust behaviours the change invalidated.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

import {
  buildDifferentialCorpus,
  DIFFERENTIAL_CORPUS_VERSION,
  type DifferentialCorpus,
} from './fixtures/differentialCorpus';

const CORPUS_PATH = join(
  __dirname,
  '../../crates/craftbuddy-engine/tests/differential_corpus.json',
);

function loadCheckedInCorpus(): DifferentialCorpus {
  return JSON.parse(readFileSync(CORPUS_PATH, 'utf8')) as DifferentialCorpus;
}

/** JSON round-trip so `undefined` fields are dropped the same way on both sides. */
function serializable(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}

describe('cross-engine differential corpus', () => {
  const built = buildDifferentialCorpus();

  it('is deterministic across runs', () => {
    expect(serializable(buildDifferentialCorpus())).toEqual(
      serializable(built),
    );
  });

  it('covers every harmony type, condition and scaling shape', () => {
    const names = built.scenarios.map((scenario) => scenario.name);
    for (const harmonyType of [
      'forge',
      'alchemical',
      'inscription',
      'resonance',
      'formless',
      'enhancingEcho',
      'eccentricDecree',
    ]) {
      expect(names).toContain(`harmony-${harmonyType}`);
    }
    for (const condition of [
      'positive',
      'negative',
      'veryPositive',
      'veryNegative',
    ]) {
      expect(names).toContain(`condition-${condition}`);
    }
    expect(names).toContain('crit-and-overcrit');
    expect(names).toContain('cost-modifiers');
    expect(names).toContain('toxicity-pressure');
    expect(names).toContain('cooldown-active');

    const transitions = built.scenarios.reduce(
      (total, scenario) => total + scenario.cases.length,
      0,
    );
    expect(transitions).toBeGreaterThan(400);
  });

  it('matches the corpus the Rust engine replays', () => {
    const checkedIn = loadCheckedInCorpus();
    expect(checkedIn.version).toBe(DIFFERENTIAL_CORPUS_VERSION);
    expect(serializable(built)).toEqual(serializable(checkedIn));
  });
});
