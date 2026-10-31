import { CraftingState } from '../optimizer/state';
import { findBestSkill } from '../optimizer/search';
import {
  applySkill,
  applySkillOutcomes,
  getAvailableSkills,
  type SkillDefinition,
} from '../optimizer/skills';
import { projectNativeAutoUseBranches } from '../optimizer/nativeAutoUsePlan';
import { buildOutcomeSummary } from '../utils/outcomeSummary';
import { retargetSkill, retargetConfig } from './fixtures/runtime0717';
import type { BuffDefinition } from '../optimizer/gameTypes';

const settings = { timeBudgetMs: 60000, maxNodes: 1000, beamWidth: 5 };
const finish = retargetSkill({
  key: 'finish',
  name: 'Finish',
  qiCost: 10,
  stabilityCost: 10,
  effects: [{ kind: 'completion', amount: { value: 100 } }],
});
const state = () =>
  new CraftingState({
    qi: 100,
    stability: 10,
    initialMaxStability: 60,
    items: new Map([['pill', 1]]),
  });
const config = (skill = finish) =>
  retargetConfig(skill, {
    maxCompletion: 100,
    maxPerfection: 0,
    targetPerfection: 0,
  });
const search = (s = state(), cfg = config()) =>
  findBestSkill(
    s,
    cfg,
    100,
    cfg.targetPerfection ?? 0,
    false,
    3,
    'neutral',
    [],
    settings,
  );
const customEffect = { kind: 'futureEffect', amount: { value: 10 } };
const effects = (value: unknown) => value as SkillDefinition['effects'];

describe('certification refuses unsupported payloads', () => {
  test('preserves supported legacy optional metadata and expression syntax', () => {
    const skill = {
      ...finish,
      grantedBuff: null,
      effects: [
        {
          kind: 'completion',
          amount: {
            value: 100,
            eqn: null,
            stat: null,
            scaling: null,
            customScaling: null,
            isItem: null,
          },
        },
      ],
    } as unknown as SkillDefinition;
    const buff = {
      name: 'Empty',
      canStack: false,
      effects: [],
      stats: null,
      initialState: null,
    } as unknown as BuffDefinition;
    const s = state().copy({
      buffs: new Map([
        ['empty', { name: 'Empty', stacks: 1, definition: buff }],
      ]),
    });
    const result = search(s, config(skill));
    expect(result.recommendation?.planning?.goalProbabilityLowerBound).toBe(1);
    expect(
      result.recommendation?.planning?.transitionUnresolvedProbability,
    ).toBe(0);
    for (const condition of [
      'pool > 0 and (stability > 0)',
      'pool > 0 or (stability > 0)',
    ]) {
      const conditional = {
        ...finish,
        effects: [
          {
            kind: 'completion' as const,
            amount: { value: 100 },
            condition: { kind: 'condition' as const, condition },
          },
        ],
      };
      expect(
        search(state(), config(conditional)).recommendation?.planning
          ?.goalProbabilityLowerBound,
      ).toBe(1);
    }
  });
  test.each([
    [
      'technique kind',
      { effects: effects([...finish.effects!, customEffect]) },
    ],
    [
      'condition kind',
      {
        effects: effects([
          {
            kind: 'completion',
            amount: { value: 100 },
            condition: { kind: 'futureCondition' },
          },
        ]),
      },
    ],
    [
      'condition mode',
      {
        effects: effects([
          {
            kind: 'completion',
            amount: { value: 100 },
            condition: { kind: 'pool', mode: 'futureMode', percentage: 0 },
          },
        ]),
      },
    ],
    [
      'scaling shape',
      {
        effects: effects([
          { kind: 'completion', amount: { value: 100, futureMultiplier: 3 } },
        ]),
      },
    ],
    [
      'scaling shorthand',
      { effects: effects([{ kind: 'completion', amount: 100 }]) },
    ],
    [
      'random expression',
      {
        effects: effects([
          { kind: 'completion', amount: { value: 200, eqn: '{rng}' } },
        ]),
      },
    ],
    [
      'malformed expression',
      {
        effects: effects([
          { kind: 'completion', amount: { value: 100, eqn: '1 +' } },
        ]),
      },
    ],
    [
      'unknown function',
      {
        effects: effects([
          {
            kind: 'completion',
            amount: { value: 100, eqn: 'futureFunction(1)' },
          },
        ]),
      },
    ],
    ['mastery kind', { masteryEntries: [{ kind: 'futureMastery' }] }],
    [
      'mastery effect',
      { masteryEntries: [{ kind: 'effect', effects: [customEffect] }] },
    ],
    [
      'nested buff effect',
      {
        effects: effects([
          ...finish.effects!,
          {
            kind: 'createBuff',
            stacks: { value: 1 },
            buff: { name: 'Unknown', canStack: false, effects: [customEffect] },
          },
        ]),
      },
    ],
  ] as Array<[string, Partial<SkillDefinition>]>)(
    'marks %s unresolved without a certificate',
    (_name, overrides) => {
      const skill = { ...finish, ...overrides };
      const result = applySkillOutcomes(state(), skill, config(skill));
      expect(result.outcomes).toEqual([]);
      expect(result.unresolvedProbability).toBe(1);
      const planned = search(state(), config(skill));
      expect(planned.recommendation).toBeNull();
      expect(
        planned.blockedReasons?.some((r) => r.reason === 'unresolved'),
      ).toBe(true);
    },
  );

  test('keeps legacy EV estimates permissive without treating them as certificates', () => {
    const skill = {
      ...finish,
      effects: effects([...finish.effects!, customEffect]),
    };
    expect(applySkill(state(), skill, config(skill))?.completion).toBe(100);
    expect(
      applySkillOutcomes(state(), skill, config(skill)).unresolvedProbability,
    ).toBe(1);
  });

  test.each(['effects', 'onRefine'])(
    'does not ignore unsupported active-buff %s',
    (field) => {
      const buff = {
        name: 'Unknown',
        canStack: false,
        effects: [],
        [field]: [customEffect],
      } as unknown as BuffDefinition;
      const s = state().copy({
        buffs: new Map([
          ['unknown', { name: 'Unknown', stacks: 1, definition: buff }],
        ]),
      });
      expect(
        applySkillOutcomes(s, finish, config()).unresolvedProbability,
      ).toBe(1);
      expect(search(s).recommendation).toBeNull();
    },
  );
  test('malformed active-buff scaling pauses instead of crashing availability', () => {
    const buff = {
      name: 'Unknown',
      canStack: false,
      effects: [],
      stats: { stabilityCostReduction: { value: 10, futureScaling: true } },
    } as unknown as BuffDefinition;
    const s = state().copy({
      buffs: new Map([
        ['unknown', { name: 'Unknown', stacks: 1, definition: buff }],
      ]),
    });
    expect(search(s).recommendation).toBeNull();
  });
  test('an unsupported unused technique does not poison a supported alternative', () => {
    const unknown = {
      ...finish,
      key: 'unknown',
      effects: effects([...finish.effects!, customEffect]),
    };
    const result = search(state(), { ...config(), skills: [unknown, finish] });
    expect(result.recommendation?.skill.key).toBe('finish');
    expect(result.recommendation?.planning?.goalProbabilityLowerBound).toBe(1);
  });
  test('unknown triggered mechanics and initial-state expressions are not silently certified', () => {
    for (const extra of [
      { triggeredEffects: [{ trigger: 'futureTrigger', effects: [] }] },
      { initialState: { count: 'futureFunction(1)' } },
      { additionalVariables: { multiplier: 'unmodelled' } },
      {
        stats: {
          control: {
            value: 1,
            customScaling: { scaling: 'stacks', multiplier: 1, upgradeKey: 7 },
          },
        },
      },
    ]) {
      const buff = {
        name: 'Unknown',
        canStack: false,
        effects: [],
        ...extra,
      } as unknown as BuffDefinition;
      const s = state().copy({
        buffs: new Map([
          ['unknown', { name: 'Unknown', stacks: 1, definition: buff }],
        ]),
      });
      expect(
        applySkillOutcomes(s, finish, config()).unresolvedProbability,
      ).toBe(1);
    }
  });
});

