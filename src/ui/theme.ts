/**
 * CraftBuddy - MUI Theme Configuration
 *
 * Centralized theme with xianxia-inspired dark aesthetic.
 * Performance-optimized: uses static values where possible,
 * avoids runtime calculations in theme definition.
 */

import { createTheme, alpha } from '@mui/material/styles';

// Extend MUI palette types for custom colors
declare module '@mui/material/styles' {
  interface Palette {
    skillTypes: {
      fusion: string;
      refine: string;
      stabilize: string;
      support: string;
    };
    conditions: {
      veryPositive: string;
      positive: string;
      neutral: string;
      negative: string;
      veryNegative: string;
    };
    quality: {
      optimal: string;
      good: string;
      okay: string;
      suboptimal: string;
      poor: string;
    };
  }
  interface PaletteOptions {
    skillTypes?: Palette['skillTypes'];
    conditions?: Palette['conditions'];
    quality?: Palette['quality'];
  }
}

// Pre-computed color values for performance
export const colors = {
  // Primary accent (warm amber-gold, inspired by Spirit Ring)
  gold: '#C5A059',
  goldLight: '#D4B87A',
  goldDark: '#9B7D3F',
  goldGlow: 'rgba(197, 160, 89, 0.4)',

  // Status colors
  completion: '#4ade80',
  completionLight: '#86efac',
  perfection: '#87CEEB',
  stability: '#FFA500',
  error: '#f87171',
  qi: '#ADD8E6',

  // Skill type colors (matching game UI)
  fusion: '#00FF00',
  refine: '#00FFFF',
  stabilize: '#FFA500',
  support: '#EB34DB',

  // Condition colors
  veryPositive: '#4ade80',
  positive: '#86efac',
  neutral: '#FFFFFF',
  negative: '#FFA500',
  veryNegative: '#f87171',

  // Quality rating colors
  optimal: '#4ade80',
  good: '#86efac',
  okay: '#C5A059',
  suboptimal: '#FFA500',
  poor: '#f87171',

  // Background colors
  panelBg: 'rgba(15, 15, 20, 0.96)',
  panelBgLight: 'rgba(20, 20, 25, 0.95)',
  cardBg: 'rgba(25, 25, 30, 0.9)',
  cardBgHover: 'rgba(30, 30, 38, 0.95)',

  // Border colors
  borderSubtle: 'rgba(197, 160, 89, 0.2)',
  borderMedium: 'rgba(197, 160, 89, 0.35)',
  borderHighlight: 'rgba(74, 222, 128, 0.4)',

  // Text colors
  textPrimary: '#ddd',
  textSecondary: '#b9b0a0',
  textMuted: '#a69d8c',
  textDisabled: 'rgba(140, 130, 115, 0.65)',
} as const;

// Pre-computed gradients
export const gradients = {
  panelBackground:
    'linear-gradient(135deg, rgba(20, 20, 28, 0.98) 0%, rgba(15, 15, 20, 0.98) 100%)',
  headerUnderline:
    'linear-gradient(90deg, rgba(197, 160, 89, 0.6) 0%, rgba(197, 160, 89, 0) 100%)',
  primaryCard:
    'linear-gradient(135deg, rgba(0, 50, 0, 0.35) 0%, rgba(0, 35, 0, 0.25) 100%)',
  alternativeCard:
    'linear-gradient(135deg, rgba(38, 38, 46, 0.5) 0%, rgba(28, 28, 36, 0.4) 100%)',
  successGlow:
    'radial-gradient(ellipse at center, rgba(74, 222, 128, 0.12) 0%, transparent 70%)',
  errorGlow:
    'radial-gradient(ellipse at center, rgba(248, 113, 113, 0.12) 0%, transparent 70%)',
} as const;

// Pre-computed shadows for performance
export const shadows = {
  panel: '0 4px 20px rgba(0, 0, 0, 0.7), 0 0 1px rgba(197, 160, 89, 0.15)',
  panelInner: 'inset 0 1px 0 rgba(255, 255, 255, 0.04)',
  card: '0 2px 8px rgba(0, 0, 0, 0.3)',
  cardHover: '0 4px 16px rgba(0, 0, 0, 0.4)',
  primaryGlow:
    '0 0 10px rgba(74, 222, 128, 0.25), inset 0 0 5px rgba(74, 222, 128, 0.08)',
  goldGlow: '0 0 10px rgba(197, 160, 89, 0.3)',
  iconGlow: '0 2px 8px rgba(0, 0, 0, 0.4)',
} as const;

// Spacing constants
export const spacing = {
  panelPadding: 2,
  panelPaddingCompact: 1.5,
  sectionGap: 1.5,
  cardPadding: 1,
  cardGap: 0.5,
} as const;

