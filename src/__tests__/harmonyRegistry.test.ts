/**
 * Harmony registry parity tests (AFNM 0.7.5).
 *
 * Values verified against the installed runtime 0.7.5-d764178 harmony config
 * registry (`GH` in `dist-electron/_rolldown_dynamic_import_helper.js`).
 */

import {
  HARMONY_TYPES,
  FORMLESS_HARMONY,
  DEFAULT_STARTING_HARMONY,
  BODY_FORGING_STARTING_HARMONY,
  applyComplexityMultiplier,
  getComplexityMultiplier,
  getHarmonyDefinition,
  isHarmonyType,
  normalizeHarmonyType,
  removeComplexityMultiplier,
  resolveStartingHarmony,
} from '../optimizer/harmonyRegistry';
import type { HarmonyType } from '../optimizer/gameTypes';

const EXPECTED_COMPLEXITY: Record<HarmonyType, number> = {
  forge: 1.2,
  alchemical: 1.2,
  inscription: 0.9,
  resonance: 1.3,
  formless: 1.5,
  enhancingEcho: 1.3,
  eccentricDecree: 1,
};

describe('harmony registry', () => {
  it('exposes all seven 0.7.5 harmony types', () => {
    expect(HARMONY_TYPES).toEqual([
      'forge',
      'alchemical',
      'inscription',
      'resonance',
      'formless',
      'enhancingEcho',
      'eccentricDecree',
    ]);
  });

  it.each(HARMONY_TYPES)(
    'matches the runtime complexity multiplier for %s',
    (harmonyType) => {
      expect(getComplexityMultiplier(harmonyType)).toBe(
        EXPECTED_COMPLEXITY[harmonyType],
      );
    },
  );

  it('only Enhancing Echo modifies action costs', () => {
    for (const harmonyType of HARMONY_TYPES) {
      expect(getHarmonyDefinition(harmonyType)?.modifiesActionCosts).toBe(
        harmonyType === 'enhancingEcho',
      );
    }
  });

  it('only Formless Way pins harmony, at its peak of 33', () => {
    for (const harmonyType of HARMONY_TYPES) {
      const definition = getHarmonyDefinition(harmonyType);
      expect(definition?.pinsHarmony).toBe(harmonyType === 'formless');
      expect(definition?.startingHarmony).toBe(
        harmonyType === 'formless' ? FORMLESS_HARMONY : 0,
      );
    }
    expect(FORMLESS_HARMONY).toBe(33);
  });

  it('recognizes and normalizes harmony ids', () => {
    expect(isHarmonyType('eccentricDecree')).toBe(true);
    expect(isHarmonyType('equipment')).toBe(false);
    expect(normalizeHarmonyType('  ENHANCINGECHO ')).toBe('enhancingEcho');
    expect(normalizeHarmonyType('')).toBeUndefined();
    expect(normalizeHarmonyType(null)).toBeUndefined();
  });

  it('degrades unknown harmony ids to a neutral multiplier', () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      expect(getComplexityMultiplier('mysteryWay' as HarmonyType)).toBe(1);
      expect(getComplexityMultiplier('mysteryWay' as HarmonyType)).toBe(1);
      expect(warn).toHaveBeenCalledTimes(1);
    } finally {
      warn.mockRestore();
    }
  });

  describe('complexity multiplier application', () => {
    it('rounds sublime targets like the game', () => {
      // Runtime: recipeStats.completion = Math.round(completion * cm)
      expect(applyComplexityMultiplier(175, 'formless', true)).toBe(263);
      expect(applyComplexityMultiplier(175, 'inscription', true)).toBe(158);
      expect(applyComplexityMultiplier(175, 'resonance', true)).toBe(228);
      expect(applyComplexityMultiplier(175, 'eccentricDecree', true)).toBe(175);
    });

    it('only applies to sublime crafts', () => {
      expect(applyComplexityMultiplier(175, 'formless', false)).toBe(175);
    });

    it('round-trips through the inverse helper', () => {
      const scaled = applyComplexityMultiplier(200, 'resonance', true);
      expect(removeComplexityMultiplier(scaled, 'resonance', true)).toBe(200);
    });

    it('treats a non-positive multiplier as neutral', () => {
      expect(applyComplexityMultiplier(175, undefined, true)).toBe(175);
      expect(removeComplexityMultiplier(175, undefined, true)).toBe(175);
    });
  });

  describe('starting harmony', () => {
    it('uses the harmony definition for sublime crafts', () => {
      expect(
        resolveStartingHarmony({ harmonyType: 'formless', isSublimeCraft: true }),
      ).toBe(33);
      expect(
        resolveStartingHarmony({ harmonyType: 'forge', isSublimeCraft: true }),
      ).toBe(0);
    });

    it('uses 25 for normal crafts and 50 in Body Forging', () => {
      expect(
        resolveStartingHarmony({ harmonyType: 'forge', isSublimeCraft: false }),
      ).toBe(DEFAULT_STARTING_HARMONY);
      expect(
        resolveStartingHarmony({
          harmonyType: 'forge',
          isSublimeCraft: false,
          realm: 'bodyForging',
        }),
      ).toBe(BODY_FORGING_STARTING_HARMONY);
    });
  });
});
