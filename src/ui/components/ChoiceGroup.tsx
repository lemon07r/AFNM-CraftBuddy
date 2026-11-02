import React, { useId } from 'react';
import {
  Box,
  FormControl,
  FormControlLabel,
  FormLabel,
  Radio,
  RadioGroup,
  Typography,
} from '@mui/material';
import { colors } from '../theme';

export function ChoiceGroup({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: ReadonlyArray<{ id: string; label: string; detail?: string }>;
  onChange: (value: string) => void;
}) {
  const id = useId();
  return (
    <FormControl
      component="fieldset"
      sx={{ width: '100%', minWidth: 0, my: 0.5 }}
    >
      <FormLabel
        component="legend"
        id={id}
        sx={{ fontSize: '0.8rem', color: `${colors.textSecondary} !important` }}
      >
        {label}
      </FormLabel>
      <RadioGroup
        aria-labelledby={id}
        value={value}
        onChange={(_, next) => onChange(next)}
        sx={{
          display: 'grid',
          gridTemplateColumns:
            'repeat(auto-fit, minmax(min(100%, 140px), 1fr))',
        }}
      >
        {options.map((option) => (
          <FormControlLabel
            key={option.id}
            value={option.id}
            sx={{ m: 0, minWidth: 0, alignItems: 'flex-start', py: 0.25 }}
            control={<Radio />}
            label={
              <Box sx={{ pt: 0.7 }}>
                <Typography variant="body2">{option.label}</Typography>
                {option.detail && (
                  <Typography
                    variant="caption"
                    sx={{ color: colors.textSecondary, display: 'block' }}
                  >
                    {option.detail}
                  </Typography>
                )}
              </Box>
            }
          />
        ))}
      </RadioGroup>
    </FormControl>
  );
}
