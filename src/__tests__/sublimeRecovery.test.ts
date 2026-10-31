import { readFileSync } from 'fs';
import { join } from 'path';
import { CraftingState, type CraftingStateData } from '../optimizer/state';
import {
  findBestSkill,
  type SearchConfig,
  type SearchResult,
} from '../optimizer/search';
import {
  applySkill,
  applySkillOutcomes,
  type OptimizerConfig,
  type SkillDefinition,
} from '../optimizer/skills';
import { initHarmonyData } from '../optimizer/harmony';
import { HARMONY_TYPES } from '../optimizer/harmonyRegistry';
import type { HarmonyType } from '../optimizer/gameTypes';
import { mergePartitionedResults } from '../optimizer/searchBackend';
import { retargetConfig, retargetSkill } from './fixtures/runtime0717';

// Unmodified fixture supplied by the independent artifact reviewer, 2026-10-29.
const fixture = JSON.parse(
  readFileSync(join(__dirname, 'fixtures/full-stability-sublime.json'), 'utf8'),
) as {
  state: Partial<CraftingStateData>;
  config: Partial<OptimizerConfig>;
  skills: Partial<SkillDefinition>[];
  searchConfig: Partial<SearchConfig>;
  targetCompletion: number;
  targetPerfection: number;
  lookaheadDepth: number;
  maxReplans: number;
};
function input() {
  const skills = fixture.skills.map(retargetSkill);
  return {
    // The supplied fixture omitted the selected harmony. Exercise the inert
    // recovery proof with an explicit, established stateless Formless craft.
    state: new CraftingState({
      ...fixture.state,
      harmony: 33,
      harmonyData: initHarmonyData('formless'),
    }),
    config: retargetConfig(skills[0], {
      ...fixture.config,
      skills,
      craftingType: 'formless',
    }),
  };
}
function search(
  state: CraftingState,
  config: OptimizerConfig,
  depth = fixture.lookaheadDepth,
  extra: Partial<SearchConfig> = {},
  forecast: string[] = [],
): SearchResult {
  return findBestSkill(
    state,
    config,
    fixture.targetCompletion,
    fixture.targetPerfection,
    false,
    depth,
    'neutral',
    forecast,
    { ...fixture.searchConfig, timeBudgetMs: 60000, ...extra },
  );
}
function candidates(result: SearchResult) {
  return [result.recommendation, ...result.alternativeSkills]
    .filter((r) => r !== null)
    .map((r) => r.skill.key);
}

