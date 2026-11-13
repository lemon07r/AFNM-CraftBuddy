import { createTheme } from '@mui/material';
import type { OutcomeSummaryTone } from '../utils/outcomeSummary';

/**
 * CraftBuddy's own design language: graphite surfaces, one warm brass accent,
 * and a bundled modern sans for everything functional. The game's roots and
 * native controls are never themed.
 */

/** Text sizes follow the user's text-size preference via one CSS variable. */
export const TEXT_SCALE_VAR = '--craftbuddy-text-scale';
export function fs(px: number): string {
  return `calc(${px}px * var(${TEXT_SCALE_VAR}, 1))`;
}

export const tokens = {
  surface: {
    panel: '#131418',
    panelGlass: 'rgba(19, 20, 24, 0.97)',
    gradient:
      'linear-gradient(180deg, rgba(30,31,37,.985) 0%, rgba(19,20,24,.985) 220px)',
    card: '#1b1c21',
    raised: '#22232a',
    control: '#26272e',
    sunken: '#0e0f12',
    hover: 'rgba(255,255,255,.05)',
    pressed: 'rgba(255,255,255,.08)',
    selected: 'rgba(232,186,96,.13)',
  },
  border: {
    hairline: 'rgba(255,255,255,.06)',
    default: 'rgba(255,255,255,.1)',
    strong: 'rgba(255,255,255,.17)',
    accent: 'rgba(232,186,96,.55)',
    rule: 'linear-gradient(90deg, rgba(232,186,96,0) 0%, rgba(232,186,96,.5) 50%, rgba(232,186,96,0) 100%)',
  },
  text: {
    primary: '#f3f1ec',
    secondary: '#c9c5bd',
    muted: '#a29e96',
    disabled: '#6f6c67',
    gold: '#e8ba60',
    goldBright: '#f5d48c',
    onAccent: '#1d1507',
  },
  semantic: {
    positive: '#5fd6a4',
    warning: '#f5a85f',
    danger: '#ff7a7f',
    info: '#7cc4ef',
  },
  resource: {
    completion: '#8bd98f',
    perfection: '#79c3f2',
    stability: '#f2b65a',
    qi: '#b9a6ff',
  },
  condition: {
    veryPositive: '#7fe6c0',
    positive: '#8cd8ee',
    neutral: '#d9d5cc',
    negative: '#f0cf7a',
    veryNegative: '#ff9a7e',
  },
  radius: { xs: 4, sm: 6, md: 9, lg: 12, xl: 14 },
  /** Scaled CSS sizes; every functional text size goes through these. */
  type: {
    display: fs(22),
    title: fs(19),
    heading: fs(17),
    lead: fs(16),
    body: fs(15),
    bodySm: fs(14),
    label: fs(13),
  },
  lineHeight: { body: 1.45, tight: 1.25 },
  control: { sm: 32, md: 38, lg: 42, icon: 34 },
  shadow: {
    panel:
      '0 24px 60px -12px rgba(0,0,0,.65), 0 4px 14px rgba(0,0,0,.35), inset 0 1px 0 rgba(255,255,255,.05)',
    card: 'inset 0 1px 0 rgba(255,255,255,.04), 0 1px 2px rgba(0,0,0,.35)',
    button:
      '0 1px 0 rgba(255,255,255,.25) inset, 0 6px 16px -6px rgba(232,186,96,.55)',
  },
} as const;

// Compatibility names for consumers; all values come from the shared system.
export const colors = {
  gold: tokens.text.gold,
  goldLight: tokens.text.goldBright,
  goldDark: tokens.border.accent,
  panelBg: tokens.surface.panel,
  panelBgLight: tokens.surface.panel,
  cardBg: tokens.surface.card,
  cardBgHover: tokens.surface.hover,
  borderSubtle: tokens.border.hairline,
  borderMedium: tokens.border.default,
  textPrimary: tokens.text.primary,
  textSecondary: tokens.text.secondary,
  textMuted: tokens.text.muted,
  textDisabled: tokens.text.disabled,
  completion: tokens.resource.completion,
  stability: tokens.resource.stability,
  error: tokens.semantic.danger,
  fusion: tokens.resource.completion,
  refine: tokens.resource.perfection,
  stabilize: tokens.resource.stability,
  support: tokens.resource.qi,
  ...tokens.condition,
} as const;

const SANS_FALLBACK =
  '"Segoe UI Variable Text", "Segoe UI", system-ui, -apple-system, Roboto, "Noto Sans", Arial, sans-serif';
export const fonts = {
  body: `"CraftBuddy Inter", ${SANS_FALLBACK}`,
  display: `"CraftBuddy Display", "CraftBuddy Inter", ${SANS_FALLBACK}`,
  /** Kept for callers; functional headings use the sans face. */
  heading: `"CraftBuddy Inter", ${SANS_FALLBACK}`,
};

