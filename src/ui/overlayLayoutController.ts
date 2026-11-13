import {
  getManualOverlayGeometry,
  resetOverlayGeometry,
  saveManualOverlayGeometry,
  subscribeOverlayGeometry,
} from '../settings/overlayGeometry';
import {
  computeManualOverlayStyle,
  dragGeometry,
  resizeFromBottomLeft,
  type ManualOverlayGeometry,
  type OverlayViewport,
} from '../utils/overlayGeometry';
import type { OverlayLayoutResult } from '../utils/overlayLayout';
import {
  OVERLAY_NO_DRAG_SELECTOR,
  type OverlayLayoutHandlers,
  type OverlayPointerEventLike,
} from './overlayInteraction';

interface ControllerOptions {
  container: HTMLElement;
  getAutoLayout(): Pick<
    OverlayLayoutResult,
    'top' | 'right' | 'width' | 'maxHeight'
  >;
  getViewport(): OverlayViewport;
  isCompact(): boolean;
}

export function createOverlayLayoutController({
  container,
  getAutoLayout,
  getViewport,
  isCompact,
}: ControllerOptions): {
  apply(): void;
  handlers: OverlayLayoutHandlers;
  /** Abandons an in-progress gesture without saving it. */
  cancelGesture(): void;
  dispose(): void;
} {
  const view = container.ownerDocument.defaultView!;
  let disposed = false;
  let frame: number | null = null;
  let active: {
    geometry: ManualOverlayGeometry;
    started: boolean;
    cleanup(): void;
  } | null = null;

  function writeManual(geometry: ManualOverlayGeometry): void {
    const style = computeManualOverlayStyle(
      geometry,
      getViewport(),
      isCompact(),
    );
    Object.assign(container.style, {
      top: `${style.top}px`,
      right: `${style.right}px`,
      width: `${style.width}px`,
      height: style.height === undefined ? '' : `${style.height}px`,
      maxHeight: `${style.maxHeight}px`,
    });
    container.setAttribute('data-craftbuddy-layout', 'manual');
    container.toggleAttribute(
      'data-craftbuddy-sized',
      geometry.height !== null,
    );
  }

  function apply(): void {
    if (disposed) return;
    Object.assign(container.style, {
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'stretch',
    });
    if (active) {
      if (active.started) writeManual(active.geometry);
      return;
    }
    const manual = getManualOverlayGeometry();
    if (manual) {
      writeManual(manual);
      return;
    }
    const layout = getAutoLayout();
    Object.assign(container.style, {
      top: `${layout.top}px`,
      right: `${layout.right}px`,
      width: `${layout.width}px`,
      height: '',
      maxHeight: `${layout.maxHeight}px`,
    });
    container.setAttribute('data-craftbuddy-layout', 'auto');
    container.removeAttribute('data-craftbuddy-sized');
  }

  function scheduleApply(): void {
    if (disposed || frame !== null) return;
    frame = view.requestAnimationFrame(() => {
      frame = null;
      apply();
    });
  }

  function cancelFrame(): void {
    if (frame !== null) view.cancelAnimationFrame(frame);
    frame = null;
  }

  // React bubbles events from portalled content (the settings dialog) through
  // the header, so the target must also be a real DOM descendant of it.
  function interactive(
    target: EventTarget | null,
    currentTarget: EventTarget | null,
    excludeControls = true,
  ): boolean {
    if (!(target instanceof Node) || !(currentTarget instanceof Node))
      return true;
    if (!currentTarget.contains(target)) return true;
    return (
      excludeControls &&
      target instanceof Element &&
      !!target.closest(OVERLAY_NO_DRAG_SELECTOR)
    );
  }

  function startGesture(
    event: OverlayPointerEventLike,
    kind: 'drag' | 'resize',
  ): void {
    if (
      disposed ||
      active ||
      event.button !== 0 ||
      interactive(event.target, event.currentTarget, kind === 'drag')
    )
      return;
    if (!(event.currentTarget instanceof Element)) return;
    const captureTarget = event.currentTarget;
    const rect = container.getBoundingClientRect();
    const stored = getManualOverlayGeometry();
    const start: ManualOverlayGeometry = {
      top: rect.top,
      right: getViewport().width - rect.right,
      width: rect.width,
      height: kind === 'resize' ? rect.height : (stored?.height ?? null),
    };
    const pointerId = event.pointerId;
    let moved = false;
    event.preventDefault();

    const cleanup = () => {
      view.removeEventListener('pointermove', onMove);
      view.removeEventListener('pointerup', onUp);
      view.removeEventListener('pointercancel', onCancel);
      view.removeEventListener('keydown', onKey, true);
      captureTarget.removeEventListener('lostpointercapture', onLost);
      active = null;
      cancelFrame();
      container.removeAttribute('data-craftbuddy-gesture');
      try {
        if (captureTarget.hasPointerCapture(pointerId))
          captureTarget.releasePointerCapture(pointerId);
      } catch {
        /* The target may have unmounted during a game-state update. */
      }
    };
    const update = (e: PointerEvent) => {
      if (e.pointerId !== pointerId || !active) return;
      const dx = e.clientX - event.clientX;
      const dy = e.clientY - event.clientY;
      if (!moved && Math.hypot(dx, dy) < 3) return;
      moved = true;
      active.started = true;
      active.geometry =
        kind === 'drag'
          ? dragGeometry(start, dx, dy, getViewport(), isCompact(), rect.height)
          : resizeFromBottomLeft(start, dx, dy, getViewport(), isCompact());
      container.setAttribute('data-craftbuddy-gesture', kind);
    };
    const onMove = (e: PointerEvent) => {
      update(e);
      if (moved) scheduleApply();
    };
    const onUp = (e: PointerEvent) => {
      if (e.pointerId !== pointerId) return;
      update(e);
      const geometry = active?.geometry;
      cleanup();
      if (moved && geometry)
        saveManualOverlayGeometry({
          ...geometry,
          height: kind === 'drag' ? (stored?.height ?? null) : geometry.height,
        });
      else apply();
    };
    const onCancel = (e: PointerEvent) => {
      if (e.pointerId === pointerId) {
        cleanup();
        apply();
      }
    };
    const onLost = (e: Event) => onCancel(e as PointerEvent);
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      cleanup();
      apply();
    };
    active = { geometry: start, started: false, cleanup };
    view.addEventListener('pointermove', onMove);
    view.addEventListener('pointerup', onUp);
    view.addEventListener('pointercancel', onCancel);
    view.addEventListener('keydown', onKey, true);
    captureTarget.addEventListener('lostpointercapture', onLost);
    try {
      captureTarget.setPointerCapture(pointerId);
    } catch {
      /* Synthetic harness events have no native active pointer. */
    }
  }

  const handlers: OverlayLayoutHandlers = {
    onHeaderPointerDown: (event) => startGesture(event, 'drag'),
    onResizePointerDown: (event) => startGesture(event, 'resize'),
    onHeaderDoubleClick: (event) => {
      if (
        disposed ||
        event.button !== 0 ||
        interactive(event.target, event.currentTarget)
      )
        return;
      event.preventDefault();
      resetOverlayGeometry();
    },
  };
  const unsubscribe = subscribeOverlayGeometry(() => {
    active?.cleanup();
    apply();
  });
  view.addEventListener('resize', scheduleApply);
  apply();
  return {
    apply,
    handlers,
    cancelGesture() {
      if (!active) return;
      active.cleanup();
      apply();
    },
    dispose() {
      active?.cleanup();
      disposed = true;
      cancelFrame();
      unsubscribe();
      view.removeEventListener('resize', scheduleApply);
    },
  };
}
