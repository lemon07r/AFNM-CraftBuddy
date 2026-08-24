import { computeMaxStepsBoost } from '../modContent/qualityCap';

/**
 * 0.7.9 quality-cap boosts.
 *
 * The reworked Purifying Flame grants a per-realm `Purity` buff whose
 * `bonusMaximumQuality` lifts the achievable cap by threshold steps. The game
 * sums those with `getMaxStepsBoost(entity.buffs)` and threads the total into
 * `getMaxCompletion`/`getMaxPerfection`; if CraftBuddy reports a different
 * boost it plans the craft against the wrong ceiling.
 *
 * The runtime fold these tests pin down:
 *
 *   for (n of e.buffs) if (n.bonusMaximumQuality)
 *     t += Math.floor(Hl({ ...n.bonusMaximumQuality, eqn: undefined },
 *                        { ...e.stats, stacks: 1 }, 1));
 *
 * Note `stacks` is pinned to 1 and `eqn` is stripped.
 */
describe('computeMaxStepsBoost', () => {
  it('returns 0 when nothing raises the cap, reproducing the pre-0.7.9 call', () => {
    expect(computeMaxStepsBoost(undefined)).toBe(0);
    expect(computeMaxStepsBoost(null)).toBe(0);
    expect(computeMaxStepsBoost([])).toBe(0);
    expect(computeMaxStepsBoost('not-an-array')).toBe(0);
    expect(computeMaxStepsBoost({})).toBe(0);
    expect(
      computeMaxStepsBoost([{ name: 'Insight', stacks: 4 }, { name: 'Focus' }]),
    ).toBe(0);
  });

  it('reads the Purity buff granted by Purifying Flame at and above pillarCreation', () => {
    // Runtime: bonusMaximumQuality is 2 for realms >= pillarCreation, else 1.
    const purityPillarCreation = {
      name: 'Purity (V)',
      canStack: false,
      effects: [],
      stacks: 1,
      displayLocation: 'none',
      bonusMaximumQuality: { value: 2, stat: undefined },
      realm: 'pillarCreation',
    };

    expect(computeMaxStepsBoost([purityPillarCreation])).toBe(2);
  });

  it('reads the lower-realm Purity buff as a single step', () => {
    const purityCoreFormation = {
      name: 'Purity (IV)',
      bonusMaximumQuality: { value: 1, stat: undefined },
      realm: 'coreFormation',
    };

    expect(computeMaxStepsBoost([purityCoreFormation])).toBe(1);
  });

  it('sums every cap-raising buff held at once', () => {
    expect(
      computeMaxStepsBoost([
        { name: 'Purity (V)', bonusMaximumQuality: { value: 2 } },
        { name: 'Insight', stacks: 6 },
        { name: 'Some Other Lens', bonusMaximumQuality: { value: 1 } },
      ]),
    ).toBe(3);
  });

  it('unwraps the { buff, stacks } shape our extraction layer can produce', () => {
    expect(
      computeMaxStepsBoost([
        {
          buff: { name: 'Purity (V)', bonusMaximumQuality: { value: 2 } },
          stacks: 1,
        },
      ]),
    ).toBe(2);
  });

  it('pins stacks to 1, so a stacks-scaled bonus is never multiplied by the held count', () => {
    // The runtime evaluates with `{ ...stats, stacks: 1 }`, so five stacks of a
    // value-1 bonus is still one step. Multiplying by the held count here would
    // over-predict the cap and make CraftBuddy plan past the game's ceiling.
    const stacking = {
      name: 'Stacking Lens',
      bonusMaximumQuality: { value: 1, scaling: 'stacks' },
      stacks: 5,
    };

    expect(computeMaxStepsBoost([stacking])).toBe(1);
  });

  it('ignores a held stack count entirely for an unscaled bonus', () => {
    expect(
      computeMaxStepsBoost([
        { name: 'Flat Lens', bonusMaximumQuality: { value: 1 }, stacks: 3 },
      ]),
    ).toBe(1);
  });

  it('strips eqn before evaluating, matching the runtime', () => {
    // With the eqn applied this would be 2 * 10 = 20 steps; the runtime drops it.
    expect(
      computeMaxStepsBoost([
        {
          name: 'Equation Lens',
          bonusMaximumQuality: { value: 2, eqn: '10' },
        },
      ]),
    ).toBe(2);
  });

  it('scales off a stat when the bonus asks for one', () => {
    expect(
      computeMaxStepsBoost(
        [
          {
            name: 'Control Lens',
            bonusMaximumQuality: { value: 0.02, stat: 'control' },
          },
        ],
        { control: 150 },
      ),
    ).toBe(3);
  });

  it('never lets a stat bag override the pinned stacks variable', () => {
    expect(
      computeMaxStepsBoost(
        [
          {
            name: 'Stacking Lens',
            bonusMaximumQuality: { value: 2, scaling: 'stacks' },
          },
        ],
        { stacks: 9 },
      ),
    ).toBe(2);
  });

  it('floors each buff separately so fractions never accumulate a phantom step', () => {
    // Two 0.5 contributions must stay 0 steps, not round up to 1.
    expect(
      computeMaxStepsBoost([
        { name: 'Half A', bonusMaximumQuality: { value: 0.5 } },
        { name: 'Half B', bonusMaximumQuality: { value: 0.5 } },
      ]),
    ).toBe(0);

    expect(
      computeMaxStepsBoost([
        { name: 'One And A Half', bonusMaximumQuality: { value: 1.5 } },
      ]),
    ).toBe(1);
  });

  it('subtracts a negative contribution the way the runtime does', () => {
    // The runtime sums floor(value) without a positivity filter and lets the
    // cap getter clamp the resulting step count.
    expect(
      computeMaxStepsBoost([
        { name: 'Purity (V)', bonusMaximumQuality: { value: 2 } },
        { name: 'Dulling Lens', bonusMaximumQuality: { value: -1 } },
      ]),
    ).toBe(1);
  });

  it('skips entries with no usable bonus payload', () => {
    expect(
      computeMaxStepsBoost([
        { name: 'Missing value', bonusMaximumQuality: {} },
        { name: 'Not an object', bonusMaximumQuality: 5 },
        { name: 'Null bonus', bonusMaximumQuality: null },
        null,
        undefined,
        { name: 'Valid', bonusMaximumQuality: { value: 2 } },
      ]),
    ).toBe(2);
  });
});
