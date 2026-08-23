/**
 * Conjunctive outcome evaluation tests (AFNM 0.7.6).
 *
 * Numbers are derived from the runtime band helpers:
 *   qIa = 1.3
 *   hH(value, target): repeatedly subtract band widths that grow by qIa
 *   tier: a===0 -> failed; a>1 && o>1 && sublimeItem -> sublime; o>0 -> perfect; else basic
 */

import {
  BAND_GROWTH_RATIO,
  OVERCRAFT_REFUND_MAX_BANDS,
  TIER_REQUIREMENTS,
  bandThreshold,
  buildOutcomeBands,
  classifyOutcome,
  computeOvercraftExtras,
  deriveOutcomeBands,
  tierForBands,
  tierRank,
  willAutoFinish,
} from '../optimizer/outcome';
import { DEFAULT_CONFIG, type OptimizerConfig } from '../optimizer/skills';

const sublimeConfig: OptimizerConfig = {
  ...DEFAULT_CONFIG,
  isSublimeCraft: true,
  targetCompletion: 100,
  targetPerfection: 100,
  maxCompletion: 230,
  maxPerfection: 230,
};

const normalConfig: OptimizerConfig = {
  ...DEFAULT_CONFIG,
  isSublimeCraft: false,
  targetCompletion: 100,
  targetPerfection: 100,
  maxCompletion: 100,
  maxPerfection: 100,
};

describe('band arithmetic', () => {
  it('matches the runtime growth ratio', () => {
    expect(BAND_GROWTH_RATIO).toBe(1.3);
  });

  it('compounds band widths with a floor at each step', () => {
    // widths: 100, floor(130) = 130, floor(169) = 169
    expect(bandThreshold(100, 1)).toBe(100);
    expect(bandThreshold(100, 2)).toBe(230);
    expect(bandThreshold(100, 3)).toBe(399);
  });

  it('floors each successive width, not just the total', () => {
    // widths: 7, floor(9.1) = 9, floor(11.7) = 11
    expect(bandThreshold(7, 1)).toBe(7);
    expect(bandThreshold(7, 2)).toBe(16);
    expect(bandThreshold(7, 3)).toBe(27);
  });

  it('degrades safely for empty requirements', () => {
    expect(bandThreshold(100, 0)).toBe(0);
    expect(bandThreshold(0, 3)).toBe(0);
    expect(bandThreshold(Number.NaN, 3)).toBe(0);
  });
});

describe('tier requirements', () => {
  it('encodes the runtime comparisons', () => {
    expect(TIER_REQUIREMENTS.basic).toEqual({ completion: 1, perfection: 0 });
    expect(TIER_REQUIREMENTS.perfect).toEqual({ completion: 1, perfection: 1 });
    expect(TIER_REQUIREMENTS.sublime).toEqual({
      completion: 2,
      perfection: 2,
    });
  });

  it('orders tiers so they can be compared numerically', () => {
    expect(tierRank('failed')).toBeLessThan(tierRank('basic'));
    expect(tierRank('basic')).toBeLessThan(tierRank('perfect'));
    expect(tierRank('perfect')).toBeLessThan(tierRank('sublime'));
  });
});

describe('tierForBands', () => {
  it('fails with no completion band regardless of perfection', () => {
    expect(tierForBands(0, 5, true)).toBe('failed');
  });

  it('is basic with completion but no perfection', () => {
    expect(tierForBands(1, 0, true)).toBe('basic');
    expect(tierForBands(9, 0, true)).toBe('basic');
  });

  it('is perfect with one band on each bar', () => {
    expect(tierForBands(1, 1, true)).toBe('perfect');
  });

  it('requires two bands on BOTH bars for sublime', () => {
    expect(tierForBands(2, 2, true)).toBe('sublime');
    // One short on perfection: capped at perfect no matter the completion.
    expect(tierForBands(9, 1, true)).toBe('perfect');
    // One short on completion.
    expect(tierForBands(1, 9, true)).toBe('perfect');
  });

  it('never reports sublime when the recipe has no sublime output', () => {
    expect(tierForBands(5, 5, false)).toBe('perfect');
  });
});

