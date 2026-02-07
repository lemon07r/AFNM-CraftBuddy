/**
 * CraftBuddy - Main Mod Content
 *
 * Integrates the crafting optimizer with the game using a DOM-based overlay
 * that detects crafting state and displays recommendations.
 *
 * Approach: Since addHarmonyType doesn't override existing harmony types,
 * we use DOM observation to detect when crafting UI is visible and inject
 * our recommendation panel as an overlay.
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import {
  CraftingEntity,
  ProgressState,
  CraftingTechnique,
  CraftingRecipeStats,
  CraftingCondition,
  RecipeConditionEffect,
  CraftingBuff,
  CraftingPillItem,
  CraftingReagentItem,
  RecipeItem,
} from 'afnm-types';
import {
  CraftingState,
  findBestSkill,
  SearchResult,
  BuffType,
  OptimizerConfig,
  SkillDefinition,
  SkillMastery,
  parseRecipeConditionEffects,
  getBonusAndChance,
  normalizeForecastConditionQueue,
  setConditionTransitionProvider,
  VISIBLE_CONDITION_QUEUE_LENGTH,
  setNativeCraftingUtils,
  setNativeCanUseActionProvider,
} from '../optimizer';
import { RecommendationPanel } from '../ui/RecommendationPanel';
import { CraftBuddyThemeProvider } from '../ui/ThemeProvider';
import {
  CraftBuddySettings,
  saveSettings,
  loadSettings,
  getSearchConfig,
} from '../settings';
import { debugLog } from '../utils/debug';
import { checkPrecision, parseGameNumber } from '../utils/largeNumbers';

declare const MOD_METADATA: {
  name: string;
  version: string;
  author: { name: string } | string;
  description: string;
};

// Global state for the optimizer
let currentRecommendation: SearchResult | null = null;
let currentConfig: OptimizerConfig | null = null;
let targetCompletion = 100;
let targetPerfection = 100;
let targetStability = 60;
let maxCompletionCap: number | undefined = undefined;
let maxPerfectionCap: number | undefined = undefined;
let currentCompletion = 0;
let currentPerfection = 0;
let currentStability = 0;
let currentMaxStability = 60;
let currentStep = 0;
let currentCondition: CraftingCondition | undefined = undefined;
let nextConditions: CraftingCondition[] = [];
let conditionEffectsCache: RecipeConditionEffect | null = null;

type CompletionBonusSource = 'buff' | 'computed' | 'none';

interface IntegrationDiagnostics {
  conditionQueueNormalizedCount: number;
  conditionQueueTrimmedCount: number;
  conditionQueuePaddedCount: number;
  conditionProviderUsedCount: number;
  conditionProviderFailureCount: number;
  conditionProviderFallbackCount: number;
  completionBonusSource: CompletionBonusSource;
  completionBonusMismatchCount: number;
  usingModApiGetNextCondition: boolean;
  usingModApiTechniqueUpgradeResolver: boolean;
  usingModApiScalingEvaluator: boolean;
  usingModApiOvercritHelper: boolean;
  usingModApiCanUseActionPrecheck: boolean;
  usingModApiCapGetters: boolean;
  usingModApiCraftingVariableResolver: boolean;
  usingModApiMaxToxicityGetter: boolean;
  nativeCanUseActionCalls: number;
  nativeCanUseActionBlocked: number;
  nativeCanUseActionErrors: number;
}

const integrationDiagnostics: IntegrationDiagnostics = {
  conditionQueueNormalizedCount: 0,
  conditionQueueTrimmedCount: 0,
  conditionQueuePaddedCount: 0,
  conditionProviderUsedCount: 0,
  conditionProviderFailureCount: 0,
  conditionProviderFallbackCount: 0,
  completionBonusSource: 'none',
  completionBonusMismatchCount: 0,
  usingModApiGetNextCondition: false,
  usingModApiTechniqueUpgradeResolver: false,
  usingModApiScalingEvaluator: false,
  usingModApiOvercritHelper: false,
  usingModApiCanUseActionPrecheck: false,
  usingModApiCapGetters: false,
  usingModApiCraftingVariableResolver: false,
  usingModApiMaxToxicityGetter: false,
  nativeCanUseActionCalls: 0,
  nativeCanUseActionBlocked: 0,
  nativeCanUseActionErrors: 0,
};

// Toxicity tracking for alchemy crafting
let currentToxicity = 0;
let maxToxicity = 0;

// Cooldown tracking
let currentCooldowns: Map<string, number> = new Map();

// Current crafting type
let currentCraftingType: 'forge' | 'alchemical' | 'inscription' | 'resonance' =
  'forge';

// Sublime crafting mode (harmony type crafting that allows exceeding normal targets)
// - Standard sublime: 2x normal targets
// - Equipment crafting: potentially higher multipliers
let isSublimeCraft = false;
let sublimeTargetMultiplier = 2.0;

// Settings
let currentSettings: CraftBuddySettings = loadSettings();

// Calculation state tracking for loading indicator
let isCalculating = false;

// Track search-affecting settings for stale detection
interface LastSearchSettings {
  lookaheadDepth: number;
  searchTimeBudgetMs: number;
  searchMaxNodes: number;
  searchBeamWidth: number;
}
let lastSearchSettings: LastSearchSettings | null = null;

/**
 * Check if current settings differ from last calculated settings.
 */
function areSearchSettingsStale(): boolean {
  if (!lastSearchSettings) return false;
  return (
    currentSettings.lookaheadDepth !== lastSearchSettings.lookaheadDepth ||
    currentSettings.searchTimeBudgetMs !==
      lastSearchSettings.searchTimeBudgetMs ||
    currentSettings.searchMaxNodes !== lastSearchSettings.searchMaxNodes ||
    currentSettings.searchBeamWidth !== lastSearchSettings.searchBeamWidth
  );
}

/**
 * Snapshot current search settings after a calculation completes.
 */
function snapshotSearchSettings(): void {
  lastSearchSettings = {
    lookaheadDepth: currentSettings.lookaheadDepth,
    searchTimeBudgetMs: currentSettings.searchTimeBudgetMs,
    searchMaxNodes: currentSettings.searchMaxNodes,
    searchBeamWidth: currentSettings.searchBeamWidth,
  };
}

let lastDiagnosticsCheckCount = 0;
const DIAGNOSTICS_CHECK_INTERVAL = 20;

function checkIntegrationHealth(): void {
  lastDiagnosticsCheckCount++;
  if (lastDiagnosticsCheckCount < DIAGNOSTICS_CHECK_INTERVAL) return;
  lastDiagnosticsCheckCount = 0;

  const d = integrationDiagnostics;
  if (d.nativeCanUseActionCalls > 10 && d.nativeCanUseActionErrors > 0) {
    const errorRate = d.nativeCanUseActionErrors / d.nativeCanUseActionCalls;
    if (errorRate > 0.1) {
      console.warn(
        `[CraftBuddy] High native canUseAction error rate: ${(errorRate * 100).toFixed(1)}% (${d.nativeCanUseActionErrors}/${d.nativeCanUseActionCalls})`,
      );
    }
  }
  if (d.conditionProviderUsedCount > 5 && d.conditionProviderFailureCount > 0) {
    const failureRate =
      d.conditionProviderFailureCount /
      (d.conditionProviderUsedCount + d.conditionProviderFailureCount);
    if (failureRate > 0.2) {
      console.warn(
        `[CraftBuddy] High condition provider failure rate: ${(failureRate * 100).toFixed(1)}%`,
      );
    }
  }
}

// Store the last entity for rendering
let lastEntity: CraftingEntity | null = null;
let lastProgressState: ProgressState | null = null;
let lastRecipe: RecipeItem | undefined = undefined;
let lastRecipeStats: CraftingRecipeStats | undefined = undefined;

// DOM overlay elements
let overlayContainer: HTMLDivElement | null = null;
let reactRoot: ReactDOM.Root | null = null;
let isOverlayVisible = false;
let wasCraftingActive = false;
let overlayForcedByActiveCraft = false;

// Polling interval for crafting state detection
let pollingInterval: number | null = null;
const POLL_INTERVAL_MS = 500;

// LocalStorage key for caching targets (used for mid-craft save loads)
const TARGETS_CACHE_KEY = 'craftbuddy_targets_cache';

interface CachedTargets {
  completion: number;
  perfection: number;
  stability: number;
  recipeName?: string;
  timestamp: number;
}

/**
 * Save target values to localStorage for mid-craft save recovery.
 */
function cacheTargets(recipeName?: string): void {
  const cache: CachedTargets = {
    completion: targetCompletion,
    perfection: targetPerfection,
    stability: targetStability,
    recipeName,
    timestamp: Date.now(),
  };
  try {
    localStorage.setItem(TARGETS_CACHE_KEY, JSON.stringify(cache));
    debugLog(
      `[CraftBuddy] Cached targets: ${targetCompletion}/${targetPerfection}/${targetStability} for recipe: ${recipeName || 'unknown'}`,
    );
  } catch (e) {
    console.warn('[CraftBuddy] Failed to cache targets:', e);
  }
}

/**
 * Load cached target values from localStorage.
 * Returns true if valid cached targets were found and applied.
 */
function loadCachedTargets(): boolean {
  try {
    const cached = localStorage.getItem(TARGETS_CACHE_KEY);
    if (!cached) return false;

    const data: CachedTargets = JSON.parse(cached);

    // Cache is valid for 24 hours (in case of stale data)
    const maxAge = 24 * 60 * 60 * 1000;
    if (Date.now() - data.timestamp > maxAge) {
      debugLog('[CraftBuddy] Cached targets expired, ignoring');
      localStorage.removeItem(TARGETS_CACHE_KEY);
      return false;
    }

    // Validate the cached values are reasonable
    if (data.completion > 0 && data.perfection >= 0 && data.stability > 0) {
      targetCompletion = data.completion;
      targetPerfection = data.perfection;
      targetStability = data.stability;
      debugLog(
        `[CraftBuddy] Loaded cached targets: ${targetCompletion}/${targetPerfection}/${targetStability} (recipe: ${data.recipeName || 'unknown'})`,
      );
      return true;
    }
  } catch (e) {
    console.warn('[CraftBuddy] Failed to load cached targets:', e);
  }
  return false;
}

/**
 * Clear cached targets (called when crafting ends).
 */
function clearCachedTargets(): void {
  try {
    localStorage.removeItem(TARGETS_CACHE_KEY);
    debugLog('[CraftBuddy] Cleared cached targets');
  } catch (e) {
    // Ignore
  }
}

/**
 * Extract buff information from game's CraftingBuff array.
 */
