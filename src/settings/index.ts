/**
 * CraftBuddy - Settings Module
 * 
 * Manages user-configurable settings for the optimizer.
 * Settings are persisted to localStorage.
 */

export interface CraftBuddySettings {
  /** Lookahead search depth (1-6, default: 3) */
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
}

const STORAGE_KEY = 'craftbuddy_settings';

const DEFAULT_SETTINGS: CraftBuddySettings = {
  lookaheadDepth: 3,
  compactMode: false,
  panelVisible: true,
  maxAlternatives: 2,
  maxRotationDisplay: 5,
  showForecastedConditions: true,
  showExpectedFinalState: true,
  showOptimalRotation: true,
};

let currentSettings: CraftBuddySettings = { ...DEFAULT_SETTINGS };

/**
 * Load settings from localStorage
 */
export function loadSettings(): CraftBuddySettings {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      // Merge with defaults to handle new settings added in updates
      currentSettings = { ...DEFAULT_SETTINGS, ...parsed };
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
export function saveSettings(settings: Partial<CraftBuddySettings>): CraftBuddySettings {
  currentSettings = { ...currentSettings, ...settings };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(currentSettings));
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
  try {
    localStorage.removeItem(STORAGE_KEY);
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
 * Set lookahead depth (clamped to 1-6)
 */
export function setLookaheadDepth(depth: number): number {
  currentSettings.lookaheadDepth = Math.max(1, Math.min(6, depth));
  saveSettings(currentSettings);
  return currentSettings.lookaheadDepth;
}

// Initialize settings on module load
loadSettings();

// Export defaults for reference
export { DEFAULT_SETTINGS };
