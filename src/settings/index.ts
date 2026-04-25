/**
 * CraftBuddy - Settings Module
 *
 * Manages user-configurable settings for the optimizer.
 * Settings are persisted to localStorage.
 */

import {
  clampSearchGoalPriorityBias,
  DEFAULT_SEARCH_GOAL_PRIORITY_BIAS,
  SEARCH_GOAL_PRIORITY_BIAS_MAX,
} from '../utils/searchGoalPriority';
import {
  DEFAULT_AUTO_CRAFT_POLICY,
  normalizeAutoCraftPolicy,
  type AutoCraftPolicy,
} from './autoCraft';

export interface CraftBuddySettings {
  /** Lookahead search depth (1-96, default: 48) */
  lookaheadDepth: number;
  /** Whether to show the panel in compact mode */
  compactMode: boolean;
  /** Whether the panel is visible */
  panelVisible: boolean;
  /** Maximum number of alternative skills to show */
  maxAlternatives: number;
  /** Maximum rotation length to display */
  maxRotationDisplay: number;
  /** Show forecasted conditions */
  showForecastedConditions: boolean;
  /** Show expected final state */
  showExpectedFinalState: boolean;
  /** Show optimal rotation */
  showOptimalRotation: boolean;

  // Performance settings for late-game optimization
  /** Maximum time budget for search in milliseconds (100-10000, default: 2000) */
  searchTimeBudgetMs: number;
  /** Maximum nodes to explore before stopping (1000-5000000, default: 1000000) */
  searchMaxNodes: number;
  /** Beam width - max branches to explore at each level (3-20, default: 5) */
  searchBeamWidth: number;
  /**
   * Completion/perfection search bias.
   * -100 = perfection priority, 0 = balanced, 100 = completion priority.
   */
  searchGoalPriorityBias: number;
  /** Optimizer engine mode. Legacy is the default; experimental enables native MCTS policy guidance. */
  optimizerEngine: OptimizerEngine;
  /** Preferred policy for per-craft automatic execution mode. */
  preferredAutoModePolicy: AutoCraftPolicy;
}

export type OptimizerEngine = 'legacy' | 'experimental';

export type SearchPresetId =
  | 'instant'
  | 'fast'
  | 'balanced'
  | 'high_accuracy'
  | 'max';

export type SearchPresetBudget = Pick<
  CraftBuddySettings,
  | 'lookaheadDepth'
  | 'searchTimeBudgetMs'
  | 'searchMaxNodes'
  | 'searchBeamWidth'
>;

export interface OptimizerEngineOption {
  id: OptimizerEngine;
  label: string;
  description: string;
  note: string;
}

export const DEFAULT_OPTIMIZER_ENGINE: OptimizerEngine = 'legacy';

export const OPTIMIZER_ENGINE_OPTIONS: OptimizerEngineOption[] = [
  {
    id: 'legacy',
    label: 'Legacy',
    description:
      'Uses the established TypeScript lookahead engine with deterministic EV scoring, beam ordering, and condition branching.',
    note: 'Default for v5. Stable and fully parity-tested.',
  },
  {
    id: 'experimental',
    label: 'Experimental',
    description:
      'Adds the Rust/WASM Monte Carlo Tree Search root policy prior for difficult late-game, sublime, and harmony-heavy crafts.',
    note: 'TypeScript remains authoritative; MCTS only breaks near-ties in root ordering.',
  },
];

const STORAGE_KEY = 'craftbuddy_settings';
const SEARCH_DEFAULTS_RESET_VERSION_KEY =
  'craftbuddy_search_defaults_reset_version';
const SEARCH_DEFAULTS_RESET_VERSION = '3';
const DISPLAY_DEFAULTS_RESET_VERSION_KEY =
  'craftbuddy_display_defaults_reset_version';
const DISPLAY_DEFAULTS_RESET_VERSION = '1';

export const LEGACY_SEARCH_PRESET_BUDGETS: Record<
  SearchPresetId,
  SearchPresetBudget
