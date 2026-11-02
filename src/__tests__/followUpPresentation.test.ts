import {
  CraftingState,
  DEFAULT_CONFIG,
  DEFAULT_SKILLS,
  lookaheadSearch,
} from '../optimizer';
import { planDisplayContent } from '../utils/recommendationPresentation';

describe('follow-up game labels', () => {
  it.each([1, 10000])(
    'preserves the display name through search and the Then fallback with a %s-node budget',
    (maxNodes) => {
      const result = lookaheadSearch(
        new CraftingState({ qi: 100, stability: 50, initialMaxStability: 60 }),
        {
          ...DEFAULT_CONFIG,
          skills: [
            {
              ...DEFAULT_SKILLS[0],
              key: 'renamed_technique',
              name: 'Internal technique',
              displayName: 'Game technique',
              qiCost: 0,
            },
          ],
        },
        100000,
        100000,
        3,
        'neutral',
        [],
        { maxNodes, timeBudgetMs: 1000 },
      );
      expect(result.recommendation?.followUpSkill).toMatchObject({
        name: 'Internal technique',
        displayName: 'Game technique',
      });
      expect(
        planDisplayContent({
          ...result,
          optimalRotation: undefined,
          optimalRotationLabels: undefined,
        }).followUp,
      ).toBe('Game technique');
    },
  );
});
