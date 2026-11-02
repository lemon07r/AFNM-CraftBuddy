/**
 * CraftBuddy - ModAPI provider resolution.
 *
 * Locates the optional helpers the ModAPI exposes (next-condition
 * resolver, completion-bonus buff name, technique-from-known resolver) and
 * records in `craftSession` which of them the current runtime
 * actually offered. Every lookup is defensive: a missing helper is normal and
 * simply means CraftBuddy falls back to its own model.
 *
 * `normalizeBuffKey` lives here because the ModAPI-supplied buff name has to be
 * canonicalised the same way the extraction seam canonicalises craft buffs.
 *
 * Extracted verbatim from `src/modContent/index.ts` during the 6.0.0 split.
 */

import type {
  CraftingTechnique,
  KnownCraftingTechnique,
} from 'afnm-types';
import { integrationDiagnostics } from './craftSession';

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
