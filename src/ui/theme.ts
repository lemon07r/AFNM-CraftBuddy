import { createTheme } from '@mui/material';

// Read-only AFNM 0.7.19 theme tokens. This provider scopes them to CraftBuddy;
// never register a game-wide theme override.
export const colors = {
  gold: '#e3c27a',
  goldLight: '#f0d699',
  goldDark: '#b8956a',
  panelBg: '#1a1714',
  panelBgLight: '#2a2520',
  cardBg: '#302a24',
  cardBgHover: '#393128',
  borderSubtle: '#62513b',
  borderMedium: '#b8956a',
  textPrimary: '#e8d4a0',
  textSecondary: '#c4b088',
  textMuted: '#c4b088',
  textDisabled: '#a99878',
  completion: '#98c88e',
  stability: '#e1ad64',
  error: '#f08a76',
  fusion: '#018f01',
  refine: '#029ab5',
  stabilize: '#cc8800',
  support: '#74009c',
  veryPositive: '#7affd5',
  positive: '#00fbff',
  neutral: '#ffffff',
  negative: '#edca2d',
  veryNegative: '#db3a00',
} as const;

export const fonts = {
  body: 'normalFont, fancyFont, langGlyphs, "PT Serif", Georgia, sans-serif',
  heading: 'fancyFont, normalFont, langGlyphs, "PT Serif", Georgia, sans-serif',
};

// The overlay sits above the game's MUI roots. All portals share this scale.
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
  palette: {
    mode: 'dark',
    primary: { main: '#8B2500', light: '#B8442A', dark: '#5C1700' },
    secondary: {
      main: colors.gold,
      light: colors.goldLight,
      dark: colors.goldDark,
    },
    background: { default: colors.panelBg, paper: colors.panelBgLight },
    text: { primary: colors.textPrimary, secondary: colors.textSecondary },
    divider: colors.borderSubtle,
    success: { main: colors.completion },
    warning: { main: colors.stability },
    error: { main: colors.error },
  },
  typography: {
    fontFamily: fonts.body,
    h6: { fontFamily: fonts.heading, fontSize: '1.1rem', fontWeight: 600 },
    subtitle1: { fontFamily: fonts.heading, fontSize: '1rem' },
    subtitle2: { fontSize: '0.85rem', fontWeight: 600 },
    body1: { fontSize: '0.9rem', lineHeight: 1.5 },
    body2: { fontSize: '0.8rem', lineHeight: 1.5 },
    caption: { fontSize: '0.72rem', lineHeight: 1.5 },
    button: { textTransform: 'none', fontSize: '0.8rem' },
  },
  shape: { borderRadius: 3 },
  zIndex: { modal: uiLayers.dialog, tooltip: uiLayers.tooltip },
  components: {
    MuiPaper: { styleOverrides: { root: { backgroundImage: 'none' } } },
    MuiButton: {
      defaultProps: { disableElevation: true, color: 'secondary' },
      styleOverrides: {
        root: {
          minHeight: 32,
          '&.Mui-focusVisible': {
            outline: `2px solid ${colors.goldLight}`,
            outlineOffset: 2,
          },
        },
      },
    },
    MuiIconButton: {
      defaultProps: { size: 'small' },
      styleOverrides: {
        root: {
          color: colors.textSecondary,
          minWidth: 32,
          minHeight: 32,
          '&.Mui-focusVisible': { outline: `2px solid ${colors.goldLight}` },
        },
      },
    },
    MuiSlider: { defaultProps: { color: 'secondary', size: 'small' } },
    MuiSwitch: { defaultProps: { color: 'secondary', size: 'small' } },
    MuiRadio: { defaultProps: { color: 'secondary', size: 'small' } },
    MuiTooltip: {
      defaultProps: { arrow: true, enterDelay: 250 },
      styleOverrides: {
        tooltip: {
          fontSize: '0.75rem',
          backgroundColor: '#443a2e',
          color: colors.textPrimary,
        },
      },
    },
    MuiDialog: {
      defaultProps: { transitionDuration: 0 },
      styleOverrides: { paper: { border: `1px solid ${colors.goldDark}` } },
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
      return colors.borderSubtle;
  }
}

export function getConditionColor(condition: string): string {
  switch (condition) {
    case 'veryPositive':
      return colors.veryPositive;
    case 'positive':
      return colors.positive;
    case 'negative':
      return colors.negative;
    case 'veryNegative':
      return colors.veryNegative;
    default:
      return colors.neutral;
  }
}
