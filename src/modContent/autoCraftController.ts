import type { SearchResult, SkillDefinition } from '../optimizer';
import {
  createDefaultAutoCraftUiState,
  type AutoCraftPhase,
  type AutoCraftPolicy,
  type AutoCraftTone,
  type AutoCraftUiState,
} from '../settings/autoCraft';

const READY_DELAY_MS = 90;
const STATE_ADVANCE_TIMEOUT_MS = 4500;

type AutoCraftExecutionKind = 'skill' | 'item' | 'finish';

export interface AutoCraftExecutionRequest {
  kind: AutoCraftExecutionKind;
  actionName: string;
  skill?: SkillDefinition;
  reason: string;
}

export interface AutoCraftRuntimeSnapshot {
  craftSessionActive: boolean;
  craftActive: boolean;
  isCalculating: boolean;
  result: SearchResult | null;
  stateFingerprint: string;
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
      phase: Extract<AutoCraftPhase, 'stopped' | 'unsupported'>;
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
    return (
      policy === 'techniquesAndFinish' || policy === 'fullActionSpace'
    );
  }
  return policy === 'fullActionSpace';
}

function resolveActionPlan(
  snapshot: AutoCraftRuntimeSnapshot,
  policy: AutoCraftPolicy,
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

  const actionKind = (recommendation.skill.actionKind ??
    'skill') as AutoCraftExecutionKind;
  if (!isPolicyAllowed(policy, actionKind)) {
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
    title:
      actionKind === 'finish'
        ? 'Finish Craft'
        : recommendation.skill.name,
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
  let waitingTimeoutHandle: unknown = null;
  let stopReason =
    'Auto mode will stop after the current action resolves.';

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
      canStop:
        patch.canStop ??
        Boolean(
          patch.armed ?? uiState.armed,
        ),
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

  const resetTransientState = () => {
    cancelScheduledExecution();
    cancelWaitingTimeout();
    awaitingFingerprint = null;
    stopReason = 'Auto mode stopped.';
  };

  const finalizeStoppedState = (
    phase: Extract<AutoCraftPhase, 'stopped' | 'unsupported' | 'error'>,
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

  const waitForStateAdvance = (request: AutoCraftExecutionRequest) => {
    if (!lastSnapshot) return;

    awaitingFingerprint = lastSnapshot.stateFingerprint;
    cancelWaitingTimeout();
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

    try {
      await executor.execute(request, lastSnapshot);
      waitForStateAdvance(request);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error ?? 'Unknown');
      finalizeStoppedState(
        'error',
        'error',
        'Auto mode error',
        message,
      );
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
      setUiState(
        {
          policy,
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

      if (
        awaitingFingerprint &&
        awaitingFingerprint !== snapshot.stateFingerprint
      ) {
        cancelWaitingTimeout();
        awaitingFingerprint = null;
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

      const plan = resolveActionPlan(snapshot, uiState.policy);
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
          statusDetail: plan.detail,
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
