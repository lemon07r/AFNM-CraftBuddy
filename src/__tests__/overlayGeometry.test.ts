import {
  clampManualGeometry,
  computeManualOverlayStyle,
  dragGeometry,
  OVERLAY_MIN_SIZE_PX,
  parseStoredGeometry,
  resizeFromBottomLeft,
  type ManualOverlayGeometry,
} from '../utils/overlayGeometry';

const viewport = { width: 1920, height: 1080 };
const geometry: ManualOverlayGeometry = {
  top: 80,
  right: 100,
  width: 500,
  height: 600,
};

describe('manual overlay geometry', () => {
  it('keeps valid geometry unchanged without mutating the input', () => {
    expect(clampManualGeometry(geometry, viewport)).toEqual(geometry);
    expect(clampManualGeometry(geometry, viewport)).not.toBe(geometry);
  });

  it.each([false, true])(
    'enforces minimum sizes and edge margins (compact %s)',
    (compact) => {
      const min = OVERLAY_MIN_SIZE_PX[compact ? 'compact' : 'regular'];
      expect(
        clampManualGeometry(
          { top: -1, right: -20, width: 1, height: 1 },
          viewport,
          compact,
        ),
      ).toEqual({ top: 10, right: 10, width: min.width, height: min.height });
      expect(
        clampManualGeometry(
          { ...geometry, top: 9999, right: 9999 },
          viewport,
          compact,
        ),
      ).toEqual({
        top: 1070 - min.height,
        right: 1410,
        width: 500,
        height: min.height,
      });
    },
  );

  it('caps width globally and fixed height below the top anchor', () => {
    expect(
      clampManualGeometry(
        { top: 100, right: 900, width: 9999, height: 9999 },
        viewport,
      ),
    ).toEqual({ top: 100, right: 10, width: 1900, height: 970 });
  });

  it('keeps content height unset and supplies remaining viewport maxHeight', () => {
    expect(
      computeManualOverlayStyle({ ...geometry, height: null }, viewport),
    ).toEqual({
      top: 80,
      right: 100,
      width: 500,
      height: undefined,
      maxHeight: 990,
    });
    expect(computeManualOverlayStyle(geometry, viewport).height).toBe(600);
  });

  it('drags right by decreasing right and preserves content-sized intent', () => {
    expect(
      dragGeometry({ ...geometry, height: null }, 30, 20, viewport, false, 600),
    ).toEqual({ top: 100, right: 70, width: 500, height: null });
  });

  it('clamps drag against measured visible height, not just minimum height', () => {
    expect(dragGeometry(geometry, 9999, 9999, viewport, false, 600)).toEqual({
      ...geometry,
      top: 470,
      right: 10,
    });
    expect(dragGeometry(geometry, -9999, -9999, viewport, false, 600)).toEqual({
      ...geometry,
      top: 10,
      right: 1410,
    });
    expect(
      dragGeometry({ ...geometry, height: null }, 0, 9999, viewport, false, 600)
        .top,
    ).toBe(470);
  });

  it('resizes from bottom-left while holding right and top fixed', () => {
    expect(resizeFromBottomLeft(geometry, -100, 50, viewport)).toEqual({
      ...geometry,
      width: 600,
      height: 650,
    });
    expect(resizeFromBottomLeft(geometry, -9999, 9999, viewport)).toEqual({
      ...geometry,
      width: 1810,
      height: 990,
    });
    expect(resizeFromBottomLeft(geometry, 9999, -9999, viewport)).toEqual({
      ...geometry,
      width: 360,
      height: 240,
    });
  });

  it.each([
    { width: 180, height: 100 },
    { width: 12, height: 8 },
    { width: 0, height: 0 },
  ])('lets a tiny viewport win over minimum size: %j', (size) => {
    for (const result of [
      clampManualGeometry(geometry, size),
      dragGeometry(geometry, 100, 100, size, false, 600),
      resizeFromBottomLeft(geometry, -100, 100, size),
    ]) {
      expect(result.top).toBeGreaterThanOrEqual(0);
      expect(result.right).toBeGreaterThanOrEqual(0);
      expect(result.width + result.right).toBeLessThanOrEqual(size.width);
      expect(result.top + (result.height ?? 0)).toBeLessThanOrEqual(
        size.height,
      );
    }
  });

  it('recovers saved intent after a resolution change', () => {
    const stored = {
      ...geometry,
      top: 500,
      right: 800,
      width: 900,
      height: 550,
    };
    const original = { ...stored };
    const small = clampManualGeometry(stored, { width: 800, height: 600 });
    expect(small.top + small.height!).toBeLessThanOrEqual(590);
    expect(small.right + small.width).toBeLessThanOrEqual(790);
    expect(stored).toEqual(original);
    expect(clampManualGeometry(stored, viewport)).toEqual(original);
  });

  it('parses versioned finite numeric values without coercion', () => {
    expect(parseStoredGeometry({ version: 1, ...geometry })).toEqual(geometry);
    expect(
      parseStoredGeometry({ version: 1, ...geometry, height: null }),
    ).toEqual({ ...geometry, height: null });
  });

  it.each([
    null,
    [],
    'garbage',
    {},
    { ...geometry },
    { version: 2, ...geometry },
    { version: 1, ...geometry, top: NaN },
    { version: 1, ...geometry, right: Infinity },
    { version: 1, ...geometry, top: -1 },
    { version: 1, ...geometry, right: -1 },
    { version: 1, ...geometry, width: '500' },
    { version: 1, ...geometry, width: 0 },
    { version: 1, ...geometry, height: -1 },
    { version: 1, ...geometry, height: undefined },
  ])('rejects invalid persisted data: %j', (raw) => {
    expect(parseStoredGeometry(raw)).toBeNull();
  });
});
