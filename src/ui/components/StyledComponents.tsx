import React, { memo, useEffect, useId, useRef, useState } from 'react';
import {
  Box,
  Button,
  ClickAwayListener,
  IconButton,
  Paper,
  Tooltip,
  Typography,
} from '@mui/material';
import type { ButtonProps } from '@mui/material';
import { ChevronRight, HelpOutlineOutlined } from '@mui/icons-material';
import { colors, focusRing, fonts, reducedMotionSx, tokens } from '../theme';
import { OVERLAY_EDGE_MARGIN_PX } from '../../utils/overlayLayout';
import {
  nextHelpTooltipState,
  type HelpTooltipEvent,
  type HelpTooltipState,
} from '../../utils/helpTooltipState';

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
      data-compact={compact || undefined}
      sx={{
        width: '100%',
        minWidth: 0,
        boxSizing: 'border-box',
        maxHeight: `calc(100dvh - ${OVERLAY_EDGE_MARGIN_PX * 2}px)`,
        overflowY: 'auto',
        overflowX: 'hidden',
        scrollbarWidth: 'thin',
        scrollbarColor: `${tokens.border.strong} transparent`,
        containerType: 'inline-size',
        backgroundColor: tokens.surface.panel,
        backgroundImage: tokens.surface.gradient,
        border: `1px solid ${tokens.border.strong}`,
        borderRadius: `${tokens.radius.md}px`,
        pointerEvents: 'auto',
        color: colors.textPrimary,
        fontFamily: fonts.body,
        fontSize: tokens.type.body,
        lineHeight: tokens.lineHeight.body,
        fontVariantNumeric: 'tabular-nums',
        '& :focus-visible': focusRing,
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
      sx={{
        color: colors.gold,
        fontFamily: fonts.heading,
        fontSize: 20,
        lineHeight: 1.3,
        m: 0,
        '[data-compact] &': { fontSize: 17 },
      }}
    >
      {children}
    </Typography>
  );
}
export function ActionButton(props: ButtonProps) {
  return <Button size="small" variant="outlined" {...props} />;
}

export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <Typography
      component="p"
      variant="caption"
      sx={{ color: colors.textMuted, mb: 0.75, letterSpacing: '.04em' }}
    >
      {children}
    </Typography>
  );
}

/** Dispatched on an open Help button to close it without toggling. */
export const HELP_DISMISS_EVENT = 'craftbuddy-help-dismiss';

export function Help({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const [state, setState] = useState<HelpTooltipState>('closed');
  const send = (event: HelpTooltipEvent) =>
    setState((previous) => nextHelpTooltipState(previous, event));
  const open = state !== 'closed';
  const id = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const button = buttonRef.current;
    if (!button) return undefined;
    const dismiss = () => setState('closed');
    button.addEventListener(HELP_DISMISS_EVENT, dismiss);
    return () => button.removeEventListener(HELP_DISMISS_EVENT, dismiss);
  }, []);
  return (
    <ClickAwayListener onClickAway={() => send({ type: 'dismiss' })}>
      <Box component="span" sx={{ display: 'inline-flex', flexShrink: 0 }}>
        <Tooltip
          id={id}
          title={children}
          open={open}
          disableInteractive
          disableHoverListener
          disableFocusListener
          disableTouchListener
        >
          <IconButton
            ref={buttonRef}
            aria-label={`Help: ${title}`}
            aria-describedby={open ? id : undefined}
            data-craftbuddy-help-open={open || undefined}
            title={title}
            onPointerEnter={(event) =>
              send({ type: 'pointerEnter', pointerType: event.pointerType })
            }
            onPointerLeave={(event) =>
              send({ type: 'pointerLeave', pointerType: event.pointerType })
            }
            onFocus={(event) => {
              if (event.currentTarget.matches(':focus-visible'))
                send({ type: 'focusVisible' });
            }}
            onBlur={() => send({ type: 'dismiss' })}
            onClick={() => send({ type: 'click' })}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && open) {
                event.preventDefault();
                event.stopPropagation();
                send({ type: 'dismiss' });
              }
            }}
            sx={{
              minWidth: 28,
              minHeight: 28,
              width: 28,
              height: 28,
              color: colors.textMuted,
            }}
          >
            <HelpOutlineOutlined sx={{ fontSize: 16 }} />
          </IconButton>
        </Tooltip>
      </Box>
    </ClickAwayListener>
  );
}

