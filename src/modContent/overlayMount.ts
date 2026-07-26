/**
 * CraftBuddy - Overlay mounting and host geometry.
 *
 * Owns the mechanics of putting the recommendation panel on screen: committing
 * the React root against whichever ReactDOM build the host ships, scheduling
 * work around the game's paint and loading shell, measuring the crafting HUD so
 * the overlay can avoid it, and the title-screen "mod loaded" indicator.
 *
 * These are all pure functions of the live DOM plus their arguments. `index.ts`
 * still decides when to show, hide or re-render the overlay; this module only
 * knows how to do it.
 *
 * Extracted verbatim from `src/modContent/index.ts` during the 6.0.0 split.
 */

import type React from 'react';
import ReactDOM from 'react-dom/client';
import { debugLog } from '../utils/debug';
import {
  expandOverlayRect,
  isOverlayParentRectUsable,
  isRectInOverlayHudCluster,
  unionOverlayRects,
  type OverlayRectLike,
} from '../utils/overlayLayout';
import {
  isRenderableOnscreenElement,
  parseCraftingProgressPair,
} from './craftingUiDetection';

export const OVERLAY_OCCUPIED_RECT_PADDING = {
  top: 8,
  right: 28,
  bottom: 8,
  left: 12,
} as const;

export const MAX_HUD_RECT_PARENT_DEPTH = 4;

export const MAX_HUD_RECT_VIEWPORT_WIDTH_RATIO = 0.72;

export const MAX_HUD_RECT_VIEWPORT_HEIGHT_RATIO = 0.72;

export let hasLoggedMissingHostFlushSync = false;

export function scheduleAfterNextPaint(callback: () => void): void {
  if (
    typeof window !== 'undefined' &&
    typeof window.requestAnimationFrame === 'function'
  ) {
    window.requestAnimationFrame(() => {
      setTimeout(callback, 0);
    });
    return;
  }

  setTimeout(callback, 0);
}

export function hostReactDomSupportsFlushSync(): boolean {
  return (
    typeof (ReactDOM as typeof ReactDOM & { flushSync?: unknown }).flushSync ===
    'function'
  );
}

export function scheduleSearchAfterLoadingShell(callback: () => void): void {
  if (hostReactDomSupportsFlushSync()) {
    scheduleAfterNextPaint(callback);
    return;
  }

  // The host game exposes createRoot via ReactDOM, but some builds do not
  // expose flushSync on that same object. Give the concurrent root a full
  // paint to commit the loading shell before starting synchronous search work.
  scheduleAfterNextPaint(() => {
    scheduleAfterNextPaint(callback);
  });
}

export function renderReactRoot(
  root: ReactDOM.Root,
  element: React.ReactNode,
  { sync = false }: { sync?: boolean } = {},
): void {
  const reactDomCompat = ReactDOM as typeof ReactDOM & {
    flushSync?: (callback: () => void) => void;
  };

  if (sync && typeof reactDomCompat.flushSync === 'function') {
    reactDomCompat.flushSync(() => {
      root.render(element);
    });
    return;
  }

  if (sync && !hasLoggedMissingHostFlushSync) {
    hasLoggedMissingHostFlushSync = true;
    debugLog(
      '[CraftBuddy] Host ReactDOM does not expose flushSync; using async overlay commit',
    );
  }

  root.render(element);
}

export function getGameRootElement(): ParentNode {
  return (
    document.getElementById('root') ||
    document.getElementById('app') ||
    document.body
  );
}

export function isElementInCraftBuddyOverlay(element: Element | null): boolean {
  return !!element?.closest('#craftbuddy-overlay');
}

export function isElementVisible(element: Element): boolean {
  const htmlElement = element as HTMLElement;
  const style = window.getComputedStyle(htmlElement);
  return isRenderableOnscreenElement({
    isConnected: htmlElement.isConnected,
    isHidden: htmlElement.hidden || !!htmlElement.closest('[hidden]'),
    isAriaHidden:
      htmlElement.getAttribute('aria-hidden') === 'true' ||
      !!htmlElement.closest('[aria-hidden="true"]'),
    display: style.display,
    visibility: style.visibility,
    opacity: style.opacity,
    clientRects: Array.from(htmlElement.getClientRects()).map((rect) => ({
      top: rect.top,
      left: rect.left,
      right: rect.right,
      bottom: rect.bottom,
      width: rect.width,
      height: rect.height,
    })),
    viewportWidth:
      window.innerWidth || document.documentElement.clientWidth || 0,
    viewportHeight:
      window.innerHeight || document.documentElement.clientHeight || 0,
  });
}

export function getElementRectSnapshot(
  element: Element,
): OverlayRectLike | null {
  const rect = element.getBoundingClientRect();
  if (!(rect.width > 0) || !(rect.height > 0)) {
    return null;
  }

  return {
    top: rect.top,
    left: rect.left,
    right: rect.right,
    bottom: rect.bottom,
    width: rect.width,
    height: rect.height,
  };
}

export function pickCraftingHudAnchorRect(
  element: Element,
  viewportWidth: number,
  viewportHeight: number,
): OverlayRectLike | null {
  const elementRect = getElementRectSnapshot(element);
  if (!elementRect) {
    return null;
  }

  let current: Element | null = element;
  let best: OverlayRectLike | null = null;
  let bestArea = 0;

  for (
    let depth = 0;
    current && depth < MAX_HUD_RECT_PARENT_DEPTH;
    depth++, current = current.parentElement
  ) {
    if (isElementInCraftBuddyOverlay(current) || !isElementVisible(current)) {
      continue;
    }

    const rect = getElementRectSnapshot(current);
    if (!rect) {
      continue;
    }

    if (
      rect.width > viewportWidth * MAX_HUD_RECT_VIEWPORT_WIDTH_RATIO ||
      rect.height > viewportHeight * MAX_HUD_RECT_VIEWPORT_HEIGHT_RATIO
    ) {
      continue;
    }

    if (!isOverlayParentRectUsable({ elementRect, candidateRect: rect })) {
      continue;
    }

    const area = rect.width * rect.height;
    if (area > bestArea) {
      best = rect;
      bestArea = area;
    }
  }

  return best ?? elementRect;
}

