import { CraftingState, type TrackedBuff } from '../../optimizer/state';
import type {
  BuffDefinition,
  TechniqueEffect,
} from '../../optimizer/gameTypes';
import { retargetConfig, retargetSkill } from './runtime0717';

export function suBuff(): BuffDefinition {
  return {
    name: "Su Lianhua's Assistance",
    canStack: false,
    effects: [],
    craftingEffectInterceptors: [
      {
        appliesTo: ['completion', 'perfection'],
        trigger: {
          kind: 'condition',
          condition: 'step % 3 == 2 && amount > 0',
        },
        modifier: { kind: 'multiply', value: 1.5 },
      },
    ],
  };
}

export function companionScenarios() {
  return [
    ...suScenarios(),
    ...hanScenarios(),
    ...companionIntegrationScenarios(),
    ...companionReviewScenarios(),
    ...companionPreviewScenarios(),
    ...companionRestoreScenarios(),
    ...companionCapScenarios(),
    ...companionWeightedBarScenarios(),
  ];
}

export function companionWeightedBarScenarios() {
  return (['completion', 'perfection'] as const).flatMap((bar) =>
    [0, 2].map((used) => {
      const base = hanScenarios()[0];
      const otherBar: 'completion' | 'perfection' =
        bar === 'completion' ? 'perfection' : 'completion';
      const observer: BuffDefinition = {
        name: 'Weighted bar observer',
        canStack: false,
        effects: [],
        triggeredEffects: [
          {
            trigger: `${bar}Gained`,
            effects: [
              {
                kind: 'setState',
                key: 'first',
                value: { value: 1, eqn: 'amount' },
                condition: { kind: 'condition', condition: 'calls == 0' },
              },
              {
                kind: 'setState',
                key: 'last',
                value: { value: 1, eqn: 'amount' },
              },
              {
                kind: 'setState',
                key: 'total',
                mode: 'add',
                value: { value: 1, eqn: 'amount' },
              },
              {
                kind: 'setState',
                key: 'calls',
                mode: 'add',
                value: { value: 1 },
              },
              { kind: otherBar, amount: { value: 2 } },
            ],
          },
        ],
      };
      const buffs = new Map(base.state.buffs);
      buffs.set(HAN_KEY, {
        ...buffs.get(HAN_KEY)!,
        internalState: { preventedStabilityLosses: used },
      });
      buffs.set('weighted_bar_observer', {
        name: observer.name,
        stacks: 1,
        definition: observer,
      });
      const skill = retargetSkill({
        qiCost: 0,
        stabilityCost: 0,
        successChance: 0.5,
        effects: [
          { kind: bar, amount: { value: 1 } },
          { kind: bar, amount: { value: 1 } },
        ],
      });
      return {
        name: `companion-weighted-events-${bar}-${used}`,
        state: base.state.copy({ buffs }),
        skill,
        config: retargetConfig(skill),
        bar,
        otherBar,
      };
    }),
  );
}

export function companionCapScenarios() {
  return ['su', 'han'].map((companion) => {
    const base = companion === 'su' ? suScenarios()[0] : hanScenarios()[0];
    const skill = retargetSkill({
      qiCost: 0,
      stabilityCost: 0,
      successChance: 0.5,
      effects: [
        { kind: 'completion', amount: { value: 100 } },
        { kind: 'completion', amount: { value: 100 } },
        { kind: 'perfection', amount: { value: 100 } },
        { kind: 'perfection', amount: { value: 100 } },
      ],
    });
    return {
      name: `companion-shared-cap-${companion}`,
      state: base.state,
      skill,
      config: retargetConfig(skill, { maxCompletion: 100, maxPerfection: 100 }),
    };
  });
}

