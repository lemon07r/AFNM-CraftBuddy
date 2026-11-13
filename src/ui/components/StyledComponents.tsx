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
import {
  colors,
  eyebrowSx,
  focusRing,
  fonts,
  fs,
  reducedMotionSx,
  scrollbarSx,
  tokens,
} from '../theme';
import { OVERLAY_EDGE_MARGIN_PX } from '../../utils/overlayLayout';
import {
  nextHelpTooltipState,
  type HelpTooltipEvent,
  type HelpTooltipState,
} from '../../utils/helpTooltipState';

export const PanelContainer = memo(function PanelContainer({
  children,
  header,
  compact = false,
  onResizePointerDown,
}: {
  children: React.ReactNode;
  /** Fixed above the scrolling body, so it stays reachable as a drag handle. */
  header?: React.ReactNode;
  compact?: boolean;
  onResizePointerDown?: React.PointerEventHandler<HTMLElement>;
}) {
  return (
    <Paper
      component="section"
      aria-label="CraftBuddy crafting assistant"
      elevation={0}
      data-compact={compact || undefined}
      sx={{
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        flex: '0 1 auto',
        minHeight: 0,
        width: '100%',
        minWidth: 0,
        boxSizing: 'border-box',
        maxHeight: `calc(100dvh - ${OVERLAY_EDGE_MARGIN_PX * 2}px)`,
        overflow: 'hidden',
        containerType: 'inline-size',
        backgroundColor: tokens.surface.panel,
        backgroundImage: tokens.surface.gradient,
        border: `1px solid ${tokens.border.default}`,
        borderRadius: `${tokens.radius.xl}px`,
        boxShadow: tokens.shadow.panel,
        pointerEvents: 'auto',
        color: colors.textPrimary,
        fontFamily: fonts.body,
        fontSize: tokens.type.body,
        lineHeight: tokens.lineHeight.body,
        fontVariantNumeric: 'tabular-nums',
        fontFeatureSettings: '"cv11", "ss01"',
        WebkitFontSmoothing: 'antialiased',
        '[data-craftbuddy-sized] > &': { flex: '1 1 auto', maxHeight: 'none' },
        '& :focus-visible': focusRing,
        ...reducedMotionSx,
      }}
    >
      {header}
      <Box
        data-craftbuddy-panel-body
        sx={{
          flex: '1 1 auto',
          minHeight: 0,
          overflowY: 'auto',
          overflowX: 'hidden',
          overscrollBehavior: 'contain',
          ...scrollbarSx,
          px: compact ? 1.5 : 2,
          pt: compact ? 1.5 : 2,
          pb: compact ? 2 : 2.5,
        }}
      >
        {children}
      </Box>
      {onResizePointerDown && (
        <ResizeGrip onPointerDown={onResizePointerDown} />
      )}
    </Paper>
  );
});

/** Bottom-left corner grip; the panel is right-anchored so it grows leftwards. */
function ResizeGrip({
  onPointerDown,
}: {
  onPointerDown: React.PointerEventHandler<HTMLElement>;
}) {
  return (
    <Box
      aria-hidden
      data-craftbuddy-no-drag
      data-craftbuddy-resize-grip
      title="Drag to resize"
      onPointerDown={onPointerDown}
      sx={{
        position: 'absolute',
        left: 0,
        bottom: 0,
        width: 22,
        height: 22,
        zIndex: 3,
        cursor: 'nesw-resize',
        touchAction: 'none',
        borderBottomLeftRadius: `${tokens.radius.xl}px`,
        '&::before': {
          content: '""',
          position: 'absolute',
          left: 5,
          bottom: 5,
          width: 10,
          height: 10,
          opacity: 0.55,
          transition: 'opacity 120ms',
          background: `linear-gradient(45deg, transparent 0 1.5px, ${tokens.text.muted} 1.5px 2.75px, transparent 2.75px 5px, ${tokens.text.muted} 5px 6.25px, transparent 6.25px)`,
          clipPath: 'polygon(0 0, 0 100%, 100% 100%)',
        },
        '&:hover::before, [data-craftbuddy-gesture="resize"] &::before': {
          opacity: 1,
          background: `linear-gradient(45deg, transparent 0 1.5px, ${tokens.text.gold} 1.5px 2.75px, transparent 2.75px 5px, ${tokens.text.gold} 5px 6.25px, transparent 6.25px)`,
        },
      }}
    />
  );
}

