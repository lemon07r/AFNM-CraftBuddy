/**
 * Open state for the shared Help tooltip.
 *
 * Hover and keyboard focus open it transiently; a click or tap pins it so it
 * stays open until clicked again, dismissed, or blurred. Touch pointers never
 * produce a transient open, so a tap is always a single toggle.
 */
export type HelpTooltipState = 'closed' | 'transient' | 'pinned';

export type HelpTooltipEvent =
  | { type: 'pointerEnter'; pointerType: string }
  | { type: 'pointerLeave'; pointerType: string }
  | { type: 'focusVisible' }
  | { type: 'click' }
  | { type: 'dismiss' };

export function nextHelpTooltipState(
  state: HelpTooltipState,
  event: HelpTooltipEvent,
): HelpTooltipState {
  switch (event.type) {
    case 'pointerEnter':
      if (event.pointerType === 'touch') return state;
      return state === 'closed' ? 'transient' : state;
    case 'pointerLeave':
      if (event.pointerType === 'touch') return state;
      return state === 'transient' ? 'closed' : state;
    case 'focusVisible':
      return state === 'closed' ? 'transient' : state;
    case 'click':
      return state === 'pinned' ? 'closed' : 'pinned';
    case 'dismiss':
      return 'closed';
  }
}