// Create the theme
export const craftBuddyTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: colors.gold,
      light: colors.goldLight,
      dark: colors.goldDark,
    },
    secondary: {
      main: colors.perfection,
    },
    success: {
      main: colors.completion,
      light: colors.completionLight,
    },
    warning: {
      main: colors.stability,
    },
    error: {
      main: colors.error,
    },
    info: {
      main: colors.perfection,
    },
    background: {
      default: colors.panelBg,
      paper: colors.panelBgLight,
    },
    text: {
      primary: colors.textPrimary,
      secondary: colors.textSecondary,
      disabled: colors.textDisabled,
    },
    divider: 'rgba(100, 100, 100, 0.3)',
    skillTypes: {
      fusion: colors.fusion,
      refine: colors.refine,
      stabilize: colors.stabilize,
      support: colors.support,
    },
    conditions: {
      veryPositive: colors.veryPositive,
      positive: colors.positive,
      neutral: colors.neutral,
      negative: colors.negative,
      veryNegative: colors.veryNegative,
    },
    quality: {
      optimal: colors.optimal,
      good: colors.good,
      okay: colors.okay,
      suboptimal: colors.suboptimal,
      poor: colors.poor,
    },
  },
  typography: {
    fontFamily: '"Segoe UI", "Roboto", "Helvetica Neue", Arial, sans-serif',
    h6: {
      fontWeight: 600,
      fontSize: '1.1rem',
      letterSpacing: '0.5px',
    },
    subtitle1: {
      fontWeight: 500,
      fontSize: '0.95rem',
    },
    subtitle2: {
      fontWeight: 500,
      fontSize: '0.85rem',
    },
    body1: {
      fontSize: '0.9rem',
      lineHeight: 1.5,
    },
    body2: {
      fontSize: '0.85rem',
      lineHeight: 1.5,
    },
    caption: {
      fontSize: '0.7rem',
      letterSpacing: '0.3px',
    },
  },
  shape: {
    borderRadius: 8,
  },
  components: {
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: gradients.panelBackground,
          border: `1px solid ${colors.borderSubtle}`,
          boxShadow: shadows.panel,
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          fontWeight: 500,
          transition: 'transform 0.15s ease, box-shadow 0.15s ease',
          '&:hover': {
            transform: 'scale(1.02)',
          },
        },
        sizeSmall: {
          fontSize: '0.7rem',
          height: 22,
        },
      },
    },
    MuiSlider: {
      styleOverrides: {
        root: {
          color: colors.gold,
        },
        thumb: {
          transition: 'box-shadow 0.15s ease',
          '&:hover, &.Mui-focusVisible': {
            boxShadow: shadows.goldGlow,
          },
        },
        track: {
          border: 'none',
        },
      },
    },
    MuiSwitch: {
      styleOverrides: {
        switchBase: {
          '&.Mui-checked': {
            color: colors.gold,
          },
          '&.Mui-checked + .MuiSwitch-track': {
            backgroundColor: colors.goldDark,
          },
        },
      },
    },
    MuiIconButton: {
      styleOverrides: {
        root: {
          transition: 'transform 0.15s ease, color 0.15s ease',
          '&:hover': {
            transform: 'scale(1.1)',
          },
        },
      },
    },
    MuiDivider: {
      styleOverrides: {
        root: {
          borderColor: 'rgba(100, 100, 100, 0.4)',
        },
      },
    },
    MuiCollapse: {
      styleOverrides: {
        root: {
          // Use GPU-accelerated transitions
          transition: 'height 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
        },
      },
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: 'none',
          fontWeight: 500,
          transition: 'all 0.15s ease',
        },
        outlined: {
          borderWidth: 1,
          '&:hover': {
            borderWidth: 1,
          },
        },
      },
    },
  },
});

// Helper function to get skill type color
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
    case 'finish':
      return colors.gold;
    default:
      return colors.textPrimary;
  }
}

// Helper function to get quality color
export function getQualityColor(rating: number): string {
  if (rating >= 90) return colors.optimal;
  if (rating >= 70) return colors.good;
  if (rating >= 50) return colors.okay;
  if (rating >= 30) return colors.suboptimal;
  return colors.poor;
}

// Helper function to get quality label
export function getQualityLabel(rating: number): string {
  if (rating >= 90) return 'Optimal';
  if (rating >= 70) return 'Good';
  if (rating >= 50) return 'Okay';
  if (rating >= 30) return 'Suboptimal';
  return 'Poor';
}

// Helper function to get condition color
export function getConditionColor(condition: string): string {
  switch (condition) {
    case 'veryPositive':
      return colors.veryPositive;
    case 'positive':
      return colors.positive;
    case 'neutral':
      return colors.neutral;
    case 'negative':
      return colors.negative;
    case 'veryNegative':
      return colors.veryNegative;
    default:
      return colors.neutral;
  }
}

export default craftBuddyTheme;
