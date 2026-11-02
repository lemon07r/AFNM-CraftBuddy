import {
  applySkill,
  calculateActionSurvivabilityFloor,
  calculateSkillGains,
  getConditionEffectsForConfig,
} from '../optimizer/skills';
import type { BuffDefinition } from '../optimizer/gameTypes';
import { retargetConfig, retargetSkill } from './fixtures/runtime0717';
import {
  buildStateSnapshot,
  reviveStateSnapshot,
} from '../modContent/replaySnapshot';
import {
  HAN_KEY,
  companionIntegrationScenarios,
  companionReviewScenarios,
  companionPreviewScenarios,
  companionRestoreScenarios,
  companionCapScenarios,
  companionWeightedBarScenarios,
  companionPoolScenarios,
  companionDisciplinedScenarios,
  companionCritScenarios,
  companionPhasePreviewScenarios,
  hanScenarios,
  suScenarios,
} from './fixtures/companions';
import { readFileSync } from 'fs';
import { join } from 'path';
import type { DifferentialCorpus } from './fixtures/differentialCorpus';
import { reviveSearchInput } from '../optimizer/searchBackend';

describe('companion preview setup and mastery phases', () => {
  it.each(companionPhasePreviewScenarios())(
    'prepares prevention before technique gates: $name',
    ({ state, skill, config, edge }) => {
      const before = buildStateSnapshot(state, 'missing');
      const next = applySkill(state, skill, config)!;
      expect(next.stability).toBe(edge === 'setup' ? 35 : 45);
      expect(next.completion).toBe(0);
      expect(
        next.buffs.get(HAN_KEY)?.internalState?.preventedStabilityLosses,
      ).toBe(2);
      const preview = calculateSkillGains(state, skill, config);
      expect(preview.completion).toBe(0);
      expect(preview.stability).toBe(-5);
      expect(buildStateSnapshot(state, 'missing')).toEqual(before);
    },
  );
});

const inertCorpus = JSON.parse(
  readFileSync(join(__dirname, 'fixtures/transition_corpus.json'), 'utf8'),
) as DifferentialCorpus;
const inertSampleNames = [
  'baseline-neutral',
  'active-buffs',
  'crit-and-overcrit',
  'cost-modifiers',
  'effects-baseline',
  'effects-buff-stat-contributions',
  'effects-action-type-hooks',
  'effects-conditional-buff-effect',
  'effects-bifang-blaze',
  'effects-azure-depths',
  '0717-mastery-before-cost-failed',
  '0717-chance-mastery-as-is',
  '0717-jade',
  '0719-live-completion',
  '0719-live-perfection',
  '0719-shared-success-independent-conditions',
  'random-effects-0',
  'random-effects-1',
  'random-effects-2',
  'random-effects-3',
  'decree-multi-award',
];

// Intentional runtime-backed differences from the legacy non-companion path.
// Only the named fields differ; all 350 cases still compare every other field.
// Each excluded field must actually differ, so stale/broadened masks fail.
type InertExceptionField =
  | 'stability'
  | 'stabilitySpentAmount'
  | 'stabilitySpentCalls'
  | 'stabilityRestoredAmount'
  | 'poolRestoredAmount';
