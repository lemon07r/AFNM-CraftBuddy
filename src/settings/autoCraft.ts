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
      'Allows techniques, craft resolution, and quick-access crafting items when available. While a crafting auto-use loadout is active the game handles items, so this behaves as Techniques + Finish.',
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
 * them, so `fullActionSpace` steps down to techniques + finish while a loadout is
 * active. Deciding *who consumes* once, at policy level, is what keeps the two
 * systems from racing each other action by action.
 */
export function resolveEffectiveAutoCraftPolicy(
  requested: AutoCraftPolicy,
  nativeAutoUse: NativeAutoUsePolicyInput | undefined,
): AutoCraftPolicyResolution {
  if (!nativeAutoUse?.active || requested !== 'fullActionSpace') {
    return { policy: requested, requested, downgraded: false };
  }

  return {
    policy: 'techniquesAndFinish',
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
