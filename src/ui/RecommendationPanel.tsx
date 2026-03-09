/**
 * CraftBuddy - Recommendation Panel UI Component
 *
 * Displays the recommended next skill during crafting with expected gains
 * and reasoning. Uses themed components for consistent styling.
 */

import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Typography, Chip, IconButton, Tooltip } from '@mui/material';
import {
  CheckCircle as CheckCircleIcon,
  Warning as WarningIcon,
  WaterDrop as WaterDropIcon,
  Shield as ShieldIcon,
  Timer as TimerIcon,
  Stars as StarsIcon,
  Dangerous as DangerousIcon,
  AutoAwesome as AutoAwesomeIcon,
  ElectricBolt as ElectricBoltIcon,
  TrendingUp as TrendingUpIcon,
  SmartToy as SmartToyIcon,
  PlayArrow as PlayArrowIcon,
  StopCircle as StopCircleIcon,
  CheckCircleOutline as CheckCircleOutlineIcon,
  Inventory2 as Inventory2Icon,
} from '@mui/icons-material';
import { FaDiscord, FaGithub, FaSteam } from 'react-icons/fa';
import {
  SearchResult,
  SkillRecommendation,
  CraftingConditionType,
} from '../optimizer';
import {
  AUTO_CRAFT_POLICY_OPTIONS,
  type AutoCraftPolicy,
  type CraftBuddySettings,
} from '../settings';
import { type AutoCraftUiState } from '../settings/autoCraft';
import { SettingsPanel } from './SettingsPanel';
import {
  formatLargeNumber,
  formatProgress,
  LARGE_NUMBER_THRESHOLD,
} from '../utils/largeNumbers';
import {
  colors,
  gradients,
  shadows,
  getSkillTypeColor,
  getQualityColor,
  getQualityLabel,
  getConditionColor,
} from './theme';
import {
  PanelContainer,
  SectionHeader,
  SubSectionHeader,
  SkillCardContainer,
  SkillIcon,
  SkillName,
  GainDisplay,
  CostDisplay,
  ConditionChip,
  QualityBadge,
  BuffChip,
  GradientDivider,
  FlexRow,
  SequenceArrow,
  HotkeyHints,
  LoadingSkeletonCard,
  LoadingHeader,
  SearchProgressBar,
  RecalculateButton,
} from './components';
import { fadeInUp, transitions, versionBadgeReveal } from './animations';

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Format a gain value for display, using compact notation for large numbers.
 */
function formatGain(value: number): string {
  if (value >= LARGE_NUMBER_THRESHOLD) {
    return formatLargeNumber(value, 1);
  }
  return value.toLocaleString();
}

function formatSuccessChance(value: number): string {
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}

function formatGainSummary(gains: {
  completion: number;
  perfection: number;
  stability: number;
}): string {
  const parts: string[] = [];
  if (gains.completion > 0) {
    parts.push(`+${formatGain(gains.completion)} Comp`);
  }
  if (gains.perfection > 0) {
    parts.push(`+${formatGain(gains.perfection)} Perf`);
  }
  if (gains.stability > 0) {
    parts.push(`+${formatGain(gains.stability)} Stab`);
  }
  return parts.join(' | ');
}

function gainsDiffer(
  a: { completion: number; perfection: number; stability: number },
  b: { completion: number; perfection: number; stability: number },
): boolean {
  return (
    a.completion !== b.completion ||
    a.perfection !== b.perfection ||
    a.stability !== b.stability
  );
}

// Condition display names
const CONDITION_NAMES: Record<CraftingConditionType, string> = {
  veryPositive: 'Excellent',
  positive: 'Good',
  neutral: 'Normal',
  negative: 'Poor',
  veryNegative: 'Terrible',
};

interface CommunityLink {
  id: string;
  label: string;
  href: string;
  icon: React.ReactNode;
}

const COMMUNITY_LINKS: CommunityLink[] = [
  {
    id: 'discord',
    label: 'Join Discord',
    href: 'https://discord.gg/gnyjqwxzC7',
    icon: <FaDiscord size={14} />,
  },
  {
    id: 'github',
    label: 'Open GitHub',
    href: 'https://github.com/lemon07r/AFNM-CraftBuddy',
    icon: <FaGithub size={14} />,
  },
  {
    id: 'steam',
    label: 'Open Steam Workshop',
    href: 'https://steamcommunity.com/sharedfiles/filedetails/?id=3661729323',
    icon: <FaSteam size={14} />,
  },
];

// Helper to get buff name from BuffType enum
function getBuffName(buffType: number): string | undefined {
  if (buffType === 1) return 'Control';
  if (buffType === 2) return 'Intensity';
  return undefined;
}

// ============================================================================
// Props Interfaces
// ============================================================================

interface RecommendationPanelProps {
  result: SearchResult | null;
  currentCompletion?: number;
  currentPerfection?: number;
  targetCompletion?: number;
  targetPerfection?: number;
  maxCompletionCap?: number;
  maxPerfectionCap?: number;
  currentStability?: number;
  currentMaxStability?: number;
  targetStability?: number;
  currentCondition?: CraftingConditionType;
  nextConditions?: CraftingConditionType[];
  currentToxicity?: number;
  maxToxicity?: number;
  craftingType?: 'forge' | 'alchemical' | 'inscription' | 'resonance';
  settings?: CraftBuddySettings;
  onSettingsChange?: (settings: CraftBuddySettings) => void;
  /** Called when a search-affecting setting changes */
  onSearchSettingsChange?: (settings: CraftBuddySettings) => void;
  /** Whether the optimizer is currently calculating */
  isCalculating?: boolean;
  /** Whether search settings have changed since last calculation */
  settingsStale?: boolean;
  /** Callback to trigger recalculation with new settings */
  onRecalculate?: () => void;
  /** Execute the first action of a displayed recommendation immediately */
  onRecommendationAction?: (recommendation: SkillRecommendation) => void;
  /** Auto-craft controller state */
  autoMode?: AutoCraftUiState;
  /** Arm auto mode for the current craft */
  onAutoModeArm?: () => void;
  /** Stop auto mode */
  onAutoModeStop?: (reason?: string) => void;
  /** Change the preferred auto mode policy */
  onAutoModePolicyChange?: (policy: AutoCraftPolicy) => void;
  /** Mod version shown in panel footer */
  version?: string;
}

type RecommendationPanelMode = 'suggestions' | 'auto';

const CommunityLinks = memo(function CommunityLinks({
  isOpen = false,
}: {
  isOpen?: boolean;
}) {
  return (
    <Box
      sx={{
        display: 'inline-flex',
        flexDirection: 'row',
        alignItems: 'center',
        gap: 0.5,
        px: isOpen ? 0.62 : 0.75,
        py: 0.4,
        borderRadius: isOpen ? 1.5 : 999,
        backgroundColor: 'rgba(22, 26, 35, 0.78)',
        border: `1px solid ${isOpen ? colors.borderMedium : colors.borderSubtle}`,
        boxShadow: isOpen
          ? '0 6px 14px rgba(0, 0, 0, 0.28)'
          : '0 4px 10px rgba(0, 0, 0, 0.18)',
        transition:
          'border-radius 0.38s cubic-bezier(0.4, 0, 0.2, 1), padding 0.38s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.38s cubic-bezier(0.4, 0, 0.2, 1), border-color 0.2s ease',
      }}
    >
      {COMMUNITY_LINKS.map((link) => (
        <Tooltip key={link.id} title={link.label} enterDelay={200}>
          <IconButton
            component="a"
            href={link.href}
            target="_blank"
            rel="noopener noreferrer"
            size="small"
            aria-label={link.label}
            sx={{
              width: 26,
              height: 26,
              color: colors.textMuted,
              border: '1px solid transparent',
              transition: transitions.smooth,
              '&:hover': {
                color: colors.gold,
                borderColor: colors.borderMedium,
                backgroundColor: 'rgba(222, 184, 135, 0.1)',
              },
            }}
          >
            {link.icon}
          </IconButton>
        </Tooltip>
      ))}
    </Box>
  );
});

