import React from 'react';
import { Box, Typography } from '@mui/material';
import {
  techniqueDisplayName,
  type CraftingConditionType,
  type SearchResult,
} from '../optimizer';
import type { OutcomeSummary } from '../utils/outcomeSummary';
import {
  currentOutcomeCopy,
  type LegacyOutcomeProgress,
} from '../utils/recommendationPresentation';
import { colors, getConditionColor } from './theme';

export function CurrentOutcome({
  summary,
  legacyProgress,
}: {
  summary: OutcomeSummary | null;
  legacyProgress?: LegacyOutcomeProgress;
}) {
  const copy = currentOutcomeCopy(summary, legacyProgress);
  return (
    <Box
      sx={{ mt: 1.5, pt: 1.25, borderTop: `1px solid ${colors.borderSubtle}` }}
    >
      <Typography variant="body2" sx={{ fontWeight: 600 }}>
        {copy.headline}
      </Typography>
      <Typography variant="body2" sx={{ color: colors.textSecondary, mt: 0.5 }}>
        {copy.detail}
      </Typography>
    </Box>
  );
}

const CONDITION_NAMES: Record<CraftingConditionType, string> = {
  veryPositive: 'Excellent',
  positive: 'Good',
  neutral: 'Normal',
  negative: 'Poor',
  veryNegative: 'Terrible',
};
export function Conditions({
  current,
  next,
}: {
  current?: CraftingConditionType;
  next: CraftingConditionType[];
}) {
  if (!current && next.length === 0) return null;
  return (
    <Typography
      variant="caption"
      sx={{
        display: 'block',
        mt: 1,
        color: colors.textSecondary,
        lineHeight: 1.7,
      }}
    >
      Conditions:{' '}
      {current && (
        <Box
          component="span"
          sx={{
            color: colors.textPrimary,
            borderBottom: `2px solid ${getConditionColor(current)}`,
          }}
        >
          now {CONDITION_NAMES[current]}
        </Box>
      )}
      {next.map((condition, index) => (
        <React.Fragment key={index}>
          {' '}
          →{' '}
          <Box
            component="span"
            sx={{
              color: colors.textPrimary,
              borderBottom: `2px solid ${getConditionColor(condition)}`,
            }}
          >
            {CONDITION_NAMES[condition]}
          </Box>
        </React.Fragment>
      ))}
    </Typography>
  );
}

export function BlockedReasonsSection({
  blockedReasons,
}: {
  blockedReasons: NonNullable<SearchResult['blockedReasons']>;
}) {
  // No conditional hook: empty and populated lists can alternate on the same mount.
  return blockedReasons.length ? (
    <Box component="ul" sx={{ pl: 2.5, my: 1 }}>
      {blockedReasons.map((reason, index) => (
        <Typography
          component="li"
          variant="body2"
          key={`${reason.skillName}-${index}`}
          sx={{ color: colors.textSecondary, mt: 0.5 }}
        >
          {techniqueDisplayName({ name: reason.skillName })}:{' '}
          {reason.details || reason.reason}
        </Typography>
      ))}
    </Box>
  ) : null;
}
