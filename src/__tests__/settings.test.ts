import {
  DEFAULT_SETTINGS,
  getSearchConfig,
  resetSettings,
  setSearchMaxNodes,
  setSearchTimeBudget,
} from '../settings';

describe('settings search budget', () => {
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    resetSettings();
  });

  afterEach(() => {
    warnSpy.mockRestore();
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
});
