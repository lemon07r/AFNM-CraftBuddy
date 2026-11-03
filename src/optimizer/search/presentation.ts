import type {
  OutcomeBarStatus,
  OutcomeProjection,
  GainPreview,
  ActionCostPreview,
  SkillRecommendation,
  CraftingConditionType,
  SetupForHint,
  SearchResult,
} from './types';

import { getBonusAndChance } from '../gameTypes';

import { CraftingState, BuffType } from '../state';

import {
  type OutcomeBands,
  classifyOutcome,
  TIER_REQUIREMENTS,
} from '../outcome';

import {
  SkillDefinition,
  OptimizerConfig,
  getConditionEffectsForConfig,
  calculateDisplayedSkillGains,
  calculateEffectiveActionCosts,
  applySkill,
} from '../skills';

import { safeFloor } from '../../utils/largeNumbers';

import { estimateGoalUnlockOrderingBonus } from './unlocks';

import { deriveBandGoals } from './goals';

export {
  withOutcomeProjection,
  calculateRecommendationGains,
  generateReasoning,
  populateSetupHints,
  buildOutcomeProjection,
};

/** Band status for one bar, entirely derived from `./outcome` + `getBonusAndChance`. */
function buildOutcomeBarStatus(
  value: number,
  bandWidth: number,
  bands: number,
  bonusChance: number,
  requiredBands: number,
): OutcomeBarStatus {
  const clampedValue = Math.max(0, value);
  // A zero-width bar is not part of the craft (completion-only or
  // perfection-only scenarios), so there is no ladder and nothing to require.
  if (bandWidth <= 0) {
    return {
      value: clampedValue,
      bands,
      requiredBands: 0,
      nextThreshold: clampedValue,
      pointsToNextBand: 0,
      bonusChance: 0,
    };
  }
  const { nextThreshold } = getBonusAndChance(clampedValue, bandWidth);
  return {
    value: clampedValue,
    bands,
    requiredBands,
    nextThreshold,
    pointsToNextBand: Math.max(0, nextThreshold - clampedValue),
    bonusChance,
  };
}

/**
 * Build the `OutcomeProjection` published on `SearchResult`.
 *
 * Everything here comes out of `classifyOutcome` and the runtime band helper, so
 * presentation code never has to know the 1.3x ladder or the tier conjunction.
 */
function buildOutcomeProjection(
  state: CraftingState,
  bands: OutcomeBands,
): OutcomeProjection {
  const outcome = classifyOutcome(state, bands);
  const requirement = TIER_REQUIREMENTS[bands.targetTier];
  return {
    tier: outcome.tier,
    optimisticTier: outcome.optimisticTier,
    targetTier: bands.targetTier,
    completion: buildOutcomeBarStatus(
      state.completion,
      bands.completionTarget,
      outcome.completionBands,
      outcome.completionBonusChance,
      requirement.completion,
    ),
    perfection: buildOutcomeBarStatus(
      state.perfection,
      bands.perfectionTarget,
      outcome.perfectionBands,
      outcome.perfectionBonusChance,
      requirement.perfection,
    ),
    bindingBar: outcome.blockingRequirement,
    willAutoFinish: outcome.willAutoFinish,
  };
}

function calculateRecommendationGains(
  state: CraftingState,
  skill: SkillDefinition,
  config: OptimizerConfig,
  conditionEffects: ReturnType<typeof getConditionEffectsForConfig>,
  simulatedState?: CraftingState | null,
): {
  expectedGains: GainPreview;
  immediateGains: GainPreview;
  effectiveCosts: ActionCostPreview;
} {
  const expected = calculateDisplayedSkillGains(
    state,
    skill,
    config,
    conditionEffects,
  );
  const immediate = calculateDisplayedSkillGains(
    state,
    skill,
    config,
    conditionEffects,
    { includeExpectedValue: false },
  );
  const costs = calculateEffectiveActionCosts(
    state,
    skill,
    config.minStability,
    conditionEffects,
    config,
  );

  // The direct-effects readout misses what the full transition applies:
  // triggered buff procs (e.g. Golden Path: Third Peak paying perfection on
  // support actions) and other per-turn harmonics. When the search's
  // simulated post-action state is at hand, publish the bar deltas it
  // actually projects so the panel matches the "after one turn" projection
  // instead of presenting a proc-heavy action as a 0-gain move. Stability
  // stays on the direct readout - the state diff would conflate the action
  // cost with restoration - and immediate gains keep their raw, non-EV
  // meaning for the headline chips.
  const expectedCompletion = simulatedState
    ? safeFloor(Math.max(0, simulatedState.completion - state.completion))
    : expected.completion;
  const expectedPerfection = simulatedState
    ? safeFloor(Math.max(0, simulatedState.perfection - state.perfection))
    : expected.perfection;

  return {
    expectedGains: {
      completion: expectedCompletion,
      perfection: expectedPerfection,
      stability: expected.stability,
    },
    immediateGains: {
      completion: immediate.completion,
      perfection: immediate.perfection,
      stability: immediate.stability,
    },
    effectiveCosts: {
      qi: costs.qiCost,
      stability: costs.stabilityCost,
    },
  };
}

