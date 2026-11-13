import { useId } from 'react';
import { Box, Typography } from '@mui/material';
import { Check } from '@mui/icons-material';
import { colors, focusRing, fs, tokens } from '../theme';

const visuallyHidden = {
  border: 0,
  clip: 'rect(0 0 0 0)',
  height: '1px',
  margin: '-1px',
  overflow: 'hidden',
  padding: 0,
  position: 'absolute',
  whiteSpace: 'nowrap',
  width: '1px',
} as const;

/** Native radio inputs retain browser arrow-key, focus and form semantics. */
export function ChoiceGroup({
  label,
  value,
  options,
  onChange,
  hideLabel = false,
  variant = 'segmented',
}: {
  label: string;
  hideLabel?: boolean;
  value: string;
  options: ReadonlyArray<{ id: string; label: string; detail?: string }>;
  onChange: (value: string) => void;
  variant?: 'segmented' | 'cards' | 'pills';
}) {
  const id = useId();
  // Short labels (percentages, counts) fit on one row even in narrow hosts.
  const shortLabels = options.every(
    (option) => !option.detail && option.label.length <= 5,
  );
  return (
    <Box
      component="fieldset"
      sx={{ border: 0, m: 0, p: 0, minWidth: 0, width: '100%', my: 0.5 }}
    >
      <Box
        component="legend"
        sx={
          hideLabel
            ? visuallyHidden
            : {
                fontFamily: 'inherit',
                fontSize: tokens.type.bodySm,
                fontWeight: 600,
                color: colors.textSecondary,
                p: 0,
                mb: 0.875,
              }
        }
      >
        {label}
      </Box>
      <Box
        sx={{
          display: 'grid',
          gap: variant === 'cards' ? 0.75 : 0.5,
          gridTemplateColumns:
            variant === 'cards'
              ? '1fr'
              : `repeat(${options.length}, minmax(0, 1fr))`,
          ...(variant === 'segmented'
            ? {
                p: 0.5,
                backgroundColor: tokens.surface.sunken,
                border: `1px solid ${tokens.border.hairline}`,
                borderRadius: `${tokens.radius.md + 2}px`,
                ...(shortLabels
                  ? {}
                  : {
                      '@container (max-width: 580px)': {
                        gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                      },
                      '@container (max-width: 300px)': {
                        gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                      },
                    }),
              }
            : {}),
        }}
      >
        {options.map((option) => (
          <Box
            component="label"
            key={option.id}
            sx={{
              position: 'relative',
              display: 'flex',
              cursor: 'pointer',
              minWidth: 0,
              '& input:focus-visible + .choice-face': focusRing,
              '&:hover .choice-face:not([data-selected])': {
                backgroundColor: tokens.surface.hover,
                borderColor: tokens.border.default,
              },
            }}
          >
            <Box
              component="input"
              type="radio"
              name={id}
              value={option.id}
              checked={value === option.id}
              onChange={() => onChange(option.id)}
              sx={visuallyHidden}
            />
            <Box
              className="choice-face"
              data-selected={value === option.id || undefined}
              sx={{
                width: '100%',
                minWidth: 0,
                boxSizing: 'border-box',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                border: '1px solid',
                borderColor:
                  value === option.id
                    ? tokens.border.accent
                    : variant === 'segmented'
                      ? 'transparent'
                      : tokens.border.hairline,
                borderRadius: `${tokens.radius.sm + 1}px`,
                px: variant === 'pills' ? 0.75 : 1.25,
                py: variant === 'cards' ? 1.125 : 0.625,
                minHeight: variant === 'cards' ? 52 : tokens.control.md - 2,
                backgroundColor:
                  value === option.id
                    ? tokens.surface.selected
                    : variant === 'segmented'
                      ? 'transparent'
                      : tokens.surface.control,
                boxShadow:
                  value === option.id
                    ? 'inset 0 1px 0 rgba(255,255,255,.06), 0 1px 2px rgba(0,0,0,.4)'
                    : 'none',
                transition:
                  'border-color 120ms, background-color 120ms, color 120ms',
                textAlign: variant === 'cards' ? 'left' : 'center',
              }}
            >
              <Box
                component="span"
                sx={{
                  display: 'flex',
                  gap: 0.5,
                  alignItems: 'center',
                  justifyContent:
                    variant === 'cards' ? 'space-between' : 'center',
                }}
              >
                <Typography
                  component="span"
                  sx={{
                    fontSize: tokens.type.body,
                    fontWeight: value === option.id ? 650 : 500,
                    lineHeight: 1.3,
                    color:
                      value === option.id
                        ? colors.goldLight
                        : colors.textPrimary,
                  }}
                >
                  {option.label}
                </Typography>
                {value === option.id && variant === 'cards' && (
                  <Check
                    aria-hidden
                    sx={{ fontSize: fs(17), color: colors.gold, flexShrink: 0 }}
                  />
                )}
              </Box>
              {option.detail && (
                <Typography
                  component="span"
                  sx={{
                    display: 'block',
                    mt: 0.375,
                    fontSize: tokens.type.bodySm,
                    lineHeight: 1.4,
                    color: colors.textMuted,
                  }}
                >
                  {option.detail}
                </Typography>
              )}
            </Box>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
