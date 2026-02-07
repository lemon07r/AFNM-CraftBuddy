/**
 * CraftBuddy - Recommendation Panel UI Component
 *
 * Displays the recommended next skill during crafting with expected gains
 * and reasoning.
 */

import React from 'react';
import { Box, Typography, Paper, Chip, Divider, Avatar } from '@mui/material';
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

/**
 * Format a gain value for display, using compact notation for large numbers.
 */
function formatGain(value: number): string {
  if (value >= LARGE_NUMBER_THRESHOLD) {
    return formatLargeNumber(value, 1);
  }
  return value.toLocaleString();
}

// Skill type colors matching game UI
const SKILL_TYPE_COLORS: Record<string, string> = {
  fusion: '#00ff00', // lime/green
  refine: '#00ffff', // cyan
  stabilize: '#ffa500', // orange
  support: '#eb34db', // pink/magenta
};

// Quality rating colors (0-100 scale)
function getQualityColor(rating: number): string {
  if (rating >= 90) return '#00ff00'; // Excellent - bright green
  if (rating >= 70) return '#90EE90'; // Good - light green
  if (rating >= 50) return '#FFD700'; // Okay - gold
  if (rating >= 30) return '#FFA500'; // Poor - orange
  return '#FF6B6B'; // Bad - red
}

function getQualityLabel(rating: number): string {
  if (rating >= 90) return 'Optimal';
  if (rating >= 70) return 'Good';
  if (rating >= 50) return 'Okay';
  if (rating >= 30) return 'Suboptimal';
  return 'Poor';
}

// Condition colors matching game UI
const CONDITION_COLORS: Record<CraftingConditionType, string> = {
  veryPositive: '#00ff00', // bright green
  positive: '#90EE90', // light green
  neutral: '#ffffff', // white
  negative: '#FFA500', // orange
  veryNegative: '#FF6B6B', // red
};

const CONDITION_NAMES: Record<CraftingConditionType, string> = {
  veryPositive: 'Excellent',
  positive: 'Good',
  neutral: 'Normal',
  negative: 'Poor',
  veryNegative: 'Terrible',
};

interface RecommendationPanelProps {
  result: SearchResult | null;
  currentCompletion?: number;
  currentPerfection?: number;
  targetCompletion?: number;
  targetPerfection?: number;
  /** Optional hard completion cap from game mechanics */
  maxCompletionCap?: number;
  /** Optional hard perfection cap from game mechanics */
  maxPerfectionCap?: number;
  currentStability?: number;
  /** Current max stability (decreases each turn) */
  currentMaxStability?: number;
  /** Initial/target max stability from recipe */
  targetStability?: number;
  /** Current crafting condition */
  currentCondition?: CraftingConditionType;
  /** Upcoming crafting conditions (for future turns) */
  nextConditions?: CraftingConditionType[];
  /** Current toxicity for alchemy crafting */
  currentToxicity?: number;
  /** Max toxicity threshold */
  maxToxicity?: number;
  /** Current crafting type */
  craftingType?: 'forge' | 'alchemical' | 'inscription' | 'resonance';
  /** Current settings */
  settings?: CraftBuddySettings;
  /** Callback when settings change */
  onSettingsChange?: (settings: CraftBuddySettings) => void;
}

/**
 * Compact skill display for half-width layout
 * Layout: Large icon on left, info on right
 */
