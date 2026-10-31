import {
  bandThreshold,
  classifyOutcome,
  resolvePlanningGoals,
  willAutoFinish,
} from '../optimizer/outcome';
import { CraftingState } from '../optimizer/state';
import { __testing } from '../optimizer/search';

describe('requested planning goals remain separate from runtime outcomes', () => {
  const caps = {
    isSublimeCraft: true,
    maxCompletion: 900,
    maxPerfection: 1200,
  };

  it('Auto with extra-band ambition requests both actual caps', () => {
    const goals = resolvePlanningGoals(caps, 100, 200);
    expect([goals.completion, goals.perfection]).toEqual([900, 1200]);
    expect([goals.baselineCompletion, goals.baselinePerfection]).toEqual([
      230, 460,
    ]);
  });

  it('Auto without extra-band ambition requests the ordinary tier', () => {
    const goals = resolvePlanningGoals(caps, 100, 200, {
      overcraftAmbition: false,
    });
    expect([goals.completion, goals.perfection]).toEqual([230, 460]);
  });

  it('explicit settings request both bars even with automatic ambition disabled', () => {
    const goals = resolvePlanningGoals(caps, 100, 200, {
      overcraftAmbition: false,
      completionBandCeiling: 3,
      perfectionBandGoal: 4,
    });
    expect(goals.completion).toBe(bandThreshold(100, 3));
    expect(goals.perfection).toBe(Math.min(1200, bandThreshold(200, 4)));
  });

  it('explicit lower goals do not redefine sublime or prematurely auto-finish', () => {
    const goals = resolvePlanningGoals(caps, 100, 200, {
      completionBandCeiling: 1,
      perfectionBandGoal: 1,
    });
    const state = {
      completion: goals.completion,
      perfection: goals.perfection,
      stability: 30,
    };
    expect([goals.completion, goals.perfection]).toEqual([100, 200]);
    expect(classifyOutcome(state, goals.bands).tier).toBe('perfect');
    expect(goals.bands.targetTier).toBe('sublime');
    expect(willAutoFinish(state, goals.bands)).toBe(false);
  });

  it('clips explicit goals to the actual caps without inventing unreachable work', () => {
    const goals = resolvePlanningGoals(caps, 100, 200, {
      completionBandCeiling: 8,
      perfectionBandGoal: 8,
    });
    expect([goals.completion, goals.perfection]).toEqual([900, 1200]);
  });

  it('uses the baseline when caps are unknown or not finite', () => {
    const goals = resolvePlanningGoals(
      { isSublimeCraft: true, maxCompletion: Infinity },
      100,
      200,
      {
        completionBandCeiling: 8,
        perfectionBandGoal: 8,
      },
    );
    expect([goals.completion, goals.perfection]).toEqual([230, 460]);
  });

  it('treats absent recipe bars and reported zero caps as no work', () => {
    expect(resolvePlanningGoals(caps, 0, 200).completion).toBe(0);
    expect(
      resolvePlanningGoals({ maxCompletion: 0, maxPerfection: 0 }, 100, 200)
        .completion,
    ).toBe(0);
    expect(
      resolvePlanningGoals({ maxCompletion: 0, maxPerfection: 0 }, 100, 200)
        .perfection,
    ).toBe(0);
  });

  it('normalizes invalid explicit settings to Auto and bounds positive settings', () => {
    const goals = resolvePlanningGoals(caps, 100, 200, {
      completionBandCeiling: NaN,
      perfectionBandGoal: -2,
    });
    expect([goals.completion, goals.perfection]).toEqual([900, 1200]);
    const bounded = resolvePlanningGoals(
      { maxCompletion: 100000, maxPerfection: 100000 },
      100,
      100,
      {
        completionBandCeiling: 99,
        perfectionBandGoal: 3.8,
      },
    );
    expect([bounded.completion, bounded.perfection]).toEqual([
      bandThreshold(100, 8),
      bandThreshold(100, 3),
    ]);
  });

  it('keeps meaningful work and progress value after the baseline tier is banked', () => {
    const state = new CraftingState({
      completion: 100,
      perfection: 100,
      stability: 60,
      qi: 1000,
    });
    const advanced = state.copy({ completion: 120, perfection: 120 });
    const score = (candidate: CraftingState) =>
      __testing.scoreState(
        candidate,
        100,
        100,
        false,
        2,
        false,
        1000,
        1000,
        undefined,
        0,
        true,
        8,
        8,
      );
    expect(score(advanced)).toBeGreaterThan(score(state));
  });

  it('terminal scoring recognizes selected-goal shortfall beyond baseline success', () => {
    const terminal = new CraftingState({
      completion: 100,
      perfection: 100,
      stability: 0,
    });
    const ended = __testing.scoreFinishedOutcome(
      terminal,
      100,
      100,
      false,
      2,
      1000,
      1000,
      undefined,
      0,
      true,
      8,
      8,
    );
    const baselineOnly = __testing.scoreFinishedOutcome(
      terminal,
      100,
      100,
      false,
      2,
      1000,
      1000,
      undefined,
      0,
      false,
      0,
      0,
    );
    expect(ended).toBeLessThan(baselineOnly);
    expect(
      classifyOutcome(terminal, resolvePlanningGoals(caps, 100, 100).bands)
        .tier,
    ).toBe('perfect');
  });
});
