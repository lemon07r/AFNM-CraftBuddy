/**
 * CraftBuddy - Settings Panel UI Component
 *
 * Provides an in-game UI for configuring optimizer settings.
 * Uses themed components for consistent styling.
 */

import React, {
  useState,
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
} from 'react';
import {
  Box,
  Typography,
  Paper,
  Slider,
  Switch,
  IconButton,
  Button,
  Tooltip,
} from '@mui/material';
import SettingsIcon from '@mui/icons-material/Settings';
import CloseIcon from '@mui/icons-material/Close';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import CheckIcon from '@mui/icons-material/Check';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import {
  AMBITION_BAND_MAX,
  CraftBuddySettings,
  EXPERIMENTAL_SEARCH_PRESET_BUDGETS,
  getSettings,
  LEGACY_SEARCH_PRESET_BUDGETS,
  saveSettings,
  OPTIMIZER_ENGINE_OPTIONS,
  SEARCH_THREAD_OPTIONS,
  type OptimizerEngine,
  type SearchPresetBudget,
  type SearchPresetId,
  type SearchThreadCount,
} from '../settings';
import {
  formatSearchGoalPriorityBias,
  SEARCH_GOAL_PRIORITY_BIAS_MAX,
  SEARCH_GOAL_PRIORITY_BIAS_MIN,
  SEARCH_GOAL_PRIORITY_BIAS_STEP,
} from '../utils/searchGoalPriority';
import { formatAmbitionBands } from './ambitionBands';
import { colors } from './theme';
import { FlexRow } from './components';
import {
  transitions,
  versionBadgeReveal,
  holographicSweep,
} from './animations';

interface SettingsPanelProps {
  onSettingsChange?: (settings: CraftBuddySettings) => void;
  /** Called when a search-affecting setting changes */
  onSearchSettingsChange?: (settings: CraftBuddySettings) => void;
  /** Called when settings panel open state changes */
  onOpenChange?: (isOpen: boolean) => void;
  /** Optional version string shown in the bottom-right of the settings panel */
  version?: string;
  /** Optional controls to render to the left of the settings button */
  leadingControls?: React.ReactNode;
  /** Whether the recommendation panel is in compact mode */
  compact?: boolean;
}

interface SearchPreset {
  id: SearchPresetId;
  label: string;
  description: string;
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
  },
  {
    id: 'fast',
    label: 'Fast',
    description: 'Midpoint preset with lower wait than Balanced',
  },
  {
    id: 'balanced',
    label: 'Balanced',
    description: 'Moderate budget for harder real crafts',
  },
  {
    id: 'high_accuracy',
    label: 'High Accuracy',
    description: 'Deep search for difficult late-game turns',
  },
  {
    id: 'max',
    label: 'Max',
    description: 'Largest budget; best for the hardest turns and long crafts',
  },
];

function getSearchPresetBudget(
  presetId: SearchPresetId,
  engine: OptimizerEngine,
): SearchPresetBudget {
  return engine === 'experimental'
    ? EXPERIMENTAL_SEARCH_PRESET_BUDGETS[presetId]
    : LEGACY_SEARCH_PRESET_BUDGETS[presetId];
}

function matchesSearchPresetBudget(
  settings: CraftBuddySettings,
  values: SearchPresetBudget,
): boolean {
  return (
    settings.lookaheadDepth === values.lookaheadDepth &&
    settings.searchTimeBudgetMs === values.searchTimeBudgetMs &&
    settings.searchMaxNodes === values.searchMaxNodes &&
    settings.searchBeamWidth === values.searchBeamWidth
  );
}

const SEARCH_BUDGET_HELP: SettingHelpContent = {
  title: 'Search budget coupling',
  description:
    'Depth, time, nodes, and beam width work as one shared budget. Pushing one much higher than the others can waste search and sometimes make partial-frontier recommendations worse.',
  note: 'If you are unsure, start from a preset and only tune one step at a time.',
};

const OPTIMIZER_ENGINE_HELP: SettingHelpContent = {
  title: 'Optimizer Engine',
  description:
    'Chooses which search engine contributes to recommendations. Legacy uses the established TypeScript search only; Experimental adds the Rust/WASM MCTS policy prior for harder crafts.',
  note: 'Legacy is the v5 default. Experimental is opt-in while MCTS behavior is still being validated.',
};

