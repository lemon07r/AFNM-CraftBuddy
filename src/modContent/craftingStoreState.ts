export interface StateStoreLike<TState = unknown> {
  getState: () => TState;
  subscribe: (listener: () => void) => () => void;
}

interface ModApiStateAccessLike {
  subscribe?: (listener: () => void) => unknown;
  getGameStateSnapshot?: () => unknown;
}

function toUnsubscribe(result: unknown): () => void {
  return typeof result === 'function' ? (result as () => void) : () => {};
}

export function createModApiStateStore(
  modApi: ModApiStateAccessLike | null | undefined,
): StateStoreLike | null {
  if (
    typeof modApi?.subscribe !== 'function' ||
    typeof modApi?.getGameStateSnapshot !== 'function'
  ) {
    return null;
  }

  const snapshot = modApi.getGameStateSnapshot();
  if (!snapshot) {
    return null;
  }

  return {
    getState: () => modApi.getGameStateSnapshot?.() ?? null,
    subscribe: (listener: () => void) =>
      toUnsubscribe(modApi.subscribe?.(listener)),
  };
}

export function extractActiveCraftingState(state: any): any | null {
  const gameHasCraftingSlice =
    !!state?.game &&
    Object.prototype.hasOwnProperty.call(state.game, 'crafting');

  if (gameHasCraftingSlice) {
    const gameCrafting = state.game?.crafting;
    if (gameCrafting?.player && gameCrafting?.progressState) {
      return gameCrafting;
    }

    const rootCrafting = state?.crafting;
    if (rootCrafting?.player && rootCrafting?.progressState) {
      return rootCrafting;
    }

    return null;
  }

  const rootCrafting = state?.crafting;
  if (rootCrafting?.player && rootCrafting?.progressState) {
    return rootCrafting;
  }

  return null;
}

export function getCurrentScreenKey(state: any): string | undefined {
  const candidates = [state?.screen?.screen, state?.game?.screen?.screen];
  return candidates.find(
    (candidate): candidate is string =>
      typeof candidate === 'string' && candidate.length > 0,
  );
}

export function hasStateBackedCraftingUi(state: any): boolean {
  return (
    getCurrentScreenKey(state) === 'recipe' &&
    !!extractActiveCraftingState(state)
  );
}