export const badgeSx = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 0.5,
  border: `1px solid ${tokens.border.default}`,
  borderRadius: `${tokens.radius.xs}px`,
  px: 0.75,
  py: 0.125,
  fontSize: tokens.type.bodySm,
  lineHeight: tokens.lineHeight.body,
  fontVariantNumeric: 'tabular-nums',
  color: tokens.text.secondary,
} as const;

export const smallBadgeSx = {
  ...badgeSx,
  fontSize: tokens.type.label,
} as const;

export function SectionCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <Box
      sx={{
        border: `1px solid ${tokens.border.hairline}`,
        borderRadius: `${tokens.radius.md}px`,
        backgroundColor: tokens.surface.hover,
        p: 2,
        mb: 1.5,
        '@container (max-width: 440px)': { p: 1.5 },
      }}
    >
      <Typography
        component="h3"
        sx={{
          fontFamily: fonts.heading,
          fontSize: tokens.type.heading,
          color: colors.gold,
          mb: 0.75,
        }}
      >
        {title}
      </Typography>
      {subtitle && (
        <Typography
          variant="body2"
          sx={{ color: colors.textSecondary, mb: 1.5 }}
        >
          {subtitle}
        </Typography>
      )}
      {children}
    </Box>
  );
}

export function DisclosureGroup({ children }: { children: React.ReactNode }) {
  return (
    <Box
      sx={{
        border: `1px solid ${tokens.border.default}`,
        borderRadius: `${tokens.radius.md}px`,
        overflow: 'hidden',
        mt: 1.5,
        '& > details + details': {
          borderTop: `1px solid ${tokens.border.hairline}`,
        },
      }}
    >
      {children}
    </Box>
  );
}

// Native details keeps collapsed controls out of tab order without layout probes.
export function Disclosure({
  title,
  meta,
  children,
  defaultOpen = false,
}: {
  title: string;
  meta?: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const id = useId();
  return (
    <Box
      component="details"
      open={defaultOpen || undefined}
      sx={{
        '& > summary': {
          listStyle: 'none',
          display: 'flex',
          alignItems: 'center',
          gap: 0.75,
          cursor: 'pointer',
          minHeight: 40,
          px: 1.25,
          py: 0.25,
          boxSizing: 'border-box',
          fontFamily: fonts.body,
          fontSize: tokens.type.body,
          color: colors.textPrimary,
          transition: 'color 120ms, background-color 120ms',
          '&:hover': {
            backgroundColor: tokens.surface.hover,
            color: colors.goldLight,
          },
          '&:focus-visible': { ...focusRing, outlineOffset: -3 },
          '&::-webkit-details-marker': { display: 'none' },
        },
        '&[open] > summary': { backgroundColor: tokens.surface.hover },
        '&[open] > summary .disclosure-chevron': { transform: 'rotate(90deg)' },
        '[data-compact] & > summary': {
          minHeight: 36,
          fontSize: tokens.type.bodySm,
        },
      }}
    >
      <Box component="summary" aria-controls={id}>
        <ChevronRight
          className="disclosure-chevron"
          sx={{
            fontSize: 17,
            color: colors.gold,
            transition: 'transform 120ms',
          }}
        />
        <Box component="span" sx={{ minWidth: 0 }}>
          {title}
        </Box>
        {meta && (
          <Typography
            component="span"
            variant="caption"
            sx={{ ml: 'auto', textAlign: 'right', color: colors.textMuted }}
          >
            {meta}
          </Typography>
        )}
      </Box>
      <Box id={id} sx={{ p: 1.5, pt: 1, '[data-compact] &': { p: 1.25 } }}>
        {children}
      </Box>
    </Box>
  );
}
