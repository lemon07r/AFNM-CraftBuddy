import {
  createAutoCraftController,
  type AutoCraftExecutionRequest,
  type AutoCraftRuntimeSnapshot,
} from '../modContent/autoCraftController';
import {
  StaleCraftStateError,
  UnverifiableCraftStateError,
} from '../modContent/autoCraftErrors';
import type { NativeAutoUseStatus } from '../modContent/nativeAutoUse';
import {
  type AutoCraftPolicy,
  type AutoCraftUiState,
} from '../settings/autoCraft';

function activeNativeAutoUse(
  coveredItemNames: string[] = ['qi_pill'],
): NativeAutoUseStatus {
  return {
    active: true,
    slotCount: coveredItemNames.length,
    coveredItemNames: new Set(coveredItemNames),
    pillsPerRound: 2,
    availableToxicity: 40,
    trainingMode: false,
  };
}

function buildSnapshot(
  overrides: Partial<AutoCraftRuntimeSnapshot> = {},
): AutoCraftRuntimeSnapshot {
  return {
    craftSessionActive: true,
    craftActive: true,
    isCalculating: false,
    stateFingerprint: 'fp-1',
    craftStep: 4,
    result: {
      recommendation: {
        skill: {
          name: 'Simple Fusion',
          type: 'fusion',
          actionKind: 'skill',
        },
        expectedGains: { completion: 10, perfection: 0, stability: 0 },
        immediateGains: { completion: 10, perfection: 0, stability: 0 },
        effectiveCosts: { qi: 0, stability: 10 },
        score: 100,
        reasoning: 'Build completion safely.',
      },
      alternativeSkills: [],
      isTerminal: false,
      targetsMet: false,
    } as any,
    ...overrides,
  };
}