export function findVisibleCraftingProgressElement(
  gameRoot: ParentNode,
  selector: string,
  fallbackPattern: RegExp,
): Element | undefined {
  const pickSmallestVisible = (elements: Element[]): Element | undefined => {
    return elements
      .filter((el) => !isElementInCraftBuddyOverlay(el) && isElementVisible(el))
      .map((el) => ({
        element: el,
        rect: getElementRectSnapshot(el),
      }))
      .filter(
        (
          candidate,
        ): candidate is {
          element: Element;
          rect: OverlayRectLike;
        } => candidate.rect !== null,
      )
      .sort((a, b) => {
        const areaA = a.rect.width * a.rect.height;
        const areaB = b.rect.width * b.rect.height;
        return areaA - areaB;
      })[0]?.element;
  };

  const selectorMatch = pickSmallestVisible(
    Array.from(gameRoot.querySelectorAll(selector)),
  );
  if (selectorMatch) {
    return selectorMatch;
  }

  return pickSmallestVisible(
    Array.from(gameRoot.querySelectorAll('*')).filter(
      (el) =>
        fallbackPattern.test(el.textContent || '') && el.children.length < 5,
    ),
  );
}

export function extractCraftingProgressPair(
  element: Element | undefined,
): { current: number; target: number } | undefined {
  if (!element) {
    return undefined;
  }

  const candidates = [
    (element as HTMLElement).innerText,
    element.textContent,
    element.getAttribute('aria-label'),
    element.parentElement?.textContent,
  ];

  for (const candidate of candidates) {
    const parsed = parseCraftingProgressPair(candidate || '');
    if (parsed) {
      return parsed;
    }
  }

  return undefined;
}

export function getVisibleCraftingUiOccupiedRect(): OverlayRectLike | null {
  const gameRoot = getGameRootElement();
  const viewportWidth =
    window.innerWidth || document.documentElement.clientWidth || 0;
  const viewportHeight =
    window.innerHeight || document.documentElement.clientHeight || 0;
  if (!(viewportWidth > 0) || !(viewportHeight > 0)) {
    return null;
  }

  const progressElements = [
    findVisibleCraftingProgressElement(
      gameRoot,
      '[class*="stability"]',
      /Stability:/i,
    ),
    findVisibleCraftingProgressElement(
      gameRoot,
      '[class*="completion"]',
      /Completion:/i,
    ),
    findVisibleCraftingProgressElement(
      gameRoot,
      '[class*="perfection"]',
      /Perfection:/i,
    ),
    findVisibleCraftingProgressElement(
      gameRoot,
      '[class*="pool"], [class*="qi"]',
      /(?:Qi|Pool):/i,
    ),
  ].filter((element): element is Element => !!element);

  const progressRects = progressElements
    .map((element) => getElementRectSnapshot(element))
    .map((rect) =>
      rect ? expandOverlayRect(rect, OVERLAY_OCCUPIED_RECT_PADDING) : null,
    );
  const progressRect = unionOverlayRects(progressRects);

  const supplementalRects = Array.from(
    gameRoot.querySelectorAll(
      'button, [role="button"], [class*="buff"], [class*="condition"]',
    ),
  )
    .filter(
      (element) =>
        !isElementInCraftBuddyOverlay(element) && isElementVisible(element),
    )
    .map((element) => getElementRectSnapshot(element))
    .filter((rect): rect is OverlayRectLike => {
      return (
        !!rect &&
        isRectInOverlayHudCluster({
          rect,
          progressRect,
          viewportWidth,
        })
      );
    })
    .map((rect) => expandOverlayRect(rect, OVERLAY_OCCUPIED_RECT_PADDING));

  return unionOverlayRects([...progressRects, ...supplementalRects]);
}

/**
 * Create title screen indicator.
 */
/**
 * Show the "mod loaded" badge on the title screen.
 *
 * The version is passed in because `MOD_METADATA` is a build-time global
 * declared by the entry module, not something this seam should re-declare.
 */
export function createTitleScreenIndicator(version: string): void {
  try {
    if (document.getElementById('craftbuddy-indicator')) {
      return;
    }

    const indicator = document.createElement('div');
    indicator.id = 'craftbuddy-indicator';
    indicator.innerHTML = `AFNM-CraftBuddy v${version} Loaded`;

    Object.assign(indicator.style, {
      position: 'fixed',
      top: '10px',
      right: '10px',
      padding: '8px 12px',
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      color: '#FFD700',
      fontFamily: 'sans-serif',
      fontSize: '12px',
      fontWeight: 'bold',
      borderRadius: '4px',
      border: '1px solid rgba(255, 215, 0, 0.5)',
      zIndex: '9999',
      pointerEvents: 'none',
      textShadow: '0 0 5px rgba(255, 215, 0, 0.5)',
      opacity: '1',
      transition: 'opacity 1s ease',
    });

    document.body.appendChild(indicator);
    debugLog('[CraftBuddy] Title screen indicator created');

    setTimeout(() => {
      if (indicator) {
        indicator.style.opacity = '0';
        setTimeout(() => {
          if (indicator && indicator.parentNode) {
            indicator.parentNode.removeChild(indicator);
          }
        }, 1000);
      }
    }, 5000);
  } catch (e) {
    console.warn('[CraftBuddy] Failed to create title screen indicator:', e);
  }
}
