import { CraftingState } from '../state';

import {
  OptimizerConfig,
  SkillDefinition,
  techniqueDisplayName,
} from '../skills';

import {
  type ScalingVariables,
  type Scaling,
  evaluateScaling,
  type BuffDefinition,
} from '../gameTypes';

import type { SetupForHint } from './types';

import { SCORING } from './scoring';

export { estimateGoalUnlockOrderingBonus };

/**
 * Minimal scaling variables for expression-gate probes used by move ordering.
 * Only the craft-progress fields need to be accurate; combat stats are zeroed.
 */
function buildGoalUnlockScalingVariables(
  state: CraftingState,
  config: OptimizerConfig,
): ScalingVariables {
  const maxcompletion = Math.max(0, config.targetCompletion ?? 0);
  const maxperfection = Math.max(0, config.targetPerfection ?? 0);
  return {
    control: 0,
    intensity: 0,
    critchance: 0,
    critmultiplier: 0,
    overcrit: 0,
    overcritCapBonus: 0,
    refinementCritChance: 0,
    pool: state.qi,
    maxpool: config.maxQi,
    toxicity: state.toxicity,
    maxtoxicity: state.maxToxicity,
    resistance: 0,
    itemEffectiveness: state.itemEffectiveness,
    pillsPerRound: config.pillsPerRound || 1,
    poolCostFlat: 0,
    poolCostPercentage: 0,
    stabilityCostPercentage: 0,
    successChanceBonus: 0,
    stacks: 0,
    completionBoost: 0,
    perfectionBoost: 0,
    stabilityBoost: 0,
    qiBoost: 0,
    completion: state.completion,
    perfection: state.perfection,
    maxcompletion,
    maxperfection,
    stability: state.stability,
    maxstability: state.initialMaxStability,
  };
}

/** Evaluate only the boolean/expression gate of a scaling node. */
function evaluateExpressionGate(
  eqn: string | undefined,
  vars: ScalingVariables,
): number {
  if (!eqn) {
    return 1;
  }
  const gate: Scaling = { value: 1, eqn };
  const value = evaluateScaling(gate, vars, 0);
  return Number.isFinite(value) ? value : 0;
}

function collectBuffDefinitionsFromSkill(
  skill: SkillDefinition,
): BuffDefinition[] {
  const buffs: BuffDefinition[] = [];
  if (skill.grantedBuff) {
    buffs.push(skill.grantedBuff);
  }
  for (const effect of skill.effects ?? []) {
    if (effect.kind === 'createBuff' && effect.buff) {
      buffs.push(effect.buff);
    }
  }
  return buffs;
}

function collectExpressionGatesFromBuff(buff: BuffDefinition): string[] {
  const eqns: string[] = [];
  for (const scaling of Object.values(buff.stats ?? {})) {
    if (scaling?.eqn) {
      eqns.push(scaling.eqn);
    }
  }
  return eqns;
}

/**
 * Ordering-only bonus for actions that open a currently-false expression gate
 * or satisfy an unmet buffRequirement of another technique. Must never be mixed
 * into scored values — beam/depth pruning is the only consumer.
 *
 * Detected generically from skill data (no hardcoded technique names).
 *
 * Pass `unlocks` to also collect a description of each unlock. It stays
 * `undefined` on the search hot path so detection allocates nothing there, and
 * the display pass reuses the exact same detection instead of duplicating it.
 */
function estimateGoalUnlockOrderingBonus(
  before: CraftingState,
  after: CraftingState,
  config: OptimizerConfig,
  skills: readonly SkillDefinition[],
  totalTargetMagnitude: number,
  unlocks?: SetupForHint[],
): number {
  if (before === after) {
    return 0;
  }

  const beforeVars = buildGoalUnlockScalingVariables(before, config);
  const afterVars = buildGoalUnlockScalingVariables(after, config);
  let unlockCount = 0;

  for (const skill of skills) {
    // Expression gates on buffs this roster can grant.
    for (const buff of collectBuffDefinitionsFromSkill(skill)) {
      for (const eqn of collectExpressionGatesFromBuff(buff)) {
        const beforeGate = evaluateExpressionGate(eqn, beforeVars);
        const afterGate = evaluateExpressionGate(eqn, afterVars);
        if (beforeGate === 0 && afterGate !== 0) {
          unlockCount += 1;
          unlocks?.push({
            techniqueKey: skill.key,
            techniqueName: techniqueDisplayName(skill),
            reason: `Unlocks ${techniqueDisplayName(skill)}'s gated effect`,
          });
        }
      }
    }

    // buffRequirement preconditions of high-value techniques.
    const requirement = skill.buffRequirement;
    if (requirement) {
      const beforeStacks = before.getBuffStacks(requirement.buffName);
      const afterStacks = after.getBuffStacks(requirement.buffName);
      if (
        beforeStacks < requirement.amount &&
        afterStacks >= requirement.amount
      ) {
        unlockCount += 1;
        unlocks?.push({
          techniqueKey: skill.key,
          techniqueName: techniqueDisplayName(skill),
          reason: `Reaches ${requirement.amount} ${requirement.buffName} to enable ${techniqueDisplayName(skill)}`,
        });
      }
    }
  }

  if (unlockCount <= 0) {
    return 0;
  }

  return (
    unlockCount *
    Math.max(1, totalTargetMagnitude) *
    SCORING.GOAL_UNLOCK_ORDERING_WEIGHT
  );
}
