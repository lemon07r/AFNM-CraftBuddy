/**
 * Presentation-layer tests for the outcome summary rows.
 *
 * The point of these is twofold:
 *  - the panel gets exactly the rows it needs (tier, per-bar bands,
 *    points-to-next-band, binding bar, auto-finish, harmony, setup hint),
 *  - and none of those numbers are recomputed: the last test feeds a real
 *    `greedySearch` projection through the util and checks the rows echo it.
 */

import { CraftingState, type CraftingStateData } from '../optimizer/state';
import { DEFAULT_SKILLS, type OptimizerConfig } from '../optimizer/skills';
import { greedySearch } from '../optimizer/search';
import type { OutcomeBarStatus, OutcomeProjection } from '../optimizer/search';
import {
  buildAutoUseNotice,
  buildOutcomeSummary,
  buildSetupSummary,
  formatTechniqueKey,
  OUTCOME_TIER_LABELS,
} from '../utils/outcomeSummary';

function createBar(
  overrides: Partial<OutcomeBarStatus> = {},
): OutcomeBarStatus {
  return {
    value: 0,
    bands: 0,
    requiredBands: 2,
    nextThreshold: 100,
    pointsToNextBand: 100,
    bonusChance: 0,
    ...overrides,
  };
}

function createProjection(
  overrides: Partial<OutcomeProjection> = {},
): OutcomeProjection {
  return {
    tier: 'basic',
    optimisticTier: 'basic',
    targetTier: 'sublime',
    completion: createBar(),
    perfection: createBar(),
    bindingBar: 'perfection',
    willAutoFinish: false,
    ...overrides,
  };
}

