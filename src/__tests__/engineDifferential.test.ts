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

  it('covers every mechanic the Rust engine now models', () => {
    const names = built.scenarios.map((scenario) => scenario.name);
    // One assertion per newly ported mechanic, so a dropped scenario is a test
    // failure rather than silently reduced parity coverage.
    for (const scenario of [
      'effects-baseline',
      'effects-low-resources',
      'effects-soulflame-active',
      'effects-soulflame-last-stack',
      'effects-buff-stat-contributions',
      'effects-action-type-hooks',
      'effects-toxicity-and-max-stability',
      'effects-gated-technique-ready',
      'effects-gated-technique-locked',
      'effects-items-step-zero',
      'effects-items-pill-budget-spent',
      'effects-items-exhausted',
      'effects-turbid-qi-step',
      'effects-conditional-buff-effect',
    ]) {
      expect(names).toContain(scenario);
    }
    for (const harmonyType of [
      'forge',
      'alchemical',
      'inscription',
      'resonance',
      'formless',
      'enhancingEcho',
      'eccentricDecree',
    ]) {
      expect(names).toContain(`effects-harmony-${harmonyType}`);
    }

    const caseFor = (scenario: string, skillKey: string) =>
      built.scenarios
        .find((entry) => entry.name === scenario)
        ?.cases.find((entry) => entry.skillKey === skillKey);

    // Item actions must be present, otherwise the pill/reagent parity claim is
    // vacuous: the corpus used to filter them out entirely.
    expect(
      caseFor('effects-items-step-zero', 'qi_restoring_pill')?.expected,
    ).toBeTruthy();
    expect(
      caseFor('effects-items-step-zero', 'spirit_reagent')?.expected,
    ).toBeTruthy();
    // Reagents are step-0 only, and the per-turn pill budget is enforced.
    expect(
      caseFor('effects-items-pill-budget-spent', 'spirit_reagent')?.expected,
    ).toBeNull();
    expect(
      caseFor('effects-items-pill-budget-spent', 'qi_restoring_pill')?.expected,
    ).toBeNull();
    // A gated technique is illegal without its token and legal with it.
    expect(
      caseFor('effects-gated-technique-locked', 'false_fusion')?.expected,
    ).toBeNull();
    expect(
      caseFor('effects-gated-technique-ready', 'false_fusion')?.expected,
    ).toBeTruthy();
    // Soulflame burns a stack and bites stability every turn.
    const soulflame = caseFor('effects-soulflame-active', 'effect_refine');
    expect(soulflame?.expected?.buffs).toEqual([
      { key: 'soulflame', stacks: 2 },
    ]);
    expect(soulflame?.expected?.perfection).toBeGreaterThan(0);
  });

  it('matches the corpus the Rust engine replays', () => {
    const checkedIn = loadCheckedInCorpus();
    expect(checkedIn.version).toBe(DIFFERENTIAL_CORPUS_VERSION);
    expect(serializable(built)).toEqual(serializable(checkedIn));
  });
});
