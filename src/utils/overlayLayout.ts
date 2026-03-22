export interface OverlayRectLike {
  top: number;
  left: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export interface OverlayRectPadding {
  top?: number;
  right?: number;
  bottom?: number;
  left?: number;
}

export interface OverlayLayoutInput {
  viewportWidth: number;
  viewportHeight: number;
  occupiedRect?: OverlayRectLike | null;
  compact?: boolean;
}

export interface OverlayLayoutResult {
  top: number;
  right: number;
  width: number;
  maxHeight: number;
  safeLaneLeft: number;
  availableWidth: number;
  occupiedRect: OverlayRectLike | null;
}

export const OVERLAY_EDGE_MARGIN_PX = 10;
export const OVERLAY_SAFE_GUTTER_PX = 28;
export const OVERLAY_PANEL_MAX_WIDTH_PX = {
  compact: 320,
} as const;
export const OVERLAY_PANEL_BLEED_PX = {
  regular: 16,
  compact: 12,
} as const;
export const OVERLAY_SAFE_LANE_LEFT_MAX_RATIO = 0.58;
export const OVERLAY_HUD_CLUSTER_VIEWPORT_RATIO = 0.46;
export const OVERLAY_HUD_CLUSTER_EXTRA_WIDTH_PX = 180;
export const OVERLAY_HUD_CLUSTER_MAX_RECT_WIDTH_RATIO = 0.58;
export const OVERLAY_PARENT_RECT_SLACK_PX = {
  left: 80,
  right: 220,
  top: 80,
  bottom: 220,
} as const;

function normalizeRect(rect: OverlayRectLike): OverlayRectLike | null {
  const width = Number(rect.width ?? rect.right - rect.left);
  const height = Number(rect.height ?? rect.bottom - rect.top);

  if (!(width > 0) || !(height > 0)) {
    return null;
  }

  return {
    top: Number(rect.top),
    left: Number(rect.left),
    right: Number(rect.right),
    bottom: Number(rect.bottom),
    width,
    height,
  };
}

export function getOverlayPanelMaxWidth(compact: boolean = false): number | null {
  return compact ? OVERLAY_PANEL_MAX_WIDTH_PX.compact : null;
}

export function getOverlayPanelBleed(compact: boolean = false): number {
  return compact
    ? OVERLAY_PANEL_BLEED_PX.compact
    : OVERLAY_PANEL_BLEED_PX.regular;
}

export function expandOverlayRect(
  rect: OverlayRectLike,
  padding: OverlayRectPadding = {},
): OverlayRectLike {
  const normalized = normalizeRect(rect);
  if (!normalized) {
    return {
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      width: 0,
      height: 0,
    };
  }

  const top = normalized.top - (padding.top ?? 0);
  const left = normalized.left - (padding.left ?? 0);
  const right = normalized.right + (padding.right ?? 0);
  const bottom = normalized.bottom + (padding.bottom ?? 0);

  return {
    top,
    left,
    right,
    bottom,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
}

export function unionOverlayRects(
  rects: Array<OverlayRectLike | null | undefined>,
): OverlayRectLike | null {
  const normalized = rects
    .map((rect) => (rect ? normalizeRect(rect) : null))
    .filter((rect): rect is OverlayRectLike => rect !== null);

  if (normalized.length === 0) {
    return null;
  }

  const left = Math.min(...normalized.map((rect) => rect.left));
  const top = Math.min(...normalized.map((rect) => rect.top));
  const right = Math.max(...normalized.map((rect) => rect.right));
  const bottom = Math.max(...normalized.map((rect) => rect.bottom));

  return {
    top,
    left,
    right,
    bottom,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
}

export function isOverlayParentRectUsable({
  elementRect,
  candidateRect,
}: {
  elementRect: OverlayRectLike;
  candidateRect: OverlayRectLike;
}): boolean {
  const normalizedElementRect = normalizeRect(elementRect);
  const normalizedCandidateRect = normalizeRect(candidateRect);
  if (!normalizedElementRect || !normalizedCandidateRect) {
    return false;
  }

  return (
    normalizedCandidateRect.left >=
      normalizedElementRect.left - OVERLAY_PARENT_RECT_SLACK_PX.left &&
    normalizedCandidateRect.right <=
      normalizedElementRect.right + OVERLAY_PARENT_RECT_SLACK_PX.right &&
    normalizedCandidateRect.top >=
      normalizedElementRect.top - OVERLAY_PARENT_RECT_SLACK_PX.top &&
    normalizedCandidateRect.bottom <=
      normalizedElementRect.bottom + OVERLAY_PARENT_RECT_SLACK_PX.bottom
  );
}

export function isRectInOverlayHudCluster({
  rect,
  progressRect,
  viewportWidth,
}: {
  rect: OverlayRectLike;
  progressRect?: OverlayRectLike | null;
  viewportWidth: number;
}): boolean {
  const normalizedRect = normalizeRect(rect);
  if (!normalizedRect) {
    return false;
  }

  if (normalizedRect.width > viewportWidth * OVERLAY_HUD_CLUSTER_MAX_RECT_WIDTH_RATIO) {
    return false;
  }

  const normalizedProgressRect = progressRect ? normalizeRect(progressRect) : null;
  const clusterRightBoundary = normalizedProgressRect
    ? Math.max(
        normalizedProgressRect.right + OVERLAY_HUD_CLUSTER_EXTRA_WIDTH_PX,
        viewportWidth * OVERLAY_HUD_CLUSTER_VIEWPORT_RATIO,
      )
    : viewportWidth * OVERLAY_HUD_CLUSTER_VIEWPORT_RATIO;

  return normalizedRect.left <= clusterRightBoundary;
}

export function computeOverlayLayout({
  viewportWidth,
  viewportHeight,
  occupiedRect = null,
  compact = false,
}: OverlayLayoutInput): OverlayLayoutResult {
  const safeViewportWidth = Math.max(0, viewportWidth);
  const safeViewportHeight = Math.max(0, viewportHeight);
  const maxPanelWidth = getOverlayPanelMaxWidth(compact);
  const panelBleed = getOverlayPanelBleed(compact);
  const maxSafeLaneLeft = Math.max(
    OVERLAY_EDGE_MARGIN_PX,
    safeViewportWidth * OVERLAY_SAFE_LANE_LEFT_MAX_RATIO,
  );
  const safeLaneLeft = occupiedRect
    ? Math.min(
        Math.max(OVERLAY_EDGE_MARGIN_PX, occupiedRect.right + OVERLAY_SAFE_GUTTER_PX),
        Math.min(
          Math.max(OVERLAY_EDGE_MARGIN_PX, safeViewportWidth - OVERLAY_EDGE_MARGIN_PX),
          maxSafeLaneLeft,
        ),
      )
    : OVERLAY_EDGE_MARGIN_PX;
  const availableWidth = Math.max(
    0,
    safeViewportWidth - safeLaneLeft - OVERLAY_EDGE_MARGIN_PX,
  );
  const safeWidth = Math.max(0, availableWidth - panelBleed);

  return {
    top: OVERLAY_EDGE_MARGIN_PX,
    right: OVERLAY_EDGE_MARGIN_PX,
    width:
      maxPanelWidth === null ? safeWidth : Math.min(maxPanelWidth, safeWidth),
    maxHeight: Math.max(
      0,
      safeViewportHeight - OVERLAY_EDGE_MARGIN_PX * 2,
    ),
    safeLaneLeft,
    availableWidth,
    occupiedRect,
  };
}
