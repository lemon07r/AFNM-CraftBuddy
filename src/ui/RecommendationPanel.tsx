import { memo, useMemo } from 'react';
import { Box, Typography } from '@mui/material';
import {
  Bolt,
  Check,
  DragIndicator,
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
import type { OverlayLayoutHandlers } from './overlayInteraction';

const statusCardSx = {
  p: 2,
  backgroundColor: tokens.surface.card,
  border: `1px solid ${tokens.border.hairline}`,
  borderRadius: `${tokens.radius.lg}px`,
  boxShadow: tokens.shadow.card,
  '& > .MuiTypography-subtitle1': {
    display: 'flex',
    alignItems: 'center',
    gap: 1,
    mb: 0.75,
  },
};

function noticeSx(tone: string) {
  return {
    display: 'flex',
    gap: 1,
    alignItems: 'center',
    flexWrap: 'wrap',
    px: 1.5,
    py: 1.125,
    border: `1px solid ${tone}40`,
    backgroundColor: `${tone}14`,
    borderRadius: `${tokens.radius.md}px`,
  } as const;
}

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
  /** Drag/resize hooks from the overlay layout controller. */
  layoutHandlers?: OverlayLayoutHandlers;
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
  layoutHandlers,
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
        startIcon={<StopRounded sx={{ fontSize: 18 }} />}
        sx={{
          minHeight: 30,
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

  const compact = settings?.compactMode;
  const statusTone =
    autoMode?.phase === 'stop_requested' || autoMode?.phase === 'error'
      ? tokens.semantic.warning
      : autoMode?.armed
        ? tokens.semantic.positive
        : colors.textSecondary;
  const header = (
    <Box
      component="header"
      data-craftbuddy-drag-handle={layoutHandlers ? true : undefined}
      title={
        layoutHandlers
          ? 'Drag to move. Double-click to restore the automatic position.'
          : undefined
      }
      onPointerDown={layoutHandlers?.onHeaderPointerDown}
      onDoubleClick={layoutHandlers?.onHeaderDoubleClick}
      sx={{
        position: 'relative',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        gap: 0.75,
        flexWrap: 'wrap',
        px: compact ? 1.25 : 1.75,
        py: compact ? 1 : 1.25,
        minHeight: compact ? 50 : 58,
        boxSizing: 'border-box',
        background:
          'linear-gradient(180deg, rgba(255,255,255,.035), rgba(255,255,255,0))',
        ...(layoutHandlers
          ? {
              cursor: 'grab',
              touchAction: 'none',
              userSelect: 'none',
              '[data-craftbuddy-gesture="drag"] &': { cursor: 'grabbing' },
              '&:hover .craftbuddy-grip': { opacity: 0.9 },
            }
          : {}),
        '&::after': {
          content: '""',
          position: 'absolute',
          height: '1px',
          left: 12,
          right: 12,
          bottom: 0,
          background: tokens.border.rule,
          opacity: 0.7,
        },
      }}
    >
      <Box
        sx={{
          flex: 1,
          minWidth: 120,
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
        }}
      >
        {layoutHandlers && (
          <DragIndicator
            aria-hidden
            className="craftbuddy-grip"
            sx={{
              fontSize: 18,
              color: colors.textMuted,
              opacity: 0.45,
              ml: -0.5,
              transition: 'opacity 120ms',
            }}
          />
        )}
        <PanelHeading>CraftBuddy</PanelHeading>
      </Box>
      <Typography
        component="span"
        role="status"
        data-craftbuddy-no-drag
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 0.75,
          px: 1.125,
          minHeight: 28,
          borderRadius: '999px',
          border: `1px solid ${tokens.border.hairline}`,
          backgroundColor: 'rgba(0,0,0,.25)',
          color: statusTone,
          fontSize: tokens.type.bodySm,
          fontWeight: 600,
          maxWidth: '100%',
          whiteSpace: 'nowrap',
        }}
      >
        <Box
          component="span"
          aria-hidden
          sx={{
            width: 7,
            height: 7,
            backgroundColor: 'currentColor',
            borderRadius: '50%',
            flexShrink: 0,
            boxShadow: autoMode?.armed
              ? '0 0 0 3px rgba(95,214,164,.18)'
              : 'none',
          }}
        />
        {autoMode && autoMode.phase !== 'off' ? autoMode.statusTitle : 'Manual'}
      </Typography>
      {stop}
      <SettingsPanel
        onSettingsChange={onSettingsChange}
        onSearchSettingsChange={onSearchSettingsChange}
        version={version}
        safetyControl={stop}
      />
    </Box>
  );

  return (
    <PanelContainer
      compact={compact}
      header={header}
      onResizePointerDown={layoutHandlers?.onResizePointerDown}
    >
      {settingsStale && (
        <Box
          role="status"
          sx={{ ...noticeSx(tokens.semantic.warning), mb: 1.5 }}
        >
          <WarningAmberRounded
            sx={{ color: tokens.semantic.warning, fontSize: 20 }}
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
                sx={{ color: colors.textSecondary, mt: 1, px: 0.25 }}
              >
                <Box
                  component="span"
                  sx={{ color: colors.gold, fontWeight: 650, mr: 0.75 }}
                >
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
            ...noticeSx(tokens.semantic.info),
            display: 'block',
            color: '#bfe1f6',
            mt: 1.5,
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
