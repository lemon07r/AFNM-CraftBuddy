/**
 * CraftBuddy - Craft-state extraction.
 *
 * Turns raw AFNM runtime shapes (progress state, buffs, techniques, inventory,
 * native crafting variables) into the optimizer's own vocabulary, and provides
 * the canonical serializers the state-signature seam depends on.
 *
 * Every function here is a pure function of its arguments: it reads no
 * craft-session state and mutates nothing beyond the shared diagnostics
 * counters. `index.ts` decides *when* extraction happens; this module owns *how*
 * a runtime shape is read.
 *
 * Extracted verbatim from `src/modContent/index.ts` during the 6.0.0 split.
 */

import type {
  CraftingBuff,
  CraftingCondition,
  CraftingEntity,
  CraftingPillItem,
  CraftingReagentItem,
  CraftingRecipeStats,
  CraftingTechnique,
  KnownCraftingTechnique,
  ProgressState,
  RecipeItem,
  RootState,
} from 'afnm-types';
import {
  BuffType,
  getBonusAndChance,
  type CraftingState,
  type SkillDefinition,
  type SkillMastery,
} from '../optimizer';
import {
  integrationDiagnostics,
  type CompletionBonusSource,
} from './craftSession';
import {
  getModApiCompletionBonusBuffKey,
  getModApiTechniqueFromKnownResolver,
  normalizeBuffKey,
} from './modApiProviders';
import { shouldUseCapAsTargetFallback } from './craftingContext';
import {
  buildKnownCraftingTechniqueNameMap,
  resolveLiveCraftingTechnique,
} from './techniqueResolution';
import { debugLog } from '../utils/debug';
import { parseGameNumber } from '../utils/largeNumbers';

export function serializeCraftingBuffs(
  buffs: CraftingBuff[] | undefined | null,
): string {
  if (!buffs?.length) {
    return 'none';
  }

  return buffs
    .map((buff) => {
      const name = String(buff?.name || '')
        .trim()
        .toLowerCase();
      const stacks = Number(buff?.stacks ?? 0) || 0;
      return `${name}:${stacks}`;
    })
    .filter(Boolean)
    .sort()
    .join('|');
}

export function serializeTechniqueCooldowns(
  techniques: CraftingTechnique[] | undefined,
): string {
  if (!techniques?.length) {
    return 'none';
  }

  return (
    techniques
      .map((technique) => {
        const key = String(technique?.name || '')
          .toLowerCase()
          .trim()
          .replace(/\s+/g, '_');
        const cooldown = Number(technique?.currentCooldown || 0) || 0;
        return key && cooldown > 0 ? `${key}:${cooldown}` : null;
      })
      .filter((entry): entry is string => Boolean(entry))
      .sort()
      .join('|') || 'none'
  );
}

export function serializeQuickAccessInventory(
  quickAccess: (string | undefined)[] | undefined,
  inventoryItems: InventoryItemLike[] | undefined,
): string {
  if (!inventoryItems?.length || !quickAccess?.length) {
    return 'none';
  }

  return quickAccess
    .filter(Boolean)
    .map((name) => {
      const entry = inventoryItems.find((item) => item?.name === name);
      return `${String(name).toLowerCase()}:${Number(entry?.stacks ?? 0) || 0}`;
    })
    .join('|');
}

export function computeObservedMaxStability(
  progressState: ProgressState | null | undefined,
  maxStabilityTarget: number,
  fallbackValue: number,
): number {
  const stabilityPenalty = parseGameNumber(
    (progressState as any)?.stabilityPenalty,
    0,
  );

  if (maxStabilityTarget > 0) {
    return Math.max(0, maxStabilityTarget - stabilityPenalty);
  }

  return fallbackValue;
}

/**
 * Extract buff information from game's CraftingBuff array.
 */