const inertExceptionGroups: ReadonlyArray<{
  reason: string;
  fields: readonly InertExceptionField[];
  cases: readonly string[];
}> = [
  {
    reason:
      'Companion effects dispatch per-application stability events (runtime r7c G:14930153); the non-companion path reports only net restoration (MECHANICS_PARITY gap 12).',
    fields: ['stabilitySpentAmount', 'stabilitySpentCalls'],
    cases: [
      'effects-baseline/effect_refine',
      'effects-buff-stat-contributions/effect_refine',
      'effects-action-type-hooks/effect_refine',
      'effects-bifang-blaze/effect_refine',
      'effects-azure-depths/effect_refine',
      'effects-conditional-buff-effect/effect_refine',
      'random-effects-0/effect_refine',
      'random-effects-1/effect_refine',
      'random-effects-3/effect_refine',
    ].flatMap((name) =>
      ['su', 'han'].map((companion) => `${name}/${companion}`),
    ),
  },
  {
    reason:
      'Companion effects dispatch separate stability restoration/spending (runtime r7c G:14930153); the non-companion path nets these applications (MECHANICS_PARITY gap 12).',
    fields: [
      'stabilityRestoredAmount',
      'stabilitySpentAmount',
      'stabilitySpentCalls',
    ],
    cases: ['su', 'han'].map(
      (companion) =>
        `0719-shared-success-independent-conditions/retarget_probe/${companion}`,
    ),
  },
  {
    reason:
      'Companion effects dispatch realized clamped pool deltas (runtime u7c G:14935853); the non-companion path reports requested/net amounts (MECHANICS_PARITY gap 10).',
    fields: ['poolRestoredAmount'],
    cases: [
      ...[
        'effects-baseline/restorative_pool',
        'effects-buff-stat-contributions/restorative_pool',
        'effects-action-type-hooks/restorative_pool',
        'effects-bifang-blaze/restorative_pool',
        'effects-azure-depths/restorative_pool',
        'effects-conditional-buff-effect/restorative_pool',
        'random-effects-0/restorative_pool',
      ].flatMap((name) =>
        ['su', 'han'].map((companion) => `${name}/${companion}`),
      ),
      'effects-baseline/qi_restoring_pill/han',
      'random-effects-0/qi_restoring_pill/han',
    ],
  },
  {
    reason:
      'Han-path applications reduce/floor negative stability even with zero prevention uses (runtime r7c G:14930153); legacy non-Han applications do not (MECHANICS_PARITY gap 12).',
    fields: ['stability', 'stabilitySpentAmount'],
    cases: [
      ...['random-effects-0', 'random-effects-1', 'random-effects-3'].map(
        (name) => `${name}/effect_refine/han`,
      ),
      ...[
        'effect_fusion',
        'conditional_surge',
        'mastered_refine',
        'kindle_soulflame',
        'quench_soulflame',
        'disciplined_touch',
        'prime_false_fusion',
        'restorative_pool',
      ].map((key) => `random-effects-3/${key}/han`),
    ],
  },
];
const inertRuntimeExceptions = new Map<
  string,
  {
    reasons: string[];
    fields: Set<InertExceptionField>;
  }
>();
for (const group of inertExceptionGroups) {
  for (const name of group.cases) {
    const exception = inertRuntimeExceptions.get(name) ?? {
      reasons: [],
      fields: new Set<InertExceptionField>(),
    };
    exception.reasons.push(group.reason);
    for (const field of group.fields) exception.fields.add(field);
    inertRuntimeExceptions.set(name, exception);
  }
}
const inertCases = inertCorpus.scenarios
  .filter(({ name }) => inertSampleNames.includes(name))
  .flatMap((scenario) =>
    scenario.cases.flatMap(({ skillIndex, skillKey }) =>
      (['su', 'han'] as const).map((companion) => ({
        scenario,
        skillIndex,
        companion,
        name: `${scenario.name}/${skillKey}/${companion}`,
      })),
    ),
  );

