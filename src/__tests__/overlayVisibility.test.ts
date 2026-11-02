import { isElementVisible } from '../modContent/overlayMount';

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
