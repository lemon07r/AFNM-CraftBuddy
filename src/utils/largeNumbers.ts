/**
 * CraftBuddy - Large Number Utilities
 * 
 * Provides utilities for handling large numbers that may appear in late-game crafting.
 * JavaScript numbers are safe up to ~9 quadrillion (Number.MAX_SAFE_INTEGER = 9,007,199,254,740,991).
 * 
 * This module provides:
 * - Safe arithmetic with overflow detection
 * - Formatting for display (e.g., "1.5M" instead of "1500000")
 * - Clamping to prevent overflow issues
 */

/**
 * Maximum safe value we'll work with.
 * Using a slightly lower value than MAX_SAFE_INTEGER to leave room for calculations.
 */
export const MAX_SAFE_VALUE = Number.MAX_SAFE_INTEGER - 1000000;

/**
 * Threshold above which we consider a number "large" and format it with suffixes.
 */
export const LARGE_NUMBER_THRESHOLD = 10000;

/**
 * Number suffixes for formatting (K, M, B, T, Q for quadrillion)
 */
const SUFFIXES = [
  { value: 1e15, suffix: 'Q' },  // Quadrillion
  { value: 1e12, suffix: 'T' },  // Trillion
  { value: 1e9, suffix: 'B' },   // Billion
  { value: 1e6, suffix: 'M' },   // Million
  { value: 1e3, suffix: 'K' },   // Thousand
];

/**
 * Check if a number is within safe integer range for precise arithmetic.
 */
export function isSafeNumber(value: number): boolean {
  return Number.isFinite(value) && 
         Math.abs(value) <= Number.MAX_SAFE_INTEGER;
}

/**
 * Clamp a number to safe range to prevent overflow issues.
 * Returns the clamped value and a flag indicating if clamping occurred.
 */
export function clampToSafe(value: number): { value: number; clamped: boolean } {
  if (!Number.isFinite(value)) {
    return { value: MAX_SAFE_VALUE, clamped: true };
  }
  if (value > MAX_SAFE_VALUE) {
    return { value: MAX_SAFE_VALUE, clamped: true };
  }
  if (value < -MAX_SAFE_VALUE) {
    return { value: -MAX_SAFE_VALUE, clamped: true };
  }
  return { value, clamped: false };
}

/**
 * Safe addition that clamps result to prevent overflow.
 */
export function safeAdd(a: number, b: number): number {
  const result = a + b;
  return clampToSafe(result).value;
}

/**
 * Safe multiplication that clamps result to prevent overflow.
 */
export function safeMultiply(a: number, b: number): number {
  const result = a * b;
  return clampToSafe(result).value;
}

/**
 * Safe floor operation that handles edge cases.
 */
export function safeFloor(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.floor(clampToSafe(value).value);
}

/**
 * Format a large number for display with appropriate suffix.
 * Examples:
 *   1234 -> "1,234"
 *   12345 -> "12.3K"
 *   1234567 -> "1.23M"
 *   1234567890 -> "1.23B"
 * 
 * @param value - The number to format
 * @param decimals - Number of decimal places for suffixed numbers (default: 2)
 * @param threshold - Minimum value to apply suffix formatting (default: LARGE_NUMBER_THRESHOLD)
 */
export function formatLargeNumber(
  value: number,
  decimals: number = 2,
  threshold: number = LARGE_NUMBER_THRESHOLD
): string {
  if (!Number.isFinite(value)) {
    return '∞';
  }

  const absValue = Math.abs(value);
  const sign = value < 0 ? '-' : '';

  // For small numbers, use locale formatting with commas
  if (absValue < threshold) {
    return sign + absValue.toLocaleString('en-US', { maximumFractionDigits: 0 });
  }

  // Find appropriate suffix
  for (const { value: divisor, suffix } of SUFFIXES) {
    if (absValue >= divisor) {
      const formatted = (absValue / divisor).toFixed(decimals);
      // Remove trailing zeros after decimal point
      const cleaned = formatted.replace(/\.?0+$/, '');
      return sign + cleaned + suffix;
    }
  }

  // Fallback for numbers between threshold and 1000
  return sign + absValue.toLocaleString('en-US', { maximumFractionDigits: 0 });
}