describe('inert companion corpus differential', () => {
  it('pins the sample and every field-specific runtime-backed exception', () => {
    expect(
      inertCorpus.scenarios.filter(({ name }) =>
        inertSampleNames.includes(name),
      ),
    ).toHaveLength(21);
    expect(inertCases).toHaveLength(350);
    expect(inertRuntimeExceptions.size).toBe(44);
    for (const [name, exception] of Array.from(
      inertRuntimeExceptions.entries(),
    )) {
      expect(inertCases.some((entry) => entry.name === name)).toBe(true);
      expect(exception.fields.size).toBeGreaterThan(0);
      for (const reason of exception.reasons) {
        expect(reason).toMatch(/runtime .+ G:149/);
        expect(reason).toMatch(/MECHANICS_PARITY gap (10|12)/);
      }
    }
  });
  it.each(inertCases)(
    'preserves resources, buffs and listener events: $name',
    ({ scenario, skillIndex, companion, name }) => {
      const input = reviveSearchInput(scenario.input);
      const skill = input.config.skills[skillIndex];
      const observer: BuffDefinition = {
        name: 'Differential observer',
        canStack: false,
        effects: [],
        triggeredEffects: (
          [
            'completionGained',
            'perfectionGained',
            'stabilityRestored',
            'stabilitySpent',
            'poolRestored',
            'poolSpent',
          ] as const
        ).map((trigger) => ({
          trigger,
          effects: [
            {
              kind: 'setState',
              key: `${trigger}Amount`,
              mode: 'add',
              value: { value: 1, eqn: 'amount' },
            },
            {
              kind: 'setState',
              key: `${trigger}Calls`,
              mode: 'add',
              value: { value: 1 },
            },
          ],
        })),
      };
      const buffs = new Map(input.state.buffs);
      buffs.set('differential_observer', {
        name: observer.name,
        stacks: 1,
        definition: observer,
      });
      const state = input.state.copy({
        step: input.state.step - (input.state.step % 3),
        buffs,
      });
      const held = new Map(buffs);
      const entry =
        companion === 'su'
          ? Array.from(suScenarios()[0].state.buffs.entries())[0]
          : ([
              HAN_KEY,
              {
                ...hanScenarios()[0].state.buffs.get(HAN_KEY)!,
                definition: {
                  ...hanScenarios()[0].state.buffs.get(HAN_KEY)!.definition!,
                  stabilityLossPrevention: { uses: 0 },
                },
              },
            ] as const);
      held.set(entry[0], entry[1]);
      const transition = (start: typeof state) =>
        applySkill(
          start,
          skill,
          input.config,
          getConditionEffectsForConfig(input.config, input.currentCondition),
          input.targetCompletion,
          input.currentCondition,
          input.targetPerfection,
        );
      const bare = transition(state);
      const actual = transition(state.copy({ buffs: held }));
      expect(Boolean(actual)).toBe(Boolean(bare));
      if (!actual || !bare) return;
      const exception = inertRuntimeExceptions.get(name);
      const exceptedValue = (
        next: NonNullable<typeof actual>,
        field: InertExceptionField,
      ) =>
        field === 'stability'
          ? next.stability
          : next.buffs.get('differential_observer')?.internalState?.[field];
      for (const field of Array.from(exception?.fields ?? [])) {
        expect(exceptedValue(actual, field)).not.toEqual(
          exceptedValue(bare, field),
        );
      }
      const comparable = (next: NonNullable<typeof actual>) => {
        const comparedBuffs = new Map(next.buffs);
        comparedBuffs.delete(entry[0]);
        const observed = comparedBuffs.get('differential_observer');
        if (exception && observed?.internalState) {
          const internalState = { ...observed.internalState };
          for (const field of Array.from(exception.fields)) {
            if (field !== 'stability') delete internalState[field];
          }
          comparedBuffs.set('differential_observer', {
            ...observed,
            internalState,
          });
        }
        return {
          completion: next.completion,
          perfection: next.perfection,
          stability: exception?.fields.has('stability')
            ? undefined
            : next.stability,
          qi: next.qi,
          buffs: comparedBuffs,
        };
      };
      expect(comparable(actual)).toEqual(comparable(bare));
    },
  );
});

describe('companion expected crit parity', () => {
  it.each(['completion', 'perfection'] as const)(
    'aggregates fractional boosted means once for %s',
    (bar) => {
      const base = companionCritScenarios().find(
        (entry) => entry.bar === bar && !entry.multiple,
      )!;
      const observer = base.state.buffs.get('crit_observer')!;
      const buffs = new Map(base.state.buffs);
      buffs.set('crit_observer', {
        ...observer,
        definition: {
          ...observer.definition!,
          stats: { [`${bar}Boost`]: { value: 50 } },
        },
      });
      const state = base.state.copy({ buffs });
      const skill = {
        ...base.skill,
        effects: [
          { kind: bar, amount: { value: 3 } },
          { kind: bar, amount: { value: 3 } },
        ],
      };
      const bareBuffs = new Map(buffs);
      bareBuffs.delete("su_lianhua's_assistance");
      const bare = applySkill(
        state.copy({ buffs: bareBuffs }),
        skill,
        base.config,
      )!;
      expect(bare[bar]).toBe(13);
      const actual = applySkill(state, skill, base.config)!;
      expect(actual[bar]).toBe(13);
      expect(actual.buffs.get('crit_observer')?.internalState).toEqual({
        amount: 13,
        calls: 2,
      });
      expect(calculateSkillGains(state, skill, base.config)[bar]).toBe(13);
    },
  );

  it.each(companionCritScenarios())(
    'matches the non-companion EV and listeners: $name',
    ({ state, skill, config, bar, multiple }) => {
      const buffs = new Map(state.buffs);
      buffs.delete(HAN_KEY);
      buffs.delete("su_lianhua's_assistance");
      const bare = applySkill(state.copy({ buffs }), skill, config)!;
      expect(bare[bar]).toBe(multiple ? 3 : 9);
      const next = applySkill(state, skill, config)!;
      expect(next[bar]).toBe(bare[bar]);
      expect(next.buffs.get('crit_observer')?.internalState).toEqual(
        bare.buffs.get('crit_observer')?.internalState,
      );
      expect(calculateSkillGains(state, skill, config)[bar]).toBe(bare[bar]);
      expect(state.buffs.get('crit_observer')?.internalState).toBeUndefined();
    },
  );
});

