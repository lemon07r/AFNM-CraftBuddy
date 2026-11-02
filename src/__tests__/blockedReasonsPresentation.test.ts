import {
  CraftingState,
  DEFAULT_CONFIG,
  DEFAULT_SKILLS,
  getBlockedSkillReasons,
  techniqueDisplayName,
} from '../optimizer';

describe('blocked technique display names', () => {
  it.each([
    ['qi', new CraftingState({ qi: 0, stability: 50 })],
    ['stability', new CraftingState({ qi: 100, stability: 0 })],
    [
      'cooldown',
      new CraftingState({
        qi: 100,
        stability: 50,
        cooldowns: new Map([['false_fusion', 2]]),
      }),
    ],
  ])('carries the game label through a %s blocked reason', (reason, state) => {
    const [blocked] = getBlockedSkillReasons(state, {
      ...DEFAULT_CONFIG,
      skills: [
        {
          ...DEFAULT_SKILLS[0],
          key: 'false_fusion',
          name: 'False Fusion',
          displayName: 'Strive for Completion',
          qiCost: 10,
        },
      ],
    });
    expect(blocked).toMatchObject({
      skillName: 'False Fusion',
      displayName: 'Strive for Completion',
      reason,
    });
    expect(
      techniqueDisplayName({
        name: blocked.skillName,
        displayName: blocked.displayName,
      }),
    ).toBe('Strive for Completion');
  });
});