> = {
  instant: {
    lookaheadDepth: 32,
    searchTimeBudgetMs: 1000,
    searchMaxNodes: 400000,
    searchBeamWidth: 5,
  },
  fast: {
    lookaheadDepth: 48,
    searchTimeBudgetMs: 2000,
    searchMaxNodes: 1000000,
    searchBeamWidth: 5,
  },
  balanced: {
    lookaheadDepth: 64,
    searchTimeBudgetMs: 4500,
    searchMaxNodes: 2000000,
    searchBeamWidth: 5,
  },
  high_accuracy: {
    lookaheadDepth: 80,
    searchTimeBudgetMs: 8000,
    searchMaxNodes: 3500000,
    searchBeamWidth: 9,
  },
  max: {
    lookaheadDepth: 96,
    searchTimeBudgetMs: 10000,
    searchMaxNodes: 5000000,
    searchBeamWidth: 12,
  },
};

export const EXPERIMENTAL_SEARCH_PRESET_BUDGETS: Record<
  SearchPresetId,
  SearchPresetBudget
> = {
  instant: {
    lookaheadDepth: 32,
    searchTimeBudgetMs: 1250,
    searchMaxNodes: 400000,
    searchBeamWidth: 5,
  },
  fast: {
    lookaheadDepth: 32,
    searchTimeBudgetMs: 1500,
    searchMaxNodes: 500000,
    searchBeamWidth: 5,
  },
  balanced: {
    lookaheadDepth: 48,
    searchTimeBudgetMs: 2250,
    searchMaxNodes: 800000,
    searchBeamWidth: 5,
  },
  high_accuracy: {
    lookaheadDepth: 64,
    searchTimeBudgetMs: 3250,
    searchMaxNodes: 1300000,
    searchBeamWidth: 5,
  },
  max: {
    lookaheadDepth: 80,
    searchTimeBudgetMs: 4000,
    searchMaxNodes: 2000000,
    searchBeamWidth: 5,
  },
};

const EXPERIMENTAL_MCTS_ITERATIONS = 250;
const EXPERIMENTAL_MCTS_MAX_NODES = 5000;
const EXPERIMENTAL_MCTS_MIN_ROLLOUT_DEPTH = 8;
const EXPERIMENTAL_MCTS_MAX_ROLLOUT_DEPTH = 16;

export const DEFAULT_SEARCH_SETTINGS: Pick<
  CraftBuddySettings,
  | 'lookaheadDepth'
  | 'searchTimeBudgetMs'
  | 'searchMaxNodes'
  | 'searchBeamWidth'
  | 'searchGoalPriorityBias'
  | 'optimizerEngine'
> = {
  ...LEGACY_SEARCH_PRESET_BUDGETS.fast,
  searchGoalPriorityBias: DEFAULT_SEARCH_GOAL_PRIORITY_BIAS,
  optimizerEngine: DEFAULT_OPTIMIZER_ENGINE,
};

const DEFAULT_SETTINGS: CraftBuddySettings = {
  ...DEFAULT_SEARCH_SETTINGS,
  compactMode: false,
  panelVisible: true,
  maxAlternatives: 1,
  maxRotationDisplay: 5,
  showForecastedConditions: true,
  showExpectedFinalState: true,
  showOptimalRotation: true,
  preferredAutoModePolicy: DEFAULT_AUTO_CRAFT_POLICY,
};

let currentSettings: CraftBuddySettings = { ...DEFAULT_SETTINGS };

type StoredCraftBuddySettings = Partial<CraftBuddySettings> & {
  prioritizeGuaranteedCompletion?: unknown;
};

function getStorage(): Storage | null {
  if (typeof localStorage === 'undefined') {
    return null;
  }
  if (
    typeof localStorage.getItem !== 'function' ||
    typeof localStorage.setItem !== 'function' ||
    typeof localStorage.removeItem !== 'function'
  ) {
    return null;
  }
  return localStorage;
}

function clampInteger(
  value: number | undefined,
  min: number,
  max: number,
  fallback: number,
): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, Math.round(numeric)));
}

