import type { SearchResult, SkillDefinition } from '../optimizer';
import {
  StaleCraftStateError,
  UnverifiableCraftStateError,
} from './autoCraftErrors';
import {
  INACTIVE_NATIVE_AUTO_USE,
  isCoveredByNativeAutoUse,
  type NativeAutoUseStatus,
} from './nativeAutoUse';
import {
  createDefaultAutoCraftUiState,
  resolveEffectiveAutoCraftPolicy,
  type AutoCraftPhase,
  type AutoCraftPolicy,
  type AutoCraftTone,
  type AutoCraftUiState,
} from '../settings/autoCraft';

const READY_DELAY_MS = 90;
const STATE_ADVANCE_TIMEOUT_MS = 4500;
/**
 * Extra grace granted once the native auto-use loadout has been observed
 * consuming something, before the technique itself is expected to land.
 */
const NATIVE_SETTLE_TIMEOUT_MS = 1500;
/** How many native consumptions may be observed before giving up on the turn. */
const MAX_NATIVE_SETTLE_OBSERVATIONS = 4;
/** How long to wait before re-checking a craft state that could not be read. */
const PAUSE_RETRY_MS = 750;

type AutoCraftExecutionKind = 'skill' | 'item' | 'finish';
const GUARANTEED_FINISH_EPSILON = 1e-9;

function resolveExecutionKind(
  skill:
    | {
        actionKind?: string;
        key?: string;
        name?: string;
      }
    | undefined,
): AutoCraftExecutionKind {
  if (skill?.actionKind === 'item') return 'item';
  if (
    skill?.actionKind === 'finish' ||
    skill?.key === '__finish_craft__' ||
    skill?.name === 'Finish Craft'
  ) {
    return 'finish';
  }
  return 'skill';
}

function hasGuaranteedFinishAvailable(result: SearchResult): boolean {
  const candidates = [
    result.recommendation,
    ...result.alternativeSkills,
  ].filter(
    (candidate): candidate is NonNullable<SearchResult['recommendation']> =>
      candidate !== null,
  );

  return candidates.some((candidate) => {
    if (resolveExecutionKind(candidate.skill) !== 'finish') {
      return false;
    }
    return (
      (candidate.projectedSuccessChance ?? 0) >= 1 - GUARANTEED_FINISH_EPSILON
    );
  });
}

function recommendationEndsCraft(
  recommendation: SearchResult['recommendation'],
): boolean {
  if (!recommendation) {
    return false;
  }

  return (
    recommendation.endsCraft === true ||
    resolveExecutionKind(recommendation.skill) === 'finish'
  );
}

export interface AutoCraftExecutionRequest {
  kind: AutoCraftExecutionKind;
  actionName: string;
  skill?: SkillDefinition;
  reason: string;
}

/**
 * Result of re-reading the live craft state and comparing it against the state a
 * recommendation was produced from.
 *
 * `stale` means the craft moved and the recommendation must be recomputed;
 * `unverifiable` means the state could not be read at all, in which case
 * automation must pause instead of guessing.
 */
export type AutoCraftStateVerification =
  | { kind: 'match' }
  | { kind: 'stale'; changed: readonly string[] }
  | { kind: 'unverifiable'; reason: string };

/** The verification used when a snapshot provides none. */
export const MATCHED_STATE_VERIFICATION: AutoCraftStateVerification = {
  kind: 'match',
};

export interface AutoCraftRuntimeSnapshot {
  craftSessionActive: boolean;
  craftActive: boolean;
  isCalculating: boolean;
  result: SearchResult | null;
  stateFingerprint: string;
  /**
   * `progressState.step` at snapshot time.
   *
   * Native auto-use changes the craft state *without* consuming a turn, so the
   * step is what separates "the loadout applied a pill" from "the technique
   * landed".
   */
  craftStep?: number;
  /**
   * Monotonic revision bumped whenever `stateFingerprint` changes.
   *
   * Lets the executor re-check at dispatch time that the craft has not moved
   * since the recommendation was produced, which a fingerprint comparison made
   * `READY_DELAY_MS` earlier cannot do.
   */
  craftStateRevision?: number;
  /** What the native crafting auto-use loadout will do before a technique. */
  nativeAutoUse?: NativeAutoUseStatus;
  /**
   * Re-read the live craft state and compare it against this snapshot.
   *
   * Defaults to reporting `match`, which is the pre-guard behaviour: dispatch
   * proceeds exactly as before until a real reader is wired in.
   */
  verifyRevision?: () => AutoCraftStateVerification;
}

