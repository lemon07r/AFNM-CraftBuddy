/**
 * Tests for large number utilities
 */

import {
  isSafeNumber,
  clampToSafe,
  safeAdd,
  safeMultiply,
  safeFloor,
  formatLargeNumber,
  formatCompact,
  formatProgress,
  safePercentage,
  formatPercentage,
  checkPrecision,
  safeEquals,
  parseGameNumber,
  MAX_SAFE_VALUE,
  LARGE_NUMBER_THRESHOLD,
} from '../utils/largeNumbers';

describe('isSafeNumber', () => {
  it('should return true for normal numbers', () => {
    expect(isSafeNumber(0)).toBe(true);
    expect(isSafeNumber(100)).toBe(true);
    expect(isSafeNumber(-100)).toBe(true);
    expect(isSafeNumber(1000000)).toBe(true);
    expect(isSafeNumber(Number.MAX_SAFE_INTEGER)).toBe(true);
  });

  it('should return false for non-finite numbers', () => {
    expect(isSafeNumber(Infinity)).toBe(false);
    expect(isSafeNumber(-Infinity)).toBe(false);
    expect(isSafeNumber(NaN)).toBe(false);
  });
});

describe('clampToSafe', () => {
  it('should not clamp normal numbers', () => {
    const result = clampToSafe(1000);
    expect(result.value).toBe(1000);
    expect(result.clamped).toBe(false);
  });

  it('should clamp very large numbers', () => {
    const result = clampToSafe(Number.MAX_SAFE_INTEGER + 1000000);
    expect(result.value).toBe(MAX_SAFE_VALUE);
    expect(result.clamped).toBe(true);
  });

  it('should clamp very negative numbers', () => {
    const result = clampToSafe(-Number.MAX_SAFE_INTEGER - 1000000);
    expect(result.value).toBe(-MAX_SAFE_VALUE);
    expect(result.clamped).toBe(true);
  });

  it('should handle Infinity', () => {
    const result = clampToSafe(Infinity);
    expect(result.value).toBe(MAX_SAFE_VALUE);
    expect(result.clamped).toBe(true);
  });

  it('should handle NaN', () => {
    const result = clampToSafe(NaN);
    expect(result.value).toBe(MAX_SAFE_VALUE);
    expect(result.clamped).toBe(true);
  });
});

describe('safeAdd', () => {
  it('should add normal numbers', () => {
    expect(safeAdd(100, 200)).toBe(300);
    expect(safeAdd(-50, 100)).toBe(50);
  });

  it('should clamp overflow results', () => {
    const result = safeAdd(MAX_SAFE_VALUE, MAX_SAFE_VALUE);
    expect(result).toBe(MAX_SAFE_VALUE);
  });
});

describe('safeMultiply', () => {
  it('should multiply normal numbers', () => {
    expect(safeMultiply(10, 20)).toBe(200);
    expect(safeMultiply(-5, 10)).toBe(-50);
  });

  it('should clamp overflow results', () => {
    const result = safeMultiply(MAX_SAFE_VALUE, 2);
    expect(result).toBe(MAX_SAFE_VALUE);
  });
});

describe('safeFloor', () => {
  it('should floor normal numbers', () => {
    expect(safeFloor(10.7)).toBe(10);
    expect(safeFloor(10.2)).toBe(10);
    expect(safeFloor(-10.7)).toBe(-11);
  });

  it('should handle non-finite numbers', () => {
    expect(safeFloor(Infinity)).toBe(0);
    expect(safeFloor(NaN)).toBe(0);
  });
});

describe('formatLargeNumber', () => {
  it('should format small numbers with commas', () => {
    expect(formatLargeNumber(1234)).toBe('1,234');
    expect(formatLargeNumber(999)).toBe('999');
  });

  it('should format thousands with K suffix', () => {
    expect(formatLargeNumber(12345)).toBe('12.35K');
    expect(formatLargeNumber(100000)).toBe('100K');
  });

  it('should format millions with M suffix', () => {
    expect(formatLargeNumber(1234567)).toBe('1.23M');
    expect(formatLargeNumber(50000000)).toBe('50M');
  });

  it('should format billions with B suffix', () => {
    expect(formatLargeNumber(1234567890)).toBe('1.23B');
  });

  it('should format trillions with T suffix', () => {
    expect(formatLargeNumber(1234567890000)).toBe('1.23T');
  });

  it('should format quadrillions with Q suffix', () => {
    expect(formatLargeNumber(1234567890000000)).toBe('1.23Q');
  });

  it('should handle negative numbers', () => {
    expect(formatLargeNumber(-1234567)).toBe('-1.23M');
  });

  it('should handle Infinity', () => {
    expect(formatLargeNumber(Infinity)).toBe('∞');
  });

  it('should respect custom decimals', () => {
    expect(formatLargeNumber(1234567, 1)).toBe('1.2M');
    expect(formatLargeNumber(1234567, 0)).toBe('1M');
  });
});

