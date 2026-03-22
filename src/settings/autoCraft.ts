export const AUTO_CRAFT_POLICY_VALUES = [
  'techniquesOnly',
  'techniquesAndFinish',
  'fullActionSpace',
] as const;

export type AutoCraftPolicy = (typeof AUTO_CRAFT_POLICY_VALUES)[number];

export const DEFAULT_AUTO_CRAFT_POLICY: AutoCraftPolicy = 'techniquesOnly';

export interface AutoCraftPolicyOption {
  value: AutoCraftPolicy;
  label: string;
  shortLabel: string;
  description: string;
}

export const AUTO_CRAFT_POLICY_OPTIONS: readonly AutoCraftPolicyOption[] = [
  {
    value: 'techniquesOnly',
    label: 'Techniques Only',
    shortLabel: 'Skills',
    description:
      'Only uses techniques that keep the craft open. Stops before any craft-ending action or item.',
  },
  {
    value: 'techniquesAndFinish',
    label: 'Techniques + Finish',
    shortLabel: 'Skills + Finish',
    description:
      'Uses techniques and can finish the craft automatically once the optimizer says to finish.',
  },
  {
    value: 'fullActionSpace',
    label: 'Full Action Space',
    shortLabel: 'Full',
    description:
      'Allows techniques, Finish Craft, and quick-access crafting items when available.',
  },
] as const;

export type AutoCraftTone =
  | 'neutral'
  | 'active'
  | 'warning'
  | 'error'
  | 'success';

export type AutoCraftPhase =
  | 'off'
  | 'armed'
  | 'calculating'
  | 'ready'
  | 'executing'
  | 'waiting_for_state'
  | 'completed'
  | 'stop_requested'
  | 'stopped'
  | 'unsupported'
  | 'error';

export interface AutoCraftUiState {
  policy: AutoCraftPolicy;
  armed: boolean;
  phase: AutoCraftPhase;
  tone: AutoCraftTone;
  statusTitle: string;
  statusDetail: string;
  lastActionName?: string;
  canArm: boolean;
  canStop: boolean;
  isRunning: boolean;
  stopRequested: boolean;
}

export function isAutoCraftPolicy(value: unknown): value is AutoCraftPolicy {
  return (
    typeof value === 'string' &&
    (AUTO_CRAFT_POLICY_VALUES as readonly string[]).includes(value)
  );
}

export function normalizeAutoCraftPolicy(
  value: unknown,
  fallback: AutoCraftPolicy = DEFAULT_AUTO_CRAFT_POLICY,
): AutoCraftPolicy {
  return isAutoCraftPolicy(value) ? value : fallback;
}

export function createDefaultAutoCraftUiState(
  policy: AutoCraftPolicy = DEFAULT_AUTO_CRAFT_POLICY,
): AutoCraftUiState {
  return {
    policy,
    armed: false,
    phase: 'off',
    tone: 'neutral',
    statusTitle: 'Auto mode off',
    statusDetail:
      'Enable auto mode to execute the optimizer recommendation each turn.',
    canArm: true,
    canStop: false,
    isRunning: false,
    stopRequested: false,
  };
}
