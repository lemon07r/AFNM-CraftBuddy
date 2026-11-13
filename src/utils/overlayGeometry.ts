import { OVERLAY_EDGE_MARGIN_PX } from './overlayLayout';

export interface ManualOverlayGeometry {
  top: number;
  right: number;
  width: number;
  /** null keeps the panel content-sized until its first vertical resize. */
  height: number | null;
}

export interface OverlayViewport {
  width: number;
  height: number;
}

export const OVERLAY_MIN_SIZE_PX = {
  regular: { width: 360, height: 240 },
  compact: { width: 300, height: 200 },
} as const;

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

function bounds(viewport: OverlayViewport, compact: boolean) {
  const width = Math.max(0, viewport.width);
  const height = Math.max(0, viewport.height);
  const xMargin = Math.min(OVERLAY_EDGE_MARGIN_PX, width / 2);
  const yMargin = Math.min(OVERLAY_EDGE_MARGIN_PX, height / 2);
  const min = OVERLAY_MIN_SIZE_PX[compact ? 'compact' : 'regular'];
  return {
    width,
    height,
    xMargin,
    yMargin,
    minWidth: Math.min(min.width, width - xMargin * 2),
    minHeight: Math.min(min.height, height - yMargin * 2),
  };
}

/** Clamp a copy, never the persisted intent, so larger resolutions recover it. */
export function clampManualGeometry(
  geometry: ManualOverlayGeometry,
  viewport: OverlayViewport,
  compact = false,
): ManualOverlayGeometry {
  const b = bounds(viewport, compact);
  const width = clamp(geometry.width, b.minWidth, b.width - b.xMargin * 2);
  const right = clamp(geometry.right, b.xMargin, b.width - b.xMargin - width);
  const top = clamp(
    geometry.top,
    b.yMargin,
    b.height - b.yMargin - b.minHeight,
  );
  const height =
    geometry.height === null
      ? null
      : clamp(geometry.height, b.minHeight, b.height - top - b.yMargin);
  return { top, right, width, height };
}

export function dragGeometry(
  start: ManualOverlayGeometry,
  dx: number,
  dy: number,
  viewport: OverlayViewport,
  compact: boolean,
  measuredHeight: number,
): ManualOverlayGeometry {
  const b = bounds(viewport, compact);
  const visibleHeight = clamp(measuredHeight, 0, b.height - b.yMargin * 2);
  const moved = clampManualGeometry(
    { ...start, top: start.top + dy, right: start.right - dx },
    viewport,
    compact,
  );
  return clampManualGeometry(
    {
      ...moved,
      top: Math.min(moved.top, b.height - b.yMargin - visibleHeight),
      height: start.height,
    },
    viewport,
    compact,
  );
}

/** Bottom-left resizing leaves the top-right anchor unchanged. */
export function resizeFromBottomLeft(
  start: ManualOverlayGeometry,
  dx: number,
  dy: number,
  viewport: OverlayViewport,
  compact = false,
): ManualOverlayGeometry {
  const b = bounds(viewport, compact);
  const anchor = clampManualGeometry(start, viewport, compact);
  const maxWidth = b.width - anchor.right - b.xMargin;
  const maxHeight = b.height - anchor.top - b.yMargin;
  return {
    ...anchor,
    width: clamp(start.width - dx, Math.min(b.minWidth, maxWidth), maxWidth),
    height: clamp(
      (start.height ?? b.minHeight) + dy,
      Math.min(b.minHeight, maxHeight),
      maxHeight,
    ),
  };
}

export function parseStoredGeometry(
  raw: unknown,
): ManualOverlayGeometry | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const value = raw as Record<string, unknown>;
  const finite = (n: unknown): n is number =>
    typeof n === 'number' && Number.isFinite(n);
  if (
    value.version !== 1 ||
    !finite(value.top) ||
    value.top < 0 ||
    !finite(value.right) ||
    value.right < 0 ||
    !finite(value.width) ||
    value.width <= 0 ||
    !(value.height === null || (finite(value.height) && value.height > 0))
  )
    return null;
  return {
    top: value.top,
    right: value.right,
    width: value.width,
    height: value.height,
  };
}

export function computeManualOverlayStyle(
  geometry: ManualOverlayGeometry,
  viewport: OverlayViewport,
  compact = false,
): {
  top: number;
  right: number;
  width: number;
  height: number | undefined;
  maxHeight: number;
} {
  const clamped = clampManualGeometry(geometry, viewport, compact);
  const b = bounds(viewport, compact);
  return {
    ...clamped,
    height: clamped.height ?? undefined,
    maxHeight: Math.max(0, b.height - clamped.top - b.yMargin),
  };
}
