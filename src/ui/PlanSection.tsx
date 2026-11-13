import { Box, Typography } from '@mui/material';
import type { SearchResult } from '../optimizer';
import type { CraftBuddySettings } from '../settings';
import type { OutcomeSummary } from '../utils/outcomeSummary';
import {
  isPlayableRecommendation,
  planDisplayContent,
} from '../utils/recommendationPresentation';
import { formatLargeNumber } from '../utils/largeNumbers';
import { smallBadgeSx, Disclosure } from './components';
import { colors, tokens } from './theme';

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
    <Disclosure
      title="Plan"
      meta={rotation.length ? `${rotation.length} steps` : undefined}
    >
      <Typography
        component="p"
        variant="caption"
        sx={{ color: colors.textMuted }}
      >
        Planned, not secured. CraftBuddy checks again after each action; random
        effects and future conditions can change this path.
      </Typography>
      {rotation.length > 0 ? (
        <Box
          component="ol"
          sx={{ listStyle: 'none', p: 0, my: 1.5, counterReset: 'plan-step' }}
        >
          {rotation.map((name, index) => (
            <Typography
              component="li"
              variant="body1"
              key={`${name}-${index}`}
              sx={{
                display: 'flex',
                alignItems: 'center',
                gap: 1,
                py: 0.5,
                counterIncrement: 'plan-step',
                '&::before': {
                  content: 'counter(plan-step)',
                  display: 'grid',
                  placeItems: 'center',
                  width: 22,
                  height: 22,
                  flexShrink: 0,
                  borderRadius: '50%',
                  backgroundColor: tokens.surface.sunken,
                  color: colors.gold,
                  fontSize: tokens.type.label,
                },
              }}
            >
              {name}
              {index === 0 && (
                <Box
                  component="span"
                  sx={{ ...smallBadgeSx, color: colors.gold }}
                >
                  next
                </Box>
              )}
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
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
              gap: 0.75,
              mt: 0.75,
            }}
          >
            {(['completion', 'perfection', 'stability', 'qi'] as const).map(
              (key) => (
                <Box
                  key={key}
                  sx={{
                    display: 'flex',
                    alignItems: 'baseline',
                    flexWrap: 'wrap',
                    gap: 0.75,
                    backgroundColor: tokens.surface.sunken,
                    borderRadius: `${tokens.radius.sm}px`,
                    px: 1,
                    py: 0.625,
                  }}
                >
                  <Typography
                    variant="body1"
                    sx={{ color: tokens.resource[key] }}
                  >
                    {formatLargeNumber(final[key], 1)}
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{ color: colors.textSecondary }}
                  >
                    {key === 'qi' ? 'Qi' : key}
                  </Typography>
                </Box>
              ),
            )}
          </Box>
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
