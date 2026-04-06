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
  KnownCraftingTechnique,
  CraftingRecipeStats,
  CraftingCondition,
  RecipeConditionEffect,
  CraftingBuff,
  CraftingPillItem,
  CraftingReagentItem,
  RecipeItem,
  type RootState,
} from 'afnm-types';
import {
  CraftingState,
  findBestSkill,
  SearchResult,
  SkillRecommendation,
  BuffType,
  OptimizerConfig,
  SkillDefinition,
  SkillMastery,
  getBonusAndChance,
  normalizeForecastConditionQueue,
  setConditionTransitionProvider,
  VISIBLE_CONDITION_QUEUE_LENGTH,
  setNativeCraftingUtils,
  setNativeCanUseActionProvider,
} from '../optimizer';
import { buildCanonicalNativeVariables } from '../optimizer/nativeVariables';
import { RecommendationPanel } from '../ui/RecommendationPanel';
import { CraftBuddyThemeProvider } from '../ui/ThemeProvider';
import {
  CraftBuddySettings,
  saveSettings,
  loadSettings,
  getSearchConfig,
} from '../settings';
import {
  createDefaultAutoCraftUiState,
  type AutoCraftPolicy,
  type AutoCraftUiState,
} from '../settings/autoCraft';
import { resolveBaseCraftingStats } from './configStats';
import {
  createAutoCraftController,
  type AutoCraftExecutionRequest,
} from './autoCraftController';
import { createDomAutoCraftExecutor } from './autoCraftExecutor';
import {
  resolveCraftingType,
  resolveSublimeCraftState,
  sanitizeItemTypeHarmonyMap,
  type CraftingType,
  type CraftingTypeDetectionSource,
  type SublimeDetectionSignal,
} from './craftingContext';
import {
  hasReliableCraftingActivity as hasReliableCraftingActivityState,
  shouldPrimeCraftSessionFromRecipeDifficultyHook,
  shouldAcceptReduxCraftingState,
} from './craftingActivity';
import {
  hasCraftingActionCue,
  hasVisibleCraftingUiSignals,
  isRenderableOnscreenElement,
  parseCraftingProgressPair,
} from './craftingUiDetection';
import {
  createModApiStateStore,
  extractActiveCraftingState,
  hasStateBackedCraftingUi,
} from './craftingStoreState';
import { hydrateHarmonyData, type HarmonyDataSource } from './harmonyState';
import {
  buildOptimizerReplaySnapshotWithHistory,
  buildConfigSnapshot,
  buildResultSnapshot,
  buildStateSnapshot,
  sanitizeForJson,
  type OptimizerReplayAutoCraftSnapshot,
  type OptimizerReplayInputSnapshot,
  type OptimizerReplaySnapshot,
  type OptimizerReplayTurnSnapshot,
} from './replaySnapshot';
import { resolveConditionEffectsData } from './conditionEffects';
import {
  buildKnownCraftingTechniqueNameMap,
  resolveLiveCraftingTechnique,
} from './techniqueResolution';
import { getCraftBuddyHotkeyAction } from './hotkeys';
import { debugLog } from '../utils/debug';
import { checkPrecision, parseGameNumber } from '../utils/largeNumbers';
import {
  computeOverlayLayout,
  expandOverlayRect,
  isOverlayParentRectUsable,
  isRectInOverlayHudCluster,
  unionOverlayRects,
  type OverlayRectLike,
} from '../utils/overlayLayout';

declare const MOD_METADATA: {
  name: string;
  version: string;
  author: { name: string } | string;
  description: string;
};

const OVERLAY_OCCUPIED_RECT_PADDING = {
  top: 8,
  right: 28,
  bottom: 8,
  left: 12,
} as const;
const MAX_HUD_RECT_PARENT_DEPTH = 4;
const MAX_HUD_RECT_VIEWPORT_WIDTH_RATIO = 0.72;
const MAX_HUD_RECT_VIEWPORT_HEIGHT_RATIO = 0.72;

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
  usingModApiCompletionBonusBuffName: boolean;
  usingModApiGetNextCondition: boolean;
  usingModApiTechniqueFromKnown: boolean;
  techniqueFromKnownMatchCount: number;
  techniqueFromKnownFallbackCount: number;
  techniqueFromKnownResolverFailureCount: number;
  usingModApiScalingEvaluator: boolean;
  usingModApiOvercritHelper: boolean;
  usingModApiCanUseActionPrecheck: boolean;
  usingModApiCapGetters: boolean;
  usingModApiCraftingVariableResolver: boolean;
  usingModApiMaxToxicityGetter: boolean;
  usingModApiItemTypeHarmonyMapping: boolean;
  nativeCanUseActionCalls: number;
  nativeCanUseActionBlocked: number;
  nativeCanUseActionErrors: number;
  lastCraftingTypeDetectionSource: CraftingTypeDetectionSource;
  lastCraftingTypeMappedItemKind?: string;
  craftingTypeDetectedFromItemKindCount: number;
  lastSublimeDetectionSignals: SublimeDetectionSignal[];
  lastHarmonyDataSource: HarmonyDataSource;
  harmonyDataFromProgressStateCount: number;
  harmonyDataFromNativeVariablesCount: number;
  harmonyDataFromBuffsCount: number;
  harmonyDataMissingCount: number;
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
  usingModApiCompletionBonusBuffName: false,
  usingModApiGetNextCondition: false,
  usingModApiTechniqueFromKnown: false,
  techniqueFromKnownMatchCount: 0,
  techniqueFromKnownFallbackCount: 0,
  techniqueFromKnownResolverFailureCount: 0,
  usingModApiScalingEvaluator: false,
  usingModApiOvercritHelper: false,
  usingModApiCanUseActionPrecheck: false,
  usingModApiCapGetters: false,
  usingModApiCraftingVariableResolver: false,
  usingModApiMaxToxicityGetter: false,
  usingModApiItemTypeHarmonyMapping: false,
  nativeCanUseActionCalls: 0,
  nativeCanUseActionBlocked: 0,
  nativeCanUseActionErrors: 0,
  lastCraftingTypeDetectionSource: 'unchanged',
  lastCraftingTypeMappedItemKind: undefined,
  craftingTypeDetectedFromItemKindCount: 0,
  lastSublimeDetectionSignals: [],
  lastHarmonyDataSource: 'missing',
  harmonyDataFromProgressStateCount: 0,
  harmonyDataFromNativeVariablesCount: 0,
  harmonyDataFromBuffsCount: 0,
  harmonyDataMissingCount: 0,
};

// Toxicity tracking for alchemy crafting
let currentToxicity = 0;
let maxToxicity = 0;

// Cooldown tracking
let currentCooldowns: Map<string, number> = new Map();

// Current crafting type
let currentCraftingType: CraftingType = 'forge';

// Sublime crafting mode (harmony type crafting that allows exceeding normal targets)
// - Standard sublime: 2x normal targets
// - Equipment crafting: potentially higher multipliers
let isSublimeCraft = false;
let sublimeTargetMultiplier = 2.0;

// Settings
let currentSettings: CraftBuddySettings = loadSettings();
let autoCraftUiState: AutoCraftUiState = createDefaultAutoCraftUiState(
  currentSettings.preferredAutoModePolicy,
);

// Calculation state tracking for loading indicator
let isCalculating = false;
let recommendationSearchEpoch = 0;

// Track search-affecting settings for stale detection
interface LastSearchSettings {
  lookaheadDepth: number;
  searchTimeBudgetMs: number;
  searchMaxNodes: number;
  searchBeamWidth: number;
  searchGoalPriorityBias: number;
}
let lastSearchSettings: LastSearchSettings | null = null;

const autoCraftExecutor = createDomAutoCraftExecutor({
  getRootElement: getGameRootElement,
  getStore: () => cachedStore,
  isElementVisible,
  isIgnoredElement: isElementInCraftBuddyOverlay,
});

const autoCraftController = createAutoCraftController({
  initialPolicy: currentSettings.preferredAutoModePolicy,
  executor: autoCraftExecutor,
  onStateChange: (state) => {
    autoCraftUiState = state;
    if (overlayContainer) {
      renderOverlay();
    }
  },
});

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
    currentSettings.searchBeamWidth !== lastSearchSettings.searchBeamWidth ||
    currentSettings.searchGoalPriorityBias !==
      lastSearchSettings.searchGoalPriorityBias
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
    searchGoalPriorityBias: currentSettings.searchGoalPriorityBias,
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
  const recoveredHarmonyCount =
    d.harmonyDataFromNativeVariablesCount + d.harmonyDataFromBuffsCount;
  if (
    d.harmonyDataFromProgressStateCount === 0 &&
    recoveredHarmonyCount >= 3 &&
    d.harmonyDataMissingCount === 0
  ) {
    console.warn(
      '[CraftBuddy] Harmony state is being recovered from fallback sources instead of progressState. Snapshot reports should include replay exports for parity triage.',
    );
  }
}

// Store the last entity for rendering
let lastEntity: CraftingEntity | null = null;
let lastProgressState: ProgressState | null = null;
let lastRecipe: RecipeItem | undefined = undefined;
let lastRecipeStats: CraftingRecipeStats | undefined = undefined;
let lastKnownCraftingTechniques: KnownCraftingTechnique[] | undefined =
  undefined;

// DOM overlay elements
let overlayContainer: HTMLDivElement | null = null;
let reactRoot: ReactDOM.Root | null = null;
let isOverlayVisible = false;
let wasCraftingActive = false;
let wasVisibleCraftingUiLastPoll = false;
let craftStartPending = false;
let craftStartPendingUntil = 0;
let overlayForcedByActiveCraft = false;
let missingVisibleCraftingUiPolls = 0;
let hasLoggedMissingHostFlushSync = false;
let hasConfirmedCraftSession = false;

// Polling interval for crafting state detection
let pollingInterval: number | null = null;
const POLL_INTERVAL_MS = 500;
const MISSING_VISIBLE_CRAFTING_UI_POLLS_BEFORE_END = 3;
const CRAFT_START_PENDING_TIMEOUT_MS = 6000;

function markCraftStartPending(): void {
  craftStartPending = true;
  craftStartPendingUntil = Date.now() + CRAFT_START_PENDING_TIMEOUT_MS;
}

function clearCraftStartPending(): void {
  craftStartPending = false;
  craftStartPendingUntil = 0;
}

function isCraftStartPendingActive(): boolean {
  if (!craftStartPending) return false;
  if (Date.now() <= craftStartPendingUntil) return true;
  clearCraftStartPending();
  return false;
}

function scheduleAfterNextPaint(callback: () => void): void {
  if (
    typeof window !== 'undefined' &&
    typeof window.requestAnimationFrame === 'function'
  ) {
    window.requestAnimationFrame(() => {
      setTimeout(callback, 0);
    });
    return;
  }

  setTimeout(callback, 0);
}

function hostReactDomSupportsFlushSync(): boolean {
  return (
    typeof (ReactDOM as typeof ReactDOM & { flushSync?: unknown }).flushSync ===
    'function'
  );
}

function scheduleSearchAfterLoadingShell(callback: () => void): void {
  if (hostReactDomSupportsFlushSync()) {
    scheduleAfterNextPaint(callback);
    return;
  }

  // The host game exposes createRoot via ReactDOM, but some builds do not
  // expose flushSync on that same object. Give the concurrent root a full
  // paint to commit the loading shell before starting synchronous search work.
  scheduleAfterNextPaint(() => {
    scheduleAfterNextPaint(callback);
  });
}

