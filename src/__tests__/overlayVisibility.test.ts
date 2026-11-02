import type { Root } from 'react-dom/client';
import {
  isElementVisible,
  unmountOverlayRoot,
} from '../modContent/overlayMount';

describe('game-control visibility used by automatic crafting', () => {
  const originalWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');

  beforeEach(() => {
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {
        innerWidth: 975,
        innerHeight: 768,
        getComputedStyle: () => ({
          display: 'block',
          visibility: 'visible',
          opacity: '1',
        }),
      },
    });
  });

  afterEach(() => {
    if (originalWindow) {
      Object.defineProperty(globalThis, 'window', originalWindow);
    } else {
      Reflect.deleteProperty(globalThis, 'window');
    }
  });

  function gameControl({
    ariaHidden = false,
    hiddenAncestor = false,
    ariaHiddenAncestor = false,
  } = {}): Element {
    return {
      isConnected: true,
      hidden: false,
      getAttribute: (attribute: string) =>
        attribute === 'aria-hidden' && ariaHidden ? 'true' : null,
      closest: (selector: string) =>
        (selector === '[hidden]' && hiddenAncestor) ||
        (selector === '[aria-hidden="true"]' && ariaHiddenAncestor)
          ? {}
          : null,
      getClientRects: () => [
        { top: 100, left: 20, right: 120, bottom: 140, width: 100, height: 40 },
      ],
    } as unknown as Element;
  }

  it('accepts an onscreen game control without hidden ancestors', () => {
    expect(isElementVisible(gameControl())).toBe(true);
  });

  it.each([
    { ariaHidden: true },
    { hiddenAncestor: true },
    { ariaHiddenAncestor: true },
  ])('rejects game controls hidden by %j', (hidden) => {
    expect(isElementVisible(gameControl(hidden))).toBe(false);
  });
});

describe('host overlay hiding', () => {
  function host({ focusInOverlay = true } = {}) {
    const events: string[] = [];
    const body = {};
    const document = { activeElement: focusInOverlay ? null : body };
    const opener = {
      blur: jest.fn(() => {
        events.push('blur');
        document.activeElement = body;
      }),
    };
    if (focusInOverlay) document.activeElement = opener;
    const container = {
      style: { display: 'block' },
      ownerDocument: document,
      contains: (element: unknown) => element === opener,
    };
    const root = {
      unmount: jest.fn(() => {
        events.push(`unmount:${container.style.display}`);
        // Model modal cleanup trying to restore the opener before it is removed.
        if (focusInOverlay) document.activeElement = opener;
      }),
    };
    return { container, root, opener, document, body, events };
  }

  it('hides and synchronously unmounts before releasing restored overlay focus', () => {
    const { container, root, opener, document, body, events } = host();
    unmountOverlayRoot(
      root as unknown as Root,
      container as unknown as HTMLElement,
    );
    expect(root.unmount).toHaveBeenCalledTimes(1);
    expect(container.style.display).toBe('none');
    expect(events).toEqual(['unmount:none', 'blur']);
    expect(opener.blur).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(body);
  });

  it('preserves focus already outside the overlay', () => {
    const { container, root, opener, document, body } = host({
      focusInOverlay: false,
    });
    unmountOverlayRoot(
      root as unknown as Root,
      container as unknown as HTMLElement,
    );
    expect(root.unmount).toHaveBeenCalledTimes(1);
    expect(container.style.display).toBe('none');
    expect(opener.blur).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(body);
  });

  it('releases overlay focus even without a mounted root and tolerates repeat hides', () => {
    const { container, opener, document, body } = host();
    unmountOverlayRoot(null, container as unknown as HTMLElement);
    unmountOverlayRoot(null, container as unknown as HTMLElement);
    expect(container.style.display).toBe('none');
    expect(opener.blur).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(body);
  });

  it('unmounts a root even if its host container is already gone', () => {
    const { root } = host();
    unmountOverlayRoot(root as unknown as Root, null);
    expect(root.unmount).toHaveBeenCalledTimes(1);
    expect(() => unmountOverlayRoot(null, null)).not.toThrow();
  });
});
