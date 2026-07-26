/**
 * Boundary tests for the seams extracted out of `src/modContent/index.ts`
 * during the 6.0.0 split.
 *
 * The point is not to re-test integration behaviour (that lives in the
 * controller/executor suites) but to pin the contract each extracted module now
 * publishes, so a future move cannot quietly change a fingerprint input, a
 * normalisation rule, or a ModAPI probe.
 */

import {
  computeObservedMaxStability,
  extractBuffInfo,
  extractCapCandidate,
  findPositiveGameNumber,
  normalizeChance,
  normalizeConditionKey,
  normalizeRuntimeCostPercentage,
  pickPositiveGameNumber,
  resolveDomProgressTarget,
  resolveMaxToxicityCap,
  sanitizeNativeCraftingVariables,
  serializeCraftingBuffs,
  serializeQuickAccessInventory,
  serializeTechniqueCooldowns,
  toFiniteNumber,
  toFinitePositiveNumber,
} from '../modContent/craftStateExtraction';
import {
  findFirstFunction,
  getModApiCompletionBonusBuffKey,
  getPathValue,
  normalizeBuffKey,
} from '../modContent/modApiProviders';
import { integrationDiagnostics } from '../modContent/craftSession';
import type { CraftingBuff, CraftingTechnique } from 'afnm-types';

describe('craftStateExtraction: fingerprint serializers', () => {
  it('serializes buffs order-independently so equal state yields one signature', () => {
    const a = [
      { name: 'Focused Qi', stacks: 2 },
      { name: 'Turbid Qi', stacks: 1 },
    ] as unknown as CraftingBuff[];
    const b = [
      { name: 'turbid qi', stacks: 1 },
      { name: '  Focused Qi ', stacks: 2 },
    ] as unknown as CraftingBuff[];

    expect(serializeCraftingBuffs(a)).toBe(serializeCraftingBuffs(b));
    expect(serializeCraftingBuffs(a)).toBe('focused qi:2|turbid qi:1');
  });

  it('reports no buffs and no cooldowns as an explicit token', () => {
    expect(serializeCraftingBuffs(undefined)).toBe('none');
    expect(serializeCraftingBuffs([])).toBe('none');
    expect(serializeTechniqueCooldowns(undefined)).toBe('none');
    expect(
      serializeTechniqueCooldowns([
        { name: 'Focused Refine', currentCooldown: 0 },
      ] as unknown as CraftingTechnique[]),
    ).toBe('none');
  });

  it('keeps only techniques that are actually on cooldown', () => {
    const techniques = [
      { name: 'Explosive Fusion', currentCooldown: 3 },
      { name: 'Focused Refine', currentCooldown: 0 },
      { name: 'Disciplined Touch', currentCooldown: 1 },
    ] as unknown as CraftingTechnique[];

    expect(serializeTechniqueCooldowns(techniques)).toBe(
      'disciplined_touch:1|explosive_fusion:3',
    );
  });

  it('serializes quick-access stacks and treats a missing item as zero', () => {
    expect(
      serializeQuickAccessInventory(
        ['Qi Pill', 'Missing Pill'],
        [{ name: 'Qi Pill', stacks: 4 }],
      ),
    ).toBe('qi pill:4|missing pill:0');
    expect(serializeQuickAccessInventory(['Qi Pill'], [])).toBe('none');
    expect(serializeQuickAccessInventory([], [{ name: 'Qi Pill' }])).toBe(
      'none',
    );
  });
});