function normalizeSettings(
  settings: StoredCraftBuddySettings,
): CraftBuddySettings {
  const searchGoalPriorityBias =
    settings.searchGoalPriorityBias !== undefined
      ? clampSearchGoalPriorityBias(
          settings.searchGoalPriorityBias,
          DEFAULT_SETTINGS.searchGoalPriorityBias,
        )
      : settings.prioritizeGuaranteedCompletion === true
        ? SEARCH_GOAL_PRIORITY_BIAS_MAX
        : DEFAULT_SETTINGS.searchGoalPriorityBias;

  return {
    ...DEFAULT_SETTINGS,
    ...settings,
    lookaheadDepth: clampInteger(
      settings.lookaheadDepth,
      1,
      96,
      DEFAULT_SETTINGS.lookaheadDepth,
    ),
    searchTimeBudgetMs: clampInteger(
      settings.searchTimeBudgetMs,
      100,
      10000,
      DEFAULT_SETTINGS.searchTimeBudgetMs,
    ),
    searchMaxNodes: clampInteger(
      settings.searchMaxNodes,
      1000,
      5000000,
      DEFAULT_SETTINGS.searchMaxNodes,
    ),
    searchBeamWidth: clampInteger(
      settings.searchBeamWidth,
      3,
      20,
      DEFAULT_SETTINGS.searchBeamWidth,
    ),
    searchGoalPriorityBias,
    optimizerEngine:
      settings.optimizerEngine === 'experimental'
        ? 'experimental'
        : DEFAULT_SETTINGS.optimizerEngine,
    preferredAutoModePolicy: normalizeAutoCraftPolicy(
      settings.preferredAutoModePolicy,
      DEFAULT_SETTINGS.preferredAutoModePolicy,
    ),
    maxAlternatives: clampInteger(
      settings.maxAlternatives,
      0,
      5,
      DEFAULT_SETTINGS.maxAlternatives,
    ),
  };
}

function applyDefaultSearchSettings(
  settings: CraftBuddySettings,
): CraftBuddySettings {
  return normalizeSettings({
    ...settings,
    ...DEFAULT_SEARCH_SETTINGS,
  });
}

function applyDisplayDefaultsForV371(
  settings: CraftBuddySettings,
): CraftBuddySettings {
  return normalizeSettings({
    ...settings,
    maxAlternatives:
      settings.maxAlternatives > 1
        ? DEFAULT_SETTINGS.maxAlternatives
        : settings.maxAlternatives,
  });
}

/**
 * Load settings from localStorage
 */
export function loadSettings(): CraftBuddySettings {
  const storage = getStorage();
  try {
    const stored = storage?.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      currentSettings = normalizeSettings(parsed);
    } else {
      currentSettings = { ...DEFAULT_SETTINGS };
    }

    let settingsChanged = false;

    const needsSearchReset =
      storage?.getItem(SEARCH_DEFAULTS_RESET_VERSION_KEY) !==
      SEARCH_DEFAULTS_RESET_VERSION;
    if (needsSearchReset) {
      currentSettings = applyDefaultSearchSettings(currentSettings);
      settingsChanged = true;
      storage?.setItem(
        SEARCH_DEFAULTS_RESET_VERSION_KEY,
        SEARCH_DEFAULTS_RESET_VERSION,
      );
    }

    const needsDisplayReset =
      storage?.getItem(DISPLAY_DEFAULTS_RESET_VERSION_KEY) !==
      DISPLAY_DEFAULTS_RESET_VERSION;
    if (needsDisplayReset) {
      currentSettings = applyDisplayDefaultsForV371(currentSettings);
      settingsChanged = true;
      storage?.setItem(
        DISPLAY_DEFAULTS_RESET_VERSION_KEY,
        DISPLAY_DEFAULTS_RESET_VERSION,
      );
    }

    if (settingsChanged) {
      storage?.setItem(STORAGE_KEY, JSON.stringify(currentSettings));
    }
  } catch (e) {
    console.warn('[CraftBuddy] Failed to load settings:', e);
    currentSettings = { ...DEFAULT_SETTINGS };
  }
  return currentSettings;
}

/**
 * Save settings to localStorage
 */
export function saveSettings(
  settings: Partial<CraftBuddySettings>,
): CraftBuddySettings {
  currentSettings = normalizeSettings({ ...currentSettings, ...settings });
  const storage = getStorage();
  try {
    storage?.setItem(STORAGE_KEY, JSON.stringify(currentSettings));
    console.log('[CraftBuddy] Settings saved:', currentSettings);
  } catch (e) {
    console.warn('[CraftBuddy] Failed to save settings:', e);
  }
  return currentSettings;
}

