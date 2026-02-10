import {
  DEFAULT_SETTINGS,
  getSearchConfig,
  resetSettings,
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

  it('keeps default time budget at 175ms', () => {
    expect(DEFAULT_SETTINGS.searchTimeBudgetMs).toBe(175);
    expect(getSearchConfig().timeBudgetMs).toBe(175);
  });

  it('clamps search time budget to 10-10000ms', () => {
    setSearchTimeBudget(20000);
    expect(getSearchConfig().timeBudgetMs).toBe(10000);

    setSearchTimeBudget(1);
    expect(getSearchConfig().timeBudgetMs).toBe(10);
  });
});
