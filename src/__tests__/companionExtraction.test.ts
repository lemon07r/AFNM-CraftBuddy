import type { CraftingBuff } from 'afnm-types';
import { CraftingState } from '../optimizer';
import { extractTrackedBuffs } from '../modContent/craftStateExtraction';
import {
  buildStateSnapshot,
  reviveStateSnapshot,
} from '../modContent/replaySnapshot';

describe('companion live extraction and replay', () => {
  it('retains ordered interceptor definitions and live prevention uses, including held zero-stack companions', () => {
    const su: CraftingBuff = {
      name: "Su Lianhua's Assistance",
      icon: '',
      canStack: false,
      stats: undefined,
      stacks: 1,
      effects: [],
      displayLocation: 'none',
      craftingEffectInterceptors: [
        {
          appliesTo: ['completion', 'perfection'],
          trigger: {
            kind: 'condition',
            condition: 'step % 3 == 2 && amount > 0',
          },
          modifier: { kind: 'multiply', value: 1.5 },
        },
        {
          appliesTo: ['completion', 'perfection'],
          modifier: { kind: 'multiply', value: 2.25 },
        },
      ],
    };
    const han: CraftingBuff = {
      name: "Han Weiguang's Assistance",
      icon: '',
      canStack: false,
      stats: undefined,
      stacks: 0,
      effects: [],
      displayLocation: 'none',
      additionalVariables: { preventedStabilityLosses: 0, preventionLimit: 2 },
      craftingEffectInterceptors: [
        {
          scope: 'resource',
          appliesTo: ['stability'],
          trigger: {
            kind: 'condition',
            condition:
              'amount < 0 && preventedStabilityLosses < preventionLimit',
          },
          modifier: {
            kind: 'multiply',
            value: {
              value: 0,
              stat: undefined,
              additiveEqn: '0 * unique_Pill',
            },
          },
          effects: [
            {
              kind: 'setState',
              key: 'preventedStabilityLosses',
              mode: 'add',
              value: { value: 1, stat: undefined },
            },
          ],
        },
      ],
      internalState: { preventedStabilityLosses: 1, invalid: Infinity },
    };
    const buffs = extractTrackedBuffs([su, han]);
    expect(Array.from(buffs.keys())).toEqual([
      "su_lianhua's_assistance",
      "han_weiguang's_assistance",
    ]);
    expect(buffs.get("han_weiguang's_assistance")?.internalState).toEqual({
      preventedStabilityLosses: 1,
    });
    const state = new CraftingState({ buffs });
    const revived = reviveStateSnapshot(
      JSON.parse(JSON.stringify(buildStateSnapshot(state, 'missing'))),
    );
    expect(revived.buffs).toEqual(buffs);
    expect(
      revived.buffs.get("su_lianhua's_assistance")?.definition
        ?.craftingEffectInterceptors,
    ).toEqual([
      {
        appliesTo: ['completion', 'perfection'],
        trigger: {
          kind: 'condition',
          condition: 'step % 3 == 2 && amount > 0',
        },
        modifier: { kind: 'multiply', value: 1.5 },
      },
      {
        appliesTo: ['completion', 'perfection'],
        modifier: { kind: 'multiply', value: 2.25 },
      },
    ]);
    expect(
      revived.buffs.get("han_weiguang's_assistance")?.definition
        ?.craftingEffectInterceptors,
    ).toEqual(han.craftingEffectInterceptors);
    expect(
      revived.buffs.get("han_weiguang's_assistance")?.definition
        ?.additionalVariables,
    ).toEqual(han.additionalVariables);
  });

  it('defaults missing stacks to zero but still rejects nonfinite stacks', () => {
    const base: CraftingBuff = {
      name: 'Missing stacks',
      icon: '',
      stacks: 0,
      stats: undefined,
      displayLocation: 'none',
      canStack: false,
      effects: [],
    };
    const { stacks: _stacks, ...missing } = base;
    const buffs = extractTrackedBuffs([
      missing as CraftingBuff,
      { ...base, name: 'Negative stacks', stacks: -2 },
      { ...base, name: 'Invalid stacks', stacks: Infinity },
    ]);
    expect(Array.from(buffs, ([key, buff]) => [key, buff.stacks])).toEqual([
      ['missing_stacks', 0],
      ['negative_stacks', -2],
    ]);
  });
});
