import React, { memo, useId } from 'react';
import {
  Box,
  Button,
  IconButton,
  Paper,
  Tooltip,
  Typography,
} from '@mui/material';
import type { ButtonProps } from '@mui/material';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import { colors, fonts, reducedMotionSx } from '../theme';

export const PanelContainer = memo(function PanelContainer({
  children,
  compact = false,
}: {
  children: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <Paper
      component="section"
      aria-label="CraftBuddy crafting assistant"
      elevation={0}
      sx={{
        width: '100%',
        minWidth: 0,
        boxSizing: 'border-box',
        maxHeight: 'calc(100dvh - 20px)',
        overflowY: 'auto',
        overflowX: 'hidden',
        scrollbarWidth: 'thin',
        containerType: 'inline-size',
        backgroundColor: colors.panelBgLight,
        border: `1px solid ${colors.goldDark}`,
        borderRadius: '3px',
        boxShadow: '0 4px 12px #0005',
        pointerEvents: 'auto',
        '& :focus-visible': {
          outline: `2px solid ${colors.goldLight}`,
          outlineOffset: 2,
        },
        ...reducedMotionSx,
      }}
    >
      <Box sx={{ p: compact ? 1.25 : 2 }}>{children}</Box>
    </Paper>
  );
});

export function PanelHeading({ children }: { children: React.ReactNode }) {
  return (
    <Typography
      component="h2"
      variant="h6"
      sx={{ color: colors.gold, fontFamily: fonts.heading, m: 0 }}
    >
      {children}
    </Typography>
  );
}

export function ActionButton(props: ButtonProps) {
  return <Button size="small" variant="outlined" {...props} />;
}

export function Help({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Tooltip title={children}>
      <IconButton
        aria-label={`Help: ${title}`}
        sx={{ minWidth: 28, minHeight: 28 }}
      >
        <HelpOutlineIcon sx={{ fontSize: 16 }} />
      </IconButton>
    </Tooltip>
  );
}

// Native details provides keyboard interaction, excludes collapsed controls
// from tab order, and needs no height measurements or opening animation.
export function Disclosure({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const id = useId();
  return (
    <Box
      component="details"
      open={defaultOpen || undefined}
      sx={{
        borderTop: `1px solid ${colors.borderSubtle}`,
        mt: 1.25,
        '& > summary': {
          cursor: 'pointer',
          py: 1,
          // Follow the active theme's text face like the surrounding Typography.
          typography: 'body2',
          fontSize: '0.8rem',
          color: colors.textPrimary,
        },
        '& > summary::marker': { color: colors.goldDark },
      }}
    >
      <Box component="summary" tabIndex={0} aria-controls={id}>
        {title}
      </Box>
      <Box id={id} sx={{ pb: 1 }}>
        {children}
      </Box>
    </Box>
  );
}
