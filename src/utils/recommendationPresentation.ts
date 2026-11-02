import {
  techniqueDisplayName,
  type SearchResult,
  type SkillRecommendation,
} from '../optimizer';
import type { OutcomeSummary } from './outcomeSummary';

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

export function currentOutcomeCopy(summary: OutcomeSummary | null): {
  headline: string;
  detail: string;
} {
  if (!summary)
    return {
      headline: 'Current outcome unavailable',
      detail:
        'This saved result has no outcome summary. Check the game’s bars.',
    };
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