describe('deriveOutcomeBands', () => {
  it('targets sublime for sublime crafts and perfect otherwise', () => {
    expect(deriveOutcomeBands(sublimeConfig).targetTier).toBe('sublime');
    expect(deriveOutcomeBands(normalConfig).targetTier).toBe('perfect');
  });

  it('prefers the runtime caps for the auto-finish thresholds', () => {
    const bands = deriveOutcomeBands({
      ...sublimeConfig,
      maxCompletion: 399,
      maxPerfection: 399,
    });
    expect(bands.completionFinishFlat).toBe(399);
    expect(bands.perfectionFinishFlat).toBe(399);
    expect(bands.canOvercraft).toBe(true);
  });

  it('reconstructs thresholds from the tier requirement when caps are absent', () => {
    const bands = deriveOutcomeBands({
      ...sublimeConfig,
      maxCompletion: undefined,
      maxPerfection: undefined,
    });
    // Sublime needs 2 bands: 100 + 130.
    expect(bands.completionFinishFlat).toBe(230);
    expect(bands.perfectionFinishFlat).toBe(230);
    expect(bands.canOvercraft).toBe(false);
  });
});

describe('classifyOutcome', () => {
  const bands = deriveOutcomeBands(sublimeConfig);

  it('reports failed below the first completion band', () => {
    const result = classifyOutcome(
      { completion: 40, perfection: 400, stability: 30 },
      bands,
    );
    expect(result.tier).toBe('failed');
    expect(result.blockingRequirement).toBe('completion');
  });

  it('caps a completion-heavy state below sublime and blames perfection', () => {
    // Completion 900 clears many bands; perfection 150 clears only one
    // (100), leaving it one band short of sublime.
    const result = classifyOutcome(
      { completion: 900, perfection: 150, stability: 30 },
      bands,
    );
    expect(result.completionBands).toBeGreaterThanOrEqual(2);
    expect(result.perfectionBands).toBe(1);
    expect(result.tier).toBe('perfect');
    expect(result.blockingRequirement).toBe('perfection');
    expect(result.completionMargin).toBe(1);
    expect(result.perfectionMargin).toBeLessThan(1);
  });

  it('caps a perfection-heavy state below sublime and blames completion', () => {
    const result = classifyOutcome(
      { completion: 150, perfection: 900, stability: 30 },
      bands,
    );
    expect(result.tier).toBe('perfect');
    expect(result.blockingRequirement).toBe('completion');
    expect(result.perfectionMargin).toBe(1);
  });

  it('credits sublime only once both bars hold two bands', () => {
    const result = classifyOutcome(
      { completion: 230, perfection: 230, stability: 30 },
      bands,
    );
    expect(result.completionBands).toBe(2);
    expect(result.perfectionBands).toBe(2);
    expect(result.tier).toBe('sublime');
    expect(result.blockingRequirement).toBe('none');
    expect(result.completionMargin).toBe(1);
    expect(result.perfectionMargin).toBe(1);
  });

  it('reports the raw points still needed for the target tier', () => {
    const result = classifyOutcome(
      { completion: 200, perfection: 0, stability: 30 },
      bands,
    );
    expect(result.completionShortfall).toBe(30);
    expect(result.perfectionShortfall).toBe(230);
  });

  it('separates the guaranteed tier from the optimistic one', () => {
    // Completion 229 is one point short of its second band, so the bonus roll
    // can still deliver it.
    const result = classifyOutcome(
      { completion: 229, perfection: 230, stability: 30 },
      bands,
    );
    expect(result.completionBands).toBe(1);
    expect(result.completionBonusChance).toBeGreaterThan(0);
    expect(result.tier).toBe('perfect');
    expect(result.optimisticTier).toBe('sublime');
  });

  it('never reports sublime for a non-sublime craft', () => {
    const result = classifyOutcome(
      { completion: 900, perfection: 900, stability: 30 },
      deriveOutcomeBands(normalConfig),
    );
    expect(result.tier).toBe('perfect');
    expect(result.blockingRequirement).toBe('none');
  });
});