describe('companion authoritative Disciplined Touch', () => {
  it.each(companionDisciplinedScenarios())(
    'intercepts the effect tree: $name',
    ({ state, skill, config }) => {
      const bareState = state.copy({ buffs: new Map() });
      const bare = applySkill(bareState, skill, config)!;
      expect([bare.completion, bare.perfection]).toEqual([5, 5]);
      const next = applySkill(state, skill, config)!;
      expect([next.completion, next.perfection]).toEqual([7, 7]);
      const preview = calculateSkillGains(state, skill, config);
      expect([preview.completion, preview.perfection]).toEqual([7, 7]);
      expect(calculateSkillGains(bareState, skill, config)).toEqual({
        completion: 5,
        perfection: 5,
        stability: 0,
      });
    },
  );
});

describe('companion realized pool events', () => {
  it.each(companionPoolScenarios())(
    'dispatches actual clamped deltas including zero: $name',
    ({ state, skill, config, restored, spent, finalQi }) => {
      const next = applySkill(state, skill, config)!;
      expect(next.qi).toBe(finalQi);
      expect(next.buffs.get('pool_delta_observer')?.internalState).toEqual({
        restored,
        spent,
        restoreCalls: 1,
        spendCalls: 1,
      });
      // A zero restoration still fires the event-count/fixed-payout listener.
      expect(next.completion).toBe(restored + 2);
      expect(next.perfection).toBe(spent);
      const preview = calculateSkillGains(state, skill, config);
      expect(preview.completion).toBe(restored + 2);
      expect(preview.perfection).toBe(spent);
      expect(
        state.buffs.get('pool_delta_observer')?.internalState,
      ).toBeUndefined();
    },
  );

  it('distinguishes an executed zero pool effect from a failed technique', () => {
    const base = companionPoolScenarios()[0];
    const skill = {
      ...base.skill,
      effects: [{ kind: 'pool' as const, amount: { value: 0 } }],
    };
    const next = applySkill(base.state, skill, base.config)!;
    expect(next.qi).toBe(200);
    expect(next.completion).toBe(2);
    expect(next.buffs.get('pool_delta_observer')?.internalState).toEqual({
      restored: 0,
      restoreCalls: 1,
    });
    const failed = applySkill(
      base.state,
      { ...skill, successChance: 0 },
      base.config,
    )!;
    expect(failed.completion).toBe(0);
    expect(
      failed.buffs.get('pool_delta_observer')?.internalState,
    ).toBeUndefined();
  });
});

describe('Han survivability floor', () => {
  it.each([
    [0, 1],
    [1, 1],
    [2, 0],
  ])('matches certain payment prevention after %s uses', (used, stability) => {
    const base = hanScenarios()[0];
    const buffs = new Map(base.state.buffs);
    const han = buffs.get(HAN_KEY)!;
    buffs.set(HAN_KEY, {
      ...han,
      internalState: { preventedStabilityLosses: used },
    });
    const state = base.state.copy({ stability: 1, buffs });
    const skill = retargetSkill({
      qiCost: 0,
      stabilityCost: 10,
      successChance: 1,
      effects: [{ kind: 'completion', amount: { value: 1 } }],
    });
    const config = retargetConfig(skill);
    const next = applySkill(state, skill, config)!;
    expect(next.stability).toBe(stability);
    expect(calculateActionSurvivabilityFloor(state, skill, config)).toEqual({
      stability,
      maxStability: next.maxStability,
      survivalProbability: stability > 0 ? 1 : 0,
    });
    expect(state.buffs.get(HAN_KEY)?.internalState).toEqual({
      preventedStabilityLosses: used,
    });
  });
});

