import {
  OVERLAY_EDGE_MARGIN_PX,
  OVERLAY_SAFE_GUTTER_PX,
  computeOverlayLayout,
  expandOverlayRect,
  getOverlayPanelBleed,
  getOverlayPanelMaxWidth,
  unionOverlayRects,
} from '../utils/overlayLayout';

describe('overlayLayout', () => {
  it('caps the panel at the design max when ample safe width exists', () => {
    const layout = computeOverlayLayout({
      viewportWidth: 1440,
      viewportHeight: 900,
      occupiedRect: {
        top: 24,
        left: 32,
        right: 520,
        bottom: 780,
        width: 488,
        height: 756,
      },
      compact: false,
    });

    expect(layout.width).toBe(getOverlayPanelMaxWidth(false));
    expect(layout.safeLaneLeft).toBe(520 + OVERLAY_SAFE_GUTTER_PX);
    expect(layout.maxHeight).toBe(900 - OVERLAY_EDGE_MARGIN_PX * 2);
  });

  it('uses the full safe lane on tighter viewports instead of forcing a narrow preset width', () => {
    const occupiedRect = {
      top: 20,
      left: 20,
      right: 520,
      bottom: 748,
      width: 500,
      height: 728,
    };
    const layout = computeOverlayLayout({
      viewportWidth: 975,
      viewportHeight: 768,
      occupiedRect,
      compact: false,
    });

    const availableWidth =
      975 - (occupiedRect.right + OVERLAY_SAFE_GUTTER_PX) - OVERLAY_EDGE_MARGIN_PX;
    const expectedWidth = Math.max(
      0,
      availableWidth - getOverlayPanelBleed(false),
    );

    expect(layout.width).toBe(expectedWidth);
    expect(layout.width).toBeGreaterThan(360);
  });

  it('keeps compact mode on its smaller max width when there is extra room', () => {
    const layout = computeOverlayLayout({
      viewportWidth: 1280,
      viewportHeight: 720,
      occupiedRect: {
        top: 20,
        left: 24,
        right: 460,
        bottom: 700,
        width: 436,
        height: 680,
      },
      compact: true,
    });

    expect(layout.width).toBe(getOverlayPanelMaxWidth(true));
  });

  it('expands and unions occupied rects for a stable safe-lane boundary', () => {
    const expanded = expandOverlayRect(
      {
        top: 40,
        left: 100,
        right: 220,
        bottom: 120,
        width: 120,
        height: 80,
      },
      { top: 8, right: 28, bottom: 8, left: 12 },
    );
    const union = unionOverlayRects([
      expanded,
      {
        top: 200,
        left: 80,
        right: 260,
        bottom: 320,
        width: 180,
        height: 120,
      },
    ]);

    expect(expanded).toEqual({
      top: 32,
      left: 88,
      right: 248,
      bottom: 128,
      width: 160,
      height: 96,
    });
    expect(union).toEqual({
      top: 32,
      left: 80,
      right: 260,
      bottom: 320,
      width: 180,
      height: 288,
    });
  });
});