export function extractBuffInfo(buffs: CraftingBuff[] | undefined): {
  controlBuffTurns: number;
  intensityBuffTurns: number;
  controlBuffMultiplier: number;
  intensityBuffMultiplier: number;
} {
  let controlBuffTurns = 0;
  let intensityBuffTurns = 0;
  let controlBuffMultiplier = 1.4;
  let intensityBuffMultiplier = 1.4;

  if (!buffs)
    return {
      controlBuffTurns,
      intensityBuffTurns,
      controlBuffMultiplier,
      intensityBuffMultiplier,
    };

  for (const buff of buffs) {
    const name = (buff.name || '').toLowerCase();
    const stacks = buff.stacks || 0;

    if (name.includes('control') || name.includes('inner focus')) {
      controlBuffTurns = Math.max(controlBuffTurns, stacks);
      if (buff.stats?.control?.value !== undefined) {
        controlBuffMultiplier = 1 + buff.stats.control.value;
      }
    }
    if (name.includes('intensity') || name.includes('inner fire')) {
      intensityBuffTurns = Math.max(intensityBuffTurns, stacks);
      if (buff.stats?.intensity?.value !== undefined) {
        intensityBuffMultiplier = 1 + buff.stats.intensity.value;
      }
    }
  }

  return {
    controlBuffTurns,
    intensityBuffTurns,
    controlBuffMultiplier,
    intensityBuffMultiplier,
  };
}

/**
 * Extract mastery data from a technique's mastery array.
 *
 * In addition to simple numeric bonuses, some masteries use `kind: 'effect'`
 * and add additional technique effects (e.g., granting extra buff stacks).
 */
export function extractMasteryData(mastery: any[] | undefined): {
  bonuses: SkillMastery;
  extraEffects: any[];
  masteryEntries: any[];
} {
  const bonuses: SkillMastery = {};
  const extraEffects: any[] = [];
  const masteryEntries: any[] = [];

  if (!mastery || mastery.length === 0)
    return { bonuses, extraEffects, masteryEntries };

  for (const m of mastery) {
    if (!m) continue;
    masteryEntries.push(m);

    switch (m.kind) {
      case 'control':
        bonuses.controlBonus =
          (bonuses.controlBonus || 0) + (m.percentage || 0);
        break;
      case 'intensity':
        bonuses.intensityBonus =
          (bonuses.intensityBonus || 0) + (m.percentage || 0);
        break;
      case 'poolcost':
        bonuses.poolCostReduction =
          (bonuses.poolCostReduction || 0) + (m.change || 0);
        break;
      case 'stabilitycost':
        bonuses.stabilityCostReduction =
          (bonuses.stabilityCostReduction || 0) + (m.change || 0);
        break;
      case 'successchance':
        bonuses.successChanceBonus =
          (bonuses.successChanceBonus || 0) + (m.change || 0);
        break;
      case 'critchance':
        bonuses.critChanceBonus =
          (bonuses.critChanceBonus || 0) + (m.percentage || 0);
        break;
      case 'critmultiplier':
        bonuses.critMultiplierBonus =
          (bonuses.critMultiplierBonus || 0) + (m.percentage || 0);
        break;
      case 'effect':
        if (Array.isArray(m.effects)) {
          if (m.condition) {
            for (const effect of m.effects) {
              if (!effect) continue;
              extraEffects.push({
                ...effect,
                condition: effect.condition || m.condition,
              });
            }
          } else {
            extraEffects.push(...m.effects);
          }
        }
        break;
    }
  }

  return { bonuses, extraEffects, masteryEntries };
}

export function normalizeChance(value: number | undefined): number {
  if (!value || !Number.isFinite(value)) return 0;
  return value > 1 ? value / 100 : value;
}

export function normalizeRuntimeCostPercentage(raw: unknown): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return 100;
  }
  // Game runtime can report 0 as the neutral "no modifier" baseline.
  // Optimizer internals use 100 as the neutral percentage.
  if (parsed === 0) {
    return 100;
  }
  return parsed;
}

export function normalizeConditionKey(
  condition: string | undefined,
): CraftingCondition {
  const value = String(condition || '')
    .toLowerCase()
    .trim();
  switch (value) {
    case 'neutral':
    case 'balanced':
      return 'neutral';
    case 'positive':
    case 'harmonious':
      return 'positive';
    case 'negative':
    case 'resistant':
      return 'negative';
    case 'verypositive':
    case 'excellent':
    case 'brilliant':
      return 'veryPositive';
    case 'verynegative':
    case 'corrupted':
      return 'veryNegative';
    default:
      return 'neutral';
  }
}

