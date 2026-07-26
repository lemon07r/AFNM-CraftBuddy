import { createDomAutoCraftExecutor } from '../modContent/autoCraftExecutor';
import {
  NativeAutoUseConflictError,
  NativeAutoUseUnreachableError,
  StaleCraftStateError,
  UnverifiableCraftStateError,
} from '../modContent/autoCraftErrors';
import type { AutoCraftRuntimeSnapshot } from '../modContent/autoCraftController';
import {
  INACTIVE_NATIVE_AUTO_USE,
  type NativeAutoUseStatus,
} from '../modContent/nativeAutoUse';

function activeNativeAutoUse(
  coveredItemNames: string[] = ['qi_pill'],
): NativeAutoUseStatus {
  return {
    active: true,
    slotCount: coveredItemNames.length,
    coveredItemNames: new Set(coveredItemNames),
    pillsPerRound: 1,
    availableToxicity: 50,
    trainingMode: false,
  };
}

function buildExecutorSnapshot(
  overrides: Partial<AutoCraftRuntimeSnapshot> = {},
): AutoCraftRuntimeSnapshot {
  return {
    craftSessionActive: true,
    craftActive: true,
    isCalculating: false,
    result: null,
    stateFingerprint: 'fp-1',
    craftStateRevision: 1,
    nativeAutoUse: INACTIVE_NATIVE_AUTO_USE,
    verifyRevision: () => ({ kind: 'match' }),
    ...overrides,
  };
}

class HTMLElementMock {
  textContent: string;
  className = '';
  tabIndex = 0;
  style = { backgroundImage: 'none' };
  parentElement: HTMLElementMock | null = null;
  onclick: ((event?: unknown) => void) | null = null;
  private readonly attributes = new Map<string, string>();
  dispatchEvent = jest.fn(() => true);
  focus = jest.fn();
  click = jest.fn();

  constructor(textContent = '') {
    this.textContent = textContent;
  }

  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }

  hasAttribute(name: string): boolean {
    return this.attributes.has(name);
  }

  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }

  matches(selector: string): boolean {
    return selector.includes('button') || selector.includes('[role="button"]');
  }

  getBoundingClientRect() {
    return {
      width: 120,
      height: 40,
      left: 0,
      top: 0,
    };
  }
}