const PanelVersionBadge = memo(function PanelVersionBadge({
  version,
  visible = true,
}: {
  version?: string;
  visible?: boolean;
}) {
  if (!version) return null;
  const versionLabel = version.startsWith('v') ? version : `v${version}`;

  return (
    <Typography
      variant="caption"
      sx={{
        position: 'absolute',
        right: 10,
        bottom: 8,
        display: 'inline-block',
        overflow: 'hidden',
        isolation: 'isolate',
        fontSize: '0.66rem',
        color: 'rgba(222, 205, 168, 0.94)',
        letterSpacing: '0.04em',
        lineHeight: 1,
        pointerEvents: 'none',
        opacity: visible ? 0.92 : 0,
        transform: visible
          ? 'translateY(0) scale(1)'
          : 'translateY(5px) scale(0.9)',
        filter: visible ? 'blur(0)' : 'blur(3px)',
        textShadow: visible
          ? '0 0 8px rgba(255, 223, 140, 0.25)'
          : '0 0 0 rgba(255, 223, 140, 0)',
        transition: visible
          ? 'opacity 0.38s cubic-bezier(0.2, 0.8, 0.2, 1), transform 0.38s cubic-bezier(0.2, 0.8, 0.2, 1), filter 0.38s cubic-bezier(0.2, 0.8, 0.2, 1), text-shadow 0.46s ease'
          : 'opacity 0.12s ease, transform 0.12s ease, filter 0.12s ease, text-shadow 0.14s ease',
        animation: visible
          ? `${versionBadgeReveal} 0.74s cubic-bezier(0.25, 0.9, 0.3, 1) both`
          : 'none',
      }}
    >
      {versionLabel}
    </Typography>
  );
});

const AUTO_PHASE_LABELS: Record<AutoCraftUiState['phase'], string> = {
  off: 'Off',
  armed: 'Armed',
  calculating: 'Calculating',
  ready: 'Ready',
  executing: 'Executing',
  waiting_for_state: 'Waiting',
  completed: 'Done',
  stop_requested: 'Stopping',
  stopped: 'Stopped',
  unsupported: 'Needs Input',
  error: 'Error',
};

const AUTO_BUDDY_ACCENT = colors.error;
const HEADER_PADDING_WITH_SETTINGS = '44px';
const HEADER_PADDING_WITH_SETTINGS_AND_LINKS = '140px';

function getAutoToneSx(tone: AutoCraftUiState['tone']) {
  switch (tone) {
    case 'active':
      return {
        border: 'rgba(76, 196, 255, 0.38)',
        background:
          'linear-gradient(180deg, rgba(18, 40, 66, 0.92), rgba(11, 22, 39, 0.92))',
        accent: '#7dd5ff',
        accentSoft: 'rgba(125, 213, 255, 0.16)',
      };
    case 'warning':
      return {
        border: 'rgba(255, 191, 99, 0.4)',
        background:
          'linear-gradient(180deg, rgba(56, 38, 18, 0.92), rgba(30, 20, 10, 0.92))',
        accent: '#ffcb75',
        accentSoft: 'rgba(255, 203, 117, 0.18)',
      };
    case 'error':
      return {
        border: 'rgba(255, 109, 109, 0.42)',
        background:
          'linear-gradient(180deg, rgba(60, 20, 20, 0.92), rgba(30, 10, 10, 0.92))',
        accent: '#ff8f8f',
        accentSoft: 'rgba(255, 143, 143, 0.18)',
      };
    case 'success':
      return {
        border: 'rgba(101, 232, 157, 0.4)',
        background:
          'linear-gradient(180deg, rgba(18, 54, 39, 0.92), rgba(9, 28, 20, 0.92))',
        accent: '#7ef0a9',
        accentSoft: 'rgba(126, 240, 169, 0.18)',
      };
    default:
      return {
        border: 'rgba(109, 124, 154, 0.3)',
        background:
          'linear-gradient(180deg, rgba(20, 26, 39, 0.92), rgba(13, 18, 28, 0.92))',
        accent: '#d8c595',
        accentSoft: 'rgba(216, 197, 149, 0.14)',
      };
  }
}

function getAutoModeIcon(autoMode: AutoCraftUiState) {
  switch (autoMode.phase) {
    case 'completed':
      return <CheckCircleIcon sx={{ fontSize: 15 }} />;
    case 'ready':
    case 'executing':
      return <PlayArrowIcon sx={{ fontSize: 16 }} />;
    case 'waiting_for_state':
    case 'stop_requested':
      return <AutoAwesomeIcon sx={{ fontSize: 15 }} />;
    case 'unsupported':
      return <Inventory2Icon sx={{ fontSize: 15 }} />;
    case 'error':
      return <WarningIcon sx={{ fontSize: 15 }} />;
    case 'stopped':
      return <CheckCircleOutlineIcon sx={{ fontSize: 15 }} />;
    default:
      return <SmartToyIcon sx={{ fontSize: 15 }} />;
  }
}

const AutoModeSection = memo(function AutoModeSection({
  autoMode,
  compact = false,
  loading = false,
  embedded = false,
  onArm,
  onStop,
  onPolicyChange,
}: {
  autoMode?: AutoCraftUiState;
  compact?: boolean;
  loading?: boolean;
  embedded?: boolean;
  onArm?: () => void;
  onStop?: (reason?: string) => void;
  onPolicyChange?: (policy: AutoCraftPolicy) => void;
}) {
  if (!autoMode) return null;

  const tone = getAutoToneSx(autoMode.tone);
  const primaryActionLabel =
    autoMode.armed || autoMode.stopRequested ? 'Stop Auto' : 'Enable Auto';
  const primaryDisabled =
    autoMode.stopRequested ||
    (!autoMode.armed && typeof onArm !== 'function') ||
    (autoMode.armed && typeof onStop !== 'function');

  return (
    <Box
      sx={{
        borderRadius: embedded ? 1.5 : 2,
        border: `1px solid ${tone.border}`,
        background: tone.background,
        boxShadow: loading
          ? '0 10px 22px rgba(0, 0, 0, 0.24)'
          : '0 12px 26px rgba(0, 0, 0, 0.28)',
        p: compact ? 1 : 1.15,
        display: 'grid',
        gap: 0.9,
        minWidth: 0,
      }}
    >
      <FlexRow
        align="center"
        gap={0.75}
        sx={{ justifyContent: 'space-between' }}
      >
        <FlexRow align="center" gap={0.65}>
          <Box
            sx={{
              width: 26,
              height: 26,
              borderRadius: '50%',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: tone.accent,
              backgroundColor: tone.accentSoft,
              border: `1px solid ${tone.border}`,
              flexShrink: 0,
            }}
          >
            {getAutoModeIcon(autoMode)}
          </Box>
          <Box sx={{ minWidth: 0 }}>
            <Typography
              variant="body2"
              sx={{
                color: colors.gold,
                fontWeight: 700,
                lineHeight: 1.1,
                letterSpacing: '0.04em',
              }}
            >
              Auto Craft
            </Typography>
            <Typography
              variant="caption"
              sx={{ color: colors.textMuted, display: 'block', mt: 0.2 }}
            >
              Per craft automation
            </Typography>
          </Box>
        </FlexRow>

        <Chip
          size="small"
          label={AUTO_PHASE_LABELS[autoMode.phase]}
          sx={{
            height: 22,
            color: tone.accent,
            backgroundColor: tone.accentSoft,
            border: `1px solid ${tone.border}`,
            fontWeight: 700,
            fontSize: '0.68rem',
            letterSpacing: '0.04em',
          }}
        />
      </FlexRow>

      <Box>
        <Typography
          variant="body2"
          sx={{
            color:
              autoMode.tone === 'warning' || autoMode.tone === 'error'
                ? tone.accent
                : colors.textPrimary,
            fontWeight: 600,
            lineHeight: 1.2,
          }}
        >
          {autoMode.statusTitle}
        </Typography>
        <Typography
          variant="caption"
          sx={{
            color: colors.textSecondary,
            display: 'block',
            mt: 0.35,
            lineHeight: 1.35,
          }}
        >
          {autoMode.statusDetail}
        </Typography>
        {autoMode.lastActionName && (
          <Typography
            variant="caption"
            sx={{
              display: 'block',
              mt: 0.55,
              color: tone.accent,
              fontWeight: 600,
              letterSpacing: '0.03em',
            }}
          >
            Last action: {autoMode.lastActionName}
          </Typography>
        )}
      </Box>

      <Box sx={{ display: 'grid', gap: 0.45 }}>
        {AUTO_CRAFT_POLICY_OPTIONS.map((option) => {
          const selected = autoMode.policy === option.value;
          return (
            <Box
              key={option.value}
              component="button"
              type="button"
              onClick={() => onPolicyChange?.(option.value)}
              sx={{
                display: 'grid',
                justifyItems: 'start',
                gap: 0.1,
                width: '100%',
                px: 0.9,
                py: 0.7,
                borderRadius: 1.2,
                border: `1px solid ${selected ? tone.border : 'rgba(99, 109, 134, 0.26)'}`,
                background: selected
                  ? `linear-gradient(135deg, ${tone.accentSoft}, rgba(255, 255, 255, 0.02))`
                  : 'rgba(12, 17, 27, 0.42)',
                color: selected ? colors.textPrimary : colors.textSecondary,
                cursor: onPolicyChange ? 'pointer' : 'default',
                textAlign: 'left',
                transition: transitions.smooth,
                '&:hover': onPolicyChange
                  ? {
                      borderColor: tone.border,
                      backgroundColor: 'rgba(255, 255, 255, 0.04)',
                    }
                  : undefined,
              }}
            >
              <Typography
                variant="caption"
                sx={{
                  color: selected ? tone.accent : colors.textPrimary,
                  fontWeight: 700,
                  lineHeight: 1.1,
                  fontSize: '0.68rem',
                }}
              >
                {compact ? option.shortLabel : option.label}
              </Typography>
              {!compact && (
                <Typography
                  variant="caption"
                  sx={{
                    color: colors.textMuted,
                    lineHeight: 1.25,
                    fontSize: '0.62rem',
                  }}
                >
                  {option.description}
                </Typography>
              )}
            </Box>
          );
        })}
      </Box>

      <Box
        component="button"
        type="button"
        disabled={primaryDisabled}
        onClick={() =>
          autoMode.armed || autoMode.stopRequested ? onStop?.() : onArm?.()
        }
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 0.7,
          width: '100%',
          px: 1.1,
          py: 0.85,
          borderRadius: 1.3,
          border: '1px solid transparent',
          background:
            autoMode.armed || autoMode.stopRequested
              ? 'linear-gradient(135deg, rgba(120, 34, 34, 0.94), rgba(71, 18, 18, 0.94))'
              : `linear-gradient(135deg, ${tone.accentSoft}, rgba(28, 43, 66, 0.92))`,
          color:
            autoMode.armed || autoMode.stopRequested ? '#ffd5d5' : tone.accent,
          fontSize: '0.76rem',
          fontWeight: 700,
          letterSpacing: '0.04em',
          cursor: primaryDisabled ? 'not-allowed' : 'pointer',
          opacity: primaryDisabled ? 0.6 : 1,
          transition: transitions.smooth,
          '&:hover': primaryDisabled
            ? undefined
            : {
                transform: 'translateY(-1px)',
                boxShadow: `0 8px 16px ${tone.accentSoft}`,
              },
        }}
      >
        {autoMode.armed || autoMode.stopRequested ? (
          <StopCircleIcon sx={{ fontSize: 16 }} />
        ) : (
          <PlayArrowIcon sx={{ fontSize: 16 }} />
        )}
        {primaryActionLabel}
      </Box>
    </Box>
  );
});