describe('formatCompact', () => {
  it('should use 1 decimal place', () => {
    expect(formatCompact(1234567)).toBe('1.2M');
  });

  it('should use lower threshold', () => {
    expect(formatCompact(1500)).toBe('1.5K');
  });
});

describe('formatProgress', () => {
  it('should format small progress normally', () => {
    expect(formatProgress(50, 100)).toBe('50/100');
  });

  it('should format large progress with compact notation', () => {
    expect(formatProgress(500000, 1000000)).toBe('500K/1M');
  });

  it('should handle mixed sizes', () => {
    expect(formatProgress(5000, 100000)).toBe('5K/100K');
  });
});

describe('safePercentage', () => {
  it('should calculate percentage correctly', () => {
    expect(safePercentage(50, 100)).toBe(50);
    expect(safePercentage(25, 100)).toBe(25);
    expect(safePercentage(150, 100)).toBe(150);
  });

  it('should handle zero target', () => {
    expect(safePercentage(50, 0)).toBe(100);
    expect(safePercentage(0, 0)).toBe(0);
  });

  it('should handle negative target', () => {
    expect(safePercentage(50, -100)).toBe(100);
  });
});

describe('formatPercentage', () => {
  it('should format percentage correctly', () => {
    expect(formatPercentage(50, 100)).toBe('50%');
    expect(formatPercentage(33, 100, 1)).toBe('33.0%');
  });
});

describe('checkPrecision', () => {
  // Suppress console.warn during tests
  const originalWarn = console.warn;
  beforeEach(() => {
    console.warn = jest.fn();
  });
  afterEach(() => {
    console.warn = originalWarn;
  });

  it('should return true for safe numbers', () => {
    expect(checkPrecision(1000, 'test')).toBe(true);
    expect(checkPrecision(1000000000, 'test')).toBe(true);
  });

  it('should return false and warn for very large numbers', () => {
    expect(checkPrecision(Number.MAX_SAFE_INTEGER / 500, 'test')).toBe(false);
    expect(console.warn).toHaveBeenCalled();
  });

  it('should return false for non-finite numbers', () => {
    expect(checkPrecision(Infinity, 'test')).toBe(false);
    expect(checkPrecision(NaN, 'test')).toBe(false);
  });
});

describe('safeEquals', () => {
  it('should return true for equal numbers', () => {
    expect(safeEquals(100, 100)).toBe(true);
    expect(safeEquals(0, 0)).toBe(true);
  });

  it('should return false for different numbers', () => {
    expect(safeEquals(100, 101)).toBe(false);
  });

  it('should handle floating point comparison', () => {
    expect(safeEquals(0.1 + 0.2, 0.3)).toBe(true);
  });

  it('should handle large number comparison', () => {
    const large = 1e15;
    expect(safeEquals(large, large + 1)).toBe(true); // Within relative epsilon
    expect(safeEquals(large, large + 1e10)).toBe(false); // Outside epsilon
  });
});

describe('parseGameNumber', () => {
  it('should parse numbers', () => {
    expect(parseGameNumber(100)).toBe(100);
    expect(parseGameNumber(0)).toBe(0);
  });

  it('should parse strings', () => {
    expect(parseGameNumber('100')).toBe(100);
    expect(parseGameNumber('1.5e6')).toBe(1500000);
  });

  it('should handle invalid inputs', () => {
    expect(parseGameNumber(undefined)).toBe(0);
    expect(parseGameNumber(null)).toBe(0);
    expect(parseGameNumber('invalid')).toBe(0);
    expect(parseGameNumber(NaN)).toBe(0);
  });

  it('should use default value for invalid inputs', () => {
    expect(parseGameNumber(undefined, 50)).toBe(50);
    expect(parseGameNumber('invalid', 100)).toBe(100);
  });

  it('should handle BigInt', () => {
    expect(parseGameNumber(BigInt(1000))).toBe(1000);
  });

  it('should parse common numeric object shapes', () => {
    expect(parseGameNumber({ value: 42 })).toBe(42);
    expect(parseGameNumber({ flat: '17' })).toBe(17);
    expect(parseGameNumber({ current: { value: '9' } })).toBe(9);
  });
});

describe('constants', () => {
  it('should have reasonable MAX_SAFE_VALUE', () => {
    expect(MAX_SAFE_VALUE).toBeLessThan(Number.MAX_SAFE_INTEGER);
    expect(MAX_SAFE_VALUE).toBeGreaterThan(Number.MAX_SAFE_INTEGER - 10000000);
  });

  it('should have reasonable LARGE_NUMBER_THRESHOLD', () => {
    expect(LARGE_NUMBER_THRESHOLD).toBe(10000);
  });
});
