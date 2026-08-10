/**
 * CraftBuddy - ModAPI provider resolution.
 *
 * Locates the optional helpers the ModAPI exposes (next-condition
 * resolver, completion-bonus buff name, technique-from-known resolver, action
 * cost getter) and records in `craftSession` which of them the current runtime
 * actually offered. Every lookup is defensive: a missing helper is normal and
 * simply means CraftBuddy falls back to its own model.
 *
 * `normalizeBuffKey` lives here because the ModAPI-supplied buff name has to be
 * canonicalised the same way the extraction seam canonicalises craft buffs.
 *
 * Extracted verbatim from `src/modContent/index.ts` during the 6.0.0 split.
 */

import type {
  CraftingEntity,
  CraftingRecipeStats,
  CraftingTechnique,
  KnownCraftingTechnique,
  ProgressState,
} from 'afnm-types';
import { integrationDiagnostics } from './craftSession';
import { debugLog } from '../utils/debug';

export function normalizeBuffKey(name: string | undefined): string {
  return String(name || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_');
}

export function getPathValue(root: any, path: string[]): any {
  let current = root;
  for (const segment of path) {
    if (!current || typeof current !== 'object') {
      return undefined;
    }
    current = current[segment];
  }
  return current;
}

export function findFirstFunction(
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

export function getModApiNextConditionResolver():
  | ((progress: any, entity?: any) => any)
  | undefined {
  const modApi = (window as any)?.modAPI;
  return findFirstFunction(modApi, [
    ['utils', 'getNextCondition'],
    ['store', 'turnHandling', 'getNextCondition'],
    ['Store', 'turnHandling', 'getNextCondition'],
    ['crafting', 'getNextCondition'],
    ['getNextCondition'],
  ]) as ((progress: any, entity?: any) => any) | undefined;
}

export function getModApiCompletionBonusBuffKey(): string | undefined {
  const rawName = window.modAPI?.utils?.completionBonusBuffName;
  if (typeof rawName !== 'string' || rawName.trim().length === 0) {
    return undefined;
  }

  integrationDiagnostics.usingModApiCompletionBonusBuffName = true;
  return normalizeBuffKey(rawName);
}

export function getModApiTechniqueFromKnownResolver():
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

/**
 * Use native getActionCost to get the game's actual computed costs for a
 * technique. Returns undefined if the native API is unavailable or fails.
 * Only usable in the integration layer with live game state.
 */
export function getNativeActionCost(
  technique: CraftingTechnique,
  entity: CraftingEntity,
  recipeStats: CraftingRecipeStats | undefined,
  progressState: ProgressState | undefined,
): { poolCost: number; stabilityCost: number } | undefined {
  const modUtils = (window as any)?.modAPI?.utils;
  if (
    typeof modUtils?.getActionCost !== 'function' ||
    !recipeStats ||
    !progressState
  ) {
    return undefined;
  }

  integrationDiagnostics.nativeGetActionCostCalls++;
  try {
    const result = modUtils.getActionCost(
      technique,
      entity,
      recipeStats,
      progressState,
    );
    if (
      result &&
      typeof result.poolCost === 'number' &&
      typeof result.stabilityCost === 'number'
    ) {
      return {
        poolCost: Math.max(0, result.poolCost),
        stabilityCost: Math.max(0, result.stabilityCost),
      };
    }
  } catch (error) {
    integrationDiagnostics.nativeGetActionCostErrors++;
    debugLog(
      '[CraftBuddy] ModAPI getActionCost failed, using local costs:',
      error,
    );
  }

  return undefined;
}