const PanelModeToggle = memo(function PanelModeToggle({
  mode,
  autoMode,
  compact = false,
  onToggle,
}: {
  mode: RecommendationPanelMode;
  autoMode?: AutoCraftUiState;
  compact?: boolean;
  onToggle: () => void;
}) {
  const autoPhase = autoMode?.phase ?? 'off';
  const autoTone = getAutoToneSx(autoMode?.tone ?? 'neutral');
  const autoActive = autoPhase !== 'off';

  return (
    <Box
      component="button"
      type="button"
      onClick={onToggle}
      sx={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 0.6,
        px: compact ? 0.8 : 1,
        py: compact ? 0.42 : 0.5,
        borderRadius: 999,
        border: `1px solid ${
          mode === 'auto'
            ? autoTone.border
            : autoActive
              ? autoTone.border
              : colors.borderMedium
        }`,
        background:
          mode === 'auto'
            ? autoTone.background
            : autoActive
              ? `linear-gradient(135deg, ${autoTone.accentSoft}, rgba(17, 24, 37, 0.92))`
              : 'rgba(20, 26, 39, 0.82)',
        color:
          mode === 'auto'
            ? autoTone.accent
            : autoActive
              ? autoTone.accent
              : colors.textMuted,
        cursor: 'pointer',
        transition: transitions.smooth,
        '&:hover': {
          transform: 'translateY(-1px)',
          boxShadow:
            mode === 'auto'
              ? `0 10px 18px ${autoTone.accentSoft}`
              : '0 8px 16px rgba(0, 0, 0, 0.22)',
          borderColor: autoActive ? autoTone.border : colors.borderHighlight,
        },
      }}
    >
      {mode === 'auto' ? (
        <TrendingUpIcon sx={{ fontSize: 15 }} />
      ) : autoMode ? (
        getAutoModeIcon(autoMode)
      ) : (
        <SmartToyIcon sx={{ fontSize: 15 }} />
      )}
      <Typography
        component="span"
        variant="caption"
        sx={{
          color: mode === 'auto' ? 'inherit' : AUTO_BUDDY_ACCENT,
          fontWeight: 700,
          letterSpacing: '0.04em',
          lineHeight: 1,
        }}
      >
        {mode === 'auto' ? 'Suggestions' : 'Try AutoBuddy'}
      </Typography>
      {mode !== 'auto' && autoActive && (
        <Box
          component="span"
          sx={{
            px: 0.45,
            py: 0.12,
            borderRadius: 999,
            border: `1px solid ${autoTone.border}`,
            backgroundColor: autoTone.accentSoft,
            color: autoTone.accent,
            fontSize: '0.58rem',
            fontWeight: 700,
            letterSpacing: '0.04em',
            lineHeight: 1.2,
          }}
        >
          {AUTO_PHASE_LABELS[autoPhase]}
        </Box>
      )}
    </Box>
  );
});

const PanelHeading = memo(function PanelHeading({
  title,
  titleColor,
  compact = false,
  subtitle,
  rightPadding,
  modeToggle,
}: {
  title: string;
  titleColor: string;
  compact?: boolean;
  subtitle?: string;
  rightPadding: string;
  modeToggle?: React.ReactNode;
}) {
  return (
    <Box
      sx={{
        pr: rightPadding,
        mb: compact ? 1 : 1.25,
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.9,
          flexWrap: compact ? 'wrap' : 'nowrap',
          minWidth: 0,
        }}
      >
        <Box sx={{ minWidth: 0, flex: '0 1 auto' }}>
          <Typography
            variant={compact ? 'subtitle1' : 'h6'}
            sx={{
              color: titleColor,
              fontWeight: 600,
              letterSpacing: '0.5px',
              lineHeight: 1.08,
              whiteSpace: compact ? 'normal' : 'nowrap',
            }}
          >
            {title}
          </Typography>
          <Box
            sx={{
              height: 1,
              mt: 0.45,
              width: compact ? 112 : 156,
              maxWidth: '100%',
              background: `linear-gradient(90deg, ${titleColor}60 0%, transparent 88%)`,
              borderRadius: 1,
            }}
          />
        </Box>

        {modeToggle && (
          <Box sx={{ flexShrink: 0, pt: compact ? 0.05 : 0.15 }}>
            {modeToggle}
          </Box>
        )}
      </Box>

      {subtitle && (
        <Typography
          variant="caption"
          sx={{
            color: colors.textMuted,
            display: 'block',
            mt: 0.5,
            letterSpacing: '0.04em',
          }}
        >
          {subtitle}
        </Typography>
      )}
    </Box>
  );
});

// ============================================================================
// Sub-Components
// ============================================================================

/**
 * Single skill box component - displays one skill with its gains and costs.
 * Memoized for performance.
 */