describe('buildOutcomeSummary', () => {
  it('returns null for a legacy result without a projection', () => {
    expect(buildOutcomeSummary({})).toBeNull();
    expect(
      buildOutcomeSummary({ projection: undefined, harmonyType: 'forge' }),
    ).toBeNull();
  });

  it('reports a completion-heavy, perfection-short sublime state', () => {
    const summary = buildOutcomeSummary({
      projection: createProjection({
        tier: 'perfect',
        optimisticTier: 'perfect',
        completion: createBar({
          value: 260,
          bands: 2,
          requiredBands: 2,
          nextThreshold: 390,
          pointsToNextBand: 130,
        }),
        perfection: createBar({
          value: 118,
          bands: 1,
          requiredBands: 2,
          nextThreshold: 230,
          pointsToNextBand: 112,
          bonusChance: 0.42,
        }),
        bindingBar: 'perfection',
      }),
    });

    expect(summary).not.toBeNull();
    expect(summary!.tier).toBe('perfect');
    expect(summary!.targetTier).toBe('sublime');
    expect(summary!.onTarget).toBe(false);
    expect(summary!.tierHeadline).toBe('On track for Perfect');
    expect(summary!.tierDetail).toBe('Target Sublime');
    expect(summary!.tierTone).toBe('warning');
    expect(summary!.bindingBar).toBe('perfection');
    expect(summary!.bindingLabel).toBe('Perfection is holding Sublime back');

    const [completion, perfection] = summary!.bars;
    expect(completion.bar).toBe('completion');
    expect(completion.bandsLabel).toBe('2 / 2 bands');
    expect(completion.satisfied).toBe(true);
    expect(completion.isBinding).toBe(false);
    expect(completion.tone).toBe('positive');
    expect(completion.nextBandLabel).toBe('+130 to band 3');

    expect(perfection.bar).toBe('perfection');
    expect(perfection.bandsLabel).toBe('1 / 2 bands');
    expect(perfection.satisfied).toBe(false);
    expect(perfection.isBinding).toBe(true);
    expect(perfection.tone).toBe('warning');
    expect(perfection.pointsToNextBand).toBe(112);
    expect(perfection.nextBandLabel).toBe('+112 to band 2');
    expect(perfection.bonusChanceLabel).toBe('42% bonus band');
  });

  it('marks a met target tier as secured with no binding bar', () => {
    const summary = buildOutcomeSummary({
      projection: createProjection({
        tier: 'sublime',
        optimisticTier: 'sublime',
        completion: createBar({ value: 400, bands: 2, pointsToNextBand: 90 }),
        perfection: createBar({ value: 400, bands: 3, pointsToNextBand: 70 }),
        bindingBar: 'none',
      }),
    });

    expect(summary!.onTarget).toBe(true);
    expect(summary!.tierHeadline).toBe('Sublime secured');
    expect(summary!.tierDetail).toBeNull();
    expect(summary!.tierTone).toBe('positive');
    expect(summary!.bindingLabel).toBe('Both bars meet Sublime');
    expect(summary!.bars.every((bar) => bar.isBinding)).toBe(false);
    expect(summary!.optimisticTierLabel).toBeNull();
  });

  it('surfaces the optimistic tier only when a bonus roll could promote', () => {
    const shortOfSublime = buildOutcomeSummary({
      projection: createProjection({
        tier: 'perfect',
        optimisticTier: 'sublime',
        perfection: createBar({ bands: 1, bonusChance: 0.61 }),
      }),
    });
    expect(shortOfSublime!.optimisticTierLabel).toBe(
      'Sublime if the bonus roll lands',
    );

    const noPromotion = buildOutcomeSummary({
      projection: createProjection({
        tier: 'perfect',
        optimisticTier: 'perfect',
      }),
    });
    expect(noPromotion!.optimisticTierLabel).toBeNull();
  });

  it('flags a failed floor as dangerous', () => {
    const summary = buildOutcomeSummary({
      projection: createProjection({
        tier: 'failed',
        optimisticTier: 'failed',
        bindingBar: 'completion',
      }),
    });

    expect(summary!.tierTone).toBe('danger');
    expect(summary!.tierHeadline).toBe('On track for Failed');
    expect(summary!.bindingLabel).toBe('Completion is holding Sublime back');
  });

  it('describes a bar with no requirement without inventing one', () => {
    const summary = buildOutcomeSummary({
      projection: createProjection({
        perfection: createBar({
          value: 0,
          bands: 0,
          requiredBands: 0,
          nextThreshold: 0,
          pointsToNextBand: 0,
        }),
        bindingBar: 'completion',
      }),
    });

    const perfection = summary!.bars[1];
    expect(perfection.bandsLabel).toBe('0 bands');
    expect(perfection.nextBandLabel).toBeNull();
    expect(perfection.bonusChanceLabel).toBeNull();
    expect(perfection.satisfied).toBe(true);
  });

  it('reports auto-finish as terminal without any manual finish wording', () => {
    const running = buildOutcomeSummary({
      projection: createProjection(),
    });
    expect(running!.autoFinish.active).toBe(false);
    expect(running!.autoFinish.label).toBe('Craft continues');

    const finishing = buildOutcomeSummary({
      projection: createProjection({
        tier: 'sublime',
        optimisticTier: 'sublime',
        bindingBar: 'none',
        willAutoFinish: true,
      }),
    });
    expect(finishing!.autoFinish.active).toBe(true);
    expect(finishing!.autoFinish.label).toBe('Auto-finishing as Sublime');
    expect(finishing!.autoFinish.tone).toBe('positive');
    expect(finishing!.autoFinish.detail).toContain('no manual finish action');
    expect(finishing!.autoFinish.detail).not.toMatch(/finish craft/i);
  });

  it('describes the selected harmony from the shared registry', () => {
    const resonance = buildOutcomeSummary({
      projection: createProjection(),
      harmonyType: 'resonance',
    });
    expect(resonance!.harmony).toEqual({
      harmonyType: 'resonance',
      label: 'Spiritual Resonance',
      detail: 'Complexity x1.3',
      notes: [],
      complexityApplies: true,
    });

    const formless = buildOutcomeSummary({
      projection: createProjection(),
      harmonyType: 'formless',
    });
    expect(formless!.harmony!.label).toBe('Formless Way');
    expect(formless!.harmony!.detail).toBe(
      'Complexity x1.5 | Holds harmony at its peak',
    );
    expect(formless!.harmony!.complexityApplies).toBe(true);

    const echo = buildOutcomeSummary({
      projection: createProjection(),
      harmonyType: 'enhancingEcho',
    });
    expect(echo!.harmony!.notes).toEqual(['Scales Qi and stability costs']);

    expect(
      buildOutcomeSummary({ projection: createProjection() })!.harmony,
    ).toBeNull();
  });

  it('only quotes the complexity multiplier where the runtime applies it', () => {
    const standardCraft = buildOutcomeSummary({
      projection: createProjection({ targetTier: 'perfect' }),
      harmonyType: 'resonance',
    });

    expect(standardCraft!.harmony!.complexityApplies).toBe(false);
    expect(standardCraft!.harmony!.detail).toBe(
      'No complexity scaling outside sublime crafts',
    );
    expect(standardCraft!.harmony!.detail).not.toContain('x1.3');
  });

  it('formats large bar values compactly', () => {
    const summary = buildOutcomeSummary({
      projection: createProjection({
        completion: createBar({
          value: 1_250_000,
          bands: 1,
          pointsToNextBand: 640_000,
        }),
      }),
    });

    expect(summary!.bars[0].valueLabel).toBe('1.3M');
    expect(summary!.bars[0].nextBandLabel).toBe('+640K to band 2');
  });

  it('covers every tier with a label', () => {
    expect(Object.values(OUTCOME_TIER_LABELS)).toEqual([
      'Failed',
      'Basic',
      'Perfect',
      'Sublime',
    ]);
  });
});

