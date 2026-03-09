import {
  hasCraftingActionCue,
  hasVisibleCraftingUiSignals,
} from '../modContent/craftingUiDetection';

describe('crafting UI detection', () => {
  describe('hasCraftingActionCue', () => {
    it('accepts concrete crafting technique labels', () => {
      expect(
        hasCraftingActionCue({
          text: 'Forceful Stabilize',
          className: 'technique-card',
        }),
      ).toBe(true);
    });

    it('rejects generic location labels that mention crafting', () => {
      expect(
        hasCraftingActionCue({
          text: 'Crafting Hall',
          className: 'world-map-location crafting-hall',
          ariaLabel: 'Open Crafting Hall',
        }),
      ).toBe(false);
    });

    it('accepts the finish craft control explicitly', () => {
      expect(
        hasCraftingActionCue({
          text: 'Finish Craft',
        }),
      ).toBe(true);
    });
  });

  describe('hasVisibleCraftingUiSignals', () => {
    it('rejects non-craft screens that only have generic crafting labels', () => {
      expect(
        hasVisibleCraftingUiSignals({
          hasNamedCraftingActionCue: false,
          hasProgressSignals: false,
          hasDomProgressValues: false,
          visibleButtonCount: 3,
        }),
      ).toBe(false);
    });

    it('accepts named crafting controls when live progress is visible', () => {
      expect(
        hasVisibleCraftingUiSignals({
          hasNamedCraftingActionCue: true,
          hasProgressSignals: true,
          hasDomProgressValues: false,
          visibleButtonCount: 1,
        }),
      ).toBe(true);
    });

    it('accepts icon-only action rows when multiple controls and progress readouts are visible', () => {
      expect(
        hasVisibleCraftingUiSignals({
          hasNamedCraftingActionCue: false,
          hasProgressSignals: true,
          hasDomProgressValues: false,
          visibleButtonCount: 4,
        }),
      ).toBe(true);
    });

    it('rejects stale DOM progress text when only generic visible buttons remain', () => {
      expect(
        hasVisibleCraftingUiSignals({
          hasNamedCraftingActionCue: false,
          hasProgressSignals: false,
          hasDomProgressValues: true,
          visibleButtonCount: 4,
        }),
      ).toBe(false);
    });
  });
});
