/**
 * CraftBuddy - Ambition band helpers
 *
 * Pure formatting helpers for the two ambition band settings shown in the
 * settings panel. The ladder itself is never recomputed here: `bandThreshold`
 * from the optimizer facade is the single authority, so the percentages shown
 * to the player are the same ones the search scores against.
 */

import { bandThreshold } from '../optimizer';

/**
 * Percentage of the recipe target reached at the top of the given band.
 *
 * A band width of `100` turns the threshold straight into a percentage.
 */
export function ambitionBandPercent(bands: number): number {
  return bandThreshold(100, bands);
}

/**
 * Slider value formatter: `0` is the automatic default, anything higher shows
 * the band count with the approximate percentage of target it requires.
 */
export function formatAmbitionBands(bands: number): string {
  if (bands <= 0) return 'Auto';
  return `${bands} (~${ambitionBandPercent(bands)}%)`;
}
