import { CraftingState } from '../optimizer/state';
import { __testing } from '../optimizer/search';

describe('effective goal work', () => {
  const scoreLive = (state: CraftingState) =>
    __testing.scoreState(state, 100, 100, false, 2, false, 1000, 1000,
      undefined, 0, false, 3);
  const scoreResolved = (state: CraftingState) =>
    __testing.scoreFinishedOutcome(state, 100, 100, false, 2, 1000, 1000,
      undefined, 0, false, 3);

  it('values a perfection buff while requested ambition remains after securing the tier', () => {
    const state = new CraftingState({ completion: 100, perfection: 100,
      qi: 100, stability: 100, initialMaxStability: 100 });
    const buffed = new CraftingState({ ...state, controlBuffTurns: 3,
      controlBuffMultiplier: 1.4 });
    expect(scoreLive(buffed)).toBeGreaterThan(scoreLive(state));
  });

  it('charges permanent effective-goal shortfall without changing the secured tier', () => {
    const state = new CraftingState({ completion: 100, perfection: 100,
      qi: 100, stability: 0, initialMaxStability: 100 });
    const further = new CraftingState({ ...state, perfection: 150 });
    expect(scoreResolved(further) - scoreResolved(state)).toBeCloseTo(
      50 * __testing.SCORING.FINISHED_UNMET_PENALTY_WEIGHT, 8);
  });
});
