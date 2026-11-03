import type { CandidateTieBreakMetrics, SkillRecommendation } from './types';

import { SCORING } from './scoring';

import { orderRecommendationsBySafety } from './safety';

export { computeScoreTieWindow, compareTieBreakMetrics, rankRecommendations };

const DIVERSITY_TIEBREAK_SCORE_WINDOW = 1;

function compareTieBreakMetrics(
  a: CandidateTieBreakMetrics,
  b: CandidateTieBreakMetrics,
): number {
  const progressDiff = a.immediateProgress - b.immediateProgress;
  if (progressDiff !== 0) {
    return progressDiff;
  }

  if (a.isStabilize !== b.isStabilize) {
    return a.isStabilize ? -1 : 1;
  }

  if (a.requiresProbabilisticSurvival !== b.requiresProbabilisticSurvival) {
    return a.requiresProbabilisticSurvival ? -1 : 1;
  }

  if (a.qiSpent !== b.qiSpent) {
    return b.qiSpent - a.qiSpent;
  }

  return b.skillKey.localeCompare(a.skillKey);
}

function computeScoreTieWindow(totalTargetMagnitude: number): number {
  // Treat sub-resource-tiebreak differences as effectively equal so tiny
  // floating-point noise does not flip move choices.
  return Math.max(1e-6, totalTargetMagnitude * SCORING.RESOURCE_TIEBREAKER * 2);
}

/** Candidate-set-relative score coordinates, not outcome probabilities. */
export function recomputeQualityRatings(
  candidates: SkillRecommendation[],
): void {
  if (candidates.length === 0) return;
  const best = Math.max(...candidates.map((candidate) => candidate.score));
  const worst = Math.min(...candidates.map((candidate) => candidate.score));
  const range = best - worst;
  for (const candidate of candidates) {
    candidate.qualityRating =
      range > 0 ? Math.round(((candidate.score - worst) / range) * 100) : 100;
  }
}

function rankRecommendations(
  scored: SkillRecommendation[],
  scoreTieWindow: number = 0,
  unsafeKeys: ReadonlySet<string> = new Set(),
  tieBreaker?: (a: SkillRecommendation, b: SkillRecommendation) => number,
): SkillRecommendation[] {
  recomputeQualityRatings(scored);
  for (const recommendation of scored) {
    if (unsafeKeys.has(recommendation.skill.key)) {
      recommendation.yieldsToSafeAlternative = true;
    }
  }
  if (scored.length <= 1) {
    return scored;
  }

  const compareByScore = (
    a: SkillRecommendation,
    b: SkillRecommendation,
  ): number => {
    const scoreDiff = b.score - a.score;
    if (Math.abs(scoreDiff) > scoreTieWindow) {
      return scoreDiff;
    }

    if (tieBreaker) {
      const tieDiff = tieBreaker(a, b);
      if (tieDiff !== 0) {
        return tieDiff > 0 ? -1 : 1;
      }
    } else {
      const aProgress =
        Math.max(0, a.immediateGains.completion) +
        Math.max(0, a.immediateGains.perfection);
      const bProgress =
        Math.max(0, b.immediateGains.completion) +
        Math.max(0, b.immediateGains.perfection);
      const progressDiff = bProgress - aProgress;
      if (progressDiff !== 0) {
        return progressDiff;
      }
    }

    return a.skill.key.localeCompare(b.skill.key);
  };
  const sorted = orderRecommendationsBySafety(
    scored,
    compareByScore,
    (recommendation) => unsafeKeys.has(recommendation.skill.key),
  );
  if (sorted.length <= 2) {
    return sorted;
  }

  const result: SkillRecommendation[] = [sorted[0]];
  const remaining = sorted.slice(1);
  const usedTypes = new Set<string>([sorted[0].skill.type]);

  const safetyGroup = (candidate: SkillRecommendation): boolean =>
    unsafeKeys.has(candidate.skill.key) ||
    candidate.requiresProbabilisticSurvival === true ||
    candidate.yieldsToSafeAlternative === true ||
    candidate.endsCraftBelowTarget === true;
  while (remaining.length > 0) {
    const topScore = remaining[0].score;
    const topSafetyGroup = safetyGroup(remaining[0]);
    const tieGroupEnd = remaining.findIndex(
      (candidate) =>
        safetyGroup(candidate) !== topSafetyGroup ||
        Math.abs(topScore - candidate.score) > DIVERSITY_TIEBREAK_SCORE_WINDOW,
    );
    const tieGroupLength = tieGroupEnd === -1 ? remaining.length : tieGroupEnd;
    const diverseIndex = remaining
      .slice(0, tieGroupLength)
      .findIndex((candidate) => !usedTypes.has(candidate.skill.type));
    const pickIndex = diverseIndex >= 0 ? diverseIndex : 0;
    const [next] = remaining.splice(pickIndex, 1);
    result.push(next);
    usedTypes.add(next.skill.type);
  }

  return result;
}
