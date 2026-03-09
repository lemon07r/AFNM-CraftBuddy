export interface CraftingActionCueLike {
  text?: string;
  className?: string;
  dataTestId?: string;
  ariaLabel?: string;
}

export interface VisibleCraftingUiSignals {
  hasNamedCraftingActionCue: boolean;
  hasProgressSignals: boolean;
  hasDomProgressValues: boolean;
  visibleButtonCount: number;
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
  hasProgressSignals,
  hasDomProgressValues,
  visibleButtonCount,
}: VisibleCraftingUiSignals): boolean {
  const hasAnyProgressReadout = hasProgressSignals || hasDomProgressValues;
  if (!hasAnyProgressReadout) {
    return false;
  }

  if (hasNamedCraftingActionCue) {
    return true;
  }

  // Generic button counts are only trustworthy when the progress readout is
  // visibly on-screen. Hidden/stale DOM text can linger through transitions
  // and should not keep the overlay alive after the craft has ended.
  return hasProgressSignals && visibleButtonCount >= 3;
}
