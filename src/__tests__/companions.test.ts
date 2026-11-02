import { applySkill, calculateSkillGains } from '../optimizer/skills';
import { buildNativeMctsInput } from '../optimizer/nativeMcts';
import {
  buildStateSnapshot,
  reviveStateSnapshot,
} from '../modContent/replaySnapshot';
import { HAN_KEY, hanScenarios, suScenarios } from './fixtures/companions';

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

  it('persists integer uses through clone, JSON replay, the native payload and later actions', () => {
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
    const native = buildNativeMctsInput({
      state: revived,
      config,
      targetCompletion: 100,
      targetPerfection: 100,
    });
    expect(
      native.state.buffs.find((buff) => buff.key === HAN_KEY)?.internal_state,
    ).toEqual({ preventedStabilityLosses: 1 });
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
      expect(preview.completion).toBe(edge === 'mastery-buff' ? 7 : completion);
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
