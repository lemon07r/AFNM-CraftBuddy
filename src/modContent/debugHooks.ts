/**
 * CraftBuddy - Debug affordances.
 *
 * The in-game debug helpers the hotkey handlers reach for: copying a snapshot to
 * the clipboard, saving it to a file, and the transient toast that confirms
 * either happened. Kept out of `index.ts` because none of it participates in
 * craft state - the toast timer is the module's own business.
 *
 * Extracted verbatim from `src/modContent/index.ts` during the 6.0.0 split.
 */

import { debugLog } from '../utils/debug';

export let debugToastTimeout: number | null = null;

export async function copyTextToClipboard(text: string): Promise<boolean> {
  const clipboard = (globalThis as any)?.navigator?.clipboard;
  if (clipboard?.writeText) {
    try {
      await clipboard.writeText(text);
      return true;
    } catch {
      // Fallback to document.execCommand below.
    }
  }

  try {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', 'true');
    Object.assign(textarea.style, {
      position: 'fixed',
      opacity: '0',
      pointerEvents: 'none',
      left: '-9999px',
      top: '-9999px',
    });
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    const copied = document.execCommand('copy');
    document.body.removeChild(textarea);
    return copied;
  } catch {
    return false;
  }
}

export function downloadTextFile(fileName: string, text: string): boolean {
  try {
    const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = fileName;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return true;
  } catch {
    return false;
  }
}

export function showDebugToast(
  message: string,
  tone: 'info' | 'success' | 'warn' | 'error' = 'info',
  durationMs: number = 2600,
): void {
  const existing = document.getElementById('craftbuddy-debug-toast');
  if (existing && existing.parentNode) {
    existing.parentNode.removeChild(existing);
  }
  if (debugToastTimeout !== null) {
    window.clearTimeout(debugToastTimeout);
    debugToastTimeout = null;
  }

  const toast = document.createElement('div');
  toast.id = 'craftbuddy-debug-toast';
  toast.textContent = message;

  const toneStyles: Record<
    string,
    { bg: string; border: string; text: string }
  > = {
    info: {
      bg: 'rgba(15, 23, 42, 0.92)',
      border: 'rgba(59, 130, 246, 0.7)',
      text: '#dbeafe',
    },
    success: {
      bg: 'rgba(6, 78, 59, 0.92)',
      border: 'rgba(16, 185, 129, 0.7)',
      text: '#d1fae5',
    },
    warn: {
      bg: 'rgba(120, 53, 15, 0.92)',
      border: 'rgba(251, 191, 36, 0.7)',
      text: '#fef3c7',
    },
    error: {
      bg: 'rgba(127, 29, 29, 0.92)',
      border: 'rgba(248, 113, 113, 0.75)',
      text: '#fee2e2',
    },
  };

  const palette = toneStyles[tone];
  Object.assign(toast.style, {
    position: 'fixed',
    right: '18px',
    top: '18px',
    zIndex: '10002',
    maxWidth: '420px',
    padding: '10px 14px',
    borderRadius: '8px',
    border: `1px solid ${palette.border}`,
    backgroundColor: palette.bg,
    color: palette.text,
    fontFamily: `'Trebuchet MS', 'Verdana', sans-serif`,
    fontSize: '12px',
    fontWeight: '600',
    lineHeight: '1.3',
    boxShadow: '0 10px 26px rgba(0, 0, 0, 0.35)',
    pointerEvents: 'none',
    opacity: '1',
    transition: 'opacity 220ms ease-out',
    whiteSpace: 'pre-wrap',
  });

  document.body.appendChild(toast);
  debugToastTimeout = window.setTimeout(() => {
    toast.style.opacity = '0';
    window.setTimeout(() => {
      if (toast.parentNode) {
        toast.parentNode.removeChild(toast);
      }
    }, 240);
    debugToastTimeout = null;
  }, durationMs);
}
