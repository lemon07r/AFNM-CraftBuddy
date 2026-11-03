import {
  techniqueDisplayName,
  type SearchResult,
  type SkillRecommendation,
} from '../optimizer';
import type { OutcomeSummary } from './outcomeSummary';
import { formatLargeNumber } from './largeNumbers';
import { DEFAULT_SETTINGS, type CraftBuddySettings } from '../settings';

const GAIN_KEYS = ['completion', 'perfection', 'stability'] as const;

export function gainsLabel(
  gains: SkillRecommendation['immediateGains'],
  emptyLabel = 'Prepares the next turn',
): string {
  return (
    GAIN_KEYS.filter((key) => gains[key] !== 0)
      .map(
        (key) =>
          `${gains[key] > 0 ? '+' : ''}${formatLargeNumber(gains[key], 1)} ${key}`,
      )
      .join(' · ') || emptyLabel
  );
}

export function expectedGainsLabel(
  rec: Pick<SkillRecommendation, 'immediateGains' | 'expectedGains'>,
): string | null {
  return GAIN_KEYS.some(
    (key) => rec.expectedGains[key] !== rec.immediateGains[key],
  )
    ? `Expected: ${gainsLabel(rec.expectedGains, 'no gains')}`
    : null;
}

export function recommendationGainsCopy(
  rec: Pick<SkillRecommendation, 'immediateGains' | 'expectedGains'>,
): { primary: string; secondary: string | null } {
  const expected = expectedGainsLabel(rec);
  if (GAIN_KEYS.every((key) => rec.immediateGains[key] === 0) && expected) {
    return { primary: expected, secondary: null };
  }
  return { primary: gainsLabel(rec.immediateGains), secondary: expected };
}

export interface LegacyOutcomeProgress {
  currentCompletion?: number;
  currentPerfection?: number;
  targetCompletion?: number;
  targetPerfection?: number;
}

export function isPlayableRecommendation(rec: SkillRecommendation): boolean {
  return isPlayableAction(rec.skill);
}

export function isPlayableAction(action: { actionKind?: string }): boolean {
  return action.actionKind !== 'finish';
}

export function relativeChoiceLabel(rating: number | undefined): string {
  if (rating === undefined) return 'Other choice';
  if (rating >= 90) return 'Close alternative';
  if (rating >= 70) return 'Promising alternative';
  if (rating >= 50) return 'Less promising';
  return 'Lower-ranked choice';
}

export function currentOutcomeCopy(
  summary: OutcomeSummary | null,
  legacy: LegacyOutcomeProgress = {},
): {
  headline: string;
  detail: string;
} {
  if (!summary) {
    const bars = [
      ['Completion', legacy.currentCompletion, legacy.targetCompletion],
      ['Perfection', legacy.currentPerfection, legacy.targetPerfection],
    ] as const;
    const progress = bars
      .flatMap(([label, current, target]) =>
        current === undefined || target === undefined
          ? []
          : [
              `${label} ${formatLargeNumber(current, 1)} / ${formatLargeNumber(target, 1)}`,
            ],
      )
      .join(' · ');
    return {
      headline: progress || 'Current outcome unavailable',
      detail: progress
        ? 'Current progress against the recipe targets; no outcome tier is available in this saved result.'
        : 'This saved result has no outcome summary. Check the game’s bars.',
    };
  }
  const standing =
    summary.tier === 'failed'
      ? 'No outcome secured'
      : `${summary.tierLabel} secured`;
  const headline = summary.onTarget
    ? standing
    : `${standing} · aiming for ${summary.targetTierLabel}`;
  const short = summary.bars.filter((bar) => !bar.satisfied);
  const detail = summary.autoFinish.active
    ? 'The game resolves this craft automatically; no further bands can be added.'
    : short.length
      ? `${short.map((bar) => `${bar.label}: ${bar.bandsLabel}${bar.nextBandLabel ? `, ${bar.nextBandLabel}` : ''}`).join('; ')}.`
      : 'Both bars meet the target tier; extra bands can still improve the result.';
  return { headline, detail };
}

export function rotationDisplayNames(result: SearchResult): string[] {
  const known = [result.recommendation, ...result.alternativeSkills].filter(
    (rec): rec is SkillRecommendation => rec !== null,
  );
  return (result.optimalRotationLabels ?? result.optimalRotation ?? [])
    .filter((name) => name !== 'Finish Craft')
    .map((name) => {
      const skill = known.find((rec) => rec.skill.name === name)?.skill;
      return skill
        ? techniqueDisplayName(skill)
        : techniqueDisplayName({ name });
    });
}

export function planDisplayContent(
  result: SearchResult,
  settings: Pick<
    CraftBuddySettings,
    'showOptimalRotation' | 'showExpectedFinalState' | 'maxRotationDisplay'
  > = DEFAULT_SETTINGS,
): {
  rotation: string[];
  followUp: string | null;
  final: SearchResult['expectedFinalState'];
} {
  const showSteps =
    settings.showOptimalRotation && settings.maxRotationDisplay > 0;
  const rotation = showSteps
    ? rotationDisplayNames(result).slice(0, settings.maxRotationDisplay)
    : [];
  const followUp = result.recommendation?.followUpSkill;
  return {
    rotation,
    followUp:
      showSteps &&
      rotation.length === 0 &&
      followUp &&
      isPlayableAction(followUp)
        ? techniqueDisplayName(followUp)
        : null,
    final: settings.showExpectedFinalState
      ? result.expectedFinalState
      : undefined,
  };
}

export function displayedAlternatives(
  result: SearchResult,
  maxAlternatives = DEFAULT_SETTINGS.maxAlternatives,
): SkillRecommendation[] {
  return result.alternativeSkills
    .filter(isPlayableRecommendation)
    .slice(0, maxAlternatives);
}