describe('buildSetupSummary', () => {
  it('presents a gated-technique enabler as deliberate setup', () => {
    const row = buildSetupSummary({
      techniqueKey: 'false_fusion',
      reason: 'Rushing completion to 100% unlocks False Fusion.',
    });

    expect(row).toEqual({
      techniqueKey: 'false_fusion',
      techniqueLabel: 'False Fusion',
      label: 'Setup for False Fusion',
      detail: 'Rushing completion to 100% unlocks False Fusion.',
      tone: 'accent',
    });
  });

  it('falls back to a generated reason when the hint carries none', () => {
    const row = buildSetupSummary({
      techniqueKey: 'purifyingIntensity',
      reason: '   ',
    });

    expect(row!.techniqueLabel).toBe('Purifying Intensity');
    expect(row!.detail).toBe(
      'Unlocks Purifying Intensity rather than paying off this turn.',
    );
  });

  it('returns null when there is no hint', () => {
    expect(buildSetupSummary(undefined)).toBeNull();
    expect(buildSetupSummary({ techniqueKey: '', reason: 'x' })).toBeNull();
  });

  it('humanizes technique keys in either casing convention', () => {
    expect(formatTechniqueKey('disciplined-touch')).toBe('Disciplined Touch');
    expect(formatTechniqueKey('turbidQiRelease')).toBe('Turbid Qi Release');
    expect(formatTechniqueKey('WAIT')).toBe('Wait');
  });
});

describe('buildAutoUseNotice', () => {
  it('stays absent when auto mode reports no notice', () => {
    expect(buildAutoUseNotice(undefined)).toBeNull();
    expect(buildAutoUseNotice(null)).toBeNull();
    expect(buildAutoUseNotice({ policy: 'techniquesOnly' })).toBeNull();
    expect(buildAutoUseNotice({ policyNotice: '  ' })).toBeNull();
  });

  it('reports the runtime policy notice verbatim', () => {
    expect(
      buildAutoUseNotice({
        nativeAutoUseActive: true,
        policyNotice:
          'Full action space downgraded: the game auto-uses your crafting loadout.',
      }),
    ).toEqual({
      label: 'Native auto-use loadout active',
      detail:
        'Full action space downgraded: the game auto-uses your crafting loadout.',
      tone: 'accent',
    });
  });

  it('explains an active loadout even without a notice string', () => {
    const row = buildAutoUseNotice({ nativeAutoUseActive: true });
    expect(row!.label).toBe('Native auto-use loadout active');
    expect(row!.detail).toContain('leaves those items alone');
  });
});

describe('outcome summary against a real search projection', () => {
  function createConfig(): OptimizerConfig {
    return {
      maxQi: 194,
      maxStability: 60,
      baseIntensity: 12,
      baseControl: 16,
      minStability: 0,
      skills: DEFAULT_SKILLS,
      defaultBuffMultiplier: 1.4,
      isSublimeCraft: true,
      targetCompletion: 100,
      targetPerfection: 100,
      maxCompletion: 400,
      maxPerfection: 400,
    };
  }

  function createState(
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

  it('echoes the projection the shared evaluator published', () => {
    const result = greedySearch(createState(), createConfig(), 100, 100);
    const projection = result.outcomeProjection;
    expect(projection).toBeDefined();

    const summary = buildOutcomeSummary({
      projection,
      harmonyType: 'forge',
    })!;

    expect(summary.tier).toBe(projection!.tier);
    expect(summary.targetTier).toBe('sublime');
    expect(summary.bindingBar).toBe(projection!.bindingBar);
    expect(summary.bars[0].bands).toBe(projection!.completion.bands);
    expect(summary.bars[0].requiredBands).toBe(
      projection!.completion.requiredBands,
    );
    expect(summary.bars[1].pointsToNextBand).toBe(
      projection!.perfection.pointsToNextBand,
    );
    expect(summary.autoFinish.active).toBe(projection!.willAutoFinish);
    expect(summary.harmony!.label).toBe('Forge Works');
  });
});
