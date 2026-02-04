/**
 * CraftBuddy - Recommendation Panel UI Component
 * 
 * Displays the recommended next skill during crafting with expected gains
 * and reasoning.
 */

import React from 'react';
import { Box, Typography, Paper, Chip, Divider } from '@mui/material';
import { SearchResult, SkillRecommendation, CraftingConditionType } from '../optimizer';

// Skill type colors matching game UI
const SKILL_TYPE_COLORS: Record<string, string> = {
  fusion: '#00ff00',    // lime/green
  refine: '#00ffff',    // cyan
  stabilize: '#ffa500', // orange
  support: '#eb34db',   // pink/magenta
};

// Quality rating colors (0-100 scale)
function getQualityColor(rating: number): string {
  if (rating >= 90) return '#00ff00';  // Excellent - bright green
  if (rating >= 70) return '#90EE90';  // Good - light green
  if (rating >= 50) return '#FFD700';  // Okay - gold
  if (rating >= 30) return '#FFA500';  // Poor - orange
  return '#FF6B6B';                     // Bad - red
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
  veryPositive: '#00ff00',  // bright green
  positive: '#90EE90',      // light green
  neutral: '#ffffff',       // white
  negative: '#FFA500',      // orange
  veryNegative: '#FF6B6B',  // red
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
  currentStability?: number;
  /** Current max stability (decreases each turn) */
  currentMaxStability?: number;
  /** Initial/target max stability from recipe */
  targetStability?: number;
  nextConditions?: CraftingConditionType[];
  /** Current toxicity for alchemy crafting */
  currentToxicity?: number;
  /** Max toxicity threshold */
  maxToxicity?: number;
  /** Current crafting type */
  craftingType?: 'forge' | 'alchemical' | 'inscription' | 'resonance';
}