describe('autoCraftExecutor', () => {
  let originalDocument: typeof global.document | undefined;
  let originalWindow: typeof global.window | undefined;
  let originalHTMLElement: typeof global.HTMLElement | undefined;
  let originalMouseEvent: typeof global.MouseEvent | undefined;
  let originalPointerEvent: typeof global.PointerEvent | undefined;

  beforeEach(() => {
    originalDocument = (global as any).document;
    originalWindow = (global as any).window;
    originalHTMLElement = (global as any).HTMLElement;
    originalMouseEvent = (global as any).MouseEvent;
    originalPointerEvent = (global as any).PointerEvent;

    (global as any).HTMLElement = HTMLElementMock;
    (global as any).MouseEvent = class MouseEventMock {
      type: string;

      constructor(type: string) {
        this.type = type;
      }
    };
    (global as any).PointerEvent = undefined;
    (global as any).document = {
      activeElement: null,
    };
    (global as any).window = {
      getComputedStyle: jest.fn(() => ({
        cursor: 'pointer',
        backgroundImage: 'none',
      })),
    };
  });

  afterEach(() => {
    if (typeof originalDocument === 'undefined') {
      delete (global as any).document;
    } else {
      (global as any).document = originalDocument;
    }

    if (typeof originalWindow === 'undefined') {
      delete (global as any).window;
    } else {
      (global as any).window = originalWindow;
    }

    if (typeof originalHTMLElement === 'undefined') {
      delete (global as any).HTMLElement;
    } else {
      (global as any).HTMLElement = originalHTMLElement;
    }

    if (typeof originalMouseEvent === 'undefined') {
      delete (global as any).MouseEvent;
    } else {
      (global as any).MouseEvent = originalMouseEvent;
    }

    if (typeof originalPointerEvent === 'undefined') {
      delete (global as any).PointerEvent;
    } else {
      (global as any).PointerEvent = originalPointerEvent;
    }
  });

  function createRoot(elements: HTMLElementMock[] = []) {
    return {
      querySelectorAll: jest.fn((selector: string) => {
        if (selector === '*' || selector === 'button, [role="button"]') {
          return elements;
        }
        return [];
      }),
    };
  }

  it('dispatches live technique payloads through the crafting store for skill actions', () => {
    const liveTechnique = {
      name: 'Simple Fusion',
      type: 'fusion',
      poolCost: 0,
      stabilityCost: 10,
      currentCooldown: 0,
    };
    const dispatch = jest.fn();
    const rootElement = createRoot();

    const executor = createDomAutoCraftExecutor({
      getRootElement: () => rootElement as any,
      getStore: () => ({
        dispatch,
        getState: () => ({
          crafting: {
            player: {
              techniques: [liveTechnique],
            },
          },
        }),
      }),
      isElementVisible: () => true,
      isIgnoredElement: () => false,
    });

    executor.execute(
      {
        kind: 'skill',
        actionName: 'Simple Fusion',
        skill: {
          name: 'Simple Fusion',
        } as any,
        reason: 'Best completion move.',
      },
      buildExecutorSnapshot(),
    );

    expect(dispatch).toHaveBeenCalledWith({
      type: 'crafting/executeTechnique',
      payload: liveTechnique,
    });
    expect(rootElement.querySelectorAll).not.toHaveBeenCalled();
  });

  it('maps finish requests to the native Wait technique in the crafting store', () => {
    const dispatch = jest.fn();
    const rootElement = createRoot();

    const executor = createDomAutoCraftExecutor({
      getRootElement: () => rootElement as any,
      getStore: () => ({
        dispatch,
      }),
      isElementVisible: () => true,
      isIgnoredElement: () => false,
    });

    executor.execute(
      {
        kind: 'finish',
        actionName: 'Finish Craft',
        reason: 'Guaranteed craft success available now.',
      },
      buildExecutorSnapshot(),
    );

    expect(dispatch).toHaveBeenCalledWith({
      type: 'crafting/executeTechnique',
      payload: expect.objectContaining({
        name: 'Wait',
        type: 'support',
        poolCost: 0,
        stabilityCost: 10,
      }),
    });
    expect(rootElement.querySelectorAll).not.toHaveBeenCalled();
  });

  it('falls back to the visible Wait control when no crafting store is available', () => {
    const waitButton = new HTMLElementMock('Wait');
    const rootElement = createRoot([waitButton]);

    const executor = createDomAutoCraftExecutor({
      getRootElement: () => rootElement as any,
      isElementVisible: () => true,
      isIgnoredElement: () => false,
    });

    executor.execute(
      {
        kind: 'finish',
        actionName: 'Finish Craft',
        reason: 'Guaranteed craft success available now.',
      },
      buildExecutorSnapshot(),
    );

    expect(waitButton.click).toHaveBeenCalledTimes(1);
  });

  describe('dispatch-time state verification', () => {
    function createStoreExecutor(dispatch: jest.Mock) {
      const rootElement = createRoot();
      return {
        rootElement,
        executor: createDomAutoCraftExecutor({
          getRootElement: () => rootElement as any,
          getStore: () => ({
            dispatch,
            getState: () => ({
              crafting: { player: { techniques: [{ name: 'Simple Fusion' }] } },
            }),
          }),
          isElementVisible: () => true,
          isIgnoredElement: () => false,
        }),
      };
    }

    const request = {
      kind: 'skill' as const,
      actionName: 'Simple Fusion',
      skill: { name: 'Simple Fusion' } as any,
      reason: 'Best completion move.',
    };

    it('throws StaleCraftStateError and dispatches nothing when the craft moved', () => {
      const dispatch = jest.fn();
      const { executor } = createStoreExecutor(dispatch);

      expect(() =>
        executor.execute(
          request,
          buildExecutorSnapshot({
            verifyRevision: () => ({
              kind: 'stale',
              changed: ['comp', 'tox'],
            }),
          }),
        ),
      ).toThrow(StaleCraftStateError);
      expect(dispatch).not.toHaveBeenCalled();
    });

    it('reports which fields changed on the stale error', () => {
      const dispatch = jest.fn();
      const { executor } = createStoreExecutor(dispatch);

      try {
        executor.execute(
          request,
          buildExecutorSnapshot({
            verifyRevision: () => ({ kind: 'stale', changed: ['harmonyData'] }),
          }),
        );
        throw new Error('expected a stale error');
      } catch (error) {
        expect(error).toBeInstanceOf(StaleCraftStateError);
        expect((error as StaleCraftStateError).changed).toEqual([
          'harmonyData',
        ]);
      }
    });

    it('throws UnverifiableCraftStateError and dispatches nothing when state cannot be read', () => {
      const dispatch = jest.fn();
      const { executor } = createStoreExecutor(dispatch);

      expect(() =>
        executor.execute(
          request,
          buildExecutorSnapshot({
            verifyRevision: () => ({
              kind: 'unverifiable',
              reason: 'Live crafting player state is missing.',
            }),
          }),
        ),
      ).toThrow(UnverifiableCraftStateError);
      expect(dispatch).not.toHaveBeenCalled();
    });

    it('executes when the snapshot verifies as a match', () => {
      const dispatch = jest.fn();
      const { executor } = createStoreExecutor(dispatch);

      executor.execute(request, buildExecutorSnapshot());

      expect(dispatch).toHaveBeenCalledTimes(1);
    });
  });

  describe('native auto-use execution path', () => {
    const request = {
      kind: 'skill' as const,
      actionName: 'Simple Fusion',
      skill: { name: 'Simple Fusion' } as any,
      reason: 'Best completion move.',
    };

    it('clicks the in-game control instead of dispatching so the pre-technique hook runs', () => {
      const techniqueButton = new HTMLElementMock('Simple Fusion');
      const rootElement = createRoot([techniqueButton]);
      const dispatch = jest.fn();

      const executor = createDomAutoCraftExecutor({
        getRootElement: () => rootElement as any,
        getStore: () => ({
          dispatch,
          getState: () => ({
            crafting: { player: { techniques: [{ name: 'Simple Fusion' }] } },
          }),
        }),
        isElementVisible: () => true,
        isIgnoredElement: () => false,
      });

      executor.execute(
        request,
        buildExecutorSnapshot({ nativeAutoUse: activeNativeAutoUse() }),
      );

      expect(techniqueButton.click).toHaveBeenCalledTimes(1);
      expect(dispatch).not.toHaveBeenCalled();
    });

    it('routes the synthesized finish through the control too', () => {
      const waitButton = new HTMLElementMock('Wait');
      const rootElement = createRoot([waitButton]);
      const dispatch = jest.fn();

      const executor = createDomAutoCraftExecutor({
        getRootElement: () => rootElement as any,
        getStore: () => ({ dispatch }),
        isElementVisible: () => true,
        isIgnoredElement: () => false,
      });

      executor.execute(
        {
          kind: 'finish',
          actionName: 'Finish Craft',
          reason: 'Advance the craft to resolution.',
        },
        buildExecutorSnapshot({ nativeAutoUse: activeNativeAutoUse() }),
      );

      expect(waitButton.click).toHaveBeenCalledTimes(1);
      expect(dispatch).not.toHaveBeenCalled();
    });

    it('refuses to bypass the loadout when no control can be found', () => {
      const rootElement = createRoot();
      const dispatch = jest.fn();

      const executor = createDomAutoCraftExecutor({
        getRootElement: () => rootElement as any,
        getStore: () => ({
          dispatch,
          getState: () => ({
            crafting: { player: { techniques: [{ name: 'Simple Fusion' }] } },
          }),
        }),
        isElementVisible: () => true,
        isIgnoredElement: () => false,
      });

      expect(() =>
        executor.execute(
          request,
          buildExecutorSnapshot({ nativeAutoUse: activeNativeAutoUse() }),
        ),
      ).toThrow(NativeAutoUseUnreachableError);
      expect(dispatch).not.toHaveBeenCalled();
    });

    it('refuses an item action the loadout already covers', () => {
      const itemButton = new HTMLElementMock('Use Qi Pill');
      const rootElement = createRoot([itemButton]);

      const executor = createDomAutoCraftExecutor({
        getRootElement: () => rootElement as any,
        isElementVisible: () => true,
        isIgnoredElement: () => false,
      });

      expect(() =>
        executor.execute(
          {
            kind: 'item',
            actionName: 'Use Qi Pill',
            skill: { name: 'Use Qi Pill', itemName: 'qi_pill' } as any,
            reason: 'Recover qi.',
          },
          buildExecutorSnapshot({ nativeAutoUse: activeNativeAutoUse() }),
        ),
      ).toThrow(NativeAutoUseConflictError);
      expect(itemButton.click).not.toHaveBeenCalled();
    });

    it('still allows an item the loadout does not cover', () => {
      const itemButton = new HTMLElementMock('Use Focus Pill');
      const rootElement = createRoot([itemButton]);

      const executor = createDomAutoCraftExecutor({
        getRootElement: () => rootElement as any,
        isElementVisible: () => true,
        isIgnoredElement: () => false,
      });

      executor.execute(
        {
          kind: 'item',
          actionName: 'Use Focus Pill',
          skill: { name: 'Use Focus Pill', itemName: 'focus_pill' } as any,
          reason: 'Buff control.',
        },
        buildExecutorSnapshot({ nativeAutoUse: activeNativeAutoUse() }),
      );

      expect(itemButton.click).toHaveBeenCalledTimes(1);
    });
  });
});
