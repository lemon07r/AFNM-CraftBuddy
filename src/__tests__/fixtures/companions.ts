import { CraftingState } from '../../optimizer/state';
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
  return suScenarios();
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
