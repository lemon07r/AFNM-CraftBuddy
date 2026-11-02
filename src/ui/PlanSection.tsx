import React from 'react';
import { Box, Typography } from '@mui/material';
import type { SearchResult } from '../optimizer';
import type { CraftBuddySettings } from '../settings';
import type { OutcomeSummary } from '../utils/outcomeSummary';
import {
  isPlayableRecommendation,
  planDisplayContent,
} from '../utils/recommendationPresentation';
import { formatLargeNumber } from '../utils/largeNumbers';
import { Disclosure } from './components';
import { colors } from './theme';

export function PlanSection({
  result,
  summary,
  settings,
  maxCompletionCap,
  maxPerfectionCap,
}: {
  result: SearchResult;
  summary: OutcomeSummary | null;
  settings?: CraftBuddySettings;
  maxCompletionCap?: number;
  maxPerfectionCap?: number;
}) {
  const { rotation, final, followUp } = planDisplayContent(result, settings);
  const reasoning =
    result.recommendation && isPlayableRecommendation(result.recommendation)
      ? result.recommendation.reasoning
      : null;
  const hasCaps =
    maxCompletionCap !== undefined || maxPerfectionCap !== undefined;
  if (
    rotation.length === 0 &&
    !followUp &&
    !final &&
    !reasoning &&
    !summary?.optimisticTierLabel &&
    !summary?.harmony &&
    !hasCaps
  )
    return null;
  return (
    <Disclosure title="Plan">
      <Typography variant="body2" sx={{ color: colors.textSecondary }}>
        Planned, not secured. CraftBuddy checks again after each action; random
        effects and future conditions can change this path.
      </Typography>
      {rotation.length > 0 ? (
        <Box component="ol" sx={{ pl: 2.5, my: 1 }}>
          {rotation.map((name, index) => (
            <Typography
              component="li"
              variant="body2"
              key={`${name}-${index}`}
              sx={{ mt: 0.5 }}
            >
              {name}
              {index === 0 ? ' (next)' : ''}
            </Typography>
          ))}
        </Box>
      ) : (
        followUp && (
          <Typography variant="body2" sx={{ mt: 1 }}>
            Then: {followUp}
          </Typography>
        )
      )}
      {final && (
        <Box sx={{ my: 1 }}>
          <Typography component="h4" variant="subtitle2">
            Planned end state
          </Typography>
          <Typography variant="body2">
            {formatLargeNumber(final.completion, 1)} completion ·{' '}
            {formatLargeNumber(final.perfection, 1)} perfection
          </Typography>
          <Typography variant="body2" sx={{ color: colors.textSecondary }}>
            {formatLargeNumber(final.stability, 1)} stability ·{' '}
            {formatLargeNumber(final.qi, 1)} Qi
          </Typography>
        </Box>
      )}
      {reasoning && (
        <Typography variant="body2" sx={{ color: colors.textSecondary, mt: 1 }}>
          {reasoning}
        </Typography>
      )}
      {summary?.optimisticTierLabel && (
        <Typography variant="body2" sx={{ mt: 1 }}>
          Current bonus possibility: {summary.optimisticTierLabel}.
        </Typography>
      )}
      {summary?.harmony && (
        <Typography
          variant="caption"
          sx={{ display: 'block', mt: 1, color: colors.textSecondary }}
        >
          {summary.harmony.label} · {summary.harmony.detail}
        </Typography>
      )}
      {hasCaps && (
        <Typography
          variant="caption"
          sx={{ display: 'block', mt: 1, color: colors.textSecondary }}
        >
          Bar caps: completion{' '}
          {maxCompletionCap === undefined
            ? 'unknown'
            : formatLargeNumber(maxCompletionCap, 1)}{' '}
          · perfection{' '}
          {maxPerfectionCap === undefined
            ? 'unknown'
            : formatLargeNumber(maxPerfectionCap, 1)}
        </Typography>
      )}
    </Disclosure>
  );
}