export function companionRestoreScenarios() {
  return ['su-scalar', 'han-scalar', 'su-effect', 'han-effect', 'han-full'].map(
    (edge) => {
      const base = edge.startsWith('su-')
        ? suScenarios()[2]
        : hanScenarios()[0];
      const observer: BuffDefinition = {
        name: 'Qi restore observer',
        canStack: false,
        effects: [],
        stats: { qiBoost: { value: 50 } },
        triggeredEffects: [
          {
            trigger: 'poolRestored',
            effects: [
              { kind: 'completion', amount: { value: 1, eqn: 'amount' } },
              {
                kind: 'setState',
                key: 'restored',
                mode: 'add',
                value: { value: 1, eqn: 'amount' },
              },
              {
                kind: 'setState',
                key: 'calls',
                mode: 'add',
                value: { value: 1 },
              },
            ],
          },
        ],
      };
      const buffs = new Map(base.state.buffs);
      buffs.set('qi_restore_observer', {
        name: observer.name,
        stacks: 1,
        definition: observer,
      });
      const full = edge === 'han-full';
      const state = base.state.copy({ qi: full ? 200 : 199, buffs });
      const skill = retargetSkill({
        qiCost: full ? 0 : 2,
        stabilityCost: 0,
        restoresQi: true,
        qiRestore: 10,
        effects: edge.endsWith('effect')
          ? [{ kind: 'completion', amount: { value: 5 } }]
          : undefined,
      });
      return {
        name: `companion-restore-${edge}`,
        state,
        skill,
        config: retargetConfig(skill),
      };
    },
  );
}

export function companionPreviewScenarios() {
  return ['su-paid-gate', 'han-prevented-loss', 'han-payment-use-order'].map(
    (edge) => {
      const base = edge.startsWith('su-')
        ? suScenarios()[2]
        : hanScenarios()[0];
      const effects: TechniqueEffect[] =
        edge === 'su-paid-gate'
          ? [
              {
                kind: 'completion',
                amount: { value: 5 },
                condition: { kind: 'stability', mode: 'more', percentage: 75 },
              },
            ]
          : [{ kind: 'stability', amount: { value: -5 } }];
      if (edge === 'han-payment-use-order')
        effects.push({ kind: 'stability', amount: { value: -10 } });
      const skill = retargetSkill({
        qiCost: 0,
        stabilityCost: edge === 'han-prevented-loss' ? 0 : 10,
        effects,
      });
      return {
        name: `companion-preview-${edge}`,
        state: base.state,
        skill,
        config: retargetConfig(skill),
      };
    },
  );
}

export function companionReviewScenarios() {
  return ['su-scalar', 'han-scalar', 'su-disciplined', 'han-disciplined'].map(
    (edge) => {
      const base = edge.startsWith('su-')
        ? suScenarios()[2]
        : hanScenarios()[0];
      const disciplined = edge.endsWith('disciplined');
      const skill = retargetSkill({
        qiCost: 0,
        stabilityCost: 0,
        baseCompletionGain: disciplined ? 0.5 : 5,
        basePerfectionGain: disciplined ? 0.5 : 7,
        stabilityGain: disciplined ? 0 : 3,
        isDisciplinedTouch: disciplined,
      });
      return {
        name: `companion-review-${edge}`,
        state: base.state,
        skill,
        config: retargetConfig(skill),
      };
    },
  );
}

/** Rebase joins: live progress must use intercepted/prevented amounts, while
 * every stability effect still shares the one captured technique success. */
export function companionIntegrationScenarios() {
  return [
    'su-live-interceptor',
    'su-intercepted-progress',
    'su-live-stability',
    'su-live-side-effect',
    'su-shared-success',
    'han-shared-success',
    'han-prevented-payment-progress',
    'han-prevented-effect-progress',
  ].map((edge) => {
    const isHan = edge.startsWith('han-');
    const base = isHan
      ? hanScenarios().find((entry) => entry.name === 'companion-han-payment')!
      : suScenarios().find((entry) => entry.name === 'companion-su-step-2')!;
    const skill = retargetSkill({
      qiCost: 0,
      stabilityCost: 0,
      effects: [
        { kind: 'completion', amount: { value: 5 } },
        { kind: 'perfection', amount: { value: 5 } },
      ],
    });
    let state = base.state;
    const su = state.buffs.get("su_lianhua's_assistance")?.definition;
    if (edge === 'su-live-interceptor')
      su!.craftingEffectInterceptors![0].trigger = {
        kind: 'completion',
        mode: 'more',
        percentage: 5,
      };
    if (edge === 'su-intercepted-progress')
      skill.effects![1].condition = {
        kind: 'completion',
        mode: 'more',
        percentage: 6,
      };
    if (edge === 'su-live-stability') {
      su!.craftingEffectInterceptors![0].trigger = {
        kind: 'stability',
        mode: 'less',
        percentage: 75,
      };
      skill.effects = [
        { kind: 'stability' as const, amount: { value: -10 } },
        { kind: 'completion', amount: { value: 5 } },
      ];
    }
    if (edge === 'su-live-side-effect')
      su!.craftingEffectInterceptors![0].effects = [
        {
          kind: 'setState',
          key: 'seenLive',
          value: { value: 1 },
          condition: {
            kind: 'completion',
            mode: 'more',
            percentage: 6,
          },
        },
      ];
    if (edge.endsWith('shared-success')) {
      // One shared 50% roll: success gives 5 - 10 + 4 = -1, cleaned to 0;
      // failure retains 5. The cleanup expectation is (0 + 5) / 2 = 2.5,
      // not cleanup of the mean (-10 and +4 weighted separately).
      state = state.copy({ stability: 5 });
      skill.successChance = 0.5;
      skill.effects = [
        { kind: 'stability', amount: { value: -10 } },
        { kind: 'stability', amount: { value: 4 } },
      ];
    }
    if (edge.includes('prevented-')) {
      skill.effects = [
        {
          kind: 'completion',
          amount: { value: 5 },
          condition: {
            kind: 'stability',
            mode: 'more',
            percentage: 80,
          },
        },
      ];
      if (edge === 'han-prevented-payment-progress') skill.stabilityCost = 10;
      else
        skill.effects!.unshift({ kind: 'stability', amount: { value: -10 } });
    }
    return {
      name: `companion-integration-${edge}`,
      state,
      skill,
      config: retargetConfig(skill),
    };
  });
}

