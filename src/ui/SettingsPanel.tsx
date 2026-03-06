/**
 * CraftBuddy - Settings Panel UI Component
 *
 * Provides an in-game UI for configuring optimizer settings.
 * Uses themed components for consistent styling.
 */

import React, { useState, memo, useCallback, useEffect } from 'react';
import {
  Box,
  Typography,
  Paper,
  Slider,
  Switch,
  IconButton,
  Collapse,
  Button,
  Tooltip,
} from '@mui/material';
import SettingsIcon from '@mui/icons-material/Settings';
import CloseIcon from '@mui/icons-material/Close';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckIcon from '@mui/icons-material/Check';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import {
  CraftBuddySettings,
  getSettings,
  saveSettings,
  DEFAULT_SETTINGS,
} from '../settings';
import { colors, gradients, shadows } from './theme';
import { GradientDivider, FlexRow } from './components';
import {
  transitions,
  versionBadgeReveal,
  holographicSweep,
} from './animations';

interface SettingsPanelProps {
  onSettingsChange?: (settings: CraftBuddySettings) => void;
  /** Called when a search-affecting setting changes (lookahead, time budget, nodes, beam width) */
  onSearchSettingsChange?: (settings: CraftBuddySettings) => void;
  /** Called when settings panel open state changes */
  onOpenChange?: (isOpen: boolean) => void;
  /** Optional version string shown in the bottom-right of the settings panel */
  version?: string;
  /** Optional controls to render to the left of the settings button */
  leadingControls?: React.ReactNode;
}

interface SearchPreset {
  id: string;
  label: string;
  description: string;
  values: Pick<
    CraftBuddySettings,
    | 'lookaheadDepth'
    | 'searchTimeBudgetMs'
    | 'searchMaxNodes'
    | 'searchBeamWidth'
  >;
}

interface SettingHelpContent {
  title: string;
  description: string;
  note?: string;
}

const SEARCH_PRESETS: SearchPreset[] = [
  {
    id: 'instant',
    label: 'Instant',
    description: 'Fastest preset that still keeps a meaningful lookahead',
    values: {
      lookaheadDepth: 32,
      searchTimeBudgetMs: 1000,
      searchMaxNodes: 400000,
      searchBeamWidth: 8,
    },
  },
  {
    id: 'fast',
    label: 'Fast',
    description: 'More depth without widening into unstable mid-budget search',
    values: {
      lookaheadDepth: 40,
      searchTimeBudgetMs: 1200,
      searchMaxNodes: 800000,
      searchBeamWidth: 8,
    },
  },
  {
    id: 'balanced',
    label: 'Balanced',
    description: 'Recommended default for most real crafts',
    values: {
      lookaheadDepth: 64,
      searchTimeBudgetMs: 4500,
      searchMaxNodes: 2000000,
      searchBeamWidth: 8,
    },
  },
  {
    id: 'high_accuracy',
    label: 'High Accuracy',
    description: 'Deep search for difficult late-game turns',
    values: {
      lookaheadDepth: 80,
      searchTimeBudgetMs: 8000,
      searchMaxNodes: 3500000,
      searchBeamWidth: 9,
    },
  },
  {
    id: 'max',
    label: 'Max',
    description:
      'Largest budget; best for the hardest turns and long crafts',
    values: {
      lookaheadDepth: 96,
      searchTimeBudgetMs: 10000,
      searchMaxNodes: 5000000,
      searchBeamWidth: 12,
    },
  },
];

const SEARCH_BUDGET_HELP: SettingHelpContent = {
  title: 'Search budget coupling',
  description:
    'Depth, time, nodes, and beam width work as one shared budget. Pushing one much higher than the others can waste search and sometimes make partial-frontier recommendations worse.',
  note: 'If you are unsure, start from a preset and only tune one step at a time.',
};

const LOOKAHEAD_DEPTH_HELP: SettingHelpContent = {
  title: 'Lookahead Depth',
  description:
    'Sets the maximum turn horizon the search can plan through. Extra depth only helps if time and node budgets are high enough to actually reach it.',
  note: 'Very high depth with low nodes or time often adds little real search.',
};

