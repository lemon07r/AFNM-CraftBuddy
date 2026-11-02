import React, { memo } from 'react';
import { Box, Typography } from '@mui/material';
import { techniqueDisplayName, type SkillRecommendation } from '../optimizer';
import { formatLargeNumber } from '../utils/largeNumbers';
import {
  recommendationGainsCopy,
  relativeChoiceLabel,
  successPercentage,
} from '../utils/recommendationPresentation';
import { ActionButton, Help } from './components';
import { colors, getSkillTypeColor } from './theme';

export const ActionRecommendation = memo(function ActionRecommendation({
  rec,
  primary = false,
  compact = false,
  onUse,
}: {
  rec: SkillRecommendation;
  primary?: boolean;
  compact?: boolean;
  onUse?: (rec: SkillRecommendation) => void;
}) {
  const name = techniqueDisplayName(rec.skill);
  const gains = recommendationGainsCopy(rec);
  return (
    <Box
      sx={{
        py: primary ? 0.5 : 1,
        '& + &': { borderTop: `1px solid ${colors.borderSubtle}` },
      }}
    >
      <Typography
        variant="caption"
        sx={{ display: 'block', color: colors.textSecondary, mb: 0.75 }}
      >
        {primary ? 'NEXT ACTION' : relativeChoiceLabel(rec.qualityRating)}
      </Typography>
      <Box
        sx={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: compact ? 1 : 1.5,
        }}
      >
        <Box
          sx={{
            width: compact ? 40 : 48,
            height: compact ? 40 : 48,
            flexShrink: 0,
            backgroundColor: colors.panelBg,
            border: `1px solid ${getSkillTypeColor(rec.skill.type)}`,
            borderRadius: '3px',
            display: 'grid',
            placeItems: 'center',
            overflow: 'hidden',
          }}
        >
          {rec.skill.icon ? (
            <Box
              component="img"
              src={rec.skill.icon}
              alt=""
              sx={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
          ) : (
            <Typography
              aria-hidden="true"
              sx={{ fontSize: '1.3rem', color: colors.textSecondary }}
            >
              {name.charAt(0)}
            </Typography>
          )}
        </Box>
        <Box sx={{ minWidth: 0, flex: 1 }}>
          <Typography
            component={primary ? 'h3' : 'h4'}
            variant={primary ? 'subtitle1' : 'subtitle2'}
            sx={{ m: 0, overflowWrap: 'anywhere', lineHeight: 1.3 }}
          >
            {name}
          </Typography>
          <Typography variant="body2" sx={{ mt: 0.5 }}>
            {gains.primary}
          </Typography>
          {gains.secondary && (
            <Typography
              variant="caption"
              sx={{ color: colors.textSecondary, display: 'block', mt: 0.4 }}
            >
              {gains.secondary}
            </Typography>
          )}
          <Typography
            variant="caption"
            sx={{ color: colors.textSecondary, display: 'block', mt: 0.4 }}
          >
            Cost: {formatLargeNumber(rec.effectiveCosts.qi, 1)} Qi ·{' '}
            {formatLargeNumber(rec.effectiveCosts.stability, 1)} stability
          </Typography>
        </Box>
        {onUse && (
          <ActionButton
            sx={{ alignSelf: 'center', minWidth: 40, px: 1 }}
            aria-label={`Use ${name}`}
            onClick={() => onUse(rec)}
          >
            Use
          </ActionButton>
        )}
      </Box>
      {(rec.endsCraft ||
        rec.requiresProbabilisticSurvival ||
        rec.endsCraftBelowTarget) && (
        <Typography variant="body2" sx={{ mt: 0.75, color: colors.stability }}>
          {rec.endsCraftBelowTarget
            ? 'Ends the craft below its target.'
            : rec.requiresProbabilisticSurvival
              ? 'Continuing depends on a chance-based effect.'
              : 'This technique ends the craft.'}
        </Typography>
      )}
      {rec.projectedSuccessChance !== undefined &&
        rec.projectedSuccessChance < 1 && (
          <Typography
            variant="caption"
            sx={{
              display: 'flex',
              alignItems: 'center',
              color: colors.textSecondary,
            }}
          >
            Technique success: {successPercentage(rec.projectedSuccessChance)}%
            <Help title="Technique success">
              This is the action’s success chance, not a ranking or the chance
              of reaching the planned final outcome.
            </Help>
          </Typography>
        )}
    </Box>
  );
});
