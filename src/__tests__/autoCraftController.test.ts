import {
  createAutoCraftController,
  type AutoCraftExecutionRequest,
  type AutoCraftRuntimeSnapshot,
} from '../modContent/autoCraftController';
import {
  type AutoCraftPolicy,
  type AutoCraftUiState,
} from '../settings/autoCraft';

function buildSnapshot(
  overrides: Partial<AutoCraftRuntimeSnapshot> = {},
): AutoCraftRuntimeSnapshot {
  return {
    craftSessionActive: true,
    craftActive: true,
    isCalculating: false,
    stateFingerprint: 'fp-1',
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

  it('stops with an error if the live state does not advance after execution', async () => {
    const controller = createHarness();

    controller.arm();
    controller.sync(buildSnapshot());
    jest.advanceTimersByTime(100);
    await Promise.resolve();

    jest.advanceTimersByTime(5000);
    await Promise.resolve();

    expect(controller.getUiState().phase).toBe('error');
    expect(controller.getUiState().armed).toBe(false);
  });

  it('does not time out when the live state advances synchronously during execution', async () => {
    const controller = createHarness('techniquesOnly', (_request, liveController) => {
      liveController.sync(
        buildSnapshot({
          stateFingerprint: 'fp-2',
          isCalculating: true,
          result: null,
        }),
      );
    });

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
    expect(controller.getUiState().armed).toBe(false);
  });
});
