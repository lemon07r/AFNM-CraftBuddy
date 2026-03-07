export interface ReliableCraftingActivityParams {
  hasCraftingData: boolean;
  hasVisibleCraftingUi: boolean;
  missingVisibleCraftingUiPolls: number;
  hiddenUiGracePolls: number;
  hasConfirmedCraftSession: boolean;
}

/**
 * Hidden Redux crafting data is only trustworthy after the current runtime
 * session has observed a real craft-entry signal (visible UI or lifecycle
 * hook). Otherwise a persisted crafting slice can incorrectly look "active"
 * while the player is still at the main menu.
 */
export function hasReliableCraftingActivity({
  hasCraftingData,
  hasVisibleCraftingUi,
  missingVisibleCraftingUiPolls,
  hiddenUiGracePolls,
  hasConfirmedCraftSession,
}: ReliableCraftingActivityParams): boolean {
  if (!hasCraftingData) {
    return false;
  }

  if (hasVisibleCraftingUi) {
    return true;
  }

  if (!hasConfirmedCraftSession) {
    return false;
  }

  return missingVisibleCraftingUiPolls < hiddenUiGracePolls;
}

export interface ReduxCraftingStateAcceptanceParams {
  hasCraftingState: boolean;
  hasVisibleCraftingUi: boolean;
  hasConfirmedCraftSession: boolean;
  isCraftStartPending: boolean;
}

/**
 * The Redux subscription should ignore hidden crafting state until the current
 * session has positively confirmed that a craft actually started.
 */
export function shouldAcceptReduxCraftingState({
  hasCraftingState,
  hasVisibleCraftingUi,
  hasConfirmedCraftSession,
  isCraftStartPending,
}: ReduxCraftingStateAcceptanceParams): boolean {
  if (!hasCraftingState) {
    return false;
  }

  return (
    hasVisibleCraftingUi || hasConfirmedCraftSession || isCraftStartPending
  );
}
