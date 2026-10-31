import type {
  BuffDefinition,
  BuffEffect,
  CraftingTechniqueCondition,
} from '../../optimizer/gameTypes';

// Mechanics-only transcription of 0.7.18 Flickering Celadon Flame. Payout
// values remain payload data; the simulator must not hardcode these bonuses.
export const emberNames = [
  'Fusion Ember',
  'Refinement Ember',
  'Support Ember',
  'Stability Ember',
] as const;
export const embers: BuffDefinition[] = emberNames.map((name) => ({
  name,
  canStack: false,
  maxStacks: 1,
  effects: [],
}));
const ready: CraftingTechniqueCondition = {
  kind: 'condition',
  condition: emberNames
    .map((name) => `${name.replace(/ /g, '_')} >= 1`)
    .join(' and '),
};
const payout: BuffEffect[] = [
  { kind: 'pool', amount: { value: 0.1, stat: 'maxpool' }, condition: ready },
  { kind: 'stability', amount: { value: 10 }, condition: ready },
  ...embers.map((buff) => ({
    kind: 'createBuff' as const,
    buff,
    stacks: { value: -1 },
    condition: ready,
  })),
];
export const celadonCycle: BuffDefinition = {
  name: 'Celadon Cycle',
  canStack: false,
  effects: [],
  onFusion: [{ kind: 'createBuff', buff: embers[0], stacks: { value: 1 } }],
  onRefine: [{ kind: 'createBuff', buff: embers[1], stacks: { value: 1 } }],
  onSupport: [{ kind: 'createBuff', buff: embers[2], stacks: { value: 1 } }],
  onStabilize: [{ kind: 'createBuff', buff: embers[3], stacks: { value: 1 } }],
  triggeredEffects: embers.map((buff) => ({
    trigger: `stackGained.${buff.name}`,
    effects: payout,
  })),
};
