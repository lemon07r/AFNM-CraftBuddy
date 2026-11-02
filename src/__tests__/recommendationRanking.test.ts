import {
  __testing,
  recomputeQualityRatings,
  type SkillRecommendation,
} from '../optimizer/search';
import { BuffType } from '../optimizer/state';

function candidate(
  key: string,
  score: number,
  type: 'fusion' | 'refine' = 'fusion',
  unsafe = false,
): SkillRecommendation {
  return {
    skill: {
      key,
      name: key,
      type,
      qiCost: 0,
      stabilityCost: 10,
      baseCompletionGain: 1,
      basePerfectionGain: 0,
      stabilityGain: 0,
      maxStabilityChange: 0,
      buffType: BuffType.NONE,
      buffDuration: 0,
      buffMultiplier: 1,
    },
    expectedGains: { completion: 1, perfection: 0, stability: 0 },
    immediateGains: { completion: 1, perfection: 0, stability: 0 },
    effectiveCosts: { qi: 0, stability: 10 },
    score,
    reasoning: '',
    requiresProbabilisticSurvival: unsafe,
  };
}

describe('alternative diversity safety boundaries', () => {
  it.each([49.5, 1000])(
    'keeps an unsafe diverse candidate behind every safe line at score %s',
    (score) => {
      const candidates = [
        candidate('primary', 50),
        candidate('safe', 49),
        candidate('unsafe', score, 'refine', true),
      ];
      const ranked = __testing.rankRecommendations(
        candidates,
        0,
        new Set(['unsafe']),
      );
      expect(ranked.map((rec) => rec.skill.key)).toEqual([
        'primary',
        'safe',
        'unsafe',
      ]);
    },
  );

  it('uses numeric extrema for the same quality ratings in direct and merged order', () => {
    const candidates = [
      candidate('safe', 50),
      candidate('low', 49),
      candidate('unsafe', 1000, 'refine', true),
    ];
    const ranked = __testing.rankRecommendations(
      candidates,
      0,
      new Set(['unsafe']),
    );
    const mergedOrder = [...ranked]
      .reverse()
      .map((rec) => ({ ...rec, qualityRating: undefined }));
    recomputeQualityRatings(mergedOrder);
    for (const rec of ranked) {
      expect(rec.qualityRating).toBe(
        mergedOrder.find((other) => other.skill.key === rec.skill.key)
          ?.qualityRating,
      );
      expect(rec.qualityRating).toBeGreaterThanOrEqual(0);
      expect(rec.qualityRating).toBeLessThanOrEqual(100);
    }
    expect(
      ranked.find((rec) => rec.skill.key === 'unsafe')?.qualityRating,
    ).toBe(100);
    expect(ranked.find((rec) => rec.skill.key === 'low')?.qualityRating).toBe(
      0,
    );
  });
});
