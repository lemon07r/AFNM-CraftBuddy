import { CONDITION_PRESENTATION } from '../utils/conditionPresentation';

describe('condition presentation', () => {
  it('preserves every game-facing name and gives each quality a non-colour cue', () => {
    expect(CONDITION_PRESENTATION).toEqual({
      veryPositive: { label: 'Excellent', glyph: '▲▲', quality: 'excellent' },
      positive: { label: 'Good', glyph: '▲', quality: 'good' },
      neutral: { label: 'Normal', glyph: '•', quality: 'normal' },
      negative: { label: 'Poor', glyph: '▼', quality: 'poor' },
      veryNegative: { label: 'Terrible', glyph: '▼▼', quality: 'terrible' },
    });
  });
});
