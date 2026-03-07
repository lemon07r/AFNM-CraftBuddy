/**
 * CraftBuddy - Settings Module
 *
 * Manages user-configurable settings for the optimizer.
 * Settings are persisted to localStorage.
 */

export interface CraftBuddySettings {
  /** Lookahead search depth (1-96, default: 64) */
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
  /** Maximum time budget for search in milliseconds (100-10000, default: 4500) */
  searchTimeBudgetMs: number;
  /** Maximum nodes to explore before stopping (1000-5000000, default: 2000000) */
  searchMaxNodes: number;
  /** Beam width - max branches to explore at each level (3-20, default: 8) */
  searchBeamWidth: number;
}

const STORAGE_KEY = 'craftbuddy_settings';
const SEARCH_DEFAULTS_RESET_VERSION_KEY =
  'craftbuddy_search_defaults_reset_version';
const SEARCH_DEFAULTS_RESET_VERSION = '2';

export const DEFAULT_SEARCH_SETTINGS: Pick<
  CraftBuddySettings,
  | 'lookaheadDepth'
  | 'searchTimeBudgetMs'
  | 'searchMaxNodes'
  | 'searchBeamWidth'
> = {
  lookaheadDepth: 64,
  searchTimeBudgetMs: 4500,
  searchMaxNodes: 2000000,
  // Replay regression showed beam 8 can strand long forge turns on a
  // shallow partial frontier; beam 5 reaches a deeper, safer frontier.
  searchBeamWidth: 5,
};

const DEFAULT_SETTINGS: CraftBuddySettings = {
  // Balanced default profile tuned from replay benchmarks.
  // Keep beam conservative until the budget can support wider search.
  ...DEFAULT_SEARCH_SETTINGS,
  compactMode: false,
  panelVisible: true,
  maxAlternatives: 2,
  maxRotationDisplay: 5,
  showForecastedConditions: true,
  showExpectedFinalState: true,
  showOptimalRotation: true,
};

let currentSettings: CraftBuddySettings = { ...DEFAULT_SETTINGS };

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
  value: number,
  min: number,
  max: number,
  fallback: number,
): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, Math.round(numeric)));
}

function normalizeSettings(settings: CraftBuddySettings): CraftBuddySettings {
  return {
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

/**
 * Load settings from localStorage
 */
export function loadSettings(): CraftBuddySettings {
  const storage = getStorage();
  try {
    const stored = storage?.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Merge with defaults to handle new settings added in updates
      currentSettings = normalizeSettings({ ...DEFAULT_SETTINGS, ...parsed });
    } else {
      currentSettings = { ...DEFAULT_SETTINGS };
    }

    const needsSearchReset =
      storage?.getItem(SEARCH_DEFAULTS_RESET_VERSION_KEY) !==
      SEARCH_DEFAULTS_RESET_VERSION;
    if (needsSearchReset) {
      currentSettings = applyDefaultSearchSettings(currentSettings);
      storage?.setItem(STORAGE_KEY, JSON.stringify(currentSettings));
      storage?.setItem(
        SEARCH_DEFAULTS_RESET_VERSION_KEY,
        SEARCH_DEFAULTS_RESET_VERSION,
      );
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
} {
  return {
    timeBudgetMs: currentSettings.searchTimeBudgetMs,
    maxNodes: currentSettings.searchMaxNodes,
    beamWidth: currentSettings.searchBeamWidth,
  };
}

// Initialize settings on module load
loadSettings();

// Export defaults for reference
export { DEFAULT_SETTINGS };
