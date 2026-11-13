import { memo, useMemo } from 'react';
import { Box, Typography } from '@mui/material';
import {
  Bolt,
  Check,
  StopRounded,
  WarningAmberRounded,
} from '@mui/icons-material';
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
import {
  displayedAlternatives,
  isPlayableRecommendation,
} from '../utils/recommendationPresentation';
import { SettingsPanel } from './SettingsPanel';
import {
  ActionButton,
  Disclosure,
  DisclosureGroup,
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
import { colors, tokens } from './theme';

const statusCardSx = {
  p: 1.5,
  backgroundColor: tokens.surface.raised,
  border: `1px solid ${tokens.border.default}`,
  borderRadius: `${tokens.radius.md}px`,
  '& > .MuiTypography-subtitle1': {
    display: 'flex',
    alignItems: 'center',
    gap: 0.75,
    mb: 0.75,
  },
};

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
  currentCompletion,
  currentPerfection,
  targetCompletion,
  targetPerfection,
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
  const alternatives = result
    ? displayedAlternatives(result, settings?.maxAlternatives)
    : [];
  const stop =
    autoMode && (autoMode.armed || autoMode.canStop || autoMode.isRunning) ? (
      <ActionButton
        color="error"
        startIcon={<StopRounded sx={{ fontSize: 16 }} />}
        sx={{
          minHeight: 28,
          fontSize: tokens.type.bodySm,
          px: 1,
          color: tokens.semantic.danger,
          borderColor: tokens.semantic.danger,
          '& .MuiButton-startIcon': { mr: 0.25 },
        }}
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
          gap: 0.5,
          flexWrap: 'wrap',
          pb: 1,
          mb: 1.5,
          mx: settings?.compactMode ? -1.25 : -2,
          mt: settings?.compactMode ? -1.25 : -2,
          px: settings?.compactMode ? 1.25 : 2,
          pt: settings?.compactMode ? 1.25 : 2,
          '&::after': {
            content: '""',
            position: 'absolute',
            height: '1px',
            left: 0,
            right: 0,
            bottom: 0,
            background: tokens.border.rule,
          },
        }}
      >
        <Box sx={{ flex: 1, minWidth: 90 }}>
          <PanelHeading>CraftBuddy</PanelHeading>
        </Box>
        <Typography
          variant="caption"
          role="status"
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 0.625,
            px: 0.75,
            py: 0.25,
            borderRadius: '20px',
            backgroundColor: tokens.surface.hover,
            color:
              autoMode?.phase === 'stop_requested' ||
              autoMode?.phase === 'error'
                ? tokens.semantic.warning
                : autoMode?.armed
                  ? tokens.semantic.positive
                  : colors.textSecondary,
            maxWidth: '100%',
          }}
        >
          <Box
            component="span"
            aria-hidden
            sx={{
              width: 5,
              height: 5,
              backgroundColor: 'currentColor',
              borderRadius: '50%',
              flexShrink: 0,
            }}
          />
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
        <Box
          role="status"
          sx={{
            mb: 1.25,
            p: 1,
            borderLeft: `2px solid ${tokens.semantic.warning}`,
            backgroundColor: tokens.surface.hover,
            borderRadius: `${tokens.radius.xs}px`,
            display: 'flex',
            gap: 1,
            alignItems: 'center',
            flexWrap: 'wrap',
          }}
        >
          <WarningAmberRounded
            sx={{ color: tokens.semantic.warning, fontSize: 18 }}
          />
          <Typography
            variant="body2"
            sx={{ color: tokens.semantic.warning, flex: 1, minWidth: 130 }}
          >
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
          <Box role="status" sx={statusCardSx}>
            <Typography variant="subtitle1">
              <Bolt sx={{ fontSize: 20, color: colors.gold }} />
              Finding the next action…
            </Typography>
            <Typography variant="body2" sx={{ color: colors.textSecondary }}>
              You can keep using the game while CraftBuddy plans.
            </Typography>
          </Box>
        ) : status === 'autoResolved' ? (
          <Box sx={statusCardSx}>
            <Typography
              variant="subtitle1"
              sx={resolvedFailed ? { color: colors.error } : undefined}
            >
              {resolvedFailed ? (
                <WarningAmberRounded sx={{ fontSize: 20 }} />
              ) : (
                <Check sx={{ fontSize: 20, color: tokens.semantic.positive }} />
              )}
              {resolvedFailed ? 'Craft failed' : 'Craft resolved automatically'}
            </Typography>
            <Typography variant="body2" sx={{ color: colors.textSecondary }}>
              {resolvedFailed
                ? 'The craft ends below the lowest tier. No further action is needed.'
                : 'The game ends this craft at zero stability or when both bars reach their caps. No further action is needed.'}
            </Typography>
          </Box>
        ) : status === 'blocked' ? (
          <Box sx={statusCardSx}>
            <Typography variant="subtitle1" sx={{ color: colors.stability }}>
              <WarningAmberRounded sx={{ fontSize: 20 }} />
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
                <Box component="span" sx={{ color: colors.gold, mr: 0.75 }}>
                  Why
                </Box>
                {setup.detail}
              </Typography>
            )}
          </>
        ) : (
          <Box sx={statusCardSx}>
            <Typography variant="subtitle1">
              <Check sx={{ fontSize: 20, color: tokens.semantic.positive }} />
              Target secured
            </Typography>
            <Typography variant="body2" sx={{ color: colors.textSecondary }}>
              The craft can continue. It ends automatically at zero stability or
              both bar caps.
            </Typography>
          </Box>
        )}
      </Box>

      {!loading && (
        <CurrentOutcome
          summary={outcome}
          legacyProgress={{
            currentCompletion,
            currentPerfection,
            targetCompletion,
            targetPerfection,
          }}
        />
      )}
      {settings?.showForecastedConditions !== false && (
        <Conditions current={currentCondition} next={nextConditions} />
      )}
      {autoUse && (
        <Typography
          variant="body2"
          sx={{
            color: tokens.semantic.info,
            mt: 1,
            p: 1,
            borderLeft: `2px solid ${tokens.semantic.info}`,
            backgroundColor: tokens.surface.hover,
            borderRadius: `${tokens.radius.xs}px`,
          }}
        >
          {autoUse.detail}
        </Typography>
      )}

      {((!loading && result && status === 'live') || autoMode) && (
        <DisclosureGroup>
          {!loading && result && status === 'live' && (
            <>
              <PlanSection
                result={result}
                summary={outcome}
                settings={settings}
                maxCompletionCap={maxCompletionCap}
                maxPerfectionCap={maxPerfectionCap}
              />
              {settings?.maxAlternatives !== 0 && (
                <Disclosure title={`Other actions (${alternatives.length})`}>
                  {alternatives.length ? (
                    alternatives.map((alternative) => (
                      <ActionRecommendation
                        key={alternative.skill.key ?? alternative.skill.name}
                        rec={alternative}
                        variant="alternative"
                        compact={settings?.compactMode}
                        onUse={canUse ? onRecommendationAction : undefined}
                      />
                    ))
                  ) : (
                    <Typography
                      variant="body2"
                      sx={{ color: colors.textSecondary }}
                    >
                      No other actions in this search.
                    </Typography>
                  )}
                </Disclosure>
              )}
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
        </DisclosureGroup>
      )}
    </PanelContainer>
  );
});

export default RecommendationPanel;
