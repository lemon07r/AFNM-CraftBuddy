import React, {
  memo,
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  Box,
  Dialog,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  IconButton,
  Slider,
  Switch,
  Typography,
} from '@mui/material';
import SettingsIcon from '@mui/icons-material/Settings';
import CloseIcon from '@mui/icons-material/Close';
import {
  AMBITION_BAND_MAX,
  SEARCH_PRESET_BUDGETS,
  getSettings,
  saveSettings,
  subscribeSettings,
  type CraftBuddySettings,
  type SearchPresetId,
} from '../settings';
import { formatAmbitionBands } from './ambitionBands';
import { SEARCH_GOAL_PRIORITY_BIAS_STEP } from '../utils/searchGoalPriority';
import { ActionButton, Disclosure, Help, PanelHeading } from './components';
import { colors, uiLayers, reducedMotionSx } from './theme';
import { ChoiceGroup } from './components/ChoiceGroup';

interface SettingsPanelProps {
  onSettingsChange?: (settings: CraftBuddySettings) => void;
  /** Compatibility fallback: a commit invokes only one owner callback. */
  onSearchSettingsChange?: (settings: CraftBuddySettings) => void;
  version?: string;
  safetyControl?: React.ReactNode;
}

const PRESETS: ReadonlyArray<{ id: SearchPresetId; label: string }> = [
  { id: 'instant', label: 'Instant' },
  { id: 'fast', label: 'Fast' },
  { id: 'balanced', label: 'Balanced' },
  { id: 'high_accuracy', label: 'High accuracy' },
  { id: 'max', label: 'Max' },
];

const PERFECTION_BAND_GOAL_HELP =
  'Auto aims for the recipe’s target tier. Choose more bands to keep working toward extra stars.';
const COMPLETION_BAND_CEILING_HELP =
  'Auto follows the recipe. A lower ceiling redirects spare turns toward perfection, without lowering the tier requirement.';

type SearchSettingKey =
  | 'lookaheadDepth'
  | 'searchTimeBudgetMs'
  | 'searchMaxNodes'
  | 'searchBeamWidth'
  | 'searchGoalPriorityBias'
  | 'perfectionBandGoal'
  | 'completionBandCeiling'
  | 'overcraftAmbition'
  | 'searchThreads';
const SEARCH_SETTINGS: SearchSettingKey[] = [
  'lookaheadDepth',
  'searchTimeBudgetMs',
  'searchMaxNodes',
  'searchBeamWidth',
  'searchGoalPriorityBias',
  'perfectionBandGoal',
  'completionBandCeiling',
  'overcraftAmbition',
  'searchThreads',
];

const SliderSetting = memo(function SliderSetting({
  label,
  tooltip,
  draftValue,
  min,
  max,
  step = 1,
  format = String,
  onCommit,
}: {
  label: string;
  tooltip: string;
  draftValue: number;
  min: number;
  max: number;
  step?: number;
  format?: (value: number) => string;
  onCommit: (value: number) => void;
}) {
  // Dragging updates this control only. Persist/render the root once on commit;
  // CSS owns sizing, so there are no synchronous layout probes on each tick.
  const [draft, setDraft] = useState(draftValue);
  useEffect(() => setDraft(draftValue), [draftValue]);
  const id = useId();
  return (
    <Box sx={{ mt: 1.25, px: 0.5 }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
        <Typography id={id} component="span" variant="body2">
          {label}
        </Typography>
        <Help title={label}>{tooltip}</Help>
        <Typography
          component="output"
          variant="caption"
          sx={{ ml: 'auto', color: colors.textSecondary }}
        >
          {format(draft)}
        </Typography>
      </Box>
      <Slider
        aria-labelledby={id}
        getAriaValueText={format}
        min={min}
        max={max}
        step={step}
        value={draft}
        onChange={(_, value) => setDraft(Number(value))}
        onChangeCommitted={(_, value) => onCommit(Number(value))}
      />
    </Box>
  );
});

function ToggleSetting({
  label,
  checked,
  onChange,
  help,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
  help?: string;
}) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        minHeight: 38,
      }}
    >
      <FormControlLabel
        sx={{ m: 0, flex: 1 }}
        control={
          <Switch checked={checked} onChange={(_, value) => onChange(value)} />
        }
        label={<Typography variant="body2">{label}</Typography>}
      />
      {help && <Help title={label}>{help}</Help>}
    </Box>
  );
}

