import {
  applySkill,
  calculateSkillGains,
  CraftingState,
  initHarmonyData,
  processHarmonyEffect,
  RETURNED_PRECISION,
} from '../optimizer';
import { hydrateHarmonyData } from '../modContent/harmonyState';
import {
  buildStateSnapshot,
  reviveStateSnapshot,
  buildConfigSnapshot,
  reviveConfigSnapshot,
} from '../modContent/replaySnapshot';
import {
  cycleState,
  cycleConfig,
  precisionBuff,
  returningCycleScenarios,
} from './fixtures/returningCycle';
import { retargetSkill } from './fixtures/runtime0717';

const scenarios = returningCycleScenarios();
function run(name: string) {
  const scenario = scenarios.find((s) => s.name === `0717-cycle-${name}`)!;
  const result = applySkill(
    scenario.state,
    scenario.skill,
    scenario.config,
    [],
    100,
    'neutral',
    100,
  );
  expect(result).not.toBeNull();
  return result!;
}

describe('Returning Cycle (RUNTIME_EVIDENCE §17.5; G:318992-319082)', () => {
  it('releases precision silently but emits its ordinary decay loss', () => {
    const next = run('release-silent');
    expect(next.getBuffStacks('returned_precision')).toBe(22);
    expect(next.buffs.get('precision_observer')?.internalState).toEqual({
      lost: 1,
    });
  });
  it.each(['accrue', 'failed-accrue'])(
    'credits reported payment on %s and drains newly earned charges',
    (name) => {
      const next = run(name);
      expect(next.harmonyData?.returningCycle).toEqual({
        charges: 2,
        storedQi: 5,
        chargeSize: 10,
        pulseKey: 1,
        lastOutcome: 'charge',
      });
      expect(next.qi).toBe(69);
      expect(next.harmony).toBe(-6);
    },
  );

  it('drains on zero-cost actions without charging the drain or firing spend triggers', () => {
    const next = run('drain');
    expect(next.qi).toBe(91);
    expect(next.harmony).toBe(-9);
    expect(next.harmonyData?.returningCycle).toMatchObject({
      charges: 3,
      storedQi: 4,
    });
    expect(next.harmonyData?.recommendedTechniqueTypes).toEqual([]);
    expect(run('spend-trigger').completion).toBe(1);
    expect(run('spend-trigger').qi).toBe(87);
    expect(run('restore-does-not-erase-payment').qi).toBe(94);
  });

  it.each(['release', 'failed-release'])(
    'drains before %s, preserving partial progress and delaying precision',
    (name) => {
      const next = run(name);
      expect(next.qi).toBe(73);
      expect(next.harmony).toBe(28);
      expect(next.harmonyData?.returningCycle).toMatchObject({
        charges: 0,
        storedQi: 2,
        lastOutcome: 'release',
      });
      expect(next.buffs.get('returned_precision')?.stacks).toBe(20);
      expect(
        run('release-after-decay').buffs.get('returned_precision')?.stacks,
      ).toBe(22);
    },
  );

  it('applies +1 crit chance per stack, then decays once on subsequent actions', () => {
    const next = run('precision-decay');
    expect(next.completion).toBe(105);
    expect(next.buffs.get('returned_precision')?.stacks).toBe(9);
    const skill = retargetSkill({
      type: 'stabilize',
      qiCost: 0,
      effects: [{ kind: 'completion', amount: { value: 100 } }],
    });
    const state = cycleState({
      harmonyData: {
        returningCycle: { charges: 2, storedQi: 0, chargeSize: 10 },
        recommendedTechniqueTypes: [],
      },
    });
    const release = applySkill(state, skill, cycleConfig(skill))!;
    expect(release.completion).toBe(100);
    expect(release.buffs.get('returned_precision')?.stacks).toBe(10);
    expect(
      calculateSkillGains(release, skill, cycleConfig(skill)).completion,
    ).toBe(105);
    const last = cycleState({
      buffs: new Map([['returned_precision', precisionBuff(1)]]),
    });
    expect(
      applySkill(
        last,
        retargetSkill({ qiCost: 0 }),
        cycleConfig(retargetSkill({ qiCost: 0 })),
      )!.buffs.has('returned_precision'),
    ).toBe(false);
  });

  it('uses epsilon and a fixed initial size, with no charge cap and normal cleanup', () => {
    expect(run('epsilon').harmonyData?.returningCycle).toMatchObject({
      charges: 1,
      storedQi: 0,
    });
    expect(
      run('fixed-initial-size').harmonyData?.returningCycle?.chargeSize,
    ).toBe(10);
    expect(
      run('uncapped-and-clamped').buffs.get('returned_precision')?.stacks,
    ).toBe(5005);
    expect(run('uncapped-and-clamped').harmony).toBe(100);
    expect(run('uncapped-and-clamped').qi).toBe(0);
    expect(run('fractional-drain-cleanup').qi).toBe(99);
    expect(
      initHarmonyData('returningCycle', 5).returningCycle?.chargeSize,
    ).toBe(1);
  });

  it.each(['missing', 'invalid-size', 'invalid-number'])(
    'resets %s cycle data from raw maxpool',
    (name) => {
      expect(run(name).harmonyData?.returningCycle).toMatchObject({
        charges: 2,
        storedQi: 5,
        chargeSize: 10,
      });
    },
  );

  it('still drains/releases without action resolution, but gives no spending credit', () => {
    const result = processHarmonyEffect(
      {
        returningCycle: { charges: 2, storedQi: 3, chargeSize: 10 },
        recommendedTechniqueTypes: [],
      },
      'returningCycle',
      'stabilize',
    );
    expect(result.poolDelta).toBe(-6);
    expect(result.harmonyDelta).toBe(14);
    expect(result.precisionStacksAdded).toBe(10);
    expect(result.harmonyData.returningCycle?.storedQi).toBe(3);
  });

  it('hydrates live state, clones independently, and round-trips replay payloads', () => {
    const raw = {
      returningCycle: {
        charges: 12,
        storedQi: 7.5,
        chargeSize: 25,
        pulseKey: 8,
        lastOutcome: 'charge' as const,
      },
      recommendedTechniqueTypes: [],
    };
    const hydrated = hydrateHarmonyData({
      isSublimeCraft: true,
      craftingType: 'returningCycle',
      progressHarmonyData: raw,
      rawMaxPool: 500,
    });
    const state = cycleState({
      harmonyData: hydrated.harmonyData,
      buffs: new Map([['returned_precision', precisionBuff(14)]]),
    });
    raw.returningCycle.charges = 90;
    const cloned = state.copy();
    expect(cloned.harmonyData?.returningCycle?.charges).toBe(12);
    const revived = reviveStateSnapshot(
      JSON.parse(JSON.stringify(buildStateSnapshot(cloned, 'progressState'))),
    );
    expect(revived.harmonyData).toEqual(cloned.harmonyData);
    expect(revived.buffs.get('returned_precision')?.definition).toEqual(
      RETURNED_PRECISION,
    );
    const skill = retargetSkill({ qiCost: 0 });
    const config = reviveConfigSnapshot(
      JSON.parse(JSON.stringify(buildConfigSnapshot(cycleConfig(skill)))),
    );
    expect(applySkill(revived, config.skills[0], config)).toEqual(
      applySkill(cloned, skill, config),
    );
    expect(
      hydrateHarmonyData({
        isSublimeCraft: true,
        craftingType: 'returningCycle',
        rawMaxPool: 250,
      }).harmonyData?.returningCycle?.chargeSize,
    ).toBe(25);
    expect(
      hydrateHarmonyData({
        isSublimeCraft: true,
        craftingType: 'returningCycle',
        progressHarmonyData: {
          returningCycle: { charges: 9, storedQi: Infinity, chargeSize: 5 },
          recommendedTechniqueTypes: [],
        },
        rawMaxPool: 250,
      }).harmonyData?.returningCycle,
    ).toEqual({ charges: 0, storedQi: 0, chargeSize: 25 });
    expect(
      new CraftingState({ harmonyData: cloned.harmonyData }).harmonyData
        ?.returningCycle,
    ).not.toBe(cloned.harmonyData?.returningCycle);
  });
});