const SEARCH_THREADS_HELP: SettingHelpContent = {
  title: 'Search Threads',
  description:
    'Runs the recommendation search on a background worker pool. Above 1, the root candidates are split across workers and the ranked results are merged, so wall-clock time drops on multi-core machines.',
  note: 'Auto uses min(cores - 2, 4). Each worker carries its own engine instance (a few MB of memory). Falls back to the single-worker path when blob workers are blocked.',
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

const SEARCH_GOAL_PRIORITY_HELP: SettingHelpContent = {
  title: 'Goal Priority Bias',
  description:
    'Shifts the optimizer between perfection-first and completion-first scoring. Balanced keeps the search on the mathematically neutral need-weighted policy.',
  note: 'Negative values favor perfection, positive values favor completion, and 0 keeps the default balanced policy.',
};

const OVERCRAFT_AMBITION_HELP: SettingHelpContent = {
  title: 'Push Extra Bands',
  description:
    'Lets the optimizer keep crafting past the target tier for extra completion and perfection bands, matching the game rewards: more result stacks or quality per extra perfection band and material refunds per extra completion band.',
  note: 'On by default. Turn off to stop at the target tier as soon as it is secured.',
};

const PERFECTION_BAND_GOAL_HELP: SettingHelpContent = {
  title: 'Perfection Band Goal',
  description:
    'Sets how many perfection bands (stars) the optimizer keeps working toward. Auto stops pushing perfection once the recipe outcome tier is secured; a higher goal makes the search keep investing turns in extra stars.',
  note: 'Auto is the default. Each band is 1.3x wider than the last, so high goals only pay off on crafts with turns to spare.',
};

const COMPLETION_BAND_CEILING_HELP: SettingHelpContent = {
  title: 'Completion Band Ceiling',
  description:
    'Stops the optimizer spending turns on completion past the chosen band. The target outcome tier stays reachable because the ceiling never drops below what the tier requires; it only trims extra overcraft completion.',
  note: 'Auto is the default. Lower it to redirect leftover turns from material refunds toward perfection.',
};

const SEARCH_GOAL_PRIORITY_MARKS = [
  { value: SEARCH_GOAL_PRIORITY_BIAS_MIN, label: 'Perfection' },
  { value: 0, label: 'Balanced' },
  { value: SEARCH_GOAL_PRIORITY_BIAS_MAX, label: 'Completion' },
];

const MAX_ALTERNATIVES_HELP: SettingHelpContent = {
  title: 'Max Alternatives',
  description:
    'Sets how many backup moves are shown under the top recommendation.',
  note: 'Display-only setting. Defaults to 1 alternative and can be raised later without changing search accuracy.',
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

function getOverlayContainer() {
  return typeof document !== 'undefined'
    ? (document.getElementById('craftbuddy-overlay') ?? document.body)
    : undefined;
}

function getTooltipPopperProps() {
  return {
    disablePortal: false,
    style: { zIndex: 10001 },
    container: getOverlayContainer(),
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

const SettingsGroup = memo(function SettingsGroup({
  title,
  help,
  description,
  children,
}: {
  title: string;
  help?: SettingHelpContent;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <Box
      sx={{
        p: 1,
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        borderRadius: 1.75,
        background:
          'linear-gradient(180deg, rgba(197, 160, 89, 0.05) 0%, rgba(17, 21, 30, 0.72) 22%, rgba(13, 16, 24, 0.92) 100%)',
        border: '1px solid rgba(197, 160, 89, 0.13)',
        boxShadow:
          'inset 0 1px 0 rgba(255, 255, 255, 0.04), 0 10px 24px rgba(0, 0, 0, 0.16)',
      }}
    >
      <FlexRow
        gap={0.5}
        sx={{ alignItems: 'center', justifyContent: 'space-between', mb: 0.5 }}
      >
        <FlexRow gap={0.5} sx={{ alignItems: 'center', minWidth: 0 }}>
          <SettingsSectionHeader>{title}</SettingsSectionHeader>
          {help && <InlineHelp help={help} />}
        </FlexRow>
      </FlexRow>
      {description && (
        <Typography
          variant="caption"
          sx={{ color: colors.textDisabled, display: 'block', mb: 0.9 }}
        >
          {description}
        </Typography>
      )}
      {children}
    </Box>
  );
});

/**
 * Slider setting component.
 */
const SliderSetting = memo(function SliderSetting({
  label,
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
  draftValue: number;
  min: number;
  max: number;
  step: number;
  marks?: boolean | Array<{ value: number; label?: React.ReactNode }>;
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
    <Box>
      <FlexRow
        gap={0.5}
        sx={{ alignItems: 'center', mb: 0.2, justifyContent: 'space-between' }}
      >
        <FlexRow gap={0.5} sx={{ alignItems: 'center', minWidth: 0 }}>
          <Typography variant="body2" sx={{ color: colors.textSecondary }}>
            {label}:
          </Typography>
          {tooltip && <InlineHelp help={tooltip} />}
        </FlexRow>
        <Typography
          component="span"
          variant="body2"
          sx={{ color: colors.gold, fontWeight: 600, flexShrink: 0 }}
        >
          {formattedValue}
        </Typography>
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
        <Typography
          variant="caption"
          sx={{ color: colors.textDisabled, display: 'block', mt: 0.05 }}
        >
          {hint}
        </Typography>
      )}
      {tip && (
        <Typography
          variant="caption"
          sx={{ color: colors.textDisabled, display: 'block', mt: 0.25 }}
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
  compact = false,
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
  const [panelHeight, setPanelHeight] = useState<number | null>(null);
  const [panelLayoutPhase, setPanelLayoutPhase] = useState<'base' | 'measured'>(
    'base',
  );
  const hostRef = useRef<HTMLDivElement | null>(null);
  const panelBodyRef = useRef<HTMLDivElement | null>(null);
  const panelInset = compact ? 12 : 16;

  type SliderSettingKey =
    | 'lookaheadDepth'
    | 'searchTimeBudgetMs'
    | 'searchMaxNodes'
    | 'searchBeamWidth'
    | 'searchGoalPriorityBias'
    | 'perfectionBandGoal'
    | 'completionBandCeiling'
    | 'maxAlternatives';
  type SearchSettingKey =
    | 'lookaheadDepth'
    | 'searchTimeBudgetMs'
    | 'searchMaxNodes'
    | 'searchBeamWidth'
    | 'searchGoalPriorityBias'
    | 'overcraftAmbition'
    | 'perfectionBandGoal'
    | 'completionBandCeiling'
    | 'optimizerEngine'
    | 'searchThreads';

  const applySettingsPatch = useCallback(
    (patch: Partial<CraftBuddySettings>): CraftBuddySettings => {
      const newSettings = saveSettings(patch);
      setSettings(newSettings);
      setDraftSettings(newSettings);
      onSettingsChange?.(newSettings);
      return newSettings;
    },
    [onSettingsChange],
  );

  const handleSettingChange = useCallback(
    <K extends keyof CraftBuddySettings>(
      key: K,
      value: CraftBuddySettings[K],
    ): CraftBuddySettings => applySettingsPatch({ [key]: value }),
    [applySettingsPatch],
  );

  const handleSliderDraftChange = useCallback(
    <K extends SliderSettingKey>(key: K, value: number) => {
      setDraftSettings((prev) => ({ ...prev, [key]: value }));
    },
    [],
  );

  // Search-affecting settings that should trigger recalculation
  const SEARCH_SETTINGS: SearchSettingKey[] = [
    'lookaheadDepth',
    'searchTimeBudgetMs',
    'searchMaxNodes',
    'searchBeamWidth',
    'searchGoalPriorityBias',
    'overcraftAmbition',
    'perfectionBandGoal',
    'completionBandCeiling',
    'optimizerEngine',
    'searchThreads',
  ];

  const handleOvercraftAmbitionChange = useCallback(
    (value: boolean) => {
      if (settings.overcraftAmbition === value) return;
      const newSettings = applySettingsPatch({ overcraftAmbition: value });
      onSearchSettingsChange?.(newSettings);
    },
    [settings.overcraftAmbition, applySettingsPatch, onSearchSettingsChange],
  );

  const handleSearchThreadsChange = useCallback(
    (threads: SearchThreadCount) => {
      if (settings.searchThreads === threads) return;
      const newSettings = applySettingsPatch({ searchThreads: threads });
      onSearchSettingsChange?.(newSettings);
    },
    [settings.searchThreads, applySettingsPatch, onSearchSettingsChange],
  );

  const handleSliderCommit = useCallback(
    <K extends SliderSettingKey>(key: K, value: number) => {
      if (settings[key] === value) return;
      const newSettings = handleSettingChange(
        key,
        value as CraftBuddySettings[K],
      );
      // Notify parent if this is a search-affecting setting
      if (
        SEARCH_SETTINGS.includes(key as SearchSettingKey) &&
        onSearchSettingsChange
      ) {
        onSearchSettingsChange(newSettings);
      }
    },
    [settings, handleSettingChange, onSearchSettingsChange],
  );

  const handleEngineChange = useCallback(
    (engine: OptimizerEngine) => {
      if (settings.optimizerEngine === engine) return;
      const activePreset = SEARCH_PRESETS.find((preset) =>
        matchesSearchPresetBudget(
          settings,
          getSearchPresetBudget(preset.id, settings.optimizerEngine),
        ),
      );
      const newSettings = applySettingsPatch({
        optimizerEngine: engine,
        ...(activePreset
          ? getSearchPresetBudget(activePreset.id, engine)
          : {}),
      });
      onSearchSettingsChange?.(newSettings);
    },
    [settings, applySettingsPatch, onSearchSettingsChange],
  );

  const handleApplyPreset = useCallback(
    (preset: SearchPreset) => {
      const newSettings = applySettingsPatch(
        getSearchPresetBudget(preset.id, settings.optimizerEngine),
      );
      onSearchSettingsChange?.(newSettings);
    },
    [settings.optimizerEngine, applySettingsPatch, onSearchSettingsChange],
  );

  const isPresetActive = useCallback(
    (preset: SearchPreset): boolean =>
      matchesSearchPresetBudget(
        settings,
        getSearchPresetBudget(preset.id, settings.optimizerEngine),
      ),
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

  const handleClose = useCallback(() => {
    setIsOpen(false);
    onOpenChange?.(false);
  }, [onOpenChange]);

  useEffect(() => {
    return () => {
      onOpenChange?.(false);
    };
  }, [onOpenChange]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [handleClose, isOpen]);

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

  useLayoutEffect(() => {
    setPanelLayoutPhase('base');
  }, [isOpen, settings, draftSettings, snapshotCopied, versionLabel]);

  useLayoutEffect(() => {
    if (
      typeof window === 'undefined' ||
      !hostRef.current ||
      !panelBodyRef.current
    ) {
      return;
    }

    const maxHeight = Math.max(0, window.innerHeight - 24);
    const baseHeight = Math.min(
      Math.ceil(
        hostRef.current.getBoundingClientRect().height + panelInset * 2,
      ),
      maxHeight || Number.MAX_SAFE_INTEGER,
    );

    if (panelLayoutPhase === 'base' || panelHeight == null) {
      if (panelHeight !== baseHeight) {
        setPanelHeight(baseHeight);
        return;
      }

      const bodyOverflow = Math.max(
        0,
        panelBodyRef.current.scrollHeight - panelBodyRef.current.clientHeight,
      );
      const desiredHeight = Math.min(
        baseHeight + bodyOverflow,
        maxHeight || baseHeight + bodyOverflow,
      );

      setPanelLayoutPhase('measured');
      if (desiredHeight !== baseHeight) {
        setPanelHeight(Math.ceil(desiredHeight));
      }
    }
  }, [panelHeight, panelInset, panelLayoutPhase]);

  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      typeof ResizeObserver === 'undefined'
    ) {
      return undefined;
    }

    const handleResizeProbe = () => {
      setPanelLayoutPhase('base');
    };

    const resizeObserver = new ResizeObserver(handleResizeProbe);
    const observedElements = [hostRef.current].filter(
      (element): element is HTMLDivElement => element !== null,
    );

    for (const element of observedElements) {
      resizeObserver.observe(element);
    }

    window.addEventListener('resize', handleResizeProbe);

    return () => {
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleResizeProbe);
    };
  }, []);

  return (
    <Box
      ref={hostRef}
      sx={{
        position: 'absolute',
        inset: 0,
        zIndex: 8,
        overflow: 'visible',
        pointerEvents: 'none',
      }}
    >
      {leadingControls && (
        <Box
          sx={{
            position: 'absolute',
            top: -8,
            right: 28,
            zIndex: 9,
            pointerEvents: isOpen ? 'none' : 'auto',
            opacity: isOpen ? 0 : 1,
            visibility: isOpen ? 'hidden' : 'visible',
            transform: isOpen
              ? 'translate(-10px, 6px) scale(0.94)'
              : 'translate(0, 0) scale(1)',
            filter: isOpen ? 'blur(1.5px)' : 'blur(0)',
            transition: isOpen
              ? 'opacity 0.18s ease, transform 0.28s cubic-bezier(0.4, 0, 0.2, 1), filter 0.22s ease, visibility 0s linear 0.18s'
              : 'opacity 0.18s ease, transform 0.28s cubic-bezier(0.4, 0, 0.2, 1), filter 0.22s ease, visibility 0s linear 0s',
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
          color: colors.textMuted,
          border: '1px solid rgba(80, 80, 100, 0.4)',
          opacity: isOpen ? 0 : 1,
          pointerEvents: isOpen ? 'none' : 'auto',
          visibility: isOpen ? 'hidden' : 'visible',
          transform: isOpen
            ? 'translateY(-6px) scale(0.88)'
            : 'translateY(0) scale(1)',
          transition: isOpen
            ? `${transitions.smooth}, visibility 0s linear 0.18s`
            : `${transitions.smooth}, visibility 0s linear 0s`,
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
        <SettingsIcon fontSize="small" />
      </IconButton>
      <Box
        sx={{
          position: 'absolute',
          top: -panelInset,
          left: -panelInset,
          right: -panelInset,
          height: panelHeight ?? `calc(100% + ${panelInset * 2}px)`,
          zIndex: 8,
          pointerEvents: isOpen ? 'auto' : 'none',
          visibility: isOpen ? 'visible' : 'hidden',
          transition: `visibility 0s linear ${isOpen ? '0s' : '0.42s'}`,
          overflow: 'visible',
          borderRadius: 2,
        }}
      >
        <Box
          sx={{
            position: 'absolute',
            inset: 0,
            background:
              'linear-gradient(180deg, rgba(7, 10, 16, 0.18) 0%, rgba(7, 10, 16, 0.32) 100%)',
            backdropFilter: isOpen ? 'blur(7px)' : 'blur(0px)',
            opacity: isOpen ? 1 : 0,
            transition:
              'opacity 0.24s ease, backdrop-filter 0.32s cubic-bezier(0.22, 1, 0.36, 1)',
          }}
        />

        <Paper
          elevation={0}
          sx={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
            background:
              'radial-gradient(circle at top right, rgba(197, 160, 89, 0.06), transparent 26%), radial-gradient(circle at top left, rgba(114, 162, 255, 0.06), transparent 28%), linear-gradient(160deg, rgba(20, 20, 28, 0.985) 0%, rgba(15, 15, 20, 0.99) 100%)',
            border: `1px solid ${colors.borderMedium}`,
            borderRadius: 2.2,
            boxShadow: '0 20px 46px rgba(0, 0, 0, 0.42)',
            opacity: isOpen ? 1 : 0,
            transform: isOpen
              ? 'translateX(0) scale(1)'
              : 'translateX(110%) scale(0.985)',
            transformOrigin: 'top right',
            transition:
              'transform 0.42s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.22s ease',
            '&::before': {
              content: '""',
              position: 'absolute',
              inset: 0,
              background:
                'linear-gradient(120deg, transparent 22%, rgba(210, 195, 160, 0.07) 40%, rgba(152, 218, 255, 0.1) 52%, transparent 70%)',
              opacity: isOpen ? 1 : 0,
              transform: 'translateX(-140%)',
              animation: isOpen
                ? `${holographicSweep} 0.95s cubic-bezier(0.3, 0, 0.2, 1) 1 both`
                : 'none',
              pointerEvents: 'none',
            },
          }}
        >
          <Box
            sx={{
              position: 'relative',
              px: compact ? 1.25 : 1.45,
              py: compact ? 1.05 : 1.15,
              borderBottom: '1px solid rgba(197, 160, 89, 0.14)',
              background:
                'linear-gradient(180deg, rgba(197, 160, 89, 0.07) 0%, rgba(197, 160, 89, 0.02) 70%, transparent 100%)',
            }}
          >
            <FlexRow
              gap={1}
              sx={{ alignItems: 'center', justifyContent: 'space-between' }}
            >
              <FlexRow gap={0.8} sx={{ alignItems: 'center', minWidth: 0 }}>
                <SettingsIcon sx={{ color: colors.gold, fontSize: 18 }} />
                <Typography
                  variant="subtitle1"
                  sx={{ color: colors.gold, fontWeight: 600 }}
                >
                  Settings
                </Typography>
              </FlexRow>

              <FlexRow
                gap={0.45}
                sx={{ alignItems: 'center', flexShrink: 0, ml: 1 }}
              >
                {!compact && leadingControls && (
                  <Box sx={{ display: 'inline-flex', mr: 0.2 }}>
                    {leadingControls}
                  </Box>
                )}
                <Tooltip
                  title="Export optimizer replay snapshot with recent turns for bug reports (same as Ctrl+Shift+Y; copies to clipboard when available, otherwise downloads a .json file)"
                  enterDelay={300}
                  placement="bottom-end"
                  arrow
                  PopperProps={getTooltipPopperProps()}
                >
                  <IconButton
                    size="small"
                    onClick={handleCopySnapshot}
                    sx={{
                      color: snapshotCopied
                        ? colors.gold
                        : 'rgba(210, 192, 150, 0.7)',
                      transition: transitions.smooth,
                      padding: '4px',
                      border: '1px solid rgba(197, 160, 89, 0.16)',
                      backgroundColor: 'rgba(18, 22, 32, 0.55)',
                      '&:hover': {
                        color: colors.gold,
                        borderColor: colors.borderMedium,
                        backgroundColor: 'rgba(197, 160, 89, 0.1)',
                      },
                    }}
                  >
                    {snapshotCopied ? (
                      <CheckIcon sx={{ fontSize: '0.9rem' }} />
                    ) : (
                      <ContentCopyIcon sx={{ fontSize: '0.9rem' }} />
                    )}
                  </IconButton>
                </Tooltip>

                <IconButton
                  size="small"
                  onClick={handleClose}
                  sx={{
                    color: colors.textSecondary,
                    border: '1px solid rgba(197, 160, 89, 0.16)',
                    backgroundColor: 'rgba(18, 22, 32, 0.55)',
                    '&:hover': {
                      color: colors.gold,
                      borderColor: colors.borderMedium,
                      backgroundColor: 'rgba(197, 160, 89, 0.1)',
                    },
                  }}
                >
                  <CloseIcon sx={{ fontSize: '0.95rem' }} />
                </IconButton>
              </FlexRow>
            </FlexRow>
          </Box>

          <Box
            ref={panelBodyRef}
            sx={{
              flex: 1,
              minHeight: 0,
              overflowY: 'auto',
              px: compact ? 1.05 : 1.2,
              py: compact ? 0.95 : 1.05,
            }}
          >
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: compact
                  ? 'minmax(0, 1fr)'
                  : 'minmax(0, 1.3fr) minmax(0, 0.92fr)',
                gridTemplateRows: compact ? 'auto' : 'auto minmax(0, 1fr)',
                gap: 1.05,
                alignItems: 'stretch',
                alignContent: 'stretch',
                minHeight: '100%',
              }}
            >
              <Box sx={{ gridColumn: compact ? 'auto' : '1 / -1' }}>
                <SettingsGroup
                  title="Search Engine"
                  help={OPTIMIZER_ENGINE_HELP}
                  description="Legacy is stable. Experimental adds the native MCTS policy prior for difficult crafts."
                >
                  <FlexRow gap={0.65} sx={{ flexWrap: 'wrap' }}>
                    {OPTIMIZER_ENGINE_OPTIONS.map((option) => {
                      const active = settings.optimizerEngine === option.id;
                      return (
                        <Tooltip
                          key={option.id}
                          title={renderHelpContent({
                            title: option.label,
                            description: option.description,
                            note: option.note,
                          })}
                          enterDelay={250}
                          placement="top"
                          arrow
                          PopperProps={getTooltipPopperProps()}
                        >
                          <Button
                            size="small"
                            variant={active ? 'contained' : 'outlined'}
                            onClick={() => handleEngineChange(option.id)}
                            sx={{
                              minWidth: compact ? 104 : 122,
                              color: active ? '#141414' : colors.textSecondary,
                              backgroundColor: active
                                ? colors.gold
                                : 'transparent',
                              borderColor: active
                                ? colors.gold
                                : `${colors.borderMedium}`,
                              transition: transitions.smooth,
                              '&:hover': {
                                borderColor: colors.gold,
                                backgroundColor: active
                                  ? colors.goldDark
                                  : 'rgba(197, 160, 89, 0.12)',
                              },
                            }}
                          >
                            {option.label}
                          </Button>
                        </Tooltip>
                      );
                    })}
                  </FlexRow>
                  <FlexRow
                    gap={0.65}
                    sx={{ flexWrap: 'wrap', alignItems: 'center', mt: 1 }}
                  >
                    <Tooltip
                      title={renderHelpContent(SEARCH_THREADS_HELP)}
                      enterDelay={250}
                      placement="top"
                      arrow
                      PopperProps={getTooltipPopperProps()}
                    >
                      <Typography
                        variant="caption"
                        sx={{
                          color: colors.textSecondary,
                          cursor: 'help',
                          mr: 0.5,
                        }}
                      >
                        Threads
                      </Typography>
                    </Tooltip>
                    {SEARCH_THREAD_OPTIONS.map((option) => {
                      const active = settings.searchThreads === option.id;
                      return (
                        <Tooltip
                          key={String(option.id)}
                          title={renderHelpContent({
                            title: option.label,
                            description: option.description,
                            note: option.note,
                          })}
                          enterDelay={250}
                          placement="top"
                          arrow
                          PopperProps={getTooltipPopperProps()}
                        >
                          <Button
                            size="small"
                            variant={active ? 'contained' : 'outlined'}
                            onClick={() => handleSearchThreadsChange(option.id)}
                            sx={{
                              minWidth: compact ? 44 : 52,
                              color: active ? '#141414' : colors.textSecondary,
                              backgroundColor: active
                                ? colors.gold
                                : 'transparent',
                              borderColor: active
                                ? colors.gold
                                : `${colors.borderMedium}`,
                              transition: transitions.smooth,
                              '&:hover': {
                                borderColor: colors.gold,
                                backgroundColor: active
                                  ? colors.goldDark
                                  : 'rgba(197, 160, 89, 0.12)',
                              },
                            }}
                          >
                            {option.label}
                          </Button>
                        </Tooltip>
                      );
                    })}
                  </FlexRow>
                </SettingsGroup>
              </Box>

              <Box sx={{ gridColumn: compact ? 'auto' : '1 / -1' }}>
                <SettingsGroup title="Search Presets">
                  <FlexRow gap={0.65} sx={{ flexWrap: 'wrap' }}>
                    {SEARCH_PRESETS.map((preset) => {
                      const active = isPresetActive(preset);
                      const values = getSearchPresetBudget(
                        preset.id,
                        settings.optimizerEngine,
                      );
                      return (
                        <Tooltip
                          key={preset.id}
                          title={renderHelpContent({
                            title: preset.label,
                            description: preset.description,
                            note: `Depth ${values.lookaheadDepth} | Time ${formatSeconds(
                              values.searchTimeBudgetMs,
                            )} | Nodes ${formatNodesThousands(
                              values.searchMaxNodes,
                            )} | Beam ${values.searchBeamWidth}`,
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
                              backgroundColor: active
                                ? colors.gold
                                : 'transparent',
                              borderColor: active
                                ? colors.gold
                                : `${colors.borderMedium}`,
                              transition: transitions.smooth,
                              '&:hover': {
                                borderColor: colors.gold,
                                backgroundColor: active
                                  ? colors.goldDark
                                  : 'rgba(197, 160, 89, 0.12)',
                              },
                            }}
                          >
                            {preset.label}
                          </Button>
                        </Tooltip>
                      );
                    })}
                  </FlexRow>
                </SettingsGroup>
              </Box>

              <Box
                sx={{
                  minWidth: 0,
                  minHeight: 0,
                  display: 'flex',
                  '& > *': {
                    flex: 1,
                  },
                }}
              >
                <SettingsGroup
                  title="Search Budget"
                  help={SEARCH_BUDGET_HELP}
                  description="These sliders share one search budget. Keep them in ratio."
                >
                  <Box
                    sx={{
                      flex: 1,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: compact ? 0.9 : 0.75,
                      minHeight: 0,
                    }}
                  >
                    <SliderSetting
                      label="Lookahead Depth"
                      draftValue={draftSettings.lookaheadDepth}
                      min={1}
                      max={96}
                      step={1}
                      tooltip={LOOKAHEAD_DEPTH_HELP}
                      onChange={(v) =>
                        handleSliderDraftChange('lookaheadDepth', v)
                      }
                      onCommit={(v) => handleSliderCommit('lookaheadDepth', v)}
                    />

                    <SliderSetting
                      label="Search Time Budget"
                      draftValue={draftSettings.searchTimeBudgetMs}
                      min={100}
                      max={10000}
                      step={100}
                      valueFormatter={formatSeconds}
                      tooltip={SEARCH_TIME_HELP}
                      onChange={(v) =>
                        handleSliderDraftChange('searchTimeBudgetMs', v)
                      }
                      onCommit={(v) =>
                        handleSliderCommit('searchTimeBudgetMs', v)
                      }
                    />

                    <SliderSetting
                      label="Search Max Nodes"
                      draftValue={draftSettings.searchMaxNodes}
                      min={1000}
                      max={5000000}
                      step={10000}
                      valueFormatter={formatNodesThousands}
                      tooltip={SEARCH_MAX_NODES_HELP}
                      onChange={(v) =>
                        handleSliderDraftChange('searchMaxNodes', v)
                      }
                      onCommit={(v) => handleSliderCommit('searchMaxNodes', v)}
                    />

                    <SliderSetting
                      label="Search Beam Width"
                      draftValue={draftSettings.searchBeamWidth}
                      min={3}
                      max={20}
                      step={1}
                      tooltip={SEARCH_BEAM_WIDTH_HELP}
                      onChange={(v) =>
                        handleSliderDraftChange('searchBeamWidth', v)
                      }
                      onCommit={(v) => handleSliderCommit('searchBeamWidth', v)}
                    />

                    <SliderSetting
                      label="Goal Priority Bias"
                      draftValue={draftSettings.searchGoalPriorityBias}
                      min={SEARCH_GOAL_PRIORITY_BIAS_MIN}
                      max={SEARCH_GOAL_PRIORITY_BIAS_MAX}
                      step={SEARCH_GOAL_PRIORITY_BIAS_STEP}
                      marks={SEARCH_GOAL_PRIORITY_MARKS}
                      tooltip={SEARCH_GOAL_PRIORITY_HELP}
                      valueFormatter={formatSearchGoalPriorityBias}
                      hint="Balanced is the default and most mathematically neutral search policy."
                      tip="Move left to favor perfection-first lines or right to favor completion-first lines."
                      onChange={(v) =>
                        handleSliderDraftChange('searchGoalPriorityBias', v)
                      }
                      onCommit={(v) =>
                        handleSliderCommit('searchGoalPriorityBias', v)
                      }
                    />

                    <ToggleSetting
                      label="Push Extra Bands"
                      checked={settings.overcraftAmbition}
                      tooltip={OVERCRAFT_AMBITION_HELP}
                      onChange={handleOvercraftAmbitionChange}
                    />

                    <SliderSetting
                      label="Perfection Band Goal"
                      draftValue={draftSettings.perfectionBandGoal}
                      min={0}
                      max={AMBITION_BAND_MAX}
                      step={1}
                      tooltip={PERFECTION_BAND_GOAL_HELP}
                      valueFormatter={formatAmbitionBands}
                      hint="Auto stops once the recipe outcome tier is secured."
                      tip="Raise it to keep chasing extra stars; the percentage is the perfection needed."
                      onChange={(v) =>
                        handleSliderDraftChange('perfectionBandGoal', v)
                      }
                      onCommit={(v) =>
                        handleSliderCommit('perfectionBandGoal', v)
                      }
                    />

                    <SliderSetting
                      label="Completion Band Ceiling"
                      draftValue={draftSettings.completionBandCeiling}
                      min={0}
                      max={AMBITION_BAND_MAX}
                      step={1}
                      tooltip={COMPLETION_BAND_CEILING_HELP}
                      valueFormatter={formatAmbitionBands}
                      hint="Auto lets overcraft completion run as far as the search likes."
                      tip="Lower it to stop banking completion past that band and spend the turns elsewhere."
                      onChange={(v) =>
                        handleSliderDraftChange('completionBandCeiling', v)
                      }
                      onCommit={(v) =>
                        handleSliderCommit('completionBandCeiling', v)
                      }
                    />
                  </Box>
                </SettingsGroup>
              </Box>

              <Box
                sx={{
                  minWidth: 0,
                  minHeight: 0,
                  display: 'grid',
                  gap: 1.05,
                  gridTemplateRows: compact
                    ? 'auto auto'
                    : 'minmax(0, 1fr) auto',
                  alignItems: 'stretch',
                }}
              >
                <Box
                  sx={{
                    minWidth: 0,
                    minHeight: 0,
                    display: 'flex',
                    '& > *': {
                      flex: 1,
                    },
                  }}
                >
                  <SettingsGroup title="Display Options">
                    <Box
                      sx={{
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        gap: compact ? 0.7 : 0.55,
                        minHeight: 0,
                      }}
                    >
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
                        onChange={(v) =>
                          handleSettingChange('showOptimalRotation', v)
                        }
                      />

                      <ToggleSetting
                        label="Show Final State"
                        checked={settings.showExpectedFinalState}
                        tooltip={SHOW_FINAL_STATE_HELP}
                        onChange={(v) =>
                          handleSettingChange('showExpectedFinalState', v)
                        }
                      />

                      <ToggleSetting
                        label="Show Conditions"
                        checked={settings.showForecastedConditions}
                        tooltip={SHOW_CONDITIONS_HELP}
                        onChange={(v) =>
                          handleSettingChange('showForecastedConditions', v)
                        }
                      />

                      <SliderSetting
                        label="Max Alternatives"
                        draftValue={draftSettings.maxAlternatives}
                        min={0}
                        max={5}
                        step={1}
                        marks
                        tooltip={MAX_ALTERNATIVES_HELP}
                        onChange={(v) =>
                          handleSliderDraftChange('maxAlternatives', v)
                        }
                        onCommit={(v) =>
                          handleSliderCommit('maxAlternatives', v)
                        }
                      />
                    </Box>
                  </SettingsGroup>
                </Box>

                <SettingsGroup title="Keyboard Shortcuts">
                  <Typography
                    variant="caption"
                    sx={{ color: colors.textSecondary, display: 'block' }}
                  >
                    Ctrl+Shift+C - Toggle panel visibility
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{
                      color: colors.textSecondary,
                      display: 'block',
                      mt: 0.2,
                    }}
                  >
                    Ctrl+Shift+M - Toggle compact mode
                  </Typography>
                  <Typography
                    variant="caption"
                    sx={{
                      color: colors.textSecondary,
                      display: 'block',
                      mt: 0.2,
                    }}
                  >
                    Ctrl+Shift+Y - Export snapshot bundle
                  </Typography>
                </SettingsGroup>
              </Box>
            </Box>
          </Box>

          {(versionLabel || snapshotCopied) && (
            <Box
              sx={{
                px: compact ? 1.35 : 1.5,
                py: 0.7,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                borderTop: '1px solid rgba(197, 160, 89, 0.12)',
                backgroundColor: 'rgba(12, 14, 22, 0.65)',
              }}
            >
              <Typography
                variant="caption"
                sx={{ color: colors.textMuted, minHeight: 14 }}
              >
                {snapshotCopied
                  ? 'Snapshot bundle exported for bug reports.'
                  : 'Press Esc to close settings.'}
              </Typography>

              {versionLabel && (
                <Typography
                  variant="caption"
                  sx={{
                    display: 'inline-block',
                    overflow: 'hidden',
                    isolation: 'isolate',
                    fontSize: '0.66rem',
                    color: 'rgba(210, 192, 150, 0.96)',
                    letterSpacing: '0.04em',
                    lineHeight: 1,
                    pointerEvents: 'none',
                    opacity: showVersion ? 0.94 : 0,
                    transform: showVersion
                      ? 'translateY(0) scale(1)'
                      : 'translateY(5px) scale(0.9)',
                    filter: showVersion ? 'blur(0)' : 'blur(3px)',
                    textShadow: showVersion
                      ? '0 0 10px rgba(210, 185, 130, 0.32)'
                      : '0 0 0 rgba(210, 185, 130, 0)',
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
                        'linear-gradient(110deg, transparent 22%, rgba(152, 218, 255, 0.2) 42%, rgba(210, 195, 140, 0.4) 50%, rgba(152, 218, 255, 0.2) 58%, transparent 78%)',
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
          )}
        </Paper>
      </Box>
    </Box>
  );
});

export default SettingsPanel;