describe('companion probability-weighted bar events', () => {
  it.each(companionWeightedBarScenarios())(
    'matches the non-companion contributions and listener gains: $name',
    ({ state, skill, config, bar, otherBar }) => {
      const bareBuffs = new Map(state.buffs);
      bareBuffs.delete(HAN_KEY);
      const bare = applySkill(state.copy({ buffs: bareBuffs }), skill, config)!;
      const observed = { first: 0.5, last: 0.5, total: 1, calls: 2 };
      // The existing non-companion path is the reference: two half-point
      // events, one aggregate progress point, and both listener payouts.
      expect(bare[bar]).toBe(1);
      expect(bare[otherBar]).toBe(4);
      expect(bare.buffs.get('weighted_bar_observer')?.internalState).toEqual(
        observed,
      );
      const next = applySkill(state, skill, config)!;
      expect(next.buffs.get('weighted_bar_observer')?.internalState).toEqual(
        observed,
      );
      expect(next[bar]).toBe(bare[bar]);
      expect(next[otherBar]).toBe(bare[otherBar]);
      const preview = calculateSkillGains(state, skill, config);
      expect(preview[bar]).toBe(1);
      expect(preview[otherBar]).toBe(4);
      expect(
        state.buffs.get('weighted_bar_observer')?.internalState,
      ).toBeUndefined();
    },
  );
});

describe('companion bar overflow', () => {
  it.each([
    ['han', 'completion', 1],
    ['han', 'perfection', 1],
    ['su', 'completion', 1],
    ['su', 'perfection', 1],
    ['han', 'completion', 0.5],
    ['han', 'perfection', 0.5],
    ['su', 'completion', 0.5],
    ['su', 'perfection', 0.5],
  ] as const)(
    'retains overflow before a later drain: %s / %s / p=%s',
    (companion, bar, successChance) => {
      const base = companion === 'han' ? hanScenarios()[0] : suScenarios()[0];
      const state = base.state.copy({ completion: 90, perfection: 90 });
      const skill = retargetSkill({
        qiCost: 0,
        stabilityCost: 0,
        successChance,
        effects: [
          { kind: bar, amount: { value: 20 } },
          { kind: bar, amount: { value: -10 } },
        ],
      });
      const config = retargetConfig(skill, {
        maxCompletion: 100,
        maxPerfection: 100,
      });
      const next = applySkill(state, skill, config)!;
      const bare = applySkill(state.copy({ buffs: new Map() }), skill, config)!;
      expect(next[bar]).toBe(90 + 10 * successChance);
      expect(next[bar]).toBe(bare[bar]);
      expect(calculateSkillGains(state, skill, config)[bar]).toBe(
        10 * successChance,
      );
    },
  );
});

describe('companion fallback technique events', () => {
  it.each(companionReviewScenarios())(
    'retains scalar and Disciplined Touch listeners: $name',
    ({ state, skill, config }) => {
      const observer: BuffDefinition = {
        name: 'Fallback observer',
        canStack: false,
        effects: [],
        triggeredEffects: [
          {
            trigger: 'completionGained',
            effects: [
              { kind: 'perfection', amount: { value: 3 } },
              {
                kind: 'setState',
                key: 'completionCalls',
                mode: 'add',
                value: { value: 1 },
              },
            ],
          },
          {
            trigger: 'perfectionGained',
            effects: [
              {
                kind: 'setState',
                key: 'perfectionCalls',
                mode: 'add',
                value: { value: 1 },
              },
            ],
          },
          {
            trigger: 'stabilityRestored',
            effects: [
              {
                kind: 'setState',
                key: 'stabilityRestored',
                mode: 'add',
                value: { value: 1, eqn: 'amount' },
              },
            ],
          },
        ],
      };
      const buffs = new Map(state.buffs);
      buffs.set('fallback_observer', {
        name: observer.name,
        stacks: 1,
        definition: observer,
      });
      const next = applySkill(state.copy({ buffs }), skill, config)!;
      expect(next.completion).toBe(5);
      expect(next.perfection).toBe((skill.isDisciplinedTouch ? 5 : 7) + 3);
      const observed = next.buffs.get('fallback_observer')?.internalState;
      expect(observed?.completionCalls).toBe(1);
      expect(observed?.perfectionCalls).toBe(2);
      expect(observed?.stabilityRestored ?? 0).toBe(
        skill.isDisciplinedTouch ? 0 : 3,
      );
    },
  );
});

