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
    <Disclosure title="Automatic crafting" meta={autoMode.statusTitle}>
      <Typography variant="body2" sx={{ color: colors.textSecondary, mb: 1.5 }}>
        {autoMode.statusDetail}
      </Typography>
      <ChoiceGroup
        variant="cards"
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
        variant="body2"
        sx={{ color: colors.textMuted, display: 'block', mt: 1, mb: 1.5 }}
      >
        Uses real game controls. Stop remains available at the top of the panel.
      </Typography>
      {!autoMode.armed && (
        <ActionButton
          variant="contained"
          disabled={!autoMode.canArm || !onArm}
          onClick={onArm}
        >
          Start automatic crafting
        </ActionButton>
      )}
    </Disclosure>
  );
}
