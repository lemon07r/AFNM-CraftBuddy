import {
  OptimizerConfig,
  getConditionEffectsForConfig,
  getAvailableSkills,
  SkillDefinition,
  calculateSkillGains,
  calculateEffectiveActionCosts,
} from '../skills';

import { CraftingState } from '../state';

import type { CraftingConditionType } from './types';

export {
  DEFAULT_SCORING_CONTEXT,
  estimateWeightedProgressPerTurn,
  estimateTurnsRemainingFromContext,
  buildScoringContext,
};

export type { ScoringContext };

// ── Scoring context ─────────────────────────────────────────────────────────
// Carries precomputed craft-specific values into scoreState() so that
// survivability estimates use actual skill data instead of hardcoded guesses.
interface ScoringContext {
  /** Average stability cost per progress turn, from available skills. */
  avgStabilityCostPerTurn: number;
  /** Representative completion gain per productive turn. */
  avgCompletionGainPerTurn: number;
  /** Representative perfection gain per productive turn. */
  avgPerfectionGainPerTurn: number;
  /** Weighted overall gain per productive turn. */
  avgGainPerTurn: number;
  /** Average qi cost per progress turn, from available skills. */
  avgQiCostPerTurn: number;
  /** Non-dominated productive action rates; preserves which bars advance together. */
  progressRates?: ReadonlyArray<{
    completion: number;
    perfection: number;
  }>;
}

/** Default scoring context used when callers don't provide one. */
const DEFAULT_SCORING_CONTEXT: ScoringContext = {
  avgStabilityCostPerTurn: 10,
  avgCompletionGainPerTurn: 16,
  avgPerfectionGainPerTurn: 16,
  avgGainPerTurn: 16,
  avgQiCostPerTurn: 0,
};

interface ProgressScoringSample {
  completionGain: number;
  perfectionGain: number;
  totalGain: number;
  qiCost: number;
  stabilityCost: number;
}

// Use a wider sample for gain estimates so the top 2 outlier skills don't
// dominate the survivability/runway estimates in large skill sets.
const SCORING_CONTEXT_PROGRESS_SAMPLE_SIZE = 3;

function average(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function getTopProgressAverage(
  values: number[],
  sampleSize: number = SCORING_CONTEXT_PROGRESS_SAMPLE_SIZE,
): number {
  const sorted = values
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => b - a)
    .slice(0, Math.max(1, sampleSize));
  return average(sorted);
}

function estimateWeightedProgressPerTurn(
  completionShare: number,
  perfectionShare: number,
  ctx: ScoringContext,
): number {
  const completionGain = Math.max(1, ctx.avgCompletionGainPerTurn);
  const perfectionGain = Math.max(1, ctx.avgPerfectionGainPerTurn);
  const totalShare =
    Math.max(0, completionShare) + Math.max(0, perfectionShare);
  if (totalShare <= 0) {
    return Math.max(1, ctx.avgGainPerTurn);
  }

  return (
    (Math.max(0, completionShare) * completionGain +
      Math.max(0, perfectionShare) * perfectionGain) /
    totalShare
  );
}

function estimateTurnsRemainingFromContext(
  completionRemaining: number,
  perfectionRemaining: number,
  ctx: ScoringContext,
): number {
  if (completionRemaining <= 0 && perfectionRemaining <= 0) {
    return 0;
  }

  if (completionRemaining > 0 && perfectionRemaining <= 0) {
    return Math.ceil(
      completionRemaining / Math.max(1, ctx.avgCompletionGainPerTurn),
    );
  }
  if (perfectionRemaining > 0 && completionRemaining <= 0) {
    return Math.ceil(
      perfectionRemaining / Math.max(1, ctx.avgPerfectionGainPerTurn),
    );
  }

  if (!ctx.progressRates) {
    // Without per-action rates, bound by both per-bar workloads and the
    // total workload (total gain counts a dual-bar action once).
    return Math.ceil(
      Math.max(
        completionRemaining / Math.max(1, ctx.avgCompletionGainPerTurn),
        perfectionRemaining / Math.max(1, ctx.avgPerfectionGainPerTurn),
        (completionRemaining + perfectionRemaining) /
          Math.max(1, ctx.avgGainPerTurn),
      ),
    );
  }
  const rates = ctx.progressRates;
  let turns = Infinity;
  for (let i = 0; i < rates.length; i++) {
    const first = rates[i];
    // A single joint action can cover both bars concurrently.
    turns = Math.min(
      turns,
      Math.max(
        first.completion > 0
          ? completionRemaining / first.completion
          : Infinity,
        first.perfection > 0
          ? perfectionRemaining / first.perfection
          : Infinity,
      ),
    );
    for (let j = i + 1; j < rates.length; j++) {
      const second = rates[j];
      const determinant =
        first.completion * second.perfection -
        second.completion * first.perfection;
      if (determinant === 0) continue;
      const firstTurns =
        (completionRemaining * second.perfection -
          perfectionRemaining * second.completion) /
        determinant;
      const secondTurns =
        (perfectionRemaining * first.completion -
          completionRemaining * first.perfection) /
        determinant;
      if (firstTurns >= 0 && secondTurns >= 0) {
        turns = Math.min(turns, firstTurns + secondTurns);
      }
    }
  }
  // The fractional two-bar covering problem has an optimum using at most
  // two rates. Round once, as with the other runway estimates. Unlike a
  // max-of-marginals bound, this cannot run separate actions concurrently.
  if (Number.isFinite(turns)) return Math.ceil(turns);

  // A currently unavailable bar can become productive after setup. Retain
  // the representative-rate fallback rather than declaring it unreachable.
  return Math.ceil(
    completionRemaining / Math.max(1, ctx.avgCompletionGainPerTurn) +
      perfectionRemaining / Math.max(1, ctx.avgPerfectionGainPerTurn),
  );
}