const SingleSkillBox = memo(function SingleSkillBox({
  name,
  type,
  actionKind,
  gains,
  projectedGains,
  projectedSuccessChance,
  icon,
  qiCost = 0,
  stabilityCost = 0,
  buffGranted,
  buffDuration = 0,
  isPrimary = false,
  isFollowUp = false,
  consumesBuff = false,
  reasoning,
  interactive = false,
  onClick,
}: {
  name: string;
  type: string;
  actionKind?: 'skill' | 'item' | 'finish';
  gains: { completion: number; perfection: number; stability: number };
  projectedGains?: {
    completion: number;
    perfection: number;
    stability: number;
  };
  projectedSuccessChance?: number;
  icon?: string;
  qiCost?: number;
  stabilityCost?: number;
  buffGranted?: string;
  buffDuration?: number;
  isPrimary?: boolean;
  isFollowUp?: boolean;
  consumesBuff?: boolean;
  reasoning?: string;
  interactive?: boolean;
  onClick?: () => void;
}) {
  const visualType = actionKind === 'finish' ? 'finish' : type;
  const typeColor = getSkillTypeColor(visualType);
  const iconSize = isFollowUp ? 'small' : isPrimary ? 'large' : 'medium';
  const canClickIcon =
    interactive &&
    !isFollowUp &&
    typeof onClick === 'function' &&
    Boolean(icon);

  return (
    <SkillCardContainer
      isPrimary={isPrimary}
      isFollowUp={isFollowUp}
      skillType={visualType}
      animate={isPrimary && !isFollowUp}
    >
      <FlexRow gap={1.5} align="flex-start">
        {canClickIcon ? (
          <Box
            component="button"
            type="button"
            aria-label={`Use ${name} now`}
            onClick={onClick}
            sx={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              p: 0.2,
              border: `1px solid ${typeColor}35`,
              borderRadius: 1.2,
              background: 'rgba(13, 18, 28, 0.24)',
              cursor: 'pointer',
              transition: transitions.smooth,
              '& .MuiAvatar-root': {
                transition: transitions.smooth,
              },
              '&:hover': {
                borderColor: `${typeColor}88`,
                backgroundColor: 'rgba(255, 255, 255, 0.04)',
                boxShadow: `0 0 0 1px ${typeColor}20, 0 10px 18px rgba(0, 0, 0, 0.24)`,
              },
              '&:hover .MuiAvatar-root, &:focus-visible .MuiAvatar-root': {
                transform: 'translateY(-1px) scale(1.03)',
                boxShadow: `0 0 0 1px ${typeColor}25, ${shadows.iconGlow}`,
              },
              '&:focus-visible': {
                outline: `2px solid ${typeColor}`,
                outlineOffset: 2,
              },
            }}
          >
            <SkillIcon
              src={icon}
              name={name}
              size={iconSize}
              typeColor={typeColor}
            />
          </Box>
        ) : (
          <SkillIcon
            src={icon}
            name={name}
            size={iconSize}
            typeColor={typeColor}
          />
        )}

        <Box sx={{ flex: 1, minWidth: 0 }}>
          <SkillName
            typeColor={typeColor}
            size={isPrimary ? 'normal' : 'small'}
          >
            {name}
          </SkillName>

          <CostDisplay qiCost={qiCost} stabilityCost={stabilityCost} />

          <GainDisplay
            completion={gains.completion}
            perfection={gains.perfection}
            stability={gains.stability}
            formatFn={formatGain}
          />
          {projectedGains && gainsDiffer(gains, projectedGains) && (
            <Typography
              variant="caption"
              sx={{
                color: colors.textMuted,
                display: 'block',
                mt: 0.25,
                lineHeight: 1.2,
              }}
            >
              Projected EV: {formatGainSummary(projectedGains)}
            </Typography>
          )}
          {projectedSuccessChance != null && (
            <Typography
              variant="caption"
              sx={{
                color: colors.gold,
                display: 'block',
                mt: 0.25,
                lineHeight: 1.2,
                fontWeight: 600,
              }}
            >
              Success chance: {formatSuccessChance(projectedSuccessChance)}
            </Typography>
          )}

          {reasoning && isPrimary && !isFollowUp && (
            <Typography
              variant="body2"
              sx={{
                color: colors.textSecondary,
                fontStyle: 'italic',
                fontSize: '0.8rem',
                mt: 0.5,
              }}
            >
              {reasoning}
            </Typography>
          )}

          {/* Buff indicators */}
          <FlexRow gap={0.5} wrap sx={{ mt: 0.25 }}>
            {buffGranted && buffDuration > 0 && (
              <BuffChip
                icon={<AutoAwesomeIcon sx={{ fontSize: 12 }} />}
                label={`${buffGranted} x${buffDuration}`}
                variant={
                  buffGranted.toLowerCase().includes('control')
                    ? 'control'
                    : 'intensity'
                }
              />
            )}
            {consumesBuff && (
              <BuffChip
                icon={<ElectricBoltIcon sx={{ fontSize: 12 }} />}
                label="Uses Buff"
                variant="consumer"
              />
            )}
          </FlexRow>
        </Box>
      </FlexRow>
    </SkillCardContainer>
  );
});

/**
 * Skill card with optional follow-up skill display.
 * Memoized for performance.
 */
const SkillCard = memo(function SkillCard({
  rec,
  isPrimary = false,
  showQuality = false,
  compact = false,
  onPrimaryAction,
}: {
  rec: SkillRecommendation;
  isPrimary?: boolean;
  showQuality?: boolean;
  compact?: boolean;
  onPrimaryAction?: (recommendation: SkillRecommendation) => void;
}) {
  const qualityRating = rec.qualityRating ?? 100;
  const hasFollowUp = rec.followUpSkill !== undefined;

  const skill = rec.skill;
  const qiCost = (rec.effectiveCosts?.qi ?? skill.qiCost) || 0;
  const stabilityCost =
    (rec.effectiveCosts?.stability ?? skill.stabilityCost) || 0;
  const buffGranted = getBuffName(skill.buffType);
  const buffDuration = skill.buffDuration || 0;

  return (
    <Box
      sx={{
        mb: 1,
        animation: isPrimary ? `${fadeInUp} 0.25s ease-out` : 'none',
      }}
    >
      {/* Quality rating for alternatives */}
      {showQuality && !isPrimary && (
        <Box sx={{ mb: 0.5 }}>
          <QualityBadge rating={qualityRating} />
        </Box>
      )}

      {/* Skills displayed side-by-side */}
      <FlexRow
        align="stretch"
        gap={0.5}
        sx={
          compact && hasFollowUp
            ? {
                '@media (max-aspect-ratio: 16/9)': {
                  flexDirection: 'column',
                  gap: 0.75,
                },
              }
            : undefined
        }
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <SingleSkillBox
            name={rec.skill.name}
            type={rec.skill.type}
            actionKind={rec.skill.actionKind}
            gains={rec.immediateGains}
            projectedGains={rec.expectedGains}
            projectedSuccessChance={rec.projectedSuccessChance}
            icon={rec.skill.icon}
            qiCost={qiCost}
            stabilityCost={stabilityCost}
            buffGranted={buffGranted}
            buffDuration={buffDuration}
            isPrimary={isPrimary}
            isFollowUp={false}
            consumesBuff={rec.consumesBuff}
            reasoning={isPrimary ? rec.reasoning : undefined}
            interactive={typeof onPrimaryAction === 'function'}
            onClick={
              typeof onPrimaryAction === 'function'
                ? () => onPrimaryAction(rec)
                : undefined
            }
          />
        </Box>

        {/* Follow-up skill */}
        {hasFollowUp && rec.followUpSkill && (
          <>
            <Box
              sx={
                compact
                  ? {
                      '@media (max-aspect-ratio: 16/9)': {
                        display: 'none',
                      },
                    }
                  : undefined
              }
            >
              <SequenceArrow />
            </Box>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              {compact && (
                <Typography
                  variant="caption"
                  sx={{
                    display: 'none',
                    mb: 0.4,
                    px: 0.25,
                    color: colors.textMuted,
                    fontSize: '0.63rem',
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    '@media (max-aspect-ratio: 16/9)': {
                      display: 'block',
                    },
                  }}
                >
                  Then
                </Typography>
              )}
              <SingleSkillBox
                name={rec.followUpSkill.name}
                type={rec.followUpSkill.type}
                actionKind={rec.followUpSkill.actionKind}
                gains={rec.followUpSkill.immediateGains}
                projectedGains={rec.followUpSkill.expectedGains}
                projectedSuccessChance={
                  rec.followUpSkill.projectedSuccessChance
                }
                icon={rec.followUpSkill.icon}
                qiCost={rec.followUpSkill.effectiveCosts?.qi ?? 0}
                stabilityCost={rec.followUpSkill.effectiveCosts?.stability ?? 0}
                isPrimary={isPrimary}
                isFollowUp={true}
              />
            </Box>
          </>
        )}
      </FlexRow>
    </Box>
  );
});

/**
 * Progress display section.
 */
const ProgressSection = memo(function ProgressSection({
  currentCompletion,
  currentPerfection,
  targetCompletion,
  targetPerfection,
  maxCompletionCap,
  maxPerfectionCap,
  currentStability,
  currentMaxStability,
  targetStability,
  currentToxicity,
  maxToxicity,
}: {
  currentCompletion: number;
  currentPerfection: number;
  targetCompletion: number;
  targetPerfection: number;
  maxCompletionCap?: number;
  maxPerfectionCap?: number;
  currentStability: number;
  currentMaxStability: number;
  targetStability: number;
  currentToxicity: number;
  maxToxicity: number;
}) {
  if (targetCompletion <= 0 && targetPerfection <= 0) return null;

  return (
    <Box sx={{ mb: 1.5 }}>
      <Typography variant="body2" sx={{ color: colors.textSecondary }}>
        Completion: {formatProgress(currentCompletion, targetCompletion)} |{' '}
        Perfection: {formatProgress(currentPerfection, targetPerfection)}
      </Typography>

      {(maxCompletionCap !== undefined || maxPerfectionCap !== undefined) && (
        <Typography
          variant="body2"
          sx={{ color: colors.perfection, opacity: 0.8 }}
        >
          Caps: {formatGain(maxCompletionCap ?? targetCompletion)} completion /{' '}
          {formatGain(maxPerfectionCap ?? targetPerfection)} perfection
        </Typography>
      )}

      {targetStability > 0 && (
        <Typography
          variant="body2"
          sx={{
            color:
              currentStability < 20 ? colors.stability : colors.textSecondary,
          }}
        >
          Stability:{' '}
          {formatProgress(
            currentStability,
            currentMaxStability > 0 ? currentMaxStability : targetStability,
          )}
          {currentMaxStability > 0 && currentMaxStability < targetStability && (
            <Box
              component="span"
              sx={{ color: colors.stability, opacity: 0.7, ml: 0.5 }}
            >
              (max decayed from {formatGain(targetStability)})
            </Box>
          )}
        </Typography>
      )}

      {maxToxicity > 0 && (
        <Typography
          variant="body2"
          sx={{
            color:
              currentToxicity >= maxToxicity * 0.8
                ? colors.error
                : currentToxicity >= maxToxicity * 0.5
                  ? colors.stability
                  : colors.textSecondary,
          }}
        >
          Toxicity: {formatProgress(currentToxicity, maxToxicity)}
          {currentToxicity >= maxToxicity * 0.8 && (
            <WarningIcon
              sx={{
                color: colors.error,
                fontSize: 14,
                ml: 0.5,
                verticalAlign: 'middle',
              }}
            />
          )}
        </Typography>
      )}
    </Box>
  );
});