function extractBuffInfo(buffs: CraftingBuff[] | undefined): {
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
function extractMasteryData(mastery: any[] | undefined): {
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

function normalizeChance(value: number | undefined): number {
  if (!value || !Number.isFinite(value)) return 0;
  return value > 1 ? value / 100 : value;
}

function normalizeBuffKey(name: string | undefined): string {
  return String(name || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_');
}

function normalizeConditionKey(
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

function getPathValue(root: any, path: string[]): any {
  let current = root;
  for (const segment of path) {
    if (!current || typeof current !== 'object') {
      return undefined;
    }
    current = current[segment];
  }
  return current;
}

function findFirstFunction(
  root: any,
  paths: string[][],
): ((...args: any[]) => any) | undefined {
  for (const path of paths) {
    const candidate = getPathValue(root, path);
    if (typeof candidate === 'function') {
      return candidate as (...args: any[]) => any;
    }
  }
  return undefined;
}

function getModApiNextConditionResolver():
  | ((progress: any) => any)
  | undefined {
  const modApi = (window as any)?.modAPI;
  return findFirstFunction(modApi, [
    ['store', 'turnHandling', 'getNextCondition'],
    ['Store', 'turnHandling', 'getNextCondition'],
    ['crafting', 'getNextCondition'],
    ['getNextCondition'],
  ]) as ((progress: any) => any) | undefined;
}

function getModApiTechniqueUpgradeResolver():
  | ((technique: CraftingTechnique) => CraftingTechnique)
  | undefined {
  const modApi = (window as any)?.modAPI;
  return findFirstFunction(modApi, [
    ['crafting', 'applyTechniqueUpgrades'],
    ['crafting', 'applyUpgradesToTechnique'],
    ['crafting', 'applyTechniqueMasteryUpgrades'],
    ['applyTechniqueUpgrades'],
  ]) as ((technique: CraftingTechnique) => CraftingTechnique) | undefined;
}

function configureNativeOptimizerProviders(): void {
  const modUtils = (window as any)?.modAPI?.utils;
  const nextConditionResolver = getModApiNextConditionResolver();

  const nativeEvaluateScaling =
    typeof modUtils?.evaluateScaling === 'function'
      ? (
          scaling: Record<string, unknown>,
          variables: Record<string, number>,
          stanceLength: number,
          preMaxTransform?: (value: number) => number,
        ) =>
          modUtils.evaluateScaling(
            scaling as any,
            variables,
            stanceLength,
            preMaxTransform,
          )
      : undefined;
  const nativeCalculateOvercrit =
    typeof modUtils?.calculateCraftingOvercrit === 'function'
      ? (critChance: number, critMultiplier: number) =>
          modUtils.calculateCraftingOvercrit(critChance, critMultiplier)
      : undefined;

  setNativeCraftingUtils(
    nativeEvaluateScaling || nativeCalculateOvercrit
      ? {
          evaluateScaling: nativeEvaluateScaling,
          calculateCraftingOvercrit: nativeCalculateOvercrit,
        }
      : undefined,
  );
  integrationDiagnostics.usingModApiScalingEvaluator = !!nativeEvaluateScaling;
  integrationDiagnostics.usingModApiOvercritHelper = !!nativeCalculateOvercrit;

  const nativeCanUseAction =
    typeof modUtils?.canUseAction === 'function'
      ? modUtils.canUseAction.bind(modUtils)
      : undefined;
  if (!nativeCanUseAction) {
    setNativeCanUseActionProvider(undefined);
  } else {
    setNativeCanUseActionProvider((context) => {
      if (context.skill.actionKind === 'item') {
        return undefined;
      }

      const nativeTechnique = (context.skill as any)
        ?.nativeTechnique as CraftingTechnique | undefined;
      if (!nativeTechnique) {
        return undefined;
      }

      const cooldownTurns = context.state.cooldowns.get(context.skill.key) ?? 0;
      const currentCooldown = Number(nativeTechnique.currentCooldown || 0) || 0;
      const techniqueForCheck =
        cooldownTurns === currentCooldown
          ? nativeTechnique
          : ({
              ...nativeTechnique,
              currentCooldown: cooldownTurns,
            } as CraftingTechnique);
      const condition = normalizeConditionKey(context.currentCondition);

      integrationDiagnostics.nativeCanUseActionCalls++;
      try {
        const result = nativeCanUseAction(
          techniqueForCheck,
          context.variables,
          context.effectiveQiCost,
          condition,
        );
        if (typeof result === 'boolean') {
          integrationDiagnostics.usingModApiCanUseActionPrecheck = true;
          if (result === false) {
            integrationDiagnostics.nativeCanUseActionBlocked++;
          }
          return result;
        }
      } catch (error) {
        integrationDiagnostics.nativeCanUseActionErrors++;
        console.warn(
          '[CraftBuddy] ModAPI canUseAction precheck failed, using local fallback:',
          error,
        );
      }

      return undefined;
    });
  }

  if (!nextConditionResolver) {
    setConditionTransitionProvider(undefined);
    return;
  }

  setConditionTransitionProvider(
    (currentCondition, nextConditionQueue, harmony) => {
      if (!Array.isArray(nextConditionQueue) || nextConditionQueue.length === 0) {
        integrationDiagnostics.conditionProviderFallbackCount++;
        return [];
      }

      const normalizedQueue = nextConditionQueue.map((entry) =>
        normalizeConditionKey(entry as unknown as string),
      );
      if (normalizedQueue.length === 0) {
        integrationDiagnostics.conditionProviderFallbackCount++;
        return [];
      }

      const nextCondition = normalizedQueue[0];
      const shiftedQueue = normalizedQueue.slice(1);

      try {
        const appended = normalizeConditionKey(
          nextConditionResolver({
            condition: normalizeConditionKey(currentCondition as string),
            nextConditions: shiftedQueue.slice(),
            harmony,
          }) as string | undefined,
        );
        integrationDiagnostics.usingModApiGetNextCondition = true;
        integrationDiagnostics.conditionProviderUsedCount++;
        return [
          {
            nextCondition,
            nextQueue: [...shiftedQueue, appended],
            probability: 1,
          },
        ];
      } catch (error) {
        integrationDiagnostics.conditionProviderFailureCount++;
        integrationDiagnostics.conditionProviderFallbackCount++;
        console.warn(
          '[CraftBuddy] ModAPI condition transition provider failed, using local fallback:',
          error,
        );
      }

      return [];
    },
  );
}

function normalizeNextConditionQueue(
  current: string | undefined,
  rawQueue: string[] | undefined,
  harmony: number,
): CraftingCondition[] {
  const targetLength = VISIBLE_CONDITION_QUEUE_LENGTH;
  const normalizedCurrent = normalizeConditionKey(current);
  const sourceQueue = Array.isArray(rawQueue) ? rawQueue : [];
  const normalizedRaw = sourceQueue
    .map((entry) => normalizeConditionKey(entry))
    .slice(0, targetLength);

  if (sourceQueue.length > targetLength) {
    integrationDiagnostics.conditionQueueTrimmedCount++;
  }

  if (normalizedRaw.length === targetLength) {
    return normalizedRaw;
  }

  integrationDiagnostics.conditionQueuePaddedCount++;
  const resolver = getModApiNextConditionResolver();
  if (resolver) {
    try {
      const queue = normalizedRaw.slice();
      while (queue.length < targetLength) {
        const generated = normalizeConditionKey(
          resolver({
            condition: normalizedCurrent,
            nextConditions: queue.slice(),
            harmony,
          }) as string | undefined,
        );
        queue.push(generated);
      }
      integrationDiagnostics.usingModApiGetNextCondition = true;
      return queue;
    } catch (error) {
      console.warn(
        '[CraftBuddy] ModAPI getNextCondition resolver failed, using local fallback:',
        error,
      );
    }
  }

  return normalizeForecastConditionQueue(
    normalizedCurrent,
    normalizedRaw,
    harmony,
    targetLength,
  ) as CraftingCondition[];
}

configureNativeOptimizerProviders();

/**
 * Re-initialize native providers if they weren't available on first attempt.
 * Called lazily when modAPI may have become available after initial module load.
 */
let nativeProvidersInitialized = false;
function ensureNativeProvidersInitialized(): void {
  if (nativeProvidersInitialized) return;
  const modUtils = (window as any)?.modAPI?.utils;
  if (!modUtils) return;
  configureNativeOptimizerProviders();
  nativeProvidersInitialized =
    integrationDiagnostics.usingModApiScalingEvaluator ||
    integrationDiagnostics.usingModApiOvercritHelper ||
    integrationDiagnostics.usingModApiCanUseActionPrecheck ||
    integrationDiagnostics.usingModApiGetNextCondition;
  if (nativeProvidersInitialized) {
    debugLog('[CraftBuddy] Native providers initialized on deferred attempt');
  }
}

function toFinitePositiveNumber(value: unknown): number | undefined {
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

function toFiniteNumber(value: unknown): number | undefined {
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

function sanitizeNativeCraftingVariables(
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

function resolveNativeCraftingVariables(
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

function resolveMaxToxicityCap(
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

function extractCapCandidate(source: any, keys: string[]): number | undefined {
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

function updateProgressCapsFromRecipeStats(recipeStats: any): void {
  if (!recipeStats) return;

  const completionCap =
    extractCapCandidate(recipeStats, [
      'maxCompletion',
      'maxcompletion',
      'completionMax',
      'completionCap',
      'completionLimit',
      'maxCompletionValue',
    ]) ??
    extractCapCandidate(recipeStats?.caps, ['completion', 'maxCompletion']) ??
    extractCapCandidate(recipeStats?.limits, ['completion', 'maxCompletion']) ??
    extractCapCandidate(recipeStats?.maxValues, [
      'completion',
      'maxCompletion',
    ]);

  const perfectionCap =
    extractCapCandidate(recipeStats, [
      'maxPerfection',
      'maxperfection',
      'perfectionMax',
      'perfectionCap',
      'perfectionLimit',
      'maxPerfectionValue',
    ]) ??
    extractCapCandidate(recipeStats?.caps, ['perfection', 'maxPerfection']) ??
    extractCapCandidate(recipeStats?.limits, ['perfection', 'maxPerfection']) ??
    extractCapCandidate(recipeStats?.maxValues, [
      'perfection',
      'maxPerfection',
    ]);

  if (completionCap !== undefined) {
    maxCompletionCap = completionCap;
  }
  if (perfectionCap !== undefined) {
    maxPerfectionCap = perfectionCap;
  }
}

function updateProgressCapsFromModApi(
  recipe: RecipeItem | undefined,
  recipeStats: CraftingRecipeStats | undefined,
  realm: string | undefined,
): void {
  if (!recipe || !recipeStats || !realm) {
    return;
  }

  const modUtils = (window as any)?.modAPI?.utils;
  if (
    typeof modUtils?.getMaxCompletion !== 'function' ||
    typeof modUtils?.getMaxPerfection !== 'function'
  ) {
    return;
  }

  try {
    const maxCompletion = modUtils.getMaxCompletion(recipe, recipeStats, realm);
    const completionCap =
      extractCapCandidate(maxCompletion, [
        'flat',
        'value',
        'max',
        'cap',
        'completion',
        'maxCompletion',
      ]) ?? toFinitePositiveNumber(maxCompletion);
    if (completionCap !== undefined) {
      maxCompletionCap = completionCap;
    }

    const maxPerfection = modUtils.getMaxPerfection(recipe, recipeStats, realm);
    const perfectionCap =
      extractCapCandidate(maxPerfection, [
        'flat',
        'value',
        'max',
        'cap',
        'perfection',
        'maxPerfection',
      ]) ?? toFinitePositiveNumber(maxPerfection);
    if (perfectionCap !== undefined) {
      maxPerfectionCap = perfectionCap;
    }

    if (completionCap !== undefined || perfectionCap !== undefined) {
      integrationDiagnostics.usingModApiCapGetters = true;
    }
  } catch (error) {
    console.warn(
      '[CraftBuddy] ModAPI cap getters failed, using local fallback:',
      error,
    );
  }
}

function extractCompletionBonusStacks(
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
  if (buffs) {
    for (const buff of buffs) {
      const stacks = Number((buff as any)?.stacks ?? 0);
      if (!Number.isFinite(stacks) || stacks <= 0) continue;

      const key = normalizeBuffKey(buff?.name);
      const isNamedCompletionBonus =
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

/**
 * Convert game CraftingTechnique array to our skill definitions.
 */
function convertGameTechniques(
  techniques: CraftingTechnique[] | undefined,
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
  const modApiUpgradeResolver = getModApiTechniqueUpgradeResolver();

  for (const tech of techniques) {
    if (!tech) continue;

    let sourceTech = tech;
    let usedModApiUpgradeResolver = false;
    if (modApiUpgradeResolver) {
      try {
        const upgradedTech = modApiUpgradeResolver(tech);
        if (upgradedTech && upgradedTech !== tech) {
          sourceTech = upgradedTech;
          usedModApiUpgradeResolver = true;
          integrationDiagnostics.usingModApiTechniqueUpgradeResolver = true;
        }
      } catch (error) {
        console.warn(
          '[CraftBuddy] ModAPI technique upgrade resolver failed, using raw technique:',
          error,
        );
      }
    }

    const qiCost = sourceTech.poolCost || 0;
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
      // If the game already returned an upgraded technique snapshot, avoid double-applying upgrades.
      if (usedModApiUpgradeResolver && kind === 'upgrade') {
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

    skills.push({
      name: techName,
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

interface InventoryItemLike {
  name: string;
  stacks: number;
}

function convertGameItemsToActions(
  entity: CraftingEntity,
  inventoryItems: InventoryItemLike[] | undefined,
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

/**
 * Build optimizer config from game entity stats.
 */
function buildConfigFromEntity(
  entity: CraftingEntity,
  extraSkills: SkillDefinition[] = [],
  trainingMode: boolean = false,
  recipe?: RecipeItem,
  recipeStats?: CraftingRecipeStats,
): OptimizerConfig {
  const stats = entity.stats;

  // Stats can come in as numbers or numeric strings; normalize to numbers.
  let baseControl = parseGameNumber((stats as any)?.control, 10);
  let baseIntensity = parseGameNumber((stats as any)?.intensity, 10);
  let maxQi = parseGameNumber((stats as any)?.maxpool, 100);

  // @ts-ignore
  const entityMaxToxicity = stats?.maxtoxicity || 0;

  // @ts-ignore - realmModifier/craftingModifier may exist on game entity
  const realmModifier =
    (entity as any)?.realmModifier || (entity as any)?.craftingModifier || 1.0;
  if (realmModifier !== 1.0) {
    baseControl = Math.floor(baseControl * realmModifier);
    baseIntensity = Math.floor(baseIntensity * realmModifier);
  }

  if (recipe && recipeStats) {
    updateProgressCapsFromModApi(recipe, recipeStats, entity.realm as string);
  }

  const skills = [...convertGameTechniques(entity.techniques), ...extraSkills];
  const pillsPerRound = Math.max(
    1,
    parseGameNumber((stats as any)?.pillsPerRound, 1),
  );

  let defaultBuffMultiplier = 1.4;
  for (const skill of skills) {
    if (skill.buffMultiplier && skill.buffMultiplier !== 1.0) {
      defaultBuffMultiplier = skill.buffMultiplier;
      break;
    }
  }

  // Parse real condition effects from cached recipe data.
  // This passes the actual game multipliers directly to the optimizer,
  // avoiding the fragile reverse-engineering of condition type names.
  let conditionEffectsData: Record<string, any[]> | undefined;
  if (conditionEffectsCache?.conditionEffects) {
    conditionEffectsData = parseRecipeConditionEffects(
      conditionEffectsCache.conditionEffects,
    );
  }

  debugLog(
    `[CraftBuddy] Config: control=${baseControl}, intensity=${baseIntensity}, maxQi=${maxQi}, sublime=${isSublimeCraft}, multiplier=${sublimeTargetMultiplier}, conditionData=${conditionEffectsData ? 'real' : 'none'}, compCap=${maxCompletionCap ?? 'n/a'}, perfCap=${maxPerfectionCap ?? 'n/a'}`,
  );

  return {
    maxQi,
    maxStability: targetStability,
    maxCompletion: maxCompletionCap,
    maxPerfection: maxPerfectionCap,
    baseIntensity,
    baseControl,
    minStability: 0,
    skills,
    defaultBuffMultiplier,
    maxToxicity: maxToxicity || entityMaxToxicity,
    craftingType: currentCraftingType,
    isSublimeCraft,
    targetMultiplier: sublimeTargetMultiplier,
    conditionEffectsData: conditionEffectsData as any,
    targetCompletion,
    targetPerfection,
    trainingMode,
    pillsPerRound,
  };
}

/**
 * Update recommendation based on current crafting state.
 */
function updateRecommendation(
  entity: CraftingEntity,
  progressState: ProgressState,
  inventoryItems?: InventoryItemLike[],
  consumedPillsThisTurn: number = 0,
  trainingMode: boolean = false,
  recipeStats?: CraftingRecipeStats,
  recipe?: RecipeItem,
): void {
  // Ensure native providers are wired now that modAPI may be available
  ensureNativeProvidersInitialized();

  // Store for rendering
  lastEntity = entity;
  lastProgressState = progressState;
  if (recipe) {
    lastRecipe = recipe;
  }
  if (recipeStats) {
    lastRecipeStats = recipeStats;
  }

  const pool = parseGameNumber(entity?.stats?.pool, 0);
  const stability = parseGameNumber(progressState?.stability, 0);
  const completion = parseGameNumber(progressState?.completion, 0);
  const perfection = parseGameNumber(progressState?.perfection, 0);
  const condition = progressState?.condition;
  const buffs = entity?.buffs;

  // Check for very large numbers that might cause precision issues
  checkPrecision(completion, 'completion');
  checkPrecision(perfection, 'perfection');
  checkPrecision(targetCompletion, 'targetCompletion');
  checkPrecision(targetPerfection, 'targetPerfection');

  const rawNextConditions = Array.isArray(progressState?.nextConditions)
    ? progressState.nextConditions
    : [];
  const normalizedNextConditions = normalizeNextConditionQueue(
    condition as unknown as string | undefined,
    rawNextConditions as unknown as string[],
    Number(progressState?.harmony ?? 0) || 0,
  );
  if (
    rawNextConditions.length !== normalizedNextConditions.length ||
    rawNextConditions.some(
      (entry, index) =>
        normalizeConditionKey(entry as unknown as string) !==
        normalizedNextConditions[index],
    )
  ) {
    integrationDiagnostics.conditionQueueNormalizedCount++;
  }
  nextConditions = normalizedNextConditions;
  currentCondition = condition;

  currentCompletion = completion;
  currentPerfection = perfection;
  currentStability = stability;

  // @ts-ignore
  const gameToxicity = progressState?.toxicity ?? entity?.stats?.toxicity ?? 0;
  currentToxicity = gameToxicity;

  const {
    controlBuffTurns,
    intensityBuffTurns,
    controlBuffMultiplier,
    intensityBuffMultiplier,
  } = extractBuffInfo(buffs);

  // Late-game stats (crits + success chance)
  // Game stores critchance/critmultiplier as percentages (e.g., 50 = 50%, 150 = 1.5x).
  // The optimizer's calculateExpectedCritMultiplier expects these raw percentage values.
  // Do NOT normalize to [0,1] -- that would destroy the overcrit formula.
  const critChance = Math.max(
    0,
    Number((entity as any)?.stats?.critchance ?? 0) || 0,
  );
  const critMultiplier = Math.max(
    0,
    Number((entity as any)?.stats?.critmultiplier ?? 0) || 0,
  );

  // Success chance bonus is a 0-1 fraction in game data.
  const successChanceBonus = Math.max(
    0,
    Math.min(1, Number((entity as any)?.stats?.successChanceBonus ?? 0) || 0),
  );

  const extractedBuffs = new Map<
    string,
    { name: string; stacks: number; definition?: any }
  >();
  if (buffs) {
    for (const buff of buffs) {
      const key = normalizeBuffKey(buff?.name);
      if (!key) continue;
      const stacks = buff?.stacks ?? 0;
      if (stacks > 0) {
        extractedBuffs.set(key, {
          name: key,
          stacks,
          definition: {
            ...(buff as any),
            effects: (buff as any)?.effects ?? [],
          },
        });
      }
    }
  }

  // Read pool/stability cost percentage modifiers from entity stats + buffs
  // Game default is 100 (= 100%, i.e. no modification)
  const poolCostPercentageRaw = Number(
    (entity as any)?.stats?.poolCostPercentage ?? 100,
  );
  const poolCostPercentage = Number.isFinite(poolCostPercentageRaw)
    ? poolCostPercentageRaw
    : 100;
  const stabilityCostPercentageRaw = Number(
    (entity as any)?.stats?.stabilityCostPercentage ?? 100,
  );
  const stabilityCostPercentage = Number.isFinite(stabilityCostPercentageRaw)
    ? stabilityCostPercentageRaw
    : 100;

  // Extract completion bonus stacks from the Completion Bonus buff
  const completionBonusExtraction = extractCompletionBonusStacks(
    buffs,
    completion,
    targetCompletion,
  );
  const completionBonusStacks = completionBonusExtraction.stacks;
  integrationDiagnostics.completionBonusSource =
    completionBonusExtraction.source;
  if (completionBonusExtraction.mismatch) {
    integrationDiagnostics.completionBonusMismatchCount++;
  }

  const techniques = entity?.techniques || [];
  currentCooldowns = new Map();
  for (const tech of techniques) {
    if (tech && tech.currentCooldown && tech.currentCooldown > 0) {
      const key = tech.name.toLowerCase().replace(/\s+/g, '_');
      currentCooldowns.set(key, tech.currentCooldown);
    }
  }

  const { itemActions, itemCounts } = convertGameItemsToActions(
    entity,
    inventoryItems,
  );
  currentConfig = buildConfigFromEntity(
    entity,
    itemActions,
    trainingMode,
    recipe || lastRecipe,
    recipeStats || lastRecipeStats,
  );

  // Calculate current max stability from targetStability - stabilityPenalty
  // The game tracks stability decay via stabilityPenalty in progressState, not a separate maxStability field
  // @ts-ignore - stabilityPenalty exists in game's ProgressState but not in our types
  const stabilityPenalty = progressState?.stabilityPenalty || 0;
  if (targetStability > 0) {
    currentMaxStability = targetStability - stabilityPenalty;
  } else if (currentMaxStability <= 0) {
    currentMaxStability = 60; // Fallback default
  }

  // Extract harmony data from game's progressState for sublime crafts
  // @ts-ignore - harmonyTypeData exists on game's ProgressState
  const gameHarmonyData = progressState?.harmonyTypeData;
  // @ts-ignore - harmony exists on game's ProgressState
  const gameHarmony = progressState?.harmony ?? 0;
  const nativeVariables = resolveNativeCraftingVariables(
    entity,
    progressState,
    recipeStats || lastRecipeStats,
  );

  const state = new CraftingState({
    qi: pool,
    stability,
    initialMaxStability: targetStability > 0 ? targetStability : 60,
    stabilityPenalty,
    completion,
    perfection,
    critChance,
    critMultiplier,
    successChanceBonus,
    poolCostPercentage,
    stabilityCostPercentage,
    controlBuffTurns,
    intensityBuffTurns,
    controlBuffMultiplier,
    intensityBuffMultiplier,
    toxicity: currentToxicity,
    maxToxicity: currentConfig?.maxToxicity || maxToxicity,
    cooldowns: currentCooldowns,
    items: itemCounts,
    consumedPillsThisTurn,
    buffs: extractedBuffs,
    harmony: gameHarmony,
    harmonyData:
      gameHarmonyData ??
      (isSublimeCraft ? { recommendedTechniqueTypes: [] } : undefined),
    completionBonus: completionBonusStacks,
    nativeVariables,
    step: progressState?.step || 0,
    history: [],
  });

  const currentConditionType = condition as unknown as string | undefined;
  const forecastedConditionTypes = nextConditions as unknown as string[];

  const lookaheadDepth = currentSettings.lookaheadDepth;
  const searchConfig = getSearchConfig();

  // Capture config locally for the async callback
  const config = currentConfig;
  if (!config) {
    console.warn('[CraftBuddy] No config available for search');
    return;
  }

  // Set calculating state and render immediately to show loading indicator
  isCalculating = true;
  renderOverlay();

  // Use setTimeout to allow UI to update before blocking on search
  // This ensures the loading indicator is visible during calculation
  setTimeout(() => {
    currentRecommendation = findBestSkill(
      state,
      config,
      targetCompletion,
      targetPerfection,
      false,
      lookaheadDepth,
      currentConditionType,
      forecastedConditionTypes,
      searchConfig,
    );

    // Clear calculating flag and snapshot settings after search completes
    isCalculating = false;
    snapshotSearchSettings();
    checkIntegrationHealth();

    debugLog(
      `[CraftBuddy] Updated: Pool=${pool}, Stability=${stability}/${currentMaxStability}, Completion=${completion}/${targetCompletion}, Perfection=${perfection}/${targetPerfection}`,
    );
    if (currentRecommendation?.recommendation) {
      debugLog(
        `[CraftBuddy] Recommended: ${currentRecommendation.recommendation.skill.name}`,
      );
      debugLog(
        `[CraftBuddy] Alternatives count: ${currentRecommendation.alternativeSkills?.length ?? 0}`,
      );
      if (currentRecommendation.alternativeSkills?.length > 0) {
        debugLog(
          `[CraftBuddy] Alternatives: ${currentRecommendation.alternativeSkills.map((a) => a.skill.name).join(', ')}`,
        );
      }
    }

    // Update the overlay with results
    renderOverlay();
  }, 0);
}

/**
 * Create the overlay container for our panel.
 */
function createOverlayContainer(): void {
  if (overlayContainer) return;

  overlayContainer = document.createElement('div');
  overlayContainer.id = 'craftbuddy-overlay';
  Object.assign(overlayContainer.style, {
    position: 'fixed',
    top: '10px',
    right: '10px',
    zIndex: '10000',
    pointerEvents: 'auto',
  });

  document.body.appendChild(overlayContainer);
  reactRoot = ReactDOM.createRoot(overlayContainer);
  debugLog('[CraftBuddy] Overlay container created');
}

/**
 * Render the recommendation panel in the overlay.
 */
function renderOverlay(): void {
  if (!overlayContainer || !reactRoot) {
    createOverlayContainer();
  }

  // Check if we should show the panel:
  // - If panelVisible setting is true, always show
  // - If crafting is active (we have entity and progress data), show regardless of setting
  const isCraftingActive = lastEntity !== null && lastProgressState !== null;
  const shouldShow = currentSettings.panelVisible || isCraftingActive;

  if (!reactRoot || !shouldShow) {
    if (reactRoot && overlayContainer) {
      overlayContainer.style.display = 'none';
    }
    return;
  }

  overlayContainer!.style.display = 'block';

  const handleSettingsChange = (newSettings: CraftBuddySettings) => {
    currentSettings = newSettings;
    renderOverlay();
  };

  const handleSearchSettingsChange = (newSettings: CraftBuddySettings) => {
    // Update settings and re-render to reflect stale state
    currentSettings = newSettings;
    renderOverlay();
  };

  const handleRecalculate = () => {
    // Trigger recalculation with current entity/progress state
    if (lastEntity && lastProgressState) {
      const inventoryItems = cachedStore?.getState?.()?.inventory?.items as
        | InventoryItemLike[]
        | undefined;
      updateRecommendation(lastEntity, lastProgressState, inventoryItems);
    }
  };

  const effectiveTargetCompletion = (() => {
    if (!isSublimeCraft) return targetCompletion;
    const scaled = targetCompletion * sublimeTargetMultiplier;
    if (maxCompletionCap !== undefined && Number.isFinite(maxCompletionCap)) {
      return Math.min(scaled, maxCompletionCap);
    }
    return scaled;
  })();
  const effectiveTargetPerfection = (() => {
    if (!isSublimeCraft) return targetPerfection;
    const scaled = targetPerfection * sublimeTargetMultiplier;
    if (maxPerfectionCap !== undefined && Number.isFinite(maxPerfectionCap)) {
      return Math.min(scaled, maxPerfectionCap);
    }
    return scaled;
  })();

  const panel = React.createElement(RecommendationPanel, {
    result: currentRecommendation,
    currentCompletion,
    currentPerfection,
    targetCompletion: effectiveTargetCompletion,
    targetPerfection: effectiveTargetPerfection,
    maxCompletionCap,
    maxPerfectionCap,
    currentStability,
    currentMaxStability,
    settings: currentSettings,
    onSettingsChange: handleSettingsChange,
    onSearchSettingsChange: handleSearchSettingsChange,
    targetStability,
    currentCondition: currentCondition as any,
    nextConditions,
    currentToxicity,
    maxToxicity,
    craftingType: currentCraftingType,
    isCalculating,
    settingsStale: areSearchSettingsStale(),
    onRecalculate: handleRecalculate,
  });

  // Wrap panel with ThemeProvider for styled components
  const themedPanel = React.createElement(CraftBuddyThemeProvider, null, panel);

  reactRoot.render(themedPanel);
}

/**
 * Hide the overlay.
 */
function hideOverlay(): void {
  if (overlayContainer) {
    overlayContainer.style.display = 'none';
  }
  isOverlayVisible = false;
}

/**
 * Show the overlay.
 */
function showOverlay(): void {
  if (overlayContainer) {
    overlayContainer.style.display = 'block';
  }
  isOverlayVisible = true;
  renderOverlay();
}

/**
 * Clear state that should only exist during an active crafting session.
 */
function clearActiveCraftingRuntimeState(): void {
  lastEntity = null;
  lastProgressState = null;
  currentRecommendation = null;
  currentCondition = undefined;
  nextConditions = [];
  isCalculating = false;
  currentStep = 0;
}

/**
 * Handle a transition from crafting -> non-crafting.
 */
function handleCraftingEnded(): void {
  const shouldAutoHideOverlay =
    overlayForcedByActiveCraft || !currentSettings.panelVisible;
  overlayForcedByActiveCraft = false;

  clearActiveCraftingRuntimeState();
  clearCachedTargets();
  maxCompletionCap = undefined;
  maxPerfectionCap = undefined;
  lastRecipe = undefined;
  lastRecipeStats = undefined;
  isSublimeCraft = false;
  sublimeTargetMultiplier = 1.0;

  if (isOverlayVisible && shouldAutoHideOverlay) {
    hideOverlay();
  } else if (isOverlayVisible) {
    renderOverlay();
  }
}

/**
 * Try to find the Redux store from the window object or React fiber tree.
 * The game uses React 19 with a different fiber structure.
 */
function findReduxStore(): any {
  const win = window as any;

  // Check common locations for Redux store
  if (win.store) return win.store;
  if (win.__REDUX_STORE__) return win.__REDUX_STORE__;
  if (win.reduxStore) return win.reduxStore;
  if (win.__store__) return win.__store__;

  // Check if modAPI exposes any state access
  if (win.modAPI?.gameState) return { getState: () => win.modAPI.gameState };

  // Try to find store from React fiber tree
  try {
    const rootElement =
      document.getElementById('root') || document.getElementById('app');
    if (rootElement) {
      // Find React fiber key (React 18/19 format)
      const reactKey = Object.keys(rootElement).find(
        (key) =>
          key.startsWith('__reactContainer$') ||
          key.startsWith('__reactFiber$') ||
          key.startsWith('_reactRootContainer'),
      );

      if (reactKey) {
        let fiber = (rootElement as any)[reactKey];

        // Traverse fiber tree looking for Redux Provider
        const visited = new Set();
        const queue = [fiber];

        while (queue.length > 0 && visited.size < 1000) {
          const current = queue.shift();
          if (!current || visited.has(current)) continue;
          visited.add(current);

          // Check for store in various locations
          if (current.memoizedState?.store) {
            return current.memoizedState.store;
          }
          if (current.stateNode?.store) {
            return current.stateNode.store;
          }
          // Check pendingProps for Provider
          if (current.pendingProps?.store) {
            return current.pendingProps.store;
          }
          if (current.memoizedProps?.store) {
            return current.memoizedProps.store;
          }
          // Check for context with store
          if (current.memoizedState?.memoizedState?.store) {
            return current.memoizedState.memoizedState.store;
          }

          // Add children and siblings to queue
          if (current.child) queue.push(current.child);
          if (current.sibling) queue.push(current.sibling);
          if (current.return) queue.push(current.return);
        }
      }
    }
  } catch (e) {
    console.warn('[CraftBuddy] Fiber traversal failed:', e);
  }

  return null;
}

// Cache the Redux store once found
let cachedStore: any = null;

/**
 * Try to extract crafting state from Redux store or DOM.
 */
function detectCraftingState(): {
  isActive: boolean;
  entity?: CraftingEntity;
  progress?: ProgressState;
  recipe?: RecipeItem;
  recipeStats?: any;
  inventoryItems?: InventoryItemLike[];
  consumedPillsThisTurn?: number;
  trainingMode?: boolean;
} {
  // Method 1: Try to access Redux store - this is the best source
  if (!cachedStore) {
    cachedStore = findReduxStore();
  }

  if (cachedStore) {
    try {
      const state = cachedStore.getState();
      const craftingState = state?.crafting;

      // Check if we have an active crafting session with player and progressState
      if (craftingState?.player && craftingState?.progressState) {
        return {
          isActive: true,
          entity: craftingState.player as CraftingEntity,
          progress: craftingState.progressState as ProgressState,
          recipe: craftingState.recipe as RecipeItem | undefined,
          recipeStats: craftingState.recipeStats,
          inventoryItems: state?.inventory?.items as
            | InventoryItemLike[]
            | undefined,
          consumedPillsThisTurn: Number(craftingState?.consumedPills ?? 0) || 0,
          trainingMode: !!craftingState?.trainingMode,
        };
      }

      // Also check nested paths
      const gameCrafting = state?.game?.crafting;
      if (gameCrafting?.player && gameCrafting?.progressState) {
        return {
          isActive: true,
          entity: gameCrafting.player as CraftingEntity,
          progress: gameCrafting.progressState as ProgressState,
          recipe: gameCrafting.recipe as RecipeItem | undefined,
          recipeStats: gameCrafting.recipeStats,
          inventoryItems: state?.inventory?.items as
            | InventoryItemLike[]
            | undefined,
          consumedPillsThisTurn: Number(gameCrafting?.consumedPills ?? 0) || 0,
          trainingMode: !!gameCrafting?.trainingMode,
        };
      }
    } catch (e) {
      // Store access failed
    }
  }

  // Method 2: Check for crafting UI elements in the DOM
  const craftingPanel =
    document.querySelector('[class*="crafting"]') ||
    document.querySelector('[class*="Crafting"]') ||
    document.querySelector('[data-testid*="crafting"]');

  // Method 3: Look for specific crafting-related text/elements
  const stabilityElement =
    document.querySelector('[class*="stability"]') ||
    Array.from(document.querySelectorAll('*')).find(
      (el) => el.textContent?.includes('Stability:') && el.children.length < 5,
    );

  const completionElement =
    document.querySelector('[class*="completion"]') ||
    Array.from(document.querySelectorAll('*')).find(
      (el) => el.textContent?.includes('Completion:') && el.children.length < 5,
    );

  // Method 4: Check for technique buttons (crafting skills)
  const techniqueButtons = document.querySelectorAll('button');
  let hasCraftingButtons = false;
  techniqueButtons.forEach((btn) => {
    const text = btn.textContent?.toLowerCase() || '';
    if (
      text.includes('fusion') ||
      text.includes('refine') ||
      text.includes('stabilize')
    ) {
      hasCraftingButtons = true;
    }
  });

  const isActive = !!(
    craftingPanel ||
    stabilityElement ||
    completionElement ||
    hasCraftingButtons
  );

  return { isActive };
}

/**
 * Parse crafting values from the DOM.
 * Returns both current values and target values extracted from "X/Y" patterns.
 */
function parseCraftingValuesFromDOM(): {
  completion: number;
  perfection: number;
  stability: number;
  pool: number;
  targetCompletion?: number;
  targetPerfection?: number;
  targetStability?: number;
  maxPool?: number;
} | null {
  try {
    // Look for progress bars or text showing crafting values
    const allText = document.body.innerText;

    // Try to find patterns like "Completion: 45/100" or "45 / 100"
    const completionMatch = allText.match(
      /Completion[:\s]+(\d+)\s*[\/]\s*(\d+)/i,
    );
    const perfectionMatch = allText.match(
      /Perfection[:\s]+(\d+)\s*[\/]\s*(\d+)/i,
    );
    const stabilityMatch = allText.match(
      /Stability[:\s]+(\d+)\s*[\/]\s*(\d+)/i,
    );
    const poolMatch = allText.match(/(?:Qi|Pool)[:\s]+(\d+)\s*[\/]\s*(\d+)/i);

    if (completionMatch || perfectionMatch || stabilityMatch) {
      return {
        completion: completionMatch ? parseInt(completionMatch[1]) : 0,
        perfection: perfectionMatch ? parseInt(perfectionMatch[1]) : 0,
        stability: stabilityMatch ? parseInt(stabilityMatch[1]) : 0,
        pool: poolMatch ? parseInt(poolMatch[1]) : 0,
        // Also extract target values (the second number in X/Y patterns)
        targetCompletion: completionMatch
          ? parseInt(completionMatch[2])
          : undefined,
        targetPerfection: perfectionMatch
          ? parseInt(perfectionMatch[2])
          : undefined,
        targetStability: stabilityMatch
          ? parseInt(stabilityMatch[2])
          : undefined,
        maxPool: poolMatch ? parseInt(poolMatch[2]) : undefined,
      };
    }
  } catch (e) {
    console.warn('[CraftBuddy] Failed to parse DOM values:', e);
  }

  return null;
}

/**
 * Poll for crafting state changes.
 */
function pollCraftingState(): void {
  const {
    isActive,
    entity,
    progress,
    recipe,
    recipeStats,
    inventoryItems,
    consumedPillsThisTurn,
    trainingMode,
  } = detectCraftingState();

  if (isActive) {
    wasCraftingActive = true;
    if (!isOverlayVisible) {
      debugLog('[CraftBuddy] Crafting detected, showing overlay');
      overlayForcedByActiveCraft = true;
      showOverlay();
    }
  } else if (wasCraftingActive) {
    wasCraftingActive = false;
    debugLog('[CraftBuddy] Crafting ended, clearing active state');
    handleCraftingEnded();
  }

  // If we have entity and progress from Redux, use them directly
  if (isActive && entity && progress) {
    // CRITICAL: Update target values from recipeStats BEFORE updating recommendation
    // recipeStats contains the authoritative target values (completion, perfection, stability)
    if (recipeStats) {
      if (recipeStats.completion !== undefined && recipeStats.completion > 0) {
        targetCompletion = recipeStats.completion;
      }
      if (recipeStats.perfection !== undefined && recipeStats.perfection > 0) {
        targetPerfection = recipeStats.perfection;
      }
      if (recipeStats.stability !== undefined && recipeStats.stability > 0) {
        targetStability = recipeStats.stability;
      }
      updateProgressCapsFromRecipeStats(recipeStats as any);
      updateProgressCapsFromModApi(
        recipe,
        recipeStats as CraftingRecipeStats,
        entity.realm as string,
      );
      // Calculate current max stability from recipeStats.stability - progressState.stabilityPenalty
      const stabilityPenalty = (progress as any).stabilityPenalty || 0;
      currentMaxStability = recipeStats.stability - stabilityPenalty;
    }

    // Check if state changed
    const newCompletion = progress.completion || 0;
    const newPerfection = progress.perfection || 0;
    const newStability = progress.stability || 0;
    const newStep = progress.step || 0;

    if (
      newCompletion !== currentCompletion ||
      newPerfection !== currentPerfection ||
      newStability !== currentStability ||
      newStep !== currentStep ||
      !lastEntity
    ) {
      currentStep = newStep;
      debugLog(
        `[CraftBuddy] Redux state: Completion=${newCompletion}/${targetCompletion}, Perfection=${newPerfection}/${targetPerfection}, Stability=${newStability}/${currentMaxStability}, Step=${newStep}`,
      );
      updateRecommendation(
        entity,
        progress,
        inventoryItems,
        consumedPillsThisTurn || 0,
        !!trainingMode,
        recipeStats as CraftingRecipeStats | undefined,
        recipe,
      );
    }
    return;
  }

  // Fallback: If crafting is active but no Redux data, try to update values from DOM
  if (isActive) {
    const domValues = parseCraftingValuesFromDOM();
    if (domValues) {
      // ALWAYS update target values from DOM - these are the live values from the game UI
      // The second number in "Stability: X/Y" is the CURRENT max stability (which decreases as skills are used)
      let targetsChanged = false;

      if (
        domValues.targetCompletion &&
        domValues.targetCompletion > 0 &&
        domValues.targetCompletion !== targetCompletion
      ) {
        targetCompletion = domValues.targetCompletion;
        debugLog(
          `[CraftBuddy] Updated targetCompletion from DOM: ${targetCompletion}`,
        );
        targetsChanged = true;
      }
      if (
        domValues.targetPerfection &&
        domValues.targetPerfection > 0 &&
        domValues.targetPerfection !== targetPerfection
      ) {
        targetPerfection = domValues.targetPerfection;
        debugLog(
          `[CraftBuddy] Updated targetPerfection from DOM: ${targetPerfection}`,
        );
        targetsChanged = true;
      }
      // For stability, the DOM shows "current/currentMax" - the second number is the CURRENT max stability
      // which decreases each turn (unless skill has noMaxStabilityLoss)
      if (
        domValues.targetStability &&
        domValues.targetStability > 0 &&
        domValues.targetStability !== currentMaxStability
      ) {
        currentMaxStability = domValues.targetStability;
        debugLog(
          `[CraftBuddy] Updated currentMaxStability from DOM: ${currentMaxStability}`,
        );
        targetsChanged = true;
      }

      // Cache targets if they changed (for mid-craft save recovery)
      if (targetsChanged) {
        cacheTargets('from-dom-polling');
      }

      // Update current values and re-render if values changed
      if (
        domValues.completion !== currentCompletion ||
        domValues.perfection !== currentPerfection ||
        domValues.stability !== currentStability ||
        targetsChanged
      ) {
        debugLog('[CraftBuddy] DOM values changed:', domValues);
        currentCompletion = domValues.completion;
        currentPerfection = domValues.perfection;
        currentStability = domValues.stability;
        renderOverlay();
      }
    }
  }
}

/**
 * Start polling for crafting state.
 */
function startPolling(): void {
  if (pollingInterval) return;

  pollingInterval = window.setInterval(pollCraftingState, POLL_INTERVAL_MS);
  debugLog('[CraftBuddy] Started polling for crafting state');
}

/**
 * Stop polling.
 */
function stopPolling(): void {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
}

/**
 * Register lifecycle hooks for crafting events.
 */
try {
  window.modAPI.hooks.onDeriveRecipeDifficulty(
    (recipe, recipeStats, gameFlags) => {
      debugLog(
        '[CraftBuddy] onDeriveRecipeDifficulty called for:',
        recipe?.name,
      );
      debugLog(
        '[CraftBuddy] Full recipeStats:',
        JSON.stringify(recipeStats, null, 2),
      );

      // Reset optional progress caps for the new craft. They will be repopulated
      // when exposed by recipeStats (or remain undefined if unavailable).
      maxCompletionCap = undefined;
      maxPerfectionCap = undefined;

      if (recipeStats) {
        // Try multiple possible property names for targets
        const statsAny = recipeStats as any;
        lastRecipe = recipe as RecipeItem | undefined;
        lastRecipeStats = recipeStats as CraftingRecipeStats;
        targetCompletion =
          statsAny.completionTarget ??
          statsAny.targetCompletion ??
          statsAny.completion ??
          100;
        targetPerfection =
          statsAny.perfectionTarget ??
          statsAny.targetPerfection ??
          statsAny.perfection ??
          100;
        targetStability =
          statsAny.stabilityTarget ??
          statsAny.targetStability ??
          statsAny.stability ??
          60;
        updateProgressCapsFromRecipeStats(statsAny);
        updateProgressCapsFromModApi(
          recipe as RecipeItem | undefined,
          recipeStats as CraftingRecipeStats,
          (lastEntity?.realm as string | undefined) ||
            ((recipe as any)?.realm as string | undefined),
        );

        const conditionType = recipeStats.conditionType;
        if (conditionType) {
          conditionEffectsCache = conditionType;
        }

        debugLog(
          `[CraftBuddy] Targets: completion=${targetCompletion}, perfection=${targetPerfection}, stability=${targetStability}, caps=${maxCompletionCap ?? 'n/a'}/${maxPerfectionCap ?? 'n/a'}`,
        );

        // Cache targets for mid-craft save recovery
        cacheTargets(recipe?.name);
      }

      // @ts-ignore
      const recipeHarmonyType = recipe?.harmonyType || recipe?.type;
      if (
        recipeHarmonyType &&
        ['forge', 'alchemical', 'inscription', 'resonance'].includes(
          recipeHarmonyType,
        )
      ) {
        currentCraftingType = recipeHarmonyType as typeof currentCraftingType;
      }

      // Detect sublime/harmony crafting mode
      // Sublime crafting allows exceeding normal target limits
      // Check various indicators that this might be sublime crafting:
      // 1. Recipe explicitly marked as sublime
      // 2. Harmony type crafting (usually sublime)
      // 3. Equipment crafting (can have higher multipliers)
      const recipeAny = recipe as any;
      const recipeStatsAny = recipeStats as any;

      // Check for sublime indicators
      const isSublimeRecipe =
        recipeAny?.isSublime ||
        recipeAny?.sublime ||
        recipeStatsAny?.isSublime ||
        recipeStatsAny?.sublime ||
        recipeAny?.craftingMode === 'sublime' ||
        recipeAny?.craftingMode === 'harmony';

      // Check if this is equipment crafting (higher multiplier potential)
      const isEquipmentCraft =
        recipeAny?.isEquipment ||
        recipeAny?.category === 'equipment' ||
        recipeAny?.type === 'equipment' ||
        recipeAny?.resultType === 'equipment';

      // Harmony type is usually used for sublime craft
      const isHarmonyType =
        recipeHarmonyType === 'resonance' ||
        recipeAny?.usesHarmony ||
        recipeStatsAny?.harmonyBased;

      // Set sublime crafting mode
      isSublimeCraft = isSublimeRecipe || isHarmonyType;

      // Set target multiplier based on craft type
      if (isEquipmentCraft) {
        sublimeTargetMultiplier = 3.0; // Equipment can go even higher
      } else if (isSublimeCraft) {
        sublimeTargetMultiplier = 2.0; // Standard sublime is 2x
      } else {
        sublimeTargetMultiplier = 1.0; // Normal crafting
      }

      debugLog(
        `[CraftBuddy] Sublime craft detection: isSublime=${isSublimeCraft}, isEquipment=${isEquipmentCraft}, isHarmony=${isHarmonyType}, multiplier=${sublimeTargetMultiplier}`,
      );

      const explicitMaxToxicity = toFinitePositiveNumber(
        recipeStatsAny?.maxToxicity,
      );
      if (explicitMaxToxicity !== undefined) {
        maxToxicity = explicitMaxToxicity;
      } else if (currentCraftingType === 'alchemical') {
        const realmForToxicity =
          (lastEntity?.realm as string | undefined) ||
          ((recipe as any)?.realm as string | undefined);
        maxToxicity = resolveMaxToxicityCap(realmForToxicity, 100);
      } else {
        maxToxicity = 0;
      }

      // Reset state
      currentRecommendation = null;
      currentCompletion = 0;
      currentPerfection = 0;
      currentStability = 0;
      currentMaxStability = targetStability;
      currentToxicity = 0;
      currentCooldowns = new Map();
      currentConfig = null;
      nextConditions = [];

      // Show panel when crafting starts without mutating persisted user visibility settings.
      const wasVisibleBeforeCraft = isOverlayVisible;
      overlayForcedByActiveCraft = !wasVisibleBeforeCraft;
      wasCraftingActive = true;
      isOverlayVisible = false; // Reset so showOverlay will work
      debugLog('[CraftBuddy] Crafting starting, showing panel');
      showOverlay();

      return recipeStats;
    },
  );

  debugLog('[CraftBuddy] Lifecycle hooks registered');
} catch (e) {
  console.error('[CraftBuddy] Failed to register lifecycle hooks:', e);
}

/**
 * Export debug functions to the window.
 */
(window as any).craftBuddyDebug = {
  getConfig: () => currentConfig,
  getRecommendation: () => currentRecommendation,
  getTargets: () => ({ targetCompletion, targetPerfection, targetStability }),
  getCaps: () => ({ maxCompletionCap, maxPerfectionCap }),
  getCurrentState: () => ({
    currentCompletion,
    currentPerfection,
    currentStability,
    currentMaxStability,
    currentToxicity,
    maxToxicity,
    craftingType: currentCraftingType,
    isSublimeCraft,
    sublimeTargetMultiplier,
    maxCompletionCap,
    maxPerfectionCap,
  }),
  getCooldowns: () => Object.fromEntries(currentCooldowns),
  getNextConditions: () => nextConditions,
  getConditionEffects: () => conditionEffectsCache,
  getSettings: () => currentSettings,
  getDiagnostics: () => ({ ...integrationDiagnostics }),
  getDiagnosticsSummary: () => {
    const d = integrationDiagnostics;
    const nativeActive: string[] = [];
    const fallbackActive: string[] = [];
    if (d.usingModApiScalingEvaluator) nativeActive.push('scaling');
    else fallbackActive.push('scaling');
    if (d.usingModApiOvercritHelper) nativeActive.push('overcrit');
    else fallbackActive.push('overcrit');
    if (d.usingModApiCanUseActionPrecheck) nativeActive.push('canUseAction');
    else fallbackActive.push('canUseAction');
    if (d.usingModApiGetNextCondition) nativeActive.push('conditionTransition');
    else fallbackActive.push('conditionTransition');
    if (d.usingModApiCapGetters) nativeActive.push('capGetters');
    else fallbackActive.push('capGetters');
    if (d.usingModApiCraftingVariableResolver) nativeActive.push('variableResolver');
    else fallbackActive.push('variableResolver');
    if (d.usingModApiMaxToxicityGetter) nativeActive.push('maxToxicity');
    const canUseActionErrorRate = d.nativeCanUseActionCalls > 0
      ? d.nativeCanUseActionErrors / d.nativeCanUseActionCalls
      : 0;
    return {
      nativeProviders: nativeActive,
      fallbackProviders: fallbackActive,
      canUseActionStats: {
        calls: d.nativeCanUseActionCalls,
        blocked: d.nativeCanUseActionBlocked,
        errors: d.nativeCanUseActionErrors,
        errorRate: canUseActionErrorRate,
      },
      conditionProvider: {
        used: d.conditionProviderUsedCount,
        failures: d.conditionProviderFailureCount,
        fallbacks: d.conditionProviderFallbackCount,
      },
      completionBonus: {
        source: d.completionBonusSource,
        mismatches: d.completionBonusMismatchCount,
      },
      conditionQueue: {
        normalized: d.conditionQueueNormalizedCount,
        trimmed: d.conditionQueueTrimmedCount,
        padded: d.conditionQueuePaddedCount,
      },
    };
  },
  getLastEntity: () => lastEntity,
  getLastProgressState: () => lastProgressState,
  getLastRecipe: () => lastRecipe,
  getLastRecipeStats: () => lastRecipeStats,

  setTargets: (completion: number, perfection: number, stability?: number) => {
    targetCompletion = completion;
    targetPerfection = perfection;
    if (stability !== undefined) targetStability = stability;
    console.log(
      `[CraftBuddy] Targets set to: completion=${completion}, perfection=${perfection}, stability=${targetStability}`,
    );
    renderOverlay();
  },

  setSublimeMode: (enabled: boolean, multiplier?: number) => {
    isSublimeCraft = enabled;
    if (multiplier !== undefined) {
      sublimeTargetMultiplier = multiplier;
    } else {
      sublimeTargetMultiplier = enabled ? 2.0 : 1.0;
    }
    console.log(
      `[CraftBuddy] Sublime mode: ${enabled}, multiplier: ${sublimeTargetMultiplier}`,
    );
    // Rebuild config with new sublime settings
    if (lastEntity) {
      currentConfig = buildConfigFromEntity(
        lastEntity,
        [],
        false,
        lastRecipe,
        lastRecipeStats,
      );
    }
    renderOverlay();
  },

  toggleSublime: () => {
    isSublimeCraft = !isSublimeCraft;
    sublimeTargetMultiplier = isSublimeCraft ? 2.0 : 1.0;
    console.log(
      `[CraftBuddy] Sublime mode toggled: ${isSublimeCraft}, multiplier: ${sublimeTargetMultiplier}`,
    );
    if (lastEntity) {
      currentConfig = buildConfigFromEntity(
        lastEntity,
        [],
        false,
        lastRecipe,
        lastRecipeStats,
      );
    }
    renderOverlay();
    return isSublimeCraft;
  },

  setLookaheadDepth: (depth: number) => {
    currentSettings = saveSettings({
      lookaheadDepth: Math.max(1, Math.min(96, depth)),
    });
    console.log(
      `[CraftBuddy] Lookahead depth set to: ${currentSettings.lookaheadDepth}`,
    );
  },

  togglePanel: () => {
    currentSettings = saveSettings({
      panelVisible: !currentSettings.panelVisible,
    });
    if (currentSettings.panelVisible) {
      showOverlay();
    } else {
      hideOverlay();
    }
    return currentSettings.panelVisible;
  },

  toggleCompact: () => {
    currentSettings = saveSettings({
      compactMode: !currentSettings.compactMode,
    });
    renderOverlay();
    return currentSettings.compactMode;
  },

  logGameData: () => {
    console.log('[CraftBuddy] === Game Data Sources ===');
    console.log(
      'recipeConditionEffects:',
      window.modAPI?.gameData?.recipeConditionEffects,
    );
    console.log(
      'craftingTechniques:',
      window.modAPI?.gameData?.craftingTechniques,
    );
    console.log('harmonyConfigs:', window.modAPI?.gameData?.harmonyConfigs);
    console.log('Current config:', currentConfig);
    console.log('Condition effects cache:', conditionEffectsCache);
    console.log('Current settings:', currentSettings);
    console.log('Last entity:', lastEntity);
    console.log('Last progressState:', lastProgressState);
    console.log('Integration diagnostics:', integrationDiagnostics);

    // Check screenAPI
    const screenAPI = (window.modAPI as any)?.screenAPI;
    console.log('[CraftBuddy] screenAPI:', screenAPI);
    if (screenAPI) {
      console.log('[CraftBuddy] screenAPI keys:', Object.keys(screenAPI));
      // Try to use useSelector if available
      if (typeof screenAPI.useSelector === 'function') {
        try {
          // This might fail if not in React context
          const craftingState = screenAPI.useSelector(
            (state: any) => state.crafting,
          );
          console.log(
            '[CraftBuddy] Crafting state from useSelector:',
            craftingState,
          );
        } catch (e) {
          console.log(
            '[CraftBuddy] useSelector failed (expected if not in React context):',
            e,
          );
        }
      }
    }
  },

  // Find Redux store location
  findStore: () => {
    const win = window as any;
    console.log('[CraftBuddy] === Searching for Redux Store ===');

    // Check common locations
    const locations = [
      'store',
      '__REDUX_STORE__',
      'reduxStore',
      '__store__',
      'gameStore',
      'appStore',
      '__STORE__',
      'Store',
    ];

    for (const loc of locations) {
      if (win[loc]) {
        console.log(`[CraftBuddy] Found store at window.${loc}:`, win[loc]);
        if (typeof win[loc].getState === 'function') {
          const state = win[loc].getState();
          console.log(`[CraftBuddy] State keys:`, Object.keys(state || {}));
          if (state?.crafting) {
            console.log(`[CraftBuddy] Crafting state:`, state.crafting);
          }
        }
      }
    }

    // Check modAPI
    console.log('[CraftBuddy] modAPI:', win.modAPI);
    if (win.modAPI) {
      console.log('[CraftBuddy] modAPI keys:', Object.keys(win.modAPI));
      // Check for any state-related properties
      for (const key of Object.keys(win.modAPI)) {
        const val = win.modAPI[key];
        if (val && typeof val === 'object') {
          console.log(
            `[CraftBuddy] modAPI.${key} keys:`,
            Object.keys(val).slice(0, 20),
          );
        }
      }
    }

    // Try React root with detailed fiber inspection
    const rootEl =
      document.getElementById('root') || document.getElementById('app');
    if (rootEl) {
      console.log('[CraftBuddy] Found root element:', rootEl.id);
      const reactKeys = Object.keys(rootEl).filter((k) =>
        k.startsWith('__react'),
      );
      console.log('[CraftBuddy] React keys on root:', reactKeys);

      // Try to traverse fiber tree
      for (const key of reactKeys) {
        try {
          const fiber = (rootEl as any)[key];
          console.log(
            `[CraftBuddy] Fiber at ${key}:`,
            fiber?.tag,
            fiber?.type?.name || fiber?.type,
          );

          // Look for store in first few levels
          let current = fiber;
          for (let i = 0; i < 10 && current; i++) {
            if (current.memoizedProps?.store) {
              console.log(
                '[CraftBuddy] Found store in memoizedProps at depth',
                i,
              );
              const store = current.memoizedProps.store;
              if (typeof store.getState === 'function') {
                const state = store.getState();
                console.log(
                  '[CraftBuddy] Store state keys:',
                  Object.keys(state || {}),
                );
                return store;
              }
            }
            if (current.pendingProps?.store) {
              console.log(
                '[CraftBuddy] Found store in pendingProps at depth',
                i,
              );
              return current.pendingProps.store;
            }
            current = current.child || current.sibling;
          }
        } catch (e) {
          console.warn('[CraftBuddy] Error inspecting fiber:', e);
        }
      }
    }

    const store = findReduxStore();
    if (store) {
      console.log('[CraftBuddy] findReduxStore() returned:', store);
      if (typeof store.getState === 'function') {
        const state = store.getState();
        console.log('[CraftBuddy] Store state keys:', Object.keys(state || {}));
      }
    } else {
      console.log('[CraftBuddy] No Redux store found');
    }
    return store;
  },

  // Force update recommendation with stored entity/state
  forceUpdate: () => {
    if (lastEntity && lastProgressState) {
      updateRecommendation(lastEntity, lastProgressState);
      console.log('[CraftBuddy] Forced update');
    } else {
      console.log('[CraftBuddy] No entity/state stored yet');
    }
  },

  // Show overlay manually
  showPanel: () => {
    showOverlay();
    console.log('[CraftBuddy] Panel shown');
  },

  // Hide overlay manually
  hidePanel: () => {
    hideOverlay();
    console.log('[CraftBuddy] Panel hidden');
  },

  // Check crafting detection
  detectCrafting: () => {
    const result = detectCraftingState();
    console.log('[CraftBuddy] Crafting detection:', result);

    // Also log the raw Redux state for debugging
    if (cachedStore) {
      const state = cachedStore.getState();
      console.log('[CraftBuddy] Redux crafting state:', state?.crafting);
      console.log('[CraftBuddy] Has player:', !!state?.crafting?.player);
      console.log(
        '[CraftBuddy] Has progressState:',
        !!state?.crafting?.progressState,
      );
    }

    return result;
  },

  // Parse DOM values
  parseDOMValues: () => {
    const result = parseCraftingValuesFromDOM();
    console.log('[CraftBuddy] DOM values:', result);
    return result;
  },

  // Start/stop polling
  startPolling: () => {
    startPolling();
    console.log('[CraftBuddy] Polling started');
  },

  stopPolling: () => {
    stopPolling();
    console.log('[CraftBuddy] Polling stopped');
  },

  // Test with mock data
  testWithMockData: () => {
    console.log('[CraftBuddy] Testing with mock data...');

    // Create mock entity
    const mockEntity: any = {
      stats: {
        control: 16,
        intensity: 12,
        pool: 150,
        maxpool: 200,
      },
      techniques: [
        {
          name: 'Simple Fusion',
          poolCost: 0,
          stabilityCost: 10,
          type: 'fusion',
          effects: [
            { kind: 'completion', amount: { value: 12, stat: 'intensity' } },
          ],
        },
        {
          name: 'Stabilize',
          poolCost: 10,
          stabilityCost: 0,
          type: 'stabilize',
          noMaxStabilityLoss: true,
          effects: [{ kind: 'stability', amount: { value: 20 } }],
        },
      ],
      buffs: [],
    };

    // Create mock progress state
    const mockProgress: any = {
      stability: 45,
      completion: 30,
      perfection: 20,
      condition: 'neutral',
      nextConditions: ['positive', 'neutral'],
    };

    // Set targets
    targetCompletion = 100;
    targetPerfection = 100;
    targetStability = 60;
    currentMaxStability = 55;

    // Update with mock data
    updateRecommendation(mockEntity, mockProgress);
    showOverlay();

    console.log('[CraftBuddy] Mock test complete - panel should be visible');
  },

  // COMPREHENSIVE DEBUG: Dump entire Redux crafting state structure
  dumpCraftingState: () => {
    console.log('=== CRAFTBUDDY FULL STATE DUMP ===');
    console.log('Current mod targets:', {
      targetCompletion,
      targetPerfection,
      targetStability,
      currentMaxStability,
    });
    console.log('Current mod values:', {
      currentCompletion,
      currentPerfection,
      currentStability,
    });

    if (!cachedStore) {
      console.log('ERROR: No Redux store cached!');
      return;
    }

    const state = cachedStore.getState();
    if (!state) {
      console.log('ERROR: Store state is null/undefined!');
      return;
    }

    console.log('Redux state top-level keys:', Object.keys(state));

    const crafting = state.crafting;
    if (!crafting) {
      console.log('ERROR: No crafting state in Redux!');
      return;
    }

    console.log('--- CRAFTING STATE KEYS ---');
    console.log(Object.keys(crafting));

    // Dump each key with its type and value/structure
    for (const key of Object.keys(crafting)) {
      const val = crafting[key];
      const type = typeof val;

      if (val === null) {
        console.log(`crafting.${key}: null`);
      } else if (val === undefined) {
        console.log(`crafting.${key}: undefined`);
      } else if (type === 'object') {
        if (Array.isArray(val)) {
          console.log(
            `crafting.${key}: Array[${val.length}]`,
            val.length > 0 ? val.slice(0, 3) : '(empty)',
          );
        } else {
          console.log(`crafting.${key}: Object with keys:`, Object.keys(val));
          // For important objects, dump their contents
          if (
            ['recipeStats', 'progressState', 'recipe', 'difficulty'].includes(
              key,
            )
          ) {
            console.log(
              `  FULL crafting.${key}:`,
              JSON.stringify(val, null, 2),
            );
          }
        }
      } else {
        console.log(
          `crafting.${key}: ${type} = ${String(val).substring(0, 100)}`,
        );
      }
    }

    // Specifically look for target values in various places
    console.log('--- SEARCHING FOR TARGET VALUES ---');

    // Check recipeStats
    if (crafting.recipeStats) {
      console.log('recipeStats.completion:', crafting.recipeStats.completion);
      console.log('recipeStats.perfection:', crafting.recipeStats.perfection);
      console.log('recipeStats.stability:', crafting.recipeStats.stability);
    } else {
      console.log('recipeStats: NOT FOUND');
    }

    // Check progressState for stabilityPenalty
    if (crafting.progressState) {
      console.log(
        'progressState.completion:',
        crafting.progressState.completion,
      );
      console.log(
        'progressState.perfection:',
        crafting.progressState.perfection,
      );
      console.log('progressState.stability:', crafting.progressState.stability);
      console.log(
        'progressState.stabilityPenalty:',
        crafting.progressState.stabilityPenalty,
      );
      console.log(
        'progressState.maxStability:',
        crafting.progressState.maxStability,
      );
      // Dump all progressState keys
      console.log(
        'ALL progressState keys:',
        Object.keys(crafting.progressState),
      );
    }

    // Check recipe object
    if (crafting.recipe) {
      console.log('recipe keys:', Object.keys(crafting.recipe));
      if (crafting.recipe.stats)
        console.log('recipe.stats:', crafting.recipe.stats);
      if (crafting.recipe.difficulty)
        console.log('recipe.difficulty:', crafting.recipe.difficulty);
      if (crafting.recipe.completion)
        console.log('recipe.completion:', crafting.recipe.completion);
      if (crafting.recipe.perfection)
        console.log('recipe.perfection:', crafting.recipe.perfection);
      if (crafting.recipe.stability)
        console.log('recipe.stability:', crafting.recipe.stability);
    }

    // Check for any other keys that might contain targets
    const targetKeywords = [
      'target',
      'max',
      'goal',
      'required',
      'total',
      'stats',
      'difficulty',
    ];
    for (const key of Object.keys(crafting)) {
      const lowerKey = key.toLowerCase();
      if (targetKeywords.some((kw) => lowerKey.includes(kw))) {
        console.log(`Potential target key - crafting.${key}:`, crafting[key]);
      }
    }

    console.log('=== END STATE DUMP ===');
    return crafting;
  },

  // Quick check of what the mod is currently using
  getCurrentTargets: () => {
    return {
      targetCompletion,
      targetPerfection,
      targetStability,
      currentMaxStability,
      currentCompletion,
      currentPerfection,
      currentStability,
    };
  },
};

/**
 * Register keyboard shortcuts.
 */
try {
  document.addEventListener('keydown', (event: KeyboardEvent) => {
    if (event.ctrlKey && event.shiftKey) {
      switch (event.key.toLowerCase()) {
        case 'c':
          event.preventDefault();
          currentSettings = saveSettings({
            panelVisible: !currentSettings.panelVisible,
          });
          if (currentSettings.panelVisible) {
            showOverlay();
          } else {
            hideOverlay();
          }
          debugLog(
            `[CraftBuddy] Panel visibility: ${currentSettings.panelVisible}`,
          );
          break;
        case 'm':
          event.preventDefault();
          currentSettings = saveSettings({
            compactMode: !currentSettings.compactMode,
          });
          renderOverlay();
          debugLog(
            `[CraftBuddy] Compact mode: ${currentSettings.compactMode}`,
          );
          break;
      }
    }
  });
  debugLog('[CraftBuddy] Keyboard shortcuts registered');
} catch (e) {
  console.warn('[CraftBuddy] Failed to register keyboard shortcuts:', e);
}

/**
 * Create title screen indicator.
 */
function createTitleScreenIndicator(): void {
  try {
    if (document.getElementById('craftbuddy-indicator')) {
      return;
    }

    const indicator = document.createElement('div');
    indicator.id = 'craftbuddy-indicator';
    indicator.innerHTML = `AFNM-CraftBuddy v${MOD_METADATA.version} Loaded`;

    Object.assign(indicator.style, {
      position: 'fixed',
      top: '10px',
      right: '10px',
      padding: '8px 12px',
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      color: '#FFD700',
      fontFamily: 'sans-serif',
      fontSize: '12px',
      fontWeight: 'bold',
      borderRadius: '4px',
      border: '1px solid rgba(255, 215, 0, 0.5)',
      zIndex: '9999',
      pointerEvents: 'none',
      textShadow: '0 0 5px rgba(255, 215, 0, 0.5)',
      opacity: '1',
      transition: 'opacity 1s ease',
    });

    document.body.appendChild(indicator);
    debugLog('[CraftBuddy] Title screen indicator created');

    setTimeout(() => {
      if (indicator) {
        indicator.style.opacity = '0';
        setTimeout(() => {
          if (indicator && indicator.parentNode) {
            indicator.parentNode.removeChild(indicator);
          }
        }, 1000);
      }
    }, 5000);
  } catch (e) {
    console.warn('[CraftBuddy] Failed to create title screen indicator:', e);
  }
}

// Initialize
createTitleScreenIndicator();
createOverlayContainer();
startPolling();

/**
 * Process crafting state from Redux - used both for subscription updates and initial check.
 */
function processCraftingState(craftingState: any): void {
  if (!craftingState?.player || !craftingState?.progressState) {
    if (wasCraftingActive) {
      wasCraftingActive = false;
      debugLog('[CraftBuddy] Redux reports crafting inactive, clearing state');
      handleCraftingEnded();
    }
    return;
  }
  wasCraftingActive = true;

  const progress = craftingState.progressState;
  const entity = craftingState.player;

  // Read targets from recipeStats in Redux state (this is the authoritative source)
  const recipeStats = craftingState.recipeStats;

  if (!recipeStats) {
    debugLog(
      '[CraftBuddy] recipeStats is undefined, checking craftingState keys:',
      Object.keys(craftingState),
    );
    const recipe = craftingState.recipe;
    if (recipe) {
      debugLog(
        '[CraftBuddy] Found recipe object:',
        JSON.stringify(recipe, null, 2).substring(0, 1000),
      );
      if (recipe.stats) {
        debugLog(
          '[CraftBuddy] recipe.stats:',
          JSON.stringify(recipe.stats, null, 2),
        );
      }
      if (recipe.difficulty) {
        debugLog(
          '[CraftBuddy] recipe.difficulty:',
          JSON.stringify(recipe.difficulty, null, 2),
        );
      }
      if (recipe.basicItem) {
        debugLog(
          '[CraftBuddy] recipe.basicItem:',
          JSON.stringify(recipe.basicItem, null, 2).substring(0, 500),
        );
      }
    }
    debugLog('[CraftBuddy] Full craftingState structure:');
    for (const key of Object.keys(craftingState)) {
      const val = craftingState[key];
      const type = typeof val;
      if (type === 'object' && val !== null) {
        debugLog(
          `  ${key}: ${type} with keys: ${Object.keys(val).slice(0, 10).join(', ')}`,
        );
      } else {
        debugLog(`  ${key}: ${type} = ${String(val).substring(0, 50)}`);
      }
    }
  } else {
    debugLog(
      '[CraftBuddy] recipeStats found:',
      JSON.stringify(recipeStats, null, 2),
    );
  }

  // Try multiple sources for targets
  let foundTargets = false;

  // Source 1: recipeStats (preferred) - this is the authoritative source from Redux
  // recipeStats is calculated by deriveRecipeDifficulty() when crafting starts and IS persisted in saves
  if (recipeStats) {
    if (recipeStats.completion !== undefined && recipeStats.completion > 0) {
      targetCompletion = recipeStats.completion;
      foundTargets = true;
    }
    if (recipeStats.perfection !== undefined && recipeStats.perfection > 0) {
      targetPerfection = recipeStats.perfection;
      foundTargets = true;
    }
    if (recipeStats.stability !== undefined && recipeStats.stability > 0) {
      targetStability = recipeStats.stability;
      foundTargets = true;
    }

    // Calculate current max stability from recipeStats.stability - progressState.stabilityPenalty
    // The game tracks stability decay via stabilityPenalty, not a separate maxStability field
    const stabilityPenalty = progress.stabilityPenalty || 0;
    currentMaxStability = recipeStats.stability - stabilityPenalty;
    debugLog(
      `[CraftBuddy] Current max stability: ${currentMaxStability} (target: ${recipeStats.stability}, penalty: ${stabilityPenalty})`,
    );
  }

  // Source 2: recipe object (fallback)
  if (!foundTargets && craftingState.recipe) {
    const recipe = craftingState.recipe;
    // Try recipe.stats
    if (recipe.stats) {
      if (recipe.stats.completion > 0)
        targetCompletion = recipe.stats.completion;
      if (recipe.stats.perfection > 0)
        targetPerfection = recipe.stats.perfection;
      if (recipe.stats.stability > 0) targetStability = recipe.stats.stability;
      foundTargets = true;
    }
    // Try recipe.difficulty (note: this is usually just a string like 'hard', not an object)
    if (recipe.difficulty && typeof recipe.difficulty === 'object') {
      if (recipe.difficulty.completion > 0)
        targetCompletion = recipe.difficulty.completion;
      if (recipe.difficulty.perfection > 0)
        targetPerfection = recipe.difficulty.perfection;
      if (recipe.difficulty.stability > 0)
        targetStability = recipe.difficulty.stability;
      foundTargets = true;
    }
    // Try direct properties on recipe
    if (recipe.completion > 0) {
      targetCompletion = recipe.completion;
      foundTargets = true;
    }
    if (recipe.perfection > 0) {
      targetPerfection = recipe.perfection;
      foundTargets = true;
    }
    if (recipe.stability > 0) {
      targetStability = recipe.stability;
      foundTargets = true;
    }
  }

  // Source 3: localStorage cache (for mid-craft save loads)
  if (!foundTargets) {
    foundTargets = loadCachedTargets();
    if (foundTargets) {
      debugLog(
        `[CraftBuddy] Targets from cache: completion=${targetCompletion}, perfection=${targetPerfection}, stability=${targetStability}`,
      );
    }
  }

  // Source 4: ALWAYS parse targets from DOM - this is the source of truth for what the game displays
  // The DOM shows the actual current values, which is especially important for mid-craft save loads
  // where recipeStats is undefined and other sources may not have the correct values
  const domValues = parseCraftingValuesFromDOM();
  if (domValues) {
    let domUpdated = false;

    // Update targets from DOM if they differ from current values
    // DOM values are authoritative since they show what the game is actually displaying
    if (
      domValues.targetCompletion &&
      domValues.targetCompletion > 0 &&
      domValues.targetCompletion !== targetCompletion
    ) {
      debugLog(
        `[CraftBuddy] DOM targetCompletion: ${domValues.targetCompletion} (was ${targetCompletion})`,
      );
      targetCompletion = domValues.targetCompletion;
      domUpdated = true;
    }
    if (
      domValues.targetPerfection &&
      domValues.targetPerfection > 0 &&
      domValues.targetPerfection !== targetPerfection
    ) {
      debugLog(
        `[CraftBuddy] DOM targetPerfection: ${domValues.targetPerfection} (was ${targetPerfection})`,
      );
      targetPerfection = domValues.targetPerfection;
      domUpdated = true;
    }
    // For stability, the DOM shows current/currentMax - update currentMaxStability
    if (
      domValues.targetStability &&
      domValues.targetStability > 0 &&
      domValues.targetStability !== currentMaxStability
    ) {
      debugLog(
        `[CraftBuddy] DOM currentMaxStability: ${domValues.targetStability} (was ${currentMaxStability})`,
      );
      currentMaxStability = domValues.targetStability;
      // Also update targetStability if it's still at default or lower than DOM value
      if (
        targetStability === 60 ||
        targetStability < domValues.targetStability
      ) {
        targetStability = domValues.targetStability;
      }
      domUpdated = true;
    }

    if (domUpdated) {
      foundTargets = true;
      debugLog(
        `[CraftBuddy] Targets updated from DOM: completion=${targetCompletion}, perfection=${targetPerfection}, stability=${targetStability}, maxStability=${currentMaxStability}`,
      );
      // Cache these for future use
      cacheTargets('from-dom-processCraftingState');
    }
  }

  if (foundTargets) {
    debugLog(
      `[CraftBuddy] Final targets: completion=${targetCompletion}, perfection=${targetPerfection}, stability=${targetStability}`,
    );
  }

  // Check if state changed OR if we haven't initialized yet (lastEntity is null)
  const stateChanged =
    progress.completion !== currentCompletion ||
    progress.perfection !== currentPerfection ||
    progress.stability !== currentStability;
  const needsInitialization = !lastEntity;

  if (stateChanged || needsInitialization) {
    debugLog(
      `[CraftBuddy] Redux update: Completion=${progress.completion}, Perfection=${progress.perfection}, Stability=${progress.stability}${needsInitialization ? ' (initial load)' : ''}`,
    );

    // Ensure panel is visible
    if (!isOverlayVisible) {
      overlayForcedByActiveCraft = true;
      showOverlay();
    }

    const inventoryItems = cachedStore?.getState?.()?.inventory?.items as
      | InventoryItemLike[]
      | undefined;
    updateRecommendation(
      entity,
      progress,
      inventoryItems,
      Number(craftingState?.consumedPills ?? 0) || 0,
      !!craftingState?.trainingMode,
    );
  }
}

// Subscribe to Redux store for state changes
setTimeout(() => {
  const store = findReduxStore();
  if (store && typeof store.subscribe === 'function') {
    cachedStore = store;
    debugLog('[CraftBuddy] Subscribing to Redux store for state changes');

    // IMPORTANT: Check for active crafting immediately on subscription
    // This handles the case where user loads a save mid-craft
    const initialState = store.getState();
    const initialCraftingState = initialState?.crafting;
    if (initialCraftingState?.player && initialCraftingState?.progressState) {
      debugLog(
        '[CraftBuddy] Detected active crafting session on load (mid-craft save)',
      );
      processCraftingState(initialCraftingState);
    }

    // Subscribe to future changes
    store.subscribe(() => {
      const state = store.getState();
      const craftingState = state?.crafting;
      processCraftingState(craftingState);
    });
  }
}, 1000); // Wait 1 second for game to initialize

console.log('[CraftBuddy] Mod loaded successfully!');
debugLog(
  '[CraftBuddy] Debug: window.craftBuddyDebug.testWithMockData() to test the panel',
);
debugLog(
  '[CraftBuddy] Debug: window.craftBuddyDebug.showPanel() to show panel manually',
);
