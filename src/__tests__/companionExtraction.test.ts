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
      stabilityLossPrevention: { uses: 2 },
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
    ).toEqual(su.craftingEffectInterceptors);
    expect(
      revived.buffs.get("han_weiguang's_assistance")?.definition
        ?.stabilityLossPrevention,
    ).toEqual({ uses: 2 });
  });
});
