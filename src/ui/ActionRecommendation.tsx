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
import { colors, fonts, fs, getSkillTypeColor, tokens } from './theme';

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
        position: 'relative',
        backgroundColor: hero ? tokens.surface.card : 'transparent',
        backgroundImage: hero
          ? `radial-gradient(120% 90% at 0% 0%, ${skillColor}1f 0%, transparent 55%)`
          : 'none',
        border: hero ? `1px solid ${tokens.border.default}` : 0,
        borderRadius: hero ? `${tokens.radius.lg}px` : 0,
        boxShadow: hero ? tokens.shadow.card : 'none',
        overflow: 'hidden',
        '&::before': hero
          ? {
              content: '""',
              position: 'absolute',
              left: 0,
              top: 14,
              bottom: 14,
              width: 3,
              borderRadius: '0 3px 3px 0',
              backgroundColor: skillColor,
              opacity: 0.85,
            }
          : undefined,
        '@container (max-width: 380px)': {
          '& .technique-icon': {
            width: hero ? 44 : 38,
            height: hero ? 44 : 38,
          },
          '& .technique-name': {
            fontSize: hero ? tokens.type.heading : tokens.type.body,
          },
          '& .technique-use': { minWidth: 60 },
        },
        '& + &': {
          mt: 1.5,
          pt: 1.5,
          borderTop: `1px solid ${tokens.border.hairline}`,
        },
      }}
    >
      <Box sx={{ p: hero ? (compact ? 1.5 : 2) : 0 }}>
        <Eyebrow>
          {hero ? 'Next action' : relativeChoiceLabel(rec.qualityRating)}
        </Eyebrow>
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: 'auto minmax(0, 1fr) auto',
            alignItems: 'center',
            gap: compact ? 1.25 : 1.5,
          }}
        >
          <Box
            className="technique-icon"
            sx={{
              width: hero ? (compact ? 46 : 58) : 40,
              height: hero ? (compact ? 46 : 58) : 40,
              flexShrink: 0,
              backgroundColor: tokens.surface.sunken,
              border: `1px solid ${skillColor}80`,
              borderRadius: `${tokens.radius.md}px`,
              boxShadow: `inset 0 1px 8px #0006, 0 0 0 3px ${skillColor}14`,
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
                aria-hidden
                sx={{ fontSize: fs(22), fontWeight: 650, color: skillColor }}
              >
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
              fontFamily: fonts.body,
              fontSize: hero
                ? compact
                  ? tokens.type.heading
                  : fs(21)
                : tokens.type.lead,
              fontWeight: hero ? 700 : 600,
              letterSpacing: hero ? '-.012em' : '-.004em',
              lineHeight: 1.25,
              color: colors.textPrimary,
            }}
          >
            {name}
          </Typography>
          {onUse && (
            <ActionButton
              className="technique-use"
              variant={hero ? 'contained' : 'outlined'}
              sx={{
                minWidth: compact ? 64 : hero ? 84 : 64,
                minHeight: hero ? 42 : 36,
                px: hero ? 2 : 1.5,
                fontSize: hero ? tokens.type.lead : tokens.type.body,
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
            gap: 0.75,
            mt: 1.5,
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
                  fontSize: tokens.type.bodySm,
                  fontWeight: 600,
                  py: 0.375,
                  backgroundColor: resource
                    ? `${color}12`
                    : tokens.surface.sunken,
                  borderColor: resource ? `${color}38` : tokens.border.hairline,
                }}
              >
                {resource && (
                  <Box
                    component="span"
                    aria-hidden
                    sx={{
                      width: 6,
                      height: 6,
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
              variant="body2"
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
            sx={{ color: colors.textSecondary, mt: 0.75 }}
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
              mt: 1.5,
              pt: 1.25,
              borderTop: `1px solid ${tokens.border.hairline}`,
            }}
          >
            <Box
              component="span"
              sx={{ color: colors.textMuted, fontWeight: 600, mr: 0.75 }}
            >
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
            gap: 1,
            px: hero ? 2 : 0,
            py: 1.25,
            backgroundColor: hero ? 'rgba(0,0,0,.22)' : 'transparent',
            borderTop: `1px solid ${tokens.border.hairline}`,
            color: warningColor,
          }}
        >
          <WarningAmberRounded
            sx={{ fontSize: fs(18), mt: 0.125, flexShrink: 0 }}
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