/**
 * Format a number as a compact display string.
 * Similar to formatLargeNumber but always uses at most 1 decimal place.
 * 
 * @param value - The number to format
 */
export function formatCompact(value: number): string {
  return formatLargeNumber(value, 1, 1000);
}

/**
 * Format a progress value (current/target) with appropriate formatting.
 * Handles large numbers gracefully.
 * 
 * @param current - Current progress value
 * @param target - Target value
 * @param useCompact - Whether to use compact formatting for large numbers
 */
export function formatProgress(
  current: number,
  target: number,
  useCompact: boolean = true
): string {
  if (useCompact && (current >= LARGE_NUMBER_THRESHOLD || target >= LARGE_NUMBER_THRESHOLD)) {
    return `${formatCompact(current)}/${formatCompact(target)}`;
  }
  return `${current.toLocaleString()}/${target.toLocaleString()}`;
}

/**
 * Calculate percentage safely, handling edge cases.
 * 
 * @param current - Current value
 * @param target - Target value (denominator)
 * @returns Percentage as a number (0-100+), or 100 if target is 0
 */
export function safePercentage(current: number, target: number): number {
  if (target <= 0) {
    return current > 0 ? 100 : 0;
  }
  return (current / target) * 100;
}

/**
 * Format a percentage for display.
 * 
 * @param current - Current value
 * @param target - Target value
 * @param decimals - Number of decimal places (default: 0)
 */
export function formatPercentage(
  current: number,
  target: number,
  decimals: number = 0
): string {
  const pct = safePercentage(current, target);
  return `${pct.toFixed(decimals)}%`;
}

/**
 * Check if a value might cause precision issues in calculations.
 * Logs a warning if the value is approaching unsafe territory.
 * 
 * @param value - The value to check
 * @param context - Description of where this value came from (for logging)
 * @returns true if the value is safe, false if it might cause issues
 */
export function checkPrecision(value: number, context: string): boolean {
  if (!Number.isFinite(value)) {
    console.warn(`[CraftBuddy] Non-finite number detected in ${context}: ${value}`);
    return false;
  }
  
  // Warn if we're getting close to precision limits (within 1000x of MAX_SAFE_INTEGER)
  if (Math.abs(value) > Number.MAX_SAFE_INTEGER / 1000) {
    console.warn(
      `[CraftBuddy] Large number detected in ${context}: ${formatLargeNumber(value)}. ` +
      `Precision may be affected.`
    );
    return false;
  }
  
  return true;
}

/**
 * Safely compare two potentially large numbers for equality.
 * Uses a relative epsilon for large numbers.
 * 
 * @param a - First number
 * @param b - Second number
 * @param epsilon - Relative tolerance (default: 1e-10)
 */
export function safeEquals(a: number, b: number, epsilon: number = 1e-10): boolean {
  if (a === b) return true;
  
  const diff = Math.abs(a - b);
  const maxAbs = Math.max(Math.abs(a), Math.abs(b));
  
  // For very small numbers, use absolute comparison
  if (maxAbs < 1) {
    return diff < epsilon;
  }
  
  // For larger numbers, use relative comparison
  return diff / maxAbs < epsilon;
}

/**
 * Parse a potentially large number from game data.
 * Handles string inputs, scientific notation, and edge cases.
 * 
 * @param value - The value to parse (number, string, or undefined)
 * @param defaultValue - Default value if parsing fails (default: 0)
 */
export function parseGameNumber(value: unknown, defaultValue: number = 0): number {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : defaultValue;
  }
  
  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    return Number.isFinite(parsed) ? parsed : defaultValue;
  }
  
  if (typeof value === 'bigint') {
    // Convert BigInt to number, clamping if necessary
    const num = Number(value);
    return clampToSafe(num).value;
  }
  
  return defaultValue;
}