describe('willAutoFinish', () => {
  const bands = deriveOutcomeBands({
    ...sublimeConfig,
    maxCompletion: 399,
    maxPerfection: 399,
  });

  it('finishes when stability runs out', () => {
    expect(
      willAutoFinish({ completion: 0, perfection: 0, stability: 0 }, bands),
    ).toBe(true);
  });

  it('finishes when both bars reach their flat thresholds', () => {
    expect(
      willAutoFinish(
        { completion: 399, perfection: 399, stability: 50 },
        bands,
      ),
    ).toBe(true);
  });

  it('does not finish while perfection is short, however high completion is', () => {
    expect(
      willAutoFinish(
        { completion: 5000, perfection: 398, stability: 50 },
        bands,
      ),
    ).toBe(false);
  });

  it('finishes via the overcraft branch at five completion bands', () => {
    // A deep overcraft cap, so the plain completion >= flat branch cannot fire
    // before the five-band branch does.
    const deepBands = deriveOutcomeBands({
      ...sublimeConfig,
      maxCompletion: 2000,
      maxPerfection: 399,
    });
    expect(deepBands.canOvercraft).toBe(true);

    // 5 bands of a 100-wide bar: 100+130+169+219+284 = 902.
    expect(bandThreshold(100, 5)).toBe(902);
    expect(
      willAutoFinish(
        { completion: 902, perfection: 399, stability: 50 },
        deepBands,
      ),
    ).toBe(true);
    // 901 is only four bands, so the craft keeps going.
    expect(
      willAutoFinish(
        { completion: 901, perfection: 399, stability: 50 },
        deepBands,
      ),
    ).toBe(false);
  });

  it('is surfaced on the classification', () => {
    expect(
      classifyOutcome(
        { completion: 399, perfection: 399, stability: 50 },
        bands,
      ).willAutoFinish,
    ).toBe(true);
  });
});

describe('computeOvercraftExtras', () => {
  // Deep overcraft caps: 11 bands of width 100 per bar.
  const overcraftBands = deriveOutcomeBands({
    ...sublimeConfig,
    maxCompletion: bandThreshold(100, 11),
    maxPerfection: bandThreshold(100, 11),
  });

  it('returns zero while the target tier is not secured', () => {
    // 5 perfection bands but completion one band short of the 2-band gate.
    const outcome = classifyOutcome(
      { completion: 230 - 1, perfection: 902, stability: 50 },
      overcraftBands,
    );
    expect(
      computeOvercraftExtras(outcome, overcraftBands, {
        fractional: true,
      }),
    ).toEqual({ completionBands: 0, perfectionBands: 0 });
  });

  it('counts extra bands unilaterally once the tier is secured', () => {
    const outcome = classifyOutcome(
      { completion: 230, perfection: 902, stability: 50 },
      overcraftBands,
    );
    const extras = computeOvercraftExtras(outcome, overcraftBands, {
      fractional: false,
    });
    expect(extras.perfectionBands).toBe(3); // 5 guaranteed - 2 required
    expect(extras.completionBands).toBe(0);
  });

  it('adds the bonus-roll fraction for live (fractional) scoring only', () => {
    // 230 + 65 into the third band (width 169): guaranteed 2, bonusChance 65/169.
    const outcome = classifyOutcome(
      { completion: 230, perfection: 230 + 65, stability: 50 },
      overcraftBands,
    );
    expect(outcome.perfectionBonusChance).toBeCloseTo(65 / 169, 5);
    expect(
      computeOvercraftExtras(outcome, overcraftBands, { fractional: true })
        .perfectionBands,
    ).toBeCloseTo(65 / 169, 5);
    expect(
      computeOvercraftExtras(outcome, overcraftBands, { fractional: false })
        .perfectionBands,
    ).toBe(0);
  });

  it('caps completion extras at the 80% refund ceiling', () => {
    const outcome = classifyOutcome(
      { completion: bandThreshold(100, 8), perfection: 230, stability: 50 },
      overcraftBands,
    );
    expect(outcome.completionBands).toBe(8);
    const extras = computeOvercraftExtras(outcome, overcraftBands, {
      fractional: false,
    });
    // Refund pays (bands - 1) * 20% capped at 80%: only 3 of the 6 extras pay.
    expect(extras.completionBands).toBe(OVERCRAFT_REFUND_MAX_BANDS - 2);
  });

  it('pays no completion extras for non-sublime crafts (no refund exists)', () => {
    const perfectBands = deriveOutcomeBands({
      ...normalConfig,
      maxCompletion: bandThreshold(100, 11),
      maxPerfection: bandThreshold(100, 11),
    });
    const outcome = classifyOutcome(
      { completion: 902, perfection: 902, stability: 50 },
      perfectBands,
    );
    const extras = computeOvercraftExtras(outcome, perfectBands, {
      fractional: false,
    });
    expect(extras.completionBands).toBe(0);
    // Perfect results still scale stacks per extra perfection band.
    expect(extras.perfectionBands).toBe(4); // 5 guaranteed - 1 required
  });

  it('bounds perfection extras at the game cap band count', () => {
    const shallowCapBands = deriveOutcomeBands({
      ...sublimeConfig,
      maxCompletion: bandThreshold(100, 4),
      maxPerfection: bandThreshold(100, 4),
    });
    // Bars cannot exceed the cap, but a stale/extracted state may claim more;
    // credit is bounded at the cap's band count regardless.
    const outcome = classifyOutcome(
      { completion: 230, perfection: bandThreshold(100, 6), stability: 50 },
      shallowCapBands,
    );
    const extras = computeOvercraftExtras(outcome, shallowCapBands, {
      fractional: false,
    });
    expect(extras.perfectionBands).toBe(4 - 2);
  });
});