/** Snapshot verification, falling back to the no-op default. */
export function verifySnapshotState(
  snapshot: AutoCraftRuntimeSnapshot,
): AutoCraftStateVerification {
  return snapshot.verifyRevision?.() ?? MATCHED_STATE_VERIFICATION;
}

/** Native auto-use status of a snapshot, falling back to "no loadout". */
export function resolveSnapshotNativeAutoUse(
  snapshot: AutoCraftRuntimeSnapshot,
): NativeAutoUseStatus {
  return snapshot.nativeAutoUse ?? INACTIVE_NATIVE_AUTO_USE;
}

export interface AutoCraftExecutor {
  execute(
    request: AutoCraftExecutionRequest,
    snapshot: AutoCraftRuntimeSnapshot,
  ): Promise<void> | void;
}

interface AutoCraftControllerOptions {
  initialPolicy: AutoCraftPolicy;
  executor: AutoCraftExecutor;
  onStateChange?: (state: AutoCraftUiState) => void;
  schedule?: (callback: () => void, delayMs: number) => unknown;
  clearScheduled?: (handle: unknown) => void;
}

type ResolvedActionPlan =
  | {
      kind: 'execute';
      request: AutoCraftExecutionRequest;
      title: string;
      detail: string;
    }
  | {
      kind: 'stop';
      phase: Extract<AutoCraftPhase, 'stopped' | 'unsupported' | 'completed'>;
      tone: Extract<AutoCraftTone, 'warning' | 'success'>;
      title: string;
      detail: string;
    }
  | {
      kind: 'wait';
      phase: Extract<AutoCraftPhase, 'armed'>;
      tone: Extract<AutoCraftTone, 'neutral' | 'active'>;
      title: string;
      detail: string;
    };

export interface AutoCraftController {
  arm(): void;
  requestStop(reason?: string): void;
  reset(): void;
  setPolicy(policy: AutoCraftPolicy): void;
  sync(snapshot: AutoCraftRuntimeSnapshot): void;
  getUiState(): AutoCraftUiState;
  dispose(): void;
}

function isPolicyAllowed(
  policy: AutoCraftPolicy,
  actionKind: AutoCraftExecutionKind,
): boolean {
  if (actionKind === 'skill') return true;
  if (actionKind === 'finish') {
    return policy === 'techniquesAndFinish' || policy === 'fullActionSpace';
  }
  return policy === 'fullActionSpace';
}

