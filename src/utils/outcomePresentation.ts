import type { OutcomeBarRow } from './outcomeSummary';

export type BandPip = 'reached' | 'required';

/** Decoration only: thresholds and counts have already been computed upstream. */
export function outcomeBandPips(
  bar: Pick<OutcomeBarRow, 'bands' | 'requiredBands'>,
): BandPip[] {
  const { bands, requiredBands } = bar;
  if (
    !Number.isInteger(bands) ||
    !Number.isInteger(requiredBands) ||
    bands < 0 ||
    requiredBands < 0
  )
    return [];
  const count = Math.max(bands, requiredBands);
  if (count > 8) return [];
  return Array.from({ length: count }, (_, index) =>
    index < bands ? 'reached' : 'required',
  );
}