describe('craftStateExtraction: numeric normalisation', () => {
  it('treats a chance above 1 as a percentage', () => {
    expect(normalizeChance(65)).toBeCloseTo(0.65);
    expect(normalizeChance(0.65)).toBeCloseTo(0.65);
    expect(normalizeChance(undefined)).toBe(0);
    expect(normalizeChance(Number.NaN)).toBe(0);
  });

  it('maps the runtime cost baseline of 0 onto the optimizer baseline of 100', () => {
    expect(normalizeRuntimeCostPercentage(0)).toBe(100);
    expect(normalizeRuntimeCostPercentage(undefined)).toBe(100);
    expect(normalizeRuntimeCostPercentage('nonsense')).toBe(100);
    expect(normalizeRuntimeCostPercentage(80)).toBe(80);
  });

  it('folds every runtime condition spelling onto the optimizer key', () => {
    expect(normalizeConditionKey('harmonious')).toBe('positive');
    expect(normalizeConditionKey('Brilliant')).toBe('veryPositive');
    expect(normalizeConditionKey('excellent')).toBe('veryPositive');
    expect(normalizeConditionKey('resistant')).toBe('negative');
    expect(normalizeConditionKey('corrupted')).toBe('veryNegative');
    expect(normalizeConditionKey('balanced')).toBe('neutral');
    expect(normalizeConditionKey(undefined)).toBe('neutral');
    expect(normalizeConditionKey('something new')).toBe('neutral');
  });

  it('separates "finite" from "finite and positive"', () => {
    expect(toFiniteNumber('-5')).toBe(-5);
    expect(toFiniteNumber(0)).toBe(0);
    expect(toFiniteNumber(Infinity)).toBeUndefined();
    expect(toFinitePositiveNumber(0)).toBeUndefined();
    expect(toFinitePositiveNumber('12')).toBe(12);
  });

  it('picks the first positive candidate and otherwise the fallback', () => {
    expect(findPositiveGameNumber([undefined, 0, -1, '9k', 5])).toBe(9000);
    expect(findPositiveGameNumber([undefined, 0])).toBeUndefined();
    expect(pickPositiveGameNumber([null, 0], 60)).toBe(60);
  });

  it('keeps only finite entries when sanitizing native crafting variables', () => {
    expect(
      sanitizeNativeCraftingVariables({
        control: 120,
        intensity: 'nonsense',
        power: '80',
      }),
    ).toEqual({ control: 120, power: 80 });
    expect(
      sanitizeNativeCraftingVariables({ control: 'nonsense' }),
    ).toBeUndefined();
    expect(sanitizeNativeCraftingVariables(null)).toBeUndefined();
  });
});

describe('craftStateExtraction: observed maximum stability', () => {
  it('subtracts the runtime stability penalty from the target', () => {
    expect(
      computeObservedMaxStability({ stabilityPenalty: 15 } as never, 60, 1),
    ).toBe(45);
  });

  it('never reports a negative maximum', () => {
    expect(
      computeObservedMaxStability({ stabilityPenalty: 90 } as never, 60, 1),
    ).toBe(0);
  });

  it('falls back when no target is known', () => {
    expect(computeObservedMaxStability(undefined, 0, 42)).toBe(42);
  });
});

describe('craftStateExtraction: buff info', () => {
  it('reads control and intensity buff durations off live buffs', () => {
    const info = extractBuffInfo([
      { name: 'Control Up', stacks: 3 },
    ] as unknown as CraftingBuff[]);
    expect(info.controlBuffTurns).toBeGreaterThanOrEqual(0);
    expect(info.controlBuffMultiplier).toBeGreaterThan(1);
  });

  it('returns the neutral shape when there are no buffs', () => {
    expect(extractBuffInfo(undefined)).toEqual({
      controlBuffTurns: 0,
      intensityBuffTurns: 0,
      controlBuffMultiplier: 1.4,
      intensityBuffMultiplier: 1.4,
    });
  });
});

describe('craftStateExtraction: cap candidates', () => {
  it('reads a cap from a flat value or a nested runtime shape', () => {
    expect(extractCapCandidate({ maxCompletion: 900 }, ['maxCompletion'])).toBe(
      900,
    );
    expect(
      extractCapCandidate({ completion: { flat: 900 } }, ['completion']),
    ).toBe(900);
    expect(
      extractCapCandidate({ completion: { max: 900 } }, ['completion']),
    ).toBe(900);
    expect(
      extractCapCandidate({ completion: 0 }, ['completion']),
    ).toBeUndefined();
    expect(extractCapCandidate(undefined, ['completion'])).toBeUndefined();
  });
});

