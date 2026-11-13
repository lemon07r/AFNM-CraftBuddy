import { useId } from 'react';
import { Box, Typography } from '@mui/material';
import { Check } from '@mui/icons-material';
import { colors, focusRing, tokens } from '../theme';

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
                color: colors.textSecondary,
                mb: 0.75,
              }
        }
      >
        {label}
      </Box>
      <Box
        sx={{
          display: 'grid',
          gap: 0.5,
          gridTemplateColumns:
            variant === 'cards'
              ? '1fr'
              : `repeat(${options.length}, minmax(0, 1fr))`,
          ...(variant === 'segmented'
            ? {
                p: 0.5,
                backgroundColor: tokens.surface.sunken,
                borderRadius: `${tokens.radius.md}px`,
                '@container (max-width: 580px)': {
                  gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
                },
                '@container (max-width: 300px)': {
                  gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                },
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
              '&:hover .choice-face': {
                backgroundColor: tokens.surface.hover,
                borderColor: tokens.border.strong,
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
              sx={{
                width: '100%',
                minWidth: 0,
                boxSizing: 'border-box',
                border: `1px solid ${value === option.id ? tokens.border.strong : tokens.border.hairline}`,
                borderRadius: `${tokens.radius.sm}px`,
                px: variant === 'pills' ? 0.5 : 1,
                py: variant === 'pills' ? 0.375 : 0.875,
                minHeight: tokens.control.sm,
                backgroundColor:
                  value === option.id ? tokens.surface.selected : 'transparent',
                transition: 'border-color 120ms, background-color 120ms',
                textAlign: variant === 'pills' ? 'center' : 'left',
              }}
            >
              <Box
                component="span"
                sx={{
                  display: 'flex',
                  gap: 0.5,
                  alignItems: 'center',
                  justifyContent:
                    variant === 'pills' ? 'center' : 'space-between',
                }}
              >
                <Typography
                  component="span"
                  sx={{
                    fontSize: tokens.type.body,
                    lineHeight: 1.3,
                    color:
                      value === option.id
                        ? colors.goldLight
                        : colors.textPrimary,
                  }}
                >
                  {option.label}
                </Typography>
                {value === option.id && variant !== 'pills' && (
                  <Check
                    aria-hidden
                    sx={{ fontSize: 15, color: colors.gold, flexShrink: 0 }}
                  />
                )}
              </Box>
              {option.detail && (
                <Typography
                  component="span"
                  variant="caption"
                  sx={{
                    display: 'block',
                    mt: 0.375,
                    color: colors.textSecondary,
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
