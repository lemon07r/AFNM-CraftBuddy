import { applySkill, calculateSkillGains } from '../optimizer/skills';
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
  hanScenarios,
  suScenarios,
} from './fixtures/companions';

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
      expect(next.buffs.get('qi_restore_observer')?.internalState).toEqual(
        full ? undefined : { restored: 3, calls: 1 },
      );
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
