/**
 * CraftBuddy - Recommendation Panel UI Component
 *
 * Displays the recommended next skill during crafting with expected gains
 * and reasoning. Uses themed components for consistent styling.
 */

import React, { memo, useMemo, useState } from 'react';
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
} from '@mui/icons-material';
import { FaDiscord, FaGithub, FaSteam } from 'react-icons/fa';
import {
  SearchResult,
  SkillRecommendation,
  CraftingConditionType,
} from '../optimizer';
import { CraftBuddySettings } from '../settings';
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
  RecalculateButton,
} from './components';
import {
  fadeInUp,
  transitions,
  versionBadgeReveal,
  holographicSweep,
} from './animations';

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
  /** Mod version shown in panel footer */
  version?: string;
}

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
          'border-radius 0.26s cubic-bezier(0.4, 0, 0.2, 1), padding 0.26s cubic-bezier(0.4, 0, 0.2, 1), box-shadow 0.26s cubic-bezier(0.4, 0, 0.2, 1), border-color 0.2s ease',
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
        transition:
          'opacity 0.14s ease, transform 0.14s ease, filter 0.14s ease, text-shadow 0.18s ease',
        animation: visible
          ? `${versionBadgeReveal} 0.58s cubic-bezier(0.25, 0.9, 0.3, 1) both`
          : 'none',
        '&::after': {
          content: '""',
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background:
            'linear-gradient(110deg, transparent 22%, rgba(152, 218, 255, 0.2) 42%, rgba(255, 236, 166, 0.45) 50%, rgba(152, 218, 255, 0.2) 58%, transparent 78%)',
          mixBlendMode: 'screen',
          opacity: visible ? 1 : 0,
          transform: 'translateX(-130%)',
          animation: visible
            ? `${holographicSweep} 0.72s cubic-bezier(0.3, 0, 0.2, 1) 0.06s 1 both`
            : 'none',
        },
      }}
    >
      {versionLabel}
    </Typography>
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
  gains,
  projectedGains,
  icon,
  qiCost = 0,
  stabilityCost = 0,
  buffGranted,
  buffDuration = 0,
  isPrimary = false,
  isFollowUp = false,
  consumesBuff = false,
  reasoning,
}: {
  name: string;
  type: string;
  gains: { completion: number; perfection: number; stability: number };
  projectedGains?: { completion: number; perfection: number; stability: number };
  icon?: string;
  qiCost?: number;
  stabilityCost?: number;
  buffGranted?: string;
  buffDuration?: number;
  isPrimary?: boolean;
  isFollowUp?: boolean;
  consumesBuff?: boolean;
  reasoning?: string;
}) {
  const typeColor = getSkillTypeColor(type);
  const iconSize = isFollowUp ? 'small' : isPrimary ? 'large' : 'medium';

  return (
    <SkillCardContainer
      isPrimary={isPrimary}
      isFollowUp={isFollowUp}
      skillType={type}
      animate={isPrimary && !isFollowUp}
    >
      <FlexRow gap={1.5} align="flex-start">
        <SkillIcon
          src={icon}
          name={name}
          size={iconSize}
          typeColor={typeColor}
        />

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

      {/* Reasoning - only for primary skill */}
      {reasoning && isPrimary && !isFollowUp && (
        <Typography
          variant="body2"
          sx={{
            color: colors.textSecondary,
            fontStyle: 'italic',
            fontSize: '0.8rem',
            mt: 0.75,
          }}
        >
          {reasoning}
        </Typography>
      )}
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
}: {
  rec: SkillRecommendation;
  isPrimary?: boolean;
  showQuality?: boolean;
}) {
  const qualityRating = rec.qualityRating ?? 100;
  const hasFollowUp = rec.followUpSkill !== undefined;

  const skill = rec.skill;
  const qiCost = skill.qiCost || 0;
  const stabilityCost = skill.stabilityCost || 0;
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
      <FlexRow align="stretch" gap={0.5}>
        <Box sx={{ flex: 1 }}>
          <SingleSkillBox
            name={rec.skill.name}
            type={rec.skill.type}
            gains={rec.immediateGains}
            projectedGains={rec.expectedGains}
            icon={rec.skill.icon}
            qiCost={qiCost}
            stabilityCost={stabilityCost}
            buffGranted={buffGranted}
            buffDuration={buffDuration}
            isPrimary={isPrimary}
            isFollowUp={false}
            consumesBuff={rec.consumesBuff}
            reasoning={!hasFollowUp ? rec.reasoning : undefined}
          />
        </Box>

        {/* Follow-up skill */}
        {hasFollowUp && rec.followUpSkill && (
          <>
            <SequenceArrow />
            <Box sx={{ flex: 1 }}>
              <SingleSkillBox
                name={rec.followUpSkill.name}
                type={rec.followUpSkill.type}
                gains={rec.followUpSkill.immediateGains}
                projectedGains={rec.followUpSkill.expectedGains}
                icon={rec.followUpSkill.icon}
                isPrimary={isPrimary}
                isFollowUp={true}
              />
            </Box>
          </>
        )}
      </FlexRow>

      {/* Reasoning below the skill boxes if there's a follow-up */}
      {hasFollowUp && rec.reasoning && isPrimary && (
        <Typography
          variant="body2"
          sx={{
            color: colors.textSecondary,
            fontStyle: 'italic',
            fontSize: '0.8rem',
            mt: 0.5,
          }}
        >
          {rec.reasoning}
        </Typography>
      )}
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
    turnsRemaining: number;
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
          Stab: {formatGain(state.stability)}
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
  version,
}: RecommendationPanelProps) {
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Use settings or defaults
  const compactMode = settings?.compactMode ?? false;
  const showOptimalRotation = settings?.showOptimalRotation ?? true;
  const showExpectedFinalState = settings?.showExpectedFinalState ?? true;
  const showForecastedConditions = settings?.showForecastedConditions ?? true;
  const maxAlternatives = settings?.maxAlternatives ?? 2;
  const maxRotationDisplay = settings?.maxRotationDisplay ?? 5;

  // Panel not visible
  if (settings?.panelVisible === false) {
    return null;
  }

  // No result yet - Loading state
  if (!result || isCalculating) {
    return (
      <PanelContainer compact={compactMode}>
        <LoadingHeader compact={compactMode} />
        <LoadingSkeletonCard />
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
        <PanelVersionBadge version={version} visible={!isSettingsOpen} />
      </PanelContainer>
    );
  }

  // Normal recommendation state
  return (
    <PanelContainer compact={compactMode}>
      {/* Settings Panel */}
      <SettingsPanel
        onSettingsChange={onSettingsChange}
        onSearchSettingsChange={onSearchSettingsChange}
        onOpenChange={setIsSettingsOpen}
        version={version}
        leadingControls={
          !compactMode ? <CommunityLinks isOpen={isSettingsOpen} /> : undefined
        }
      />

      {/* Recalculate button when search settings changed */}
      {onRecalculate && (
        <RecalculateButton visible={settingsStale} onClick={onRecalculate} />
      )}

      <SectionHeader color={colors.gold} compact={compactMode}>
        {compactMode ? 'CraftBuddy' : 'CraftBuddy Suggestions'}
      </SectionHeader>

      {/* Progress display */}
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

      {/* Conditions display */}
      {showForecastedConditions && !compactMode && (
        <ConditionsSection
          currentCondition={currentCondition}
          nextConditions={nextConditions}
        />
      )}

      {/* Primary recommendation */}
      <SkillCard rec={result.recommendation} isPrimary />

      {/* Optimal rotation preview */}
      {showOptimalRotation && result.optimalRotation && !compactMode && (
        <RotationSection
          rotation={result.optimalRotation}
          maxDisplay={maxRotationDisplay}
        />
      )}

      {/* Expected final state */}
      {showExpectedFinalState && result.expectedFinalState && !compactMode && (
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
                <SkillCard key={idx} rec={rec} showQuality />
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
    </PanelContainer>
  );
}

export default RecommendationPanel;