function CompactSkillDisplay({
  name,
  type,
  gains,
  icon,
  isFollowUp = false,
}: {
  name: string;
  type: string;
  gains: { completion: number; perfection: number; stability: number };
  icon?: string;
  isFollowUp?: boolean;
}) {
  const typeColor = SKILL_TYPE_COLORS[type] || '#ffffff';

  // Icon sizes: current turn fills 3 rows (~56px in compact), follow-up fills 2 rows (~40px)
  const iconSize = isFollowUp ? 40 : 56;

  return (
    <Box
      sx={{
        flex: 1,
        minWidth: 0,
        p: 0.75,
        borderRadius: 1,
        backgroundColor: isFollowUp
          ? 'rgba(40, 40, 40, 0.5)'
          : 'rgba(0, 80, 0, 0.3)',
        border: isFollowUp
          ? '1px solid rgba(80, 80, 80, 0.5)'
          : '1px solid rgba(0, 200, 0, 0.4)',
      }}
    >
      {/* Main layout: Icon on left, info on right */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
        {/* Large skill icon */}
        {icon && (
          <Avatar
            src={icon}
            alt={name}
            variant="rounded"
            sx={{
              width: iconSize,
              height: iconSize,
              border: `2px solid ${typeColor}60`,
              borderRadius: 1,
              flexShrink: 0,
            }}
          />
        )}

        {/* Info section on the right */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {/* Skill name */}
          <Typography
            variant="body2"
            sx={{
              color: typeColor,
              fontWeight: 'bold',
              fontSize: '0.85rem',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {name}
          </Typography>

          {/* Gains row */}
          <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap', mt: 0.25 }}>
            {gains.completion > 0 && (
              <Typography variant="caption" sx={{ color: '#90EE90' }}>
                +{formatGain(gains.completion)} Completion
              </Typography>
            )}
            {gains.perfection > 0 && (
              <Typography variant="caption" sx={{ color: '#87CEEB' }}>
                +{formatGain(gains.perfection)} Perfection
              </Typography>
            )}
            {gains.stability > 0 && (
              <Typography variant="caption" sx={{ color: '#FFA500' }}>
                +{formatGain(gains.stability)} Stability
              </Typography>
            )}
          </Box>
        </Box>
      </Box>
    </Box>
  );
}

/**
 * Single skill box component - displays one skill with its gains and costs
 * Layout: Large icon on left filling all rows, tooltip info on right
 */
function SingleSkillBox({
  name,
  type,
  gains,
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
  const typeColor = SKILL_TYPE_COLORS[type] || '#ffffff';

  // Border and background colors based on type
  let borderColor: string;
  let bgColor: string;

  if (isPrimary && !isFollowUp) {
    // Primary recommendation
    borderColor = 'rgba(0, 200, 0, 0.6)';
    bgColor = 'rgba(0, 80, 0, 0.3)';
  } else if (isFollowUp) {
    // Follow-up skill (slightly muted)
    borderColor = 'rgba(100, 150, 100, 0.5)';
    bgColor = 'rgba(40, 60, 40, 0.3)';
  } else {
    // Alternative skill
    borderColor = 'rgba(100, 100, 100, 0.5)';
    bgColor = 'rgba(50, 50, 50, 0.4)';
  }

  // Icon sizes: current turn fills 3 rows (~72px for primary, ~56px for alternatives), follow-up (next turn) fills 2 rows (~48px)
  // For alternatives: current turn should be larger than follow-up
  const iconSize = isFollowUp ? 48 : isPrimary ? 72 : 56;

  return (
    <Box
      sx={{
        p: 1,
        borderRadius: 1,
        backgroundColor: bgColor,
        border: `1px solid ${borderColor}`,
      }}
    >
      {/* Main layout: Icon on left, info on right */}
      <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1.5 }}>
        {/* Large skill icon */}
        {icon && (
          <Avatar
            src={icon}
            alt={name}
            variant="rounded"
            sx={{
              width: iconSize,
              height: iconSize,
              border: `2px solid ${typeColor}60`,
              borderRadius: 1,
              flexShrink: 0,
            }}
          />
        )}

        {/* Info section on the right */}
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {/* Skill name */}
          <Typography
            variant="body2"
            sx={{
              color: typeColor,
              fontWeight: 'bold',
              fontSize: isPrimary && !isFollowUp ? '0.95rem' : '0.85rem',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {name}
          </Typography>

          {/* Costs row */}
          <Box sx={{ display: 'flex', gap: 0.75, mt: 0.25, flexWrap: 'wrap' }}>
            {qiCost > 0 && (
              <Typography variant="caption" sx={{ color: '#ADD8E6' }}>
                {qiCost} Qi
              </Typography>
            )}
            {stabilityCost > 0 && (
              <Typography variant="caption" sx={{ color: '#FFB6C1' }}>
                -{stabilityCost} Stab
              </Typography>
            )}
          </Box>

          {/* Gains row */}
          <Box sx={{ display: 'flex', gap: 0.75, mt: 0.25, flexWrap: 'wrap' }}>
            {gains.completion > 0 && (
              <Typography variant="caption" sx={{ color: '#90EE90' }}>
                +{formatGain(gains.completion)} Completion
              </Typography>
            )}
            {gains.perfection > 0 && (
              <Typography variant="caption" sx={{ color: '#87CEEB' }}>
                +{formatGain(gains.perfection)} Perfection
              </Typography>
            )}
            {gains.stability > 0 && (
              <Typography variant="caption" sx={{ color: '#FFA500' }}>
                +{formatGain(gains.stability)} Stability
              </Typography>
            )}
          </Box>

          {/* Buff indicators row */}
          <Box sx={{ display: 'flex', gap: 0.5, mt: 0.25, flexWrap: 'wrap' }}>
            {/* Buff granted indicator */}
            {buffGranted && buffDuration > 0 && (
              <Chip
                icon={<AutoAwesomeIcon sx={{ fontSize: 12 }} />}
                label={`${buffGranted} x${buffDuration}`}
                size="small"
                sx={{
                  backgroundColor: buffGranted.toLowerCase().includes('control')
                    ? '#87CEEB'
                    : '#90EE90',
                  color: '#000',
                  fontSize: '0.6rem',
                  height: 18,
                  '& .MuiChip-icon': { color: '#000' },
                }}
              />
            )}

            {/* Buff consumer indicator */}
            {consumesBuff && (
              <Chip
                icon={<ElectricBoltIcon sx={{ fontSize: 12 }} />}
                label="Uses Buff"
                size="small"
                sx={{
                  backgroundColor: '#FFD700',
                  color: '#000',
                  fontSize: '0.6rem',
                  height: 18,
                  '& .MuiChip-icon': { color: '#000' },
                }}
              />
            )}
          </Box>
        </Box>
      </Box>

      {/* Reasoning - only for primary skill, below the main content */}
      {reasoning && isPrimary && !isFollowUp && (
        <Typography
          variant="body2"
          sx={{
            color: 'rgba(255, 255, 255, 0.7)',
            fontStyle: 'italic',
            fontSize: '0.8rem',
            mt: 0.75,
          }}
        >
          {reasoning}
        </Typography>
      )}
    </Box>
  );
}

// Helper to get buff name from BuffType enum
function getBuffName(buffType: number): string | undefined {
  // BuffType enum: NONE = 0, CONTROL = 1, INTENSITY = 2
  if (buffType === 1) return 'Control';
  if (buffType === 2) return 'Intensity';
  return undefined;
}

/**
 * Formats a skill recommendation for display with follow-up skill
 * Primary and follow-up skills are displayed side-by-side (first skill → second skill)
 */
function SkillCard({
  rec,
  isPrimary = false,
  showQuality = false,
}: {
  rec: SkillRecommendation;
  isPrimary?: boolean;
  showQuality?: boolean;
}) {
  const qualityRating = rec.qualityRating ?? 100;
  const qualityColor = getQualityColor(qualityRating);
  const hasFollowUp = rec.followUpSkill !== undefined;

  // Extract skill costs and buff info
  const skill = rec.skill;
  const qiCost = skill.qiCost || 0;
  const stabilityCost = skill.stabilityCost || 0;
  const buffGranted = getBuffName(skill.buffType);
  const buffDuration = skill.buffDuration || 0;

  return (
    <Box sx={{ mb: 1 }}>
      {/* Quality rating for alternatives */}
      {showQuality && !isPrimary && (
        <Chip
          label={`${qualityRating}% ${getQualityLabel(qualityRating)}`}
          size="small"
          sx={{
            backgroundColor: 'transparent',
            color: qualityColor,
            border: `1px solid ${qualityColor}`,
            fontSize: '0.65rem',
            height: 18,
            mb: 0.5,
          }}
        />
      )}

      {/* Skills displayed side-by-side: first skill → second skill */}
      <Box sx={{ display: 'flex', alignItems: 'stretch', gap: 0.5 }}>
        {/* Primary skill box */}
        <Box sx={{ flex: 1 }}>
          <SingleSkillBox
            name={rec.skill.name}
            type={rec.skill.type}
            gains={rec.expectedGains}
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

        {/* Arrow and follow-up skill box (side-by-side) */}
        {hasFollowUp && rec.followUpSkill && (
          <>
            <Box sx={{ display: 'flex', alignItems: 'center', px: 0.25 }}>
              <Typography
                sx={{ color: 'rgba(255, 255, 255, 0.5)', fontSize: '1rem' }}
              >
                →
              </Typography>
            </Box>
            <Box sx={{ flex: 1 }}>
              <SingleSkillBox
                name={rec.followUpSkill.name}
                type={rec.followUpSkill.type}
                gains={rec.followUpSkill.expectedGains}
                icon={rec.followUpSkill.icon}
                isPrimary={isPrimary}
                isFollowUp={true}
              />
            </Box>
          </>
        )}
      </Box>

      {/* Reasoning below the skill boxes if there's a follow-up */}
      {hasFollowUp && rec.reasoning && isPrimary && (
        <Typography
          variant="body2"
          sx={{
            color: 'rgba(255, 255, 255, 0.7)',
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
}

/**
 * Main recommendation panel component
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
}: RecommendationPanelProps) {
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

  // No result yet
  if (!result) {
    return (
      <Paper
        sx={{
          p: 2,
          backgroundColor: 'rgba(30, 30, 30, 0.9)',
          border: '1px solid rgba(100, 100, 100, 0.5)',
          borderRadius: 2,
        }}
      >
        <Typography variant="h6" sx={{ color: '#FFD700', mb: 1 }}>
          CraftBuddy
        </Typography>
        <Typography variant="body2" sx={{ color: 'rgba(255, 255, 255, 0.6)' }}>
          Analyzing crafting state...
        </Typography>
      </Paper>
    );
  }

  // Targets met
  if (result.targetsMet) {
    return (
      <Paper
        sx={{
          p: 2,
          backgroundColor: 'rgba(0, 50, 0, 0.9)',
          border: '2px solid rgba(0, 255, 0, 0.7)',
          borderRadius: 2,
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <CheckCircleIcon sx={{ color: '#00FF00', fontSize: 24 }} />
          <Typography variant="h6" sx={{ color: '#00FF00' }}>
            Targets Met!
          </Typography>
        </Box>
        <Typography variant="body2" sx={{ color: 'rgba(255, 255, 255, 0.8)' }}>
          Completion: {currentCompletion}/{targetCompletion}
        </Typography>
        <Typography variant="body2" sx={{ color: 'rgba(255, 255, 255, 0.8)' }}>
          Perfection: {currentPerfection}/{targetPerfection}
        </Typography>
        <Typography variant="body2" sx={{ color: '#90EE90', mt: 1 }}>
          You can finish crafting now!
        </Typography>
      </Paper>
    );
  }

  // Terminal state (no valid moves)
  if (result.isTerminal || !result.recommendation) {
    const blockedReasons = result.blockedReasons || [];

    // Group blocked reasons by type for better display
    const qiBlocked = blockedReasons.filter((r) => r.reason === 'qi');
    const stabilityBlocked = blockedReasons.filter(
      (r) => r.reason === 'stability',
    );
    const cooldownBlocked = blockedReasons.filter(
      (r) => r.reason === 'cooldown',
    );
    const conditionBlocked = blockedReasons.filter(
      (r) => r.reason === 'condition',
    );
    const toxicityBlocked = blockedReasons.filter(
      (r) => r.reason === 'toxicity',
    );

    return (
      <Paper
        sx={{
          p: 2,
          backgroundColor: 'rgba(50, 0, 0, 0.9)',
          border: '2px solid rgba(255, 0, 0, 0.7)',
          borderRadius: 2,
          maxHeight: 400,
          overflow: 'auto',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1 }}>
          <WarningIcon sx={{ color: '#FF6B6B', fontSize: 24 }} />
          <Typography variant="h6" sx={{ color: '#FF6B6B' }}>
            No Valid Actions
          </Typography>
        </Box>
        <Typography
          variant="body2"
          sx={{ color: 'rgba(255, 255, 255, 0.8)', mb: 1 }}
        >
          No skills can be used with current resources.
        </Typography>

        {/* Show diagnostic info if available */}
        {blockedReasons.length > 0 && (
          <Box sx={{ mt: 1.5 }}>
            <Typography
              variant="body2"
              sx={{
                color: 'rgba(255, 200, 200, 0.9)',
                fontWeight: 'bold',
                mb: 1,
              }}
            >
              Why skills are blocked:
            </Typography>

            {/* Qi blocked skills */}
            {qiBlocked.length > 0 && (
              <Box sx={{ mb: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <WaterDropIcon sx={{ color: '#87CEEB', fontSize: 14 }} />
                  <Typography
                    variant="caption"
                    sx={{ color: '#87CEEB', fontWeight: 'bold' }}
                  >
                    Insufficient Qi ({qiBlocked.length} skills):
                  </Typography>
                </Box>
                <Box sx={{ pl: 1, mt: 0.5 }}>
                  {qiBlocked.slice(0, 3).map((r, i) => (
                    <Typography
                      key={i}
                      variant="caption"
                      sx={{
                        color: 'rgba(255, 255, 255, 0.7)',
                        display: 'block',
                      }}
                    >
                      • {r.skillName}: {r.details}
                    </Typography>
                  ))}
                  {qiBlocked.length > 3 && (
                    <Typography
                      variant="caption"
                      sx={{ color: 'rgba(255, 255, 255, 0.5)' }}
                    >
                      ...and {qiBlocked.length - 3} more
                    </Typography>
                  )}
                </Box>
              </Box>
            )}

            {/* Stability blocked skills */}
            {stabilityBlocked.length > 0 && (
              <Box sx={{ mb: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <ShieldIcon sx={{ color: '#FFA500', fontSize: 14 }} />
                  <Typography
                    variant="caption"
                    sx={{ color: '#FFA500', fontWeight: 'bold' }}
                  >
                    Stability too low ({stabilityBlocked.length} skills):
                  </Typography>
                </Box>
                <Box sx={{ pl: 1, mt: 0.5 }}>
                  {stabilityBlocked.slice(0, 3).map((r, i) => (
                    <Typography
                      key={i}
                      variant="caption"
                      sx={{
                        color: 'rgba(255, 255, 255, 0.7)',
                        display: 'block',
                      }}
                    >
                      • {r.skillName}: {r.details}
                    </Typography>
                  ))}
                  {stabilityBlocked.length > 3 && (
                    <Typography
                      variant="caption"
                      sx={{ color: 'rgba(255, 255, 255, 0.5)' }}
                    >
                      ...and {stabilityBlocked.length - 3} more
                    </Typography>
                  )}
                </Box>
              </Box>
            )}

            {/* Cooldown blocked skills */}
            {cooldownBlocked.length > 0 && (
              <Box sx={{ mb: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <TimerIcon sx={{ color: '#9370DB', fontSize: 14 }} />
                  <Typography
                    variant="caption"
                    sx={{ color: '#9370DB', fontWeight: 'bold' }}
                  >
                    On Cooldown ({cooldownBlocked.length} skills):
                  </Typography>
                </Box>
                <Box sx={{ pl: 1, mt: 0.5 }}>
                  {cooldownBlocked.slice(0, 3).map((r, i) => (
                    <Typography
                      key={i}
                      variant="caption"
                      sx={{
                        color: 'rgba(255, 255, 255, 0.7)',
                        display: 'block',
                      }}
                    >
                      • {r.skillName}: {r.details}
                    </Typography>
                  ))}
                  {cooldownBlocked.length > 3 && (
                    <Typography
                      variant="caption"
                      sx={{ color: 'rgba(255, 255, 255, 0.5)' }}
                    >
                      ...and {cooldownBlocked.length - 3} more
                    </Typography>
                  )}
                </Box>
              </Box>
            )}

            {/* Condition blocked skills */}
            {conditionBlocked.length > 0 && (
              <Box sx={{ mb: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <StarsIcon sx={{ color: '#90EE90', fontSize: 14 }} />
                  <Typography
                    variant="caption"
                    sx={{ color: '#90EE90', fontWeight: 'bold' }}
                  >
                    Wrong Condition ({conditionBlocked.length} skills):
                  </Typography>
                </Box>
                <Box sx={{ pl: 1, mt: 0.5 }}>
                  {conditionBlocked.slice(0, 3).map((r, i) => (
                    <Typography
                      key={i}
                      variant="caption"
                      sx={{
                        color: 'rgba(255, 255, 255, 0.7)',
                        display: 'block',
                      }}
                    >
                      • {r.skillName}: {r.details}
                    </Typography>
                  ))}
                  {conditionBlocked.length > 3 && (
                    <Typography
                      variant="caption"
                      sx={{ color: 'rgba(255, 255, 255, 0.5)' }}
                    >
                      ...and {conditionBlocked.length - 3} more
                    </Typography>
                  )}
                </Box>
              </Box>
            )}

            {/* Toxicity blocked skills */}
            {toxicityBlocked.length > 0 && (
              <Box sx={{ mb: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <DangerousIcon sx={{ color: '#FF6B6B', fontSize: 14 }} />
                  <Typography
                    variant="caption"
                    sx={{ color: '#FF6B6B', fontWeight: 'bold' }}
                  >
                    Toxicity Limit ({toxicityBlocked.length} skills):
                  </Typography>
                </Box>
                <Box sx={{ pl: 1, mt: 0.5 }}>
                  {toxicityBlocked.slice(0, 3).map((r, i) => (
                    <Typography
                      key={i}
                      variant="caption"
                      sx={{
                        color: 'rgba(255, 255, 255, 0.7)',
                        display: 'block',
                      }}
                    >
                      • {r.skillName}: {r.details}
                    </Typography>
                  ))}
                  {toxicityBlocked.length > 3 && (
                    <Typography
                      variant="caption"
                      sx={{ color: 'rgba(255, 255, 255, 0.5)' }}
                    >
                      ...and {toxicityBlocked.length - 3} more
                    </Typography>
                  )}
                </Box>
              </Box>
            )}
          </Box>
        )}

        <Typography
          variant="body2"
          sx={{ color: 'rgba(255, 200, 200, 0.8)', mt: 1.5 }}
        >
          Consider finishing the craft or check your Qi/Stability.
        </Typography>
      </Paper>
    );
  }

  // Normal recommendation
  return (
    <Paper
      sx={{
        position: 'relative',
        p: compactMode ? 1.5 : 2,
        backgroundColor: 'rgba(30, 30, 30, 0.95)',
        border: '1px solid rgba(100, 100, 100, 0.5)',
        borderRadius: 2,
        minWidth: compactMode ? 280 : 350,
      }}
    >
      {/* Settings Panel */}
      <SettingsPanel onSettingsChange={onSettingsChange} />
      <Typography
        variant={compactMode ? 'subtitle1' : 'h6'}
        sx={{ color: '#FFD700', mb: compactMode ? 1 : 1.5 }}
      >
        {compactMode ? 'CraftBuddy' : 'CraftBuddy Suggestions'}
      </Typography>

      {/* Progress display */}
      {(targetCompletion > 0 || targetPerfection > 0) && (
        <Box sx={{ mb: 1.5 }}>
          <Typography
            variant="body2"
            sx={{ color: 'rgba(255, 255, 255, 0.6)' }}
          >
            Completion: {formatProgress(currentCompletion, targetCompletion)} |
            Perfection: {formatProgress(currentPerfection, targetPerfection)}
          </Typography>
          {(maxCompletionCap !== undefined ||
            maxPerfectionCap !== undefined) && (
            <Typography
              variant="body2"
              sx={{ color: 'rgba(180, 220, 255, 0.7)' }}
            >
              Caps: {formatGain(maxCompletionCap ?? targetCompletion)}{' '}
              completion / {formatGain(maxPerfectionCap ?? targetPerfection)}{' '}
              perfection
            </Typography>
          )}
          {targetStability > 0 && (
            <Typography
              variant="body2"
              sx={{
                color:
                  currentStability < 20
                    ? '#FFA500'
                    : 'rgba(255, 255, 255, 0.6)',
              }}
            >
              Stability:{' '}
              {formatProgress(
                currentStability,
                currentMaxStability > 0 ? currentMaxStability : targetStability,
              )}
              {currentMaxStability > 0 &&
                currentMaxStability < targetStability && (
                  <span
                    style={{ color: 'rgba(255, 165, 0, 0.7)', marginLeft: 4 }}
                  >
                    (max decayed from {formatGain(targetStability)})
                  </span>
                )}
            </Typography>
          )}
          {/* Toxicity display for alchemy crafting */}
          {maxToxicity > 0 && (
            <Typography
              variant="body2"
              sx={{
                color:
                  currentToxicity >= maxToxicity * 0.8
                    ? '#FF6B6B'
                    : currentToxicity >= maxToxicity * 0.5
                      ? '#FFA500'
                      : 'rgba(255, 255, 255, 0.6)',
              }}
            >
              Toxicity: {formatProgress(currentToxicity, maxToxicity)}
              {currentToxicity >= maxToxicity * 0.8 && (
                <WarningIcon
                  sx={{
                    color: '#FF6B6B',
                    fontSize: 14,
                    ml: 0.5,
                    verticalAlign: 'middle',
                  }}
                />
              )}
            </Typography>
          )}
        </Box>
      )}

      {/* Current and forecasted conditions from game */}
      {showForecastedConditions &&
        (currentCondition || nextConditions.length > 0) &&
        !compactMode && (
          <Box sx={{ mb: 1.5 }}>
            <Typography
              variant="body2"
              sx={{ color: 'rgba(255, 255, 255, 0.5)', mb: 0.5 }}
            >
              Conditions:
            </Typography>
            <Box
              sx={{
                display: 'flex',
                gap: 0.5,
                flexWrap: 'wrap',
                alignItems: 'center',
              }}
            >
              {/* Current condition - highlighted */}
              {currentCondition && (
                <Chip
                  label={`Now: ${CONDITION_NAMES[currentCondition] || currentCondition}`}
                  size="small"
                  sx={{
                    backgroundColor: `${CONDITION_COLORS[currentCondition] || '#ffffff'}30`,
                    color: CONDITION_COLORS[currentCondition] || '#ffffff',
                    fontSize: '0.7rem',
                    height: 22,
                    fontWeight: 'bold',
                    border: `2px solid ${CONDITION_COLORS[currentCondition] || '#ffffff'}80`,
                  }}
                />
              )}
              {/* Arrow separator if we have both current and upcoming */}
              {currentCondition && nextConditions.length > 0 && (
                <Typography
                  sx={{ color: 'rgba(255, 255, 255, 0.3)', fontSize: '0.8rem' }}
                >
                  →
                </Typography>
              )}
              {/* Upcoming conditions */}
              {nextConditions.slice(0, 4).map((condition, idx) => (
                <Chip
                  key={idx}
                  label={`${idx + 1}: ${CONDITION_NAMES[condition] || condition}`}
                  size="small"
                  sx={{
                    backgroundColor: 'rgba(50, 50, 50, 0.8)',
                    color: CONDITION_COLORS[condition] || '#ffffff',
                    fontSize: '0.7rem',
                    height: 20,
                    border: `1px solid ${CONDITION_COLORS[condition] || '#ffffff'}40`,
                  }}
                />
              ))}
            </Box>
          </Box>
        )}

      {/* Primary recommendation */}
      <SkillCard rec={result.recommendation} isPrimary />

      {/* Optimal rotation preview */}
      {showOptimalRotation &&
        result.optimalRotation &&
        result.optimalRotation.length > 1 &&
        !compactMode && (
          <Box sx={{ mb: 1.5 }}>
            <Typography
              variant="body2"
              sx={{ color: 'rgba(255, 255, 255, 0.5)', mb: 0.5 }}
            >
              Suggested rotation:
            </Typography>
            <Box
              sx={{
                display: 'flex',
                gap: 0.5,
                flexWrap: 'wrap',
                alignItems: 'center',
              }}
            >
              {result.optimalRotation
                .slice(0, maxRotationDisplay)
                .map((skillName, idx) => (
                  <React.Fragment key={idx}>
                    <Chip
                      label={skillName}
                      size="small"
                      sx={{
                        backgroundColor:
                          idx === 0
                            ? 'rgba(0, 255, 0, 0.2)'
                            : 'rgba(80, 80, 80, 0.6)',
                        color:
                          idx === 0 ? '#00ff00' : 'rgba(255, 255, 255, 0.8)',
                        fontSize: '0.7rem',
                        height: 22,
                        border:
                          idx === 0
                            ? '1px solid rgba(0, 255, 0, 0.5)'
                            : '1px solid rgba(100, 100, 100, 0.5)',
                      }}
                    />
                    {idx <
                      Math.min(
                        result.optimalRotation!.length - 1,
                        maxRotationDisplay - 1,
                      ) && (
                      <Typography
                        sx={{
                          color: 'rgba(255, 255, 255, 0.3)',
                          fontSize: '0.8rem',
                        }}
                      >
                        →
                      </Typography>
                    )}
                  </React.Fragment>
                ))}
              {result.optimalRotation.length > maxRotationDisplay && (
                <Typography
                  sx={{ color: 'rgba(255, 255, 255, 0.4)', fontSize: '0.7rem' }}
                >
                  +{result.optimalRotation.length - maxRotationDisplay} more
                </Typography>
              )}
            </Box>
          </Box>
        )}

      {/* Expected final state */}
      {showExpectedFinalState && result.expectedFinalState && !compactMode && (
        <Box
          sx={{
            mb: 1.5,
            p: 1,
            backgroundColor: 'rgba(0, 50, 100, 0.3)',
            borderRadius: 1,
          }}
        >
          <Box
            sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}
          >
            <TrendingUpIcon
              sx={{ color: 'rgba(100, 200, 255, 0.8)', fontSize: 16 }}
            />
            <Typography
              variant="body2"
              sx={{
                color: 'rgba(100, 200, 255, 0.8)',
                fontWeight: 'bold',
              }}
            >
              After {result.optimalRotation?.length || 1} turns:
            </Typography>
          </Box>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <Typography variant="body2" sx={{ color: '#90EE90' }}>
              Comp:{' '}
              {formatProgress(
                result.expectedFinalState.completion,
                targetCompletion,
              )}
            </Typography>
            <Typography variant="body2" sx={{ color: '#87CEEB' }}>
              Perf:{' '}
              {formatProgress(
                result.expectedFinalState.perfection,
                targetPerfection,
              )}
            </Typography>
            <Typography variant="body2" sx={{ color: '#FFA500' }}>
              Stab: {formatGain(result.expectedFinalState.stability)}
            </Typography>
          </Box>
          {result.expectedFinalState.completion >= targetCompletion &&
            result.expectedFinalState.perfection >= targetPerfection && (
              <Box
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.5,
                  mt: 0.5,
                }}
              >
                <CheckCircleIcon sx={{ color: '#00ff00', fontSize: 14 }} />
                <Typography
                  variant="body2"
                  sx={{ color: '#00ff00', fontStyle: 'italic' }}
                >
                  Targets will be met!
                </Typography>
              </Box>
            )}
          {result.expectedFinalState.turnsRemaining > 0 && (
            <Typography
              variant="body2"
              sx={{ color: 'rgba(255, 255, 255, 0.5)', mt: 0.5 }}
            >
              ~{result.expectedFinalState.turnsRemaining} more turns needed
              after
            </Typography>
          )}
        </Box>
      )}

      {/* Alternative skills */}
      {maxAlternatives > 0 &&
        result.alternativeSkills.length > 0 &&
        !compactMode && (
          <>
            <Divider
              sx={{ my: 1.5, borderColor: 'rgba(100, 100, 100, 0.5)' }}
            />
            <Typography
              variant="body2"
              sx={{ color: 'rgba(255, 255, 255, 0.5)', mb: 1 }}
            >
              Alternatives:
            </Typography>
            {result.alternativeSkills
              .slice(0, maxAlternatives)
              .map((rec, idx) => (
                <SkillCard key={idx} rec={rec} showQuality />
              ))}
          </>
        )}

      {/* Hotkey hints - always visible at bottom */}
      {!compactMode && (
        <Box
          sx={{
            mt: 1.5,
            pt: 1,
            borderTop: '1px solid rgba(100, 100, 100, 0.3)',
          }}
        >
          <Typography
            variant="caption"
            sx={{ color: 'rgba(255, 255, 255, 0.35)', display: 'block' }}
          >
            Ctrl+Shift+C: Hide | Ctrl+Shift+M: Compact
          </Typography>
        </Box>
      )}
    </Paper>
  );
}

export default RecommendationPanel;
