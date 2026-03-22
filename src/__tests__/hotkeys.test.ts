import { getCraftBuddyHotkeyAction } from '../modContent/hotkeys';

describe('CraftBuddy hotkeys', () => {
  it('matches shortcuts from physical key codes so non-Latin layouts still work', () => {
    expect(
      getCraftBuddyHotkeyAction({
        ctrlKey: true,
        shiftKey: true,
        code: 'KeyC',
        key: 'с',
      } as KeyboardEvent),
    ).toBe('togglePanel');

    expect(
      getCraftBuddyHotkeyAction({
        ctrlKey: true,
        shiftKey: true,
        code: 'KeyM',
        key: 'ь',
      } as KeyboardEvent),
    ).toBe('toggleCompactMode');
  });

  it('falls back to the reported key when code is unavailable', () => {
    expect(
      getCraftBuddyHotkeyAction({
        ctrlKey: true,
        shiftKey: true,
        code: '',
        key: 'y',
      } as KeyboardEvent),
    ).toBe('exportReplaySnapshot');
  });

  it('ignores events without the full modifier chord', () => {
    expect(
      getCraftBuddyHotkeyAction({
        ctrlKey: true,
        shiftKey: false,
        code: 'KeyC',
        key: 'c',
      } as KeyboardEvent),
    ).toBeNull();
  });
});