export const HAN_KEY = "han_weiguang's_assistance";

export function hanScenarios() {
  return [
    'payment',
    'certain-effect',
    'exhausted',
    'chance-effect',
    'uncertain-success',
    'buff-loss',
    'chance-buff-loss',
    'mastery-payment-order',
    'qi-listener-order',
    'uncertain-trigger',
    'chance-buff-trigger',
    'zero-loss',
    'held-order',
    'zero-stacks',
    'chance-mastery',
  ].map((edge) => {
    const han: BuffDefinition = {
      name: "Han Weiguang's Assistance",
      canStack: false,
      effects: [],
      stabilityLossPrevention: { uses: 2 },
    };
    const observer: BuffDefinition = {
      name: 'Loss observer',
      canStack: false,
      effects: [],
      triggeredEffects: [
        {
          trigger: 'stabilitySpent',
          effects: [
            {
              kind: 'setState',
              key: 'spent',
              mode: 'add',
              value: { value: 1, eqn: 'amount' },
            },
            {
              kind: 'setState',
              key: 'calls',
              mode: 'add',
              value: { value: 1 },
            },
          ],
        },
      ],
    };
    const skill = retargetSkill({ qiCost: 0, stabilityCost: 0, effects: [] });
    const buffs = new Map<string, TrackedBuff>([
      [
        HAN_KEY,
        {
          name: han.name,
          stacks: edge === 'zero-stacks' ? 0 : 1,
          definition: han,
          internalState: {
            preventedStabilityLosses:
              edge === 'exhausted' ? 2 : edge === 'held-order' ? 1 : 0,
          },
        },
      ],
      [
        'loss_observer',
        { name: observer.name, stacks: 1, definition: observer },
      ],
    ]);
    if (
      [
        'payment',
        'exhausted',
        'mastery-payment-order',
        'qi-listener-order',
        'held-order',
        'zero-stacks',
      ].includes(edge)
    )
      skill.stabilityCost = 10;
    if (
      [
        'certain-effect',
        'exhausted',
        'mastery-payment-order',
        'qi-listener-order',
        'held-order',
      ].includes(edge)
    ) {
      skill.effects = [{ kind: 'stability', amount: { value: -5 } }];
      if (edge === 'certain-effect')
        skill.effects.push({ kind: 'stability', amount: { value: -10 } });
    }
    if (edge === 'chance-effect' || edge === 'uncertain-success') {
      skill.effects = [
        {
          kind: 'stability',
          amount: { value: -10 },
          condition:
            edge === 'chance-effect'
              ? { kind: 'chance', percentage: 50 }
              : undefined,
        },
      ];
      if (edge === 'uncertain-success') skill.successChance = 0.5;
    }
    if (edge === 'buff-loss' || edge === 'chance-buff-loss')
      observer.effects = [
        {
          kind: 'stability',
          amount: { value: edge === 'buff-loss' ? -5 : -10 },
          condition:
            edge === 'chance-buff-loss'
              ? { kind: 'chance', percentage: 50 }
              : undefined,
        },
      ];
    if (edge === 'mastery-payment-order' || edge === 'chance-mastery')
      skill.masteryEntries = [
        {
          kind: 'effect',
          condition:
            edge === 'chance-mastery'
              ? { kind: 'chance', percentage: 50 }
              : undefined,
          effects: [{ kind: 'stability', amount: { value: -3 } }],
        },
      ];
    if (edge === 'qi-listener-order') {
      skill.qiCost = 10;
      observer.triggeredEffects!.push({
        trigger: 'poolSpent',
        effects: [{ kind: 'stability', amount: { value: -4 } }],
      });
    }
    if (edge === 'uncertain-trigger' || edge === 'chance-buff-trigger') {
      if (edge === 'uncertain-trigger') {
        skill.successChance = 0.5;
        skill.effects = [{ kind: 'completion', amount: { value: 4 } }];
      } else
        observer.effects = [
          {
            kind: 'completion',
            amount: { value: 4 },
            condition: { kind: 'chance', percentage: 50 },
          },
        ];
      observer.triggeredEffects!.push({
        trigger: 'completionGained',
        effects: [{ kind: 'stability', amount: { value: -4 } }],
      });
    }
    if (edge === 'zero-loss')
      skill.effects = [{ kind: 'stability', amount: { value: -0.5 } }];
    if (edge === 'held-order') {
      const second = { ...han, name: 'Second prevention' };
      buffs.set('second_prevention', {
        name: second.name,
        stacks: 1,
        definition: second,
        internalState: { preventedStabilityLosses: 0 },
      });
    }
    return {
      name: `companion-han-${edge}`,
      state: new CraftingState({ qi: 100, stability: 50, buffs }),
      skill,
      config: retargetConfig(skill),
    };
  });
}