/**
 * Generate reasoning text for why a skill is recommended.
 *
 * `gains` should be the projected (expected) gains so the text matches the
 * panel's "Expected:" readout. When the action ends the craft
 * (`options.endsCraft`), forward-looking buff rationale is suppressed - there
 * are no "next turns" for a granted buff to help - and overshoot gains past
 * the raw targets are still named, since they bank real bonus-roll value.
 */
function generateReasoning(
  skill: SkillDefinition,
  state: CraftingState,
  gains: { completion: number; perfection: number; stability: number },
  targetCompletion: number,
  targetPerfection: number,
  options: { readonly endsCraft?: boolean } = {},
): string {
  const endsCraft = options.endsCraft === true;
  const reasons: string[] = [];

  // Check if we need stability
  if (skill.type === 'stabilize') {
    if (state.stability <= 20) {
      reasons.push('Low stability - must restore');
    } else {
      reasons.push('Restore stability for more actions');
    }
  }

  // Check buff usage
  if (state.hasControlBuff() && skill.scalesWithControl) {
    reasons.push('Control buff active - maximize perfection');
  }
  if (state.hasIntensityBuff() && skill.scalesWithIntensity) {
    reasons.push('Intensity buff active - maximize completion');
  }

  // Check if skill grants buff - pointless to advertise when the craft ends
  // with this action, since the buff would never trigger again.
  if (!endsCraft && skill.buffDuration > 0) {
    if (skill.buffType === BuffType.CONTROL) {
      reasons.push('Grants control buff for next turns');
    } else if (skill.buffType === BuffType.INTENSITY) {
      reasons.push('Grants intensity buff for next turns');
    }
  }

  // Check progress needs. Gains past the raw targets are overcraft value
  // (deeper bands / craft-end bonus-roll progress), still worth naming.
  if (targetCompletion > 0 && targetPerfection > 0) {
    if (gains.completion > 0) {
      reasons.push(
        state.completion < targetCompletion
          ? `+${gains.completion} completion toward target`
          : `+${gains.completion} completion`,
      );
    }
    if (gains.perfection > 0) {
      reasons.push(
        state.perfection < targetPerfection
          ? `+${gains.perfection} perfection toward target`
          : `+${gains.perfection} perfection`,
      );
    }
  } else {
    if (gains.completion > 0) {
      reasons.push(`+${gains.completion} completion`);
    }
    if (gains.perfection > 0) {
      reasons.push(`+${gains.perfection} perfection`);
    }
  }

  if (endsCraft) {
    reasons.push('Ends the craft');
  }

  // Disciplined Touch special case
  if (skill.isDisciplinedTouch) {
    reasons.push('Converts buffs to both completion and perfection');
  }

  return reasons.length > 0 ? reasons.join('; ') : 'Best available option';
}

/**
 * Top candidates that get a setup hint. Deriving one costs an `applySkill` plus
 * a gate sweep, so it is bounded and runs once, after ranking is finished.
 */
const SETUP_HINT_CANDIDATE_LIMIT = 6;

/**
 * Annotate ranked candidates whose value comes from unlocking a gated technique.
 *
 * Uses the same generic detection as the ordering heuristic, so the panel can
 * explain a completion-rush turn (for example opening False Fusion) rather than
 * showing it as a low-gain action.
 */
function populateSetupHints(
  recommendations: SkillRecommendation[],
  state: CraftingState,
  config: OptimizerConfig,
  targetCompletion: number,
  currentConditionType: CraftingConditionType | undefined,
): void {
  if (recommendations.length === 0 || config.skills.length === 0) {
    return;
  }

  const conditionEffects = getConditionEffectsForConfig(
    config,
    currentConditionType,
  );
  const unlocks: SetupForHint[] = [];
  const limit = Math.min(SETUP_HINT_CANDIDATE_LIMIT, recommendations.length);
  for (let index = 0; index < limit; index++) {
    const rec = recommendations[index];
    const after = applySkill(
      state,
      rec.skill,
      config,
      conditionEffects,
      targetCompletion,
      currentConditionType,
    );
    if (after === null) {
      continue;
    }
    unlocks.length = 0;
    estimateGoalUnlockOrderingBonus(
      state,
      after,
      config,
      config.skills,
      1,
      unlocks,
    );
    // A technique unlocking itself is just its own precondition, not setup.
    const hint = unlocks.find((entry) => entry.techniqueKey !== rec.skill.key);
    if (hint) {
      rec.setupFor = hint;
    }
  }
}

/**
 * Attach the shared outcome projection to a finished search result.
 *
 * Kept in one place so every public entry point publishes the same evaluator
 * output, and so no consumer has to re-derive band thresholds.
 */
function withOutcomeProjection(
  result: SearchResult,
  state: CraftingState,
  config: OptimizerConfig,
  targetCompletion: number,
  targetPerfection: number,
): SearchResult {
  const { bands } = deriveBandGoals(
    targetCompletion,
    targetPerfection,
    config.isSublimeCraft || false,
    config.maxCompletion,
    config.maxPerfection,
  );
  return {
    ...result,
    outcomeProjection: buildOutcomeProjection(state, bands),
  };
}