/**
 * Ambition settings (user-facing): `perfectionBandGoal` is a search goal and
 * lives in `search.ts`; the completion ceiling is an extras bound and belongs
 * here, in the single outcome authority.
 */
describe('ambition band settings', () => {
  const DEEP_CAP = bandThreshold(100, 8);
  const FIVE_BANDS = bandThreshold(100, 5); // 902

  function ambitiousBands(completionBandCeiling: number) {
    return buildOutcomeBands({
      targetCompletion: 100,
      targetPerfection: 100,
      isSublimeCraft: true,
      maxCompletionCap: DEEP_CAP,
      maxPerfectionCap: DEEP_CAP,
      completionBandCeiling,
    });
  }

  function extrasAt(completionBandCeiling: number) {
    const bands = ambitiousBands(completionBandCeiling);
    const outcome = classifyOutcome(
      { completion: FIVE_BANDS, perfection: FIVE_BANDS, stability: 50 },
      bands,
    );
    return {
      outcome,
      extras: computeOvercraftExtras(outcome, bands, { fractional: false }),
    };
  }

  it('treats 0 as auto and leaves overcraft extras untouched', () => {
    const auto = extrasAt(0);
    // Sublime needs 2 completion bands and the refund stops paying past 5.
    expect(auto.extras.completionBands).toBe(OVERCRAFT_REFUND_MAX_BANDS - 2);
    expect(auto.extras.perfectionBands).toBe(5 - 2);

    const absent = buildOutcomeBands({
      targetCompletion: 100,
      targetPerfection: 100,
      isSublimeCraft: true,
      maxCompletionCap: DEEP_CAP,
      maxPerfectionCap: DEEP_CAP,
    });
    expect(absent.ambitionCompletionCeilingBands).toBeUndefined();
    expect(absent.ambitionPerfectionBands).toBeUndefined();
  });

  it('clamps overcraft completion extras at the requested ceiling', () => {
    const capped = extrasAt(3);
    expect(capped.extras.completionBands).toBe(3 - 2);
    // Perfection is deliberately left uncapped - "more stars" is the point.
    expect(capped.extras.perfectionBands).toBe(5 - 2);
  });

  it('keeps the target tier reachable when the ceiling is below its requirement', () => {
    const under = extrasAt(1);
    expect(under.outcome.tier).toBe('sublime');
    // Never negative, and the tier requirement itself is never clamped away.
    expect(under.extras.completionBands).toBe(0);
    expect(under.extras.perfectionBands).toBe(5 - 2);
  });

  it('normalizes non-finite and negative ambition values to auto', () => {
    const bands = buildOutcomeBands({
      targetCompletion: 100,
      targetPerfection: 100,
      isSublimeCraft: true,
      perfectionBandGoal: Number.NaN,
      completionBandCeiling: -4,
    });
    expect(bands.ambitionPerfectionBands).toBeUndefined();
    expect(bands.ambitionCompletionCeilingBands).toBeUndefined();
  });
});