/** Reused unchanged in the overlay dialog and the game's native mod options. */
export function SettingsBody({
  onSettingsChange,
  onSearchSettingsChange,
  version,
}: SettingsPanelProps) {
  const settings = useSyncExternalStore(
    subscribeSettings,
    getSettings,
    getSettings,
  );
  const draftSettings = settings;
  const [exportStatus, setExportStatus] = useState('');
  const commit = useCallback(
    (patch: Partial<CraftBuddySettings>) => {
      const latest = getSettings();
      if (
        Object.entries(patch).every(
          ([key, value]) => latest[key as keyof CraftBuddySettings] === value,
        )
      )
        return;
      const next = saveSettings(patch);
      const searchChanged = SEARCH_SETTINGS.some((key) => key in patch);
      const notify =
        onSettingsChange ??
        (searchChanged ? onSearchSettingsChange : undefined);
      notify?.(next);
    },
    [onSettingsChange, onSearchSettingsChange],
  );
  const handleSliderCommit = (key: SearchSettingKey, value: number) =>
    commit({ [key]: value });
  const handleOvercraftAmbitionChange = (value: boolean) =>
    commit({ overcraftAmbition: value });
  const budgets = SEARCH_PRESET_BUDGETS;
  const activePreset =
    PRESETS.find(({ id }) =>
      Object.entries(budgets[id]).every(
        ([key, value]) => settings[key as keyof CraftBuddySettings] === value,
      ),
    )?.id ?? '';

  const exportSnapshot = async () => {
    const debug: unknown = (window as Window & { craftBuddyDebug?: unknown })
      .craftBuddyDebug;
    if (
      !debug ||
      typeof debug !== 'object' ||
      !('exportOptimizerReplaySnapshot' in debug) ||
      typeof debug.exportOptimizerReplaySnapshot !== 'function'
    ) {
      setExportStatus('No craft snapshot available.');
      return;
    }
    try {
      const result: unknown = await debug.exportOptimizerReplaySnapshot();
      const success =
        typeof result === 'object' &&
        result !== null &&
        (('copied' in result && result.copied === true) ||
          ('downloaded' in result && result.downloaded === true));
      setExportStatus(
        success
          ? 'Snapshot exported.'
          : 'No snapshot exported. Run a recommendation first.',
      );
    } catch {
      setExportStatus('Snapshot export failed.');
    }
  };

  return (
    <Box
      sx={{
        containerType: 'inline-size',
        color: colors.textPrimary,
        ...reducedMotionSx,
      }}
    >
      <Typography variant="subtitle2" component="h3" sx={{ mt: 0 }}>
        Search effort
      </Typography>
      <Typography variant="body2" sx={{ color: colors.textSecondary, mb: 1 }}>
        More effort may find a better plan, but takes longer.
      </Typography>
      <ChoiceGroup
        label="Search effort"
        hideLabel
        value={activePreset}
        options={PRESETS.map(({ id, label }) => ({
          id,
          label,
          detail: `Up to ${(budgets[id].searchTimeBudgetMs / 1000).toFixed(1)} seconds per turn`,
        }))}
        onChange={(id) => commit(budgets[id as SearchPresetId])}
      />

      <Box
        sx={{ borderTop: `1px solid ${colors.borderSubtle}`, mt: 2, pt: 1.5 }}
      >
        <Typography variant="subtitle2" component="h3">
          Craft goals
        </Typography>
        <ToggleSetting
          label="Aim for extra bands"
          checked={settings.overcraftAmbition}
          onChange={handleOvercraftAmbitionChange}
          help="Continue investing in extra stars and material refunds after the target tier is secured."
        />
        <SliderSetting
          label="Perfection band goal"
          tooltip={PERFECTION_BAND_GOAL_HELP}
          draftValue={draftSettings.perfectionBandGoal}
          min={0}
          max={AMBITION_BAND_MAX}
          format={formatAmbitionBands}
          onCommit={(value) => handleSliderCommit('perfectionBandGoal', value)}
        />
        <SliderSetting
          label="Completion band ceiling"
          tooltip={COMPLETION_BAND_CEILING_HELP}
          draftValue={draftSettings.completionBandCeiling}
          min={0}
          max={AMBITION_BAND_MAX}
          format={formatAmbitionBands}
          onCommit={(value) =>
            handleSliderCommit('completionBandCeiling', value)
          }
        />
        <SliderSetting
          label="Prefer perfection or completion"
          tooltip="Negative values favor perfection; positive values favor completion. Zero balances what the craft needs."
          draftValue={draftSettings.searchGoalPriorityBias}
          min={-100}
          max={100}
          step={SEARCH_GOAL_PRIORITY_BIAS_STEP}
          format={(value) =>
            value === 0
              ? 'Balanced'
              : `${Math.abs(value)} toward ${value < 0 ? 'perfection' : 'completion'}`
          }
          onCommit={(value) =>
            handleSliderCommit('searchGoalPriorityBias', value)
          }
        />
      </Box>

      <Box
        sx={{ borderTop: `1px solid ${colors.borderSubtle}`, mt: 1, pt: 1.5 }}
      >
        <Typography variant="subtitle2" component="h3">
          Display
        </Typography>
        <ToggleSetting
          label="Show crafting panel"
          checked={settings.panelVisible}
          onChange={(panelVisible) => commit({ panelVisible })}
        />
        <ToggleSetting
          label="Compact spacing"
          checked={settings.compactMode}
          onChange={(compactMode) => commit({ compactMode })}
          help="Denser spacing; all actions and details remain available. Ctrl+Shift+M also toggles this."
        />
        <ToggleSetting
          label="Show planned steps"
          checked={settings.showOptimalRotation}
          onChange={(showOptimalRotation) => commit({ showOptimalRotation })}
        />
        <ToggleSetting
          label="Show planned end state"
          checked={settings.showExpectedFinalState}
          onChange={(showExpectedFinalState) =>
            commit({ showExpectedFinalState })
          }
        />
        <ToggleSetting
          label="Show conditions"
          checked={settings.showForecastedConditions}
          onChange={(showForecastedConditions) =>
            commit({ showForecastedConditions })
          }
        />
        <ChoiceGroup
          label="Other actions to list"
          value={String(settings.maxAlternatives)}
          options={[0, 1, 2, 3, 4, 5].map((value) => ({
            id: String(value),
            label: String(value),
          }))}
          onChange={(value) => commit({ maxAlternatives: Number(value) })}
        />
      </Box>

      <Disclosure title="Advanced search">
        <Typography variant="body2" sx={{ color: colors.textSecondary, mb: 1 }}>
          Presets are recommended. Depth, time, states and branches share one
          budget; raising one alone may not improve the result.
        </Typography>
        <ChoiceGroup
          label="Background workers"
          value={String(settings.searchThreads)}
          options={[
            { id: '1', label: '1' },
            { id: '2', label: '2' },
            { id: '4', label: '4' },
            { id: 'auto', label: 'Auto' },
          ]}
          onChange={(value) =>
            commit({
              searchThreads:
                value === 'auto'
                  ? 'auto'
                  : value === '4'
                    ? 4
                    : value === '2'
                      ? 2
                      : 1,
            })
          }
        />
        <SliderSetting
          label="Turns to look ahead"
          tooltip="Maximum turns in a plan. The other limits may stop the search earlier."
          draftValue={settings.lookaheadDepth}
          min={1}
          max={96}
          onCommit={(value) => handleSliderCommit('lookaheadDepth', value)}
        />
        <SliderSetting
          label="Time per turn"
          tooltip="Maximum search wait on this computer."
          draftValue={settings.searchTimeBudgetMs}
          min={100}
          max={10000}
          step={100}
          format={(value) => `${(value / 1000).toFixed(1)} s`}
          onCommit={(value) => handleSliderCommit('searchTimeBudgetMs', value)}
        />
        <SliderSetting
          label="States to explore"
          tooltip="Maximum craft states the search can examine."
          draftValue={settings.searchMaxNodes}
          min={1000}
          max={5000000}
          step={1000}
          format={(value) => value.toLocaleString()}
          onCommit={(value) => handleSliderCommit('searchMaxNodes', value)}
        />
        <SliderSetting
          label="Branches to keep"
          tooltip="How many promising paths survive each search layer."
          draftValue={settings.searchBeamWidth}
          min={3}
          max={20}
          onCommit={(value) => handleSliderCommit('searchBeamWidth', value)}
        />
      </Disclosure>

      <Disclosure title="About & help">
        <Typography variant="body2">
          CraftBuddy {version ? `v${version.replace(/^v/, '')}` : ''}
        </Typography>
        <Typography variant="body2" sx={{ color: colors.textSecondary, my: 1 }}>
          Ctrl+Shift+C: show or hide · Ctrl+Shift+M: compact spacing ·
          Ctrl+Shift+Y: export snapshot
        </Typography>
        <Box
          sx={{
            display: 'flex',
            gap: 1.5,
            flexWrap: 'wrap',
            '& a': { color: colors.gold, fontSize: '0.8rem' },
          }}
        >
          <a
            href="https://discord.gg/gnyjqwxzC7"
            target="_blank"
            rel="noopener noreferrer"
          >
            Discord
          </a>
          <a
            href="https://github.com/lemon07r/AFNM-CraftBuddy"
            target="_blank"
            rel="noopener noreferrer"
          >
            GitHub
          </a>
          <a
            href="https://steamcommunity.com/sharedfiles/filedetails/?id=3661729323"
            target="_blank"
            rel="noopener noreferrer"
          >
            Steam Workshop
          </a>
        </Box>
        <ActionButton sx={{ mt: 1.5 }} onClick={() => void exportSnapshot()}>
          Export craft snapshot
        </ActionButton>
        <Typography role="status" variant="body2" sx={{ mt: 0.5 }}>
          {exportStatus}
        </Typography>
      </Disclosure>
    </Box>
  );
}

