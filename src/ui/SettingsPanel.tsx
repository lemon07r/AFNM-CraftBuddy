/**
 * CraftBuddy - Settings Panel UI Component
 *
 * Provides an in-game UI for configuring optimizer settings.
 */

import React, { useState } from 'react';
import {
  Box,
  Typography,
  Paper,
  Slider,
  Switch,
  FormControlLabel,
  IconButton,
  Collapse,
  Divider,
  Button,
} from '@mui/material';
import SettingsIcon from '@mui/icons-material/Settings';
import CloseIcon from '@mui/icons-material/Close';
import {
  CraftBuddySettings,
  getSettings,
  saveSettings,
  resetSettings,
  DEFAULT_SETTINGS,
} from '../settings';

interface SettingsPanelProps {
  onSettingsChange?: (settings: CraftBuddySettings) => void;
}

export function SettingsPanel({ onSettingsChange }: SettingsPanelProps) {
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

  const handleSettingChange = <K extends keyof CraftBuddySettings>(
    key: K,
    value: CraftBuddySettings[K],
  ) => {
    const newSettings = saveSettings({ [key]: value });
    setSettings(newSettings);
    setDraftSettings(newSettings);
    onSettingsChange?.(newSettings);
  };

  const handleSliderDraftChange = <K extends SliderSettingKey>(
    key: K,
    value: number,
  ) => {
    setDraftSettings((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const handleSliderCommit = <K extends SliderSettingKey>(
    key: K,
    value: number,
  ) => {
    if (settings[key] === value) {
      return;
    }
    handleSettingChange(key, value as CraftBuddySettings[K]);
  };

  const handleReset = () => {
    const newSettings = resetSettings();
    setSettings(newSettings);
    setDraftSettings(newSettings);
    onSettingsChange?.(newSettings);
  };

  return (
    <Box sx={{ position: 'relative' }}>
      {/* Settings toggle button */}
      <IconButton
        onClick={() => setIsOpen(!isOpen)}
        size="small"
        sx={{
          position: 'absolute',
          top: -8,
          right: -8,
          backgroundColor: 'rgba(50, 50, 50, 0.9)',
          color: isOpen ? '#FFD700' : 'rgba(255, 255, 255, 0.6)',
          '&:hover': {
            backgroundColor: 'rgba(70, 70, 70, 0.9)',
            color: '#FFD700',
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
          sx={{
            p: 2,
            mb: 1,
            backgroundColor: 'rgba(40, 40, 40, 0.95)',
            border: '1px solid rgba(255, 215, 0, 0.3)',
            borderRadius: 2,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
            <SettingsIcon sx={{ color: '#FFD700', fontSize: 20 }} />
            <Typography
              variant="subtitle1"
              sx={{ color: '#FFD700', fontWeight: 'bold' }}
            >
              Settings
            </Typography>
          </Box>

          {/* Lookahead Depth */}
          <Box sx={{ mb: 2 }}>
            <Typography
              variant="body2"
              sx={{ color: 'rgba(255, 255, 255, 0.8)', mb: 0.5 }}
            >
              Lookahead Depth: {draftSettings.lookaheadDepth}
            </Typography>
            <Slider
              value={draftSettings.lookaheadDepth}
              onChange={(_, value) =>
                handleSliderDraftChange('lookaheadDepth', value as number)
              }
              onChangeCommitted={(_, value) =>
                handleSliderCommit('lookaheadDepth', value as number)
              }
              min={1}
              max={96}
              step={1}
              marks
              size="small"
              sx={{
                color: '#FFD700',
                '& .MuiSlider-markLabel': { color: 'rgba(255, 255, 255, 0.5)' },
              }}
            />
            <Typography
              variant="caption"
              sx={{ color: 'rgba(255, 255, 255, 0.4)' }}
            >
              Default: {DEFAULT_SETTINGS.lookaheadDepth}. Higher values can
              cause lag on slower machines.
            </Typography>
            <Typography
              variant="caption"
              sx={{
                color: 'rgba(255, 255, 255, 0.4)',
                display: 'block',
                mt: 0.5,
              }}
            >
              Tip: For very long crafts (e.g., 60-90 rounds), try 64 or 96 with
              a higher time budget and max nodes.
            </Typography>
          </Box>

          {/* Search Budget */}
          <Box sx={{ mb: 2 }}>
            <Typography
              variant="body2"
              sx={{ color: 'rgba(255, 255, 255, 0.8)', mb: 0.5 }}
            >
              Search Time Budget: {draftSettings.searchTimeBudgetMs}ms
            </Typography>
            <Slider
              value={draftSettings.searchTimeBudgetMs}
              onChange={(_, value) =>
                handleSliderDraftChange('searchTimeBudgetMs', value as number)
              }
              onChangeCommitted={(_, value) =>
                handleSliderCommit('searchTimeBudgetMs', value as number)
              }
              min={10}
              max={500}
              step={10}
              size="small"
              sx={{ color: '#FFD700' }}
            />
            <Typography
              variant="body2"
              sx={{ color: 'rgba(255, 255, 255, 0.8)', mb: 0.5, mt: 1 }}
            >
              Search Max Nodes: {draftSettings.searchMaxNodes.toLocaleString()}
            </Typography>
            <Slider
              value={draftSettings.searchMaxNodes}
              onChange={(_, value) =>
                handleSliderDraftChange('searchMaxNodes', value as number)
              }
              onChangeCommitted={(_, value) =>
                handleSliderCommit('searchMaxNodes', value as number)
              }
              min={1000}
              max={100000}
              step={1000}
              size="small"
              sx={{ color: '#FFD700' }}
            />
            <Typography
              variant="body2"
              sx={{ color: 'rgba(255, 255, 255, 0.8)', mb: 0.5, mt: 1 }}
            >
              Search Beam Width: {draftSettings.searchBeamWidth}
            </Typography>
            <Slider
              value={draftSettings.searchBeamWidth}
              onChange={(_, value) =>
                handleSliderDraftChange('searchBeamWidth', value as number)
              }
              onChangeCommitted={(_, value) =>
                handleSliderCommit('searchBeamWidth', value as number)
              }
              min={3}
              max={15}
              step={1}
              size="small"
              sx={{ color: '#FFD700' }}
            />
          </Box>

          <Divider sx={{ my: 1.5, borderColor: 'rgba(100, 100, 100, 0.5)' }} />

          {/* Display Options */}
          <Typography
            variant="body2"
            sx={{ color: 'rgba(255, 255, 255, 0.6)', mb: 1 }}
          >
            Display Options
          </Typography>

          <FormControlLabel
            control={
              <Switch
                checked={settings.compactMode}
                onChange={(e) =>
                  handleSettingChange('compactMode', e.target.checked)
                }
                size="small"
                sx={{
                  '& .MuiSwitch-switchBase.Mui-checked': { color: '#FFD700' },
                }}
              />
            }
            label={
              <Typography
                variant="body2"
                sx={{ color: 'rgba(255, 255, 255, 0.8)' }}
              >
                Compact Mode
              </Typography>
            }
            sx={{ mb: 0.5 }}
          />

          <FormControlLabel
            control={
              <Switch
                checked={settings.showOptimalRotation}
                onChange={(e) =>
                  handleSettingChange('showOptimalRotation', e.target.checked)
                }
                size="small"
                sx={{
                  '& .MuiSwitch-switchBase.Mui-checked': { color: '#FFD700' },
                }}
              />
            }
            label={
              <Typography
                variant="body2"
                sx={{ color: 'rgba(255, 255, 255, 0.8)' }}
              >
                Show Rotation
              </Typography>
            }
            sx={{ mb: 0.5 }}
          />

          <FormControlLabel
            control={
              <Switch
                checked={settings.showExpectedFinalState}
                onChange={(e) =>
                  handleSettingChange(
                    'showExpectedFinalState',
                    e.target.checked,
                  )
                }
                size="small"
                sx={{
                  '& .MuiSwitch-switchBase.Mui-checked': { color: '#FFD700' },
                }}
              />
            }
            label={
              <Typography
                variant="body2"
                sx={{ color: 'rgba(255, 255, 255, 0.8)' }}
              >
                Show Final State
              </Typography>
            }
            sx={{ mb: 0.5 }}
          />

          <FormControlLabel
            control={
              <Switch
                checked={settings.showForecastedConditions}
                onChange={(e) =>
                  handleSettingChange(
                    'showForecastedConditions',
                    e.target.checked,
                  )
                }
                size="small"
                sx={{
                  '& .MuiSwitch-switchBase.Mui-checked': { color: '#FFD700' },
                }}
              />
            }
            label={
              <Typography
                variant="body2"
                sx={{ color: 'rgba(255, 255, 255, 0.8)' }}
              >
                Show Conditions
              </Typography>
            }
            sx={{ mb: 0.5 }}
          />

          {/* Max Alternatives */}
          <Box sx={{ mt: 1.5 }}>
            <Typography
              variant="body2"
              sx={{ color: 'rgba(255, 255, 255, 0.8)', mb: 0.5 }}
            >
              Max Alternatives: {draftSettings.maxAlternatives}
            </Typography>
            <Slider
              value={draftSettings.maxAlternatives}
              onChange={(_, value) =>
                handleSliderDraftChange('maxAlternatives', value as number)
              }
              onChangeCommitted={(_, value) =>
                handleSliderCommit('maxAlternatives', value as number)
              }
              min={0}
              max={5}
              step={1}
              marks
              size="small"
              sx={{
                color: '#FFD700',
                '& .MuiSlider-markLabel': { color: 'rgba(255, 255, 255, 0.5)' },
              }}
            />
          </Box>

          <Divider sx={{ my: 1.5, borderColor: 'rgba(100, 100, 100, 0.5)' }} />

          {/* Keyboard Shortcuts Info */}
          <Typography
            variant="body2"
            sx={{ color: 'rgba(255, 255, 255, 0.6)', mb: 0.5 }}
          >
            Keyboard Shortcuts
          </Typography>
          <Typography
            variant="caption"
            sx={{ color: 'rgba(255, 255, 255, 0.4)', display: 'block' }}
          >
            Ctrl+Shift+C - Toggle panel visibility
          </Typography>
          <Typography
            variant="caption"
            sx={{ color: 'rgba(255, 255, 255, 0.4)', display: 'block' }}
          >
            Ctrl+Shift+M - Toggle compact mode
          </Typography>

          <Divider sx={{ my: 1.5, borderColor: 'rgba(100, 100, 100, 0.5)' }} />

          {/* Reset Button */}
          <Button
            onClick={handleReset}
            size="small"
            variant="outlined"
            sx={{
              color: 'rgba(255, 100, 100, 0.8)',
              borderColor: 'rgba(255, 100, 100, 0.5)',
              '&:hover': {
                borderColor: 'rgba(255, 100, 100, 0.8)',
                backgroundColor: 'rgba(255, 100, 100, 0.1)',
              },
            }}
          >
            Reset to Defaults
          </Button>
        </Paper>
      </Collapse>
    </Box>
  );
}

export default SettingsPanel;
