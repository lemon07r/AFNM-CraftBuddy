import React from 'react';
import { Box, Typography } from '@mui/material';
import { Check, WarningAmberRounded } from '@mui/icons-material';
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
import { outcomeBandPips } from '../utils/outcomePresentation';
import { CONDITION_PRESENTATION } from '../utils/conditionPresentation';
import { badgeSx, smallBadgeSx, Eyebrow, Help } from './components';
import { colors, getConditionColor, tokens } from './theme';

export function CurrentOutcome({
  summary,
  legacyProgress,
}: {
  summary: OutcomeSummary | null;
  legacyProgress?: LegacyOutcomeProgress;
}) {
  const copy = currentOutcomeCopy(summary, legacyProgress);
  return (
    <Box sx={{ mt: 1.5 }}>
      <Eyebrow>Outcome</Eyebrow>
      {summary ? (
        <>
          <Box
            sx={{
              display: 'flex',
              gap: 0.75,
              alignItems: 'center',
              flexWrap: 'wrap',
              mb: 0.5,
            }}
            aria-label={copy.headline}
          >
            <Box
              component="span"
              sx={{
                ...badgeSx,
                color: summary.onTarget
                  ? tokens.semantic.positive
                  : summary.tier === 'failed'
                    ? tokens.semantic.danger
                    : colors.textPrimary,
                backgroundColor: tokens.surface.hover,
                py: 0.375,
              }}
            >
              {copy.headline.split(' · ')[0]}
            </Box>
            <Box component="span" aria-hidden sx={{ color: colors.textMuted }}>
              →
            </Box>
            <Box component="span" sx={{ ...badgeSx, py: 0.375 }}>
              {summary.onTarget
                ? `Target ${summary.targetTierLabel}`
                : `aiming for ${summary.targetTierLabel}`}
            </Box>
            <Help title="Current outcome">
              <Box>{copy.detail}</Box>
              <Box sx={{ mt: 0.75 }}>
                {summary.bars
                  .map((bar) => `${bar.valueLabel} ${bar.label.toLowerCase()}`)
                  .join(' · ')}
              </Box>
            </Help>
          </Box>
          {summary.bars.map((bar) => {
            const color = tokens.resource[bar.bar];
            return (
              <Box
                key={bar.bar}
                sx={{
                  py: 0.875,
                  borderBottom: `1px solid ${tokens.border.hairline}`,
                  '[data-compact] &': { py: 0.625 },
                }}
              >
                <Box
                  sx={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    alignItems: 'center',
                    gap: 0.75,
                  }}
                >
                  <Typography
                    variant="body1"
                    sx={{
                      display: 'inline-flex',
                      gap: 0.625,
                      alignItems: 'center',
                      minWidth: 90,
                      '[data-compact] &': {
                        fontSize: tokens.type.bodySm,
                        minWidth: 84,
                      },
                    }}
                  >
                    <Box
                      component="span"
                      aria-hidden
                      sx={{
                        backgroundColor: color,
                        width: 5,
                        height: 5,
                        borderRadius: '50%',
                      }}
                    />
                    {bar.label}
                  </Typography>
                  <Box aria-hidden sx={{ display: 'flex', gap: 0.375 }}>
                    {outcomeBandPips(bar).map((pip, index) => (
                      <Box
                        key={index}
                        sx={{
                          width: 8,
                          height: 8,
                          borderRadius: '2px',
                          border: `1px solid ${color}`,
                          backgroundColor:
                            pip === 'reached' ? color : 'transparent',
                        }}
                      />
                    ))}
                  </Box>
                  <Typography
                    variant="body1"
                    sx={{
                      color: colors.textPrimary,
                      '[data-compact] &': { fontSize: tokens.type.bodySm },
                    }}
                  >
                    {bar.bandsLabel}
                  </Typography>
                  {bar.satisfied && (
                    <Check
                      aria-label="Target bands met"
                      sx={{ fontSize: 15, color: tokens.semantic.positive }}
                    />
                  )}
                  {bar.isBinding && (
                    <Box
                      component="span"
                      title={summary.bindingLabel}
                      sx={{
                        ...smallBadgeSx,
                        color: colors.textSecondary,
                        ml: 'auto',
                      }}
                    >
                      limiting
                    </Box>
                  )}
                </Box>
                <Box
                  sx={{
                    display: 'flex',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 0.75,
                    mt: 0.375,
                    '[data-compact] &': { mt: 0.125 },
                  }}
                >
                  <Typography
                    variant="body2"
                    sx={{
                      color: colors.textMuted,
                    }}
                  >
                    {bar.valueLabel} {bar.label.toLowerCase()}
                  </Typography>
                  {bar.nextBandLabel && (
                    <Typography
                      variant="body2"
                      sx={{ color: colors.textSecondary }}
                    >
                      <Box component="span">· </Box>
                      {bar.nextBandLabel}
                    </Typography>
                  )}
                  {bar.bonusChanceLabel && (
                    <Box
                      component="span"
                      sx={{
                        ...smallBadgeSx,
                        color: tokens.semantic.info,
                        borderColor: tokens.border.hairline,
                      }}
                    >
                      {bar.bonusChanceLabel} chance
                    </Box>
                  )}
                </Box>
              </Box>
            );
          })}
          {summary.optimisticTierLabel && (
            <Typography
              variant="caption"
              sx={{ display: 'block', color: colors.textMuted, mt: 0.75 }}
            >
              Possible: {summary.optimisticTierLabel}.
            </Typography>
          )}
        </>
      ) : (
        <>
          <Typography variant="subtitle2">{copy.headline}</Typography>
          <Typography
            variant="body2"
            sx={{ color: colors.textSecondary, mt: 0.5 }}
          >
            {copy.detail}
          </Typography>
        </>
      )}
    </Box>
  );
}