describe('native pre-click availability and certification', () => {
  function nativeConfig(unsupported = false) {
    const pill = retargetSkill({
      key: 'pill',
      name: 'Pill',
      itemName: 'pill',
      actionKind: 'item',
      consumesTurn: false,
      qiCost: 0,
      stabilityCost: 0,
      effects: effects(
        unsupported
          ? [customEffect]
          : [{ kind: 'pool', amount: { value: 20 } }],
      ),
    });
    return {
      ...config(),
      pillsPerRound: 1,
      nativeAutoUsePlan: {
        slots: [{ item: 'Pill' }],
        items: { Pill: { action: pill, toxicityBeforeResistance: 0 } },
        initialUsage: {},
        baseResistance: 0,
      },
    };
  }
  test('a restoring pill cannot unlock the disabled technique needed to trigger it', () => {
    const s = state().copy({ qi: 5 }),
      cfg = nativeConfig();
    expect(getAvailableSkills(s, cfg, 'neutral')).toHaveLength(0);
    const projected = projectNativeAutoUseBranches(s, cfg, 'neutral')
      .outcomes[0].state;
    expect(getAvailableSkills(projected, cfg, 'neutral')).toHaveLength(1);
    const result = search(s, cfg);
    expect(result.recommendation).toBeNull();
    expect(result.blockedReasons?.some((r) => r.reason === 'qi')).toBe(true);
  });
  test('prefers an enabled alternative and still projects its native item effects', () => {
    const cfg = nativeConfig(),
      cheap = { ...finish, key: 'cheap', qiCost: 5 };
    const result = search(state().copy({ qi: 5 }), {
      ...cfg,
      skills: [finish, cheap],
    });
    expect(result.recommendation?.skill.key).toBe('cheap');
    expect(result.recommendation?.planning?.goalProbabilityLowerBound).toBe(1);
    expect(result.alternativeSkills.some((r) => r.skill.key === 'finish')).toBe(
      false,
    );
  });
  test('unsupported native item effects cannot be certified as harmless', () => {
    const result = search(state(), nativeConfig(true));
    expect(result.recommendation).toBeNull();
    expect(result.blockedReasons?.some((r) => r.reason === 'unresolved')).toBe(
      true,
    );
  });
});