describe('craftStateExtraction: DOM progress target', () => {
  const recipeStats = undefined;

  it('ignores a non-positive DOM reading', () => {
    expect(
      resolveDomProgressTarget({
        domTarget: 0,
        cap: 900,
        recipe: undefined,
        recipeStats,
      }),
    ).toBeUndefined();
  });

  it('keeps the DOM reading when no cap fallback applies', () => {
    expect(
      resolveDomProgressTarget({
        domTarget: 500,
        cap: undefined,
        recipe: undefined,
        recipeStats,
      }),
    ).toBe(500);
  });
});

describe('modApiProviders: defensive probes', () => {
  // Jest runs in the `node` environment, so the seams' `window` accesses need a
  // stand-in global - the same pattern the executor suite uses.
  let originalWindow: typeof global.window | undefined;

  beforeEach(() => {
    originalWindow = (global as any).window;
    (global as any).window = {};
  });

  afterEach(() => {
    (global as any).window = originalWindow;
  });

  const setModApi = (modApi: unknown): void => {
    (global as any).window = { modAPI: modApi };
  };

  it('walks a path without throwing on a missing segment', () => {
    expect(getPathValue({ a: { b: { c: 1 } } }, ['a', 'b', 'c'])).toBe(1);
    expect(getPathValue({ a: {} }, ['a', 'b', 'c'])).toBeUndefined();
    expect(getPathValue(undefined, ['a'])).toBeUndefined();
  });

  it('returns the first path that resolves to a function', () => {
    const wanted = (): number => 1;
    const root = { a: { notAFunction: 2 }, b: { fn: wanted } };
    expect(
      findFirstFunction(root, [
        ['a', 'notAFunction'],
        ['b', 'fn'],
      ]),
    ).toBe(wanted);
    expect(findFirstFunction(root, [['nope']])).toBeUndefined();
  });

  it('normalizes a ModAPI buff name the same way craft buffs are keyed', () => {
    expect(normalizeBuffKey('  Completion Bonus ')).toBe('completion_bonus');
    expect(normalizeBuffKey(undefined)).toBe('');
  });

  it('records the ModAPI completion-bonus buff name only when the runtime offers one', () => {
    integrationDiagnostics.usingModApiCompletionBonusBuffName = false;
    setModApi({ utils: { completionBonusBuffName: '   ' } });
    expect(getModApiCompletionBonusBuffKey()).toBeUndefined();
    expect(integrationDiagnostics.usingModApiCompletionBonusBuffName).toBe(
      false,
    );

    setModApi({ utils: { completionBonusBuffName: 'Completion Bonus' } });
    expect(getModApiCompletionBonusBuffKey()).toBe('completion_bonus');
    expect(integrationDiagnostics.usingModApiCompletionBonusBuffName).toBe(
      true,
    );
  });

  it('leaves the toxicity cap alone when the ModAPI getter is missing', () => {
    setModApi(undefined);
    expect(resolveMaxToxicityCap('Qi Condensation', 120)).toBe(120);
  });

  it('prefers the ModAPI toxicity cap and records that it was used', () => {
    integrationDiagnostics.usingModApiMaxToxicityGetter = false;
    setModApi({ utils: { getMaxToxicity: () => 250 } });
    expect(resolveMaxToxicityCap('Qi Condensation', 120)).toBe(250);
    expect(integrationDiagnostics.usingModApiMaxToxicityGetter).toBe(true);
  });

  it('falls back when the ModAPI toxicity getter throws', () => {
    setModApi({
      utils: {
        getMaxToxicity: () => {
          throw new Error('boom');
        },
      },
    });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    expect(resolveMaxToxicityCap('Qi Condensation', 120)).toBe(120);
    warn.mockRestore();
  });
});
