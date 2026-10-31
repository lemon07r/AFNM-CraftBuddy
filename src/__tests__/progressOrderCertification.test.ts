import { CraftingState } from '../optimizer/state';
import { applySkillOutcomes } from '../optimizer/skills';
import type { BuffDefinition, TechniqueEffect } from '../optimizer/gameTypes';
import { retargetConfig, retargetSkill } from './fixtures/runtime0717';

const progress: TechniqueEffect = { kind: 'completion', amount: { value: 50 } };
const observer: BuffDefinition = {
  name: 'Bar observer',
  canStack: false,
  effects: [],
  triggeredEffects: [
    {
      trigger: 'completionGained',
      effects: [{ kind: 'pool', amount: { value: -50 } }],
    },
  ],
};

test.each([false, true])(
  'creating a bar listener inside the same progress block stays unresolved (before: %s)',
  (before) => {
    const create: TechniqueEffect = {
      kind: 'createBuff',
      buff: observer,
      stacks: { value: 1 },
    };
    const skill = retargetSkill({
      effects: before ? [create, progress] : [progress, create],
    });
    const result = applySkillOutcomes(
      new CraftingState({ qi: 95, stability: 20 }),
      skill,
      retargetConfig(skill),
      [],
      100,
      'neutral',
      100,
    );
    expect(result.unresolvedProbability).toBe(1);
    expect(result.outcomes).toEqual([]);
    expect(result.unsupportedReason).toMatch(/subscription order/);
  },
);

test.each([false, true])(
  'removing a bar listener after progress cannot erase its earlier resource cost (before: %s)',
  (before) => {
    const remove: TechniqueEffect = {
      kind: 'consumeBuff',
      buff: { name: observer.name, canStack: false, effects: [] },
      stacks: { value: 1 },
    };
    const skill = retargetSkill({
      qiCost: 10,
      effects: before ? [remove, progress] : [progress, remove],
    });
    const state = new CraftingState({
      qi: 95,
      stability: 20,
      buffs: new Map([
        [
          'bar_observer',
          { name: observer.name, stacks: 1, definition: observer },
        ],
      ]),
    });
    const result = applySkillOutcomes(
      state,
      skill,
      retargetConfig(skill),
      [],
      100,
      'neutral',
      100,
    );
    if (before) {
      expect(result.unresolvedProbability).toBe(0);
      expect(result.outcomes[0].state.qi).toBe(85);
    } else {
      expect(result.unresolvedProbability).toBe(1);
      expect(result.outcomes).toEqual([]);
    }
  },
);

test.each(['completion', 'perfection'] as const)(
  'progress-derived buff stats refresh after the technique (%s)',
  (bar) => {
    const definition: BuffDefinition = {
      name: 'Growing Pool',
      canStack: false,
      effects: [],
      onRefine: [{ kind: 'pool', amount: { value: 20 } }],
      stats: { maxpool: { value: 1, scaling: 'completion' } },
    };
    const skill = retargetSkill({
      effects: [{ kind: bar, amount: { value: 50 } }],
    });
    const state = new CraftingState({
      qi: 95,
      stability: 20,
      buffs: new Map([
        ['grow', { name: definition.name, stacks: 1, definition }],
      ]),
    });
    const result = applySkillOutcomes(
      state,
      skill,
      retargetConfig(skill, { maxQi: 100 }),
      [],
      100,
      'neutral',
      100,
    );
    expect(result.unresolvedProbability).toBe(0);
    expect(result.outcomes[0].state.qi).toBe(bar === 'completion' ? 105 : 100);
  },
);

test('later mastery blocks cannot confuse captured expressions with live progress', () => {
  const skill = retargetSkill({
    masteryEntries: [
      { kind: 'effect', effects: [progress] },
      {
        kind: 'effect',
        condition: { kind: 'condition', condition: 'completion >= 50' },
        effects: [progress],
      },
    ],
  });
  const result = applySkillOutcomes(
    new CraftingState({ qi: 95, stability: 20 }),
    skill,
    retargetConfig(skill),
    [],
    100,
    'neutral',
    100,
  );
  expect(result.unresolvedProbability).toBe(1);
  expect(result.outcomes).toEqual([]);
});

test('captured progress expressions inside one technique retain their initial frame', () => {
  const skill = retargetSkill({
    effects: [
      progress,
      {
        ...progress,
        condition: { kind: 'condition', condition: 'completion == 0' },
      },
    ],
  });
  const result = applySkillOutcomes(
    new CraftingState({ qi: 95, stability: 20 }),
    skill,
    retargetConfig(skill),
    [],
    100,
    'neutral',
    100,
  );
  expect(result.unresolvedProbability).toBe(0);
  expect(result.outcomes[0].state.completion).toBe(100);
});

test('a live progress gate between mastery blocks can read the completed prior block', () => {
  const skill = retargetSkill({
    masteryEntries: [
      { kind: 'effect', effects: [progress] },
      {
        kind: 'effect',
        condition: { kind: 'completion', mode: 'more', percentage: 50 },
        effects: [progress],
      },
    ],
  });
  const result = applySkillOutcomes(
    new CraftingState({ qi: 95, stability: 20 }),
    skill,
    retargetConfig(skill),
    [],
    100,
    'neutral',
    100,
  );
  expect(result.unresolvedProbability).toBe(0);
  expect(result.outcomes[0].state.completion).toBe(100);
});

test.each(['completion', 'perfection'] as const)(
  'ordinary progress-based stat buffs keep their per-action captured frame (%s)',
  (bar) => {
    const stat = bar === 'completion' ? 'intensity' : 'control';
    const definition: BuffDefinition = {
      name: bar === 'completion' ? 'False Fusion' : 'Strive for Perfection',
      canStack: false,
      effects: [],
      stats: { [stat]: { value: 1, stat, eqn: `${bar} > max${bar}` } },
    };
    const skill = retargetSkill({
      qiCost: 0,
      stabilityCost: 1,
      effects: [
        { kind: bar, amount: { value: 1, stat } },
        { kind: bar, amount: { value: 1, stat } },
      ],
    });
    const config = retargetConfig(skill, {
      maxCompletion: bar === 'completion' ? 200 : 0,
      maxPerfection: bar === 'perfection' ? 200 : 0,
    });
    let state = new CraftingState({
      qi: 100,
      stability: 60,
      [bar]: 95,
      buffs: new Map([
        ['conditional', { name: definition.name, stacks: 1, definition }],
      ]),
    });
    for (const expected of [115, 155]) {
      const result = applySkillOutcomes(
        state,
        skill,
        config,
        [],
        100,
        'neutral',
        100,
      );
      expect(result.unresolvedProbability).toBe(0);
      expect(result.outcomes).toHaveLength(1);
      state = result.outcomes[0].state;
      expect(state[bar]).toBe(expected);
    }
  },
);
