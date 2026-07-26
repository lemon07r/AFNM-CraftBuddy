/**
 * Shared-contract tests for the outcome projection published on `SearchResult`.
 *
 * These lock the boundary the UI and runtime workstreams build on:
 *  - every public search entry point publishes an `outcomeProjection`,
 *  - every number in it comes from `./outcome` / `getBonusAndChance`, so a
 *    consumer never has to (and must never) recompute a band threshold,
 *  - a gated technique's enabler carries a `setupFor` hint.
 *
 * Kept out of `search.test.ts` deliberately: that suite runs deep searches and
 * takes ~2 minutes, while these assertions only need shallow ones.
 */

import {
  BuffType,
  CraftingState,
  type CraftingStateData,
} from '../optimizer/state';
import {
  DEFAULT_SKILLS,
  type OptimizerConfig,
  type SkillDefinition,
} from '../optimizer/skills';
import { greedySearch, lookaheadSearch } from '../optimizer/search';
import {
  bandThreshold,
  buildOutcomeBands,
  classifyOutcome,
  deriveOutcomeBands,
  TIER_REQUIREMENTS,
} from '../optimizer/outcome';
import { getBonusAndChance } from '../optimizer/gameTypes';
import * as optimizer from '../optimizer';

function createConfig(
  overrides: Partial<OptimizerConfig> = {},
): OptimizerConfig {
  return {
    maxQi: 194,
    maxStability: 60,
    baseIntensity: 12,
    baseControl: 16,
    minStability: 0,
    skills: DEFAULT_SKILLS,
    defaultBuffMultiplier: 1.4,
    ...overrides,
  };
}

function createSkill(
  overrides: Partial<SkillDefinition> = {},
): SkillDefinition {
  return {
    name: 'Custom Skill',
    key: 'custom_skill',
    qiCost: 0,
    stabilityCost: 0,
    baseCompletionGain: 0,
    basePerfectionGain: 0,
    stabilityGain: 0,
    maxStabilityChange: 0,
    buffType: BuffType.NONE,
    buffDuration: 0,
    buffMultiplier: 1,
    type: 'support',
    ...overrides,
  };
}

function createLiveState(
  overrides: Partial<CraftingStateData> = {},
): CraftingState {
  return new CraftingState({
    qi: 120,
    stability: 50,
    initialMaxStability: 60,
    completion: 0,
    perfection: 0,
    ...overrides,
  });
}

const SUBLIME_TARGETS = { completion: 100, perfection: 100 } as const;

function createSublimeConfig(
  overrides: Partial<OptimizerConfig> = {},
): OptimizerConfig {
  return createConfig({
    isSublimeCraft: true,
    targetCompletion: SUBLIME_TARGETS.completion,
    targetPerfection: SUBLIME_TARGETS.perfection,
    maxCompletion: 400,
    maxPerfection: 400,
    ...overrides,
  });
}

