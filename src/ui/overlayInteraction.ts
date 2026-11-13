/**
 * Pointer hooks the panel attaches to its header and resize grip. The overlay
 * layout controller implements them; the panel only forwards events, so a
 * drag never re-renders React.
 */
export interface OverlayPointerEventLike {
  button: number;
  pointerId: number;
  pointerType: string;
  clientX: number;
  clientY: number;
  target: EventTarget | null;
  currentTarget: EventTarget | null;
  preventDefault(): void;
}

export interface OverlayMouseEventLike {
  button: number;
  target: EventTarget | null;
  currentTarget: EventTarget | null;
  preventDefault(): void;
}

export interface OverlayLayoutHandlers {
  onHeaderPointerDown(event: OverlayPointerEventLike): void;
  onHeaderDoubleClick(event: OverlayMouseEventLike): void;
  onResizePointerDown(event: OverlayPointerEventLike): void;
}

/** Elements inside the header that must never start a drag. */
export const OVERLAY_NO_DRAG_SELECTOR =
  'button, a, input, select, textarea, summary, label, [role="button"], [role="switch"], [role="slider"], [data-craftbuddy-no-drag]';
