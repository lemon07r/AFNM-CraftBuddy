import { applySkill, calculateSkillGains } from '../optimizer/skills';
import { suScenarios } from './fixtures/companions';

describe('Su Lianhua technique interception', () => {
  it.each([
    ['step-0', 5, 5],
    ['step-1', 5, 5],
    ['step-2', 7, 7],
    ['mastery-buff', 16, 7],
    ['floors', 10, 10],
    ['type-exclusion', 5, 5],
    ['item-exclusion', 5, 5],
    ['synchronous', 7, 7],
    ['chance-side-effect', 7, 7],
    ['crit-boost', 21, 21],
  ])(
    'intercepts per application before crit/boost: %s',
    (edge, completion, perfection) => {
      const { state, skill, config } = suScenarios().find(
        (s) => s.name === `companion-su-${edge}`,
      )!;
      const preview = calculateSkillGains(state, skill, config);
      const next = applySkill(state, skill, config)!;
      expect(next.completion).toBe(completion);
      expect(next.perfection).toBe(perfection);
      expect(preview.completion).toBe(edge === 'mastery-buff' ? 7 : completion);
      expect(preview.perfection).toBe(perfection);
      expect(
        state.buffs.get("su_lianhua's_assistance")?.internalState,
      ).toBeUndefined();
      if (edge === 'synchronous')
        expect(
          next.buffs.get("su_lianhua's_assistance")?.internalState,
        ).toEqual({ charged: 2, seen: 1 });
      if (edge === 'chance-side-effect')
        expect(
          next.buffs.get("su_lianhua's_assistance")?.internalState,
        ).toEqual({ seen: 0 });
    },
  );
});