describe('outcome projection contract', () => {
  it('is published by greedySearch', () => {
    const result = greedySearch(
      createLiveState(),
      createSublimeConfig(),
      SUBLIME_TARGETS.completion,
      SUBLIME_TARGETS.perfection,
    );

    expect(result.outcomeProjection).toBeDefined();
    expect(result.outcomeProjection!.targetTier).toBe('sublime');
  });

  it('is published by lookaheadSearch', () => {
    const result = lookaheadSearch(
      createLiveState(),
      createSublimeConfig(),
      SUBLIME_TARGETS.completion,
      SUBLIME_TARGETS.perfection,
      2,
      'neutral',
      [],
      { maxNodes: 300, beamWidth: 4 },
    );

    expect(result.outcomeProjection).toBeDefined();
    expect(result.outcomeProjection!.targetTier).toBe('sublime');
  });

  it('reports the tier requirements of the target tier as required bands', () => {
    const projection = greedySearch(
      createLiveState(),
      createSublimeConfig(),
      SUBLIME_TARGETS.completion,
      SUBLIME_TARGETS.perfection,
    ).outcomeProjection!;

    expect(projection.completion.requiredBands).toBe(
      TIER_REQUIREMENTS.sublime.completion,
    );
    expect(projection.perfection.requiredBands).toBe(
      TIER_REQUIREMENTS.sublime.perfection,
    );
  });

  it('targets perfect tier on a non-sublime recipe', () => {
    const projection = greedySearch(
      createLiveState(),
      createConfig({
        isSublimeCraft: false,
        targetCompletion: 100,
        targetPerfection: 100,
        maxCompletion: 100,
        maxPerfection: 100,
      }),
      100,
      100,
    ).outcomeProjection!;

    expect(projection.targetTier).toBe('perfect');
    expect(projection.completion.requiredBands).toBe(
      TIER_REQUIREMENTS.perfect.completion,
    );
    expect(projection.perfection.requiredBands).toBe(
      TIER_REQUIREMENTS.perfect.perfection,
    );
  });

  it('derives thresholds and deltas from the shared band helpers', () => {
    const state = createLiveState({ completion: 140, perfection: 35 });
    const config = createSublimeConfig();

    const projection = greedySearch(
      state,
      config,
      SUBLIME_TARGETS.completion,
      SUBLIME_TARGETS.perfection,
    ).outcomeProjection!;

    const bands = buildOutcomeBands({
      targetCompletion: SUBLIME_TARGETS.completion,
      targetPerfection: SUBLIME_TARGETS.perfection,
      isSublimeCraft: true,
      maxCompletionCap: config.maxCompletion,
      maxPerfectionCap: config.maxPerfection,
    });
    const outcome = classifyOutcome(state, bands);
    const completionBand = getBonusAndChance(
      state.completion,
      bands.completionTarget,
    );
    const perfectionBand = getBonusAndChance(
      state.perfection,
      bands.perfectionTarget,
    );

    expect(projection.tier).toBe(outcome.tier);
    expect(projection.optimisticTier).toBe(outcome.optimisticTier);

    expect(projection.completion.value).toBe(state.completion);
    expect(projection.completion.bands).toBe(outcome.completionBands);
    expect(projection.completion.bonusChance).toBe(
      outcome.completionBonusChance,
    );
    expect(projection.completion.nextThreshold).toBe(
      completionBand.nextThreshold,
    );
    expect(projection.completion.pointsToNextBand).toBe(
      completionBand.nextThreshold - state.completion,
    );

    expect(projection.perfection.bands).toBe(outcome.perfectionBands);
    expect(projection.perfection.nextThreshold).toBe(
      perfectionBand.nextThreshold,
    );
    expect(projection.perfection.pointsToNextBand).toBe(
      perfectionBand.nextThreshold - state.perfection,
    );

    // Second sublime band on a 100-wide bar: 100 + floor(130) = 230.
    expect(bandThreshold(SUBLIME_TARGETS.completion, 2)).toBe(230);
    expect(projection.completion.nextThreshold).toBe(230);
  });

  it('names perfection as the binding bar when completion is far ahead', () => {
    const projection = greedySearch(
      createLiveState({ completion: 240, perfection: 20 }),
      createSublimeConfig(),
      SUBLIME_TARGETS.completion,
      SUBLIME_TARGETS.perfection,
    ).outcomeProjection!;

    expect(projection.completion.bands).toBeGreaterThanOrEqual(2);
    expect(projection.perfection.bands).toBe(0);
    expect(projection.bindingBar).toBe('perfection');
  });

  it('names completion as the binding bar when perfection is far ahead', () => {
    const projection = greedySearch(
      createLiveState({ completion: 10, perfection: 240 }),
      createSublimeConfig(),
      SUBLIME_TARGETS.completion,
      SUBLIME_TARGETS.perfection,
    ).outcomeProjection!;

    expect(projection.bindingBar).toBe('completion');
  });

  it('reports no binding bar once the target tier is banked', () => {
    const projection = greedySearch(
      createLiveState({ completion: 240, perfection: 240 }),
      createSublimeConfig(),
      SUBLIME_TARGETS.completion,
      SUBLIME_TARGETS.perfection,
    ).outcomeProjection!;

    expect(projection.tier).toBe('sublime');
    expect(projection.bindingBar).toBe('none');
  });

  it('treats a zero-width bar as outside the craft', () => {
    const projection = greedySearch(
      createLiveState({ completion: 40 }),
      createConfig({
        targetCompletion: 100,
        targetPerfection: 0,
        maxCompletion: 100,
        maxPerfection: 0,
      }),
      100,
      0,
    ).outcomeProjection!;

    expect(projection.perfection.requiredBands).toBe(0);
    expect(projection.perfection.pointsToNextBand).toBe(0);
    expect(projection.perfection.bonusChance).toBe(0);
  });

  it('exposes the auto-finish predicate rather than a manual finish flag', () => {
    const config = createConfig({
      targetCompletion: 100,
      targetPerfection: 100,
      maxCompletion: 100,
      maxPerfection: 100,
    });
    const state = createLiveState({ completion: 100, perfection: 100 });
    const bands = buildOutcomeBands({
      targetCompletion: 100,
      targetPerfection: 100,
      isSublimeCraft: false,
      maxCompletionCap: 100,
      maxPerfectionCap: 100,
    });

    const projection = greedySearch(state, config, 100, 100).outcomeProjection!;

    expect(projection.willAutoFinish).toBe(
      classifyOutcome(state, bands).willAutoFinish,
    );
  });
});