export function toFinitePositiveNumber(value: unknown): number | undefined {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : undefined;
  if (parsed === undefined || !Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }
  return parsed;
}

export function toFiniteNumber(value: unknown): number | undefined {
  const parsed =
    typeof value === 'number'
      ? value
      : typeof value === 'string'
        ? Number(value)
        : undefined;
  if (parsed === undefined || !Number.isFinite(parsed)) {
    return undefined;
  }
  return parsed;
}

export function parsePositiveGameNumber(value: unknown): number | undefined {
  const parsed = parseGameNumber(value, Number.NaN);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }
  return parsed;
}

export function findPositiveGameNumber(
  candidates: unknown[],
): number | undefined {
  for (const candidate of candidates) {
    const parsed = parsePositiveGameNumber(candidate);
    if (parsed !== undefined) {
      return parsed;
    }
  }
  return undefined;
}

export function pickPositiveGameNumber(
  candidates: unknown[],
  fallback: number,
): number {
  return findPositiveGameNumber(candidates) ?? fallback;
}

export function resolveDomProgressTarget(params: {
  domTarget: number | undefined;
  cap: number | undefined;
  recipe: RecipeItem | undefined;
  recipeStats: CraftingRecipeStats | undefined;
}): number | undefined {
  const { domTarget, cap, recipe, recipeStats } = params;
  if (domTarget === undefined || domTarget <= 0) {
    return undefined;
  }
  if (
    cap !== undefined &&
    shouldUseCapAsTargetFallback({ recipe, recipeStats })
  ) {
    return cap;
  }
  return domTarget;
}