describe('companion shared-success caps', () => {
  it.each(companionCapScenarios())(
    'spends cap headroom only in the successful branch: $name',
    ({ state, skill, config }) => {
      // One 50% success: both bars finish at 100 on success and 0 on failure.
      const next = applySkill(state, skill, config)!;
      const preview = calculateSkillGains(state, skill, config);
      expect(next.completion).toBe(50);
      expect(next.perfection).toBe(50);
      expect(preview.completion).toBe(50);
      expect(preview.perfection).toBe(50);
    },
  );
});

describe('ordered scalar Qi restoration', () => {
  it.each(companionRestoreScenarios())(
    'dispatches the clamped realized delta once: $name',
    ({ name, state, skill, config }) => {
      const next = applySkill(state, skill, config)!;
      const full = name.endsWith('full');
      const techniqueGain = name.endsWith('effect')
        ? name.includes('-su-')
          ? 7
          : 5
        : 0;
      expect(next.qi).toBe(200);
      expect(next.completion).toBe(techniqueGain + (full ? 0 : 3));
      expect(next.buffs.get('qi_restore_observer')?.internalState).toEqual({
        restored: full ? 0 : 3,
        calls: 1,
      });
      expect(
        state.buffs.get('qi_restore_observer')?.internalState,
      ).toBeUndefined();
      if (skill.effects?.length)
        expect(calculateSkillGains(state, skill, config).completion).toBe(
          next.completion,
        );
    },
  );
});

describe('companion paid previews', () => {
  it('honors an already-resolved stability payment override', () => {
    const { state, skill, config } = companionPreviewScenarios()[0];
    expect(calculateSkillGains(state, skill, config).completion).toBe(0);
    expect(
      calculateSkillGains(state, skill, config, [], { stabilityCost: 0 })
        .completion,
    ).toBe(7);
    expect(
      calculateSkillGains(state, skill, config, [], { stabilityCost: 10 })
        .completion,
    ).toBe(0);
  });
  it.each(companionPreviewScenarios())(
    'uses the paid/prevented progress: $name',
    ({ state, skill, config, name }) => {
      const preview = calculateSkillGains(state, skill, config);
      const next = applySkill(state, skill, config)!;
      expect(preview.completion).toBe(0);
      expect(next.completion).toBe(0);
      expect(preview.stability).toBe(
        name.endsWith('payment-use-order') ? -10 : 0,
      );
      expect(next.stability).toBe(name.endsWith('prevented-loss') ? 50 : 40);
      expect(
        state.buffs.get(HAN_KEY)?.internalState?.preventedStabilityLosses ?? 0,
      ).toBe(0);
    },
  );
});

describe('companion scalar compatibility', () => {
  it.each(companionReviewScenarios())(
    'retains offline scalar gains: $name',
    ({ state, skill, config }) => {
      const disciplined = skill.isDisciplinedTouch;
      const next = applySkill(state, skill, config)!;
      const preview = calculateSkillGains(state, skill, config);
      expect(next.completion).toBe(5);
      expect(next.perfection).toBe(disciplined ? 5 : 7);
      expect(next.stability).toBe(disciplined ? 50 : 53);
      expect(preview.completion).toBe(next.completion);
      expect(preview.perfection).toBe(next.perfection);
    },
  );
});

