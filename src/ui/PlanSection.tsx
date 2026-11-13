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
        variant="body2"
        sx={{ color: colors.textMuted, m: 0 }}
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
                gap: 1.25,
                py: 0.625,
                fontWeight: index === 0 ? 600 : 400,
                color: index === 0 ? colors.textPrimary : colors.textSecondary,
                '& + &': { borderTop: `1px solid ${tokens.border.hairline}` },
                counterIncrement: 'plan-step',
                '&::before': {
                  content: 'counter(plan-step)',
                  display: 'grid',
                  placeItems: 'center',
                  width: 26,
                  height: 26,
                  flexShrink: 0,
                  borderRadius: '50%',
                  backgroundColor:
                    index === 0
                      ? tokens.surface.selected
                      : tokens.surface.sunken,
                  border: `1px solid ${index === 0 ? tokens.border.accent : tokens.border.hairline}`,
                  color: index === 0 ? colors.goldLight : colors.textMuted,
                  fontSize: tokens.type.label,
                  fontWeight: 650,
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
        <Box sx={{ my: 1.5 }}>
          <Typography
            component="h4"
            variant="subtitle2"
            sx={{ color: colors.textSecondary }}
          >
            Planned end state
          </Typography>
          <Box
            sx={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
              gap: 0.75,
              mt: 1,
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
                    border: `1px solid ${tokens.border.hairline}`,
                    borderRadius: `${tokens.radius.md}px`,
                    px: 1.25,
                    py: 0.875,
                  }}
                >
                  <Typography
                    variant="body1"
                    sx={{
                      color: tokens.resource[key],
                      fontSize: tokens.type.lead,
                      fontWeight: 650,
                    }}
                  >
                    {formatLargeNumber(final[key], 1)}
                  </Typography>
                  <Typography variant="body2" sx={{ color: colors.textMuted }}>
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
          variant="body2"
          sx={{ display: 'block', mt: 1, color: colors.textMuted }}
        >
          {summary.harmony.label} · {summary.harmony.detail}
        </Typography>
      )}
      {hasCaps && (
        <Typography
          variant="body2"
          sx={{ display: 'block', mt: 1, color: colors.textMuted }}
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