/**
 * Conditions display section.
 */
const ConditionsSection = memo(function ConditionsSection({
  currentCondition,
  nextConditions,
}: {
  currentCondition?: CraftingConditionType;
  nextConditions: CraftingConditionType[];
}) {
  if (!currentCondition && nextConditions.length === 0) return null;

  return (
    <Box sx={{ mb: 1.5 }}>
      <SubSectionHeader>Conditions:</SubSectionHeader>
      <FlexRow gap={0.5} wrap align="center">
        {currentCondition && (
          <ConditionChip
            condition={currentCondition}
            label={`Now: ${CONDITION_NAMES[currentCondition] || currentCondition}`}
            current
          />
        )}
        {currentCondition && nextConditions.length > 0 && (
          <Typography sx={{ color: colors.textMuted, fontSize: '0.8rem' }}>
            →
          </Typography>
        )}
        {nextConditions.slice(0, 4).map((condition, idx) => (
          <ConditionChip
            key={idx}
            condition={condition}
            label={`${idx + 1}: ${CONDITION_NAMES[condition] || condition}`}
            index={idx}
          />
        ))}
      </FlexRow>
    </Box>
  );
});

const AutoBuddySnapshotSection = memo(function AutoBuddySnapshotSection({
  currentCompletion,
  currentPerfection,
  targetCompletion,
  targetPerfection,
  maxCompletionCap,
  maxPerfectionCap,
  currentStability,
  currentMaxStability,
  targetStability,
  currentCondition,
  nextConditions,
  currentToxicity,
  maxToxicity,
}: {
  currentCompletion: number;
  currentPerfection: number;
  targetCompletion: number;
  targetPerfection: number;
  maxCompletionCap?: number;
  maxPerfectionCap?: number;
  currentStability: number;
  currentMaxStability: number;
  targetStability: number;
  currentCondition?: CraftingConditionType;
  nextConditions: CraftingConditionType[];
  currentToxicity: number;
  maxToxicity: number;
}) {
  const effectiveMaxStability =
    currentMaxStability > 0 ? currentMaxStability : targetStability;
  const stats = [
    {
      label: 'Completion',
      value: formatProgress(currentCompletion, targetCompletion),
      accent: colors.completion,
    },
    {
      label: 'Perfection',
      value: formatProgress(currentPerfection, targetPerfection),
      accent: colors.perfection,
    },
    {
      label: 'Stability',
      value: formatProgress(currentStability, effectiveMaxStability),
      accent:
        currentStability <= Math.max(10, effectiveMaxStability * 0.25)
          ? colors.error
          : colors.stability,
    },
  ];

  return (
    <Box sx={{ display: 'grid', gap: 0.9, mb: 1.15 }}>
      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
          gap: 0.65,
        }}
      >
        {stats.map((stat) => (
          <Box
            key={stat.label}
            sx={{
              minWidth: 0,
              px: 0.9,
              py: 0.75,
              borderRadius: 1.35,
              border: `1px solid ${colors.borderMedium}`,
              background:
                'linear-gradient(180deg, rgba(18, 24, 38, 0.92), rgba(11, 15, 24, 0.92))',
              boxShadow: '0 8px 18px rgba(0, 0, 0, 0.18)',
            }}
          >
            <Typography
              variant="caption"
              sx={{
                display: 'block',
                color: colors.textMuted,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                fontSize: '0.58rem',
              }}
            >
              {stat.label}
            </Typography>
            <Typography
              variant="body2"
              sx={{
                mt: 0.25,
                color: stat.accent,
                fontWeight: 700,
                lineHeight: 1.2,
                fontSize: '0.82rem',
              }}
            >
              {stat.value}
            </Typography>
          </Box>
        ))}
      </Box>

      <FlexRow gap={0.45} wrap align="center">
        {currentCondition && (
          <ConditionChip
            condition={currentCondition}
            label={`Now: ${CONDITION_NAMES[currentCondition] || currentCondition}`}
            current
          />
        )}
        {nextConditions.slice(0, 3).map((condition, index) => (
          <ConditionChip
            key={`${condition}-${index}`}
            condition={condition}
            label={`${index + 1}: ${CONDITION_NAMES[condition] || condition}`}
            index={index}
          />
        ))}
      </FlexRow>

      {(maxCompletionCap !== undefined ||
        maxPerfectionCap !== undefined ||
        maxToxicity > 0 ||
        (currentMaxStability > 0 && currentMaxStability < targetStability)) && (
        <Typography
          variant="caption"
          sx={{
            color: colors.textMuted,
            display: 'block',
            lineHeight: 1.35,
          }}
        >
          {[
            maxCompletionCap !== undefined || maxPerfectionCap !== undefined
              ? `Caps ${formatGain(maxCompletionCap ?? targetCompletion)} / ${formatGain(maxPerfectionCap ?? targetPerfection)}`
              : null,
            currentMaxStability > 0 && currentMaxStability < targetStability
              ? `Stability max decayed from ${formatGain(targetStability)}`
              : null,
            maxToxicity > 0
              ? `Toxicity ${formatProgress(currentToxicity, maxToxicity)}`
              : null,
          ]
            .filter(Boolean)
            .join('  |  ')}
        </Typography>
      )}
    </Box>
  );
});

const AutoBuddyLoadingCard = memo(function AutoBuddyLoadingCard({
  compact = false,
  title,
  detail,
}: {
  compact?: boolean;
  title: string;
  detail: string;
}) {
  return (
    <Box
      sx={{
        display: 'grid',
        gap: 0.8,
        mb: 1,
        px: compact ? 1 : 1.1,
        py: compact ? 0.95 : 1.05,
        borderRadius: 1.5,
        border: `1px solid ${colors.borderMedium}`,
        background:
          'linear-gradient(180deg, rgba(18, 24, 38, 0.94), rgba(10, 14, 22, 0.94))',
        boxShadow: '0 12px 22px rgba(0, 0, 0, 0.24)',
      }}
    >
      <Box>
        <Typography
          variant="body2"
          sx={{ color: colors.textPrimary, fontWeight: 700 }}
        >
          {title}
        </Typography>
        <Typography
          variant="caption"
          sx={{
            color: colors.textSecondary,
            display: 'block',
            mt: 0.3,
            lineHeight: 1.35,
          }}
        >
          {detail}
        </Typography>
      </Box>

      <Box
        sx={{
          height: 10,
          borderRadius: 999,
          backgroundColor: 'rgba(255, 255, 255, 0.06)',
          overflow: 'hidden',
        }}
      >
        <Box
          sx={{
            width: '58%',
            height: '100%',
            borderRadius: 999,
            background: `linear-gradient(90deg, ${colors.borderHighlight}, rgba(255, 214, 96, 0.28))`,
            boxShadow: '0 0 18px rgba(255, 214, 96, 0.16)',
          }}
        />
      </Box>

      <Box sx={{ display: 'grid', gap: 0.45 }}>
        {Array.from({ length: 3 }).map((_, index) => (
          <Box
            key={index}
            sx={{
              height: index === 0 ? 38 : 16,
              borderRadius: 1.1,
              backgroundColor:
                index === 0
                  ? 'rgba(255, 255, 255, 0.05)'
                  : 'rgba(255, 255, 255, 0.035)',
            }}
          />
        ))}
      </Box>
    </Box>
  );
});

/**
 * Rotation preview section.
 */
