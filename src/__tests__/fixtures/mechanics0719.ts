import { CraftingState } from '../../optimizer/state';
import { retargetConfig, retargetSkill } from './runtime0717';
import type { BuffDefinition } from '../../optimizer/gameTypes';

export function mechanics0719Scenarios() {
  return [
    ...[
      { name: 'overdraft', stability: 1, cost: 10, gain: 0, tick: 7 },
      { name: 'overdraft-rescue', stability: 1, cost: 10, gain: 0, tick: 12 },
      { name: 'temporary-excess', stability: 58, cost: 0, gain: 5, tick: -5 },
    ].map(({ name, stability, cost, gain, tick }) => {
      const definition: BuffDefinition = {
        name: 'Stability tick',
        canStack: true,
        effects: [{ kind: 'stability', amount: { value: tick } }],
      };
      const skill = retargetSkill({
        qiCost: 0,
        stabilityCost: cost,
        effects: [{ kind: 'stability', amount: { value: gain } }],
      });
      return {
        name: `0719-${name}`,
        state: new CraftingState({
          qi: 100,
          stability,
          initialMaxStability: 60,
          buffs: new Map([
            [
              'stability_tick',
              { name: definition.name, stacks: 1, definition },
            ],
          ]),
        }),
        skill,
        config: retargetConfig(skill),
      };
    }),
  ];
}