export function Conditions({
  current,
  next,
}: {
  current?: CraftingConditionType;
  next: CraftingConditionType[];
}) {
  if (!current && next.length === 0) return null;
  const conditions = [
    ...(current ? [{ condition: current, now: true }] : []),
    ...next.map((condition) => ({ condition, now: false })),
  ];
  return (
    <Box aria-label="Conditions" sx={{ mt: 1.25 }}>
      <Eyebrow>Conditions</Eyebrow>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: 0.5,
        }}
      >
        {conditions.map(({ condition, now }, index) => {
          const presentation = CONDITION_PRESENTATION[condition];
          return (
            <React.Fragment key={index}>
              {index > 0 && (
                <Box
                  component="span"
                  aria-hidden
                  sx={{ color: colors.textMuted }}
                >
                  ›
                </Box>
              )}
              <Box
                component="span"
                sx={{
                  ...badgeSx,
                  borderColor: tokens.border.hairline,
                  borderLeft: `2px solid ${getConditionColor(condition)}`,
                  backgroundColor: now
                    ? tokens.surface.selected
                    : 'transparent',
                  color: now ? colors.textPrimary : colors.textSecondary,
                  py: 0.375,
                  '[data-compact] &': {
                    px: 0.5,
                    py: 0.125,
                  },
                }}
              >
                {now && (
                  <Box
                    component="span"
                    sx={{
                      color: colors.textMuted,
                      fontSize: tokens.type.label,
                    }}
                  >
                    Now ·
                  </Box>
                )}
                {presentation.label}
                <Box
                  component="span"
                  aria-hidden
                  sx={{
                    fontSize: tokens.type.label,
                    color: getConditionColor(condition),
                    letterSpacing: '-.12em',
                  }}
                >
                  {presentation.glyph}
                </Box>
              </Box>
            </React.Fragment>
          );
        })}
      </Box>
    </Box>
  );
}

export function BlockedReasonsSection({
  blockedReasons,
}: {
  blockedReasons: NonNullable<SearchResult['blockedReasons']>;
}) {
  return blockedReasons.length ? (
    <Box component="ul" sx={{ listStyle: 'none', p: 0, mb: 0, mt: 1 }}>
      {blockedReasons.map((reason, index) => (
        <Box
          component="li"
          key={`${reason.skillName}-${index}`}
          sx={{
            display: 'flex',
            gap: 0.75,
            pt: 0.75,
            mt: 0.75,
            borderTop: `1px solid ${tokens.border.hairline}`,
          }}
        >
          <WarningAmberRounded
            sx={{
              fontSize: 16,
              color: tokens.semantic.warning,
              mt: 0.25,
              flexShrink: 0,
            }}
          />
          <Typography variant="body2" sx={{ color: colors.textSecondary }}>
            {techniqueDisplayName({
              name: reason.skillName,
              displayName: reason.displayName,
            })}
            : {reason.details || reason.reason}
          </Typography>
        </Box>
      ))}
    </Box>
  ) : null;
}