/**
 * Formats a skill recommendation for display
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
  const typeColor = SKILL_TYPE_COLORS[rec.skill.type] || '#ffffff';
  const qualityRating = rec.qualityRating ?? 100;
  const qualityColor = getQualityColor(qualityRating);
  
  return (
    <Box
      sx={{
        p: isPrimary ? 1.5 : 1,
        mb: 1,
        borderRadius: 1,
        backgroundColor: isPrimary ? 'rgba(0, 100, 0, 0.3)' : 'rgba(50, 50, 50, 0.5)',
        border: isPrimary ? '2px solid rgba(0, 255, 0, 0.5)' : '1px solid rgba(100, 100, 100, 0.5)',
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5, flexWrap: 'wrap' }}>
        <Typography
          variant={isPrimary ? 'h6' : 'body1'}
          sx={{ 
            color: typeColor, 
            fontWeight: isPrimary ? 'bold' : 'normal',
            textShadow: isPrimary ? `0 0 10px ${typeColor}` : 'none',
          }}
        >
          {rec.skill.name}
        </Typography>
        <Chip
          label={rec.skill.type}
          size="small"
          sx={{
            backgroundColor: typeColor,
            color: '#000',
            fontSize: '0.7rem',
            height: 20,
          }}
        />
        {/* Buff consumer indicator */}
        {rec.consumesBuff && (
          <Chip
            label="⚡ Uses Buff"
            size="small"
            sx={{
              backgroundColor: '#FFD700',
              color: '#000',
              fontSize: '0.65rem',
              height: 18,
            }}
          />
        )}
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
            }}
          />
        )}
      </Box>
      
      {/* Expected gains */}
      <Box sx={{ display: 'flex', gap: 2, mb: 0.5, flexWrap: 'wrap' }}>
        {rec.expectedGains.completion > 0 && (
          <Typography variant="body2" sx={{ color: '#90EE90' }}>
            +{rec.expectedGains.completion} Completion
          </Typography>
        )}
        {rec.expectedGains.perfection > 0 && (
          <Typography variant="body2" sx={{ color: '#87CEEB' }}>
            +{rec.expectedGains.perfection} Perfection
          </Typography>
        )}
        {rec.expectedGains.stability > 0 && (
          <Typography variant="body2" sx={{ color: '#FFA500' }}>
            +{rec.expectedGains.stability} Stability
          </Typography>
        )}
      </Box>
      
      {/* Reasoning */}
      {isPrimary && (
        <Typography 
          variant="body2" 
          sx={{ 
            color: 'rgba(255, 255, 255, 0.7)', 
            fontStyle: 'italic',
            fontSize: '0.85rem',
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
  currentStability = 0,
  currentMaxStability = 0,
  targetStability = 0,
  nextConditions = [],
  currentToxicity = 0,
  maxToxicity = 0,
  craftingType = 'forge',
}: RecommendationPanelProps) {
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
          🔮 CraftBuddy
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
        <Typography variant="h6" sx={{ color: '#00FF00', mb: 1 }}>
          ✓ Targets Met!
        </Typography>
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
    return (
      <Paper
        sx={{
          p: 2,
          backgroundColor: 'rgba(50, 0, 0, 0.9)',
          border: '2px solid rgba(255, 0, 0, 0.7)',
          borderRadius: 2,
        }}
      >
        <Typography variant="h6" sx={{ color: '#FF6B6B', mb: 1 }}>
          ⚠ No Valid Actions
        </Typography>
        <Typography variant="body2" sx={{ color: 'rgba(255, 255, 255, 0.8)' }}>
          No skills can be used with current resources.
        </Typography>
        <Typography variant="body2" sx={{ color: 'rgba(255, 200, 200, 0.8)', mt: 1 }}>
          Consider finishing the craft or check your Qi/Stability.
        </Typography>
      </Paper>
    );
  }

  // Normal recommendation
  return (
    <Paper
      sx={{
        p: 2,
        backgroundColor: 'rgba(30, 30, 30, 0.95)',
        border: '1px solid rgba(100, 100, 100, 0.5)',
        borderRadius: 2,
        maxWidth: 350,
      }}
    >
      <Typography variant="h6" sx={{ color: '#FFD700', mb: 1.5 }}>
        🔮 CraftBuddy Recommends
      </Typography>

      {/* Progress display */}
      {(targetCompletion > 0 || targetPerfection > 0) && (
        <Box sx={{ mb: 1.5 }}>
          <Typography variant="body2" sx={{ color: 'rgba(255, 255, 255, 0.6)' }}>
            Completion: {currentCompletion}/{targetCompletion} | Perfection: {currentPerfection}/{targetPerfection}
          </Typography>
          {targetStability > 0 && (
            <Typography variant="body2" sx={{ color: currentStability < 20 ? '#FFA500' : 'rgba(255, 255, 255, 0.6)' }}>
              Stability: {currentStability}/{currentMaxStability > 0 ? currentMaxStability : targetStability}
              {currentMaxStability > 0 && currentMaxStability < targetStability && (
                <span style={{ color: 'rgba(255, 165, 0, 0.7)', marginLeft: 4 }}>
                  (max decayed from {targetStability})
                </span>
              )}
            </Typography>
          )}
          {/* Toxicity display for alchemy crafting */}
          {maxToxicity > 0 && (
            <Typography 
              variant="body2" 
              sx={{ 
                color: currentToxicity >= maxToxicity * 0.8 
                  ? '#FF6B6B' 
                  : currentToxicity >= maxToxicity * 0.5 
                    ? '#FFA500' 
                    : 'rgba(255, 255, 255, 0.6)' 
              }}
            >
              Toxicity: {currentToxicity}/{maxToxicity}
              {currentToxicity >= maxToxicity * 0.8 && (
                <span style={{ color: '#FF6B6B', marginLeft: 4 }}>
                  ⚠ High!
                </span>
              )}
            </Typography>
          )}
        </Box>
      )}

      {/* Forecasted conditions from game */}
      {nextConditions.length > 0 && (
        <Box sx={{ mb: 1.5 }}>
          <Typography variant="body2" sx={{ color: 'rgba(255, 255, 255, 0.5)', mb: 0.5 }}>
            Upcoming conditions:
          </Typography>
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
            {nextConditions.slice(0, 5).map((condition, idx) => (
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
      {result.optimalRotation && result.optimalRotation.length > 1 && (
        <Box sx={{ mb: 1.5 }}>
          <Typography variant="body2" sx={{ color: 'rgba(255, 255, 255, 0.5)', mb: 0.5 }}>
            Suggested rotation:
          </Typography>
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', alignItems: 'center' }}>
            {result.optimalRotation.slice(0, 5).map((skillName, idx) => (
              <React.Fragment key={idx}>
                <Chip
                  label={skillName}
                  size="small"
                  sx={{
                    backgroundColor: idx === 0 ? 'rgba(0, 255, 0, 0.2)' : 'rgba(80, 80, 80, 0.6)',
                    color: idx === 0 ? '#00ff00' : 'rgba(255, 255, 255, 0.8)',
                    fontSize: '0.7rem',
                    height: 22,
                    border: idx === 0 ? '1px solid rgba(0, 255, 0, 0.5)' : '1px solid rgba(100, 100, 100, 0.5)',
                  }}
                />
                {idx < Math.min(result.optimalRotation!.length - 1, 4) && (
                  <Typography sx={{ color: 'rgba(255, 255, 255, 0.3)', fontSize: '0.8rem' }}>→</Typography>
                )}
              </React.Fragment>
            ))}
            {result.optimalRotation.length > 5 && (
              <Typography sx={{ color: 'rgba(255, 255, 255, 0.4)', fontSize: '0.7rem' }}>
                +{result.optimalRotation.length - 5} more
              </Typography>
            )}
          </Box>
        </Box>
      )}

      {/* Expected final state */}
      {result.expectedFinalState && (
        <Box sx={{ mb: 1.5, p: 1, backgroundColor: 'rgba(0, 50, 100, 0.3)', borderRadius: 1 }}>
          <Typography variant="body2" sx={{ color: 'rgba(100, 200, 255, 0.8)', mb: 0.5, fontWeight: 'bold' }}>
            📊 After {result.optimalRotation?.length || 1} turns:
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
            <Typography variant="body2" sx={{ color: '#90EE90' }}>
              Comp: {result.expectedFinalState.completion}/{targetCompletion}
            </Typography>
            <Typography variant="body2" sx={{ color: '#87CEEB' }}>
              Perf: {result.expectedFinalState.perfection}/{targetPerfection}
            </Typography>
            <Typography variant="body2" sx={{ color: '#FFA500' }}>
              Stab: {result.expectedFinalState.stability}
            </Typography>
          </Box>
          {result.expectedFinalState.completion >= targetCompletion && 
           result.expectedFinalState.perfection >= targetPerfection && (
            <Typography variant="body2" sx={{ color: '#00ff00', mt: 0.5, fontStyle: 'italic' }}>
              ✓ Targets will be met!
            </Typography>
          )}
          {result.expectedFinalState.turnsRemaining > 0 && (
            <Typography variant="body2" sx={{ color: 'rgba(255, 255, 255, 0.5)', mt: 0.5 }}>
              ~{result.expectedFinalState.turnsRemaining} more turns needed after
            </Typography>
          )}
        </Box>
      )}

      {/* Alternative skills */}
      {result.alternativeSkills.length > 0 && (
        <>
          <Divider sx={{ my: 1.5, borderColor: 'rgba(100, 100, 100, 0.5)' }} />
          <Typography 
            variant="body2" 
            sx={{ color: 'rgba(255, 255, 255, 0.5)', mb: 1 }}
          >
            Alternatives:
          </Typography>
          {result.alternativeSkills.slice(0, 2).map((rec, idx) => (
            <SkillCard key={idx} rec={rec} showQuality />
          ))}
        </>
      )}
    </Paper>
  );
}

export default RecommendationPanel;