function renderReactRoot(
  root: ReactDOM.Root,
  element: React.ReactNode,
  { sync = false }: { sync?: boolean } = {},
): void {
  const reactDomCompat = ReactDOM as typeof ReactDOM & {
    flushSync?: (callback: () => void) => void;
  };

  if (sync && typeof reactDomCompat.flushSync === 'function') {
    reactDomCompat.flushSync(() => {
      root.render(element);
    });
    return;
  }

  if (sync && !hasLoggedMissingHostFlushSync) {
    hasLoggedMissingHostFlushSync = true;
    debugLog(
      '[CraftBuddy] Host ReactDOM does not expose flushSync; using async overlay commit',
    );
  }

  root.render(element);
}

function serializeCraftingBuffs(
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

function buildAutoCraftBuffSignature(): string {
  return serializeCraftingBuffs(lastEntity?.buffs);
}

function buildAutoCraftCooldownSignature(): string {
  if (currentCooldowns.size === 0) {
    return 'none';
  }

  return Array.from(currentCooldowns.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}:${value}`)
    .join('|');
}

function serializeTechniqueCooldowns(
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

function serializeQuickAccessInventory(
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

function buildAutoCraftInventorySignature(): string {
  const inventoryItems = cachedStore?.getState?.()?.inventory?.items as
    | InventoryItemLike[]
    | undefined;
  const quickAccess = ((lastEntity as any)?.craftingQuickAccess || []) as (
    | string
    | undefined
  )[];
  return serializeQuickAccessInventory(quickAccess, inventoryItems);
}

function computeObservedMaxStability(
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

function buildAutoCraftStateFingerprint(): string {
  if (!lastEntity || !lastProgressState) {
    return 'inactive';
  }

  const pool = parseGameNumber((lastEntity as any)?.stats?.pool, 0);
  return [
    `step:${currentStep}`,
    `pool:${pool}`,
    `comp:${currentCompletion}`,
    `perf:${currentPerfection}`,
    `stab:${currentStability}`,
    `max:${currentMaxStability}`,
    `tox:${currentToxicity}`,
    `cond:${currentCondition || 'none'}`,
    `queue:${nextConditions.join(',') || 'none'}`,
    `cooldowns:${buildAutoCraftCooldownSignature()}`,
    `buffs:${buildAutoCraftBuffSignature()}`,
    `items:${buildAutoCraftInventorySignature()}`,
  ].join(';');
}

function buildAutoCraftSnapshot() {
  const hasVisibleCraftingUi = detectActiveCraftingUi();
  const craftActive =
    hasConfirmedCraftSession &&
    lastEntity !== null &&
    lastProgressState !== null &&
    wasCraftingActive &&
    hasVisibleCraftingUi;

  return {
    craftSessionActive: craftActive || isCraftStartPendingActive(),
    craftActive,
    isCalculating,
    result: currentRecommendation,
    stateFingerprint: buildAutoCraftStateFingerprint(),
  };
}

function syncAutoCraftController(): void {
  autoCraftController.sync(buildAutoCraftSnapshot());
}

function buildExecutionRequestForRecommendation(
  recommendation: SkillRecommendation,
): AutoCraftExecutionRequest {
  const actionKind = (recommendation.skill.actionKind ?? 'skill') as
    | 'skill'
    | 'item'
    | 'finish';

  return {
    kind: actionKind,
    actionName: recommendation.skill.name,
    skill: recommendation.skill,
    reason: recommendation.reasoning,
  };
}

function executeDisplayedRecommendation(
  recommendation: SkillRecommendation,
): void {
  const autoModeBusy =
    autoCraftUiState.armed &&
    (autoCraftUiState.phase === 'executing' ||
      autoCraftUiState.phase === 'waiting_for_state' ||
      autoCraftUiState.phase === 'stop_requested');

  if (autoCraftUiState.armed) {
    stopAutoCraft('Auto mode stopped for manual action.');
    if (autoModeBusy) {
      return;
    }
  }

  const request = buildExecutionRequestForRecommendation(recommendation);
  const snapshot = buildAutoCraftSnapshot();

  try {
    const execution = autoCraftExecutor.execute(request, snapshot);
    void Promise.resolve(execution).catch((error) => {
      console.warn(
        '[CraftBuddy] Failed to execute recommendation action:',
        error,
      );
    });
  } catch (error) {
    console.warn(
      '[CraftBuddy] Failed to execute recommendation action:',
      error,
    );
  }
}

function setAutoCraftPolicy(policy: AutoCraftPolicy): void {
  currentSettings = saveSettings({
    preferredAutoModePolicy: policy,
  });
  autoCraftController.setPolicy(policy);
}

function armAutoCraft(): void {
  autoCraftController.arm();
  syncAutoCraftController();
}

function stopAutoCraft(reason?: string): void {
  autoCraftController.requestStop(reason);
  syncAutoCraftController();
}

// LocalStorage key for caching targets (used for mid-craft save loads)
const TARGETS_CACHE_KEY = 'craftbuddy_targets_cache';
const OPTIMIZER_REPLAY_MAX_TURNS = 8;
const OPTIMIZER_REPLAY_MAX_BYTES = 750_000;

interface CachedTargets {
  completion: number;
  perfection: number;
  stability: number;
  recipeName?: string;
  timestamp: number;
}

let lastOptimizerReplaySnapshot: OptimizerReplaySnapshot | null = null;
let currentOptimizerReplayTurn: OptimizerReplayTurnSnapshot | null = null;
let optimizerReplayHistoryTurns: OptimizerReplayTurnSnapshot[] = [];
let optimizerReplayHistoryDroppedTurns = 0;
let optimizerReplayTurnSequence = 0;
let debugToastTimeout: number | null = null;

function buildOptimizerReplayAutoCraftSnapshot(): OptimizerReplayAutoCraftSnapshot {
  return {
    policy: autoCraftUiState.policy,
    armed: autoCraftUiState.armed,
    phase: autoCraftUiState.phase,
    tone: autoCraftUiState.tone,
    statusTitle: autoCraftUiState.statusTitle,
    statusDetail: autoCraftUiState.statusDetail,
    lastActionName: autoCraftUiState.lastActionName ?? null,
    canArm: autoCraftUiState.canArm,
    canStop: autoCraftUiState.canStop,
    isRunning: autoCraftUiState.isRunning,
    stopRequested: autoCraftUiState.stopRequested,
  };
}

function refreshOptimizerReplaySnapshot(): void {
  if (!currentOptimizerReplayTurn) {
    lastOptimizerReplaySnapshot = null;
    return;
  }

  const { snapshot, previousTurns, droppedTurns } =
    buildOptimizerReplaySnapshotWithHistory({
      currentTurn: currentOptimizerReplayTurn,
      previousTurns: optimizerReplayHistoryTurns,
      maxTurns: OPTIMIZER_REPLAY_MAX_TURNS,
      maxBytes: OPTIMIZER_REPLAY_MAX_BYTES,
      droppedTurns: optimizerReplayHistoryDroppedTurns,
    });

  optimizerReplayHistoryTurns = previousTurns;
  optimizerReplayHistoryDroppedTurns = droppedTurns;
  lastOptimizerReplaySnapshot = snapshot;
}

function archiveCurrentOptimizerReplayTurn(reason?: string): void {
  if (!currentOptimizerReplayTurn) {
    return;
  }

  let archivedTurn = currentOptimizerReplayTurn;
  if (!archivedTurn.completedAt) {
    archivedTurn = {
      ...archivedTurn,
      error: archivedTurn.output
        ? archivedTurn.error
        : (archivedTurn.error ?? reason),
      completedAt: new Date().toISOString(),
    };
  }

  optimizerReplayHistoryTurns = [...optimizerReplayHistoryTurns, archivedTurn];
  currentOptimizerReplayTurn = null;
}

function resetOptimizerReplaySnapshots(): void {
  lastOptimizerReplaySnapshot = null;
  currentOptimizerReplayTurn = null;
  optimizerReplayHistoryTurns = [];
  optimizerReplayHistoryDroppedTurns = 0;
  optimizerReplayTurnSequence = 0;
}

function buildRawCraftContextSnapshot(
  recipe: RecipeItem | undefined,
  recipeStats: CraftingRecipeStats | undefined,
): Record<string, unknown> {
  const recipeAny = recipe as Record<string, unknown> | undefined;
  const recipeStatsAny = recipeStats as Record<string, unknown> | undefined;

  return {
    recipe: {
      harmonyType: recipeAny?.harmonyType ?? null,
      harmonyTypeOverride: recipeAny?.harmonyTypeOverride ?? null,
      type: recipeAny?.type ?? null,
      kind: recipeAny?.kind ?? null,
      craftingMode: recipeAny?.craftingMode ?? null,
      usesHarmony: recipeAny?.usesHarmony ?? null,
      isSublimeCraft: recipeAny?.isSublimeCraft ?? null,
      isSublime: recipeAny?.isSublime ?? null,
      sublime: recipeAny?.sublime ?? null,
      canOvercraft: recipeAny?.canOvercraft ?? null,
      baseItemKind:
        (recipeAny?.baseItem as Record<string, unknown> | undefined)?.kind ??
        null,
      perfectItemKind:
        (recipeAny?.perfectItem as Record<string, unknown> | undefined)?.kind ??
        null,
      sublimeItemKind:
        (recipeAny?.sublimeItem as Record<string, unknown> | undefined)?.kind ??
        null,
    },
    recipeStats: {
      harmonyType: recipeStatsAny?.harmonyType ?? null,
      harmonyBased: recipeStatsAny?.harmonyBased ?? null,
      isSublime: recipeStatsAny?.isSublime ?? null,
      sublime: recipeStatsAny?.sublime ?? null,
      maxToxicity: recipeStatsAny?.maxToxicity ?? null,
      conditionTypeName:
        (recipeStatsAny?.conditionType as Record<string, unknown> | undefined)
          ?.name ?? null,
    },
  };
}

function buildOptimizerReplayInputSnapshot(params: {
  state: CraftingState;
  harmonyDataSource: HarmonyDataSource;
  config: OptimizerConfig;
  lookaheadDepth: number;
  searchEpoch: number;
  searchConfig: ReturnType<typeof getSearchConfig>;
  currentConditionType?: string;
  forecastedConditionTypes: string[];
  targetCompletionAtSearchStart: number;
  targetPerfectionAtSearchStart: number;
  maxStabilityAtSearchStart: number;
}): OptimizerReplayInputSnapshot {
  const normalizedForecast = normalizeForecastConditionQueue(
    params.currentConditionType as any,
    params.forecastedConditionTypes as any,
    params.state.harmony,
    VISIBLE_CONDITION_QUEUE_LENGTH,
  ).map((entry) => String(entry));

  return {
    createdAt: new Date().toISOString(),
    searchEpoch: params.searchEpoch,
    lookaheadDepth: params.lookaheadDepth,
    targets: {
      completion: params.targetCompletionAtSearchStart,
      perfection: params.targetPerfectionAtSearchStart,
      stability: targetStability,
    },
    caps: {
      maxCompletionCap: maxCompletionCap ?? null,
      maxPerfectionCap: maxPerfectionCap ?? null,
    },
    conditions: {
      current: params.currentConditionType || 'neutral',
      forecast: params.forecastedConditionTypes.map((entry) => String(entry)),
      normalizedForecast,
    },
    searchConfig: {
      timeBudgetMs: params.searchConfig.timeBudgetMs,
      maxNodes: params.searchConfig.maxNodes,
      beamWidth: params.searchConfig.beamWidth,
      goalPriorityBias: params.searchConfig.goalPriorityBias,
    },
    settings: {
      lookaheadDepth: currentSettings.lookaheadDepth,
      searchTimeBudgetMs: currentSettings.searchTimeBudgetMs,
      searchMaxNodes: currentSettings.searchMaxNodes,
      searchBeamWidth: currentSettings.searchBeamWidth,
      searchGoalPriorityBias: currentSettings.searchGoalPriorityBias,
      compactMode: currentSettings.compactMode,
      panelVisible: currentSettings.panelVisible,
    },
    state: buildStateSnapshot(params.state, params.harmonyDataSource),
    config: buildConfigSnapshot(params.config),
    context: {
      recipeName: (lastRecipe as any)?.name ?? (lastRecipeStats as any)?.name,
      craftingType: currentCraftingType,
      craftingTypeSource:
        integrationDiagnostics.lastCraftingTypeDetectionSource,
      isSublimeCraft,
      sublimeTargetMultiplier,
      sublimeDetectionSignals:
        integrationDiagnostics.lastSublimeDetectionSignals,
      targetStabilityAtSearchStart: params.maxStabilityAtSearchStart,
      integration: buildIntegrationDiagnosticsSummary(),
      rawCraftContext: buildRawCraftContextSnapshot(
        lastRecipe,
        lastRecipeStats,
      ),
    },
  };
}

function getSerializableOptimizerReplaySnapshot(): {
  data: unknown;
  json: string;
} | null {
  if (!lastOptimizerReplaySnapshot) {
    return null;
  }
  const data = sanitizeForJson(lastOptimizerReplaySnapshot);
  const json = JSON.stringify(data, null, 2);
  return { data, json };
}

async function copyTextToClipboard(text: string): Promise<boolean> {
  const clipboard = (globalThis as any)?.navigator?.clipboard;
  if (clipboard?.writeText) {
    try {
      await clipboard.writeText(text);
      return true;
    } catch {
      // Fallback to document.execCommand below.
    }
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', 'true');
    Object.assign(textarea.style, {
      position: 'fixed',
      opacity: '0',
      pointerEvents: 'none',
      left: '-9999px',
      top: '-9999px',
    });
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const copied = document.execCommand('copy');
    document.body.removeChild(textarea);
    return copied;
  } catch {
    return false;
  }
}

function downloadTextFile(fileName: string, text: string): boolean {
  try {
    const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch {
    return false;
  }
}

function showDebugToast(
  message: string,
  tone: 'info' | 'success' | 'warn' | 'error' = 'info',
  durationMs: number = 2600,
): void {
  const existing = document.getElementById('craftbuddy-debug-toast');
  if (existing && existing.parentNode) {
    existing.parentNode.removeChild(existing);
  }
  if (debugToastTimeout !== null) {
    window.clearTimeout(debugToastTimeout);
    debugToastTimeout = null;
  }

  const toast = document.createElement('div');
  toast.id = 'craftbuddy-debug-toast';
  toast.textContent = message;

  const toneStyles: Record<
    string,
    { bg: string; border: string; text: string }
  > = {
    info: {
      bg: 'rgba(15, 23, 42, 0.92)',
      border: 'rgba(59, 130, 246, 0.7)',
      text: '#dbeafe',
    },
    success: {
      bg: 'rgba(6, 78, 59, 0.92)',
      border: 'rgba(16, 185, 129, 0.7)',
      text: '#d1fae5',
    },
    warn: {
      bg: 'rgba(120, 53, 15, 0.92)',
      border: 'rgba(251, 191, 36, 0.7)',
      text: '#fef3c7',
    },
    error: {
      bg: 'rgba(127, 29, 29, 0.92)',
      border: 'rgba(248, 113, 113, 0.75)',
      text: '#fee2e2',
    },
  };

  const palette = toneStyles[tone];
  Object.assign(toast.style, {
    position: 'fixed',
    right: '18px',
    top: '18px',
    zIndex: '10002',
    maxWidth: '420px',
    padding: '10px 14px',
    borderRadius: '8px',
    border: `1px solid ${palette.border}`,
    backgroundColor: palette.bg,
    color: palette.text,
    fontFamily: `'Trebuchet MS', 'Verdana', sans-serif`,
    fontSize: '12px',
    fontWeight: '600',
    lineHeight: '1.3',
    boxShadow: '0 10px 26px rgba(0, 0, 0, 0.35)',
    pointerEvents: 'none',
    opacity: '1',
    transition: 'opacity 220ms ease-out',
    whiteSpace: 'pre-wrap',
  });

  document.body.appendChild(toast);
  debugToastTimeout = window.setTimeout(() => {
    toast.style.opacity = '0';
    window.setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 240);
    debugToastTimeout = null;
  }, durationMs);
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

function normalizeRuntimeCostPercentage(raw: unknown): number {
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
    ['utils', 'getNextCondition'],
    ['store', 'turnHandling', 'getNextCondition'],
    ['Store', 'turnHandling', 'getNextCondition'],
    ['crafting', 'getNextCondition'],
    ['getNextCondition'],
  ]) as ((progress: any) => any) | undefined;
}

function getModApiCompletionBonusBuffKey(): string | undefined {
  const rawName = window.modAPI?.utils?.completionBonusBuffName;
  if (typeof rawName !== 'string' || rawName.trim().length === 0) {
    return undefined;
  }

  integrationDiagnostics.usingModApiCompletionBonusBuffName = true;
  return normalizeBuffKey(rawName);
}

function getModApiTechniqueFromKnownResolver():
  | ((known: KnownCraftingTechnique | undefined) => CraftingTechnique)
  | undefined {
  const resolver = window.modAPI?.utils?.craftingTechniqueFromKnown;
  if (typeof resolver !== 'function') {
    return undefined;
  }
  return resolver.bind(window.modAPI.utils) as (
    known: KnownCraftingTechnique | undefined,
  ) => CraftingTechnique;
}

function configureNativeOptimizerProviders(): void {
  const modUtils = (window as any)?.modAPI?.utils;
  const nextConditionResolver = getModApiNextConditionResolver();

  const nativeCalculateOvercrit =
    typeof modUtils?.calculateCraftingOvercrit === 'function'
      ? (critChance: number, critMultiplier: number) =>
          modUtils.calculateCraftingOvercrit(critChance, critMultiplier)
      : undefined;

  setNativeCraftingUtils(
    nativeCalculateOvercrit
      ? {
          calculateCraftingOvercrit: nativeCalculateOvercrit,
        }
      : undefined,
  );
  integrationDiagnostics.usingModApiScalingEvaluator = false;
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

      const nativeTechnique = (context.skill as any)?.nativeTechnique as
        | CraftingTechnique
        | undefined;
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
      if (
        !Array.isArray(nextConditionQueue) ||
        nextConditionQueue.length === 0
      ) {
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

function parsePositiveGameNumber(value: unknown): number | undefined {
  const parsed = parseGameNumber(value, Number.NaN);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return undefined;
  }
  return parsed;
}

function pickPositiveGameNumber(
  candidates: unknown[],
  fallback: number,
): number {
  for (const candidate of candidates) {
    const parsed = parsePositiveGameNumber(candidate);
    if (parsed !== undefined) {
      return parsed;
    }
  }
  return fallback;
}

function getLiveItemTypeHarmonyMapping(): Partial<
  Record<string, CraftingType>
> {
  const raw = (window as any)?.modAPI?.gameData?.itemTypeToHarmonyType;
  const mapping = sanitizeItemTypeHarmonyMap(raw);
  integrationDiagnostics.usingModApiItemTypeHarmonyMapping =
    Object.keys(mapping).length > 0;
  return mapping;
}

function recordHarmonyDataSource(source: HarmonyDataSource): void {
  integrationDiagnostics.lastHarmonyDataSource = source;
  switch (source) {
    case 'progressState':
      integrationDiagnostics.harmonyDataFromProgressStateCount++;
      break;
    case 'nativeVariables':
      integrationDiagnostics.harmonyDataFromNativeVariablesCount++;
      break;
    case 'buffs':
      integrationDiagnostics.harmonyDataFromBuffsCount++;
      break;
    case 'missing':
      integrationDiagnostics.harmonyDataMissingCount++;
      break;
  }
}

function buildIntegrationDiagnosticsSummary(): Record<string, unknown> {
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
  if (d.usingModApiCompletionBonusBuffName)
    nativeActive.push('completionBonusIdentifier');
  else fallbackActive.push('completionBonusIdentifier');
  if (d.usingModApiCapGetters) nativeActive.push('capGetters');
  else fallbackActive.push('capGetters');
  if (d.usingModApiCraftingVariableResolver)
    nativeActive.push('variableResolver');
  else fallbackActive.push('variableResolver');
  if (d.usingModApiMaxToxicityGetter) nativeActive.push('maxToxicity');
  else fallbackActive.push('maxToxicity');
  if (d.usingModApiItemTypeHarmonyMapping) nativeActive.push('itemTypeHarmony');
  else fallbackActive.push('itemTypeHarmony');
  if (d.usingModApiTechniqueFromKnown) nativeActive.push('techniqueResolution');
  else fallbackActive.push('techniqueResolution');

  const canUseActionErrorRate =
    d.nativeCanUseActionCalls > 0
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
      identifier: d.usingModApiCompletionBonusBuffName ? 'modApi' : 'heuristic',
    },
    techniqueResolution: {
      source: d.usingModApiTechniqueFromKnown ? 'modApiFromKnown' : 'liveOnly',
      matched: d.techniqueFromKnownMatchCount,
      fallbacks: d.techniqueFromKnownFallbackCount,
      resolverFailures: d.techniqueFromKnownResolverFailureCount,
    },
    conditionQueue: {
      normalized: d.conditionQueueNormalizedCount,
      trimmed: d.conditionQueueTrimmedCount,
      padded: d.conditionQueuePaddedCount,
    },
    craftingType: {
      source: d.lastCraftingTypeDetectionSource,
      mappedItemKind: d.lastCraftingTypeMappedItemKind ?? null,
      detectedFromItemKind: d.craftingTypeDetectedFromItemKindCount,
    },
    sublimeDetection: {
      signals: d.lastSublimeDetectionSignals,
    },
    harmonyData: {
      lastSource: d.lastHarmonyDataSource,
      progressState: d.harmonyDataFromProgressStateCount,
      nativeVariables: d.harmonyDataFromNativeVariablesCount,
      buffs: d.harmonyDataFromBuffsCount,
      missing: d.harmonyDataMissingCount,
    },
  };
}

/**
 * Keep crafting-mode context in sync even when lifecycle hooks are skipped
 * (e.g., loading directly into an active crafting save).
 */
function syncCraftingContextFromState(
  recipe: RecipeItem | undefined,
  recipeStats: CraftingRecipeStats | undefined,
  entity?: CraftingEntity,
): void {
  const recipeAny = recipe as any;
  const recipeStatsAny = recipeStats as any;
  const typeResolution = resolveCraftingType({
    recipe,
    recipeStats,
    itemTypeToHarmonyType: getLiveItemTypeHarmonyMapping(),
    previousCraftingType: currentCraftingType,
  });
  if (typeResolution.craftingType) {
    currentCraftingType = typeResolution.craftingType;
  }
  integrationDiagnostics.lastCraftingTypeDetectionSource =
    typeResolution.source;
  integrationDiagnostics.lastCraftingTypeMappedItemKind =
    typeResolution.mappedItemKind;
  if (typeResolution.mappedItemKind) {
    integrationDiagnostics.craftingTypeDetectedFromItemKindCount++;
  }

  const sublimeResolution = resolveSublimeCraftState({
    recipe,
    recipeStats,
    targetCompletion,
    targetPerfection,
    maxCompletionCap,
    maxPerfectionCap,
  });
  isSublimeCraft = sublimeResolution.isSublimeCraft;
  sublimeTargetMultiplier = sublimeResolution.sublimeTargetMultiplier;
  integrationDiagnostics.lastSublimeDetectionSignals =
    sublimeResolution.signals;

  const explicitMaxToxicity = toFinitePositiveNumber(
    recipeStatsAny?.maxToxicity,
  );
  if (explicitMaxToxicity !== undefined) {
    maxToxicity = explicitMaxToxicity;
  } else if (currentCraftingType === 'alchemical') {
    const realmForToxicity =
      (entity?.realm as string | undefined) ||
      (lastEntity?.realm as string | undefined) ||
      (recipeAny?.realm as string | undefined);
    maxToxicity = resolveMaxToxicityCap(realmForToxicity, 100);
  } else {
    maxToxicity = 0;
  }
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

function getKnownCraftingTechniquesFromState(
  state: RootState | any,
): KnownCraftingTechnique[] | undefined {
  const knownTechniques = state?.player?.player?.craftingTechniques;
  return Array.isArray(knownTechniques)
    ? (knownTechniques as KnownCraftingTechnique[])
    : undefined;
}

function getCurrentKnownCraftingTechniques():
  | KnownCraftingTechnique[]
  | undefined {
  const state = cachedStore?.getState?.();
  const knownTechniques = getKnownCraftingTechniquesFromState(state);
  if (knownTechniques) {
    lastKnownCraftingTechniques = knownTechniques;
    return knownTechniques;
  }

  return lastKnownCraftingTechniques;
}

/**
 * Convert game CraftingTechnique array to our skill definitions.
 */
function convertGameTechniques(
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
  const resolvedStats = resolveBaseCraftingStats(entity);
  const baseControl = resolvedStats.baseControl;
  const baseIntensity = resolvedStats.baseIntensity;
  const maxQi = parseGameNumber((stats as any)?.maxpool, 100);

  // @ts-ignore
  const entityMaxToxicity = stats?.maxtoxicity || 0;

  if (recipe && recipeStats) {
    updateProgressCapsFromModApi(recipe, recipeStats, entity.realm as string);
  }

  const skills = [
    ...convertGameTechniques(
      entity.techniques,
      getCurrentKnownCraftingTechniques(),
    ),
    ...extraSkills,
  ];
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

  // Prefer recipeStats-bound condition effects for the active craft. The
  // separate difficulty hook can lag behind Redux recipe updates, so the
  // global cache is only a fallback.
  const conditionEffectsData = resolveConditionEffectsData(
    recipeStats,
    conditionEffectsCache,
  );

  debugLog(
    `[CraftBuddy] Config: control=${baseControl} (raw=${resolvedStats.rawControl}), intensity=${baseIntensity} (raw=${resolvedStats.rawIntensity}), realmModifier=${resolvedStats.realmModifier}, source=${resolvedStats.source}, maxQi=${maxQi}, sublime=${isSublimeCraft}, multiplier=${sublimeTargetMultiplier}, conditionData=${conditionEffectsData ? 'real' : 'none'}, compCap=${maxCompletionCap ?? 'n/a'}, perfCap=${maxPerfectionCap ?? 'n/a'}`,
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
  const normalizedCondition = normalizeConditionKey(
    condition as unknown as string | undefined,
  );
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
    normalizedCondition,
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
  currentCondition = normalizedCondition;

  currentCompletion = completion;
  currentPerfection = perfection;
  currentStability = stability;
  currentStep = parseGameNumber(progressState?.step, 0);

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
          name: buff?.name || key,
          stacks,
          definition: {
            ...(buff as any),
            effects: (buff as any)?.effects ?? [],
          },
        });
      }
    }
  }

  // Read pool/stability cost percentage modifiers from entity stats + buffs.
  // Runtime can report neutral baseline as 0, while optimizer internals use 100.
  const poolCostPercentage = normalizeRuntimeCostPercentage(
    (entity as any)?.stats?.poolCostPercentage,
  );
  const poolCostFlat = Math.max(
    0,
    parseGameNumber((entity as any)?.stats?.poolCostFlat, 0),
  );
  const stabilityCostPercentage = normalizeRuntimeCostPercentage(
    (entity as any)?.stats?.stabilityCostPercentage,
  );

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
  const rawNativeVariables = resolveNativeCraftingVariables(
    entity,
    progressState,
    recipeStats || lastRecipeStats,
  );
  const { harmonyData, source: harmonyDataSource } = hydrateHarmonyData({
    isSublimeCraft,
    craftingType: currentCraftingType,
    progressHarmonyData: gameHarmonyData,
    nativeVariables: rawNativeVariables,
    buffs: extractedBuffs,
  });
  if (isSublimeCraft) {
    recordHarmonyDataSource(harmonyDataSource);
  } else {
    integrationDiagnostics.lastHarmonyDataSource = 'missing';
  }
  const nativeVariables = buildCanonicalNativeVariables({
    nativeVariables: rawNativeVariables,
    buffs: extractedBuffs,
    harmonyData,
  });

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
    poolCostFlat,
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
    harmonyData,
    completionBonus: completionBonusStacks,
    nativeVariables,
    step: progressState?.step || 0,
    history: [],
  });

  const currentConditionType = normalizedCondition as unknown as
    | string
    | undefined;
  const forecastedConditionTypes = nextConditions as unknown as string[];
  const targetCompletionAtSearchStart = targetCompletion;
  const targetPerfectionAtSearchStart = targetPerfection;
  const maxStabilityAtSearchStart = currentMaxStability;

  const lookaheadDepth = currentSettings.lookaheadDepth;
  const searchConfig = getSearchConfig();

  // Capture config locally for the async callback
  const config = currentConfig;
  if (!config) {
    console.warn('[CraftBuddy] No config available for search');
    return;
  }

  archiveCurrentOptimizerReplayTurn('Search superseded before completion.');
  const searchEpoch = ++recommendationSearchEpoch;
  const replayInputSnapshot = buildOptimizerReplayInputSnapshot({
    state,
    harmonyDataSource,
    config,
    lookaheadDepth,
    searchEpoch,
    searchConfig,
    currentConditionType,
    forecastedConditionTypes,
    targetCompletionAtSearchStart,
    targetPerfectionAtSearchStart,
    maxStabilityAtSearchStart,
  });
  currentOptimizerReplayTurn = {
    sequence: ++optimizerReplayTurnSequence,
    step: state.step,
    capturedAt: replayInputSnapshot.createdAt,
    stateFingerprint: buildAutoCraftStateFingerprint(),
    autoCraft: buildOptimizerReplayAutoCraftSnapshot(),
    input: replayInputSnapshot,
  };
  refreshOptimizerReplaySnapshot();

  // Set calculating state and render the loading shell before search. If the
  // host ReactDOM exposes flushSync we use it, otherwise we still wait for a
  // real paint before starting synchronous search work.
  isCalculating = true;
  syncAutoCraftController();
  if (currentOptimizerReplayTurn) {
    currentOptimizerReplayTurn = {
      ...currentOptimizerReplayTurn,
      autoCraft: buildOptimizerReplayAutoCraftSnapshot(),
    };
  }
  refreshOptimizerReplaySnapshot();
  renderOverlay({ sync: true });

  // Cross a paint boundary before the expensive synchronous search so the
  // loading shell has a frame to appear on main-menu craft entry.
  scheduleSearchAfterLoadingShell(() => {
    if (searchEpoch !== recommendationSearchEpoch) {
      return;
    }

    try {
      const recommendation = findBestSkill(
        state,
        config,
        targetCompletionAtSearchStart,
        targetPerfectionAtSearchStart,
        false,
        lookaheadDepth,
        currentConditionType,
        forecastedConditionTypes,
        searchConfig,
      );
      if (searchEpoch !== recommendationSearchEpoch) {
        return;
      }

      currentRecommendation = recommendation;
      currentOptimizerReplayTurn = {
        ...(currentOptimizerReplayTurn ?? {
          sequence: optimizerReplayTurnSequence,
          step: state.step,
          capturedAt: replayInputSnapshot.createdAt,
          stateFingerprint: buildAutoCraftStateFingerprint(),
          autoCraft: buildOptimizerReplayAutoCraftSnapshot(),
          input: replayInputSnapshot,
        }),
        output: buildResultSnapshot(recommendation),
        completedAt: new Date().toISOString(),
      };

      debugLog(
        `[CraftBuddy] Updated: Pool=${pool}, Stability=${stability}/${maxStabilityAtSearchStart}, Completion=${completion}/${targetCompletionAtSearchStart}, Perfection=${perfection}/${targetPerfectionAtSearchStart}`,
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
    } catch (e) {
      console.error('[CraftBuddy] Failed to calculate recommendation:', e);
      const errorMessage =
        e instanceof Error ? `${e.name}: ${e.message}` : String(e);
      currentOptimizerReplayTurn = {
        ...(currentOptimizerReplayTurn ?? {
          sequence: optimizerReplayTurnSequence,
          step: state.step,
          capturedAt: replayInputSnapshot.createdAt,
          stateFingerprint: buildAutoCraftStateFingerprint(),
          autoCraft: buildOptimizerReplayAutoCraftSnapshot(),
          input: replayInputSnapshot,
        }),
        error: errorMessage,
        completedAt: new Date().toISOString(),
      };
      if (searchEpoch !== recommendationSearchEpoch) {
        return;
      }
      currentRecommendation = null;
    } finally {
      if (searchEpoch !== recommendationSearchEpoch) {
        return;
      }

      // Always clear calculating flag even if search throws.
      isCalculating = false;
      clearCraftStartPending();
      snapshotSearchSettings();
      checkIntegrationHealth();
      syncAutoCraftController();
      if (currentOptimizerReplayTurn) {
        currentOptimizerReplayTurn = {
          ...currentOptimizerReplayTurn,
          autoCraft: buildOptimizerReplayAutoCraftSnapshot(),
        };
      }
      refreshOptimizerReplaySnapshot();

      // Update the overlay with results
      renderOverlay();
    }
  });
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
    width: '0px',
    maxHeight: 'calc(100vh - 20px)',
    zIndex: '10000',
    display: 'flex',
    justifyContent: 'flex-end',
    alignItems: 'flex-start',
    boxSizing: 'border-box',
    overflow: 'visible',
    pointerEvents: 'auto',
  });

  document.body.appendChild(overlayContainer);
  reactRoot = ReactDOM.createRoot(overlayContainer);
  debugLog('[CraftBuddy] Overlay container created');
}

/**
 * Render the recommendation panel in the overlay.
 */
function renderOverlay({ sync = false }: { sync?: boolean } = {}): void {
  if (!overlayContainer || !reactRoot) {
    createOverlayContainer();
  }

  // Show the overlay only while the crafting UI is still on-screen (or while a
  // craft is still bootstrapping). This prevents cached Redux craft data from
  // leaving stale panels visible on library/result transitions.
  const hasVisibleCraftingUi = detectActiveCraftingUi();
  const hasLiveCraftState =
    hasConfirmedCraftSession &&
    lastEntity !== null &&
    lastProgressState !== null &&
    hasVisibleCraftingUi;
  const isPendingCraftStart = isCraftStartPendingActive();
  const hasCraftResultUi = detectCraftResultUi();
  const shouldShow =
    currentSettings.panelVisible &&
    !hasCraftResultUi &&
    (hasLiveCraftState ||
      (isPendingCraftStart && hasVisibleCraftingUi) ||
      (isCalculating && hasConfirmedCraftSession && hasVisibleCraftingUi));

  if (!reactRoot || !shouldShow) {
    if (reactRoot && overlayContainer) {
      overlayContainer.style.display = 'none';
    }
    isOverlayVisible = false;
    return;
  }

  overlayContainer!.style.display = 'block';
  isOverlayVisible = true;
  applyOverlayContainerLayout();

  const handleSettingsChange = (newSettings: CraftBuddySettings) => {
    currentSettings = newSettings;
    autoCraftController.setPolicy(newSettings.preferredAutoModePolicy);
    if (!newSettings.panelVisible && autoCraftUiState.armed) {
      stopAutoCraft('Auto mode stopped because the panel was hidden.');
    }
    applyOverlayContainerLayout();
    renderOverlay();
  };

  const handleSearchSettingsChange = (newSettings: CraftBuddySettings) => {
    // Update settings and re-render to reflect stale state
    currentSettings = newSettings;
    applyOverlayContainerLayout();
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
    onRecommendationAction: executeDisplayedRecommendation,
    autoMode: autoCraftUiState,
    onAutoModeArm: armAutoCraft,
    onAutoModeStop: stopAutoCraft,
    onAutoModePolicyChange: (policy: AutoCraftPolicy) => {
      setAutoCraftPolicy(policy);
      syncAutoCraftController();
      renderOverlay();
    },
    version: MOD_METADATA.version,
  });

  // Wrap panel with ThemeProvider for styled components
  const themedPanel = React.createElement(CraftBuddyThemeProvider, null, panel);
  const root = reactRoot;

  if (!root) {
    return;
  }

  renderReactRoot(root, themedPanel, { sync });
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
 * Only actually shows if there's active crafting data; otherwise defers to renderOverlay's logic.
 */
function showOverlay({ sync = false }: { sync?: boolean } = {}): void {
  // Let renderOverlay decide whether to actually show based on crafting state.
  // This prevents briefly flashing the overlay when there's no crafting data.
  renderOverlay({ sync });
}

/**
 * Clear state that should only exist during an active crafting session.
 */
function clearActiveCraftingRuntimeState(): void {
  recommendationSearchEpoch++;
  lastEntity = null;
  lastProgressState = null;
  lastKnownCraftingTechniques = undefined;
  currentRecommendation = null;
  currentConfig = null;
  currentCondition = undefined;
  nextConditions = [];
  isCalculating = false;
  clearCraftStartPending();
  currentStep = 0;
  conditionEffectsCache = null;
  missingVisibleCraftingUiPolls = 0;
  wasVisibleCraftingUiLastPoll = false;
  hasConfirmedCraftSession = false;
  resetOptimizerReplaySnapshots();
  autoCraftController.reset();
  autoCraftUiState = autoCraftController.getUiState();
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

function handleCraftResultUiDetected(source: 'polling' | 'redux'): void {
  wasVisibleCraftingUiLastPoll = false;

  if (
    !wasCraftingActive &&
    !hasConfirmedCraftSession &&
    !isOverlayVisible &&
    !isCraftStartPendingActive()
  ) {
    return;
  }

  wasCraftingActive = false;
  debugLog(
    `[CraftBuddy] Craft result screen detected via ${source}, clearing active state`,
  );
  handleCraftingEnded();
}

/**
 * Try to find the Redux store from the window object or React fiber tree.
 * The game uses React 19 with a different fiber structure.
 */
function findReduxStore(): any {
  const win = window as any;

  const modApiStateStore = getModApiStateStore();
  if (modApiStateStore) return modApiStateStore;

  // Check common locations for Redux store
  if (win.store) return win.store;
  if (win.__REDUX_STORE__) return win.__REDUX_STORE__;
  if (win.reduxStore) return win.reduxStore;
  if (win.__store__) return win.__store__;

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
let modApiStateStoreAdapter: ReturnType<typeof createModApiStateStore> = null;
let unsubscribeFromReduxStore: (() => void) | null = null;
let reduxStoreReconnectChecks = 0;
const REDUX_STORE_RECHECK_INTERVAL_POLLS = 4;

function isReduxStoreLike(store: any): store is {
  getState: () => any;
  subscribe: (listener: () => void) => () => void;
} {
  return (
    !!store &&
    typeof store.getState === 'function' &&
    typeof store.subscribe === 'function'
  );
}

function getModApiStateStore(): ReturnType<typeof createModApiStateStore> {
  const existingSnapshot = modApiStateStoreAdapter?.getState?.();
  if (existingSnapshot) {
    return modApiStateStoreAdapter;
  }

  modApiStateStoreAdapter = createModApiStateStore((window as any)?.modAPI);
  return modApiStateStoreAdapter;
}

function getCurrentRootState(): any | null {
  if (!isReduxStoreLike(cachedStore)) {
    return null;
  }

  try {
    return cachedStore.getState();
  } catch {
    return null;
  }
}

function detectActiveCraftingUi(
  rootState: any = getCurrentRootState(),
): boolean {
  return detectVisibleCraftingUi() || hasStateBackedCraftingUi(rootState);
}

function disconnectReduxStoreSubscription(): void {
  if (!unsubscribeFromReduxStore) return;
  try {
    unsubscribeFromReduxStore();
  } catch (error) {
    console.warn('[CraftBuddy] Failed to unsubscribe from Redux store:', error);
  } finally {
    unsubscribeFromReduxStore = null;
  }
}

function processCraftingStateFromStore(store: any): void {
  if (!isReduxStoreLike(store)) return;
  try {
    const state = store.getState();
    if (detectCraftResultUi()) {
      handleCraftResultUiDetected('redux');
      return;
    }

    const craftingState = extractActiveCraftingState(state);
    if (!craftingState) {
      processCraftingState(craftingState);
      return;
    }

    const hasVisibleCraftingUi = detectActiveCraftingUi(state);
    if (hasVisibleCraftingUi) {
      hasConfirmedCraftSession = true;
    }

    if (
      !shouldAcceptReduxCraftingState({
        hasCraftingState: true,
        hasVisibleCraftingUi,
        hasConfirmedCraftSession,
        isCraftStartPending: isCraftStartPendingActive(),
        missingVisibleCraftingUiPolls,
        hiddenUiGracePolls: MISSING_VISIBLE_CRAFTING_UI_POLLS_BEFORE_END,
      })
    ) {
      return;
    }

    processCraftingState(craftingState);
  } catch (error) {
    console.warn(
      '[CraftBuddy] Failed to read crafting state from store:',
      error,
    );
  }
}

function connectReduxStore(store: any): void {
  if (!isReduxStoreLike(store)) return;
  if (cachedStore === store && unsubscribeFromReduxStore) {
    return;
  }

  disconnectReduxStoreSubscription();
  cachedStore = store;

  try {
    unsubscribeFromReduxStore = store.subscribe(() => {
      processCraftingStateFromStore(store);
    });
    debugLog('[CraftBuddy] Connected to Redux store for crafting updates');
    processCraftingStateFromStore(store);
  } catch (error) {
    console.warn('[CraftBuddy] Failed to subscribe to Redux store:', error);
    disconnectReduxStoreSubscription();
    cachedStore = null;
  }
}

function refreshReduxStoreConnection(force: boolean = false): void {
  reduxStoreReconnectChecks++;
  const shouldCheck =
    force ||
    !cachedStore ||
    reduxStoreReconnectChecks % REDUX_STORE_RECHECK_INTERVAL_POLLS === 0;
  if (!shouldCheck) {
    return;
  }

  if (cachedStore && !isReduxStoreLike(cachedStore)) {
    cachedStore = null;
    disconnectReduxStoreSubscription();
  }

  const discoveredStore = findReduxStore();
  if (!isReduxStoreLike(discoveredStore)) {
    if (!cachedStore) {
      disconnectReduxStoreSubscription();
    }
    return;
  }

  if (discoveredStore !== cachedStore) {
    if (cachedStore) {
      debugLog('[CraftBuddy] Redux store reference changed, reconnecting');
    }
    connectReduxStore(discoveredStore);
    return;
  }

  if (!unsubscribeFromReduxStore) {
    connectReduxStore(discoveredStore);
  }
}

function getGameRootElement(): ParentNode {
  return (
    document.getElementById('root') ||
    document.getElementById('app') ||
    document.body
  );
}

function isElementInCraftBuddyOverlay(element: Element | null): boolean {
  return !!element?.closest('#craftbuddy-overlay');
}

function isElementVisible(element: Element): boolean {
  const htmlElement = element as HTMLElement;
  const style = window.getComputedStyle(htmlElement);
  return isRenderableOnscreenElement({
    isConnected: htmlElement.isConnected,
    isHidden: htmlElement.hidden || !!htmlElement.closest('[hidden]'),
    isAriaHidden:
      htmlElement.getAttribute('aria-hidden') === 'true' ||
      !!htmlElement.closest('[aria-hidden="true"]'),
    display: style.display,
    visibility: style.visibility,
    opacity: style.opacity,
    clientRects: Array.from(htmlElement.getClientRects()).map((rect) => ({
      top: rect.top,
      left: rect.left,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
    })),
    viewportWidth:
      window.innerWidth || document.documentElement.clientWidth || 0,
    viewportHeight:
      window.innerHeight || document.documentElement.clientHeight || 0,
  });
}

function getElementRectSnapshot(element: Element): OverlayRectLike | null {
  const rect = element.getBoundingClientRect();
  if (!(rect.width > 0) || !(rect.height > 0)) {
    return null;
  }

  return {
    top: rect.top,
    left: rect.left,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height,
  };
}

function pickCraftingHudAnchorRect(
  element: Element,
  viewportWidth: number,
  viewportHeight: number,
): OverlayRectLike | null {
  const elementRect = getElementRectSnapshot(element);
  if (!elementRect) {
    return null;
  }

  let current: Element | null = element;
  let best: OverlayRectLike | null = null;
  let bestArea = 0;

  for (
    let depth = 0;
    current && depth < MAX_HUD_RECT_PARENT_DEPTH;
    depth++, current = current.parentElement
  ) {
    if (isElementInCraftBuddyOverlay(current) || !isElementVisible(current)) {
      continue;
    }

    const rect = getElementRectSnapshot(current);
    if (!rect) {
      continue;
    }

    if (
      rect.width > viewportWidth * MAX_HUD_RECT_VIEWPORT_WIDTH_RATIO ||
      rect.height > viewportHeight * MAX_HUD_RECT_VIEWPORT_HEIGHT_RATIO
    ) {
      continue;
    }

    if (!isOverlayParentRectUsable({ elementRect, candidateRect: rect })) {
      continue;
    }

    const area = rect.width * rect.height;
    if (area > bestArea) {
      best = rect;
      bestArea = area;
    }
  }

  return best ?? elementRect;
}

function findVisibleCraftingProgressElement(
  gameRoot: ParentNode,
  selector: string,
  fallbackPattern: RegExp,
): Element | undefined {
  const pickSmallestVisible = (elements: Element[]): Element | undefined => {
    return elements
      .filter((el) => !isElementInCraftBuddyOverlay(el) && isElementVisible(el))
      .map((el) => ({
        element: el,
        rect: getElementRectSnapshot(el),
      }))
      .filter(
        (
          candidate,
        ): candidate is {
          element: Element;
          rect: OverlayRectLike;
        } => candidate.rect !== null,
      )
      .sort((a, b) => {
        const areaA = a.rect.width * a.rect.height;
        const areaB = b.rect.width * b.rect.height;
        return areaA - areaB;
      })[0]?.element;
  };

  const selectorMatch = pickSmallestVisible(
    Array.from(gameRoot.querySelectorAll(selector)),
  );
  if (selectorMatch) {
    return selectorMatch;
  }

  return pickSmallestVisible(
    Array.from(gameRoot.querySelectorAll('*')).filter(
      (el) =>
        fallbackPattern.test(el.textContent || '') && el.children.length < 5,
    ),
  );
}

function extractCraftingProgressPair(
  element: Element | undefined,
): { current: number; target: number } | undefined {
  if (!element) {
    return undefined;
  }

  const candidates = [
    (element as HTMLElement).innerText,
    element.textContent,
    element.getAttribute('aria-label'),
    element.parentElement?.textContent,
  ];

  for (const candidate of candidates) {
    const parsed = parseCraftingProgressPair(candidate || '');
    if (parsed) {
      return parsed;
    }
  }

  return undefined;
}

function getVisibleCraftingUiOccupiedRect(): OverlayRectLike | null {
  const gameRoot = getGameRootElement();
  const viewportWidth =
    window.innerWidth || document.documentElement.clientWidth || 0;
  const viewportHeight =
    window.innerHeight || document.documentElement.clientHeight || 0;
  if (!(viewportWidth > 0) || !(viewportHeight > 0)) {
    return null;
  }

  const progressElements = [
    findVisibleCraftingProgressElement(
      gameRoot,
      '[class*="stability"]',
      /Stability:/i,
    ),
    findVisibleCraftingProgressElement(
      gameRoot,
      '[class*="completion"]',
      /Completion:/i,
    ),
    findVisibleCraftingProgressElement(
      gameRoot,
      '[class*="perfection"]',
      /Perfection:/i,
    ),
    findVisibleCraftingProgressElement(
      gameRoot,
      '[class*="pool"], [class*="qi"]',
      /(?:Qi|Pool):/i,
    ),
  ].filter((element): element is Element => !!element);

  const progressRects = progressElements
    .map((element) => getElementRectSnapshot(element))
    .map((rect) =>
      rect ? expandOverlayRect(rect, OVERLAY_OCCUPIED_RECT_PADDING) : null,
    );
  const progressRect = unionOverlayRects(progressRects);

  const supplementalRects = Array.from(
    gameRoot.querySelectorAll(
      'button, [role="button"], [class*="buff"], [class*="condition"]',
    ),
  )
    .filter(
      (element) =>
        !isElementInCraftBuddyOverlay(element) && isElementVisible(element),
    )
    .map((element) => getElementRectSnapshot(element))
    .filter((rect): rect is OverlayRectLike => {
      return (
        !!rect &&
        isRectInOverlayHudCluster({
          rect,
          progressRect,
          viewportWidth,
        })
      );
    })
    .map((rect) => expandOverlayRect(rect, OVERLAY_OCCUPIED_RECT_PADDING));

  return unionOverlayRects([...progressRects, ...supplementalRects]);
}

function applyOverlayContainerLayout(): void {
  if (!overlayContainer) {
    return;
  }

  const viewportWidth =
    window.innerWidth || document.documentElement.clientWidth || 0;
  const viewportHeight =
    window.innerHeight || document.documentElement.clientHeight || 0;
  const layout = computeOverlayLayout({
    viewportWidth,
    viewportHeight,
    occupiedRect: getVisibleCraftingUiOccupiedRect(),
    compact: currentSettings.compactMode,
  });

  Object.assign(overlayContainer.style, {
    top: `${layout.top}px`,
    right: `${layout.right}px`,
    width: `${Math.max(0, Math.round(layout.width))}px`,
    maxHeight: `${Math.max(0, Math.round(layout.maxHeight))}px`,
  });
}

function detectCraftResultUi(): boolean {
  const gameRoot = getGameRootElement() as HTMLElement;
  const visibleText = gameRoot.innerText?.toLowerCase() || '';
  const hasResultCue =
    visibleText.includes('craft success') ||
    visibleText.includes('perfect craft') ||
    visibleText.includes('craft result');

  if (!hasResultCue) {
    return false;
  }

  return Array.from(gameRoot.querySelectorAll('button, [role="button"]')).some(
    (element) => {
      if (isElementInCraftBuddyOverlay(element) || !isElementVisible(element)) {
        return false;
      }

      const label = (
        (element as HTMLElement).textContent ||
        (element as HTMLElement).getAttribute('aria-label') ||
        ''
      )
        .toLowerCase()
        .trim();

      return label === 'return' || label.includes('return');
    },
  );
}

/**
 * Detect whether the crafting minigame UI is currently visible on screen.
 */
function detectVisibleCraftingUi(): boolean {
  const gameRoot = getGameRootElement();

  const stabilityElement = findVisibleCraftingProgressElement(
    gameRoot,
    '[class*="stability"]',
    /Stability:/i,
  );
  const completionElement = findVisibleCraftingProgressElement(
    gameRoot,
    '[class*="completion"]',
    /Completion:/i,
  );
  const perfectionElement = findVisibleCraftingProgressElement(
    gameRoot,
    '[class*="perfection"]',
    /Perfection:/i,
  );
  const poolElement = findVisibleCraftingProgressElement(
    gameRoot,
    '[class*="pool"], [class*="qi"]',
    /(?:Qi|Pool):/i,
  );

  const interactiveElements = gameRoot.querySelectorAll(
    'button, [role="button"]',
  );
  let hasCraftingButtons = false;
  let visibleButtonCount = 0;

  interactiveElements.forEach((el) => {
    if (isElementInCraftBuddyOverlay(el) || !isElementVisible(el)) {
      return;
    }

    visibleButtonCount++;

    const htmlElement = el as HTMLElement;
    const text = (htmlElement.textContent || '').toLowerCase();
    const classNameRaw = htmlElement.className;
    const className =
      typeof classNameRaw === 'string' ? classNameRaw.toLowerCase() : '';
    const dataTestId = (
      htmlElement.getAttribute('data-testid') || ''
    ).toLowerCase();
    const ariaLabel = (
      htmlElement.getAttribute('aria-label') || ''
    ).toLowerCase();

    if (
      hasCraftingActionCue({
        text,
        className,
        dataTestId,
        ariaLabel,
      })
    ) {
      hasCraftingButtons = true;
    }
  });

  const visibleProgressSignalCount =
    Number(!!stabilityElement) +
    Number(!!completionElement) +
    Number(!!perfectionElement) +
    Number(!!poolElement);
  const domValues = parseCraftingValuesFromDOM();
  const hasDomProgressValues =
    !!domValues &&
    !!(
      domValues.targetCompletion ||
      domValues.targetPerfection ||
      domValues.targetStability
    );

  // Require live progress readouts alongside action controls so generic
  // location screens with "Crafting Hall" buttons do not look like an active
  // craft. The visible-button fallback remains for icon-only technique rows.
  return hasVisibleCraftingUiSignals({
    hasNamedCraftingActionCue: hasCraftingButtons,
    hasDomProgressValues,
    visibleProgressSignalCount,
    visibleButtonCount,
  });
}

/**
 * Try to extract crafting state from Redux store or DOM.
 */
function detectCraftingState(): {
  isActive: boolean;
  hasVisibleCraftingUi: boolean;
  entity?: CraftingEntity;
  progress?: ProgressState;
  recipe?: RecipeItem;
  recipeStats?: any;
  inventoryItems?: InventoryItemLike[];
  consumedPillsThisTurn?: number;
  trainingMode?: boolean;
} {
  if (!cachedStore) {
    refreshReduxStoreConnection(true);
  }

  // Method 1: Try to access Redux store - this is the best source
  if (isReduxStoreLike(cachedStore)) {
    try {
      const state = cachedStore.getState();
      const hasVisibleCraftingUi = detectActiveCraftingUi(state);
      const craftingState = extractActiveCraftingState(state);

      // Check if we have an active crafting session with player and progressState
      if (craftingState) {
        return {
          isActive: true,
          hasVisibleCraftingUi,
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
    } catch (e) {
      // Store access failed
      refreshReduxStoreConnection(true);
    }
  }

  const hasVisibleCraftingUi = detectActiveCraftingUi();
  return { isActive: hasVisibleCraftingUi, hasVisibleCraftingUi };
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
    const gameRoot = getGameRootElement();
    const completionPair = extractCraftingProgressPair(
      findVisibleCraftingProgressElement(
        gameRoot,
        '[class*="completion"]',
        /Completion:/i,
      ),
    );
    const perfectionPair = extractCraftingProgressPair(
      findVisibleCraftingProgressElement(
        gameRoot,
        '[class*="perfection"]',
        /Perfection:/i,
      ),
    );
    const stabilityPair = extractCraftingProgressPair(
      findVisibleCraftingProgressElement(
        gameRoot,
        '[class*="stability"]',
        /Stability:/i,
      ),
    );
    const poolPair = extractCraftingProgressPair(
      findVisibleCraftingProgressElement(
        gameRoot,
        '[class*="pool"], [class*="qi"]',
        /(?:Qi|Pool):/i,
      ),
    );

    if (completionPair || perfectionPair || stabilityPair) {
      return {
        completion: completionPair?.current ?? 0,
        perfection: perfectionPair?.current ?? 0,
        stability: stabilityPair?.current ?? 0,
        pool: poolPair?.current ?? 0,
        targetCompletion: completionPair?.target,
        targetPerfection: perfectionPair?.target,
        targetStability: stabilityPair?.target,
        maxPool: poolPair?.target,
      };
    }

    const allText = (gameRoot as HTMLElement).innerText || '';
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
  refreshReduxStoreConnection();

  if (detectCraftResultUi()) {
    handleCraftResultUiDetected('polling');
    return;
  }

  const {
    isActive,
    hasVisibleCraftingUi,
    entity,
    progress,
    recipe,
    recipeStats,
    inventoryItems,
    consumedPillsThisTurn,
    trainingMode,
  } = detectCraftingState();
  const enteredVisibleCraftingUi =
    hasVisibleCraftingUi && !wasVisibleCraftingUiLastPoll;

  // Only consider crafting truly active if we have actual entity/progress data from Redux.
  // DOM-based detection alone is not reliable (can false-positive on result screens).
  const hasCraftingData = !!(entity && progress);
  if (hasVisibleCraftingUi && hasCraftingData) {
    hasConfirmedCraftSession = true;
  }

  // The panel should not remain visible once crafting controls leave the
  // screen, even if we retain a short internal grace window for hidden Redux
  // state while transitions settle.
  if (!hasVisibleCraftingUi && isOverlayVisible) {
    hideOverlay();
  }

  if (hasCraftingData) {
    if (hasVisibleCraftingUi) {
      missingVisibleCraftingUiPolls = 0;
    } else {
      missingVisibleCraftingUiPolls++;
    }
  } else {
    missingVisibleCraftingUiPolls = 0;
  }

  const hasReliableCraftingActivity = hasReliableCraftingActivityState({
    hasCraftingData,
    hasVisibleCraftingUi,
    missingVisibleCraftingUiPolls,
    hiddenUiGracePolls: MISSING_VISIBLE_CRAFTING_UI_POLLS_BEFORE_END,
    hasConfirmedCraftSession,
  });
  const shouldInitializeFromPolling =
    hasReliableCraftingActivity && !!entity && !!progress && !lastEntity;
  const isPendingCraftStart = isCraftStartPendingActive();

  if (shouldInitializeFromPolling) {
    markCraftStartPending();
  }

  if (hasReliableCraftingActivity) {
    wasCraftingActive = true;
    if (
      currentSettings.panelVisible &&
      !isOverlayVisible &&
      (hasVisibleCraftingUi || shouldInitializeFromPolling)
    ) {
      debugLog('[CraftBuddy] Crafting detected, showing overlay');
      overlayForcedByActiveCraft = true;
      markCraftStartPending();
      showOverlay({ sync: true });
    }
  } else if (wasCraftingActive) {
    if (isPendingCraftStart) {
      wasVisibleCraftingUiLastPoll = hasVisibleCraftingUi;
      return;
    }
    wasCraftingActive = false;
    debugLog('[CraftBuddy] Crafting ended, clearing active state');
    handleCraftingEnded();
  }

  // If we have entity and progress from Redux, use them directly
  if (
    hasReliableCraftingActivity &&
    entity &&
    progress &&
    (hasVisibleCraftingUi || shouldInitializeFromPolling)
  ) {
    // CRITICAL: Update target values from recipeStats BEFORE updating recommendation
    // recipeStats contains the authoritative target values (completion, perfection, stability)
    if (recipeStats) {
      const completionTarget = parsePositiveGameNumber(recipeStats.completion);
      if (completionTarget !== undefined) {
        targetCompletion = completionTarget;
      }
      const perfectionTarget = parsePositiveGameNumber(recipeStats.perfection);
      if (perfectionTarget !== undefined) {
        targetPerfection = perfectionTarget;
      }
      const stabilityTarget = parsePositiveGameNumber(recipeStats.stability);
      if (stabilityTarget !== undefined) {
        targetStability = stabilityTarget;
      }
      updateProgressCapsFromRecipeStats(recipeStats as any);
      updateProgressCapsFromModApi(
        recipe,
        recipeStats as CraftingRecipeStats,
        entity.realm as string,
      );
      // Calculate current max stability from recipeStats.stability - progressState.stabilityPenalty
      const stabilityPenalty = (progress as any).stabilityPenalty || 0;
      const maxStabilityTarget = parsePositiveGameNumber(recipeStats.stability);
      if (maxStabilityTarget !== undefined) {
        currentMaxStability = maxStabilityTarget - stabilityPenalty;
      }
    }
    syncCraftingContextFromState(
      recipe as RecipeItem | undefined,
      recipeStats as CraftingRecipeStats | undefined,
      entity,
    );

    // Check if state changed
    const newCompletion = parseGameNumber(progress.completion, 0);
    const newPerfection = parseGameNumber(progress.perfection, 0);
    const newStability = parseGameNumber(progress.stability, 0);
    const newStep = parseGameNumber((progress as any)?.step, 0);
    const newPool = parseGameNumber((entity as any)?.stats?.pool, 0);
    const newToxicity = parseGameNumber(
      (progress as any)?.toxicity ?? (entity as any)?.stats?.toxicity,
      0,
    );
    const normalizedCondition = normalizeConditionKey(
      (progress as any)?.condition as string | undefined,
    );
    const rawNextConditions = Array.isArray((progress as any)?.nextConditions)
      ? ((progress as any).nextConditions as string[])
      : [];
    const normalizedQueue = normalizeNextConditionQueue(
      normalizedCondition,
      rawNextConditions,
      Number((progress as any)?.harmony ?? 0) || 0,
    );
    const queueChanged =
      normalizedQueue.length !== nextConditions.length ||
      normalizedQueue.some((entry, index) => entry !== nextConditions[index]);
    const previousPool = parseGameNumber((lastEntity as any)?.stats?.pool, 0);
    const currentCooldownSignature = serializeTechniqueCooldowns(
      entity?.techniques,
    );
    const previousCooldownSignature = serializeTechniqueCooldowns(
      lastEntity?.techniques,
    );
    const currentBuffSignature = serializeCraftingBuffs(entity?.buffs);
    const previousBuffSignature = serializeCraftingBuffs(lastEntity?.buffs);
    const currentInventorySignature = serializeQuickAccessInventory(
      ((entity as any)?.craftingQuickAccess || []) as (string | undefined)[],
      inventoryItems,
    );
    const previousInventorySignature = serializeQuickAccessInventory(
      ((lastEntity as any)?.craftingQuickAccess || []) as (
        | string
        | undefined
      )[],
      inventoryItems,
    );
    const maxStabilityTarget =
      parsePositiveGameNumber((recipeStats as any)?.stability) ??
      targetStability;
    const observedMaxStability = computeObservedMaxStability(
      progress,
      maxStabilityTarget,
      currentMaxStability,
    );

    if (
      newCompletion !== currentCompletion ||
      newPerfection !== currentPerfection ||
      newStability !== currentStability ||
      newStep !== currentStep ||
      normalizedCondition !== currentCondition ||
      queueChanged ||
      newPool !== previousPool ||
      newToxicity !== currentToxicity ||
      observedMaxStability !== currentMaxStability ||
      currentCooldownSignature !== previousCooldownSignature ||
      currentBuffSignature !== previousBuffSignature ||
      currentInventorySignature !== previousInventorySignature ||
      !lastEntity ||
      enteredVisibleCraftingUi
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
    wasVisibleCraftingUiLastPoll = hasVisibleCraftingUi;
    return;
  }

  // Fallback: If crafting is active but no Redux data, try to update values from DOM
  if (isActive && hasVisibleCraftingUi) {
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
        syncAutoCraftController();
      }
    }
  }

  wasVisibleCraftingUiLastPoll = hasVisibleCraftingUi;
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
        targetCompletion = pickPositiveGameNumber(
          [
            statsAny.completionTarget,
            statsAny.targetCompletion,
            statsAny.completion,
          ],
          100,
        );
        targetPerfection = pickPositiveGameNumber(
          [
            statsAny.perfectionTarget,
            statsAny.targetPerfection,
            statsAny.perfection,
          ],
          100,
        );
        targetStability = pickPositiveGameNumber(
          [
            statsAny.stabilityTarget,
            statsAny.targetStability,
            statsAny.stability,
          ],
          60,
        );
        updateProgressCapsFromRecipeStats(statsAny);
        updateProgressCapsFromModApi(
          recipe as RecipeItem | undefined,
          recipeStats as CraftingRecipeStats,
          (lastEntity?.realm as string | undefined) ||
            ((recipe as any)?.realm as string | undefined),
        );

        const conditionType = (recipeStats as any)?.conditionType;
        conditionEffectsCache = conditionType?.conditionEffects
          ? (conditionType as RecipeConditionEffect)
          : null;

        debugLog(
          `[CraftBuddy] Targets: completion=${targetCompletion}, perfection=${targetPerfection}, stability=${targetStability}, caps=${maxCompletionCap ?? 'n/a'}/${maxPerfectionCap ?? 'n/a'}`,
        );

        // Cache targets for mid-craft save recovery
        cacheTargets(recipe?.name);
      }

      syncCraftingContextFromState(
        recipe as RecipeItem | undefined,
        recipeStats as CraftingRecipeStats | undefined,
        lastEntity || undefined,
      );

      debugLog(
        `[CraftBuddy] Craft context: type=${currentCraftingType} (${integrationDiagnostics.lastCraftingTypeDetectionSource}), sublime=${isSublimeCraft} [${integrationDiagnostics.lastSublimeDetectionSignals.join(', ') || 'none'}], multiplier=${sublimeTargetMultiplier}`,
      );

      const hasVisibleCraftingUi = detectActiveCraftingUi();
      if (
        !shouldPrimeCraftSessionFromRecipeDifficultyHook({
          hasVisibleCraftingUi,
          hasConfirmedCraftSession,
        })
      ) {
        debugLog(
          '[CraftBuddy] Recipe difficulty hook fired before crafting UI was visible; cached targets without priming the overlay',
        );
        return recipeStats;
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
      // Set craftStartPending so the overlay stays visible while waiting for the
      // first recommendation, even if the Redux subscription hasn't delivered
      // entity/progress data yet.
      const wasVisibleBeforeCraft = isOverlayVisible;
      overlayForcedByActiveCraft = !wasVisibleBeforeCraft;
      wasCraftingActive = true;
      hasConfirmedCraftSession = true;
      markCraftStartPending();
      isOverlayVisible = false; // Reset so showOverlay will work
      debugLog('[CraftBuddy] Crafting starting, syncing panel visibility');
      if (currentSettings.panelVisible) {
        showOverlay({ sync: true });
      }

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
  getAutoCraftState: () => autoCraftUiState,
  getDiagnostics: () => ({ ...integrationDiagnostics }),
  getDiagnosticsSummary: () => buildIntegrationDiagnosticsSummary(),
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
    if (!currentSettings.panelVisible && autoCraftUiState.armed) {
      stopAutoCraft('Auto mode stopped because the panel was hidden.');
    }
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

  armAutoCraft: () => {
    armAutoCraft();
    renderOverlay();
    return autoCraftUiState;
  },

  stopAutoCraft: (reason?: string) => {
    stopAutoCraft(reason);
    renderOverlay();
    return autoCraftUiState;
  },

  setAutoCraftPolicy: (policy: AutoCraftPolicy) => {
    setAutoCraftPolicy(policy);
    syncAutoCraftController();
    renderOverlay();
    return currentSettings.preferredAutoModePolicy;
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

  getOptimizerReplaySnapshot: () => lastOptimizerReplaySnapshot,

  dumpOptimizerReplaySnapshot: () => {
    const prepared = getSerializableOptimizerReplaySnapshot();
    if (!prepared) {
      console.warn(
        '[CraftBuddy] No optimizer replay snapshot available yet. Run one recommendation first.',
      );
      showDebugToast(
        'No snapshot yet. Trigger a recommendation first.',
        'warn',
      );
      return null;
    }

    console.log('=== CRAFTBUDDY OPTIMIZER REPLAY SNAPSHOT ===');
    console.log(prepared.json);
    console.log('=== END OPTIMIZER REPLAY SNAPSHOT ===');
    showDebugToast('Optimizer snapshot bundle dumped to console.', 'info');
    return prepared.data;
  },

  copyOptimizerReplaySnapshot: async () => {
    const prepared = getSerializableOptimizerReplaySnapshot();
    if (!prepared) {
      console.warn(
        '[CraftBuddy] No optimizer replay snapshot available yet. Run one recommendation first.',
      );
      showDebugToast(
        'No snapshot yet. Trigger a recommendation first.',
        'warn',
      );
      return false;
    }

    const copied = await copyTextToClipboard(prepared.json);
    if (copied) {
      console.log(
        '[CraftBuddy] Optimizer replay snapshot bundle copied to clipboard.',
      );
      showDebugToast(
        'Optimizer snapshot bundle copied to clipboard.',
        'success',
      );
      return true;
    }

    console.warn(
      '[CraftBuddy] Clipboard copy failed. Use dumpOptimizerReplaySnapshot() or downloadOptimizerReplaySnapshot().',
    );
    showDebugToast('Clipboard copy failed. Use download export.', 'warn');
    return false;
  },

  downloadOptimizerReplaySnapshot: () => {
    const prepared = getSerializableOptimizerReplaySnapshot();
    if (!prepared) {
      console.warn(
        '[CraftBuddy] No optimizer replay snapshot available yet. Run one recommendation first.',
      );
      showDebugToast(
        'No snapshot yet. Trigger a recommendation first.',
        'warn',
      );
      return false;
    }

    const dateStamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `craftbuddy-optimizer-snapshot-${dateStamp}.json`;
    const downloaded = downloadTextFile(fileName, prepared.json);
    if (downloaded) {
      console.log(
        `[CraftBuddy] Optimizer replay snapshot bundle downloaded as ${fileName}`,
      );
      showDebugToast(`Snapshot bundle downloaded: ${fileName}`, 'success');
      return true;
    }

    console.warn(
      '[CraftBuddy] Failed to download optimizer replay snapshot bundle.',
    );
    showDebugToast('Snapshot bundle download failed.', 'error');
    return false;
  },

  exportOptimizerReplaySnapshot: async () => {
    const prepared = getSerializableOptimizerReplaySnapshot();
    if (!prepared) {
      console.warn(
        '[CraftBuddy] No optimizer replay snapshot available yet. Run one recommendation first.',
      );
      showDebugToast(
        'No snapshot yet. Trigger a recommendation first.',
        'warn',
      );
      return { copied: false, downloaded: false };
    }

    const copied = await copyTextToClipboard(prepared.json);
    if (copied) {
      console.log(
        '[CraftBuddy] Optimizer replay snapshot bundle copied to clipboard.',
      );
      showDebugToast(
        'Snapshot bundle copied to clipboard (Ctrl+Shift+Y).',
        'success',
      );
      return { copied: true, downloaded: false };
    }

    const dateStamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `craftbuddy-optimizer-snapshot-${dateStamp}.json`;
    const downloaded = downloadTextFile(fileName, prepared.json);
    if (downloaded) {
      console.log(
        `[CraftBuddy] Clipboard unavailable. Downloaded snapshot bundle as ${fileName}`,
      );
      showDebugToast(
        `Clipboard unavailable, downloaded snapshot bundle ${fileName}.`,
        'info',
        3200,
      );
      return { copied: false, downloaded: true };
    }

    console.warn(
      '[CraftBuddy] Failed to export optimizer replay snapshot (clipboard + download failed).',
    );
    showDebugToast(
      'Export failed (clipboard + download unavailable).',
      'error',
      3200,
    );
    return { copied: false, downloaded: false };
  },
};

/**
 * Register keyboard shortcuts.
 */
try {
  document.addEventListener('keydown', (event: KeyboardEvent) => {
    switch (getCraftBuddyHotkeyAction(event)) {
      case 'togglePanel':
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
      case 'toggleCompactMode':
        event.preventDefault();
        currentSettings = saveSettings({
          compactMode: !currentSettings.compactMode,
        });
        renderOverlay();
        debugLog(`[CraftBuddy] Compact mode: ${currentSettings.compactMode}`);
        break;
      case 'exportReplaySnapshot':
        event.preventDefault();
        void (window as any).craftBuddyDebug
          ?.exportOptimizerReplaySnapshot?.()
          ?.catch((error: unknown) => {
            console.warn(
              '[CraftBuddy] Failed to export optimizer replay snapshot:',
              error,
            );
            showDebugToast('Snapshot export failed.', 'error');
          });
        debugLog('[CraftBuddy] Exported optimizer snapshot (Ctrl+Shift+Y)');
        break;
      default:
        break;
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
      if (isCraftStartPendingActive()) {
        return;
      }
      wasCraftingActive = false;
      debugLog('[CraftBuddy] Redux reports crafting inactive, clearing state');
      handleCraftingEnded();
    }
    return;
  }
  wasCraftingActive = true;

  const progress = craftingState.progressState;
  const entity = craftingState.player;
  const recipe = craftingState.recipe as RecipeItem | undefined;

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
    const completionTarget = parsePositiveGameNumber(recipeStats.completion);
    if (completionTarget !== undefined) {
      targetCompletion = completionTarget;
      foundTargets = true;
    }
    const perfectionTarget = parsePositiveGameNumber(recipeStats.perfection);
    if (perfectionTarget !== undefined) {
      targetPerfection = perfectionTarget;
      foundTargets = true;
    }
    const stabilityTarget = parsePositiveGameNumber(recipeStats.stability);
    if (stabilityTarget !== undefined) {
      targetStability = stabilityTarget;
      foundTargets = true;
    }
    updateProgressCapsFromRecipeStats(recipeStats as any);
    updateProgressCapsFromModApi(
      recipe,
      recipeStats as CraftingRecipeStats,
      entity?.realm as string | undefined,
    );

    // Calculate current max stability from recipeStats.stability - progressState.stabilityPenalty
    // The game tracks stability decay via stabilityPenalty, not a separate maxStability field
    const stabilityPenalty = progress.stabilityPenalty || 0;
    if (stabilityTarget !== undefined) {
      currentMaxStability = stabilityTarget - stabilityPenalty;
      debugLog(
        `[CraftBuddy] Current max stability: ${currentMaxStability} (target: ${stabilityTarget}, penalty: ${stabilityPenalty})`,
      );
    }
  }

  // Source 2: recipe object (fallback)
  if (!foundTargets && craftingState.recipe) {
    const recipe = craftingState.recipe;
    // Try recipe.stats
    if (recipe.stats) {
      const completionTarget = parsePositiveGameNumber(recipe.stats.completion);
      if (completionTarget !== undefined) {
        targetCompletion = completionTarget;
        foundTargets = true;
      }
      const perfectionTarget = parsePositiveGameNumber(recipe.stats.perfection);
      if (perfectionTarget !== undefined) {
        targetPerfection = perfectionTarget;
        foundTargets = true;
      }
      const stabilityTarget = parsePositiveGameNumber(recipe.stats.stability);
      if (stabilityTarget !== undefined) {
        targetStability = stabilityTarget;
        foundTargets = true;
      }
    }
    // Try recipe.difficulty (note: this is usually just a string like 'hard', not an object)
    if (recipe.difficulty && typeof recipe.difficulty === 'object') {
      const completionTarget = parsePositiveGameNumber(
        recipe.difficulty.completion,
      );
      if (completionTarget !== undefined) {
        targetCompletion = completionTarget;
        foundTargets = true;
      }
      const perfectionTarget = parsePositiveGameNumber(
        recipe.difficulty.perfection,
      );
      if (perfectionTarget !== undefined) {
        targetPerfection = perfectionTarget;
        foundTargets = true;
      }
      const stabilityTarget = parsePositiveGameNumber(
        recipe.difficulty.stability,
      );
      if (stabilityTarget !== undefined) {
        targetStability = stabilityTarget;
        foundTargets = true;
      }
    }
    // Try direct properties on recipe
    const completionTarget = parsePositiveGameNumber(recipe.completion);
    if (completionTarget !== undefined) {
      targetCompletion = completionTarget;
      foundTargets = true;
    }
    const perfectionTarget = parsePositiveGameNumber(recipe.perfection);
    if (perfectionTarget !== undefined) {
      targetPerfection = perfectionTarget;
      foundTargets = true;
    }
    const stabilityTarget = parsePositiveGameNumber(recipe.stability);
    if (stabilityTarget !== undefined) {
      targetStability = stabilityTarget;
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

  syncCraftingContextFromState(
    recipe,
    recipeStats as CraftingRecipeStats | undefined,
    entity as CraftingEntity,
  );

  // Check if state changed OR if we haven't initialized yet (lastEntity is null)
  const normalizedCondition = normalizeConditionKey(
    (progress as any)?.condition as string | undefined,
  );
  const rawNextConditions = Array.isArray((progress as any)?.nextConditions)
    ? ((progress as any).nextConditions as string[])
    : [];
  const normalizedQueue = normalizeNextConditionQueue(
    normalizedCondition,
    rawNextConditions,
    Number((progress as any)?.harmony ?? 0) || 0,
  );
  const queueChanged =
    normalizedQueue.length !== nextConditions.length ||
    normalizedQueue.some((entry, index) => entry !== nextConditions[index]);
  const progressStep = parseGameNumber((progress as any)?.step, 0);
  const progressPool = parseGameNumber((entity as any)?.stats?.pool, 0);
  const previousPool = parseGameNumber((lastEntity as any)?.stats?.pool, 0);
  const currentBuffSignature = serializeCraftingBuffs(
    (entity as CraftingEntity | null | undefined)?.buffs,
  );
  const previousBuffSignature = serializeCraftingBuffs(lastEntity?.buffs);
  const inventoryItems = cachedStore?.getState?.()?.inventory?.items as
    | InventoryItemLike[]
    | undefined;
  const currentInventorySignature = serializeQuickAccessInventory(
    ((entity as any)?.craftingQuickAccess || []) as (string | undefined)[],
    inventoryItems,
  );
  const previousInventorySignature = serializeQuickAccessInventory(
    ((lastEntity as any)?.craftingQuickAccess || []) as (string | undefined)[],
    inventoryItems,
  );
  const currentCooldownSignature = serializeTechniqueCooldowns(
    entity?.techniques,
  );
  const previousCooldownSignature = serializeTechniqueCooldowns(
    lastEntity?.techniques,
  );
  const progressToxicity = parseGameNumber(
    (progress as any)?.toxicity ?? (entity as any)?.stats?.toxicity,
    0,
  );
  const maxStabilityTarget =
    parsePositiveGameNumber((recipeStats as any)?.stability) ?? targetStability;
  const observedMaxStability = computeObservedMaxStability(
    progress,
    maxStabilityTarget,
    currentMaxStability,
  );
  const stateChanged =
    parseGameNumber(progress.completion, 0) !== currentCompletion ||
    parseGameNumber(progress.perfection, 0) !== currentPerfection ||
    parseGameNumber(progress.stability, 0) !== currentStability ||
    progressStep !== currentStep ||
    normalizedCondition !== currentCondition ||
    queueChanged ||
    progressPool !== previousPool ||
    observedMaxStability !== currentMaxStability ||
    currentCooldownSignature !== previousCooldownSignature ||
    currentBuffSignature !== previousBuffSignature ||
    currentInventorySignature !== previousInventorySignature ||
    progressToxicity !== currentToxicity;
  const needsInitialization = !lastEntity || !lastProgressState;

  if (stateChanged || needsInitialization) {
    debugLog(
      `[CraftBuddy] Redux update: Completion=${progress.completion}, Perfection=${progress.perfection}, Stability=${progress.stability}${needsInitialization ? ' (initial load)' : ''}`,
    );

    // Only bootstrap the loading shell from hidden Redux state when a craft
    // start is already pending. This prevents stale persisted crafting slices
    // from resurfacing the panel off-screen.
    const isCraftingUiVisible = detectActiveCraftingUi();
    if (
      currentSettings.panelVisible &&
      !isOverlayVisible &&
      (isCraftingUiVisible ||
        (needsInitialization && isCraftStartPendingActive()))
    ) {
      overlayForcedByActiveCraft = true;
      markCraftStartPending();
      showOverlay({ sync: true });
    }

    updateRecommendation(
      entity,
      progress,
      inventoryItems,
      Number(craftingState?.consumedPills ?? 0) || 0,
      !!craftingState?.trainingMode,
      recipeStats as CraftingRecipeStats | undefined,
      recipe,
    );
  }
}

// Subscribe to Redux store for state changes.
// Do an immediate attempt plus a delayed retry for runtimes where the store
// is attached after the initial module bootstrap tick.
refreshReduxStoreConnection(true);
setTimeout(() => {
  refreshReduxStoreConnection(true);
}, 1000);

console.log('[CraftBuddy] Mod loaded successfully!');
debugLog(
  '[CraftBuddy] Debug: window.craftBuddyDebug.testWithMockData() to test the panel',
);
debugLog(
  '[CraftBuddy] Debug: window.craftBuddyDebug.showPanel() to show panel manually',
);
