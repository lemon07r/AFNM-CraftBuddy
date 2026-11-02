import { CraftingState, type TrackedBuff } from '../../optimizer/state';
import type { BuffDefinition } from '../../optimizer/gameTypes';
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
  return [...suScenarios(), ...hanScenarios()];
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