export function suScenarios() {
  return [
    'step-0',
    'step-1',
    'step-2',
    'mastery-buff',
    'floors',
    'type-exclusion',
    'item-exclusion',
    'synchronous',
    'chance-side-effect',
    'crit-boost',
  ].map((edge) => {
    const su = suBuff();
    const skill = retargetSkill({
      qiCost: 0,
      stabilityCost: 0,
      effects: [
        { kind: 'completion', amount: { value: 5 } },
        { kind: 'perfection', amount: { value: 5 } },
      ],
    });
    const buffs = new Map([
      [
        su.name.toLowerCase().replace(/ /g, '_'),
        { name: su.name, stacks: 1, definition: su },
      ],
    ]);
    if (edge === 'mastery-buff') {
      skill.masteryEntries = [
        {
          kind: 'effect',
          effects: [{ kind: 'completion', amount: { value: 3 } }],
        },
      ];
      su.effects = [{ kind: 'completion', amount: { value: 5 } }];
    }
    if (edge === 'floors') {
      su.craftingEffectInterceptors!.push({
        appliesTo: ['completion', 'perfection'],
        modifier: { kind: 'multiply', value: 10 },
      });
      const second = { ...suBuff(), name: 'Second interceptor' };
      buffs.set('second_interceptor', {
        name: second.name,
        stacks: 0,
        definition: second,
      });
    }
    if (edge === 'type-exclusion')
      su.craftingEffectInterceptors![0].techniqueTypes = ['fusion'];
    if (edge === 'item-exclusion') {
      skill.actionKind = 'item';
      skill.itemName = skill.key;
      skill.consumesTurn = false;
    }
    if (edge === 'synchronous' || edge === 'chance-side-effect') {
      su.craftingEffectInterceptors![0].effects = [
        {
          kind: 'setState',
          key: 'charged',
          mode: 'add',
          value: { value: 1 },
          condition:
            edge === 'chance-side-effect'
              ? { kind: 'chance', percentage: 50 }
              : undefined,
        },
      ];
      su.triggeredEffects = [
        {
          trigger: 'completionGained',
          effects: [
            {
              kind: 'setState',
              key: 'seen',
              value: { value: 1, eqn: 'charged' },
            },
          ],
        },
      ];
    }
    if (edge === 'crit-boost')
      su.stats = {
        completionBoost: { value: 50 },
        perfectionBoost: { value: 50 },
      };
    const step = edge === 'step-0' ? 0 : edge === 'step-1' ? 1 : 2;
    const state = new CraftingState({
      qi: 100,
      stability: 50,
      step,
      critChance: edge === 'crit-boost' ? 100 : 0,
      critMultiplier: 200,
      buffs,
      items: new Map([[skill.key, 1]]),
    });
    return {
      name: `companion-su-${edge}`,
      state,
      skill,
      config: retargetConfig(skill),
    };
  });
}
