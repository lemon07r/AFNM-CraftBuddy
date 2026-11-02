import {
  DEFAULT_SKILLS,
  type OutcomeProjection,
  type SearchResult,
  type SkillRecommendation,
} from '../optimizer';
import { buildOutcomeSummary } from '../utils/outcomeSummary';
import {
  currentOutcomeCopy,
  isPlayableRecommendation,
  isPlayableAction,
  relativeChoiceLabel,
  rotationDisplayNames,
} from '../utils/recommendationPresentation';

const recommendation: SkillRecommendation = {
  skill: {
    ...DEFAULT_SKILLS[0],
    name: 'False Fusion',
    displayName: 'Strive for Completion',
  },
  expectedGains: { completion: 20, perfection: 0, stability: 0 },
  immediateGains: { completion: 20, perfection: 0, stability: 0 },
  effectiveCosts: { qi: 10, stability: 10 },
  score: 10,
  reasoning: 'Build completion',
};
const projection: OutcomeProjection = {
  tier: 'perfect',
  optimisticTier: 'sublime',
  targetTier: 'sublime',
  completion: {
    value: 260,
    bands: 2,
    requiredBands: 2,
    nextThreshold: 399,
    pointsToNextBand: 139,
    bonusChance: 0,
  },
  perfection: {
    value: 118,
    bands: 1,
    requiredBands: 2,
    nextThreshold: 230,
    pointsToNextBand: 112,
    bonusChance: 0.42,
  },
  bindingBar: 'perfection',
  willAutoFinish: false,
};
const result: SearchResult = {
  recommendation,
  alternativeSkills: [],
  isTerminal: false,
  targetsMet: false,
  status: 'live',
  outcomeProjection: projection,
};

describe('playable recommendations', () => {
  it('does not offer old synthetic finish recommendations', () => {
    expect(isPlayableRecommendation(recommendation)).toBe(true);
    // Legacy replays still contain this value after the search type removes it.
    const legacy = {
      ...recommendation,
      skill: { ...recommendation.skill, actionKind: 'finish' },
    } as unknown as SkillRecommendation;
    expect(isPlayableRecommendation(legacy)).toBe(false);
    expect(isPlayableAction({ actionKind: 'finish' })).toBe(false);
    expect(isPlayableAction({ actionKind: 'item' })).toBe(true);
  });
});

describe('current standing, not a forecast', () => {
  it('shows the secured tier and only the bars that are short', () => {
    const copy = currentOutcomeCopy(buildOutcomeSummary({ projection }));
    expect(copy.headline).toBe('Perfect secured · aiming for Sublime');
    expect(copy.detail).toBe('Perfection: 1 / 2 bands, +112 to band 2.');
    expect(copy.detail).not.toContain('Completion');
    expect(copy.headline).not.toMatch(/on track|planned/i);
  });
  it('does not call a failed outcome secured', () => {
    expect(
      currentOutcomeCopy(
        buildOutcomeSummary({ projection: { ...projection, tier: 'failed' } }),
      ).headline,
    ).toBe('No outcome secured · aiming for Sublime');
  });
  it('renders old results without inventing an outcome', () => {
    expect(currentOutcomeCopy(null)).toEqual({
      headline: 'Current outcome unavailable',
      detail:
        'This saved result has no outcome summary. Check the game’s bars.',
    });
  });
  it('labels the target secured without implying it ends the craft', () => {
    const met = {
      ...projection,
      tier: 'sublime' as const,
      perfection: { ...projection.perfection, bands: 2 },
      bindingBar: 'none' as const,
    };
    const copy = currentOutcomeCopy(buildOutcomeSummary({ projection: met }));
    expect(copy.headline).toBe('Sublime secured');
    expect(copy.detail).toContain('extra bands can still improve');
  });
  it('does not promise more bands after automatic resolution', () => {
    const copy = currentOutcomeCopy(
      buildOutcomeSummary({
        projection: { ...projection, willAutoFinish: true },
      }),
    );
    expect(copy.detail).toBe(
      'The game resolves this craft automatically; no further bands can be added.',
    );
  });
});

describe('action labels', () => {
  it.each([undefined, 0, 35, 50, 70, 90, 100])(
    'never renders candidate rating %s as a percentage or a probability',
    (rating) => {
      expect(relativeChoiceLabel(rating)).not.toMatch(
        /%|poor|chance|probability/i,
      );
    },
  );
  it('uses runtime display names for rotation steps and removes legacy finish steps', () => {
    expect(
      rotationDisplayNames({
        ...result,
        optimalRotation: ['False Fusion', 'Finish Craft'],
      }),
    ).toEqual(['Strive for Completion']);
    expect(
      rotationDisplayNames({
        ...result,
        optimalRotation: ['False Fusion'],
        optimalRotationLabels: ['Strive for Completion'],
      }),
    ).toEqual(['Strive for Completion']);
  });
});