describe('companion integration with final mechanics', () => {
  it.each([
    ['su-live-interceptor', 5, 7, 50, 0],
    ['su-intercepted-progress', 7, 7, 50, 0],
    ['su-live-stability', 7, 0, 40, 0],
    ['su-live-side-effect', 7, 7, 50, 0],
    ['su-shared-success', 0, 0, 2.5, 0],
    ['han-shared-success', 0, 0, 2.5, 0],
    ['han-prevented-payment-progress', 5, 0, 50, 1],
    ['han-prevented-effect-progress', 5, 0, 50, 1],
  ])(
    'preserves live progress and the shared success roll: %s',
    (edge, completion, perfection, stability, uses) => {
      const { state, skill, config } = companionIntegrationScenarios().find(
        (entry) => entry.name === `companion-integration-${edge}`,
      )!;
      const next = applySkill(state, skill, config)!;
      expect(next.completion).toBe(completion);
      expect(next.perfection).toBe(perfection);
      expect(next.stability).toBe(stability);
      expect(
        next.buffs.get(HAN_KEY)?.internalState?.preventedStabilityLosses ?? 0,
      ).toBe(uses);
      if (edge.startsWith('su-')) {
        const preview = calculateSkillGains(state, skill, config);
        expect(preview.completion).toBe(completion);
        expect(preview.perfection).toBe(perfection);
      }
      if (edge === 'su-live-side-effect')
        expect(
          next.buffs.get("su_lianhua's_assistance")?.internalState,
        ).toEqual({ seenLive: 1 });
    },
  );
});

describe('Han Weiguang certainty-only prevention', () => {
  it.each([
    ['payment', 50, 1, 0, 0],
    ['certain-effect', 50, 2, 0, 0],
    ['exhausted', 35, 2, 15, 2],
    ['chance-effect', 45, 0, 5, 1],
    ['uncertain-success', 45, 0, 5, 1],
    ['buff-loss', 50, 1, 0, 0],
    ['chance-buff-loss', 45, 0, 5, 1],
    ['mastery-payment-order', 45, 2, 5, 1],
    ['qi-listener-order', 45, 2, 5, 1],
    ['uncertain-trigger', 46, 0, 4, 1],
    ['chance-buff-trigger', 46, 0, 4, 1],
    ['zero-loss', 50, 0, 0, 0],
    ['held-order', 50, 2, 0, 0],
    ['zero-stacks', 50, 1, 0, 0],
    // The existing final cleanup floors the intermediate mastery mean (48.5).
    ['chance-mastery', 48, 0, 1.5, 1],
  ])(
    'gates negative applications before spending or events: %s',
    (edge, stability, uses, spent, calls) => {
      const { state, skill, config } = hanScenarios().find(
        (s) => s.name === `companion-han-${edge}`,
      )!;
      const before =
        state.buffs.get(HAN_KEY)?.internalState?.preventedStabilityLosses;
      const next = applySkill(state, skill, config)!;
      expect(next.stability).toBe(stability);
      expect(next.stabilityPenalty).toBe(1);
      expect(
        next.buffs.get(HAN_KEY)?.internalState?.preventedStabilityLosses,
      ).toBe(uses);
      expect(Number.isInteger(uses)).toBe(true);
      const events = next.buffs.get('loss_observer')?.internalState;
      expect(events?.spent ?? 0).toBe(spent);
      expect(events?.calls ?? 0).toBe(calls);
      expect(
        state.buffs.get(HAN_KEY)?.internalState?.preventedStabilityLosses,
      ).toBe(before);
      if (edge === 'held-order')
        expect(
          next.buffs.get('second_prevention')?.internalState
            ?.preventedStabilityLosses,
        ).toBe(1);
    },
  );

  it('persists integer uses through clone, JSON replay and later actions', () => {
    const { state, skill, config } = hanScenarios().find(
      (s) => s.name === 'companion-han-payment',
    )!;
    const first = applySkill(state, skill, config)!;
    const cloned = first.copy();
    const revived = reviveStateSnapshot(
      JSON.parse(JSON.stringify(buildStateSnapshot(cloned, 'missing'))),
    );
    expect(revived.buffs.get(HAN_KEY)?.internalState).toEqual({
      preventedStabilityLosses: 1,
    });
    const second = applySkill(revived, skill, config)!;
    const third = applySkill(second, skill, config)!;
    expect(second.stability).toBe(50);
    expect(third.stability).toBe(40);
    expect(
      third.buffs.get(HAN_KEY)?.internalState?.preventedStabilityLosses,
    ).toBe(2);
    expect(
      first.buffs.get(HAN_KEY)?.internalState?.preventedStabilityLosses,
    ).toBe(1);
  });
});

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
      // Mastery +3 intercepts to 4, then technique +5 intercepts to 7.
      // The ordinary +5 buff tick belongs only to the full transition.
      expect(preview.completion).toBe(
        edge === 'mastery-buff' ? 4 + 7 : completion,
      );
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
