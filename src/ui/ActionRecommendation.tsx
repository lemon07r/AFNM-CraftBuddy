import { memo } from 'react';
import { Box, Typography } from '@mui/material';
import { WarningAmberRounded } from '@mui/icons-material';
import { techniqueDisplayName, type SkillRecommendation } from '../optimizer';
import { formatLargeNumber } from '../utils/largeNumbers';
import {
  recommendationGainsCopy,
  relativeChoiceLabel,
} from '../utils/recommendationPresentation';
import { ActionButton, badgeSx, Eyebrow } from './components';
import { colors, fonts, getSkillTypeColor, tokens } from './theme';

export const ActionRecommendation = memo(function ActionRecommendation({
  rec,
  primary = false,
  variant,
  compact = false,
  onUse,
}: {
  rec: SkillRecommendation;
  primary?: boolean;
  variant?: 'primary' | 'alternative';
  compact?: boolean;
  onUse?: (rec: SkillRecommendation) => void;
}) {
  const hero = variant ? variant === 'primary' : primary;
  const name = techniqueDisplayName(rec.skill);
  const gains = recommendationGainsCopy(rec);
  const skillColor = getSkillTypeColor(rec.skill.type);
  const warningColor = rec.endsCraftBelowTarget
    ? tokens.semantic.danger
    : rec.requiresProbabilisticSurvival
      ? tokens.semantic.warning
      : tokens.text.gold;
  return (
    <Box
      sx={{
        backgroundColor: hero ? tokens.surface.raised : 'transparent',
        border: hero ? `1px solid ${tokens.border.default}` : 0,
        borderTop: hero ? `2px solid ${skillColor}` : undefined,
        borderRadius: hero ? `${tokens.radius.md}px` : 0,
        overflow: 'hidden',
        '@container (max-width: 380px)': {
          '& .technique-icon': {
            width: hero ? 40 : 36,
            height: hero ? 40 : 36,
          },
          '& .technique-name': { fontSize: hero ? 17 : 15 },
          '& .technique-use': { minWidth: 56 },
        },
        '& + &': {
          mt: 1.5,
          pt: 1.5,
          borderTop: `1px solid ${tokens.border.hairline}`,
        },
      }}
    >
      <Box sx={{ p: hero ? (compact ? 1.25 : 1.5) : 0 }}>
        <Eyebrow>
          {hero ? 'Next action' : relativeChoiceLabel(rec.qualityRating)}
        </Eyebrow>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'auto minmax(0, 1fr) auto',
            alignItems: 'center',
            gap: compact ? 1 : 1.25,
          }}
        >
          <Box
            className="technique-icon"
            sx={{
              width: hero ? (compact ? 40 : 52) : 36,
              height: hero ? (compact ? 40 : 52) : 36,
              flexShrink: 0,
              backgroundColor: tokens.surface.sunken,
              border: `1px solid ${skillColor}`,
              borderRadius: `${tokens.radius.sm}px`,
              boxShadow: 'inset 0 1px 8px #0005',
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
              <Typography aria-hidden sx={{ fontSize: 22, color: skillColor }}>
                {name.charAt(0)}
              </Typography>
            )}
          </Box>
          <Typography
            className="technique-name"
            component={hero ? 'h3' : 'h4'}
            sx={{
              m: 0,
              overflowWrap: 'anywhere',
              fontFamily: hero ? fonts.heading : fonts.body,
              fontSize: hero ? (compact ? 17 : 20) : 15,
              fontWeight: hero ? 400 : 600,
              lineHeight: 1.35,
            }}
          >
            {name}
          </Typography>
          {onUse && (
            <ActionButton
              className="technique-use"
              variant={hero ? 'contained' : 'outlined'}
              sx={{
                minWidth: compact ? 56 : hero ? 72 : 56,
                minHeight: hero ? 36 : 32,
                px: 1.25,
              }}
              aria-label={`Use ${name}`}
              onClick={() => onUse(rec)}
            >
              Use
            </ActionButton>
          )}
        </Box>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 0.625,
            mt: 1.25,
          }}
        >
          {gains.primary.split(' · ').map((gain, index) => {
            const resource = (
              ['completion', 'perfection', 'stability'] as const
            ).find((key) => gain.endsWith(key));
            const color = resource
              ? tokens.resource[resource]
              : colors.textSecondary;
            return (
              <Box
                component="span"
                key={index}
                sx={{
                  ...badgeSx,
                  color,
                  backgroundColor: tokens.surface.sunken,
                  borderColor: tokens.border.hairline,
                }}
              >
                {resource && (
                  <Box
                    component="span"
                    aria-hidden
                    sx={{
                      width: 4,
                      height: 4,
                      borderRadius: '50%',
                      backgroundColor: color,
                    }}
                  />
                )}
                {gain}
              </Box>
            );
          })}
          {compact && (
            <Typography
              component="span"
              variant="caption"
              sx={{ color: colors.textSecondary }}
            >
              <Box component="span" sx={{ color: colors.textMuted, mr: 0.75 }}>
                Cost
              </Box>
              {formatLargeNumber(rec.effectiveCosts.qi, 1)} Qi ·{' '}
              {formatLargeNumber(rec.effectiveCosts.stability, 1)} stability
            </Typography>
          )}
        </Box>
        {gains.secondary && (
          <Typography
            variant="body2"
            sx={{ color: colors.textSecondary, mt: 0.5 }}
          >
            {gains.secondary}
          </Typography>
        )}
        {!compact && (
          <Typography
            variant="body2"
            sx={{
              color: colors.textSecondary,
              display: 'block',
              mt: 1,
              pt: 0.75,
              borderTop: `1px solid ${tokens.border.hairline}`,
            }}
          >
            <Box component="span" sx={{ color: colors.textMuted, mr: 0.75 }}>
              Cost
            </Box>
            {formatLargeNumber(rec.effectiveCosts.qi, 1)} Qi ·{' '}
            {formatLargeNumber(rec.effectiveCosts.stability, 1)} stability
          </Typography>
        )}
      </Box>
      {(rec.endsCraft ||
        rec.requiresProbabilisticSurvival ||
        rec.endsCraftBelowTarget) && (
        <Box
          sx={{
            display: 'flex',
            alignItems: 'flex-start',
            gap: 0.75,
            px: hero ? 1.5 : 0,
            py: 1,
            backgroundColor: hero ? tokens.surface.sunken : 'transparent',
            borderTop: `1px solid ${tokens.border.hairline}`,
            color: warningColor,
          }}
        >
          <WarningAmberRounded
            sx={{ fontSize: 17, mt: 0.125, flexShrink: 0 }}
          />
          <Typography variant="body2">
            {rec.endsCraftBelowTarget
              ? 'Ends the craft below its target.'
              : rec.requiresProbabilisticSurvival
                ? 'Continuing depends on a chance-based effect.'
                : 'This technique ends the craft.'}
          </Typography>
        </Box>
      )}
    </Box>
  );
});
