import React, { memo, useMemo } from 'react';
import { Box, Typography } from '@mui/material';
import type {
  CraftingConditionType,
  HarmonyType,
  SearchResult,
  SkillRecommendation,
} from '../optimizer';
import type { AutoCraftPolicy, CraftBuddySettings } from '../settings';
import type { AutoCraftUiState } from '../settings/autoCraft';
import {
  buildAutoUseNotice,
  buildOutcomeSummary,
  buildSetupSummary,
} from '../utils/outcomeSummary';
import { isPlayableRecommendation } from '../utils/recommendationPresentation';
import { SettingsPanel } from './SettingsPanel';
import {
  ActionButton,
  Disclosure,
  PanelContainer,
  PanelHeading,
} from './components';
import { ActionRecommendation } from './ActionRecommendation';
import { AutomationSection } from './AutomationSection';
import {
  CurrentOutcome,
  BlockedReasonsSection,
  Conditions,
} from './OutcomeSection';
import { PlanSection } from './PlanSection';
import { colors } from './theme';

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
  craftingType?: HarmonyType;
  settings?: CraftBuddySettings;
  onSettingsChange?: (settings: CraftBuddySettings) => void;
  onSearchSettingsChange?: (settings: CraftBuddySettings) => void;
  isCalculating?: boolean;
  settingsStale?: boolean;
  onRecalculate?: () => void;
  onRecommendationAction?: (recommendation: SkillRecommendation) => void;
  autoMode?: AutoCraftUiState;
  onAutoModeArm?: () => void;
  onAutoModeStop?: (reason?: string) => void;
  onAutoModePolicyChange?: (policy: AutoCraftPolicy) => void;
  version?: string;
}