const RotationSection = memo(function RotationSection({
  rotation,
  maxDisplay,
}: {
  rotation: string[];
  maxDisplay: number;
}) {
  if (rotation.length <= 1) return null;

  return (
    <Box sx={{ mb: 1.5 }}>
      <SubSectionHeader>Suggested rotation:</SubSectionHeader>
      <FlexRow gap={0.5} wrap align="center">
        {rotation.slice(0, maxDisplay).map((skillName, idx) => (
          <React.Fragment key={idx}>
            <Chip
              label={skillName}
              size="small"
              sx={{
                backgroundColor:
                  idx === 0 ? 'rgba(0, 255, 0, 0.15)' : 'rgba(60, 65, 80, 0.6)',
                color: idx === 0 ? colors.completion : colors.textSecondary,
                fontSize: '0.7rem',
                height: 22,
                border:
                  idx === 0
                    ? `1px solid ${colors.completion}40`
                    : '1px solid rgba(100, 100, 100, 0.35)',
              }}
            />
            {idx < Math.min(rotation.length - 1, maxDisplay - 1) && (
              <Typography sx={{ color: colors.textMuted, fontSize: '0.8rem' }}>
                →
              </Typography>
            )}
          </React.Fragment>
        ))}
        {rotation.length > maxDisplay && (
          <Typography sx={{ color: colors.textDisabled, fontSize: '0.7rem' }}>
            +{rotation.length - maxDisplay} more
          </Typography>
        )}
      </FlexRow>
    </Box>
  );
});

/**
 * Expected final state section.
 */
const FinalStateSection = memo(function FinalStateSection({
  state,
  targetCompletion,
  targetPerfection,
  turnsCount,
}: {
  state: {
    completion: number;
    perfection: number;
    stability: number;
    maxStability?: number;
    turnsRemaining: number;
    projectedSuccessChance?: number;
  };
  targetCompletion: number;
  targetPerfection: number;
  turnsCount: number;
}) {
  const targetsMet =
    state.completion >= targetCompletion &&
    state.perfection >= targetPerfection;

  return (
    <Box
      sx={{
        mb: 1.5,
        p: 1,
        background: 'rgba(0, 40, 80, 0.25)',
        borderRadius: 1.5,
        border: '1px solid rgba(100, 180, 255, 0.2)',
      }}
    >
      <FlexRow gap={0.5} sx={{ mb: 0.5 }}>
        <TrendingUpIcon
          sx={{ color: colors.perfection, fontSize: 16, opacity: 0.8 }}
        />
        <Typography
          variant="body2"
          sx={{ color: colors.perfection, fontWeight: 500, opacity: 0.9 }}
        >
          After {turnsCount} turns:
        </Typography>
      </FlexRow>

      <FlexRow gap={2} wrap>
        <Typography variant="body2" sx={{ color: colors.completionLight }}>
          Comp: {formatProgress(state.completion, targetCompletion)}
        </Typography>
        <Typography variant="body2" sx={{ color: colors.perfection }}>
          Perf: {formatProgress(state.perfection, targetPerfection)}
        </Typography>
        <Typography variant="body2" sx={{ color: colors.stability }}>
          Stab:{' '}
          {state.maxStability != null && state.maxStability > 0
            ? formatProgress(state.stability, state.maxStability)
            : formatGain(state.stability)}
        </Typography>
      </FlexRow>

      {targetsMet && (
        <FlexRow gap={0.5} sx={{ mt: 0.5 }}>
          <CheckCircleIcon sx={{ color: colors.completion, fontSize: 14 }} />
          <Typography
            variant="body2"
            sx={{ color: colors.completion, fontStyle: 'italic' }}
          >
            Targets will be met!
          </Typography>
        </FlexRow>
      )}

      {state.projectedSuccessChance != null && (
        <Typography variant="body2" sx={{ color: colors.gold, mt: 0.5 }}>
          Finish chance: {formatSuccessChance(state.projectedSuccessChance)}
        </Typography>
      )}

      {state.turnsRemaining > 0 && (
        <Typography variant="body2" sx={{ color: colors.textMuted, mt: 0.5 }}>
          ~{state.turnsRemaining} more turns needed after
        </Typography>
      )}
    </Box>
  );
});

/**
 * Blocked reasons diagnostic display.
 */
const BlockedReasonsSection = memo(function BlockedReasonsSection({
  blockedReasons,
}: {
  blockedReasons: Array<{
    skillName: string;
    reason: string;
    details?: string;
  }>;
}) {
  if (blockedReasons.length === 0) return null;

  // Group by reason type
  const grouped = useMemo(() => {
    const groups: Record<string, typeof blockedReasons> = {};
    for (const r of blockedReasons) {
      if (!groups[r.reason]) groups[r.reason] = [];
      groups[r.reason].push(r);
    }
    return groups;
  }, [blockedReasons]);

  const reasonConfig: Record<
    string,
    { icon: React.ReactNode; color: string; label: string }
  > = {
    qi: {
      icon: <WaterDropIcon sx={{ fontSize: 14 }} />,
      color: colors.perfection,
      label: 'Insufficient Qi',
    },
    stability: {
      icon: <ShieldIcon sx={{ fontSize: 14 }} />,
      color: colors.stability,
      label: 'Stability too low',
    },
    cooldown: {
      icon: <TimerIcon sx={{ fontSize: 14 }} />,
      color: '#9370DB',
      label: 'On Cooldown',
    },
    condition: {
      icon: <StarsIcon sx={{ fontSize: 14 }} />,
      color: colors.completionLight,
      label: 'Wrong Condition',
    },
    toxicity: {
      icon: <DangerousIcon sx={{ fontSize: 14 }} />,
      color: colors.error,
      label: 'Toxicity Limit',
    },
  };

  return (
    <Box sx={{ mt: 1.5 }}>
      <Typography
        variant="body2"
        sx={{ color: 'rgba(255, 200, 200, 0.9)', fontWeight: 500, mb: 1 }}
      >
        Why skills are blocked:
      </Typography>

      {Object.entries(grouped).map(([reason, skills]) => {
        const config = reasonConfig[reason] || {
          icon: null,
          color: colors.textSecondary,
          label: reason,
        };

        return (
          <Box key={reason} sx={{ mb: 1 }}>
            <FlexRow gap={0.5}>
              <Box sx={{ color: config.color }}>{config.icon}</Box>
              <Typography
                variant="caption"
                sx={{ color: config.color, fontWeight: 500 }}
              >
                {config.label} ({skills.length} skills):
              </Typography>
            </FlexRow>
            <Box sx={{ pl: 1, mt: 0.5 }}>
              {skills.slice(0, 3).map((r, i) => (
                <Typography
                  key={i}
                  variant="caption"
                  sx={{ color: colors.textSecondary, display: 'block' }}
                >
                  • {r.skillName}: {r.details}
                </Typography>
              ))}
              {skills.length > 3 && (
                <Typography variant="caption" sx={{ color: colors.textMuted }}>
                  ...and {skills.length - 3} more
                </Typography>
              )}
            </Box>
          </Box>
        );
      })}
    </Box>
  );
});

// ============================================================================
// Main Component
// ============================================================================

/**
 * Main recommendation panel component.
 */
