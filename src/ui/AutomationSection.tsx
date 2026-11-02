import React from 'react';
import { Typography } from '@mui/material';
import { AUTO_CRAFT_POLICY_OPTIONS, type AutoCraftPolicy } from '../settings';
import type { AutoCraftUiState } from '../settings/autoCraft';
import { ActionButton, Disclosure } from './components';
import { ChoiceGroup } from './components/ChoiceGroup';
import { colors } from './theme';

export function AutomationSection({
  autoMode,
  onArm,
  onPolicyChange,
}: {
  autoMode: AutoCraftUiState;
  onArm?: () => void;
  onPolicyChange?: (policy: AutoCraftPolicy) => void;
}) {
  return (
    <Disclosure title="Automatic crafting">
      <Typography variant="body2" sx={{ color: colors.textSecondary, mb: 1 }}>
        {autoMode.statusDetail}
      </Typography>
      <ChoiceGroup
        label="Allowed actions"
        value={autoMode.policy}
        options={AUTO_CRAFT_POLICY_OPTIONS.map((option) => ({
          id: option.value,
          label: option.label,
        }))}
        onChange={(id) => {
          const option = AUTO_CRAFT_POLICY_OPTIONS.find(
            (candidate) => candidate.value === id,
          );
          if (option) onPolicyChange?.(option.value);
        }}
      />
      <Typography
        variant="caption"
        sx={{ color: colors.textSecondary, display: 'block', mb: 1 }}
      >
        Uses real game controls. Stop remains available at the top of the panel.
      </Typography>
      {!autoMode.armed && (
        <ActionButton disabled={!autoMode.canArm || !onArm} onClick={onArm}>
          Start automatic crafting
        </ActionButton>
      )}
    </Disclosure>
  );
}
