import {
  DEFAULT_SETTINGS,
  getSearchConfig,
  loadSettings,
  resetSettings,
  saveSettings,
  setSearchMaxNodes,
  setSearchTimeBudget,
} from '../settings';

describe('settings search budget', () => {
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
    expect(DEFAULT_SETTINGS.searchBeamWidth).toBe(8);
    expect(getSearchConfig().timeBudgetMs).toBe(4500);
    expect(getSearchConfig().maxNodes).toBe(2000000);
    expect(getSearchConfig().beamWidth).toBe(8);
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

  it('resets stored search budgets to the balanced preset once while preserving display prefs', () => {
    saveSettings({
      compactMode: true,
      maxAlternatives: 4,
      lookaheadDepth: 32,
      searchTimeBudgetMs: 1000,
      searchMaxNodes: 400000,
      searchBeamWidth: 8,
    });

    const migrated = loadSettings();

    expect(migrated.lookaheadDepth).toBe(DEFAULT_SETTINGS.lookaheadDepth);
    expect(migrated.searchTimeBudgetMs).toBe(
      DEFAULT_SETTINGS.searchTimeBudgetMs,
    );
    expect(migrated.searchMaxNodes).toBe(DEFAULT_SETTINGS.searchMaxNodes);
    expect(migrated.searchBeamWidth).toBe(DEFAULT_SETTINGS.searchBeamWidth);
    expect(migrated.compactMode).toBe(true);
    expect(migrated.maxAlternatives).toBe(4);

    saveSettings({
      lookaheadDepth: 96,
      searchTimeBudgetMs: 10000,
      searchMaxNodes: 5000000,
      searchBeamWidth: 12,
    });

    const reloaded = loadSettings();
    expect(reloaded.lookaheadDepth).toBe(96);
    expect(reloaded.searchTimeBudgetMs).toBe(10000);
    expect(reloaded.searchMaxNodes).toBe(5000000);
    expect(reloaded.searchBeamWidth).toBe(12);
  });
});
