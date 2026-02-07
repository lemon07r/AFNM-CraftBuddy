/**
 * CraftBuddy - Styled Components
 *
 * Reusable styled components for consistent UI.
 * Performance-optimized: uses static styles, minimal runtime computation.
 */

import React, { memo } from 'react';
import { Box, Paper, Typography, Chip, Avatar, Divider } from '@mui/material';
import type { SxProps, Theme } from '@mui/material/styles';
import {
  colors,
  gradients,
  shadows,
  getSkillTypeColor,
  getQualityColor,
  getQualityLabel,
  getConditionColor,
} from '../theme';
import { pulseGlow, slideInRight, fadeInUp, transitions } from '../animations';

// ============================================================================
// Panel Components
// ============================================================================

interface PanelContainerProps {
  children: React.ReactNode;
  compact?: boolean;
  variant?: 'default' | 'success' | 'error';
  animate?: boolean;
}

/**
 * Main panel container with decorative styling.
 * Memoized for performance.
 */
export const PanelContainer = memo(function PanelContainer({
  children,
  compact = false,
  variant = 'default',
  animate = true,
}: PanelContainerProps) {
  const getBorderColor = () => {
    switch (variant) {
      case 'success':
        return 'rgba(0, 255, 0, 0.5)';
      case 'error':
        return 'rgba(255, 100, 100, 0.5)';
      default:
        return colors.borderSubtle;
    }
  };

  const getBackgroundOverlay = () => {
    switch (variant) {
      case 'success':
        return gradients.successGlow;
      case 'error':
        return gradients.errorGlow;
      default:
        return 'none';
    }
  };

  return (
    <Paper
      elevation={0}
      sx={{
        position: 'relative',
        p: compact ? 1.5 : 2,
        minWidth: compact ? 280 : 350,
        backgroundImage: gradients.panelBackground,
        border: `1px solid ${getBorderColor()}`,
        borderRadius: 2,
        boxShadow: shadows.panel,
        overflow: 'hidden',
        animation: animate ? `${slideInRight} 0.3s ease-out` : 'none',
        // Decorative corner accents
        '&::before': {
          content: '""',
          position: 'absolute',
          top: 0,
          left: 0,
          width: 20,
          height: 20,
          borderTop: `2px solid ${colors.goldDark}40`,
          borderLeft: `2px solid ${colors.goldDark}40`,
          borderTopLeftRadius: 8,
          pointerEvents: 'none',
        },
        '&::after': {
          content: '""',
          position: 'absolute',
          bottom: 0,
          right: 0,
          width: 20,
          height: 20,
          borderBottom: `2px solid ${colors.goldDark}40`,
          borderRight: `2px solid ${colors.goldDark}40`,
          borderBottomRightRadius: 8,
          pointerEvents: 'none',
        },
      }}
    >
      {/* Background glow overlay for success/error states */}
      {variant !== 'default' && (
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            background: getBackgroundOverlay(),
            pointerEvents: 'none',
          }}
        />
      )}
      <Box sx={{ position: 'relative', zIndex: 1 }}>{children}</Box>
    </Paper>
  );
});

// ============================================================================
// Header Components
// ============================================================================

interface SectionHeaderProps {
  children: React.ReactNode;
  icon?: React.ReactNode;
  color?: string;
  compact?: boolean;
}

/**
 * Section header with gradient underline.
 */
