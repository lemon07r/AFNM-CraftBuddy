import {
  parseStoredGeometry,
  type ManualOverlayGeometry,
} from '../utils/overlayGeometry';

export const OVERLAY_GEOMETRY_STORAGE_KEY = 'craftbuddy_overlay_geometry';
let loaded = false;
let current: ManualOverlayGeometry | null = null;
const listeners = new Set<() => void>();

function getStorage(): Storage | null {
  if (typeof localStorage === 'undefined') return null;
  return typeof localStorage.getItem === 'function' &&
    typeof localStorage.setItem === 'function' &&
    typeof localStorage.removeItem === 'function'
    ? localStorage
    : null;
}

export function getManualOverlayGeometry(): ManualOverlayGeometry | null {
  if (!loaded) {
    loaded = true;
    try {
      const raw = getStorage()?.getItem(OVERLAY_GEOMETRY_STORAGE_KEY);
      current = raw ? parseStoredGeometry(JSON.parse(raw)) : null;
    } catch {
      current = null;
    }
  }
  return current ? { ...current } : null;
}

export function saveManualOverlayGeometry(
  geometry: ManualOverlayGeometry,
): void {
  const parsed = parseStoredGeometry({ version: 1, ...geometry });
  if (!parsed) return;
  loaded = true;
  current = parsed;
  try {
    getStorage()?.setItem(
      OVERLAY_GEOMETRY_STORAGE_KEY,
      JSON.stringify({ version: 1, ...parsed }),
    );
  } catch {
    // Keep the layout usable in memory when storage is unavailable/full.
  }
  listeners.forEach((listener) => listener());
}

export function resetOverlayGeometry(): void {
  loaded = true;
  current = null;
  try {
    getStorage()?.removeItem(OVERLAY_GEOMETRY_STORAGE_KEY);
  } catch {
    // In-memory reset still works when storage access is denied.
  }
  listeners.forEach((listener) => listener());
}

export function subscribeOverlayGeometry(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
