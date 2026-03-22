export type CraftBuddyHotkeyAction =
  | 'togglePanel'
  | 'toggleCompactMode'
  | 'exportReplaySnapshot';

type CraftBuddyKeyboardEventLike = Pick<
  KeyboardEvent,
  'ctrlKey' | 'shiftKey' | 'code' | 'key'
>;

function resolveActionFromCode(
  code: string | undefined,
): CraftBuddyHotkeyAction | null {
  switch (code) {
    case 'KeyC':
      return 'togglePanel';
    case 'KeyM':
      return 'toggleCompactMode';
    case 'KeyY':
      return 'exportReplaySnapshot';
    default:
      return null;
  }
}

function resolveActionFromKey(
  key: string | undefined,
): CraftBuddyHotkeyAction | null {
  switch ((key || '').toLowerCase()) {
    case 'c':
      return 'togglePanel';
    case 'm':
      return 'toggleCompactMode';
    case 'y':
      return 'exportReplaySnapshot';
    default:
      return null;
  }
}

export function getCraftBuddyHotkeyAction(
  event: CraftBuddyKeyboardEventLike,
): CraftBuddyHotkeyAction | null {
  if (!event.ctrlKey || !event.shiftKey) {
    return null;
  }

  return resolveActionFromCode(event.code) ?? resolveActionFromKey(event.key);
}