export const SectionHeader = memo(function SectionHeader({
  children,
  icon,
  color = colors.gold,
  compact = false,
}: SectionHeaderProps) {
  return (
    <Box sx={{ mb: compact ? 1 : 1.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        {icon && (
          <Box sx={{ color, display: 'flex', alignItems: 'center' }}>
            {icon}
          </Box>
        )}
        <Typography
          variant={compact ? 'subtitle1' : 'h6'}
          sx={{
            color,
            fontWeight: 600,
            letterSpacing: '0.5px',
          }}
        >
          {children}
        </Typography>
      </Box>
      {/* Gradient underline */}
      <Box
        sx={{
          height: 1,
          mt: 0.5,
          background: `linear-gradient(90deg, ${color}60 0%, transparent 80%)`,
          borderRadius: 1,
        }}
      />
    </Box>
  );
});

interface SubSectionHeaderProps {
  children: React.ReactNode;
}

/**
 * Smaller section header for subsections.
 */
export const SubSectionHeader = memo(function SubSectionHeader({
  children,
}: SubSectionHeaderProps) {
  return (
    <Typography
      variant="body2"
      sx={{
        color: colors.textMuted,
        mb: 0.5,
        fontSize: '0.8rem',
      }}
    >
      {children}
    </Typography>
  );
});

// ============================================================================
// Skill Card Components
// ============================================================================

interface SkillCardContainerProps {
  children: React.ReactNode;
  isPrimary?: boolean;
  isFollowUp?: boolean;
  skillType?: string;
  animate?: boolean;
}

/**
 * Container for skill recommendation cards.
 */
export const SkillCardContainer = memo(function SkillCardContainer({
  children,
  isPrimary = false,
  isFollowUp = false,
  skillType,
  animate = false,
}: SkillCardContainerProps) {
  const typeColor = skillType
    ? getSkillTypeColor(skillType)
    : colors.textPrimary;

  const getBackground = () => {
    if (isPrimary && !isFollowUp) {
      return gradients.primaryCard;
    }
    if (isFollowUp) {
      return 'rgba(35, 38, 48, 0.6)';
    }
    return gradients.alternativeCard;
  };

  const getBorder = () => {
    if (isPrimary && !isFollowUp) {
      return `1px solid ${colors.borderHighlight}`;
    }
    if (isFollowUp) {
      return '1px solid rgba(80, 85, 100, 0.4)';
    }
    return '1px solid rgba(80, 85, 100, 0.35)';
  };

  return (
    <Box
      sx={{
        p: 1,
        borderRadius: 1.5,
        background: getBackground(),
        border: getBorder(),
        boxShadow:
          isPrimary && !isFollowUp ? shadows.primaryGlow : shadows.card,
        transition: transitions.smooth,
        animation:
          animate && isPrimary
            ? `${pulseGlow} 2.5s ease-in-out infinite`
            : 'none',
        // Skill type indicator bar on left
        borderLeft: `3px solid ${typeColor}60`,
        '&:hover': {
          background: colors.cardBgHover,
          boxShadow: shadows.cardHover,
        },
      }}
    >
      {children}
    </Box>
  );
});

interface SkillIconProps {
  src?: string;
  name: string;
  size?: 'small' | 'medium' | 'large';
  typeColor?: string;
}

/**
 * Skill icon with type-colored border.
 */
export const SkillIcon = memo(function SkillIcon({
  src,
  name,
  size = 'medium',
  typeColor = colors.textPrimary,
}: SkillIconProps) {
  const sizeMap = {
    small: 40,
    medium: 56,
    large: 72,
  };

  const iconSize = sizeMap[size];

  if (!src) return null;

  return (
    <Avatar
      src={src}
      alt={name}
      variant="rounded"
      sx={{
        width: iconSize,
        height: iconSize,
        border: `2px solid ${typeColor}50`,
        borderRadius: 1,
        boxShadow: shadows.iconGlow,
        flexShrink: 0,
      }}
    />
  );
});

interface SkillNameProps {
  children: React.ReactNode;
  typeColor?: string;
  size?: 'small' | 'normal';
}

/**
 * Skill name with type color.
 */
export const SkillName = memo(function SkillName({
  children,
  typeColor = colors.textPrimary,
  size = 'normal',
}: SkillNameProps) {
  return (
    <Typography
      variant="body2"
      sx={{
        color: typeColor,
        fontWeight: 600,
        fontSize: size === 'small' ? '0.8rem' : '0.9rem',
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        textShadow: `0 0 8px ${typeColor}30`,
      }}
    >
      {children}
    </Typography>
  );
});

// ============================================================================
// Stat Display Components
// ============================================================================

interface StatValueProps {
  value: number | string;
  label?: string;
  color?: string;
  prefix?: string;
}

/**
 * Stat value display with optional label.
 */
export const StatValue = memo(function StatValue({
  value,
  label,
  color = colors.textSecondary,
  prefix = '',
}: StatValueProps) {
  return (
    <Typography variant="caption" sx={{ color }}>
      {prefix}
      {value}
      {label && ` ${label}`}
    </Typography>
  );
});

interface GainDisplayProps {
  completion?: number;
  perfection?: number;
  stability?: number;
  formatFn?: (value: number) => string;
}

/**
 * Display expected gains from a skill.
 */
export const GainDisplay = memo(function GainDisplay({
  completion = 0,
  perfection = 0,
  stability = 0,
  formatFn = (v) => v.toLocaleString(),
}: GainDisplayProps) {
  return (
    <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mt: 0.25 }}>
      {completion > 0 && (
        <StatValue
          value={formatFn(completion)}
          label="Comp"
          color={colors.completionLight}
          prefix="+"
        />
      )}
      {perfection > 0 && (
        <StatValue
          value={formatFn(perfection)}
          label="Perf"
          color={colors.perfection}
          prefix="+"
        />
      )}
      {stability > 0 && (
        <StatValue
          value={formatFn(stability)}
          label="Stab"
          color={colors.stability}
          prefix="+"
        />
      )}
    </Box>
  );
});

interface CostDisplayProps {
  qiCost?: number;
  stabilityCost?: number;
}

/**
 * Display skill costs.
 */
export const CostDisplay = memo(function CostDisplay({
  qiCost = 0,
  stabilityCost = 0,
}: CostDisplayProps) {
  if (qiCost === 0 && stabilityCost === 0) return null;

  return (
    <Box sx={{ display: 'flex', gap: 0.75, mt: 0.25, flexWrap: 'wrap' }}>
      {qiCost > 0 && <StatValue value={qiCost} label="Qi" color={colors.qi} />}
      {stabilityCost > 0 && (
        <StatValue
          value={stabilityCost}
          label="Stab"
          color="#FFB6C1"
          prefix="-"
        />
      )}
    </Box>
  );
});