const SEARCH_TIME_HELP: SettingHelpContent = {
  title: 'Search Time Budget',
  description:
    'Wall-clock cutoff for each recommendation. This is machine-dependent: faster computers search farther within the same time budget.',
  note: 'Raise time after depth and nodes are already high enough; otherwise the search may hit a different cap first.',
};

const SEARCH_MAX_NODES_HELP: SettingHelpContent = {
  title: 'Search Max Nodes',
  description:
    'Caps how many states the optimizer can explore. This is usually the most direct way to improve recommendation quality on difficult turns.',
  note: 'If nodes are too low, higher depth or time may not matter because search stops early.',
};

const SEARCH_BEAM_WIDTH_HELP: SettingHelpContent = {
  title: 'Search Beam Width',
  description:
    'Controls how many candidate branches survive at each layer. Wider is not automatically better because it spreads the budget across more lines.',
  note: 'Keep beam width moderate unless you also have enough depth, time, and nodes to support it.',
};

const MAX_ALTERNATIVES_HELP: SettingHelpContent = {
  title: 'Max Alternatives',
  description:
    'Sets how many backup moves are shown under the top recommendation.',
  note: 'This affects panel output only and does not improve or reduce search accuracy.',
};

const COMPACT_MODE_HELP: SettingHelpContent = {
  title: 'Compact Mode',
  description:
    'Shrinks the recommendation panel to save screen space during crafting.',
  note: 'Display-only setting. Does not change optimizer behavior.',
};

const SHOW_ROTATION_HELP: SettingHelpContent = {
  title: 'Show Rotation',
  description:
    'Displays the predicted follow-up move sequence from the current search result.',
  note: 'Display-only setting. Does not change optimizer behavior.',
};

const SHOW_FINAL_STATE_HELP: SettingHelpContent = {
  title: 'Show Final State',
  description:
    'Displays the expected craft state after following the shown path.',
  note: 'Display-only setting. Does not change optimizer behavior.',
};

const SHOW_CONDITIONS_HELP: SettingHelpContent = {
  title: 'Show Conditions',
  description:
    'Displays the visible upcoming condition forecast used by the optimizer.',
  note: 'Display-only setting. Does not change optimizer behavior.',
};

function getTooltipPopperProps() {
  return {
    disablePortal: false,
    style: { zIndex: 10001 },
    container:
      typeof document !== 'undefined'
        ? (document.getElementById('craftbuddy-overlay') ?? document.body)
        : undefined,
  };
}

function renderHelpContent(help: SettingHelpContent): React.ReactNode {
  return (
    <Box sx={{ maxWidth: 320 }}>
      <Typography
        variant="subtitle2"
        sx={{ color: colors.gold, fontWeight: 600, mb: 0.4 }}
      >
        {help.title}
      </Typography>
      <Typography
        variant="body2"
        sx={{ color: colors.textSecondary, lineHeight: 1.45 }}
      >
        {help.description}
      </Typography>
      {help.note && (
        <Typography
          variant="caption"
          sx={{ color: colors.textDisabled, display: 'block', mt: 0.75 }}
        >
          {help.note}
        </Typography>
      )}
    </Box>
  );
}

const InlineHelp = memo(function InlineHelp({
  help,
  placement = 'top-start',
}: {
  help: SettingHelpContent;
  placement?:
    | 'bottom'
    | 'bottom-end'
    | 'bottom-start'
    | 'left'
    | 'left-end'
    | 'left-start'
    | 'right'
    | 'right-end'
    | 'right-start'
    | 'top'
    | 'top-end'
    | 'top-start';
}) {
  return (
    <Tooltip
      title={renderHelpContent(help)}
      enterDelay={250}
      placement={placement}
      arrow
      PopperProps={getTooltipPopperProps()}
    >
      <Box
        component="span"
        sx={{
          display: 'inline-flex',
          alignItems: 'center',
          color: colors.textDisabled,
          cursor: 'help',
          transition: transitions.smooth,
          '&:hover': {
            color: colors.gold,
          },
        }}
      >
        <HelpOutlineIcon sx={{ fontSize: 14 }} />
      </Box>
    </Tooltip>
  );
});

