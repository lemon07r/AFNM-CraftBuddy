import { TechniqueType } from '../gameTypes';

import { getHarmonyStatModifiers, INSCRIBED_PATTERN_BLOCK } from '../harmony';

import { CraftingState } from '../state';

export { evaluateHarmonySubsystemQuality };

function getTechniqueNeedAlignment(
  techniqueType: TechniqueType | undefined,
  completionPriorityShare: number,
  perfectionPriorityShare: number,
): number {
  switch (techniqueType) {
    case 'fusion':
      return completionPriorityShare * 2 - 1;
    case 'refine':
      return perfectionPriorityShare * 2 - 1;
    default:
      return 0;
  }
}

function evaluateGenericHarmonyModifierQuality(
  mods: ReturnType<typeof getHarmonyStatModifiers>,
  completionPriorityShare: number,
  perfectionPriorityShare: number,
): number {
  const clampQuality = (value: number): number =>
    Math.max(-1, Math.min(1, value));
  const normalizeMultiplierQuality = (multiplier: number): number => {
    if (multiplier >= 1.5) return 1;
    if (multiplier <= 0) return -1;
    return (multiplier - 1) / 0.5;
  };

  let weightedTotal = 0;
  let totalWeight = 0;
  const addQuality = (quality: number, weight: number, active: boolean) => {
    if (!active || !Number.isFinite(quality) || weight <= 0) {
      return;
    }
    weightedTotal += quality * weight;
    totalWeight += weight;
  };

  const progressQuality =
    completionPriorityShare *
      normalizeMultiplierQuality(mods.intensityMultiplier) +
    perfectionPriorityShare *
      normalizeMultiplierQuality(mods.controlMultiplier);
  addQuality(
    progressQuality,
    1,
    mods.intensityMultiplier !== 1 || mods.controlMultiplier !== 1,
  );
  addQuality(
    clampQuality(mods.critChanceBonus / 25),
    1,
    mods.critChanceBonus !== 0,
  );
  addQuality(
    clampQuality(mods.successChanceBonus / 0.25),
    1,
    mods.successChanceBonus !== 0,
  );
  addQuality(
    clampQuality((100 - mods.poolCostPercentage) / 25),
    1,
    mods.poolCostPercentage !== 100,
  );
  addQuality(
    clampQuality((100 - mods.stabilityCostPercentage) / 25),
    1,
    mods.stabilityCostPercentage !== 100,
  );

  if (totalWeight <= 0) {
    return 0;
  }

  return clampQuality(weightedTotal / totalWeight);
}

/**
 * Evaluate the quality of the current harmony sub-system state.
 *
 * Returns a value in [-1, +1] representing how productive the current
 * harmony sub-system state is for making progress:
 *   +1  = optimal (e.g., forge heat 4-6: both stats get 1.5×)
 *    0  = neutral (no harmony data, or modifiers are all 1×)
 *   -1  = terrible (e.g., forge heat 0: control is -9×)
 *
 * Uses the actual stat modifiers plus subsystem-specific state that affects
 * future move quality but is not visible in the immediate completion /
 * perfection gains alone (for example resonance target alignment and partial
 * alchemical charge progress).
 */