export const toneColors: Record<OutcomeSummaryTone, string> = {
  neutral: tokens.text.secondary,
  positive: tokens.semantic.positive,
  warning: tokens.semantic.warning,
  danger: tokens.semantic.danger,
  accent: tokens.text.gold,
};
export const focusRing = {
  outline: `2px solid ${tokens.text.goldBright}`,
  outlineOffset: 2,
} as const;
export const uiLayers = { overlay: 10000, dialog: 10010, tooltip: 10020 };
export const reducedMotionSx = {
  '@media (prefers-reduced-motion: reduce)': {
    '& *, & *::before, & *::after': {
      animation: 'none !important',
      transition: 'none !important',
      scrollBehavior: 'auto !important',
    },
  },
} as const;

/** Small uppercase label used for section eyebrows. */
export const eyebrowSx = {
  fontFamily: fonts.body,
  fontSize: fs(12.5),
  fontWeight: 650,
  letterSpacing: '.085em',
  textTransform: 'uppercase',
  lineHeight: 1.3,
  color: tokens.text.muted,
} as const;

export const scrollbarSx = {
  scrollbarWidth: 'thin',
  scrollbarColor: `${tokens.border.strong} transparent`,
} as const;

export const craftBuddyTheme = createTheme({
  spacing: 8,
  palette: {
    mode: 'dark',
    primary: { main: tokens.text.gold, contrastText: tokens.text.onAccent },
    secondary: { main: tokens.text.gold, contrastText: tokens.text.onAccent },
    background: { default: tokens.surface.panel, paper: tokens.surface.card },
    text: { primary: tokens.text.primary, secondary: tokens.text.secondary },
    divider: tokens.border.hairline,
    success: { main: tokens.semantic.positive },
    warning: { main: tokens.semantic.warning },
    error: { main: tokens.semantic.danger },
    info: { main: tokens.semantic.info },
  },
  typography: {
    fontFamily: fonts.body,
    h6: { fontFamily: fonts.body, fontSize: fs(19), fontWeight: 650 },
    subtitle1: {
      fontFamily: fonts.body,
      fontSize: fs(17),
      fontWeight: 650,
      lineHeight: 1.35,
    },
    subtitle2: { fontSize: fs(15), fontWeight: 600, lineHeight: 1.4 },
    body1: { fontSize: fs(15), lineHeight: tokens.lineHeight.body },
    body2: { fontSize: fs(14), lineHeight: tokens.lineHeight.body },
    caption: { fontSize: fs(13), lineHeight: 1.4 },
    button: {
      textTransform: 'none',
      fontSize: fs(15),
      fontWeight: 650,
      letterSpacing: '.005em',
    },
  },
  shape: { borderRadius: tokens.radius.sm },
  zIndex: { modal: uiLayers.dialog, tooltip: uiLayers.tooltip },
  components: {
    MuiButtonBase: {
      defaultProps: { disableRipple: true },
      styleOverrides: {
        root: { '&:focus-visible, &.Mui-focusVisible': focusRing },
      },
    },
    MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
    MuiButton: {
      defaultProps: { disableElevation: true, color: 'primary' },
      styleOverrides: {
        root: {
          minHeight: tokens.control.md,
          fontSize: fs(15),
          borderRadius: tokens.radius.md,
          lineHeight: 1.2,
          paddingInline: 14,
          transition:
            'color 120ms, border-color 120ms, background-color 120ms, box-shadow 120ms, transform 80ms',
          '&:active:not(.Mui-disabled)': { transform: 'translateY(1px)' },
          '&:focus-visible, &.Mui-focusVisible': focusRing,
        },
        contained: {
          background: `linear-gradient(180deg, ${tokens.text.goldBright} 0%, ${tokens.text.gold} 100%)`,
          color: tokens.text.onAccent,
          boxShadow: tokens.shadow.button,
          '&:hover': {
            background: `linear-gradient(180deg, #fbe0a6 0%, #f0c672 100%)`,
            boxShadow: tokens.shadow.button,
          },
          '&.Mui-disabled': {
            background: tokens.surface.control,
            color: tokens.text.disabled,
            boxShadow: 'none',
          },
        },
        outlined: {
          color: tokens.text.primary,
          backgroundColor: tokens.surface.control,
          borderColor: tokens.border.default,
          '&:hover': {
            borderColor: tokens.border.strong,
            backgroundColor: '#2d2e36',
          },
        },
        text: {
          color: tokens.text.secondary,
          '&:hover': {
            backgroundColor: tokens.surface.hover,
            color: tokens.text.primary,
          },
        },
      },
    },
    MuiIconButton: {
      defaultProps: { size: 'small' },
      styleOverrides: {
        root: {
          color: tokens.text.secondary,
          width: tokens.control.icon,
          height: tokens.control.icon,
          borderRadius: tokens.radius.md,
          transition: 'color 120ms, background-color 120ms',
          '&:hover': {
            color: tokens.text.primary,
            backgroundColor: tokens.surface.pressed,
          },
          '&:focus-visible, &.Mui-focusVisible': focusRing,
        },
      },
    },
    MuiSlider: {
      defaultProps: { color: 'primary' },
      styleOverrides: {
        root: { height: 6, padding: '15px 0', borderRadius: 6 },
        rail: { backgroundColor: tokens.surface.sunken, opacity: 1 },
        track: {
          border: 0,
          background: `linear-gradient(90deg, rgba(232,186,96,.55), ${tokens.text.gold})`,
        },
        thumb: {
          width: 18,
          height: 18,
          backgroundColor: tokens.text.goldBright,
          border: `3px solid ${tokens.surface.panel}`,
          boxShadow: `0 0 0 1px ${tokens.border.accent}, 0 2px 6px rgba(0,0,0,.5)`,
          transition: 'box-shadow 120ms, transform 120ms',
          '&::before': { display: 'none' },
          '&:hover, &.Mui-active': {
            boxShadow: `0 0 0 1px ${tokens.border.accent}, 0 0 0 7px rgba(232,186,96,.14)`,
          },
          '&.Mui-focusVisible': {
            ...focusRing,
            boxShadow: `0 0 0 1px ${tokens.border.accent}`,
          },
        },
        mark: {
          width: 2,
          height: 6,
          borderRadius: 1,
          backgroundColor: 'rgba(255,255,255,.16)',
        },
        markActive: { backgroundColor: 'rgba(29,21,7,.45)' },
        markLabel: {
          fontSize: fs(13),
          color: tokens.text.muted,
          top: 34,
          '&.MuiSlider-markLabelActive': { color: tokens.text.secondary },
        },
        valueLabel: {
          backgroundColor: tokens.surface.raised,
          fontSize: fs(13),
        },
      },
    },
    MuiSwitch: {
      defaultProps: { color: 'primary' },
      styleOverrides: {
        root: { width: 46, height: 28, padding: 0, overflow: 'visible' },
        switchBase: {
          padding: 3,
          transition: 'transform 140ms',
          color: '#d7d3cb',
          '&.Mui-checked': {
            color: tokens.text.onAccent,
            transform: 'translateX(18px)',
          },
          '&.Mui-checked + .MuiSwitch-track': {
            backgroundColor: tokens.text.gold,
            borderColor: tokens.text.gold,
            opacity: 1,
          },
          '&.Mui-focusVisible + .MuiSwitch-track': focusRing,
          '&:hover': { backgroundColor: 'transparent' },
        },
        thumb: {
          width: 22,
          height: 22,
          boxShadow: '0 1px 3px rgba(0,0,0,.45)',
        },
        track: {
          borderRadius: 14,
          boxSizing: 'border-box',
          border: `1px solid ${tokens.border.strong}`,
          backgroundColor: tokens.surface.sunken,
          opacity: 1,
          transition: 'background-color 140ms, border-color 140ms',
        },
      },
    },
    MuiTooltip: {
      defaultProps: {
        arrow: true,
        enterDelay: 250,
        TransitionProps: { timeout: 0 },
      },
      styleOverrides: {
        tooltip: {
          fontFamily: fonts.body,
          fontSize: fs(14),
          lineHeight: 1.5,
          maxWidth: 320,
          padding: '10px 14px',
          backgroundColor: '#2a2b33',
          border: `1px solid ${tokens.border.strong}`,
          borderRadius: tokens.radius.md,
          boxShadow: '0 12px 32px rgba(0,0,0,.5)',
          color: tokens.text.primary,
        },
        arrow: {
          color: '#2a2b33',
          '&::before': { border: `1px solid ${tokens.border.strong}` },
        },
      },
    },
    MuiDialog: {
      defaultProps: { transitionDuration: 0 },
      styleOverrides: {
        paper: {
          background: tokens.surface.gradient,
          backgroundColor: tokens.surface.panel,
          border: `1px solid ${tokens.border.default}`,
          borderRadius: tokens.radius.xl,
          boxShadow: tokens.shadow.panel,
        },
      },
    },
    MuiBackdrop: {
      styleOverrides: {
        root: {
          backgroundColor: 'rgba(6,7,9,.62)',
          backdropFilter: 'blur(3px)',
        },
      },
    },
  },
});

export function getSkillTypeColor(type: string): string {
  switch (type.toLowerCase()) {
    case 'fusion':
      return colors.fusion;
    case 'refine':
      return colors.refine;
    case 'stabilize':
      return colors.stabilize;
    case 'support':
      return colors.support;
    default:
      return tokens.text.gold;
  }
}
export function getConditionColor(condition: string): string {
  return (
    tokens.condition[condition as keyof typeof tokens.condition] ??
    tokens.condition.neutral
  );
}
