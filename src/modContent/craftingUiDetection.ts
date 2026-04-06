export interface CraftingActionCueLike {
  text?: string;
  className?: string;
  dataTestId?: string;
  ariaLabel?: string;
}

export interface VisibleCraftingUiSignals {
  hasNamedCraftingActionCue: boolean;
  hasDomProgressValues: boolean;
  visibleProgressSignalCount: number;
  visibleButtonCount: number;
}

export interface ParsedCraftingProgressPair {
  current: number;
  target: number;
}

export interface ElementVisibilityRectLike {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface ElementVisibilitySnapshot {
  isConnected: boolean;
  isHidden?: boolean;
  isAriaHidden?: boolean;
  display?: string;
  visibility?: string;
  opacity?: string | number;
  clientRects: ElementVisibilityRectLike[];
  viewportWidth?: number;
  viewportHeight?: number;
}

const CRAFTING_ACTION_PATTERNS = [
  /fusion/,
  /refine/,
  /stabilize/,
  /support/,
  /technique/,
  /crafting action/,
  /finish craft/,
];

function normalizeCuePart(value?: string): string {
  return (value || '').toLowerCase();
}

function parseProgressValue(value: string | undefined): number | undefined {
  const normalized = String(value || '').replace(/[,\s]/g, '');
  if (!/^\d+$/.test(normalized)) {
    return undefined;
  }

  const parsed = Number.parseInt(normalized, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function parseCraftingProgressPair(
  text: string | undefined,
): ParsedCraftingProgressPair | null {
  const match = String(text || '').match(/(\d[\d,\s]*)\s*\/\s*(\d[\d,\s]*)/);
  if (!match) {
    return null;
  }

  const current = parseProgressValue(match[1]);
  const target = parseProgressValue(match[2]);
  if (current === undefined || target === undefined) {
    return null;
  }

  return { current, target };
}

export function hasCraftingActionCue({
  text,
  className,
  dataTestId,
  ariaLabel,
}: CraftingActionCueLike): boolean {
  const cueParts = [
    normalizeCuePart(text),
    normalizeCuePart(className),
    normalizeCuePart(dataTestId),
    normalizeCuePart(ariaLabel),
  ];

  return CRAFTING_ACTION_PATTERNS.some((pattern) =>
    cueParts.some((part) => pattern.test(part)),
  );
}

export function hasVisibleCraftingUiSignals({
  hasNamedCraftingActionCue,
  hasDomProgressValues,
  visibleProgressSignalCount,
  visibleButtonCount,
}: VisibleCraftingUiSignals): boolean {
  const hasVisibleProgressReadout = visibleProgressSignalCount >= 2;
  const hasAnyProgressReadout =
    hasVisibleProgressReadout || hasDomProgressValues;
  if (!hasAnyProgressReadout) {
    return false;
  }

  if (hasNamedCraftingActionCue) {
    return true;
  }

  // Generic button counts are only trustworthy when the progress readout is
  // visibly on-screen. Hidden/stale DOM text can linger through transitions
  // and should not keep the overlay alive after the craft has ended.
  return hasVisibleProgressReadout && visibleButtonCount >= 3;
}

export function isRenderableOnscreenElement({
  isConnected,
  isHidden,
  isAriaHidden,
  display,
  visibility,
  opacity,
  clientRects,
  viewportWidth,
  viewportHeight,
}: ElementVisibilitySnapshot): boolean {
  if (!isConnected || isHidden || isAriaHidden) {
    return false;
  }

  if (
    display === 'none' ||
    visibility === 'hidden' ||
    visibility === 'collapse'
  ) {
    return false;
  }

  const normalizedOpacity =
    typeof opacity === 'number' ? opacity : Number.parseFloat(opacity || '1');
  if (Number.isFinite(normalizedOpacity) && normalizedOpacity <= 0.01) {
    return false;
  }

  const maxViewportWidth =
    viewportWidth && viewportWidth > 0
      ? viewportWidth
      : Number.POSITIVE_INFINITY;
  const maxViewportHeight =
    viewportHeight && viewportHeight > 0
      ? viewportHeight
      : Number.POSITIVE_INFINITY;

  return clientRects.some((rect) => {
    const width = Number(rect?.width ?? rect?.right - rect?.left);
    const height = Number(rect?.height ?? rect?.bottom - rect?.top);
    if (!(width > 0) || !(height > 0)) {
      return false;
    }

    return (
      rect.bottom > 0 &&
      rect.right > 0 &&
      rect.top < maxViewportHeight &&
      rect.left < maxViewportWidth
    );
  });
}