function resolveActionPlan(
  snapshot: AutoCraftRuntimeSnapshot,
  policy: AutoCraftPolicy,
  nativeAutoUse: NativeAutoUseStatus,
): ResolvedActionPlan {
  if (!snapshot.result) {
    return {
      kind: 'wait',
      phase: 'armed',
      tone: snapshot.isCalculating ? 'active' : 'neutral',
      title: snapshot.isCalculating
        ? 'Calculating next step'
        : 'Waiting for recommendation',
      detail: snapshot.isCalculating
        ? 'CraftBuddy is searching before the next automatic action.'
        : 'Auto mode is armed and will start once a recommendation is available.',
    };
  }

  if (snapshot.result.outcomeProjection?.willAutoFinish) {
    // There is no finish action: once this predicate holds the game resolves the
    // craft by itself. Sending anything else here would only spend stability the
    // craft no longer needs.
    return {
      kind: 'stop',
      phase: 'completed',
      tone: 'success',
      title: 'Craft will auto-finish',
      detail:
        'The craft has reached the point where the game resolves it automatically, so auto mode stopped instead of spending another turn.',
    };
  }

  if (snapshot.result.targetsMet) {
    if (isPolicyAllowed(policy, 'finish')) {
      return {
        kind: 'execute',
        request: {
          kind: 'finish',
          actionName: 'Finish Craft',
          reason: 'Targets are already met.',
        },
        title: 'Finish Craft',
        detail: 'Targets are met. Auto mode is finishing the craft.',
      };
    }
    return {
      kind: 'stop',
      phase: 'unsupported',
      tone: 'success',
      title: 'Manual finish required',
      detail:
        'Targets are met, but the current auto policy does not finish crafts automatically.',
    };
  }

  const recommendation = snapshot.result.recommendation;
  if (!recommendation) {
    if (snapshot.result.isTerminal) {
      return {
        kind: 'stop',
        phase: 'stopped',
        tone: 'warning',
        title: 'Auto mode stopped',
        detail:
          'No valid actions remain. Check stability, qi, or finish the craft manually.',
      };
    }
    return {
      kind: 'wait',
      phase: 'armed',
      tone: 'neutral',
      title: 'Waiting for recommendation',
      detail:
        'Auto mode is armed and waiting for a fresh recommendation before acting.',
    };
  }

  const actionKind = resolveExecutionKind(recommendation.skill);
  if (
    actionKind === 'item' &&
    isCoveredByNativeAutoUse(nativeAutoUse, recommendation.skill.itemName)
  ) {
    // Defence in depth: covered items are already excluded from the optimizer's
    // action space, so reaching here means the two views disagreed. Stopping is
    // the only safe answer, because using it would consume the item twice.
    return {
      kind: 'stop',
      phase: 'unsupported',
      tone: 'warning',
      title: 'Auto-use loadout owns that item',
      detail: `The best move is ${recommendation.skill.name}, but your crafting auto-use loadout already applies it before each technique, so auto mode stopped rather than consuming it twice.`,
    };
  }

  if (
    !isPolicyAllowed(policy, 'finish') &&
    recommendationEndsCraft(recommendation)
  ) {
    return {
      kind: 'stop',
      phase: 'unsupported',
      tone: 'success',
      title: 'Manual finish required',
      detail: `The best move is ${recommendation.skill.name}, but it would end the craft, so auto mode stopped before resolving it.`,
    };
  }

  if (
    !isPolicyAllowed(policy, 'finish') &&
    hasGuaranteedFinishAvailable(snapshot.result)
  ) {
    return {
      kind: 'stop',
      phase: 'unsupported',
      tone: 'success',
      title: 'Manual finish required',
      detail:
        'The craft can already be finished successfully, so auto mode stopped before cashing it out.',
    };
  }

  if (!isPolicyAllowed(policy, actionKind)) {
    if (actionKind === 'item' && nativeAutoUse.active) {
      // Items share the runtime's `pillsPerRound` budget with the native loadout,
      // so CraftBuddy spending one would change which items the game applies
      // even when it is not the same item. Consumption belongs to one side only.
      return {
        kind: 'stop',
        phase: 'unsupported',
        tone: 'warning',
        title: 'Auto-use loadout owns item usage',
        detail: `The best move is ${recommendation.skill.name}, but your crafting auto-use loadout is handling items this craft, so auto mode stopped rather than spending from the same per-turn item budget.`,
      };
    }

    const policyLabel =
      actionKind === 'finish' ? 'finish crafts' : 'use item actions';
    return {
      kind: 'stop',
      phase: 'unsupported',
      tone: 'warning',
      title: 'Policy stopped auto mode',
      detail: `The best move is ${recommendation.skill.name}, but the current policy does not ${policyLabel}.`,
    };
  }

  return {
    kind: 'execute',
    request: {
      kind: actionKind,
      actionName: recommendation.skill.name,
      skill: recommendation.skill,
      reason: recommendation.reasoning,
    },
    title: actionKind === 'finish' ? 'Finish Craft' : recommendation.skill.name,
    detail: recommendation.reasoning,
  };
}