/**
 * Get current settings
 */
export function getSettings(): CraftBuddySettings {
  return currentSettings;
}

/**
 * Reset settings to defaults
 */
export function resetSettings(): CraftBuddySettings {
  currentSettings = { ...DEFAULT_SETTINGS };
  const storage = getStorage();
  try {
    storage?.removeItem(STORAGE_KEY);
    storage?.removeItem(SEARCH_DEFAULTS_RESET_VERSION_KEY);
    storage?.removeItem(DISPLAY_DEFAULTS_RESET_VERSION_KEY);
  } catch (e) {
    // Ignore
  }
  return currentSettings;
}

/**
 * Toggle panel visibility
 */
export function togglePanelVisibility(): boolean {
  currentSettings.panelVisible = !currentSettings.panelVisible;
  saveSettings(currentSettings);
  return currentSettings.panelVisible;
}

/**
 * Toggle compact mode
 */
export function toggleCompactMode(): boolean {
  currentSettings.compactMode = !currentSettings.compactMode;
  saveSettings(currentSettings);
  return currentSettings.compactMode;
}

/**
 * Set lookahead depth (clamped to 1-96)
 */
export function setLookaheadDepth(depth: number): number {
  currentSettings.lookaheadDepth = Math.max(1, Math.min(96, depth));
  saveSettings(currentSettings);
  return currentSettings.lookaheadDepth;
}

/**
 * Set search time budget (clamped to 100-10000ms)
 */
export function setSearchTimeBudget(ms: number): number {
  currentSettings.searchTimeBudgetMs = Math.max(100, Math.min(10000, ms));
  saveSettings(currentSettings);
  return currentSettings.searchTimeBudgetMs;
}

/**
 * Set search max nodes (clamped to 1000-5000000)
 */
export function setSearchMaxNodes(nodes: number): number {
  currentSettings.searchMaxNodes = Math.max(1000, Math.min(5000000, nodes));
  saveSettings(currentSettings);
  return currentSettings.searchMaxNodes;
}

/**
 * Set search beam width (clamped to 3-20)
 */
export function setSearchBeamWidth(width: number): number {
  currentSettings.searchBeamWidth = Math.max(3, Math.min(20, width));
  saveSettings(currentSettings);
  return currentSettings.searchBeamWidth;
}

/**
 * Get search configuration for the optimizer
 */
export function getSearchConfig(): {
  timeBudgetMs: number;
  maxNodes: number;
  beamWidth: number;
  goalPriorityBias: number;
  useMonteCarloTreeSearch: boolean;
  mctsIterations?: number;
  mctsRolloutDepth?: number;
  mctsMaxNodes?: number;
} {
  const useMonteCarloTreeSearch =
    currentSettings.optimizerEngine === 'experimental';
  const mctsConfig = useMonteCarloTreeSearch
    ? {
        mctsIterations: EXPERIMENTAL_MCTS_ITERATIONS,
        mctsRolloutDepth: Math.max(
          EXPERIMENTAL_MCTS_MIN_ROLLOUT_DEPTH,
          Math.min(
            EXPERIMENTAL_MCTS_MAX_ROLLOUT_DEPTH,
            Math.round(currentSettings.lookaheadDepth / 4),
          ),
        ),
        mctsMaxNodes: EXPERIMENTAL_MCTS_MAX_NODES,
      }
    : {};

  return {
    timeBudgetMs: currentSettings.searchTimeBudgetMs,
    maxNodes: currentSettings.searchMaxNodes,
    beamWidth: currentSettings.searchBeamWidth,
    goalPriorityBias: currentSettings.searchGoalPriorityBias,
    useMonteCarloTreeSearch,
    ...mctsConfig,
  };
}

// Initialize settings on module load
loadSettings();

// Export defaults for reference
export { DEFAULT_SETTINGS };
export type { AutoCraftPolicy } from './autoCraft';
export {
  AUTO_CRAFT_POLICY_OPTIONS,
  DEFAULT_AUTO_CRAFT_POLICY,
} from './autoCraft';