/**
 * Section header for settings groups.
 */
const SettingsSectionHeader = memo(function SettingsSectionHeader({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Typography
      variant="body2"
      sx={{
        color: colors.textMuted,
        mb: 1,
        fontSize: '0.8rem',
        fontWeight: 500,
      }}
    >
      {children}
    </Typography>
  );
});

/**
 * Slider setting component.
 */
const SliderSetting = memo(function SliderSetting({
  label,
  value,
  draftValue,
  min,
  max,
  step,
  marks,
  hint,
  tip,
  tooltip,
  valueFormatter,
  onChange,
  onCommit,
}: {
  label: string;
  value: number;
  draftValue: number;
  min: number;
  max: number;
  step: number;
  marks?: boolean;
  hint?: string;
  tip?: string;
  tooltip?: SettingHelpContent;
  valueFormatter?: (value: number) => string;
  onChange: (value: number) => void;
  onCommit: (value: number) => void;
}) {
  const formattedValue = valueFormatter
    ? valueFormatter(draftValue)
    : String(draftValue);

  return (
    <Box sx={{ mb: 2 }}>
      <FlexRow gap={0.5} sx={{ alignItems: 'center', mb: 0.5 }}>
        <Typography variant="body2" sx={{ color: colors.textSecondary }}>
          {label}:
        </Typography>
        {tooltip && <InlineHelp help={tooltip} />}
        <Box component="span" sx={{ color: colors.gold }}>
          {formattedValue}
        </Box>
      </FlexRow>
      <Slider
        value={draftValue}
        onChange={(_, v) => onChange(v as number)}
        onChangeCommitted={(_, v) => onCommit(v as number)}
        min={min}
        max={max}
        step={step}
        marks={marks}
        size="small"
      />
      {hint && (
        <Typography variant="caption" sx={{ color: colors.textDisabled }}>
          {hint}
        </Typography>
      )}
      {tip && (
        <Typography
          variant="caption"
          sx={{ color: colors.textDisabled, display: 'block', mt: 0.5 }}
        >
          {tip}
        </Typography>
      )}
    </Box>
  );
});

/**
 * Toggle setting component.
 */
const ToggleSetting = memo(function ToggleSetting({
  label,
  checked,
  tooltip,
  onChange,
}: {
  label: string;
  checked: boolean;
  tooltip?: SettingHelpContent;
  onChange: (checked: boolean) => void;
}) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        mb: 0.5,
      }}
    >
      <FlexRow gap={0.5} sx={{ alignItems: 'center' }}>
        <Typography variant="body2" sx={{ color: colors.textSecondary }}>
          {label}
        </Typography>
        {tooltip && <InlineHelp help={tooltip} />}
      </FlexRow>
      <Switch
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        size="small"
      />
    </Box>
  );
});

/**
 * Settings panel component.
 */
