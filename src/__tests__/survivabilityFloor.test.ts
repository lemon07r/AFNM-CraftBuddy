import { readFileSync } from 'fs';
import { join } from 'path';
import { CraftingState } from '../optimizer/state';
import {
  applySkill,
  calculateActionSurvivabilityFloor,
  getConditionEffectsForConfig,
} from '../optimizer/skills';
import {
  StabilityProjection,
  type StabilityOutcome,
} from '../optimizer/stability';
import { reviveSearchInput } from '../optimizer/searchBackend';
import type { DifferentialCorpus } from './fixtures/differentialCorpus';
import { retargetConfig, retargetSkill } from './fixtures/runtime0717';
import type { BuffDefinition } from '../optimizer/gameTypes';

const corpus = JSON.parse(
  readFileSync(join(__dirname, 'fixtures/transition_corpus.json'), 'utf8'),
) as DifferentialCorpus;

describe('transition-derived survivability floor', () => {
  const finish = StabilityProjection.prototype.finish;
  let projections: StabilityOutcome[][];

  beforeEach(() => {
    projections = [];
    jest
      .spyOn(StabilityProjection.prototype, 'finish')
      .mockImplementation(function (
        this: StabilityProjection,
        maximum,
        decay,
        cleanup,
        visitOutcome,
      ) {
        const outcomes: StabilityOutcome[] = [];
        const result = finish.call(this, maximum, decay, cleanup, (outcome) => {
          outcomes.push(outcome);
          visitOutcome?.(outcome);
        });
        projections.push(outcomes);
        return result;
      });
  });
  afterEach(() => jest.restoreAllMocks());

  it.each(corpus.scenarios)('differentially replays $name', (scenario) => {
    const input = reviveSearchInput(scenario.input);
    const effects = getConditionEffectsForConfig(
      input.config,
      input.currentCondition ?? 'neutral',
    );
    for (const entry of scenario.cases) {
      const skill = input.config.skills[entry.skillIndex];
      // Same public invocation as the standalone floor; the golden suite
      // independently pins explicit-target transitions and all persisted fields.
      const next = applySkill(
        input.state,
        skill,
        input.config,
        effects,
        0,
        input.currentCondition,
      );
      const outcomes = projections[projections.length - 1];
      const floor = calculateActionSurvivabilityFloor(
        input.state,
        skill,
        input.config,
        effects,
        input.currentCondition,
      );
      if (!next) {
        expect(floor).toBeNull();
        continue;
      }
      expect(floor).not.toBeNull();
      expect(outcomes.length).toBeGreaterThan(0);
      for (const outcome of outcomes) {
        expect(floor!.stability).toBeLessThanOrEqual(outcome.stability);
        expect(floor!.maxStability).toBeLessThanOrEqual(outcome.maxStability);
      }
      expect(floor!.survivalProbability).toBeCloseTo(
        outcomes.reduce(
          (mass, outcome) =>
            mass + (outcome.stability > 0 ? outcome.probability : 0),
          0,
        ),
        12,
      );
      if (
        outcomes.every(
          (outcome) =>
            outcome.stability === outcomes[0].stability &&
            outcome.maxStability === outcomes[0].maxStability,
        )
      ) {
        expect(floor!.stability).toBeCloseTo(next.stability, 12);
        expect(floor!.maxStability).toBeCloseTo(next.maxStability, 12);
      }
      const count = projections.length;
      expect(
        calculateActionSurvivabilityFloor(
          input.state,
          skill,
          input.config,
          effects,
          input.currentCondition,
          next,
        ),
      ).toEqual(floor);
      expect(projections).toHaveLength(count); // exact reuse, not another execution
    }
  });

  it('pays after consuming its cost-reduction buff (old floor 1, transition 0)', () => {
    const ward: BuffDefinition = {
      name: 'Payment ward',
      canStack: false,
      effects: [],
      stats: { stabilityCostReduction: { value: 100 } },
    };
    const state = new CraftingState({
      qi: 100,
      stability: 1,
      buffs: new Map([
        ['payment_ward', { name: ward.name, stacks: 1, definition: ward }],
      ]),
    });
    const skill = retargetSkill({
      qiCost: 0,
      stabilityCost: 10,
      buffCost: { buffName: 'payment_ward', consumeAll: true },
      effects: [{ kind: 'completion', amount: { value: 1 } }],
    });
    const config = retargetConfig(skill);
    expect(applySkill(state, skill, config)!.stability).toBe(0);
    expect(calculateActionSurvivabilityFloor(state, skill, config)).toEqual({
      stability: 0,
      maxStability: 59,
      survivalProbability: 0,
    });
  });

  it.each([100, 50])(
    'includes a %s%% effect mastery before payment (old certain floor 0, transition 16)',
    (percentage) => {
      const state = new CraftingState({ qi: 100, stability: 1 });
      const skill = retargetSkill({
        qiCost: 0,
        stabilityCost: 10,
        masteryEntries: [
          {
            kind: 'effect',
            condition: { kind: 'chance', percentage },
            effects: [{ kind: 'stability', amount: { value: 25 } }],
          },
        ],
        effects: [{ kind: 'completion', amount: { value: 1 } }],
      });
      const config = retargetConfig(skill);
      // Preserve the transition's established mastery EV boundary at 50%.
      expect(applySkill(state, skill, config)!.stability).toBe(
        percentage === 100 ? 16 : 3,
      );
      expect(calculateActionSurvivabilityFloor(state, skill, config)).toEqual({
        stability: percentage === 100 ? 16 : 0,
        maxStability: 59,
        survivalProbability: percentage / 100,
      });
    },
  );

  it('carries signed maximum repair through an equal ordinary buff loss', () => {
    const drain: BuffDefinition = {
      name: 'Maximum drain',
      canStack: false,
      effects: [{ kind: 'maxStability', amount: { value: -10 } }],
    };
    const state = new CraftingState({
      qi: 100,
      stability: 8,
      initialMaxStability: 10,
      buffs: new Map([
        ['maximum_drain', { name: drain.name, stacks: 1, definition: drain }],
      ]),
    });
    const skill = retargetSkill({
      qiCost: 0,
      stabilityCost: 0,
      effects: [{ kind: 'maxStability', amount: { value: 10 } }],
    });
    const config = retargetConfig(skill);
    const next = applySkill(state, skill, config)!;
    expect(next.stability).toBe(8);
    expect(next.maxStability).toBe(9);
    expect(calculateActionSurvivabilityFloor(state, skill, config)).toEqual({
      stability: next.stability,
      maxStability: next.maxStability,
      survivalProbability: 1,
    });
  });

  it.each([0, 0.25, 0.75, 1])(
    'shares the %s success roll across beneficial and harmful technique effects',
    (successChance) => {
      const state = new CraftingState({ qi: 100, stability: 1 });
      const skill = retargetSkill({
        qiCost: 0,
        stabilityCost: 10,
        successChance,
        effects: [
          { kind: 'stability', amount: { value: 20 } },
          { kind: 'stability', amount: { value: -20 } },
        ],
      });
      const config = retargetConfig(skill);
      expect(applySkill(state, skill, config)!.stability).toBe(0);
      expect(calculateActionSurvivabilityFloor(state, skill, config)).toEqual({
        stability: 0,
        maxStability: 59,
        survivalProbability: 0,
      });
    },
  );

  it('branches scalar restoration without changing legacy expected stability', () => {
    const state = new CraftingState({ qi: 100, stability: 1 });
    const skill = retargetSkill({
      qiCost: 0,
      stabilityCost: 10,
      stabilityGain: 20,
      successChance: 0.75,
    });
    const config = retargetConfig(skill);
    expect(applySkill(state, skill, config)!.stability).toBe(6);
    expect(calculateActionSurvivabilityFloor(state, skill, config)).toEqual({
      stability: 0,
      maxStability: 59,
      survivalProbability: 0.75,
    });
  });

  it('counts harmful chance branches as well as beneficial rescue branches', () => {
    const state = new CraftingState({
      qi: 100,
      stability: 5,
      initialMaxStability: 10,
    });
    const skill = retargetSkill({
      qiCost: 0,
      stabilityCost: 0,
      successChance: 0.5,
      effects: [
        {
          kind: 'maxStability',
          amount: { value: -10 },
          condition: { kind: 'chance', percentage: 25 },
        },
        {
          kind: 'stability',
          amount: { value: 20 },
          condition: { kind: 'chance', percentage: 50 },
        },
      ],
    });
    // Only action success AND the maximum-loss proc is fatal; restoration
    // cannot rescue a zero maximum. Live mass = 1 - 0.5 * 0.25.
    expect(
      calculateActionSurvivabilityFloor(state, skill, retargetConfig(skill)),
    ).toEqual({ stability: 0, maxStability: 0, survivalProbability: 0.875 });
  });

  it('retains item no-cleanup stability and the state getter maximum', () => {
    const state = new CraftingState({
      qi: 100,
      stability: 1,
      initialMaxStability: 10,
      items: new Map([['retarget_probe', 1]]),
    });
    const skill = retargetSkill({
      actionKind: 'item',
      qiCost: 0,
      stabilityCost: 0,
      effects: [
        { kind: 'stability', amount: { value: -5 } },
        { kind: 'maxStability', amount: { value: -20 } },
      ],
    });
    const config = retargetConfig(skill);
    const next = applySkill(state, skill, config)!;
    expect(next.stability).toBe(-4);
    expect(next.maxStability).toBe(0);
    expect(calculateActionSurvivabilityFloor(state, skill, config)).toEqual({
      stability: next.stability,
      maxStability: next.maxStability,
      survivalProbability: 0,
    });
  });

  it('does not reuse a forced-success projection for the ordinary action', () => {
    const effects: [] = [];
    const state = new CraftingState({ qi: 100, stability: 1 });
    const skill = retargetSkill({
      qiCost: 0,
      stabilityCost: 10,
      successChance: 0.5,
      effects: [{ kind: 'stability', amount: { value: 20 } }],
    });
    const config = retargetConfig(skill);
    const forced = applySkill(state, skill, config, effects, 0, undefined, 0, {
      successChance: 1,
    })!;
    expect(forced.stability).toBe(11);
    expect(
      calculateActionSurvivabilityFloor(
        state,
        skill,
        config,
        effects,
        undefined,
        forced,
      ),
    ).toEqual({ stability: 0, maxStability: 59, survivalProbability: 0.5 });
  });
});
