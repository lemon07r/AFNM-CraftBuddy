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

  it('keeps default time budget at 300ms', () => {
    expect(DEFAULT_SETTINGS.searchTimeBudgetMs).toBe(300);
    expect(getSearchConfig().timeBudgetMs).toBe(300);
  });

  it('clamps search time budget to 100-10000ms', () => {
    setSearchTimeBudget(20000);
    expect(getSearchConfig().timeBudgetMs).toBe(10000);

    setSearchTimeBudget(1);
    expect(getSearchConfig().timeBudgetMs).toBe(100);
  });

  it('clamps search max nodes to 1000-250000', () => {
    setSearchMaxNodes(500000);
    expect(getSearchConfig().maxNodes).toBe(250000);

    setSearchMaxNodes(100);
    expect(getSearchConfig().maxNodes).toBe(1000);
  });
});