/** Brand title: the one place the decorative display face appears. */
export function PanelHeading({ children }: { children: React.ReactNode }) {
  return (
    <Typography
      component="h2"
      sx={{
        color: colors.goldLight,
        fontFamily: fonts.display,
        fontWeight: 400,
        fontSize: tokens.type.display,
        letterSpacing: '.02em',
        lineHeight: 1.15,
        m: 0,
        whiteSpace: 'nowrap',
        textShadow: '0 1px 0 rgba(0,0,0,.6)',
        '[data-compact] &': { fontSize: tokens.type.title },
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
    <Typography component="p" sx={{ ...eyebrowSx, mb: 1 }}>
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
              minWidth: 30,
              minHeight: 30,
              width: 30,
              height: 30,
              borderRadius: '50%',
              color: open ? colors.goldLight : colors.textMuted,
              backgroundColor: open ? tokens.surface.selected : 'transparent',
            }}
          >
            <HelpOutlineOutlined sx={{ fontSize: fs(18) }} />
          </IconButton>
        </Tooltip>
      </Box>
    </ClickAwayListener>
  );
}

export const badgeSx = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: 0.625,
  border: `1px solid ${tokens.border.default}`,
  borderRadius: '999px',
  backgroundColor: 'rgba(255,255,255,.035)',
  px: 1,
  py: 0.25,
  fontSize: tokens.type.bodySm,
  fontWeight: 500,
  lineHeight: tokens.lineHeight.tight,
  fontVariantNumeric: 'tabular-nums',
  color: tokens.text.secondary,
  whiteSpace: 'nowrap',
} as const;

export const smallBadgeSx = {
  ...badgeSx,
  px: 0.875,
  fontSize: tokens.type.label,
} as const;

export function SectionCard({
  title,
  subtitle,
  action,
  children,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Box
      component="section"
      sx={{
        border: `1px solid ${tokens.border.hairline}`,
        borderRadius: `${tokens.radius.lg}px`,
        backgroundColor: tokens.surface.card,
        boxShadow: tokens.shadow.card,
        p: 2.25,
        mb: 1.5,
        '@container (max-width: 440px)': { p: 1.75 },
      }}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'flex-start',
          gap: 1,
          mb: subtitle ? 0.5 : 1.5,
        }}
      >
        <Typography
          component="h3"
          sx={{
            flex: 1,
            fontFamily: fonts.body,
            fontSize: tokens.type.heading,
            fontWeight: 650,
            letterSpacing: '-.005em',
            lineHeight: tokens.lineHeight.tight,
            color: colors.textPrimary,
          }}
        >
          {title}
        </Typography>
        {action}
      </Box>
      {subtitle && (
        <Typography
          variant="body2"
          sx={{ color: colors.textMuted, mb: 1.75, maxWidth: '62ch' }}
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
        border: `1px solid ${tokens.border.hairline}`,
        borderRadius: `${tokens.radius.lg}px`,
        backgroundColor: tokens.surface.card,
        boxShadow: tokens.shadow.card,
        overflow: 'hidden',
        mt: 1.75,
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
          gap: 1,
          cursor: 'pointer',
          minHeight: 46,
          px: 1.5,
          py: 0.5,
          boxSizing: 'border-box',
          fontFamily: fonts.body,
          fontSize: tokens.type.body,
          fontWeight: 600,
          color: colors.textPrimary,
          userSelect: 'none',
          transition: 'color 120ms, background-color 120ms',
          '&:hover': { backgroundColor: tokens.surface.hover },
          '&:hover .disclosure-chevron': { color: colors.goldLight },
          '&:focus-visible': { ...focusRing, outlineOffset: -3 },
          '&::-webkit-details-marker': { display: 'none' },
        },
        '&[open] > summary': {
          backgroundColor: 'rgba(255,255,255,.025)',
          borderBottom: `1px solid ${tokens.border.hairline}`,
        },
        '&[open] > summary .disclosure-chevron': { transform: 'rotate(90deg)' },
        '[data-compact] & > summary': { minHeight: 40 },
      }}
    >
      <Box component="summary" aria-controls={id}>
        <ChevronRight
          className="disclosure-chevron"
          sx={{
            fontSize: fs(20),
            color: colors.textMuted,
            transition: 'transform 140ms, color 120ms',
            ml: -0.25,
          }}
        />
        <Box component="span" sx={{ minWidth: 0 }}>
          {title}
        </Box>
        {meta && (
          <Typography
            component="span"
            sx={{
              ml: 'auto',
              pl: 1,
              textAlign: 'right',
              color: colors.textMuted,
              fontSize: tokens.type.bodySm,
              fontWeight: 500,
            }}
          >
            {meta}
          </Typography>
        )}
      </Box>
      <Box
        id={id}
        sx={{ p: 1.75, pt: 1.5, '[data-compact] &': { p: 1.25, pt: 1.25 } }}
      >
        {children}
      </Box>
    </Box>
  );
}
