import { createDomAutoCraftExecutor } from '../modContent/autoCraftExecutor';

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
      {} as any,
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
      {} as any,
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
      {} as any,
    );

    expect(waitButton.click).toHaveBeenCalledTimes(1);
  });
});
