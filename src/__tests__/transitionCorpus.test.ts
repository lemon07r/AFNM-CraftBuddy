/**
 * TypeScript transition golden guard. Replay the stored inputs, not merely
 * regenerated scenarios. Regenerate with `bun run optimizer:transition-corpus`
 * only after an intentional mechanics change and inspect the expected diff.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

import {
  buildDifferentialScenario,
  DIFFERENTIAL_CORPUS_VERSION,
  type DifferentialCorpus,
} from './fixtures/differentialCorpus';
import { reviveSearchInput } from '../optimizer/searchBackend';

const CORPUS_PATH = join(__dirname, 'fixtures/transition_corpus.json');

function loadCheckedInCorpus(): DifferentialCorpus {
  return JSON.parse(readFileSync(CORPUS_PATH, 'utf8')) as DifferentialCorpus;
}

/** JSON round-trip so `undefined` fields are dropped the same way on both sides. */
function serializable(value: unknown): unknown {
  return JSON.parse(JSON.stringify(value));
}

describe('TypeScript transition golden corpus', () => {
  const checkedIn = loadCheckedInCorpus();
  it('pins item legality, technique gating and Soulflame transitions', () => {
    const caseFor = (scenario: string, skillKey: string) =>
      checkedIn.scenarios
        .find((entry) => entry.name === scenario)
        ?.cases.find((entry) => entry.skillKey === skillKey);

    // Item actions must be present, otherwise the pill/reagent golden is
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
      { key: 'soulflame', stacks: 2, internalState: {} },
    ]);
    expect(soulflame?.expected?.perfection).toBeGreaterThan(0);
  });

  it('uses the supported input schema', () => {
    expect(checkedIn.version).toBe(DIFFERENTIAL_CORPUS_VERSION);
  });

  it.each(checkedIn.scenarios)('replays $name', (scenario) => {
    const input = reviveSearchInput(scenario.input);
    const replayed = buildDifferentialScenario({
      name: scenario.name,
      state: input.state,
      config: input.config,
      targetCompletion: input.targetCompletion,
      targetPerfection: input.targetPerfection,
      condition: input.currentCondition ?? 'neutral',
    });
    expect(serializable(replayed.cases)).toEqual(scenario.cases);
  });
});
