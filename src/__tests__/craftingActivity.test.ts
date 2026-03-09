import {
  hasReliableCraftingActivity,
  shouldPrimeCraftSessionFromRecipeDifficultyHook,
  shouldAcceptReduxCraftingState,
} from '../modContent/craftingActivity';

describe('crafting activity guards', () => {
  describe('hasReliableCraftingActivity', () => {
    it('rejects hidden crafting data before the session has confirmed a craft entry', () => {
      expect(
        hasReliableCraftingActivity({
          hasCraftingData: true,
          hasVisibleCraftingUi: false,
          missingVisibleCraftingUiPolls: 1,
          hiddenUiGracePolls: 3,
          hasConfirmedCraftSession: false,
        }),
      ).toBe(false);
    });

    it('accepts visible crafting UI immediately', () => {
      expect(
        hasReliableCraftingActivity({
          hasCraftingData: true,
          hasVisibleCraftingUi: true,
          missingVisibleCraftingUiPolls: 2,
          hiddenUiGracePolls: 3,
          hasConfirmedCraftSession: false,
        }),
      ).toBe(true);
    });

    it('allows a short hidden-ui grace period after a confirmed craft session', () => {
      expect(
        hasReliableCraftingActivity({
          hasCraftingData: true,
          hasVisibleCraftingUi: false,
          missingVisibleCraftingUiPolls: 2,
          hiddenUiGracePolls: 3,
          hasConfirmedCraftSession: true,
        }),
      ).toBe(true);
    });

    it('ends the hidden-ui grace period once the threshold is exhausted', () => {
      expect(
        hasReliableCraftingActivity({
          hasCraftingData: true,
          hasVisibleCraftingUi: false,
          missingVisibleCraftingUiPolls: 3,
          hiddenUiGracePolls: 3,
          hasConfirmedCraftSession: true,
        }),
      ).toBe(false);
    });
  });

  describe('shouldAcceptReduxCraftingState', () => {
    it('rejects stale hidden Redux crafting state on boot', () => {
      expect(
        shouldAcceptReduxCraftingState({
          hasCraftingState: true,
          hasVisibleCraftingUi: false,
          hasConfirmedCraftSession: false,
          isCraftStartPending: false,
          missingVisibleCraftingUiPolls: 0,
          hiddenUiGracePolls: 3,
        }),
      ).toBe(false);
    });

    it('accepts hidden Redux crafting state while craft start is pending', () => {
      expect(
        shouldAcceptReduxCraftingState({
          hasCraftingState: true,
          hasVisibleCraftingUi: false,
          hasConfirmedCraftSession: false,
          isCraftStartPending: true,
          missingVisibleCraftingUiPolls: 0,
          hiddenUiGracePolls: 3,
        }),
      ).toBe(true);
    });

    it('accepts visible crafting state immediately', () => {
      expect(
        shouldAcceptReduxCraftingState({
          hasCraftingState: true,
          hasVisibleCraftingUi: true,
          hasConfirmedCraftSession: false,
          isCraftStartPending: false,
          missingVisibleCraftingUiPolls: 0,
          hiddenUiGracePolls: 3,
        }),
      ).toBe(true);
    });

    it('allows hidden Redux crafting state only during the post-visibility grace window', () => {
      expect(
        shouldAcceptReduxCraftingState({
          hasCraftingState: true,
          hasVisibleCraftingUi: false,
          hasConfirmedCraftSession: true,
          isCraftStartPending: false,
          missingVisibleCraftingUiPolls: 2,
          hiddenUiGracePolls: 3,
        }),
      ).toBe(true);
      expect(
        shouldAcceptReduxCraftingState({
          hasCraftingState: true,
          hasVisibleCraftingUi: false,
          hasConfirmedCraftSession: true,
          isCraftStartPending: false,
          missingVisibleCraftingUiPolls: 3,
          hiddenUiGracePolls: 3,
        }),
      ).toBe(false);
    });
  });

  describe('shouldPrimeCraftSessionFromRecipeDifficultyHook', () => {
    it('rejects recipe difficulty hooks before crafting UI is visible', () => {
      expect(
        shouldPrimeCraftSessionFromRecipeDifficultyHook({
          hasVisibleCraftingUi: false,
          hasConfirmedCraftSession: false,
        }),
      ).toBe(false);
    });

    it('accepts recipe difficulty hooks once crafting UI is visible', () => {
      expect(
        shouldPrimeCraftSessionFromRecipeDifficultyHook({
          hasVisibleCraftingUi: true,
          hasConfirmedCraftSession: false,
        }),
      ).toBe(true);
    });

    it('accepts recipe difficulty hooks for an already confirmed craft session', () => {
      expect(
        shouldPrimeCraftSessionFromRecipeDifficultyHook({
          hasVisibleCraftingUi: false,
          hasConfirmedCraftSession: true,
        }),
      ).toBe(true);
    });
  });
});
