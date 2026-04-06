import {
  createModApiStateStore,
  extractActiveCraftingState,
  getCurrentScreenKey,
  hasStateBackedCraftingUi,
} from '../modContent/craftingStoreState';

describe('crafting store state helpers', () => {
  describe('createModApiStateStore', () => {
    it('returns null when documented state APIs are unavailable', () => {
      expect(createModApiStateStore({})).toBeNull();
    });

    it('returns null until the ModAPI store snapshot is available', () => {
      expect(
        createModApiStateStore({
          subscribe: jest.fn(),
          getGameStateSnapshot: () => null,
        }),
      ).toBeNull();
    });

    it('wraps the documented ModAPI state APIs as a store-like adapter', () => {
      const state = { screen: { screen: 'recipe' } };
      const unsubscribe = jest.fn();
      const subscribe = jest.fn(() => unsubscribe);
      const store = createModApiStateStore({
        subscribe,
        getGameStateSnapshot: () => state,
      });

      expect(store?.getState()).toBe(state);

      const listener = jest.fn();
      const stop = store?.subscribe(listener);

      expect(subscribe).toHaveBeenCalledWith(listener);
      stop?.();
      expect(unsubscribe).toHaveBeenCalledTimes(1);
    });
  });

  describe('extractActiveCraftingState', () => {
    it('prefers the modern game.crafting slice when present', () => {
      const crafting = {
        player: { name: 'player' },
        progressState: { step: 1 },
      };
      expect(
        extractActiveCraftingState({
          game: { crafting },
          crafting: { player: { stale: true } },
        }),
      ).toBe(crafting);
    });

    it('falls back to the root crafting slice when the modern one is empty', () => {
      const crafting = {
        player: { name: 'player' },
        progressState: { step: 1 },
      };
      expect(
        extractActiveCraftingState({
          game: { crafting: {} },
          crafting,
        }),
      ).toBe(crafting);
    });
  });

  describe('screen-backed craft visibility', () => {
    it('reads the current root screen key', () => {
      expect(getCurrentScreenKey({ screen: { screen: 'recipe' } })).toBe(
        'recipe',
      );
      expect(
        getCurrentScreenKey({ game: { screen: { screen: 'library' } } }),
      ).toBe('library');
    });

    it('accepts the active recipe screen with live crafting data', () => {
      expect(
        hasStateBackedCraftingUi({
          screen: { screen: 'recipe' },
          game: {
            crafting: {
              player: { stats: {} },
              progressState: { step: 12 },
            },
          },
        }),
      ).toBe(true);
    });

    it('rejects non-recipe screens even if a stale crafting slice exists', () => {
      expect(
        hasStateBackedCraftingUi({
          screen: { screen: 'library' },
          game: {
            crafting: {
              player: { stats: {} },
              progressState: { step: 12 },
            },
          },
        }),
      ).toBe(false);
    });
  });
});
