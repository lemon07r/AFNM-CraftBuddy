import {
  getSettings,
  loadSettings,
  resetSettings,
  saveSettings,
  subscribeSettings,
  toggleCompactMode,
} from '../settings';

describe('shared settings subscription', () => {
  beforeEach(() => resetSettings());
  it('publishes one fresh snapshot per committed change, including compact hotkeys', () => {
    const listener = jest.fn();
    const unsubscribe = subscribeSettings(listener);
    const initial = getSettings();
    saveSettings({ compactMode: !initial.compactMode });
    expect(listener).toHaveBeenCalledTimes(1);
    const afterCommit = getSettings();
    expect(afterCommit).not.toBe(initial);
    toggleCompactMode();
    expect(listener).toHaveBeenCalledTimes(2);
    expect(getSettings()).not.toBe(afterCommit);
    expect(getSettings().compactMode).toBe(initial.compactMode);
    unsubscribe();
    saveSettings({ compactMode: true });
    expect(listener).toHaveBeenCalledTimes(2);
  });
  it('merges a later control edit into live settings, not an old panel copy', () => {
    saveSettings({ compactMode: true });
    saveSettings({ showForecastedConditions: false });
    expect(getSettings().compactMode).toBe(true);
    expect(getSettings().showForecastedConditions).toBe(false);
  });
  it('notifies subscribers about load and reset too', () => {
    const listener = jest.fn();
    const unsubscribe = subscribeSettings(listener);
    loadSettings();
    resetSettings();
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
  });
});
