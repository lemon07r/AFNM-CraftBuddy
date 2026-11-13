import { createTheme } from '@mui/material';
import type { OutcomeSummaryTone } from '../utils/outcomeSummary';

// Scoped to CraftBuddy. The game's roots and native controls are never themed.
export const tokens = {
  surface: {
    panel: '#1b150f',
    gradient: 'linear-gradient(180deg, #221a13 0%, #18130e 100%)',
    raised: '#2a2119',
    sunken: 'rgba(0,0,0,.32)',
    hover: 'rgba(227,194,122,.07)',
    selected: 'rgba(227,194,122,.14)',
  },
  border: {
    hairline: 'rgba(227,194,122,.14)',
    default: 'rgba(227,194,122,.26)',
    strong: 'rgba(227,194,122,.55)',
    rule: 'linear-gradient(90deg, transparent, rgba(227,194,122,.45), transparent)',
  },
  text: {
    primary: '#f0e4c6',
    secondary: '#cdb88f',
    muted: '#b5a07a',
    disabled: '#8f7e62',
    gold: '#e3c27a',
    goldBright: '#f3dca0',
  },
  semantic: {
    positive: '#5fd9a0',
    warning: '#ffa565',
    danger: '#ff6b78',
    info: '#7cc4e8',
  },
  resource: {
    completion: '#9ad08f',
    perfection: '#7cc4e8',
    stability: '#e8b467',
    qi: '#c9b6ff',
  },
  condition: {
    veryPositive: '#85e6c2',
    positive: '#82d7e6',
    neutral: '#dfd4ba',
    negative: '#efd17e',
    veryNegative: '#ff987c',
  },
  radius: { xs: 3, sm: 5, md: 8, lg: 12 },
  type: {
    display: 22,
    title: 19,
    heading: 16,
    body: 15,
    bodySm: 13.5,
    label: 12.5,
  },
  lineHeight: { body: 1.4 },
  control: { sm: 28, md: 34, lg: 40, icon: 32 },
} as const;

// Compatibility names for consumers; all values come from the shared system.
export const colors = {
  gold: tokens.text.gold,
  goldLight: tokens.text.goldBright,
  goldDark: tokens.border.strong,
  panelBg: tokens.surface.panel,
  panelBgLight: tokens.surface.panel,
  cardBg: tokens.surface.raised,
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

export const fonts = {
  body: 'normalFont, langGlyphs, "PT Serif", Georgia, serif',
  heading: 'fancyFont, normalFont, langGlyphs, "PT Serif", Georgia, serif',
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

export const craftBuddyTheme = createTheme({
  spacing: 8,
  palette: {
    mode: 'dark',
    primary: { main: tokens.text.gold, contrastText: '#22180c' },
    secondary: { main: tokens.text.gold, contrastText: '#22180c' },
    background: { default: tokens.surface.panel, paper: tokens.surface.raised },
    text: { primary: tokens.text.primary, secondary: tokens.text.secondary },
    divider: tokens.border.hairline,
    success: { main: tokens.semantic.positive },
    warning: { main: tokens.semantic.warning },
    error: { main: tokens.semantic.danger },
    info: { main: tokens.semantic.info },
  },
  typography: {
    fontFamily: fonts.body,
    h6: { fontFamily: fonts.heading, fontSize: 22, fontWeight: 400 },
    subtitle1: { fontFamily: fonts.heading, fontSize: 19, lineHeight: 1.35 },
    subtitle2: { fontSize: 15, fontWeight: 600, lineHeight: 1.4 },
    body1: { fontSize: 15, lineHeight: tokens.lineHeight.body },
    body2: { fontSize: 13.5, lineHeight: tokens.lineHeight.body },
    caption: { fontSize: 12.5, lineHeight: tokens.lineHeight.body },
    button: { textTransform: 'none', fontSize: 15, fontWeight: 600 },
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
          fontSize: tokens.type.body,
          borderRadius: tokens.radius.sm,
          lineHeight: 1.2,
          transition: 'color 120ms, border-color 120ms, background-color 120ms',
          '&:focus-visible, &.Mui-focusVisible': focusRing,
        },
        contained: {
          backgroundColor: tokens.text.gold,
          color: '#22180c',
          '&:hover': { backgroundColor: tokens.text.goldBright },
        },
        outlined: {
          borderColor: tokens.border.default,
          '&:hover': {
            borderColor: tokens.border.strong,
            backgroundColor: tokens.surface.hover,
          },
        },
        text: { '&:hover': { backgroundColor: tokens.surface.hover } },
      },
    },
    MuiIconButton: {
      defaultProps: { size: 'small' },
      styleOverrides: {
        root: {
          color: tokens.text.secondary,
          minWidth: tokens.control.icon,
          minHeight: tokens.control.icon,
          borderRadius: tokens.radius.sm,
          transition: 'color 120ms, background-color 120ms',
          '&:hover': {
            color: tokens.text.goldBright,
            backgroundColor: tokens.surface.hover,
          },
          '&:focus-visible, &.Mui-focusVisible': focusRing,
        },
      },
    },
    MuiSlider: {
      defaultProps: { color: 'primary', size: 'small' },
      styleOverrides: {
        root: { height: 3, padding: '14px 0' },
        rail: { backgroundColor: tokens.text.secondary, opacity: 0.22 },
        track: { border: 0 },
        thumb: {
          width: 13,
          height: 13,
          transition: 'color 120ms, border-color 120ms, transform 120ms',
          '&:hover, &.Mui-active': {
            boxShadow: '0 0 0 5px rgba(227,194,122,.12)',
          },
          '&.Mui-focusVisible': { ...focusRing, boxShadow: 'none' },
        },
        mark: { width: 3, height: 5, backgroundColor: tokens.text.muted },
        markLabel: {
          fontSize: tokens.type.label,
          color: tokens.text.secondary,
        },
        valueLabel: {
          backgroundColor: tokens.surface.raised,
          fontSize: tokens.type.bodySm,
        },
      },
    },
    MuiSwitch: {
      defaultProps: { color: 'primary', size: 'small' },
      styleOverrides: {
        root: { width: 40, height: 28, padding: 5 },
        switchBase: {
          padding: 7,
          transition: 'color 120ms, transform 120ms',
          color: tokens.text.secondary,
          '&.Mui-checked': {
            color: tokens.semantic.positive,
            transform: 'translateX(12px)',
          },
          '&.Mui-checked + .MuiSwitch-track': {
            backgroundColor: tokens.semantic.positive,
            opacity: 0.3,
          },
          '&.Mui-focusVisible': focusRing,
        },
        thumb: { width: 14, height: 14, boxShadow: 'none' },
        track: {
          borderRadius: 10,
          backgroundColor: tokens.text.muted,
          opacity: 0.28,
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
          fontSize: tokens.type.bodySm,
          lineHeight: tokens.lineHeight.body,
          maxWidth: 300,
          padding: '8px 12px',
          backgroundColor: tokens.surface.raised,
          border: `1px solid ${tokens.border.strong}`,
          color: tokens.text.primary,
        },
        arrow: { color: tokens.surface.raised },
      },
    },
    MuiDialog: {
      defaultProps: { transitionDuration: 0 },
      styleOverrides: {
        paper: {
          background: tokens.surface.gradient,
          backgroundColor: tokens.surface.panel,
          border: `1px solid ${tokens.border.strong}`,
          borderRadius: tokens.radius.lg,
          boxShadow: '0 12px 32px #0006',
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