/**
 * Build a ScoringContext from actual config values.
 * Callers that have access to OptimizerConfig should use this instead of
 * relying on DEFAULT_SCORING_CONTEXT.
 */
function buildScoringContext(
  config: OptimizerConfig,
  referenceState?: CraftingState,
  currentCondition: CraftingConditionType = 'neutral',
): ScoringContext {
  const baselineState =
    referenceState ||
    new CraftingState({
      qi: config.maxQi,
      stability: config.maxStability,
      initialMaxStability: config.maxStability,
      completion: 0,
      perfection: 0,
      maxToxicity: config.maxToxicity || 0,
    });
  const conditionEffects = getConditionEffectsForConfig(
    config,
    currentCondition,
  );
  const configuredSkills = config.skills || [];
  const availableSkills = getAvailableSkills(
    baselineState,
    config,
    currentCondition,
  );

  const collectSamples = (skills: SkillDefinition[]): ProgressScoringSample[] =>
    skills
      .map((skill) => {
        const consumesTurn =
          skill.consumesTurn !== undefined
            ? skill.consumesTurn
            : skill.actionKind !== 'item';
        if (!consumesTurn) {
          return null;
        }

        const gains = calculateSkillGains(
          baselineState,
          skill,
          config,
          conditionEffects,
          { includeExpectedValue: false },
        );
        const completionGain = Math.max(0, gains.completion);
        const perfectionGain = Math.max(0, gains.perfection);
        const totalGain = completionGain + perfectionGain;
        if (totalGain <= 0) {
          return null;
        }

        const costs = calculateEffectiveActionCosts(
          baselineState,
          skill,
          config.minStability,
          conditionEffects,
          config,
        );

        return {
          completionGain,
          perfectionGain,
          totalGain,
          qiCost: Math.max(0, costs.qiCost),
          stabilityCost: Math.max(0, costs.stabilityCost),
        } satisfies ProgressScoringSample;
      })
      .filter((sample): sample is ProgressScoringSample => sample !== null);

  const samples = collectSamples(availableSkills);
  const fallbackSamples =
    samples.length > 0 ? samples : collectSamples(configuredSkills);

  if (fallbackSamples.length === 0) {
    const fallbackGain = Math.max(
      1,
      config.baseIntensity || 12,
      config.baseControl || 16,
    );
    return {
      avgStabilityCostPerTurn: DEFAULT_SCORING_CONTEXT.avgStabilityCostPerTurn,
      avgCompletionGainPerTurn: fallbackGain,
      avgPerfectionGainPerTurn: fallbackGain,
      avgGainPerTurn: fallbackGain,
      avgQiCostPerTurn: DEFAULT_SCORING_CONTEXT.avgQiCostPerTurn,
    };
  }

  const topOverallSamples = [...fallbackSamples]
    .sort((a, b) => b.totalGain - a.totalGain)
    .slice(0, Math.max(1, SCORING_CONTEXT_PROGRESS_SAMPLE_SIZE));

  const avgCompletionGainPerTurn = Math.max(
    1,
    getTopProgressAverage(
      fallbackSamples.map((sample) => sample.completionGain),
    ) || average(topOverallSamples.map((sample) => sample.totalGain)),
  );
  const avgPerfectionGainPerTurn = Math.max(
    1,
    getTopProgressAverage(
      fallbackSamples.map((sample) => sample.perfectionGain),
    ) || average(topOverallSamples.map((sample) => sample.totalGain)),
  );
  const avgGainPerTurn = Math.max(
    1,
    average(topOverallSamples.map((sample) => sample.totalGain)),
  );
  const avgStabilityCostPerTurn = Math.max(
    1,
    average(topOverallSamples.map((sample) => sample.stabilityCost)) ||
      DEFAULT_SCORING_CONTEXT.avgStabilityCostPerTurn,
  );
  const avgQiCostPerTurn = Math.max(
    0,
    average(topOverallSamples.map((sample) => sample.qiCost)),
  );

  // Keep the existing top-sample damping of unusually large gains, but retain
  // action coupling. Marginal averages and total gain alone cannot distinguish
  // one dual-bar action from two separate single-bar actions.
  const progressRates = fallbackSamples.map((sample) => ({
    completion: Math.min(sample.completionGain, avgCompletionGainPerTurn),
    perfection: Math.min(sample.perfectionGain, avgPerfectionGainPerTurn),
  }));
  const nonDominatedRates = progressRates.filter(
    (rate, index) =>
      !progressRates.some(
        (other, otherIndex) =>
          other.completion >= rate.completion &&
          other.perfection >= rate.perfection &&
          (other.completion > rate.completion ||
            other.perfection > rate.perfection ||
            otherIndex < index),
      ),
  );

  return {
    avgStabilityCostPerTurn,
    avgCompletionGainPerTurn,
    avgPerfectionGainPerTurn,
    avgGainPerTurn,
    avgQiCostPerTurn,
    progressRates: nonDominatedRates,
  };
}