export function RecommendationPanel({
  result,
  currentCompletion = 0,
  currentPerfection = 0,
  targetCompletion = 0,
  targetPerfection = 0,
  maxCompletionCap,
  maxPerfectionCap,
  currentStability = 0,
  currentMaxStability = 0,
  targetStability = 0,
  currentCondition,
  nextConditions = [],
  currentToxicity = 0,
  maxToxicity = 0,
  craftingType = 'forge',
  settings,
  onSettingsChange,
  onSearchSettingsChange,
  isCalculating = false,
  settingsStale = false,
  onRecalculate,
  onRecommendationAction,
  autoMode,
  onAutoModeArm,
  onAutoModeStop,
  onAutoModePolicyChange,
  version,
}: RecommendationPanelProps) {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [panelMode, setPanelMode] = useState<RecommendationPanelMode>(() =>
    (autoMode?.phase ?? 'off') !== 'off' ? 'auto' : 'suggestions',
  );
  const previousAutoPhaseRef = useRef(autoMode?.phase ?? 'off');

  // Use settings or defaults
  const compactMode = settings?.compactMode ?? false;
  const showOptimalRotation = settings?.showOptimalRotation ?? true;
  const showExpectedFinalState = settings?.showExpectedFinalState ?? true;
  const showForecastedConditions = settings?.showForecastedConditions ?? true;
  const maxAlternatives = settings?.maxAlternatives ?? 1;
  const maxRotationDisplay = settings?.maxRotationDisplay ?? 5;
  const showAutoModePanel = panelMode === 'auto';

  useEffect(() => {
    const currentPhase = autoMode?.phase ?? 'off';
    if (previousAutoPhaseRef.current === 'off' && currentPhase !== 'off') {
      setPanelMode('auto');
    }
    previousAutoPhaseRef.current = currentPhase;
  }, [autoMode?.phase]);

  // Panel not visible
  if (settings?.panelVisible === false) {
    return null;
  }

  const headerRightPadding = compactMode
    ? HEADER_PADDING_WITH_SETTINGS
    : HEADER_PADDING_WITH_SETTINGS_AND_LINKS;
  const leadingControls = !compactMode ? (
    <CommunityLinks isOpen={isSettingsOpen} />
  ) : undefined;
  const panelForegroundSx = {
    position: 'relative',
    zIndex: 1,
    pointerEvents: isSettingsOpen ? 'none' : 'auto',
    transform: isSettingsOpen
      ? 'translateX(-18px) scale(0.985)'
      : 'translateX(0) scale(1)',
    transformOrigin: 'left center',
    opacity: isSettingsOpen ? 0.18 : 1,
    filter: isSettingsOpen ? 'blur(7px) saturate(0.72)' : 'blur(0) saturate(1)',
    transition:
      'transform 0.38s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.22s ease, filter 0.3s ease',
  } as const;
  const suggestionsModeToggle = autoMode ? (
    <PanelModeToggle
      mode={panelMode}
      autoMode={autoMode}
      compact={compactMode}
      onToggle={() => setPanelMode('auto')}
    />
  ) : undefined;
  const autoModeToggle = autoMode ? (
    <PanelModeToggle
      mode={panelMode}
      autoMode={autoMode}
      compact={compactMode}
      onToggle={() => setPanelMode('suggestions')}
    />
  ) : undefined;
  const autoHeader = (
    <PanelHeading
      title="AutoBuddy"
      titleColor={AUTO_BUDDY_ACCENT}
      compact={compactMode}
      subtitle="Focused auto-crafting view"
      rightPadding={headerRightPadding}
      modeToggle={autoModeToggle}
    />
  );
  const renderAutoShell = ({
    content,
    variant = 'default',
    contentPaddingBottom = 0,
  }: {
    content: React.ReactNode;
    variant?: 'default' | 'success' | 'error';
    contentPaddingBottom?: number;
  }) => (
    <PanelContainer
      variant={variant}
      compact={compactMode}
      allowOverflowVisible={isSettingsOpen}
    >
      <Box sx={{ position: 'relative' }}>
        <SettingsPanel
          onSettingsChange={onSettingsChange}
          onSearchSettingsChange={onSearchSettingsChange}
          onOpenChange={setIsSettingsOpen}
          version={version}
          compact={compactMode}
          leadingControls={leadingControls}
        />

        <Box sx={panelForegroundSx}>
          <Box sx={{ pb: contentPaddingBottom }}>{content}</Box>
        </Box>
      </Box>
      <PanelVersionBadge version={version} visible={!isSettingsOpen} />
    </PanelContainer>
  );

  if (showAutoModePanel) {
    const timeBudgetMs = settings?.searchTimeBudgetMs ?? 2000;
    const versionFooterPadding = version && !isSettingsOpen ? 2.25 : 0;

    if (!result || isCalculating) {
      return renderAutoShell({
        contentPaddingBottom: versionFooterPadding,
        content: (
          <>
            {autoHeader}
            {autoMode && (
              <Box sx={{ mb: 1 }}>
                <AutoModeSection
                  autoMode={autoMode}
                  compact={compactMode}
                  loading
                  embedded
                  onArm={onAutoModeArm}
                  onStop={onAutoModeStop}
                  onPolicyChange={onAutoModePolicyChange}
                />
              </Box>
            )}
            <AutoBuddyLoadingCard
              compact={compactMode}
              title={autoMode?.statusTitle || 'Preparing auto mode'}
              detail={
                autoMode?.statusDetail ||
                'AutoBuddy is reading the craft state before the next action.'
              }
            />
            <SearchProgressBar durationMs={timeBudgetMs} />
          </>
        ),
      });
    }

    if (result.targetsMet) {
      return renderAutoShell({
        variant: 'success',
        contentPaddingBottom: versionFooterPadding,
        content: (
          <>
            {autoHeader}
            {autoMode && (
              <Box sx={{ mb: 1 }}>
                <AutoModeSection
                  autoMode={autoMode}
                  compact={compactMode}
                  embedded
                  onArm={onAutoModeArm}
                  onStop={onAutoModeStop}
                  onPolicyChange={onAutoModePolicyChange}
                />
              </Box>
            )}
            <AutoBuddySnapshotSection
              currentCompletion={currentCompletion}
              currentPerfection={currentPerfection}
              targetCompletion={targetCompletion}
              targetPerfection={targetPerfection}
              maxCompletionCap={maxCompletionCap}
              maxPerfectionCap={maxPerfectionCap}
              currentStability={currentStability}
              currentMaxStability={currentMaxStability}
              targetStability={targetStability}
              currentCondition={currentCondition}
              nextConditions={nextConditions}
              currentToxicity={currentToxicity}
              maxToxicity={maxToxicity}
            />
            <Box
              sx={{
                px: 1.05,
                py: 0.95,
                borderRadius: 1.45,
                border: `1px solid rgba(101, 232, 157, 0.34)`,
                background:
                  'linear-gradient(180deg, rgba(18, 54, 39, 0.86), rgba(9, 28, 20, 0.86))',
              }}
            >
              <FlexRow gap={0.75} align="center">
                <CheckCircleIcon
                  sx={{ color: colors.completion, fontSize: 20 }}
                />
                <Box sx={{ minWidth: 0 }}>
                  <Typography
                    variant="body2"
                    sx={{ color: colors.completion, fontWeight: 700 }}
                  >
                    Targets secured
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{
                      color: colors.textSecondary,
                      display: 'block',
                      mt: 0.2,
                      lineHeight: 1.35,
                    }}
                  >
                    AutoBuddy has nothing left to optimize here. Finish the
                    craft or move into the next recipe.
                  </Typography>
                </Box>
              </FlexRow>
            </Box>
          </>
        ),
      });
    }

    if (result.isTerminal || !result.recommendation) {
      return renderAutoShell({
        variant: 'error',
        contentPaddingBottom: versionFooterPadding,
        content: (
          <>
            {autoHeader}
            {autoMode && (
              <Box sx={{ mb: 1 }}>
                <AutoModeSection
                  autoMode={autoMode}
                  compact={compactMode}
                  embedded
                  onArm={onAutoModeArm}
                  onStop={onAutoModeStop}
                  onPolicyChange={onAutoModePolicyChange}
                />
              </Box>
            )}
            <AutoBuddySnapshotSection
              currentCompletion={currentCompletion}
              currentPerfection={currentPerfection}
              targetCompletion={targetCompletion}
              targetPerfection={targetPerfection}
              maxCompletionCap={maxCompletionCap}
              maxPerfectionCap={maxPerfectionCap}
              currentStability={currentStability}
              currentMaxStability={currentMaxStability}
              targetStability={targetStability}
              currentCondition={currentCondition}
              nextConditions={nextConditions}
              currentToxicity={currentToxicity}
              maxToxicity={maxToxicity}
            />
            <Box
              sx={{
                px: 1.05,
                py: 0.95,
                borderRadius: 1.45,
                border: `1px solid rgba(255, 109, 109, 0.28)`,
                background:
                  'linear-gradient(180deg, rgba(56, 20, 20, 0.86), rgba(28, 10, 10, 0.86))',
              }}
            >
              <Typography
                variant="body2"
                sx={{ color: colors.error, fontWeight: 700 }}
              >
                AutoBuddy needs manual input
              </Typography>
              <Typography
                variant="caption"
                sx={{
                  color: colors.textSecondary,
                  display: 'block',
                  mt: 0.3,
                  lineHeight: 1.35,
                }}
              >
                No safe automated action is available from the current state.
              </Typography>
              <BlockedReasonsSection
                blockedReasons={result.blockedReasons || []}
              />
            </Box>
          </>
        ),
      });
    }

    return renderAutoShell({
      content: (
        <>
          {onRecalculate && (
            <RecalculateButton
              visible={settingsStale}
              onClick={onRecalculate}
            />
          )}

          <Box sx={{ mb: 1.05 }}>
            {autoHeader}
            {autoMode && (
              <Box sx={{ mb: 1 }}>
                <AutoModeSection
                  autoMode={autoMode}
                  compact={compactMode}
                  embedded
                  onArm={onAutoModeArm}
                  onStop={onAutoModeStop}
                  onPolicyChange={onAutoModePolicyChange}
                />
              </Box>
            )}
            <AutoBuddySnapshotSection
              currentCompletion={currentCompletion}
              currentPerfection={currentPerfection}
              targetCompletion={targetCompletion}
              targetPerfection={targetPerfection}
              maxCompletionCap={maxCompletionCap}
              maxPerfectionCap={maxPerfectionCap}
              currentStability={currentStability}
              currentMaxStability={currentMaxStability}
              targetStability={targetStability}
              currentCondition={currentCondition}
              nextConditions={nextConditions}
              currentToxicity={currentToxicity}
              maxToxicity={maxToxicity}
            />
          </Box>

          <Box sx={{ mb: 0.75 }}>
            <SubSectionHeader>Recommended next action</SubSectionHeader>
            <Typography
              variant="caption"
              sx={{
                color: colors.textMuted,
                display: 'block',
                mt: 0.15,
                lineHeight: 1.35,
              }}
            >
              {autoMode?.armed
                ? 'AutoBuddy will execute this recommendation on the next valid craft input.'
                : 'Previewing the move AutoBuddy will take once you enable auto mode.'}
            </Typography>
          </Box>

          <SkillCard rec={result.recommendation} isPrimary compact />
        </>
      ),
    });
  }

  // No result yet - Loading state
  if (!result || isCalculating) {
    const timeBudgetMs = settings?.searchTimeBudgetMs ?? 2000;
    const versionFooterPadding = version && !isSettingsOpen ? 2.25 : 0;
    const shouldShowAutoLoadingPanel =
      showAutoModePanel || (autoMode?.phase ?? 'off') !== 'off';

    return (
      <PanelContainer compact={compactMode}>
        <Box sx={{ pb: versionFooterPadding }}>
          <LoadingHeader compact={compactMode} />
          {shouldShowAutoLoadingPanel && (
            <Box sx={{ mb: 1.1 }}>
              <AutoModeSection
                autoMode={autoMode}
                compact={compactMode}
                loading
                embedded
                onArm={onAutoModeArm}
                onStop={onAutoModeStop}
                onPolicyChange={onAutoModePolicyChange}
              />
            </Box>
          )}
          <LoadingSkeletonCard compact={compactMode} />
          <SearchProgressBar durationMs={timeBudgetMs} />
        </Box>
        <PanelVersionBadge version={version} visible={!isSettingsOpen} />
      </PanelContainer>
    );
  }

  // Targets met - Success state
  if (result.targetsMet) {
    return (
      <PanelContainer variant="success" compact={compactMode}>
        <FlexRow gap={1} sx={{ mb: 1 }}>
          <CheckCircleIcon sx={{ color: colors.completion, fontSize: 24 }} />
          <Typography variant="h6" sx={{ color: colors.completion }}>
            Targets Met!
          </Typography>
        </FlexRow>
        <Typography variant="body2" sx={{ color: colors.textSecondary }}>
          Completion: {currentCompletion}/{targetCompletion}
        </Typography>
        <Typography variant="body2" sx={{ color: colors.textSecondary }}>
          Perfection: {currentPerfection}/{targetPerfection}
        </Typography>
        <Typography
          variant="body2"
          sx={{ color: colors.completionLight, mt: 1 }}
        >
          You can finish crafting now!
        </Typography>
        {autoMode && (showAutoModePanel || autoMode.phase !== 'off') && (
          <Box sx={{ mt: 1.25 }}>
            <AutoModeSection
              autoMode={autoMode}
              compact={compactMode}
              embedded
              onArm={onAutoModeArm}
              onStop={onAutoModeStop}
              onPolicyChange={onAutoModePolicyChange}
            />
          </Box>
        )}
        <PanelVersionBadge version={version} visible={!isSettingsOpen} />
      </PanelContainer>
    );
  }

  // Terminal state - Error/blocked state
  if (result.isTerminal || !result.recommendation) {
    return (
      <PanelContainer variant="error" compact={compactMode}>
        <FlexRow gap={1} sx={{ mb: 1 }}>
          <WarningIcon sx={{ color: colors.error, fontSize: 24 }} />
          <Typography variant="h6" sx={{ color: colors.error }}>
            No Valid Actions
          </Typography>
        </FlexRow>
        <Typography variant="body2" sx={{ color: colors.textSecondary, mb: 1 }}>
          No skills can be used with current resources.
        </Typography>

        <BlockedReasonsSection blockedReasons={result.blockedReasons || []} />

        <Typography
          variant="body2"
          sx={{ color: 'rgba(255, 200, 200, 0.8)', mt: 1.5 }}
        >
          Consider finishing the craft or check your Qi/Stability.
        </Typography>
        {autoMode && (showAutoModePanel || autoMode.phase !== 'off') && (
          <Box sx={{ mt: 1.25 }}>
            <AutoModeSection
              autoMode={autoMode}
              compact={compactMode}
              embedded
              onArm={onAutoModeArm}
              onStop={onAutoModeStop}
              onPolicyChange={onAutoModePolicyChange}
            />
          </Box>
        )}
        <PanelVersionBadge version={version} visible={!isSettingsOpen} />
      </PanelContainer>
    );
  }

  // Normal recommendation state
  return (
    <PanelContainer compact={compactMode} allowOverflowVisible={isSettingsOpen}>
      <Box sx={{ position: 'relative' }}>
        {/* Settings Panel */}
        <SettingsPanel
          onSettingsChange={onSettingsChange}
          onSearchSettingsChange={onSearchSettingsChange}
          onOpenChange={setIsSettingsOpen}
          version={version}
          compact={compactMode}
          leadingControls={leadingControls}
        />

        <Box sx={panelForegroundSx}>
          {/* Recalculate button when search settings changed */}
          {onRecalculate && (
            <RecalculateButton
              visible={settingsStale}
              onClick={onRecalculate}
            />
          )}

          <Box sx={{ mb: 1.2 }}>
            <PanelHeading
              title="CraftBuddy"
              titleColor={colors.gold}
              compact={compactMode}
              rightPadding={headerRightPadding}
              modeToggle={suggestionsModeToggle}
            />

            {showAutoModePanel && autoMode && (
              <Box sx={{ mb: 1.15 }}>
                <AutoModeSection
                  autoMode={autoMode}
                  compact={compactMode}
                  embedded
                  onArm={onAutoModeArm}
                  onStop={onAutoModeStop}
                  onPolicyChange={onAutoModePolicyChange}
                />
              </Box>
            )}

            <ProgressSection
              currentCompletion={currentCompletion}
              currentPerfection={currentPerfection}
              targetCompletion={targetCompletion}
              targetPerfection={targetPerfection}
              maxCompletionCap={maxCompletionCap}
              maxPerfectionCap={maxPerfectionCap}
              currentStability={currentStability}
              currentMaxStability={currentMaxStability}
              targetStability={targetStability}
              currentToxicity={currentToxicity}
              maxToxicity={maxToxicity}
            />

            {showForecastedConditions && !compactMode && (
              <ConditionsSection
                currentCondition={currentCondition}
                nextConditions={nextConditions}
              />
            )}
          </Box>

          {/* Primary recommendation */}
          <SkillCard
            rec={result.recommendation}
            isPrimary
            compact={compactMode}
            onPrimaryAction={
              !showAutoModePanel ? onRecommendationAction : undefined
            }
          />

          {/* Optimal rotation preview */}
          {showOptimalRotation && result.optimalRotation && !compactMode && (
            <RotationSection
              rotation={result.optimalRotation}
              maxDisplay={maxRotationDisplay}
            />
          )}

          {/* Expected final state */}
          {showExpectedFinalState &&
            result.expectedFinalState &&
            !compactMode && (
              <FinalStateSection
                state={result.expectedFinalState}
                targetCompletion={targetCompletion}
                targetPerfection={targetPerfection}
                turnsCount={result.optimalRotation?.length || 1}
              />
            )}

          {/* Alternative skills */}
          {maxAlternatives > 0 &&
            result.alternativeSkills.length > 0 &&
            !compactMode && (
              <>
                <GradientDivider />
                <SubSectionHeader>Alternatives:</SubSectionHeader>
                {result.alternativeSkills
                  .slice(0, maxAlternatives)
                  .map((rec, idx) => (
                    <SkillCard
                      key={idx}
                      rec={rec}
                      showQuality
                      onPrimaryAction={
                        !showAutoModePanel ? onRecommendationAction : undefined
                      }
                    />
                  ))}
              </>
            )}

          {/* Hotkey hints */}
          {!compactMode && (
            <HotkeyHints
              hints={[
                { key: 'Ctrl+Shift+C', action: 'Hide' },
                { key: 'Ctrl+Shift+M', action: 'Compact' },
              ]}
            />
          )}

          <PanelVersionBadge version={version} visible={!isSettingsOpen} />
        </Box>
      </Box>
    </PanelContainer>
  );
}

export default RecommendationPanel;