export function SettingsPanel(props: SettingsPanelProps) {
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const openerRef = useRef<HTMLButtonElement>(null);
  return (
    <>
      <IconButton
        ref={openerRef}
        aria-label="Open CraftBuddy settings"
        onClick={() => setOpen(true)}
      >
        <SettingsIcon sx={{ fontSize: 20 }} />
      </IconButton>
      <Dialog
        // MUI must hide only overlay siblings, never the game controls that
        // native auto-use automation still needs while settings are open.
        container={() =>
          openerRef.current?.closest<HTMLElement>('#craftbuddy-overlay') ??
          openerRef.current?.parentElement ??
          null
        }
        open={open}
        onClose={() => setOpen(false)}
        aria-labelledby={titleId}
        maxWidth="sm"
        fullWidth
        onKeyDownCapture={(event) => {
          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            setOpen(false);
          }
        }}
        sx={{
          zIndex: uiLayers.dialog,
          // The host overlay is pointer-events:none; the dialog opts back in.
          pointerEvents: 'auto',
          ...reducedMotionSx,
          '& .MuiDialog-paper': {
            m: 1.5,
            maxHeight: 'calc(100dvh - 24px)',
            width: 'calc(100% - 24px)',
          },
        }}
      >
        <DialogTitle
          component="div"
          sx={{
            display: 'flex',
            gap: 1,
            alignItems: 'center',
            py: 1.25,
            borderBottom: `1px solid ${colors.borderSubtle}`,
          }}
        >
          <Box id={titleId} sx={{ flex: 1 }}>
            <PanelHeading>CraftBuddy settings</PanelHeading>
          </Box>
          {props.safetyControl}
          <IconButton
            autoFocus
            aria-label="Close CraftBuddy settings"
            onClick={() => setOpen(false)}
          >
            <CloseIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent sx={{ pt: '16px !important' }}>
          <SettingsBody {...props} />
        </DialogContent>
      </Dialog>
    </>
  );
}
