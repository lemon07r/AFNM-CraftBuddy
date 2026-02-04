/**
 * Small debug logging helper.
 *
 * This mod runs inside the game browser environment; we keep console output
 * quiet by default and only emit verbose logs when debug is explicitly enabled.
 */

function isDebugEnabled(): boolean {
  try {
    if (typeof window !== 'undefined' && (window as any).__CRAFTBUDDY_DEBUG__ === true) {
      return true;
    }

    // Opt-in via localStorage flag.
    return localStorage.getItem('craftbuddy_debug') === '1';
  } catch {
    return false;
  }
}

export function debugLog(...args: unknown[]): void {
  if (!isDebugEnabled()) return;
  // eslint-disable-next-line no-console
  console.log(...args);
}