function evaluateHarmonySubsystemQuality(
  harmonyData: NonNullable<CraftingState['harmonyData']>,
  completionPriorityShare: number = 0.5,
  perfectionPriorityShare: number = 0.5,
): number {
  const clampQuality = (value: number): number =>
    Math.max(-1, Math.min(1, value));
  const normalizeMultiplierQuality = (multiplier: number): number => {
    if (multiplier >= 1.5) return 1;
    if (multiplier <= 0) return -1;
    return (multiplier - 1) / 0.5;
  };

  // Forge works: use heat-based modifiers directly.
  if (harmonyData.forgeWorks) {
    const heat = harmonyData.forgeWorks.heat;
    const mods = getHarmonyStatModifiers(harmonyData, 'forge');
    const weightedMultiplierQuality =
      completionPriorityShare *
        normalizeMultiplierQuality(mods.intensityMultiplier) +
      perfectionPriorityShare *
        normalizeMultiplierQuality(mods.controlMultiplier);
    // Normalize correction pressure by the maximum possible distance so that
    // neutral heat states (e.g., heat=1) are penalized proportionally, not
    // as much as collapse states (heat=0 or heat=10).
    // Max distance below sweet spot: 2 fusions from heat=0 → heat=4.
    // Max distance above sweet spot: 4 refines from heat=10 → heat=6.
    const turnsToSweetSpot =
      heat < 4 ? Math.ceil((4 - heat) / 2) : heat > 6 ? heat - 6 : 0;
    const maxDistanceBelow = 2; // heat=0 needs 2 fusions
    const maxDistanceAbove = 4; // heat=10 needs 4 refines
    const correctionPressure =
      heat < 4
        ? (turnsToSweetSpot / maxDistanceBelow) * perfectionPriorityShare
        : (turnsToSweetSpot / maxDistanceAbove) * completionPriorityShare;
    return clampQuality(weightedMultiplierQuality - correctionPressure);
  }

  // Inscription: stacks provide a scaling bonus.
  // Also factor in how far through the current block we are, since being
  // partway through a valid block (fewer remaining moves to complete it)
  // represents concrete setup progress toward the next stack batch.
  if (harmonyData.inscribedPatterns) {
    const mods = getHarmonyStatModifiers(harmonyData, 'inscription');
    const stackQuality = (mods.controlMultiplier - 1) * 5;
    const totalBlockSize = INSCRIBED_PATTERN_BLOCK.length;
    const currentBlockRemaining =
      harmonyData.inscribedPatterns.currentBlock?.length ?? totalBlockSize;
    const blockProgress = Math.max(
      0,
      (totalBlockSize - currentBlockRemaining) / totalBlockSize,
    );
    // Blend current stack quality with block completion progress so the scorer
    // values states that are partway through a valid block more than zero-stack
    // starting states.
    const progressBonus = blockProgress * 0.3;
    return clampQuality(stackQuality + progressBonus);
  }

  if (harmonyData.alchemicalArts) {
    const mods = getHarmonyStatModifiers(harmonyData, 'alchemical');
    const modifierQuality = evaluateGenericHarmonyModifierQuality(
      mods,
      completionPriorityShare,
      perfectionPriorityShare,
    );
    const charges = harmonyData.alchemicalArts.charges;
    const recommended = harmonyData.recommendedTechniqueTypes ?? [];
    if (charges.length === 0 || recommended.length === 0) {
      return modifierQuality;
    }

    const setupProgress = Math.max(0, Math.min(1, charges.length / 2));
    const bestRecommendedAlignment = Math.max(
      ...recommended.map((type) =>
        getTechniqueNeedAlignment(
          type,
          completionPriorityShare,
          perfectionPriorityShare,
        ),
      ),
    );
    const setupQuality = clampQuality(setupProgress * bestRecommendedAlignment);

    return modifierQuality === 0
      ? setupQuality
      : clampQuality((modifierQuality + setupQuality) / 2);
  }

  if (harmonyData.resonance) {
    const mods = getHarmonyStatModifiers(harmonyData, 'resonance');
    const modifierQuality = evaluateGenericHarmonyModifierQuality(
      mods,
      completionPriorityShare,
      perfectionPriorityShare,
    );
    const resonanceState = harmonyData.resonance;
    const currentAlignment = getTechniqueNeedAlignment(
      resonanceState.resonance,
      completionPriorityShare,
      perfectionPriorityShare,
    );
    let quality =
      resonanceState.resonance === undefined
        ? modifierQuality
        : clampQuality((modifierQuality + currentAlignment) / 2);

    if (
      resonanceState.pendingResonance &&
      resonanceState.pendingCount > 0 &&
      resonanceState.pendingResonance !== resonanceState.resonance
    ) {
      const pendingAlignment = getTechniqueNeedAlignment(
        resonanceState.pendingResonance,
        completionPriorityShare,
        perfectionPriorityShare,
      );
      // Weight the pending alignment based on how soon the switch happens.
      // pendingCount=1 → switch is imminent: weight pending heavily (0.8).
      // pendingCount=3+ → switch is further away: blend current and pending.
      // This avoids the double-average that previously made even an imminent
      // good switch look negative when the current resonance is misaligned.
      const switchWeight = Math.max(
        0.2,
        Math.min(0.8, 1 - (resonanceState.pendingCount - 1) * 0.25),
      );
      const switchAlignmentQuality = clampQuality(
        currentAlignment * (1 - switchWeight) + pendingAlignment * switchWeight,
      );
      // Blend the alignment quality with the strength-based modifier quality so
      // that high-strength resonance still provides value even during a switch.
      quality = clampQuality((modifierQuality + switchAlignmentQuality) / 2);
    }

    return quality;
  }

  if (harmonyData.captivatingCadence) {
    const mods = getHarmonyStatModifiers(harmonyData, 'captivatingCadence');
    return evaluateGenericHarmonyModifierQuality(
      mods,
      completionPriorityShare,
      perfectionPriorityShare,
    );
  }

  return 0;
}