describe('item tier and selected goals are distinct', () => {
  const cfg = {
    ...config(),
    maxCompletion: 1000,
    maxPerfection: 1000,
    targetPerfection: 100,
  };
  const run = (completion: number, completionBandCeiling = 3) =>
    findBestSkill(
      state().copy({ completion, perfection: 100, stability: 60 }),
      cfg,
      100,
      100,
      false,
      1,
      'neutral',
      [],
      { ...settings, completionBandCeiling, perfectionBandGoal: 1 },
    );
  test('secured Perfect does not acquire a three-band tier requirement', () => {
    const result = run(100),
      projection = result.outcomeProjection!;
    expect(projection.tier).toBe('perfect');
    expect(projection.completion.requiredBands).toBe(1);
    expect(projection.bindingBar).toBe('none');
    expect(projection.requestedGoals?.completion.target).toBe(399);
    expect(projection.requestedGoals?.completion.bands).toBe(3);
    expect(projection.requestedGoals?.bindingBar).toBe('completion');
    const summary = buildOutcomeSummary({ projection })!;
    expect(summary.tierHeadline).toBe('Perfect secured');
    expect(summary.bindingLabel).toBe('Both bars meet Perfect');
    expect(summary.requestedGoals?.completionLabel).toContain('3 bands');
    expect(
      buildOutcomeSummary({
        projection: { ...projection, willAutoFinish: true },
      })?.requestedGoals?.status,
    ).toBe('Selected goals not reached');
  });
  test('met goals have no binding bar even when the craft still needs resolution', () => {
    const result = run(399),
      goals = result.outcomeProjection!.requestedGoals!;
    expect(goals.attained).toBe(true);
    expect(goals.bindingBar).toBe('none');
    expect(goals.needsResolution).toBe(true);
    expect(result.targetsMet).toBe(false);
    expect(
      buildOutcomeSummary({ projection: result.outcomeProjection })
        ?.requestedGoals?.status,
    ).toContain('craft still active');
  });
  test('eight-band goals remain visible separately from the one-band Perfect tier', () => {
    const result = findBestSkill(
      state().copy({ completion: 100, perfection: 100, stability: 60 }),
      { ...cfg, maxCompletion: 3000, maxPerfection: 3000 },
      100,
      100,
      false,
      1,
      'neutral',
      [],
      { ...settings, completionBandCeiling: 8, perfectionBandGoal: 8 },
    );
    expect(result.outcomeProjection?.completion.requiredBands).toBe(1);
    expect(result.outcomeProjection?.requestedGoals?.completion.bands).toBe(8);
    expect(
      buildOutcomeSummary({ projection: result.outcomeProjection })
        ?.requestedGoals?.completionLabel,
    ).toContain('8 bands');
    expect(
      buildOutcomeSummary({ projection: result.outcomeProjection })
        ?.requestedGoals?.perfectionLabel,
    ).toContain('8 bands');
  });
});

test('losing an optional step-zero reagent does not make an otherwise inert wait useful', () => {
  const gamble = {
    ...finish,
    qiCost: 0,
    stabilityCost: 60,
    successChance: 0.5,
  };
  const restore = retargetSkill({
    key: 'restore',
    name: 'Restore',
    qiCost: 20,
    stabilityCost: 0,
    stabilityGain: 40,
    preventsMaxStabilityDecay: true,
  });
  const reagent = retargetSkill({
    key: 'reagent',
    name: 'Reagent',
    itemName: 'reagent',
    actionKind: 'item',
    consumesTurn: false,
    reagentOnlyAtStepZero: true,
    qiCost: 0,
    stabilityCost: 0,
    baseCompletionGain: 1,
  });
  const s = state().copy({
    qi: 200,
    stability: 60,
    items: new Map([['reagent', 1]]),
  });
  const cfg = {
    ...config(gamble),
    skills: [gamble, restore, reagent],
    isSublimeCraft: true,
    pillsPerRound: 1,
  };
  expect(
    getAvailableSkills(s, cfg, 'neutral').some((a) => a.key === 'reagent'),
  ).toBe(true);
  const later = applySkill(s, restore, cfg)!;
  expect(
    getAvailableSkills(later, cfg, 'neutral').some((a) => a.key === 'reagent'),
  ).toBe(false);
  const result = findBestSkill(
    s,
    cfg,
    100,
    0,
    false,
    1,
    'neutral',
    [],
    settings,
  );
  expect(
    [result.recommendation, ...result.alternativeSkills].some(
      (r) => r?.skill.key === 'restore',
    ),
  ).toBe(false);
});
