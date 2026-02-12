/**
 * CraftBuddy - Settings Panel UI Component
 *
 * Provides an in-game UI for configuring optimizer settings.
 * Uses themed components for consistent styling.
 */

import React, { useState, memo, useCallback } from 'react';
import {
  Box,
  Typography,
  Paper,
  Slider,
  Switch,
  FormControlLabel,
  IconButton,
  Collapse,
  Button,
} from '@mui/material';
import SettingsIcon from '@mui/icons-material/Settings';
import CloseIcon from '@mui/icons-material/Close';
import {
  CraftBuddySettings,
  getSettings,
  saveSettings,
  DEFAULT_SETTINGS,
} from '../settings';
import { colors, gradients, shadows } from './theme';
import { GradientDivider, FlexRow } from './components';
import { transitions } from './animations';

interface SettingsPanelProps {
  onSettingsChange?: (settings: CraftBuddySettings) => void;
  /** Called when a search-affecting setting changes (lookahead, time budget, nodes, beam width) */
  onSearchSettingsChange?: (settings: CraftBuddySettings) => void;
}

interface SearchPreset {
  id: string;
  label: string;
  description: string;
  values: Pick<
    CraftBuddySettings,
    'lookaheadDepth' | 'searchTimeBudgetMs' | 'searchMaxNodes' | 'searchBeamWidth'
  >;
}

const SEARCH_PRESETS: SearchPreset[] = [
  {
    id: 'instant',
    label: 'Instant',
    description: 'Lower latency, good accuracy',
    values: {
      lookaheadDepth: 16,
      searchTimeBudgetMs: 200,
      searchMaxNodes: 85000,
      searchBeamWidth: 6,
    },
  },
  {
    id: 'fast',
    label: 'Fast',
    description: 'Lower latency with strong accuracy',
    values: {
      lookaheadDepth: 24,
      searchTimeBudgetMs: 300,
      searchMaxNodes: 100000,
      searchBeamWidth: 7,
    },
  },
  {
    id: 'balanced',
    label: 'Balanced',
    description: 'Recommended default profile',
    values: {
      lookaheadDepth: 28,
      searchTimeBudgetMs: 500,
      searchMaxNodes: 200000,
      searchBeamWidth: 8,
    },
  },
  {
    id: 'high_accuracy',
    label: 'High Accuracy',
    description: 'True high-accuracy mode (slower, best late-game choices)',
    values: {
      lookaheadDepth: 36,
      searchTimeBudgetMs: 1000,
      searchMaxNodes: 250000,
      searchBeamWidth: 10,
    },
  },
];

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
  valueFormatter?: (value: number) => string;
  onChange: (value: number) => void;
  onCommit: (value: number) => void;
}) {
  const formattedValue = valueFormatter
    ? valueFormatter(draftValue)
    : String(draftValue);

  return (
    <Box sx={{ mb: 2 }}>
      <Typography variant="body2" sx={{ color: colors.textSecondary, mb: 0.5 }}>
        {label}:{' '}
        <Box component="span" sx={{ color: colors.gold }}>
          {formattedValue}
        </Box>
      </Typography>
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
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <FormControlLabel
      control={
        <Switch
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          size="small"
        />
      }
      label={
        <Typography variant="body2" sx={{ color: colors.textSecondary }}>
          {label}
        </Typography>
      }
      sx={{ mb: 0.5 }}
    />
  );
});

/**
 * Settings panel component.
 */
export const SettingsPanel = memo(function SettingsPanel({
  onSettingsChange,
  onSearchSettingsChange,
}: SettingsPanelProps) {
  const formatSeconds = useCallback(
    (milliseconds: number): string => `${(milliseconds / 1000).toFixed(1)}s`,
    [],
  );
  const formatNodesThousands = useCallback(
    (nodes: number): string => `${Math.round(nodes / 1000)}k`,
    [],
  );

  const [isOpen, setIsOpen] = useState(false);
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

  const handleToggle = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  return (
    <Box sx={{ position: 'relative' }}>
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
      <Collapse in={isOpen}>
        <Paper
          elevation={0}
          sx={{
            p: 2,
            mb: 1,
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
          <SliderSetting
            label="Lookahead Depth"
            value={settings.lookaheadDepth}
            draftValue={draftSettings.lookaheadDepth}
            min={1}
            max={96}
            step={1}
            marks
            hint={`Default: ${DEFAULT_SETTINGS.lookaheadDepth}. Higher values can cause lag.`}
            tip="Tip: For long crafts (60-90 rounds), try 64 or 96."
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
            hint={`Default: ${formatSeconds(DEFAULT_SETTINGS.searchTimeBudgetMs)}. Higher values improve quality but can stall UI updates.`}
            valueFormatter={formatSeconds}
            tip={
              draftSettings.searchTimeBudgetMs > 3000
                ? 'Warning: High time budgets can pause the crafting UI while searching.'
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
            max={250000}
            step={1000}
            hint={`Default: ${formatNodesThousands(DEFAULT_SETTINGS.searchMaxNodes)} nodes. Larger values improve accuracy but take longer.`}
            valueFormatter={formatNodesThousands}
            onChange={(v) => handleSliderDraftChange('searchMaxNodes', v)}
            onCommit={(v) => handleSliderCommit('searchMaxNodes', v)}
          />

          <SliderSetting
            label="Search Beam Width"
            value={settings.searchBeamWidth}
            draftValue={draftSettings.searchBeamWidth}
            min={3}
            max={15}
            step={1}
            onChange={(v) => handleSliderDraftChange('searchBeamWidth', v)}
            onCommit={(v) => handleSliderCommit('searchBeamWidth', v)}
          />

          <GradientDivider />

          {/* Display Options */}
          <SettingsSectionHeader>Display Options</SettingsSectionHeader>

          <ToggleSetting
            label="Compact Mode"
            checked={settings.compactMode}
            onChange={(v) => handleSettingChange('compactMode', v)}
          />

          <ToggleSetting
            label="Show Rotation"
            checked={settings.showOptimalRotation}
            onChange={(v) => handleSettingChange('showOptimalRotation', v)}
          />

          <ToggleSetting
            label="Show Final State"
            checked={settings.showExpectedFinalState}
            onChange={(v) => handleSettingChange('showExpectedFinalState', v)}
          />

          <ToggleSetting
            label="Show Conditions"
            checked={settings.showForecastedConditions}
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

          <GradientDivider />

          {/* Search Presets */}
          <SettingsSectionHeader>Search Presets</SettingsSectionHeader>
          <Typography
            variant="caption"
            sx={{ color: colors.textDisabled, display: 'block', mb: 1 }}
          >
            Apply a tuned search profile.
          </Typography>
          <FlexRow gap={1} sx={{ flexWrap: 'wrap' }}>
            {SEARCH_PRESETS.map((preset) => {
              const active = isPresetActive(preset);
              return (
                <Button
                  key={preset.id}
                  size="small"
                  variant={active ? 'contained' : 'outlined'}
                  onClick={() => handleApplyPreset(preset)}
                  title={preset.description}
                  sx={{
                    minWidth: 0,
                    color: active ? '#141414' : colors.textSecondary,
                    backgroundColor: active ? colors.gold : 'transparent',
                    borderColor: active ? colors.gold : `${colors.borderMedium}`,
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
              );
            })}
          </FlexRow>
        </Paper>
      </Collapse>
    </Box>
  );
});

export default SettingsPanel;
