/**
 * CraftBuddy - Shared craft-session state.
 *
 * Holds the module-level state that more than one integration seam needs, so the
 * seams extracted out of `index.ts` can read and update it without importing
 * each other. Today that is the integration diagnostics counter block: craft
 * state extraction, the ModAPI providers and the debug overlay all record into
 * the same object, and the diagnostics summary reads it back.
 *
 * State that only one seam touches deliberately lives with that seam instead of
 * here; `index.ts` keeps the polling/craft-lifecycle state it alone owns.
 */

import type { HarmonyDataSource } from './harmonyState';
import type {
  CraftingTypeDetectionSource,
  SublimeDetectionSignal,
} from './craftingContext';

export type CompletionBonusSource = 'buff' | 'computed' | 'none';

export interface IntegrationDiagnostics {
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
  usingModApiGetActionCost: boolean;
  usingModApiEvaluateCraftingCondition: boolean;
  usingModApiGetActualCraftingStat: boolean;
  nativeGetActionCostCalls: number;
  nativeGetActionCostErrors: number;
  nativeCanUseActionCalls: number;
  nativeCanUseActionBlocked: number;
  nativeCanUseActionErrors: number;
  lastCraftingTypeDetectionSource: CraftingTypeDetectionSource;
  lastSublimeDetectionSignals: SublimeDetectionSignal[];
  lastHarmonyDataSource: HarmonyDataSource;
  harmonyDataFromProgressStateCount: number;
  harmonyDataFromNativeVariablesCount: number;
  harmonyDataFromBuffsCount: number;
  harmonyDataMissingCount: number;
  /** Worker-pool search backend: once-per-session blob probe outcome. */
  searchBackendProbe: 'unprobed' | 'passed' | 'failed';
  searchBackendProbeDetail: string;
  /** Searches completed by the worker pool this session. */
  searchBackendWorkerResultCount: number;
  /** Searches that fell back to the synchronous in-page engine. */
  searchBackendSyncFallbackCount: number;
}

export const integrationDiagnostics: IntegrationDiagnostics = {
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
  usingModApiGetActionCost: false,
  usingModApiEvaluateCraftingCondition: false,
  usingModApiGetActualCraftingStat: false,
  nativeGetActionCostCalls: 0,
  nativeGetActionCostErrors: 0,
  nativeCanUseActionCalls: 0,
  nativeCanUseActionBlocked: 0,
  nativeCanUseActionErrors: 0,
  lastCraftingTypeDetectionSource: 'unchanged',
  lastSublimeDetectionSignals: [],
  lastHarmonyDataSource: 'missing',
  harmonyDataFromProgressStateCount: 0,
  harmonyDataFromNativeVariablesCount: 0,
  harmonyDataFromBuffsCount: 0,
  harmonyDataMissingCount: 0,
  searchBackendProbe: 'unprobed',
  searchBackendProbeDetail: 'probe has not run yet',
  searchBackendWorkerResultCount: 0,
  searchBackendSyncFallbackCount: 0,
};