// ============================================================================
// Chip Components
// ============================================================================

interface ConditionChipProps {
  condition: string;
  label?: string;
  current?: boolean;
  index?: number;
}

/**
 * Chip for displaying crafting conditions.
 */
export const ConditionChip = memo(function ConditionChip({
  condition,
  label,
  current = false,
  index,
}: ConditionChipProps) {
  const color = getConditionColor(condition);
  const displayLabel = label || (index !== undefined ? `${index + 1}` : '');

  return (
    <Chip
      label={displayLabel}
      size="small"
      sx={{
        backgroundColor: current ? `${color}25` : 'rgba(50, 50, 60, 0.7)',
        color,
        fontSize: '0.7rem',
        height: current ? 22 : 20,
        fontWeight: current ? 600 : 400,
        border: `1px solid ${color}${current ? '70' : '35'}`,
        transition: transitions.quick,
      }}
    />
  );
});

interface QualityBadgeProps {
  rating: number;
}

/**
 * Badge showing quality rating.
 */
export const QualityBadge = memo(function QualityBadge({
  rating,
}: QualityBadgeProps) {
  const color = getQualityColor(rating);
  const label = getQualityLabel(rating);

  return (
    <Chip
      label={`${rating}% ${label}`}
      size="small"
      sx={{
        backgroundColor: 'transparent',
        color,
        border: `1px solid ${color}`,
        fontSize: '0.65rem',
        height: 18,
        fontWeight: 500,
      }}
    />
  );
});

interface BuffChipProps {
  label: string;
  icon?: React.ReactNode;
  variant?: 'control' | 'intensity' | 'consumer' | 'default';
}

/**
 * Chip for displaying buff information.
 */
export const BuffChip = memo(function BuffChip({
  label,
  icon,
  variant = 'default',
}: BuffChipProps) {
  const getColors = () => {
    switch (variant) {
      case 'control':
        return { bg: colors.perfection, text: '#000' };
      case 'intensity':
        return { bg: colors.completionLight, text: '#000' };
      case 'consumer':
        return { bg: colors.gold, text: '#000' };
      default:
        return { bg: 'rgba(100, 100, 100, 0.5)', text: colors.textPrimary };
    }
  };

  const colorScheme = getColors();

  return (
    <Chip
      icon={icon as React.ReactElement}
      label={label}
      size="small"
      sx={{
        backgroundColor: colorScheme.bg,
        color: colorScheme.text,
        fontSize: '0.6rem',
        height: 18,
        '& .MuiChip-icon': { color: colorScheme.text },
      }}
    />
  );
});

// ============================================================================
// Divider Components
// ============================================================================

/**
 * Gradient divider with fade effect.
 */
export const GradientDivider = memo(function GradientDivider() {
  return (
    <Box
      sx={{
        my: 1.5,
        height: 1,
        background:
          'linear-gradient(90deg, transparent 0%, rgba(100, 100, 100, 0.4) 20%, rgba(100, 100, 100, 0.4) 80%, transparent 100%)',
        borderRadius: 1,
      }}
    />
  );
});

// ============================================================================
// Layout Components
// ============================================================================

interface FlexRowProps {
  children: React.ReactNode;
  gap?: number;
  align?: 'flex-start' | 'center' | 'flex-end' | 'stretch';
  wrap?: boolean;
  sx?: SxProps<Theme>;
}

/**
 * Flex row utility component.
 */
export const FlexRow = memo(function FlexRow({
  children,
  gap = 1,
  align = 'center',
  wrap = false,
  sx,
}: FlexRowProps) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: align,
        gap,
        flexWrap: wrap ? 'wrap' : 'nowrap',
        ...sx,
      }}
    >
      {children}
    </Box>
  );
});

// ============================================================================
// Arrow Component
// ============================================================================

/**
 * Arrow separator for skill sequences.
 */
export const SequenceArrow = memo(function SequenceArrow() {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', px: 0.25 }}>
      <Typography sx={{ color: colors.textMuted, fontSize: '1rem' }}>
        →
      </Typography>
    </Box>
  );
});

// ============================================================================
// Hotkey Hint Component
// ============================================================================

interface HotkeyHintProps {
  hints: Array<{ key: string; action: string }>;
}

/**
 * Display keyboard shortcuts.
 */
export const HotkeyHints = memo(function HotkeyHints({
  hints,
}: HotkeyHintProps) {
  return (
    <Box
      sx={{
        mt: 1.5,
        pt: 1,
        borderTop: '1px solid rgba(100, 100, 100, 0.25)',
      }}
    >
      <Typography
        variant="caption"
        sx={{ color: colors.textDisabled, display: 'block' }}
      >
        {hints.map((h, i) => (
          <React.Fragment key={h.key}>
            {i > 0 && ' | '}
            {h.key}: {h.action}
          </React.Fragment>
        ))}
      </Typography>
    </Box>
  );
});