export function createAutoCraftController({
  initialPolicy,
  executor,
  onStateChange,
  schedule = (callback, delayMs) => window.setTimeout(callback, delayMs),
  clearScheduled = (handle) =>
    window.clearTimeout(handle as ReturnType<typeof window.setTimeout>),
}: AutoCraftControllerOptions): AutoCraftController {
  let uiState = createDefaultAutoCraftUiState(initialPolicy);
  let lastSnapshot: AutoCraftRuntimeSnapshot | null = null;
  let scheduledExecutionHandle: unknown = null;
  let scheduledExecutionFingerprint: string | null = null;
  let awaitingFingerprint: string | null = null;
  let awaitingRequest: AutoCraftExecutionRequest | null = null;
  let awaitingStep: number | null = null;
  let nativeSettleObservations = 0;
  let waitingTimeoutHandle: unknown = null;
  let pauseRetryHandle: unknown = null;
  let stopReason = 'Auto mode will stop after the current action resolves.';

  const emit = () => {
    onStateChange?.(uiState);
  };

  const setUiState = (
    patch: Partial<AutoCraftUiState>,
    nextPolicy: AutoCraftPolicy = patch.policy ?? uiState.policy,
  ) => {
    uiState = {
      ...uiState,
      ...patch,
      policy: nextPolicy,
      canArm: patch.canArm ?? !(patch.armed ?? uiState.armed),
      canStop: patch.canStop ?? Boolean(patch.armed ?? uiState.armed),
      isRunning:
        patch.isRunning ??
        ['ready', 'executing', 'waiting_for_state', 'stop_requested'].includes(
          patch.phase ?? uiState.phase,
        ),
    };
    emit();
  };

  const cancelScheduledExecution = () => {
    if (!scheduledExecutionHandle) return;
    clearScheduled(scheduledExecutionHandle);
    scheduledExecutionHandle = null;
    scheduledExecutionFingerprint = null;
  };

  const cancelWaitingTimeout = () => {
    if (!waitingTimeoutHandle) return;
    clearScheduled(waitingTimeoutHandle);
    waitingTimeoutHandle = null;
  };

  const cancelPauseRetry = () => {
    if (!pauseRetryHandle) return;
    clearScheduled(pauseRetryHandle);
    pauseRetryHandle = null;
  };

  const clearAwaitingState = () => {
    awaitingFingerprint = null;
    awaitingRequest = null;
    awaitingStep = null;
    nativeSettleObservations = 0;
  };

  const resetTransientState = () => {
    cancelScheduledExecution();
    cancelWaitingTimeout();
    cancelPauseRetry();
    clearAwaitingState();
    stopReason = 'Auto mode stopped.';
  };

  const finalizeStoppedState = (
    phase: Extract<
      AutoCraftPhase,
      'completed' | 'stopped' | 'unsupported' | 'error'
    >,
    tone: AutoCraftTone,
    statusTitle: string,
    statusDetail: string,
  ) => {
    resetTransientState();
    setUiState({
      armed: false,
      phase,
      tone,
      statusTitle,
      statusDetail,
      stopRequested: false,
      canArm: true,
      canStop: false,
      isRunning: false,
    });
  };

  const resetController = () => {
    resetTransientState();
    uiState = createDefaultAutoCraftUiState(uiState.policy);
    emit();
  };

  const startAwaitingStateAdvance = (executionFingerprint: string) => {
    awaitingFingerprint = executionFingerprint;
    nativeSettleObservations = 0;
    cancelWaitingTimeout();
  };

  /**
   * The live craft moved before the action was dispatched.
   *
   * This is not an error: the right answer is to throw the stale plan away and
   * let the next recommendation decide, which is exactly what staying armed with
   * no scheduled execution does.
   */
  const handleStaleCraftState = (changed: readonly string[]) => {
    cancelScheduledExecution();
    cancelWaitingTimeout();
    clearAwaitingState();

    setUiState({
      phase: 'armed',
      tone: 'active',
      statusTitle: 'Recalculating',
      statusDetail: `The live craft changed${
        changed.length > 0 ? ` (${changed.join(', ')})` : ''
      } before the action was sent, so auto mode is recalculating instead of executing a stale action.`,
      isRunning: false,
      canStop: true,
    });
  };

  /**
   * The live craft state could not be confirmed, so nothing may be dispatched.
   *
   * Automation stays armed but idle and re-checks on a timer, so it recovers by
   * itself once the store is readable again without ever acting on a guess.
   */
  const handleUnverifiableCraftState = (reason: string) => {
    cancelScheduledExecution();
    cancelWaitingTimeout();
    clearAwaitingState();

    setUiState({
      phase: 'armed',
      tone: 'warning',
      statusTitle: 'Auto mode paused',
      statusDetail: `${reason} Auto mode paused instead of acting on unconfirmed state.`,
      isRunning: false,
      canStop: true,
    });

    if (pauseRetryHandle) {
      return;
    }
    pauseRetryHandle = schedule(() => {
      pauseRetryHandle = null;
      if (!uiState.armed || uiState.stopRequested || !lastSnapshot) {
        return;
      }
      controller.sync(lastSnapshot);
    }, PAUSE_RETRY_MS);
  };

  /**
   * Decide whether an observed state change is native auto-use rather than the
   * technique landing.
   *
   * The native loadout applies items before the technique without consuming a
   * turn, so an unchanged step means the craft has not actually advanced yet.
   * Treating that as "the action worked" is how automation ends up one action
   * ahead of the game.
   */
  const isNativeAutoUseSettle = (
    snapshot: AutoCraftRuntimeSnapshot,
  ): boolean => {
    if (!resolveSnapshotNativeAutoUse(snapshot).active) {
      return false;
    }
    if (!awaitingRequest || awaitingRequest.kind === 'item') {
      return false;
    }
    if (
      typeof awaitingStep !== 'number' ||
      typeof snapshot.craftStep !== 'number'
    ) {
      return false;
    }
    return (
      snapshot.craftStep === awaitingStep &&
      nativeSettleObservations < MAX_NATIVE_SETTLE_OBSERVATIONS
    );
  };

  const observeNativeAutoUseSettle = (snapshot: AutoCraftRuntimeSnapshot) => {
    nativeSettleObservations += 1;
    // Re-baseline on the post-consumption state so the next real change is still
    // detected as an advance.
    awaitingFingerprint = snapshot.stateFingerprint;
    const request = awaitingRequest;

    cancelWaitingTimeout();
    waitingTimeoutHandle = schedule(() => {
      finalizeStoppedState(
        'error',
        'error',
        'Auto mode error',
        `${
          request?.actionName ?? 'The action'
        } did not advance the craft after your auto-use loadout applied items. Auto mode stopped to avoid duplicate inputs.`,
      );
    }, STATE_ADVANCE_TIMEOUT_MS + NATIVE_SETTLE_TIMEOUT_MS);

    setUiState({
      phase: uiState.stopRequested ? 'stop_requested' : 'waiting_for_state',
      tone: uiState.stopRequested ? 'warning' : 'active',
      statusTitle: uiState.stopRequested
        ? 'Stopping after current action'
        : 'Auto-use items applied',
      statusDetail: uiState.stopRequested
        ? stopReason
        : `Your crafting auto-use loadout applied items; waiting for ${
            request?.actionName ?? 'the action'
          } to advance the craft.`,
      isRunning: true,
      canStop: true,
    });
  };

  const waitForStateAdvance = (
    request: AutoCraftExecutionRequest,
    executionFingerprint: string,
  ) => {
    if (awaitingFingerprint !== executionFingerprint) {
      return;
    }

    waitingTimeoutHandle = schedule(() => {
      finalizeStoppedState(
        'error',
        'error',
        'Auto mode error',
        `${request.actionName} did not change the live craft state in time. Auto mode stopped to avoid duplicate inputs.`,
      );
    }, STATE_ADVANCE_TIMEOUT_MS);

    setUiState({
      phase: uiState.stopRequested ? 'stop_requested' : 'waiting_for_state',
      tone: uiState.stopRequested ? 'warning' : 'active',
      statusTitle: uiState.stopRequested
        ? 'Stopping after current action'
        : 'Waiting for game state',
      statusDetail: uiState.stopRequested
        ? stopReason
        : `Waiting for ${request.actionName} to advance the craft before continuing.`,
      lastActionName: request.actionName,
      isRunning: true,
      canStop: true,
    });
  };

  const executePlan = async (
    executionFingerprint: string,
    request: AutoCraftExecutionRequest,
  ) => {
    if (
      !lastSnapshot ||
      !uiState.armed ||
      uiState.stopRequested ||
      awaitingFingerprint ||
      executionFingerprint !== lastSnapshot.stateFingerprint
    ) {
      return;
    }

    scheduledExecutionHandle = null;
    scheduledExecutionFingerprint = null;

    // Dispatch-time re-verification. The fingerprint comparison above only proves
    // CraftBuddy's own view is unchanged; this proves the *live* craft is.
    const verification = verifySnapshotState(lastSnapshot);
    if (verification.kind === 'stale') {
      handleStaleCraftState(verification.changed);
      return;
    }
    if (verification.kind === 'unverifiable') {
      handleUnverifiableCraftState(verification.reason);
      return;
    }

    setUiState({
      phase: 'executing',
      tone: 'active',
      statusTitle:
        request.kind === 'finish'
          ? 'Finishing craft'
          : 'Executing recommendation',
      statusDetail:
        request.kind === 'finish'
          ? request.reason
          : `Using ${request.actionName} automatically.`,
      lastActionName: request.actionName,
      isRunning: true,
      canStop: true,
    });

    const executionSnapshot = lastSnapshot;
    startAwaitingStateAdvance(executionFingerprint);
    awaitingRequest = request;
    awaitingStep =
      typeof executionSnapshot.craftStep === 'number'
        ? executionSnapshot.craftStep
        : null;

    try {
      await executor.execute(request, executionSnapshot);
      waitForStateAdvance(request, executionFingerprint);
    } catch (error) {
      cancelWaitingTimeout();
      clearAwaitingState();

      // The executor verifies again at the moment of dispatch, so it can catch a
      // change this function was too early to see.
      if (error instanceof StaleCraftStateError) {
        handleStaleCraftState(error.changed);
        return;
      }
      if (error instanceof UnverifiableCraftStateError) {
        handleUnverifiableCraftState(error.reason);
        return;
      }

      const message =
        error instanceof Error ? error.message : String(error ?? 'Unknown');
      finalizeStoppedState('error', 'error', 'Auto mode error', message);
    }
  };

  const scheduleExecution = (request: AutoCraftExecutionRequest) => {
    if (!lastSnapshot) return;
    if (scheduledExecutionFingerprint === lastSnapshot.stateFingerprint) {
      return;
    }

    cancelScheduledExecution();
    const executionFingerprint = lastSnapshot.stateFingerprint;
    scheduledExecutionFingerprint = executionFingerprint;

    setUiState({
      phase: 'ready',
      tone: 'active',
      statusTitle: 'Ready to act',
      statusDetail:
        request.kind === 'finish'
          ? request.reason
          : `Preparing to use ${request.actionName}.`,
      isRunning: true,
      canStop: true,
    });

    scheduledExecutionHandle = schedule(() => {
      void executePlan(executionFingerprint, request);
    }, READY_DELAY_MS);
  };

  const controller: AutoCraftController = {
    arm() {
      resetTransientState();
      setUiState({
        armed: true,
        phase: 'armed',
        tone: 'active',
        statusTitle: 'Auto mode armed',
        statusDetail:
          'Auto mode will use the next supported recommendation for this craft.',
        stopRequested: false,
        canArm: false,
        canStop: true,
        isRunning: false,
      });
    },

    requestStop(reason = 'Auto mode stopped by user.') {
      if (!uiState.armed) {
        finalizeStoppedState(
          'stopped',
          'neutral',
          'Auto mode off',
          'Auto mode is already disabled.',
        );
        return;
      }

      stopReason = reason;

      if (
        awaitingFingerprint ||
        uiState.phase === 'executing' ||
        uiState.phase === 'waiting_for_state'
      ) {
        setUiState({
          phase: 'stop_requested',
          tone: 'warning',
          statusTitle: 'Stop requested',
          statusDetail: reason,
          stopRequested: true,
          isRunning: true,
          canStop: true,
        });
        return;
      }

      finalizeStoppedState('stopped', 'neutral', 'Auto mode off', reason);
    },

    reset() {
      resetController();
    },

    setPolicy(policy) {
      const resolution = resolveEffectiveAutoCraftPolicy(
        policy,
        lastSnapshot ? resolveSnapshotNativeAutoUse(lastSnapshot) : undefined,
      );
      setUiState(
        {
          policy,
          effectivePolicy: resolution.policy,
          policyNotice: resolution.reason,
          statusDetail: uiState.armed
            ? uiState.statusDetail
            : createDefaultAutoCraftUiState(policy).statusDetail,
        },
        policy,
      );
    },

    sync(snapshot) {
      lastSnapshot = snapshot;

      if (!snapshot.craftSessionActive) {
        resetController();
        return;
      }

      const nativeAutoUse = resolveSnapshotNativeAutoUse(snapshot);
      const policyResolution = resolveEffectiveAutoCraftPolicy(
        uiState.policy,
        nativeAutoUse,
      );
      if (
        uiState.effectivePolicy !== policyResolution.policy ||
        uiState.policyNotice !== policyResolution.reason ||
        uiState.nativeAutoUseActive !== nativeAutoUse.active
      ) {
        setUiState({
          effectivePolicy: policyResolution.policy,
          policyNotice: policyResolution.reason,
          nativeAutoUseActive: nativeAutoUse.active,
        });
      }

      if (
        awaitingFingerprint &&
        awaitingFingerprint !== snapshot.stateFingerprint
      ) {
        if (isNativeAutoUseSettle(snapshot)) {
          observeNativeAutoUseSettle(snapshot);
          return;
        }

        cancelWaitingTimeout();
        const completedRequest = awaitingRequest;
        clearAwaitingState();
        if (completedRequest?.kind === 'finish') {
          finalizeStoppedState(
            'completed',
            'success',
            'Craft finished',
            'Auto mode advanced the craft to resolution and is waiting for the next craft.',
          );
          return;
        }
        if (uiState.stopRequested) {
          finalizeStoppedState(
            'stopped',
            'neutral',
            'Auto mode off',
            stopReason,
          );
          return;
        }
      }

      if (!uiState.armed) {
        return;
      }

      if (snapshot.isCalculating) {
        cancelScheduledExecution();
        setUiState({
          phase: 'calculating',
          tone: 'active',
          statusTitle: 'Calculating next step',
          statusDetail:
            'Auto mode is waiting for CraftBuddy to finish calculating before acting.',
          isRunning: false,
          canStop: true,
        });
        return;
      }

      if (!snapshot.craftActive) {
        cancelScheduledExecution();
        setUiState({
          phase: 'armed',
          tone: 'neutral',
          statusTitle: 'Waiting for live craft state',
          statusDetail:
            'Auto mode is armed and will begin once live crafting data is available.',
          isRunning: false,
          canStop: true,
        });
        return;
      }

      if (awaitingFingerprint) {
        return;
      }

      if (uiState.stopRequested) {
        finalizeStoppedState('stopped', 'neutral', 'Auto mode off', stopReason);
        return;
      }

      const plan = resolveActionPlan(
        snapshot,
        policyResolution.policy,
        nativeAutoUse,
      );
      if (plan.kind === 'stop') {
        finalizeStoppedState(plan.phase, plan.tone, plan.title, plan.detail);
        return;
      }

      if (plan.kind === 'wait') {
        cancelScheduledExecution();
        setUiState({
          phase: plan.phase,
          tone: plan.tone,
          statusTitle: plan.title,
          // While idle is the one moment where explaining the policy downgrade
          // costs the player nothing, so the reason is visible without needing a
          // dedicated panel row.
          statusDetail: policyResolution.reason
            ? `${plan.detail} ${policyResolution.reason}`
            : plan.detail,
          isRunning: false,
          canStop: true,
        });
        return;
      }

      scheduleExecution(plan.request);
    },

    getUiState() {
      return uiState;
    },

    dispose() {
      resetTransientState();
    },
  };

  return controller;
}