describe('setupFor hint contract', () => {
  it('marks the action that unlocks a gated technique', () => {
    const setup = createSkill({
      name: 'Setup',
      key: 'setup',
      type: 'support',
      qiCost: 0,
      stabilityCost: 10,
      effects: [
        {
          kind: 'createBuff',
          buff: { name: 'charge', canStack: true, effects: [] },
          stacks: { value: 1 },
        },
      ],
    });
    const payoff = createSkill({
      name: 'Payoff',
      key: 'payoff',
      type: 'refine',
      qiCost: 0,
      stabilityCost: 10,
      basePerfectionGain: 8,
      scalesWithControl: true,
      buffRequirement: { buffName: 'charge', amount: 1 },
    });
    const filler = createSkill({
      name: 'Filler',
      key: 'filler',
      type: 'refine',
      qiCost: 0,
      stabilityCost: 10,
      basePerfectionGain: 0.6,
      scalesWithControl: true,
    });

    const result = greedySearch(
      createLiveState({ stability: 60 }),
      createConfig({ skills: [setup, payoff, filler] }),
      0,
      100,
    );

    const candidates = [
      result.recommendation,
      ...result.alternativeSkills,
    ].filter((entry): entry is NonNullable<typeof entry> => entry !== null);
    const setupCandidate = candidates.find(
      (entry) => entry.skill.key === 'setup',
    );

    expect(setupCandidate).toBeDefined();
    expect(setupCandidate!.setupFor).toEqual({
      techniqueKey: 'payoff',
      reason: 'Reaches 1 charge to enable Payoff',
    });
  });

  it('leaves plain actions without a setup hint', () => {
    const result = greedySearch(
      createLiveState(),
      createConfig({ targetCompletion: 100, targetPerfection: 100 }),
      100,
      100,
    );

    expect(result.recommendation).not.toBeNull();
    expect(result.recommendation!.setupFor).toBeUndefined();
  });
});

describe('optimizer facade re-exports', () => {
  it('exposes the outcome evaluator so consumers never recompute bands', () => {
    expect(optimizer.deriveOutcomeBands).toBe(deriveOutcomeBands);
    expect(optimizer.buildOutcomeBands).toBe(buildOutcomeBands);
    expect(optimizer.classifyOutcome).toBe(classifyOutcome);
    expect(optimizer.bandThreshold).toBe(bandThreshold);
    expect(optimizer.TIER_REQUIREMENTS).toBe(TIER_REQUIREMENTS);
    expect(optimizer.OUTCOME_TIER_ORDER).toEqual([
      'failed',
      'basic',
      'perfect',
      'sublime',
    ]);
    expect(typeof optimizer.tierForBands).toBe('function');
    expect(typeof optimizer.tierRank).toBe('function');
    expect(typeof optimizer.willAutoFinish).toBe('function');
    expect(optimizer.BAND_GROWTH_RATIO).toBe(1.3);
  });
});
