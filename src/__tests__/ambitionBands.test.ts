/** Value formatting for the two ambition band settings. */

import { AMBITION_BAND_MAX } from '../settings';
import { bandThreshold } from '../optimizer';
import { ambitionBandPercent, formatAmbitionBands } from '../ui/ambitionBands';

describe('ambition band formatting', () => {
  it('renders 0 as Auto', () => {
    expect(formatAmbitionBands(0)).toBe('Auto');
  });

  it('follows the 1.3x compounding band ladder', () => {
    expect([1, 2, 3, 4, 5].map(ambitionBandPercent)).toEqual([
      100, 230, 399, 618, 902,
    ]);
  });

  it('reuses the optimizer band ladder instead of its own arithmetic', () => {
    for (let bands = 0; bands <= AMBITION_BAND_MAX; bands += 1) {
      expect(ambitionBandPercent(bands)).toBe(bandThreshold(100, bands));
    }
  });

  it('shows the band count with its approximate target percentage', () => {
    expect(formatAmbitionBands(1)).toBe('1 (~100%)');
    expect(formatAmbitionBands(3)).toBe('3 (~399%)');
    expect(formatAmbitionBands(AMBITION_BAND_MAX)).toBe(
      `8 (~${bandThreshold(100, AMBITION_BAND_MAX)}%)`,
    );
  });
});
