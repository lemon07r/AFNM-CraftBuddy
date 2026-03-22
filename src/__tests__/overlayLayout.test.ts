import {
  OVERLAY_EDGE_MARGIN_PX,
  OVERLAY_SAFE_GUTTER_PX,
  computeOverlayLayout,
  expandOverlayRect,
  getOverlayPanelBleed,
  getOverlayPanelMaxWidth,
  isOverlayParentRectUsable,
  isRectInOverlayHudCluster,
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

  it('rejects parent rects that balloon far beyond the element cluster', () => {
    expect(
      isOverlayParentRectUsable({
        elementRect: {
          top: 24,
          left: 1080,
          right: 1120,
          bottom: 56,
          width: 40,
          height: 32,
        },
        candidateRect: {
          top: 0,
          left: 0,
          right: 1180,
          bottom: 96,
          width: 1180,
          height: 96,
        },
      }),
    ).toBe(false);

    expect(
      isOverlayParentRectUsable({
        elementRect: {
          top: 24,
          left: 36,
          right: 180,
          bottom: 56,
          width: 144,
          height: 32,
        },
        candidateRect: {
          top: 16,
          left: 20,
          right: 240,
          bottom: 104,
          width: 220,
          height: 88,
        },
      }),
    ).toBe(true);
  });

  it('keeps right-side decoy controls out of the crafting hud cluster', () => {
    const progressRect = {
      top: 10,
      left: 20,
      right: 336,
      bottom: 286,
      width: 316,
      height: 276,
    };

    expect(
      isRectInOverlayHudCluster({
        rect: {
          top: 620,
          left: 16,
          right: 512,
          bottom: 752,
          width: 496,
          height: 132,
        },
        progressRect,
        viewportWidth: 975,
      }),
    ).toBe(true);

    expect(
      isRectInOverlayHudCluster({
        rect: {
          top: 18,
          left: 880,
          right: 940,
          bottom: 56,
          width: 60,
          height: 38,
        },
        progressRect,
        viewportWidth: 975,
      }),
    ).toBe(false);
  });
});
