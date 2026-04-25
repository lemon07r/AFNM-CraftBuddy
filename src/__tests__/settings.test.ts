import {
  DEFAULT_AUTO_CRAFT_POLICY,
  DEFAULT_OPTIMIZER_ENGINE,
  DEFAULT_SETTINGS,
  getSearchConfig,
  loadSettings,
  resetSettings,
  saveSettings,
  setSearchMaxNodes,
  setSearchTimeBudget,
} from '../settings';
import {
  SEARCH_GOAL_PRIORITY_BIAS_MAX,
  SEARCH_GOAL_PRIORITY_BIAS_MIN,
} from '../utils/searchGoalPriority';

describe('settings search budget', () => {
  const SEARCH_DEFAULTS_RESET_VERSION_KEY =
    'craftbuddy_search_defaults_reset_version';
  const DISPLAY_DEFAULTS_RESET_VERSION_KEY =
    'craftbuddy_display_defaults_reset_version';
  const DISPLAY_DEFAULTS_RESET_VERSION = '1';
  let warnSpy: jest.SpyInstance;
  let logSpy: jest.SpyInstance;
  let storageData: Record<string, string>;

  function createStorageMock(): Storage {
    return {
      getItem: (key: string) =>
        Object.prototype.hasOwnProperty.call(storageData, key)
          ? storageData[key]
          : null,
      setItem: (key: string, value: string) => {
        storageData[key] = String(value);
      },
      removeItem: (key: string) => {
        delete storageData[key];
      },
      clear: () => {
        storageData = {};
      },
      key: (index: number) => Object.keys(storageData)[index] ?? null,
      get length() {
        return Object.keys(storageData).length;
      },
    };
  }

  beforeEach(() => {
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
    storageData = {};
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: createStorageMock(),
    });
    resetSettings();
  });

  afterEach(() => {
    warnSpy.mockRestore();
    logSpy.mockRestore();
  });

  it('keeps balanced defaults for search budgets', () => {
    expect(DEFAULT_SETTINGS.lookaheadDepth).toBe(64);
    expect(DEFAULT_SETTINGS.searchTimeBudgetMs).toBe(4500);
    expect(DEFAULT_SETTINGS.searchMaxNodes).toBe(2000000);
    expect(DEFAULT_SETTINGS.searchBeamWidth).toBe(5);
    expect(DEFAULT_SETTINGS.searchGoalPriorityBias).toBe(0);
    expect(DEFAULT_SETTINGS.optimizerEngine).toBe(DEFAULT_OPTIMIZER_ENGINE);
    expect(DEFAULT_SETTINGS.maxAlternatives).toBe(1);
    expect(DEFAULT_SETTINGS.preferredAutoModePolicy).toBe(
      DEFAULT_AUTO_CRAFT_POLICY,
    );
    expect(getSearchConfig().timeBudgetMs).toBe(4500);
    expect(getSearchConfig().maxNodes).toBe(2000000);
    expect(getSearchConfig().beamWidth).toBe(5);
    expect(getSearchConfig().goalPriorityBias).toBe(0);
    expect(getSearchConfig().useMonteCarloTreeSearch).toBe(false);
  });

  it('defaults to legacy engine and enables native MCTS only for experimental engine', () => {
    expect(loadSettings().optimizerEngine).toBe('legacy');
    expect(getSearchConfig().useMonteCarloTreeSearch).toBe(false);

    const experimental = saveSettings({ optimizerEngine: 'experimental' });

    expect(experimental.optimizerEngine).toBe('experimental');
    expect(getSearchConfig().useMonteCarloTreeSearch).toBe(true);
  });

  it('normalizes unknown optimizer engine values back to legacy', () => {
    storageData['craftbuddy_settings'] = JSON.stringify({
      optimizerEngine: 'fast-native',
    });
    storageData[SEARCH_DEFAULTS_RESET_VERSION_KEY] = '2';
    storageData[DISPLAY_DEFAULTS_RESET_VERSION_KEY] =
      DISPLAY_DEFAULTS_RESET_VERSION;

    const migrated = loadSettings();

    expect(migrated.optimizerEngine).toBe('legacy');
    expect(getSearchConfig().useMonteCarloTreeSearch).toBe(false);
  });

  it('clamps search time budget to 100-10000ms', () => {
    setSearchTimeBudget(20000);
    expect(getSearchConfig().timeBudgetMs).toBe(10000);

    setSearchTimeBudget(1);
    expect(getSearchConfig().timeBudgetMs).toBe(100);
  });

  it('clamps search max nodes to 1000-5000000', () => {
    setSearchMaxNodes(10000000);
    expect(getSearchConfig().maxNodes).toBe(5000000);

    setSearchMaxNodes(100);
    expect(getSearchConfig().maxNodes).toBe(1000);
  });

  it('clamps goal priority bias to the supported range and step size', () => {
    const clampedHigh = saveSettings({ searchGoalPriorityBias: 170 });
    expect(clampedHigh.searchGoalPriorityBias).toBe(
      SEARCH_GOAL_PRIORITY_BIAS_MAX,
    );

    const clampedLow = saveSettings({ searchGoalPriorityBias: -170 });
    expect(clampedLow.searchGoalPriorityBias).toBe(
      SEARCH_GOAL_PRIORITY_BIAS_MIN,
    );

    const rounded = saveSettings({ searchGoalPriorityBias: 63 });
    expect(rounded.searchGoalPriorityBias).toBe(75);
  });

  it('resets stored search budgets to the balanced preset once while preserving display prefs', () => {
    saveSettings({
      compactMode: true,
      maxAlternatives: 1,
      lookaheadDepth: 32,
      searchTimeBudgetMs: 1000,
      searchMaxNodes: 400000,
      searchBeamWidth: 8,
      searchGoalPriorityBias: SEARCH_GOAL_PRIORITY_BIAS_MAX,
      optimizerEngine: 'experimental',
    });
    storageData[DISPLAY_DEFAULTS_RESET_VERSION_KEY] =
      DISPLAY_DEFAULTS_RESET_VERSION;

    const migrated = loadSettings();

    expect(migrated.lookaheadDepth).toBe(DEFAULT_SETTINGS.lookaheadDepth);
    expect(migrated.searchTimeBudgetMs).toBe(
      DEFAULT_SETTINGS.searchTimeBudgetMs,
    );
    expect(migrated.searchMaxNodes).toBe(DEFAULT_SETTINGS.searchMaxNodes);
    expect(migrated.searchBeamWidth).toBe(DEFAULT_SETTINGS.searchBeamWidth);
    expect(migrated.searchGoalPriorityBias).toBe(
      DEFAULT_SETTINGS.searchGoalPriorityBias,
    );
    expect(migrated.optimizerEngine).toBe(DEFAULT_SETTINGS.optimizerEngine);
    expect(migrated.compactMode).toBe(true);
    expect(migrated.maxAlternatives).toBe(1);

    saveSettings({
      lookaheadDepth: 96,
      searchTimeBudgetMs: 10000,
      searchMaxNodes: 5000000,
      searchBeamWidth: 12,
      searchGoalPriorityBias: SEARCH_GOAL_PRIORITY_BIAS_MAX,
      optimizerEngine: 'experimental',
    });

    const reloaded = loadSettings();
    expect(reloaded.lookaheadDepth).toBe(96);
    expect(reloaded.searchTimeBudgetMs).toBe(10000);
    expect(reloaded.searchMaxNodes).toBe(5000000);
    expect(reloaded.searchBeamWidth).toBe(12);
    expect(reloaded.searchGoalPriorityBias).toBe(SEARCH_GOAL_PRIORITY_BIAS_MAX);
    expect(reloaded.optimizerEngine).toBe('experimental');
  });

  it('migrates the legacy guaranteed-completion toggle to full completion bias', () => {
    storageData['craftbuddy_settings'] = JSON.stringify({
      prioritizeGuaranteedCompletion: true,
    });
    storageData[SEARCH_DEFAULTS_RESET_VERSION_KEY] = '2';
    storageData[DISPLAY_DEFAULTS_RESET_VERSION_KEY] =
      DISPLAY_DEFAULTS_RESET_VERSION;

    const migrated = loadSettings();

    expect(migrated.searchGoalPriorityBias).toBe(SEARCH_GOAL_PRIORITY_BIAS_MAX);
  });

  it('migrates stored max alternatives above 1 down to 1 once on load', () => {
    storageData['craftbuddy_settings'] = JSON.stringify({
      maxAlternatives: 4,
    });
    storageData[SEARCH_DEFAULTS_RESET_VERSION_KEY] = '2';

    const migrated = loadSettings();

    expect(migrated.maxAlternatives).toBe(1);
    expect(storageData[DISPLAY_DEFAULTS_RESET_VERSION_KEY]).toBe(
      DISPLAY_DEFAULTS_RESET_VERSION,
    );
    expect(JSON.parse(storageData['craftbuddy_settings']).maxAlternatives).toBe(
      1,
    );
  });

  it('allows max alternatives above 1 after the migration has run', () => {
    storageData['craftbuddy_settings'] = JSON.stringify({
      maxAlternatives: 4,
    });
    storageData[SEARCH_DEFAULTS_RESET_VERSION_KEY] = '2';

    expect(loadSettings().maxAlternatives).toBe(1);

    const updated = saveSettings({ maxAlternatives: 4 });
    expect(updated.maxAlternatives).toBe(4);

    const reloaded = loadSettings();
    expect(reloaded.maxAlternatives).toBe(4);
  });

  it('persists the preferred auto mode policy', () => {
    const saved = saveSettings({
      preferredAutoModePolicy: 'fullActionSpace',
    });

    expect(saved.preferredAutoModePolicy).toBe('fullActionSpace');

    const reloaded = loadSettings();
    expect(reloaded.preferredAutoModePolicy).toBe('fullActionSpace');
  });

  it('falls back to the default auto mode policy for invalid stored values', () => {
    storageData['craftbuddy_settings'] = JSON.stringify({
      preferredAutoModePolicy: 'everything_everywhere',
    });
    storageData[SEARCH_DEFAULTS_RESET_VERSION_KEY] = '2';
    storageData[DISPLAY_DEFAULTS_RESET_VERSION_KEY] =
      DISPLAY_DEFAULTS_RESET_VERSION;

    const loaded = loadSettings();

    expect(loaded.preferredAutoModePolicy).toBe(DEFAULT_AUTO_CRAFT_POLICY);
  });
});