/** One reading order and one feature set, regardless of density or automation. */
export const RecommendationPanel = memo(function RecommendationPanel({
  result,
  currentCondition,
  nextConditions = [],
  craftingType,
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
  maxCompletionCap,
  maxPerfectionCap,
}: RecommendationPanelProps) {
  const outcome = useMemo(
    () =>
      buildOutcomeSummary({
        projection: result?.outcomeProjection,
        harmonyType: craftingType,
      }),
    [result?.outcomeProjection, craftingType],
  );
  const setup = buildSetupSummary(result?.recommendation?.setupFor);
  const autoUse = buildAutoUseNotice(autoMode);
  if (settings?.panelVisible === false) return null;

  const status = result?.status ?? 'live';
  // `tier` is the guaranteed floor; only call the craft failed when even the
  // bonus rolls cannot rescue it.
  const resolvedFailed =
    result?.outcomeProjection?.tier === 'failed' &&
    result.outcomeProjection.optimisticTier === 'failed';
  const loading = !result || isCalculating;
  const rec = result?.recommendation;
  const canUse = !loading && !settingsStale && !autoMode?.armed;
  const stop =
    autoMode && (autoMode.armed || autoMode.canStop || autoMode.isRunning) ? (
      <ActionButton
        color="error"
        onClick={() => onAutoModeStop?.('Stopped from CraftBuddy panel.')}
        aria-label="Stop automatic crafting"
      >
        Stop
      </ActionButton>
    ) : undefined;

  return (
    <PanelContainer compact={settings?.compactMode}>
      <Box
        sx={{
          display: 'flex',
          position: 'sticky',
          top: 0,
          zIndex: 2,
          backgroundColor: colors.panelBgLight,
          alignItems: 'center',
          gap: 0.75,
          flexWrap: 'wrap',
          borderBottom: `1px solid ${colors.borderSubtle}`,
          pb: 1,
          mb: 1.5,
        }}
      >
        <Box sx={{ flex: 1, minWidth: 100 }}>
          <PanelHeading>CraftBuddy</PanelHeading>
        </Box>
        <Typography
          variant="caption"
          role="status"
          sx={{
            color: autoMode?.armed ? colors.completion : colors.textSecondary,
          }}
        >
          {autoMode && autoMode.phase !== 'off'
            ? autoMode.statusTitle
            : 'Manual'}
        </Typography>
        {stop}
        <SettingsPanel
          onSettingsChange={onSettingsChange}
          onSearchSettingsChange={onSearchSettingsChange}
          version={version}
          safetyControl={stop}
        />
      </Box>

      {settingsStale && (
        <Box role="status" sx={{ mb: 1.25 }}>
          <Typography variant="body2" sx={{ color: colors.stability }}>
            Settings changed. This plan is out of date.
          </Typography>
          {onRecalculate && (
            <ActionButton onClick={onRecalculate} disabled={isCalculating}>
              Update plan
            </ActionButton>
          )}
        </Box>
      )}

      <Box aria-busy={loading}>
        {loading ? (
          <Box role="status" sx={{ py: 2 }}>
            <Typography variant="subtitle1">
              Finding the next action…
            </Typography>
            <Typography variant="body2" sx={{ color: colors.textSecondary }}>
              You can keep using the game while CraftBuddy plans.
            </Typography>
          </Box>
        ) : status === 'autoResolved' ? (
          <Box sx={{ py: 1 }}>
            <Typography
              variant="subtitle1"
              sx={resolvedFailed ? { color: colors.error } : undefined}
            >
              {resolvedFailed ? 'Craft failed' : 'Craft resolved automatically'}
            </Typography>
            <Typography variant="body2" sx={{ color: colors.textSecondary }}>
              {resolvedFailed
                ? 'The craft ends below the lowest tier. No further action is needed.'
                : 'The game ends this craft at zero stability or when both bars reach their caps. No further action is needed.'}
            </Typography>
          </Box>
        ) : status === 'blocked' ? (
          <Box sx={{ py: 1 }}>
            <Typography variant="subtitle1" sx={{ color: colors.stability }}>
              No action available
            </Typography>
            <Typography variant="body2" sx={{ color: colors.textSecondary }}>
              Check the resources and conditions below before choosing a move in
              the game.
            </Typography>
            <BlockedReasonsSection
              blockedReasons={result?.blockedReasons ?? []}
            />
          </Box>
        ) : rec && isPlayableRecommendation(rec) ? (
          <>
            <ActionRecommendation
              rec={rec}
              primary
              compact={settings?.compactMode}
              onUse={canUse ? onRecommendationAction : undefined}
            />
            {setup && (
              <Typography
                variant="body2"
                sx={{ color: colors.textSecondary, mt: 0.75 }}
              >
                {setup.detail}
              </Typography>
            )}
          </>
        ) : (
          <Box sx={{ py: 1 }}>
            <Typography variant="subtitle1">Target secured</Typography>
            <Typography variant="body2" sx={{ color: colors.textSecondary }}>
              The craft can continue. It ends automatically at zero stability or
              both bar caps.
            </Typography>
          </Box>
        )}
      </Box>

      {!loading && <CurrentOutcome summary={outcome} />}
      {settings?.showForecastedConditions !== false && (
        <Conditions current={currentCondition} next={nextConditions} />
      )}
      {autoUse && (
        <Typography variant="body2" sx={{ color: colors.textSecondary, mt: 1 }}>
          {autoUse.detail}
        </Typography>
      )}

      {!loading && result && status === 'live' && (
        <>
          <PlanSection
            result={result}
            summary={outcome}
            maxCompletionCap={maxCompletionCap}
            maxPerfectionCap={maxPerfectionCap}
          />
          <Disclosure
            title={`Other actions${result.alternativeSkills.length ? ` (${result.alternativeSkills.filter(isPlayableRecommendation).length})` : ''}`}
          >
            {result.alternativeSkills.filter(isPlayableRecommendation)
              .length ? (
              result.alternativeSkills
                .filter(isPlayableRecommendation)
                .map((alternative) => (
                  <ActionRecommendation
                    key={alternative.skill.key ?? alternative.skill.name}
                    rec={alternative}
                    compact={settings?.compactMode}
                    onUse={canUse ? onRecommendationAction : undefined}
                  />
                ))
            ) : (
              <Typography variant="body2" sx={{ color: colors.textSecondary }}>
                No other actions in this search.
              </Typography>
            )}
          </Disclosure>
        </>
      )}

      {autoMode && (
        <AutomationSection
          autoMode={autoMode}
          onArm={
            !settingsStale && status === 'live' ? onAutoModeArm : undefined
          }
          onPolicyChange={onAutoModePolicyChange}
        />
      )}
    </PanelContainer>
  );
});

export default RecommendationPanel;
