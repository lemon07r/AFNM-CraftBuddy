export const AUTO_CRAFT_POLICY_VALUES = [
  'techniquesOnly',
  'allowCraftEnding',
  'includeItems',
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
    label: 'Pause before craft ends',
    shortLabel: 'Pause before end',
    description:
      'Only uses techniques that keep the craft open. Stops before any craft-ending action or item.',
  },
  {
    value: 'allowCraftEnding',
    label: 'Allow craft-ending techniques',
    shortLabel: 'Allow craft end',
    description:
      'Uses real techniques, including techniques that automatically resolve the craft.',
  },
  {
    value: 'includeItems',
    label: 'Also use quick-access items',
    shortLabel: 'Include items',
    description:
      'Allows craft-ending techniques and quick-access crafting items. While native auto-use is active, the game handles items and this behaves as Allow craft-ending techniques.',
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
  /**
   * The policy actually in force.
   *
   * Differs from `policy` when the native crafting auto-use loadout owns
   * item consumption, in which case CraftBuddy steps back rather than competing.
   */
  effectivePolicy: AutoCraftPolicy;
  /** Why `effectivePolicy` differs from the selected `policy`, for display. */
  policyNotice?: string;
  /** Whether a native crafting auto-use loadout is active for this craft. */
  nativeAutoUseActive: boolean;
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

/** Minimal view of the native auto-use status the policy gate needs. */
export interface NativeAutoUsePolicyInput {
  readonly active: boolean;
  readonly slotCount: number;
}

export interface AutoCraftPolicyResolution {
  /** The policy to act on. */
  readonly policy: AutoCraftPolicy;
  /** The policy the player selected. */
  readonly requested: AutoCraftPolicy;
  /** Whether the requested policy was reduced. */
  readonly downgraded: boolean;
  /** Player-facing explanation, present only when downgraded. */
  readonly reason?: string;
}

/**
 * Resolve the policy that may actually run.
 *
 * The game applies the player's crafting auto-use loadout immediately before every
 * technique. If CraftBuddy also spent quick-access items it would double-consume
 * them, so `includeItems` steps down to `allowCraftEnding` while a loadout is
 * active. Deciding *who consumes* once, at policy level, is what keeps the two
 * systems from racing each other action by action.
 */
export function resolveEffectiveAutoCraftPolicy(
  requested: AutoCraftPolicy,
  nativeAutoUse: NativeAutoUsePolicyInput | undefined,
): AutoCraftPolicyResolution {
  if (!nativeAutoUse?.active || requested !== 'includeItems') {
    return { policy: requested, requested, downgraded: false };
  }

  return {
    policy: 'allowCraftEnding',
    requested,
    downgraded: true,
    reason: `Your crafting auto-use loadout (${nativeAutoUse.slotCount} ${
      nativeAutoUse.slotCount === 1 ? 'slot' : 'slots'
    }) already applies items before each technique, so auto mode is using techniques only to avoid consuming them twice.`,
  };
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
  if (value === 'techniquesAndFinish') return 'allowCraftEnding';
  if (value === 'fullActionSpace') return 'includeItems';
  return isAutoCraftPolicy(value) ? value : fallback;
}

export function createDefaultAutoCraftUiState(
  policy: AutoCraftPolicy = DEFAULT_AUTO_CRAFT_POLICY,
): AutoCraftUiState {
  return {
    policy,
    effectivePolicy: policy,
    nativeAutoUseActive: false,
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
