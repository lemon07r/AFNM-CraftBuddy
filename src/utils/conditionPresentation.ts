import type { CraftingConditionType } from '../optimizer';

interface ConditionPresentation {
  readonly label: string;
  readonly glyph: string;
  readonly quality: 'excellent' | 'good' | 'normal' | 'poor' | 'terrible';
}

export const CONDITION_PRESENTATION: Readonly<
  Record<CraftingConditionType, ConditionPresentation>
> = {
  veryPositive: { label: 'Excellent', glyph: '▲▲', quality: 'excellent' },
  positive: { label: 'Good', glyph: '▲', quality: 'good' },
  neutral: { label: 'Normal', glyph: '•', quality: 'normal' },
  negative: { label: 'Poor', glyph: '▼', quality: 'poor' },
  veryNegative: { label: 'Terrible', glyph: '▼▼', quality: 'terrible' },
};
