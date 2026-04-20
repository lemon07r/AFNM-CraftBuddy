import {
  hasCraftingActionCue,
  hasVisibleCraftingUiSignals,
  isRenderableOnscreenElement,
  parseCraftingProgressPair,
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
          hasDomProgressValues: false,
          visibleProgressSignalCount: 0,
          visibleButtonCount: 3,
        }),
      ).toBe(false);
    });

    it('accepts named crafting controls when live progress is visible', () => {
      expect(
        hasVisibleCraftingUiSignals({
          hasNamedCraftingActionCue: true,
          hasDomProgressValues: false,
          visibleProgressSignalCount: 2,
          visibleButtonCount: 1,
        }),
      ).toBe(true);
    });

    it('accepts icon-only action rows when multiple controls and progress readouts are visible', () => {
      expect(
        hasVisibleCraftingUiSignals({
          hasNamedCraftingActionCue: false,
          visibleProgressSignalCount: 3,
          hasDomProgressValues: false,
          visibleButtonCount: 4,
        }),
      ).toBe(true);
    });

    it('rejects stale DOM progress text when only generic visible buttons remain', () => {
      expect(
        hasVisibleCraftingUiSignals({
          hasNamedCraftingActionCue: false,
          hasDomProgressValues: true,
          visibleProgressSignalCount: 0,
          visibleButtonCount: 4,
        }),
      ).toBe(false);
    });

    it('rejects single-signal progress matches with generic button rows', () => {
      expect(
        hasVisibleCraftingUiSignals({
          hasNamedCraftingActionCue: false,
          hasDomProgressValues: false,
          visibleProgressSignalCount: 1,
          visibleButtonCount: 4,
        }),
      ).toBe(false);
    });
  });

  describe('parseCraftingProgressPair', () => {
    it('parses structural X/Y progress text without relying on English labels', () => {
      expect(parseCraftingProgressPair('45 / 120')).toEqual({
        current: 45,
        target: 120,
      });
      expect(parseCraftingProgressPair('45/120')).toEqual({
        current: 45,
        target: 120,
      });
    });

    it('accepts localized text as long as the visible numbers are present', () => {
      expect(
        parseCraftingProgressPair('Vervollkommnung 1 234 / 5 678'),
      ).toEqual({
        current: 1234,
        target: 5678,
      });
    });

    it('accepts compact suffixed progress values from the live HUD', () => {
      expect(parseCraftingProgressPair('Completion 4.34K / 31K')).toEqual({
        current: 4340,
        target: 31000,
      });
      expect(parseCraftingProgressPair('4.34K/31.13K')).toEqual({
        current: 4340,
        target: 31130,
      });
    });
  });

  describe('isRenderableOnscreenElement', () => {
    it('rejects hidden and transparent elements', () => {
      expect(
        isRenderableOnscreenElement({
          isConnected: true,
          isHidden: true,
          display: 'block',
          visibility: 'visible',
          opacity: '1',
          clientRects: [
            { top: 10, left: 10, right: 40, bottom: 40, width: 30, height: 30 },
          ],
          viewportWidth: 800,
          viewportHeight: 600,
        }),
      ).toBe(false);
      expect(
        isRenderableOnscreenElement({
          isConnected: true,
          display: 'block',
          visibility: 'visible',
          opacity: '0',
          clientRects: [
            { top: 10, left: 10, right: 40, bottom: 40, width: 30, height: 30 },
          ],
          viewportWidth: 800,
          viewportHeight: 600,
        }),
      ).toBe(false);
    });

    it('rejects fully offscreen boxes', () => {
      expect(
        isRenderableOnscreenElement({
          isConnected: true,
          display: 'block',
          visibility: 'visible',
          opacity: '1',
          clientRects: [
            {
              top: 700,
              left: 900,
              right: 980,
              bottom: 780,
              width: 80,
              height: 80,
            },
          ],
          viewportWidth: 800,
          viewportHeight: 600,
        }),
      ).toBe(false);
    });

    it('accepts onscreen rendered elements', () => {
      expect(
        isRenderableOnscreenElement({
          isConnected: true,
          display: 'block',
          visibility: 'visible',
          opacity: '1',
          clientRects: [
            { top: 10, left: 10, right: 40, bottom: 40, width: 30, height: 30 },
          ],
          viewportWidth: 800,
          viewportHeight: 600,
        }),
      ).toBe(true);
    });
  });
});
