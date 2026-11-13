import { outcomeBandPips } from '../utils/outcomePresentation';

describe('outcomeBandPips', () => {
  it('shows reached bands and outlines only the missing requirement', () => {
    expect(outcomeBandPips({ bands: 1, requiredBands: 3 })).toEqual([
      'reached',
      'required',
      'required',
    ]);
  });
  it('keeps extra bands, even with no requirement', () => {
    expect(outcomeBandPips({ bands: 3, requiredBands: 2 })).toEqual([
      'reached',
      'reached',
      'reached',
    ]);
    expect(outcomeBandPips({ bands: 1, requiredBands: 0 })).toEqual([
      'reached',
    ]);
    expect(outcomeBandPips({ bands: 0, requiredBands: 0 })).toEqual([]);
  });
  it('uses text-only above eight and rejects invalid counts', () => {
    expect(outcomeBandPips({ bands: 8, requiredBands: 1 })).toHaveLength(8);
    expect(outcomeBandPips({ bands: 1, requiredBands: 9 })).toEqual([]);
    expect(outcomeBandPips({ bands: 9, requiredBands: 1 })).toEqual([]);
    for (const bands of [-1, 1.5, NaN, Infinity]) {
      expect(outcomeBandPips({ bands, requiredBands: 2 })).toEqual([]);
      expect(outcomeBandPips({ bands: 2, requiredBands: bands })).toEqual([]);
    }
  });
});
