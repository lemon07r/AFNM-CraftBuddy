/**
 * CraftBuddy - Animation Utilities
 *
 * Lightweight, GPU-accelerated animations for smooth UI interactions.
 * Uses CSS transforms and opacity for best performance.
 */

import { keyframes } from '@mui/material/styles';
import type { SxProps, Theme } from '@mui/material/styles';

// Subtle pulse glow for primary recommendation - uses GPU-accelerated box-shadow
export const pulseGlow = keyframes`
  0%, 100% {
    box-shadow: 0 0 8px rgba(0, 255, 0, 0.25), inset 0 0 4px rgba(0, 255, 0, 0.08);
  }
  50% {
    box-shadow: 0 0 14px rgba(0, 255, 0, 0.4), inset 0 0 6px rgba(0, 255, 0, 0.12);
  }
`;

// Gold pulse for headers/accents
export const pulseGold = keyframes`
  0%, 100% {
    box-shadow: 0 0 6px rgba(255, 215, 0, 0.2);
  }
  50% {
    box-shadow: 0 0 12px rgba(255, 215, 0, 0.35);
  }
`;

// Fade in with slide from right (panel entrance)
export const slideInRight = keyframes`
  from {
    opacity: 0;
    transform: translateX(16px);
  }
  to {
    opacity: 1;
    transform: translateX(0);
  }
`;

// Fade in with slide up (content entrance)
export const fadeInUp = keyframes`
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
`;

// Fade in (simple)
export const fadeIn = keyframes`
  from { opacity: 0; }
  to { opacity: 1; }
`;

// Subtle scale pop for highlights
export const popIn = keyframes`
  0% {
    opacity: 0;
    transform: scale(0.95);
  }
  70% {
    transform: scale(1.02);
  }
  100% {
    opacity: 1;
    transform: scale(1);
  }
`;

// Shimmer effect for decorative elements (use sparingly)
export const shimmer = keyframes`
  0% {
    background-position: -200% center;
  }
  100% {
    background-position: 200% center;
  }
`;

// Holographic sweep for accent overlays
export const holographicSweep = keyframes`
  0% {
    opacity: 0;
    transform: translateX(-130%);
  }
  20% {
    opacity: 0.85;
  }
  100% {
    opacity: 0;
    transform: translateX(130%);
  }
`;

// Dramatic version label reveal with glow settle
export const versionBadgeReveal = keyframes`
  0% {
    opacity: 0;
    transform: translateY(7px) scale(0.9);
    filter: blur(4px);
    text-shadow: none;
  }
  55% {
    opacity: 1;
    transform: translateY(-1px) scale(1.04);
    filter: blur(0.5px);
    text-shadow: 0 0 12px rgba(255, 223, 140, 0.45);
  }
  100% {
    opacity: 0.9;
    transform: translateY(0) scale(1);
    filter: blur(0);
    text-shadow: 0 0 7px rgba(255, 223, 140, 0.28);
  }
`;

// Loading shimmer for skeleton cards - GPU-accelerated horizontal sweep
export const loadingShimmer = keyframes`
  0% {
    transform: translateX(-100%);
  }
  100% {
    transform: translateX(100%);
  }
`;

// Animated dots for loading text (opacity-only for performance)
export const dotPulse = keyframes`
  0%, 20% {
    opacity: 0.3;
  }
  50% {
    opacity: 1;
  }
  80%, 100% {
    opacity: 0.3;
  }
`;

// Transition presets - use cubic-bezier for smooth, natural motion
export const transitions = {
  // Standard smooth transition
  smooth: 'all 0.2s cubic-bezier(0.4, 0, 0.2, 1)',
  // Quick response for hover states
  quick: 'all 0.12s ease-out',
  // Slightly bouncy for emphasis
  bounce: 'all 0.3s cubic-bezier(0.34, 1.56, 0.64, 1)',
  // Slow fade for subtle effects
  fade: 'opacity 0.25s ease',
  // Transform only (most performant)
  transform: 'transform 0.15s ease-out',
  // Box-shadow only
  shadow: 'box-shadow 0.2s ease',
} as const;

// Animation duration presets (in seconds)
export const durations = {
  instant: 0.1,
  fast: 0.15,
  normal: 0.25,
  slow: 0.4,
  entrance: 0.3,
} as const;

// Pre-built sx props for common animations (memoizable)
export const animationSx = {
  // Panel entrance animation
  panelEntrance: {
    animation: `${slideInRight} 0.3s cubic-bezier(0.4, 0, 0.2, 1)`,
  } as SxProps<Theme>,

  // Content fade in
  contentFadeIn: {
    animation: `${fadeInUp} 0.25s ease-out`,
  } as SxProps<Theme>,

  // Primary skill card glow (subtle, not distracting)
  primaryGlow: {
    animation: `${pulseGlow} 2.5s ease-in-out infinite`,
  } as SxProps<Theme>,

  // Loading shimmer for skeleton cards
  loadingShimmerSx: {
    animation: `${loadingShimmer} 1.5s ease-in-out infinite`,
  } as SxProps<Theme>,

  // Hover scale effect
  hoverScale: {
    transition: transitions.quick,
    '&:hover': {
      transform: 'scale(1.02)',
    },
  } as SxProps<Theme>,

  // Hover brightness effect
  hoverBrightness: {
    transition: transitions.quick,
    '&:hover': {
      filter: 'brightness(1.1)',
    },
  } as SxProps<Theme>,

  // Interactive card hover
  interactiveCard: {
    transition: transitions.smooth,
    cursor: 'default',
    '&:hover': {
      transform: 'translateY(-1px)',
      boxShadow: '0 4px 16px rgba(0, 0, 0, 0.4)',
    },
  } as SxProps<Theme>,
} as const;

// Utility to create staggered animation delays for lists
export function staggerDelay(index: number, baseDelay = 0.05): string {
  return `${index * baseDelay}s`;
}

// Utility to conditionally apply animation (for reduced motion preference)
export function maybeAnimate(animation: string, shouldAnimate = true): string {
  return shouldAnimate ? animation : 'none';
}