export function sanitizeNativeCraftingVariables(
  raw: unknown,
): Record<string, number> | undefined {
  if (!raw || typeof raw !== 'object') {
    return undefined;
  }

  const result: Record<string, number> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const parsed = toFiniteNumber(value);
    if (parsed !== undefined) {
      result[key] = parsed;
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

export function resolveNativeCraftingVariables(
  entity: CraftingEntity,
  progressState: ProgressState,
  recipeStats?: CraftingRecipeStats,
): Record<string, number> | undefined {
  if (!recipeStats) {
    return undefined;
  }

  const modUtils = (window as any)?.modAPI?.utils;
  if (typeof modUtils?.getVariablesFromCraftingEntity !== 'function') {
    return undefined;
  }

  try {
    const raw = modUtils.getVariablesFromCraftingEntity(
      entity,
      recipeStats,
      progressState,
    );
    const sanitized = sanitizeNativeCraftingVariables(raw);
    if (sanitized) {
      integrationDiagnostics.usingModApiCraftingVariableResolver = true;
      return sanitized;
    }
  } catch (error) {
    console.warn(
      '[CraftBuddy] ModAPI variable resolver failed, using local variable fallback:',
      error,
    );
  }

  return undefined;
}

export function resolveMaxToxicityCap(
  realm: string | undefined,
  fallbackValue: number,
): number {
  const modUtils = (window as any)?.modAPI?.utils;
  if (!realm || typeof modUtils?.getMaxToxicity !== 'function') {
    return fallbackValue;
  }

  try {
    const nativeCap = toFinitePositiveNumber(modUtils.getMaxToxicity(realm));
    if (nativeCap !== undefined) {
      integrationDiagnostics.usingModApiMaxToxicityGetter = true;
      return nativeCap;
    }
  } catch (error) {
    console.warn(
      '[CraftBuddy] ModAPI max toxicity getter failed, using local fallback:',
      error,
    );
  }

  return fallbackValue;
}

export function extractCapCandidate(
  source: any,
  keys: string[],
): number | undefined {
  for (const key of keys) {
    const raw = source?.[key];
    if (raw === undefined || raw === null) continue;

    if (typeof raw === 'object') {
      const nested =
        toFinitePositiveNumber(raw.flat) ??
        toFinitePositiveNumber(raw.value) ??
        toFinitePositiveNumber(raw.max) ??
        toFinitePositiveNumber(raw.cap);
      if (nested !== undefined) {
        return nested;
      }
      continue;
    }

    const parsed = toFinitePositiveNumber(raw);
    if (parsed !== undefined) {
      return parsed;
    }
  }
  return undefined;
}

export function extractCompletionBonusStacks(
  buffs: CraftingBuff[] | undefined,
  completion: number,
  completionTarget: number,
): { stacks: number; source: CompletionBonusSource; mismatch: boolean } {
  const expectedFromProgress =
    completionTarget > 0
      ? Math.max(
          0,
          getBonusAndChance(completion, completionTarget).guaranteed - 1,
        )
      : undefined;

  let stacksFromBuff: number | undefined = undefined;
  const completionBonusBuffKey = getModApiCompletionBonusBuffKey();
  if (buffs) {
    for (const buff of buffs) {
      const stacks = Number((buff as any)?.stacks ?? 0);
      if (!Number.isFinite(stacks) || stacks <= 0) continue;

      const key = normalizeBuffKey(buff?.name);
      const isNamedCompletionBonus =
        key === completionBonusBuffKey ||
        key === 'completion_bonus' ||
        (key.includes('completion') && key.includes('bonus'));

      const controlStat = (buff as any)?.stats?.control;
      const controlValue = Number(controlStat?.value ?? NaN);
      const controlScaling = String(controlStat?.scaling ?? '').toLowerCase();
      const hasNoActionBlocks =
        !(buff as any)?.effects?.length &&
        !(buff as any)?.onFusion?.length &&
        !(buff as any)?.onRefine?.length &&
        !(buff as any)?.onStabilize?.length &&
        !(buff as any)?.onSupport?.length;
      const isControlStacksSignature =
        Number.isFinite(controlValue) &&
        Math.abs(controlValue - 0.1) < 1e-6 &&
        controlScaling === 'stacks' &&
        hasNoActionBlocks;

      if (isNamedCompletionBonus || isControlStacksSignature) {
        const normalizedStacks = Math.max(0, Math.floor(stacks));
        stacksFromBuff =
          stacksFromBuff === undefined
            ? normalizedStacks
            : Math.max(stacksFromBuff, normalizedStacks);
      }
    }
  }

  if (stacksFromBuff !== undefined) {
    const mismatch =
      expectedFromProgress !== undefined &&
      stacksFromBuff !== expectedFromProgress;
    if (mismatch) {
      debugLog(
        `[CraftBuddy] Completion bonus mismatch (buff=${stacksFromBuff}, computed=${expectedFromProgress}), using buff value`,
      );
    }
    return { stacks: stacksFromBuff, source: 'buff', mismatch };
  }

  if (expectedFromProgress !== undefined) {
    return {
      stacks: expectedFromProgress,
      source: 'computed',
      mismatch: false,
    };
  }

  return { stacks: 0, source: 'none', mismatch: false };
}

export function getKnownCraftingTechniquesFromState(
  state: RootState | any,
): KnownCraftingTechnique[] | undefined {
  const knownTechniques = state?.player?.player?.craftingTechniques;
  return Array.isArray(knownTechniques)
    ? (knownTechniques as KnownCraftingTechnique[])
    : undefined;
}

/**
 * Convert game CraftingTechnique array to our skill definitions.
 */
export function convertGameTechniques(
  techniques: CraftingTechnique[] | undefined,
  knownTechniques?: KnownCraftingTechnique[],
): SkillDefinition[] {
  if (!techniques || techniques.length === 0) {
    console.warn('[CraftBuddy] No techniques provided');
    return [];
  }

  // Log full technique data for debugging
  debugLog(
    '[CraftBuddy] Raw techniques from game:',
    JSON.stringify(
      techniques.map((t) => ({
        name: t?.name,
        type: t?.type,
        effects: t?.effects?.map((e) => ({
          kind: e?.kind,
          amount: (e as any)?.amount,
        })),
      })),
      null,
      2,
    ),
  );

  const skills: SkillDefinition[] = [];
  const modApiTechniqueFromKnown = getModApiTechniqueFromKnownResolver();
  const knownTechniqueByName =
    buildKnownCraftingTechniqueNameMap(knownTechniques);

  for (const tech of techniques) {
    if (!tech) continue;

    let sourceTech = tech;
    let usedModApiTechniqueFromKnown = false;
    if (modApiTechniqueFromKnown && knownTechniqueByName.size > 0) {
      try {
        const resolvedTechnique = resolveLiveCraftingTechnique({
          liveTechnique: tech,
          knownTechniqueByName,
          resolveTechniqueFromKnown: modApiTechniqueFromKnown,
        });
        if (resolvedTechnique.source === 'known') {
          sourceTech = resolvedTechnique.technique;
          usedModApiTechniqueFromKnown = true;
          integrationDiagnostics.usingModApiTechniqueFromKnown = true;
          integrationDiagnostics.techniqueFromKnownMatchCount++;
        } else {
          integrationDiagnostics.techniqueFromKnownFallbackCount++;
          debugLog(
            `[CraftBuddy] No known-technique name match for live technique "${tech.name}", using live payload`,
          );
        }
      } catch (error) {
        integrationDiagnostics.techniqueFromKnownFallbackCount++;
        integrationDiagnostics.techniqueFromKnownResolverFailureCount++;
        console.warn(
          '[CraftBuddy] ModAPI craftingTechniqueFromKnown resolver failed, using live technique:',
          error,
        );
      }
    }

    const qiCost = sourceTech.noQiCost ? 0 : sourceTech.poolCost || 0;
    const stabilityCost = sourceTech.stabilityCost || 0;
    const toxicityCost = sourceTech.toxicityCost || 0;
    const techType = sourceTech.type || 'support';
    const techName = sourceTech.name || 'Unknown';
    const cooldown = (() => {
      const staticCooldown = Number(sourceTech.cooldown || 0);
      if (Number.isFinite(staticCooldown) && staticCooldown > 0) {
        return staticCooldown;
      }
      const observedCooldown = Number(sourceTech.currentCooldown || 0);
      if (Number.isFinite(observedCooldown) && observedCooldown > 0) {
        return observedCooldown;
      }
      return 0;
    })();
    const preventsMaxStabilityDecay = sourceTech.noMaxStabilityLoss === true;
    const masteryData = extractMasteryData(sourceTech.mastery);
    // poolcost/stabilitycost/successchance masteries are already baked into
    // technique pool/stability/success values by game-side technique construction.
    // Keep only runtime-applied mastery kinds to avoid double counting in simulation.
    const masteryEntries = masteryData.masteryEntries.filter((entry) => {
      const kind = String((entry as any)?.kind || '').toLowerCase();
      if (
        kind === 'poolcost' ||
        kind === 'stabilitycost' ||
        kind === 'successchance'
      ) {
        return false;
      }
      // If we resolved a mastery-applied technique from known-technique data,
      // avoid double-applying upgrade masteries in simulation.
      if (usedModApiTechniqueFromKnown && kind === 'upgrade') {
        return false;
      }
      return true;
    });
    const mastery: SkillMastery = { ...masteryData.bonuses };
    delete mastery.poolCostReduction;
    delete mastery.stabilityCostReduction;
    delete mastery.successChanceBonus;

    let baseCompletionGain = 0;
    let basePerfectionGain = 0;
    let stabilityGain = 0;
    let maxStabilityChange = 0;
    let restoresMaxStabilityToFull = false;
    let toxicityCleanse = 0;
    let buffType = BuffType.NONE;
    let buffDuration = 0;
    let buffMultiplier = 1.0;
    // Track scaling stat for each effect type separately
    let completionScalingStat: string | undefined;
    let perfectionScalingStat: string | undefined;

    // Track stack-buff requirements/consumption (e.g., Pressure)
    let buffRequirement: { buffName: string; amount: number } | undefined;
    let buffCost:
      | { buffName: string; amount?: number; consumeAll?: boolean }
      | undefined;

    const effects = [
      ...(sourceTech.effects || []),
      ...(masteryData.extraEffects || []),
    ];
    for (const effect of effects) {
      if (!effect) continue;

      // Handle buff gating/consumption effects (game types are loosely typed; use best-effort parsing)
      const kind = String((effect as any).kind || '');
      if (
        /restore.*maxstability/i.test(kind) ||
        /maxstability.*restore/i.test(kind)
      ) {
        restoresMaxStabilityToFull = true;
      }
      if (/requirebuff/i.test(kind)) {
        const buff = (effect as any).buff;
        const rawName = (buff?.name || '').toLowerCase().trim();
        const buffName = rawName.replace(/\s+/g, '_');
        const amount =
          (effect as any).stacks?.value ?? (effect as any).amount?.value ?? 1;
        if (buffName) {
          buffRequirement = { buffName, amount };
        }
      }
      if (/consumebuff/i.test(kind)) {
        const buff = (effect as any).buff;
        const rawName = (buff?.name || '').toLowerCase().trim();
        const buffName = rawName.replace(/\s+/g, '_');
        const amount =
          (effect as any).stacks?.value ?? (effect as any).amount?.value;
        if (buffName) {
          buffCost =
            amount !== undefined
              ? { buffName, amount }
              : { buffName, consumeAll: true };
        }
      }

      switch (effect.kind) {
        case 'completion':
          baseCompletionGain = effect.amount?.value || 0;
          completionScalingStat = effect.amount?.stat;
          break;
        case 'perfection':
          basePerfectionGain = effect.amount?.value || 0;
          perfectionScalingStat = effect.amount?.stat;
          break;
        case 'stability':
          stabilityGain = effect.amount?.value || 0;
          break;
        case 'maxStability':
          maxStabilityChange = effect.amount?.value || 0;
          break;
        case 'cleanseToxicity':
          toxicityCleanse = effect.amount?.value || 0;
          break;
        case 'createBuff':
          const buff = effect.buff;
          const buffName = (buff?.name || '').toLowerCase();

          if (
            buffName.includes('control') ||
            buffName.includes('inner focus')
          ) {
            buffType = BuffType.CONTROL;
            if (buff?.stats?.control?.value) {
              buffMultiplier = 1 + (buff.stats.control.value || 0.4);
            }
          } else if (
            buffName.includes('intensity') ||
            buffName.includes('inner fire')
          ) {
            buffType = BuffType.INTENSITY;
            if (buff?.stats?.intensity?.value) {
              buffMultiplier = 1 + (buff.stats.intensity.value || 0.4);
            }
          }
          buffDuration = effect.stacks?.value || 2;
          break;
      }
    }

    // Some skills (e.g., Restoring Brilliance) fully restore max stability.
    // The effect shape for this can vary; use a name-based fallback if we didn't detect a dedicated effect kind.
    if (
      !restoresMaxStabilityToFull &&
      techName.toLowerCase().includes('restoring brilliance')
    ) {
      restoresMaxStabilityToFull = true;
    }

    // Only set scaling flags based on actual effect scaling stats, not just technique type
    // This fixes the bug where skills without perfection effects were showing predicted perfection gains
    const scalesWithIntensity = completionScalingStat === 'intensity';
    const scalesWithControl = perfectionScalingStat === 'control';
    const hasConsumeBuff = effects.some((e) => e?.kind === 'consumeBuff');
    const isDisciplinedTouch =
      hasConsumeBuff || techName.toLowerCase().includes('disciplined');

    // Extract condition requirement (e.g., Harmonious skills require 'positive' or 'veryPositive')
    const conditionRequirement = sourceTech.conditionRequirement as
      | string
      | undefined;

    // Extract Qi restore from 'pool' effect (for skills like Siphon Qi)
    let qiRestore = 0;
    for (const effect of effects) {
      if (effect?.kind === 'pool' && effect.amount?.value) {
        qiRestore = effect.amount.value;
      }
    }

    // Extract icon from technique (game provides icon as string path)
    const icon = sourceTech.icon as string | undefined;

    // 0.7.6 renamed False Fusion to "Strive for Completion" via `displayName`
    // only; `name` is still `False Fusion`, so keys stay stable while the UI can
    // show what the player actually sees.
    const rawDisplayName = (sourceTech as { displayName?: unknown }).displayName;
    const displayName =
      typeof rawDisplayName === 'string' && rawDisplayName.trim().length > 0
        ? rawDisplayName
        : undefined;

    skills.push({
      name: techName,
      displayName: displayName !== techName ? displayName : undefined,
      key: techName.toLowerCase().replace(/\s+/g, '_'),
      qiCost,
      stabilityCost,
      successChance:
        typeof (sourceTech as any).successChance === 'number'
          ? normalizeChance((sourceTech as any).successChance)
          : undefined,
      baseCompletionGain,
      basePerfectionGain,
      stabilityGain,
      maxStabilityChange,
      buffType,
      buffDuration,
      buffMultiplier,
      type: techType,
      icon,
      nativeTechnique: sourceTech,
      scalesWithControl,
      scalesWithIntensity,
      isDisciplinedTouch,
      preventsMaxStabilityDecay,
      toxicityCost: toxicityCost > 0 ? toxicityCost : undefined,
      toxicityCleanse: toxicityCleanse > 0 ? toxicityCleanse : undefined,
      cooldown: cooldown > 0 ? cooldown : undefined,
      mastery: Object.keys(mastery).length > 0 ? mastery : undefined,
      masteryEntries: masteryEntries.length > 0 ? masteryEntries : undefined,
      conditionRequirement,
      buffRequirement,
      buffCost,
      restoresQi: qiRestore > 0,
      qiRestore: qiRestore > 0 ? qiRestore : undefined,
      restoresMaxStabilityToFull: restoresMaxStabilityToFull || undefined,
      effects: effects as any,
      grantedBuff: effects.find((e) => e?.kind === 'createBuff')?.buff as any,
    });
  }

  debugLog(`[CraftBuddy] Loaded ${skills.length} techniques from game`);
  return skills;
}

export interface InventoryItemLike {
  name: string;
  stacks: number;
}

export function convertGameItemsToActions(
  entity: CraftingEntity,
  inventoryItems: InventoryItemLike[] | undefined,
  /**
   * Items the native auto-use loadout will apply itself.
   *
   * Excluding them keeps the optimizer from planning a consumption the game is
   * already going to perform, which would double-spend the player's pills.
   */
  excludedItemNames: ReadonlySet<string> = new Set<string>(),
): { itemActions: SkillDefinition[]; itemCounts: Map<string, number> } {
  const itemActions: SkillDefinition[] = [];
  const itemCounts = new Map<string, number>();
  const quickAccess = ((entity as any)?.craftingQuickAccess || []) as (
    | string
    | undefined
  )[];
  if (!quickAccess || quickAccess.length === 0) {
    return { itemActions, itemCounts };
  }

  const gameItems = (window as any)?.modAPI?.gameData?.items || {};
  const seen = new Set<string>();

  for (const name of quickAccess) {
    if (!name) continue;
    const normalizedName = String(name)
      .toLowerCase()
      .trim()
      .replace(/\s+/g, '_');
    if (!normalizedName || seen.has(normalizedName)) continue;
    seen.add(normalizedName);
    if (excludedItemNames.has(normalizedName)) continue;

    const inventoryEntry = inventoryItems?.find(
      (entry) => entry?.name === name,
    );
    const stacks = Number(inventoryEntry?.stacks ?? 0);
    if (!Number.isFinite(stacks) || stacks <= 0) continue;

    const gameItem = gameItems[name] as
      | CraftingPillItem
      | CraftingReagentItem
      | undefined;
    if (!gameItem) continue;
    if (gameItem.kind !== 'pill' && gameItem.kind !== 'reagent') continue;

    const effects = Array.isArray((gameItem as any).effects)
      ? (gameItem as any).effects
      : [];
    if (effects.length === 0) continue;

    itemCounts.set(normalizedName, Math.floor(stacks));
    itemActions.push({
      name: `Use ${name}`,
      key: `item_${normalizedName}`,
      actionKind: 'item',
      itemName: normalizedName,
      consumesTurn: false,
      reagentOnlyAtStepZero: gameItem.kind === 'reagent',
      qiCost: 0,
      stabilityCost: 0,
      successChance: 1,
      baseCompletionGain: 0,
      basePerfectionGain: 0,
      stabilityGain: 0,
      maxStabilityChange: 0,
      buffType: BuffType.NONE,
      buffDuration: 0,
      buffMultiplier: 1,
      type: 'support',
      toxicityCost: Number((gameItem as any).toxicity || 0) || undefined,
      effects: effects as any,
      icon: (gameItem as any).icon as string | undefined,
    });
  }

  return { itemActions, itemCounts };
}