describe('independent reviewer sublime recovery counterexample', () => {
  test.each([1, 6, 96])(
    'does not burn 100 Qi before the same gamble at depth %i',
    (depth) => {
      const { state: initial, config } = input();
      const restore = config.skills[1];
      const after = applySkill(
        initial,
        restore,
        config,
        [],
        100,
        'neutral',
        100,
      )!;
      // Establish that the fixture is an actual no-benefit transition, not an
      // inconsistent completion-bonus or harmony initialization artifact.
      expect(after).toEqual(
        initial.copy({ qi: 180, step: 1, history: ['Restore'] }),
      );
      let state = initial;
      const picks: string[] = [];
      for (let i = 0; i < fixture.maxReplans; i++) {
        const result = search(state, config, depth);
        expect(result.recommendation).not.toBeNull();
        const action = result.recommendation!;
        picks.push(action.skill.key);
        if (action.skill.key === 'gamble') {
          expect(action.requiresProbabilisticSurvival).toBe(true);
          expect(action.planning?.goalProbabilityLowerBound).toBe(0.5);
          expect(action.planning?.prematureEndProbability).toBe(0.5);
          break;
        }
        state = applySkill(
          state,
          action.skill,
          config,
          [],
          100,
          'neutral',
          100,
        )!;
      }
      expect(picks).toEqual(['gamble']);
      expect(state.qi).toBe(200);
    },
  );

  test('the sublime flag does not change an otherwise identical no-benefit decision', () => {
    const { state, config } = input();
    expect(search(state, config).recommendation?.skill.key).toBe(
      search(state, { ...config, isSublimeCraft: false }).recommendation?.skill
        .key,
    );
  });

  test('worker partitions retain the unavoidable risk after rejecting inert recovery', () => {
    const { state, config } = input();
    const result = mergePartitionedResults(
      config.skills.map((skill) =>
        search(state, config, 6, { rootSkillKeys: [skill.key] }),
      ),
    );
    expect(result.recommendation?.skill.key).toBe('gamble');
    expect(result.recommendation?.requiresProbabilisticSurvival).toBe(true);
    expect(result.recommendation?.planning?.goalProbabilityLowerBound).toBe(
      0.5,
    );
  });

  test.each(['forge', 'formless', 'eccentricDecree'] as const)(
    'rejects recovery when the complete %s state is unchanged',
    (craftingType) => {
      const { state: original, config } = input();
      const harmonyData = initHarmonyData(craftingType, 200);
      if (harmonyData.eccentricDecree)
        Object.assign(harmonyData.eccentricDecree, {
          lastCompletion: 100,
          lastPerfection: 100,
        });
      const state = original.copy({
        harmony:
          craftingType === 'formless'
            ? 33
            : craftingType === 'forge'
              ? // Deliberately test the lower clamp: cooling cannot lower
                // harmony further, so this restoration really is inert.
                -100
              : 0,
        harmonyData,
      });
      const cfg = { ...config, craftingType };
      const after = applySkillOutcomes(
        state,
        cfg.skills[1],
        cfg,
        [],
        100,
        'neutral',
        100,
      );
      expect(after.unresolvedProbability).toBe(0);
      expect(after.outcomes[0].state.harmonyData).toEqual(state.harmonyData);
      expect(after.outcomes[0].state.harmony).toBe(state.harmony);
      expect(candidates(search(state, cfg, 1))).not.toContain('restore');
    },
  );

  test.each(
    HARMONY_TYPES.filter(
      (type) => !['forge', 'formless', 'eccentricDecree'].includes(type),
    ),
  )('retains full-bar recovery when %s state evolves', (craftingType) => {
    const { state: original, config } = input();
    const state = original.copy({
      harmony: 0,
      harmonyData: initHarmonyData(craftingType, 200),
    });
    const cfg = { ...config, craftingType };
    const after = applySkillOutcomes(
      state,
      cfg.skills[1],
      cfg,
      [],
      100,
      'neutral',
      100,
    );
    expect(after.outcomes[0].state.harmonyData).not.toEqual(state.harmonyData);
    expect(candidates(search(state, cfg, 1))).toContain('restore');
  });

  test('preserves useful forge cooling at full stability', () => {
    const { state: original, config } = input();
    const harmonyData = initHarmonyData('forge', 200);
    harmonyData.forgeWorks = { heat: 7, lastBuffedHeat: 7 };
    const state = original.copy({ harmonyData, harmony: 0 });
    const cfg = { ...config, craftingType: 'forge' as const };
    const after = applySkillOutcomes(
      state,
      cfg.skills[1],
      cfg,
      [],
      100,
      'neutral',
      100,
    );
    expect(after.outcomes[0].state.harmonyData?.forgeWorks?.heat).toBe(6);
    expect(candidates(search(state, cfg, 1))).toContain('restore');
  });

  test('preserves Returning Cycle charge release and Precision even when recovery is capped', () => {
    const { state: original, config } = input();
    const harmonyData = initHarmonyData('returningCycle', 200);
    harmonyData.returningCycle!.charges = 2;
    const state = original.copy({ harmonyData, harmony: 0 });
    const restore = { ...config.skills[1], type: 'stabilize' as const };
    const cfg = {
      ...config,
      craftingType: 'returningCycle' as const,
      skills: [config.skills[0], restore],
    };
    const after = applySkillOutcomes(
      state,
      restore,
      cfg,
      [],
      100,
      'neutral',
      100,
    ).outcomes[0].state;
    expect(after.harmonyData?.returningCycle?.charges).toBe(0);
    expect(after.buffs.size).toBeGreaterThan(0);
    expect(candidates(search(state, cfg, 1))).toContain('restore');
  });

  test('preserves a sublime cooldown wait that enables guaranteed completion', () => {
    const { state: original, config } = input();
    const state = original.copy({ cooldowns: new Map([['gamble', 1]]) });
    const cfg = {
      ...config,
      skills: [{ ...config.skills[0], successChance: 1 }, config.skills[1]],
    };
    const result = search(state, cfg, 3);
    expect(result.recommendation?.skill.key).toBe('restore');
    expect(result.recommendation?.planning?.goalProbabilityLowerBound).toBe(1);
  });

  test('preserves a wait for a forecast condition that unlocks a guaranteed finish', () => {
    const { state, config } = input();
    const cfg = {
      ...config,
      skills: [
        {
          ...config.skills[0],
          successChance: 1,
          conditionRequirement: 'positive',
        },
        config.skills[1],
      ],
    };
    const result = search(state, cfg, 3, {}, ['positive']);
    expect(result.recommendation?.skill.key).toBe('restore');
    expect(result.recommendation?.planning?.goalProbabilityLowerBound).toBe(1);
  });

  test('preserves step-dependent future mechanics and active buff ticks', () => {
    const { state, config } = input();
    const dynamic = {
      ...config,
      skills: [
        {
          ...config.skills[0],
          effects: [
            {
              kind: 'completion' as const,
              amount: { value: 1, eqn: 'step * 100' },
            },
          ],
        },
        config.skills[1],
      ],
    };
    expect(candidates(search(state, dynamic, 1))).toContain('restore');
    const buffed = state.copy({
      buffs: new Map([
        [
          'growth',
          {
            name: 'Growth',
            stacks: 1,
            definition: {
              name: 'Growth',
              canStack: false,
              effects: [
                { kind: 'completion' as const, amount: { value: 100 } },
              ],
            },
          },
        ],
      ]),
    });
    expect(candidates(search(buffed, config, 1))).toContain('restore');
  });

  test('does not claim a no-benefit proof for an unknown harmony implementation', () => {
    const { state, config } = input();
    const cfg = { ...config, craftingType: 'futureHarmony' as HarmonyType };
    const result = search(state, cfg, 1);
    expect(result.recommendation).toBeNull();
    expect(result.blockedReasons?.some((r) => r.reason === 'unresolved')).toBe(
      true,
    );
  });
  test('the unmodified reviewer fixture cannot certify an unspecified harmony', () => {
    const skills = fixture.skills.map(retargetSkill);
    const result = search(
      new CraftingState(fixture.state),
      retargetConfig(skills[0], { ...fixture.config, skills }),
    );
    expect(result.recommendation).toBeNull();
    expect(
      result.blockedReasons?.some((r) => r.details.includes('harmony type')),
    ).toBe(true);
  });
});