export const SettingsPanel = memo(function SettingsPanel({
  onSettingsChange,
  onSearchSettingsChange,
  onOpenChange,
  version,
  leadingControls,
}: SettingsPanelProps) {
  const versionLabel = version
    ? version.startsWith('v')
      ? version
      : `v${version}`
    : null;
  const formatSeconds = useCallback(
    (milliseconds: number): string => `${(milliseconds / 1000).toFixed(1)}s`,
    [],
  );
  const formatNodesThousands = useCallback(
    (nodes: number): string => `${Math.round(nodes / 1000)}k`,
    [],
  );

  const [isOpen, setIsOpen] = useState(false);
  const [showVersion, setShowVersion] = useState(false);
  const [snapshotCopied, setSnapshotCopied] = useState(false);
  const [settings, setSettings] = useState<CraftBuddySettings>(getSettings());
  const [draftSettings, setDraftSettings] =
    useState<CraftBuddySettings>(settings);

  type SliderSettingKey =
    | 'lookaheadDepth'
    | 'searchTimeBudgetMs'
    | 'searchMaxNodes'
    | 'searchBeamWidth'
    | 'maxAlternatives';

  const handleSettingChange = useCallback(
    <K extends keyof CraftBuddySettings>(
      key: K,
      value: CraftBuddySettings[K],
    ): CraftBuddySettings => {
      const newSettings = saveSettings({ [key]: value });
      setSettings(newSettings);
      setDraftSettings(newSettings);
      onSettingsChange?.(newSettings);
      return newSettings;
    },
    [onSettingsChange],
  );

  const handleSliderDraftChange = useCallback(
    <K extends SliderSettingKey>(key: K, value: number) => {
      setDraftSettings((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  // Search-affecting settings that should trigger recalculation
  const SEARCH_SETTINGS: SliderSettingKey[] = [
    'lookaheadDepth',
    'searchTimeBudgetMs',
    'searchMaxNodes',
    'searchBeamWidth',
  ];

  const handleSliderCommit = useCallback(
    <K extends SliderSettingKey>(key: K, value: number) => {
      if (settings[key] === value) return;
      const newSettings = handleSettingChange(
        key,
        value as CraftBuddySettings[K],
      );
      // Notify parent if this is a search-affecting setting
      if (SEARCH_SETTINGS.includes(key) && onSearchSettingsChange) {
        onSearchSettingsChange(newSettings);
      }
    },
    [settings, handleSettingChange, onSearchSettingsChange],
  );

  const handleApplyPreset = useCallback(
    (preset: SearchPreset) => {
      const newSettings = saveSettings(preset.values);
      setSettings(newSettings);
      setDraftSettings(newSettings);
      onSettingsChange?.(newSettings);
      onSearchSettingsChange?.(newSettings);
    },
    [onSettingsChange, onSearchSettingsChange],
  );

  const isPresetActive = useCallback(
    (preset: SearchPreset): boolean =>
      settings.lookaheadDepth === preset.values.lookaheadDepth &&
      settings.searchTimeBudgetMs === preset.values.searchTimeBudgetMs &&
      settings.searchMaxNodes === preset.values.searchMaxNodes &&
      settings.searchBeamWidth === preset.values.searchBeamWidth,
    [settings],
  );

  const handleCopySnapshot = useCallback(async () => {
    const debug = (window as any)?.craftBuddyDebug;
    if (debug?.exportOptimizerReplaySnapshot) {
      await debug.exportOptimizerReplaySnapshot();
      setSnapshotCopied(true);
      setTimeout(() => setSnapshotCopied(false), 2000);
    }
  }, []);

  const handleToggle = useCallback(() => {
    setIsOpen((prev) => {
      const next = !prev;
      onOpenChange?.(next);
      return next;
    });
  }, [onOpenChange]);

  useEffect(() => {
    return () => {
      onOpenChange?.(false);
    };
  }, [onOpenChange]);

  useEffect(() => {
    let fadeInTimer: ReturnType<typeof setTimeout> | undefined;
    if (isOpen) {
      setShowVersion(false);
      fadeInTimer = setTimeout(() => setShowVersion(true), 320);
    } else {
      setShowVersion(false);
    }

    return () => {
      if (fadeInTimer) {
        clearTimeout(fadeInTimer);
      }
    };
  }, [isOpen]);

  return (
    <Box sx={{ position: 'relative' }}>
      {leadingControls && (
        <Box
          sx={{
            position: 'absolute',
            top: -8,
            right: 28,
            zIndex: 9,
            transform: isOpen ? 'translate(-6px, 12px)' : 'translate(0, 0)',
            transition: 'transform 0.24s cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        >
          {leadingControls}
        </Box>
      )}

      {/* Settings toggle button */}
      <IconButton
        onClick={handleToggle}
        size="small"
        sx={{
          position: 'absolute',
          top: -8,
          right: -8,
          backgroundColor: 'rgba(40, 42, 55, 0.95)',
          color: isOpen ? colors.gold : colors.textMuted,
          border: `1px solid ${isOpen ? colors.borderMedium : 'rgba(80, 80, 100, 0.4)'}`,
          transition: transitions.smooth,
          '&:hover': {
            backgroundColor: 'rgba(50, 55, 70, 0.95)',
            color: colors.gold,
            borderColor: colors.borderMedium,
          },
          zIndex: 10,
          width: 28,
          height: 28,
        }}
      >
        {isOpen ? (
          <CloseIcon fontSize="small" />
        ) : (
          <SettingsIcon fontSize="small" />
        )}
      </IconButton>

      {/* Settings panel */}
      <Collapse
        in={isOpen}
        sx={{
          '& .MuiCollapse-wrapper, & .MuiCollapse-wrapperInner': {
            display: 'block !important',
            height: 'auto !important',
          },
        }}
      >
        <Paper
          elevation={0}
          sx={{
            p: 2,
            mb: 1,
            display: 'block !important',
            height: 'auto',
            minHeight: 0,
            flexDirection: 'initial !important',
            justifyContent: 'normal !important',
            alignItems: 'stretch !important',
            position: 'relative',
            backgroundImage: gradients.panelBackground,
            border: `1px solid ${colors.borderMedium}`,
            borderRadius: 2,
            boxShadow: shadows.panel,
          }}
        >
          {/* Header */}
          <FlexRow gap={1} sx={{ mb: 1.5 }}>
            <SettingsIcon sx={{ color: colors.gold, fontSize: 20 }} />
            <Typography
              variant="subtitle1"
              sx={{ color: colors.gold, fontWeight: 600 }}
            >
              Settings
            </Typography>
          </FlexRow>

          {/* Search Settings */}
          <FlexRow gap={0.5} sx={{ alignItems: 'center' }}>
            <SettingsSectionHeader>Search Settings</SettingsSectionHeader>
            <Box sx={{ mb: 1 }}>
              <InlineHelp help={SEARCH_BUDGET_HELP} />
            </Box>
          </FlexRow>
          <Typography
            variant="caption"
            sx={{ color: colors.textDisabled, display: 'block', mb: 1.25 }}
          >
            These four sliders share one search budget. If one is pushed much
            higher than the others, accuracy can get worse instead of better.
            Presets keep them in safer ratios. Changes apply when you release
            the slider.
          </Typography>

          <SliderSetting
            label="Lookahead Depth"
            value={settings.lookaheadDepth}
            draftValue={draftSettings.lookaheadDepth}
            min={1}
            max={96}
            step={1}
            marks
            hint={`Default: ${DEFAULT_SETTINGS.lookaheadDepth}. Higher values only help if time and nodes are high enough to reach deeper turns.`}
            tip="Tip: For long crafts (60-90 rounds), start with Balanced (64) or Max (96)."
            tooltip={LOOKAHEAD_DEPTH_HELP}
            onChange={(v) => handleSliderDraftChange('lookaheadDepth', v)}
            onCommit={(v) => handleSliderCommit('lookaheadDepth', v)}
          />

          <SliderSetting
            label="Search Time Budget"
            value={settings.searchTimeBudgetMs}
            draftValue={draftSettings.searchTimeBudgetMs}
            min={100}
            max={10000}
            step={100}
            hint={`Default: ${formatSeconds(DEFAULT_SETTINGS.searchTimeBudgetMs)}. Search stops at the first budget hit, so extra time only helps if another cap is not stopping it earlier.`}
            valueFormatter={formatSeconds}
            tooltip={SEARCH_TIME_HELP}
            tip={
              draftSettings.searchTimeBudgetMs > 5000
                ? 'Warning: Very high time budgets may pause the crafting UI while searching.'
                : undefined
            }
            onChange={(v) => handleSliderDraftChange('searchTimeBudgetMs', v)}
            onCommit={(v) => handleSliderCommit('searchTimeBudgetMs', v)}
          />

          <SliderSetting
            label="Search Max Nodes"
            value={settings.searchMaxNodes}
            draftValue={draftSettings.searchMaxNodes}
            min={1000}
            max={5000000}
            step={10000}
            hint={`Default: ${formatNodesThousands(DEFAULT_SETTINGS.searchMaxNodes)} nodes. If this cap is too low, extra depth or time may never get used.`}
            valueFormatter={formatNodesThousands}
            tooltip={SEARCH_MAX_NODES_HELP}
            onChange={(v) => handleSliderDraftChange('searchMaxNodes', v)}
            onCommit={(v) => handleSliderCommit('searchMaxNodes', v)}
          />

          <SliderSetting
            label="Search Beam Width"
            value={settings.searchBeamWidth}
            draftValue={draftSettings.searchBeamWidth}
            min={3}
            max={20}
            step={1}
            hint={`Default: ${DEFAULT_SETTINGS.searchBeamWidth}. Wider beams need the rest of the budget to keep up.`}
            tip="Tip: Raise beam width last. Too much width on a thin budget can hurt recommendation quality."
            tooltip={SEARCH_BEAM_WIDTH_HELP}
            onChange={(v) => handleSliderDraftChange('searchBeamWidth', v)}
            onCommit={(v) => handleSliderCommit('searchBeamWidth', v)}
          />

          <GradientDivider />

          {/* Display Options */}
          <SettingsSectionHeader>Display Options</SettingsSectionHeader>

          <ToggleSetting
            label="Compact Mode"
            checked={settings.compactMode}
            tooltip={COMPACT_MODE_HELP}
            onChange={(v) => handleSettingChange('compactMode', v)}
          />

          <ToggleSetting
            label="Show Rotation"
            checked={settings.showOptimalRotation}
            tooltip={SHOW_ROTATION_HELP}
            onChange={(v) => handleSettingChange('showOptimalRotation', v)}
          />

          <ToggleSetting
            label="Show Final State"
            checked={settings.showExpectedFinalState}
            tooltip={SHOW_FINAL_STATE_HELP}
            onChange={(v) => handleSettingChange('showExpectedFinalState', v)}
          />

          <ToggleSetting
            label="Show Conditions"
            checked={settings.showForecastedConditions}
            tooltip={SHOW_CONDITIONS_HELP}
            onChange={(v) => handleSettingChange('showForecastedConditions', v)}
          />

          <SliderSetting
            label="Max Alternatives"
            value={settings.maxAlternatives}
            draftValue={draftSettings.maxAlternatives}
            min={0}
            max={5}
            step={1}
            marks
            hint="Display-only setting. More alternatives do not improve the optimizer's top recommendation."
            tooltip={MAX_ALTERNATIVES_HELP}
            onChange={(v) => handleSliderDraftChange('maxAlternatives', v)}
            onCommit={(v) => handleSliderCommit('maxAlternatives', v)}
          />

          <GradientDivider />

          {/* Keyboard Shortcuts */}
          <SettingsSectionHeader>Keyboard Shortcuts</SettingsSectionHeader>
          <Typography
            variant="caption"
            sx={{ color: colors.textDisabled, display: 'block' }}
          >
            Ctrl+Shift+C - Toggle panel visibility
          </Typography>
          <Typography
            variant="caption"
            sx={{ color: colors.textDisabled, display: 'block' }}
          >
            Ctrl+Shift+M - Toggle compact mode
          </Typography>
          <Typography
            variant="caption"
            sx={{ color: colors.textDisabled, display: 'block' }}
          >
            Ctrl+Shift+Y - Export snapshot (clipboard or download)
          </Typography>

          <GradientDivider />

          {/* Search Presets */}
          <SettingsSectionHeader>Search Presets</SettingsSectionHeader>
          <Typography
            variant="caption"
            sx={{ color: colors.textDisabled, display: 'block', mb: 1 }}
          >
            Apply a tuned search profile. This overwrites Depth, Time Budget,
            Max Nodes, and Beam Width together. If you are not intentionally
            reproducing an edge case, start here instead of manual slider
            tuning.
          </Typography>
          <FlexRow gap={1} sx={{ flexWrap: 'wrap' }}>
            {SEARCH_PRESETS.map((preset) => {
              const active = isPresetActive(preset);
              return (
                <Tooltip
                  key={preset.id}
                  title={renderHelpContent({
                    title: preset.label,
                    description: preset.description,
                    note: `Depth ${preset.values.lookaheadDepth} | Time ${formatSeconds(
                      preset.values.searchTimeBudgetMs,
                    )} | Nodes ${formatNodesThousands(
                      preset.values.searchMaxNodes,
                    )} | Beam ${preset.values.searchBeamWidth}`,
                  })}
                  enterDelay={250}
                  placement="top"
                  arrow
                  PopperProps={getTooltipPopperProps()}
                >
                  <Button
                    size="small"
                    variant={active ? 'contained' : 'outlined'}
                    onClick={() => handleApplyPreset(preset)}
                    sx={{
                      minWidth: 0,
                      color: active ? '#141414' : colors.textSecondary,
                      backgroundColor: active ? colors.gold : 'transparent',
                      borderColor: active
                        ? colors.gold
                        : `${colors.borderMedium}`,
                      transition: transitions.smooth,
                      '&:hover': {
                        borderColor: colors.gold,
                        backgroundColor: active
                          ? colors.goldDark
                          : 'rgba(222, 184, 135, 0.12)',
                      },
                    }}
                  >
                    {preset.label}
                  </Button>
                </Tooltip>
              );
            })}
          </FlexRow>

          {/* Export Snapshot + Version */}
          <Box
            sx={{
              mt: 0.5,
              display: 'flex',
              justifyContent: 'flex-end',
              alignItems: 'center',
              gap: 0.75,
            }}
          >
            <Tooltip
              title="Export optimizer replay snapshot for bug reports (same as Ctrl+Shift+Y; copies to clipboard when available, otherwise downloads a .json file)"
              enterDelay={300}
              placement="top"
              arrow
              PopperProps={getTooltipPopperProps()}
            >
              <IconButton
                size="small"
                onClick={handleCopySnapshot}
                sx={{
                  color: snapshotCopied
                    ? colors.gold
                    : 'rgba(222, 205, 168, 0.5)',
                  transition: transitions.smooth,
                  padding: '3px',
                  '&:hover': {
                    color: colors.gold,
                    backgroundColor: 'rgba(222, 184, 135, 0.1)',
                  },
                }}
              >
                {snapshotCopied ? (
                  <CheckIcon sx={{ fontSize: '0.85rem' }} />
                ) : (
                  <ContentCopyIcon sx={{ fontSize: '0.85rem' }} />
                )}
              </IconButton>
            </Tooltip>

            {versionLabel && (
              <Typography
                variant="caption"
                sx={{
                  display: 'inline-block',
                  overflow: 'hidden',
                  isolation: 'isolate',
                  fontSize: '0.66rem',
                  color: 'rgba(222, 205, 168, 0.96)',
                  letterSpacing: '0.04em',
                  lineHeight: 1,
                  pointerEvents: 'none',
                  opacity: showVersion ? 0.94 : 0,
                  transform: showVersion
                    ? 'translateY(0) scale(1)'
                    : 'translateY(5px) scale(0.9)',
                  filter: showVersion ? 'blur(0)' : 'blur(3px)',
                  textShadow: showVersion
                    ? '0 0 10px rgba(255, 223, 140, 0.36)'
                    : '0 0 0 rgba(255, 223, 140, 0)',
                  transition:
                    'opacity 0.12s ease, transform 0.12s ease, filter 0.12s ease, text-shadow 0.14s ease',
                  animation: showVersion
                    ? `${versionBadgeReveal} 0.62s cubic-bezier(0.25, 0.9, 0.3, 1) both`
                    : 'none',
                  '&::after': {
                    content: '""',
                    position: 'absolute',
                    inset: 0,
                    pointerEvents: 'none',
                    background:
                      'linear-gradient(110deg, transparent 22%, rgba(152, 218, 255, 0.25) 42%, rgba(255, 236, 166, 0.48) 50%, rgba(152, 218, 255, 0.24) 58%, transparent 78%)',
                    mixBlendMode: 'screen',
                    opacity: showVersion ? 1 : 0,
                    transform: 'translateX(-130%)',
                    animation: showVersion
                      ? `${holographicSweep} 0.78s cubic-bezier(0.3, 0, 0.2, 1) 0.08s 1 both`
                      : 'none',
                  },
                }}
              >
                {versionLabel}
              </Typography>
            )}
          </Box>
        </Paper>
      </Collapse>
    </Box>
  );
});

export default SettingsPanel;