describe('autoCraftController', () => {
  let executed: AutoCraftExecutionRequest[];
  let uiStates: AutoCraftUiState[];

  function createHarness(
    initialPolicy: AutoCraftPolicy = 'techniquesOnly',
    onExecute?: (
      request: AutoCraftExecutionRequest,
      controller: ReturnType<typeof createAutoCraftController>,
    ) => void,
  ) {
    executed = [];
    uiStates = [];

    let controller!: ReturnType<typeof createAutoCraftController>;
    controller = createAutoCraftController({
      initialPolicy,
      executor: {
        execute: (request) => {
          executed.push(request);
          onExecute?.(request, controller);
        },
      },
      onStateChange: (state) => {
        uiStates.push(state);
      },
      schedule: (callback, delayMs) => setTimeout(callback, delayMs),
      clearScheduled: (handle) =>
        clearTimeout(handle as ReturnType<typeof setTimeout>),
    });

    return controller;
  }

  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('executes a supported skill recommendation once and waits for state advance', async () => {
    const controller = createHarness();

    controller.arm();
    controller.sync(buildSnapshot());

    expect(controller.getUiState().phase).toBe('ready');

    jest.advanceTimersByTime(100);
    await Promise.resolve();

    expect(executed).toHaveLength(1);
    expect(executed[0].kind).toBe('skill');
    expect(executed[0].actionName).toBe('Simple Fusion');
    expect(controller.getUiState().phase).toBe('waiting_for_state');

    controller.sync(
      buildSnapshot({
        stateFingerprint: 'fp-2',
        isCalculating: true,
        result: null,
      }),
    );

    expect(controller.getUiState().phase).toBe('calculating');
  });

  it('stops after the current action resolves when stop is requested mid-flight', async () => {
    const controller = createHarness();

    controller.arm();
    controller.sync(buildSnapshot());
    jest.advanceTimersByTime(100);
    await Promise.resolve();

    controller.requestStop('Stop requested by user.');

    expect(controller.getUiState().phase).toBe('stop_requested');
    expect(controller.getUiState().armed).toBe(true);

    controller.sync(
      buildSnapshot({
        stateFingerprint: 'fp-2',
        result: null,
      }),
    );

    expect(controller.getUiState().phase).toBe('stopped');
    expect(controller.getUiState().armed).toBe(false);
  });

  it('stops with an unsupported state when finish is disallowed by policy', () => {
    const controller = createHarness('techniquesOnly');

    controller.arm();
    controller.sync(
      buildSnapshot({
        result: {
          recommendation: null,
          alternativeSkills: [],
          isTerminal: false,
          targetsMet: true,
        } as any,
      }),
    );

    expect(executed).toHaveLength(0);
    expect(controller.getUiState().phase).toBe('unsupported');
    expect(controller.getUiState().armed).toBe(false);
  });

  it('can auto-finish when the selected policy allows it', async () => {
    const controller = createHarness('techniquesAndFinish');

    controller.arm();
    controller.sync(
      buildSnapshot({
        result: {
          recommendation: null,
          alternativeSkills: [],
          isTerminal: false,
          targetsMet: true,
        } as any,
      }),
    );

    jest.advanceTimersByTime(100);
    await Promise.resolve();

    expect(executed).toHaveLength(1);
    expect(executed[0].kind).toBe('finish');
    expect(executed[0].actionName).toBe('Finish Craft');
  });

  it('marks auto-finish complete after the craft state advances so it does not reissue finish', async () => {
    const controller = createHarness('techniquesAndFinish');

    controller.arm();
    controller.sync(
      buildSnapshot({
        result: {
          recommendation: null,
          alternativeSkills: [],
          isTerminal: false,
          targetsMet: true,
        } as any,
      }),
    );

    jest.advanceTimersByTime(100);
    await Promise.resolve();

    expect(executed).toHaveLength(1);
    expect(executed[0].kind).toBe('finish');
    expect(controller.getUiState().phase).toBe('waiting_for_state');

    controller.sync(
      buildSnapshot({
        stateFingerprint: 'fp-2',
        result: {
          recommendation: null,
          alternativeSkills: [],
          isTerminal: false,
          targetsMet: true,
        } as any,
      }),
    );

    expect(controller.getUiState().phase).toBe('completed');
    expect(controller.getUiState().armed).toBe(false);

    controller.sync(
      buildSnapshot({
        stateFingerprint: 'fp-3',
        result: {
          recommendation: null,
          alternativeSkills: [],
          isTerminal: false,
          targetsMet: true,
        } as any,
      }),
    );

    expect(executed).toHaveLength(1);
  });

  it('allows item actions only in the full action space policy', async () => {
    const controller = createHarness('fullActionSpace');

    controller.arm();
    controller.sync(
      buildSnapshot({
        result: {
          recommendation: {
            skill: {
              name: 'Use Spirit Dew',
              type: 'support',
              actionKind: 'item',
              itemName: 'spirit_dew',
            },
            expectedGains: { completion: 0, perfection: 0, stability: 12 },
            immediateGains: { completion: 0, perfection: 0, stability: 12 },
            effectiveCosts: { qi: 0, stability: 0 },
            score: 80,
            reasoning: 'Use an item to recover stability.',
          },
          alternativeSkills: [],
          isTerminal: false,
          targetsMet: false,
        } as any,
      }),
    );

    jest.advanceTimersByTime(100);
    await Promise.resolve();

    expect(executed).toHaveLength(1);
    expect(executed[0].kind).toBe('item');
  });

  it('treats finish-like recommendations without actionKind as finish for policy checks', () => {
    const controller = createHarness('techniquesOnly');

    controller.arm();
    controller.sync(
      buildSnapshot({
        result: {
          recommendation: {
            skill: {
              name: 'Finish Craft',
              key: '__finish_craft__',
              type: 'support',
            },
            expectedGains: { completion: 0, perfection: 0, stability: 0 },
            immediateGains: { completion: 0, perfection: 0, stability: 0 },
            effectiveCosts: { qi: 0, stability: 0 },
            score: 80,
            reasoning: 'End the craft now.',
          },
          alternativeSkills: [],
          isTerminal: false,
          targetsMet: false,
        } as any,
      }),
    );

    expect(executed).toHaveLength(0);
    expect(controller.getUiState().phase).toBe('unsupported');
    expect(controller.getUiState().armed).toBe(false);
  });

  it('stops techniques-only auto mode before a regular technique that would end the craft', () => {
    const controller = createHarness('techniquesOnly');

    controller.arm();
    controller.sync(
      buildSnapshot({
        result: {
          recommendation: {
            skill: {
              name: 'Wait',
              key: 'wait',
              type: 'support',
              actionKind: 'skill',
            },
            expectedGains: { completion: 0, perfection: 0, stability: 0 },
            immediateGains: { completion: 0, perfection: 0, stability: 0 },
            effectiveCosts: { qi: 0, stability: 10 },
            score: 80,
            reasoning: 'Advance the craft to resolution.',
            endsCraft: true,
          },
          alternativeSkills: [],
          isTerminal: false,
          targetsMet: false,
        } as any,
      }),
    );

    expect(executed).toHaveLength(0);
    expect(controller.getUiState().phase).toBe('unsupported');
    expect(controller.getUiState().armed).toBe(false);
    expect(controller.getUiState().statusTitle).toBe('Manual finish required');
  });

  it('stops techniques-only auto mode once a guaranteed finish is available even if the top line is still a skill', () => {
    const controller = createHarness('techniquesOnly');

    controller.arm();
    controller.sync(
      buildSnapshot({
        result: {
          recommendation: {
            skill: {
              name: 'Simple Refine',
              key: 'simple_refine',
              type: 'refine',
              actionKind: 'skill',
            },
            expectedGains: { completion: 0, perfection: 25, stability: 0 },
            immediateGains: { completion: 0, perfection: 25, stability: 0 },
            effectiveCosts: { qi: 0, stability: 10 },
            score: 90,
            reasoning: 'Push quality a bit higher first.',
          },
          alternativeSkills: [
            {
              skill: {
                name: 'Finish Craft',
                key: '__finish_craft__',
                type: 'support',
                actionKind: 'finish',
              },
              expectedGains: { completion: 0, perfection: 0, stability: 0 },
              immediateGains: { completion: 0, perfection: 0, stability: 0 },
              effectiveCosts: { qi: 0, stability: 0 },
              score: 80,
              projectedSuccessChance: 1,
              reasoning: 'Guaranteed craft success available now.',
            },
          ],
          isTerminal: false,
          targetsMet: false,
        } as any,
      }),
    );

    expect(executed).toHaveLength(0);
    expect(controller.getUiState().phase).toBe('unsupported');
    expect(controller.getUiState().armed).toBe(false);
    expect(controller.getUiState().statusTitle).toBe('Manual finish required');
  });

  it('resets to the off state when the craft session ends', () => {
    const controller = createHarness();

    controller.arm();
    controller.sync(buildSnapshot());
    controller.sync(
      buildSnapshot({
        craftSessionActive: false,
        craftActive: false,
        result: null,
        stateFingerprint: 'inactive',
      }),
    );

    expect(controller.getUiState().phase).toBe('off');
    expect(controller.getUiState().armed).toBe(false);
  });

  it('resends the action once and then pauses instead of erroring when the live state never advances', async () => {
    const controller = createHarness();

    controller.arm();
    controller.sync(buildSnapshot());
    jest.advanceTimersByTime(100);
    await Promise.resolve();

    jest.advanceTimersByTime(5000);
    await Promise.resolve();

    expect(executed).toHaveLength(2);
    expect(controller.getUiState().phase).toBe('waiting_for_state');

    jest.advanceTimersByTime(5000);
    await Promise.resolve();

    expect(executed).toHaveLength(2);
    expect(controller.getUiState().phase).toBe('armed');
    expect(controller.getUiState().armed).toBe(true);
  });

  it('continues the run when the live signature already advanced by the time the wait expires', async () => {
    const controller = createHarness();
    let dispatched = false;

    controller.arm();
    controller.sync(
      buildSnapshot({
        verifyRevision: () =>
          dispatched
            ? { kind: 'stale', changed: ['buffs'] }
            : { kind: 'match' },
      }),
    );

    jest.advanceTimersByTime(100);
    await Promise.resolve();
    dispatched = true;

    jest.advanceTimersByTime(5000);
    await Promise.resolve();

    const state = controller.getUiState();
    expect(executed).toHaveLength(1);
    expect(state.phase).toBe('armed');
    expect(state.armed).toBe(true);
    expect(state.tone).not.toBe('error');
    expect(state.statusTitle).toBe('Resyncing');
  });

  it('resends the awaited action exactly once when the live signature proves nothing landed', async () => {
    const controller = createHarness();

    controller.arm();
    controller.sync(
      buildSnapshot({ verifyRevision: () => ({ kind: 'match' }) }),
    );

    jest.advanceTimersByTime(100);
    await Promise.resolve();

    expect(executed).toHaveLength(1);

    jest.advanceTimersByTime(5000);
    await Promise.resolve();

    expect(executed).toHaveLength(2);
    expect(executed[1].actionName).toBe('Simple Fusion');
    expect(controller.getUiState().armed).toBe(true);
  });

  it('degrades to a recoverable pause when the resent action is also refused', async () => {
    const controller = createHarness();

    controller.arm();
    controller.sync(
      buildSnapshot({ verifyRevision: () => ({ kind: 'match' }) }),
    );

    jest.advanceTimersByTime(100);
    await Promise.resolve();

    jest.advanceTimersByTime(5000);
    await Promise.resolve();
    jest.advanceTimersByTime(5000);
    await Promise.resolve();

    const state = controller.getUiState();
    expect(executed).toHaveLength(2);
    expect(state.phase).toBe('armed');
    expect(state.armed).toBe(true);
    expect(state.tone).toBe('warning');
    expect(state.statusTitle).toBe('Auto mode paused');
    expect(state.statusDetail).toContain('Simple Fusion');
    expect(state.statusDetail).not.toContain('auto-use loadout');
  });

  it('does not time out when the live state advances synchronously during execution', async () => {
    const controller = createHarness(
      'techniquesOnly',
      (_request, liveController) => {
        liveController.sync(
          buildSnapshot({
            stateFingerprint: 'fp-2',
            isCalculating: true,
            result: null,
          }),
        );
      },
    );

    controller.arm();
    controller.sync(buildSnapshot());

    jest.advanceTimersByTime(100);
    await Promise.resolve();

    expect(executed).toHaveLength(1);
    expect(controller.getUiState().phase).toBe('calculating');

    jest.advanceTimersByTime(5000);
    await Promise.resolve();

    expect(controller.getUiState().phase).toBe('calculating');
    expect(controller.getUiState().armed).toBe(true);
  });

  it('updates the preferred policy while idle without arming auto mode', () => {
    const controller = createHarness();

    controller.setPolicy('fullActionSpace');

    expect(controller.getUiState().policy).toBe('fullActionSpace');
    expect(controller.getUiState().effectivePolicy).toBe('fullActionSpace');
    expect(controller.getUiState().armed).toBe(false);
  });

  describe('native auto-use coexistence', () => {
    const itemResult = {
      recommendation: {
        skill: {
          name: 'Use Qi Pill',
          type: 'support',
          actionKind: 'item',
          itemName: 'qi_pill',
        },
        expectedGains: { completion: 0, perfection: 0, stability: 0 },
        immediateGains: { completion: 0, perfection: 0, stability: 0 },
        effectiveCosts: { qi: 0, stability: 0 },
        score: 80,
        reasoning: 'Restore qi with an item.',
      },
      alternativeSkills: [],
      isTerminal: false,
      targetsMet: false,
    } as any;

    it('degrades the full action space policy with a visible reason', () => {
      const controller = createHarness('fullActionSpace');

      controller.arm();
      controller.sync(buildSnapshot({ nativeAutoUse: activeNativeAutoUse() }));

      const state = controller.getUiState();
      expect(state.policy).toBe('fullActionSpace');
      expect(state.effectivePolicy).toBe('techniquesAndFinish');
      expect(state.nativeAutoUseActive).toBe(true);
      expect(state.policyNotice).toContain('crafting auto-use loadout');
    });

    it('explains the downgrade in the idle status detail', () => {
      const controller = createHarness('fullActionSpace');

      controller.arm();
      controller.sync(
        buildSnapshot({
          result: null,
          nativeAutoUse: activeNativeAutoUse(),
        }),
      );

      expect(controller.getUiState().statusDetail).toContain(
        'crafting auto-use loadout',
      );
    });

    it('leaves the policy alone when no loadout is active', () => {
      const controller = createHarness('fullActionSpace');

      controller.arm();
      controller.sync(buildSnapshot());

      const state = controller.getUiState();
      expect(state.effectivePolicy).toBe('fullActionSpace');
      expect(state.nativeAutoUseActive).toBe(false);
      expect(state.policyNotice).toBeUndefined();
    });

    it('reflects a loadout toggled on mid-craft without restarting the craft', () => {
      const controller = createHarness('fullActionSpace');

      controller.arm();
      controller.sync(buildSnapshot());
      expect(controller.getUiState().effectivePolicy).toBe('fullActionSpace');

      controller.sync(
        buildSnapshot({
          stateFingerprint: 'fp-2',
          nativeAutoUse: activeNativeAutoUse(),
        }),
      );

      expect(controller.getUiState().armed).toBe(true);
      expect(controller.getUiState().effectivePolicy).toBe(
        'techniquesAndFinish',
      );
    });

    it('never dispatches an item action the loadout covers', async () => {
      const controller = createHarness('fullActionSpace');

      controller.arm();
      controller.sync(
        buildSnapshot({
          result: itemResult,
          nativeAutoUse: activeNativeAutoUse(),
        }),
      );

      jest.advanceTimersByTime(100);
      await Promise.resolve();

      expect(executed).toHaveLength(0);
      expect(controller.getUiState().phase).toBe('unsupported');
      expect(controller.getUiState().statusTitle).toBe(
        'Auto-use loadout owns that item',
      );
    });

    it('withholds even an uncovered item, because both sides share the per-turn budget', async () => {
      const controller = createHarness('fullActionSpace');

      controller.arm();
      controller.sync(
        buildSnapshot({
          result: itemResult,
          nativeAutoUse: activeNativeAutoUse(['focus_pill']),
        }),
      );

      jest.advanceTimersByTime(100);
      await Promise.resolve();

      expect(executed).toHaveLength(0);
      expect(controller.getUiState().statusTitle).toBe(
        'Auto-use loadout owns item usage',
      );
    });

    it('uses items again as soon as the loadout is switched off', async () => {
      const controller = createHarness('fullActionSpace');

      controller.arm();
      controller.sync(
        buildSnapshot({
          result: itemResult,
          nativeAutoUse: activeNativeAutoUse(),
        }),
      );
      jest.advanceTimersByTime(100);
      await Promise.resolve();
      expect(executed).toHaveLength(0);

      controller.arm();
      controller.sync(
        buildSnapshot({ stateFingerprint: 'fp-2', result: itemResult }),
      );
      jest.advanceTimersByTime(100);
      await Promise.resolve();

      expect(executed).toHaveLength(1);
      expect(executed[0].kind).toBe('item');
    });

    it('treats native consumption as a settle phase rather than the technique landing', async () => {
      const controller = createHarness('techniquesOnly');

      controller.arm();
      controller.sync(buildSnapshot({ nativeAutoUse: activeNativeAutoUse() }));

      jest.advanceTimersByTime(100);
      await Promise.resolve();

      expect(executed).toHaveLength(1);
      expect(controller.getUiState().phase).toBe('waiting_for_state');

      // A pill was consumed: the state moved but the craft step did not.
      controller.sync(
        buildSnapshot({
          stateFingerprint: 'fp-consumed',
          craftStep: 4,
          nativeAutoUse: activeNativeAutoUse(),
        }),
      );

      expect(controller.getUiState().phase).toBe('waiting_for_state');
      expect(controller.getUiState().statusTitle).toBe(
        'Auto-use items applied',
      );
      expect(executed).toHaveLength(1);

      // Now the technique itself lands and the step advances.
      controller.sync(
        buildSnapshot({
          stateFingerprint: 'fp-advanced',
          craftStep: 5,
          isCalculating: true,
          result: null,
          nativeAutoUse: activeNativeAutoUse(),
        }),
      );

      expect(controller.getUiState().phase).toBe('calculating');
      expect(executed).toHaveLength(1);
    });

    it('does not settle-wait forever when the step never advances', async () => {
      const controller = createHarness('techniquesOnly');

      controller.arm();
      controller.sync(buildSnapshot({ nativeAutoUse: activeNativeAutoUse() }));
      jest.advanceTimersByTime(100);
      await Promise.resolve();

      controller.sync(
        buildSnapshot({
          stateFingerprint: 'fp-consumed',
          craftStep: 4,
          nativeAutoUse: activeNativeAutoUse(),
        }),
      );

      jest.advanceTimersByTime(6100);
      await Promise.resolve();

      expect(controller.getUiState().phase).toBe('error');
      expect(controller.getUiState().armed).toBe(false);
    });
  });

  describe('dispatch-time state verification', () => {
    it('recalculates instead of executing when the live state moved', async () => {
      const controller = createHarness();

      controller.arm();
      controller.sync(
        buildSnapshot({
          verifyRevision: () => ({ kind: 'stale', changed: ['comp', 'tox'] }),
        }),
      );

      jest.advanceTimersByTime(100);
      await Promise.resolve();

      expect(executed).toHaveLength(0);
      const state = controller.getUiState();
      expect(state.armed).toBe(true);
      expect(state.phase).toBe('armed');
      expect(state.statusTitle).toBe('Recalculating');
      expect(state.statusDetail).toContain('comp, tox');
    });

    it('recalculates when the executor reports a stale state at dispatch time', async () => {
      const controller = createHarness('techniquesOnly', () => {
        throw new StaleCraftStateError(['harmonyData']);
      });

      controller.arm();
      controller.sync(buildSnapshot());
      jest.advanceTimersByTime(100);
      await Promise.resolve();

      const state = controller.getUiState();
      expect(state.armed).toBe(true);
      expect(state.statusTitle).toBe('Recalculating');
      expect(state.statusDetail).toContain('harmonyData');
    });

    it('re-executes once a fresh recommendation arrives after a stale abort', async () => {
      const controller = createHarness();

      controller.arm();
      controller.sync(
        buildSnapshot({
          verifyRevision: () => ({ kind: 'stale', changed: ['comp'] }),
        }),
      );
      jest.advanceTimersByTime(100);
      await Promise.resolve();
      expect(executed).toHaveLength(0);

      controller.sync(buildSnapshot({ stateFingerprint: 'fp-2' }));
      jest.advanceTimersByTime(100);
      await Promise.resolve();

      expect(executed).toHaveLength(1);
    });

    it('pauses without dispatching when the state cannot be verified', async () => {
      const controller = createHarness();

      controller.arm();
      controller.sync(
        buildSnapshot({
          verifyRevision: () => ({
            kind: 'unverifiable',
            reason: 'Live crafting player state is missing.',
          }),
        }),
      );

      jest.advanceTimersByTime(100);
      await Promise.resolve();

      expect(executed).toHaveLength(0);
      const state = controller.getUiState();
      expect(state.armed).toBe(true);
      expect(state.statusTitle).toBe('Auto mode paused');
      expect(state.statusDetail).toContain(
        'Live crafting player state is missing.',
      );
    });

    it('keeps re-checking a paused craft and resumes once it can be read', async () => {
      let readable = false;
      const controller = createHarness();

      controller.arm();
      const snapshot = buildSnapshot({
        verifyRevision: () =>
          readable
            ? { kind: 'match' }
            : {
                kind: 'unverifiable',
                reason: 'The game store returned no state.',
              },
      });
      controller.sync(snapshot);

      jest.advanceTimersByTime(100);
      await Promise.resolve();
      expect(executed).toHaveLength(0);
      expect(controller.getUiState().statusTitle).toBe('Auto mode paused');

      readable = true;
      jest.advanceTimersByTime(1000);
      await Promise.resolve();
      jest.advanceTimersByTime(100);
      await Promise.resolve();

      expect(executed).toHaveLength(1);
    });

    it('pauses when the executor reports an unverifiable state', async () => {
      const controller = createHarness('techniquesOnly', () => {
        throw new UnverifiableCraftStateError(
          'The game store returned no state.',
        );
      });

      controller.arm();
      controller.sync(buildSnapshot());
      jest.advanceTimersByTime(100);
      await Promise.resolve();

      const state = controller.getUiState();
      expect(state.armed).toBe(true);
      expect(state.statusTitle).toBe('Auto mode paused');
    });

    it('still stops with an error for an unrelated executor failure', async () => {
      const controller = createHarness('techniquesOnly', () => {
        throw new Error(
          'Could not find a visible game control for Simple Fusion.',
        );
      });

      controller.arm();
      controller.sync(buildSnapshot());
      jest.advanceTimersByTime(100);
      await Promise.resolve();

      const state = controller.getUiState();
      expect(state.phase).toBe('error');
      expect(state.armed).toBe(false);
    });
  });

  describe('auto-finish', () => {
    const autoFinishResult = {
      recommendation: {
        skill: {
          name: 'Simple Refine',
          type: 'refine',
          actionKind: 'skill',
        },
        expectedGains: { completion: 0, perfection: 10, stability: 0 },
        immediateGains: { completion: 0, perfection: 10, stability: 0 },
        effectiveCosts: { qi: 0, stability: 10 },
        score: 90,
        reasoning: 'Push quality higher.',
      },
      alternativeSkills: [],
      isTerminal: false,
      targetsMet: false,
      outcomeProjection: { willAutoFinish: true },
    } as any;

    it('stops with an auto-finish status instead of spending another turn', async () => {
      const controller = createHarness('techniquesAndFinish');

      controller.arm();
      controller.sync(buildSnapshot({ result: autoFinishResult }));

      jest.advanceTimersByTime(100);
      await Promise.resolve();

      expect(executed).toHaveLength(0);
      const state = controller.getUiState();
      expect(state.phase).toBe('completed');
      expect(state.statusTitle).toBe('Craft will auto-finish');
      expect(state.armed).toBe(false);
    });

    it('keeps acting while the auto-finish predicate does not hold', async () => {
      const controller = createHarness('techniquesAndFinish');

      controller.arm();
      controller.sync(
        buildSnapshot({
          result: {
            ...autoFinishResult,
            outcomeProjection: { willAutoFinish: false },
          } as any,
        }),
      );

      jest.advanceTimersByTime(100);
      await Promise.resolve();

      expect(executed).toHaveLength(1);
    });
  });
});
