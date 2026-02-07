/**
 * Harmony System Tests
 *
 * Validates all 4 harmony types against game code behavior:
 * - Forge Works (heat gauge)
 * - Alchemical Arts (combo system)
 * - Inscribed Patterns (block patterns)
 * - Spiritual Resonance (resonance building)
 */

import {
  processHarmonyEffect,
  initHarmonyData,
  getHarmonyStatModifiers,
  INSCRIBED_PATTERN_BLOCK,
} from '../optimizer/harmony';
import { CraftingState } from '../optimizer/state';
import {
  applySkill,
  calculateSkillGains,
  OptimizerConfig,
  SkillDefinition,
  DEFAULT_CONFIG,
} from '../optimizer/skills';
import { BuffType } from '../optimizer/state';
import { HarmonyData, TechniqueType } from '../optimizer/gameTypes';

const makeSkill = (type: TechniqueType, name?: string): SkillDefinition => ({
  name: name || type,
  key: (name || type).toLowerCase().replace(/\s+/g, '_'),
  qiCost: 0,
  stabilityCost: 5,
  baseCompletionGain: type === 'fusion' ? 1.0 : 0,
  basePerfectionGain: type === 'refine' ? 1.0 : 0,
  stabilityGain: type === 'stabilize' ? 20 : 0,
  maxStabilityChange: 0,
  buffType: BuffType.NONE,
  buffDuration: 0,
  buffMultiplier: 1,
  type,
  scalesWithIntensity: type === 'fusion',
  scalesWithControl: type === 'refine',
  preventsMaxStabilityDecay: type === 'stabilize',
});

// ============================================================
// Forge Works
// ============================================================

describe('Forge Works', () => {
  it('should initialize with heat 0 and recommend fusion', () => {
    const hd = initHarmonyData('forge');
    expect(hd.forgeWorks?.heat).toBe(0);
    expect(hd.recommendedTechniqueTypes).toEqual(['fusion']);
  });

  it('should increase heat by 2 for fusion', () => {
    const hd = initHarmonyData('forge');
    const result = processHarmonyEffect(hd, 'forge', 'fusion');
    expect(result.harmonyData.forgeWorks?.heat).toBe(2);
  });

  it('should decrease heat by 1 for non-fusion actions', () => {
    const hd: HarmonyData = { forgeWorks: { heat: 5 }, recommendedTechniqueTypes: [] };
    const result = processHarmonyEffect(hd, 'forge', 'refine');
    expect(result.harmonyData.forgeWorks?.heat).toBe(4);

    const result2 = processHarmonyEffect(hd, 'forge', 'stabilize');
    expect(result2.harmonyData.forgeWorks?.heat).toBe(4);
  });

  it('should clamp heat to [0, 10]', () => {
    const hdLow: HarmonyData = { forgeWorks: { heat: 0 }, recommendedTechniqueTypes: [] };
    const result = processHarmonyEffect(hdLow, 'forge', 'refine');
    expect(result.harmonyData.forgeWorks?.heat).toBe(0);

    const hdHigh: HarmonyData = { forgeWorks: { heat: 9 }, recommendedTechniqueTypes: [] };
    const result2 = processHarmonyEffect(hdHigh, 'forge', 'fusion');
    expect(result2.harmonyData.forgeWorks?.heat).toBe(10);
  });

  it('should give +10 harmony in sweet spot (4-6)', () => {
    const hd: HarmonyData = { forgeWorks: { heat: 3 }, recommendedTechniqueTypes: [] };
    // fusion: heat 3+2=5 (sweet spot)
    const result = processHarmonyEffect(hd, 'forge', 'fusion');
    expect(result.harmonyData.forgeWorks?.heat).toBe(5);
    expect(result.harmonyDelta).toBe(10);
  });

  it('should give -10 harmony in suboptimal zones (2-3, 7-9)', () => {
    const hd: HarmonyData = { forgeWorks: { heat: 4 }, recommendedTechniqueTypes: [] };
    // refine: heat 4-1=3 (suboptimal)
    const result = processHarmonyEffect(hd, 'forge', 'refine');
    expect(result.harmonyDelta).toBe(-10);
  });

  it('should give -20 harmony at extremes (0, 10)', () => {
    const hd0: HarmonyData = { forgeWorks: { heat: 0 }, recommendedTechniqueTypes: [] };
    const result0 = processHarmonyEffect(hd0, 'forge', 'refine');
    expect(result0.harmonyDelta).toBe(-20);

    const hd9: HarmonyData = { forgeWorks: { heat: 9 }, recommendedTechniqueTypes: [] };
    const result10 = processHarmonyEffect(hd9, 'forge', 'fusion');
    expect(result10.harmonyData.forgeWorks?.heat).toBe(10);
    expect(result10.harmonyDelta).toBe(-20);
  });

  it('should apply stat modifiers based on heat', () => {
    // Sweet spot: +50% control and intensity
    const sweet = getHarmonyStatModifiers(
      { forgeWorks: { heat: 5 }, recommendedTechniqueTypes: [] }, 'forge'
    );
    expect(sweet.controlMultiplier).toBe(1.5);
    expect(sweet.intensityMultiplier).toBe(1.5);

    // Low zone (2-3): -50% control
    const low = getHarmonyStatModifiers(
      { forgeWorks: { heat: 3 }, recommendedTechniqueTypes: [] }, 'forge'
    );
    expect(low.controlMultiplier).toBe(0.5);
    expect(low.intensityMultiplier).toBe(1);

    // High zone (7-9): -50% intensity
    const high = getHarmonyStatModifiers(
      { forgeWorks: { heat: 8 }, recommendedTechniqueTypes: [] }, 'forge'
    );
    expect(high.controlMultiplier).toBe(1);
    expect(high.intensityMultiplier).toBe(0.5);

    // Extreme 0: -1000% control
    const ext0 = getHarmonyStatModifiers(
      { forgeWorks: { heat: 0 }, recommendedTechniqueTypes: [] }, 'forge'
    );
    expect(ext0.controlMultiplier).toBe(-9);

    // Extreme 10: -1000% intensity
    const ext10 = getHarmonyStatModifiers(
      { forgeWorks: { heat: 10 }, recommendedTechniqueTypes: [] }, 'forge'
    );
    expect(ext10.intensityMultiplier).toBe(-9);
  });

  it('should recommend fusion when heat <= 4, else non-fusion', () => {
    const hd4: HarmonyData = { forgeWorks: { heat: 3 }, recommendedTechniqueTypes: [] };
    const r4 = processHarmonyEffect(hd4, 'forge', 'refine');
    // heat=2, recommend fusion
    expect(r4.harmonyData.recommendedTechniqueTypes).toEqual(['fusion']);

    const hd6: HarmonyData = { forgeWorks: { heat: 4 }, recommendedTechniqueTypes: [] };
    const r6 = processHarmonyEffect(hd6, 'forge', 'fusion');
    // heat=6, recommend non-fusion
    expect(r6.harmonyData.recommendedTechniqueTypes).toEqual(['refine', 'support', 'stabilize']);
  });
});

// ============================================================
// Alchemical Arts
// ============================================================

describe('Alchemical Arts', () => {
  it('should initialize with empty charges', () => {
    const hd = initHarmonyData('alchemical');
    expect(hd.alchemicalArts?.charges).toEqual([]);
    expect(hd.alchemicalArts?.lastCombo).toEqual([]);
  });

  it('should accumulate charges (sorted)', () => {
    let hd = initHarmonyData('alchemical');
    let result = processHarmonyEffect(hd, 'alchemical', 'refine');
    expect(result.harmonyData.alchemicalArts?.charges).toEqual(['refine']);

    result = processHarmonyEffect(result.harmonyData, 'alchemical', 'fusion');
    // sorted: fusion, refine
    expect(result.harmonyData.alchemicalArts?.charges).toEqual(['fusion', 'refine']);
  });

  it('should grant +20 harmony for valid combo', () => {
    let hd = initHarmonyData('alchemical');
    // fusion + refine + support = valid combo
    hd = processHarmonyEffect(hd, 'alchemical', 'fusion').harmonyData;
    hd = processHarmonyEffect(hd, 'alchemical', 'refine').harmonyData;
    const result = processHarmonyEffect(hd, 'alchemical', 'support');
    expect(result.harmonyDelta).toBe(20);
    expect(result.harmonyData.alchemicalArts?.charges).toEqual([]);
    expect(result.harmonyData.alchemicalArts?.lastCombo).toEqual(['fusion', 'refine', 'support']);
  });

  it('should apply correct buff for fusion+refine+stabilize combo (critchance)', () => {
    let hd = initHarmonyData('alchemical');
    hd = processHarmonyEffect(hd, 'alchemical', 'fusion').harmonyData;
    hd = processHarmonyEffect(hd, 'alchemical', 'refine').harmonyData;
    const result = processHarmonyEffect(hd, 'alchemical', 'stabilize');
    expect(result.harmonyDelta).toBe(20);
    expect(result.statModifiers.critChanceBonus).toBe(25);
    const persistent = getHarmonyStatModifiers(result.harmonyData, 'alchemical');
    expect(persistent.critChanceBonus).toBe(25);
  });

  it('should apply -20 harmony and -25% control for invalid combo', () => {
    let hd = initHarmonyData('alchemical');
    // fusion + fusion + fusion = no matching combo
    hd = processHarmonyEffect(hd, 'alchemical', 'fusion').harmonyData;
    hd = processHarmonyEffect(hd, 'alchemical', 'fusion').harmonyData;
    const result = processHarmonyEffect(hd, 'alchemical', 'fusion');
    expect(result.harmonyDelta).toBe(-20);
    expect(result.statModifiers.controlMultiplier).toBe(0.75);
    const persistent = getHarmonyStatModifiers(result.harmonyData, 'alchemical');
    expect(persistent.controlMultiplier).toBe(0.75);
  });

  it('should reset charges after combo (valid or invalid)', () => {
    let hd = initHarmonyData('alchemical');
    hd = processHarmonyEffect(hd, 'alchemical', 'fusion').harmonyData;
    hd = processHarmonyEffect(hd, 'alchemical', 'fusion').harmonyData;
    const result = processHarmonyEffect(hd, 'alchemical', 'fusion');
    expect(result.harmonyData.alchemicalArts?.charges).toEqual([]);
  });

  it('should not trigger combo with fewer than 3 charges', () => {
    let hd = initHarmonyData('alchemical');
    const r1 = processHarmonyEffect(hd, 'alchemical', 'fusion');
    expect(r1.harmonyDelta).toBe(0);
    const r2 = processHarmonyEffect(r1.harmonyData, 'alchemical', 'refine');
    expect(r2.harmonyDelta).toBe(0);
  });
});

// ============================================================
// Inscribed Patterns
// ============================================================

describe('Inscribed Patterns', () => {
  it('should initialize with full block', () => {
    const hd = initHarmonyData('inscription');
    expect(hd.inscribedPatterns?.currentBlock.sort()).toEqual(
      [...INSCRIBED_PATTERN_BLOCK].sort()
    );
    expect(hd.inscribedPatterns?.stacks).toBe(0);
  });

  it('should grant +10 harmony and +1 stack for valid action', () => {
    const hd = initHarmonyData('inscription');
    const result = processHarmonyEffect(hd, 'inscription', 'fusion');
    expect(result.harmonyDelta).toBe(10);
    expect(result.harmonyData.inscribedPatterns?.stacks).toBe(1);
    // Block should have one fewer 'fusion'
    expect(result.harmonyData.inscribedPatterns?.currentBlock).not.toContain('fusion');
  });

  it('should penalize invalid action: -20 harmony, stacks halved, +1 stabilityPenalty, -25 pool', () => {
    // Set up with some stacks
    let hd = initHarmonyData('inscription');
    // Build 4 stacks via valid actions (stabilize, support, fusion, refine)
    hd = processHarmonyEffect(hd, 'inscription', 'stabilize').harmonyData;
    hd = processHarmonyEffect(hd, 'inscription', 'support').harmonyData;
    hd = processHarmonyEffect(hd, 'inscription', 'fusion').harmonyData;
    hd = processHarmonyEffect(hd, 'inscription', 'refine').harmonyData;
    expect(hd.inscribedPatterns?.stacks).toBe(4);

    // Only 'refine' left in block. Using 'fusion' is invalid.
    const result = processHarmonyEffect(hd, 'inscription', 'fusion');
    expect(result.harmonyDelta).toBe(-20);
    expect(result.harmonyData.inscribedPatterns?.stacks).toBe(2); // floor(4 * 0.5)
    expect(result.stabilityPenaltyDelta).toBe(1);
    expect(result.poolDelta).toBe(-25);
  });

  it('should reset block after completing all 5 actions', () => {
    let hd = initHarmonyData('inscription');
    // Complete full block: stabilize, support, fusion, refine, refine
    hd = processHarmonyEffect(hd, 'inscription', 'stabilize').harmonyData;
    hd = processHarmonyEffect(hd, 'inscription', 'support').harmonyData;
    hd = processHarmonyEffect(hd, 'inscription', 'fusion').harmonyData;
    hd = processHarmonyEffect(hd, 'inscription', 'refine').harmonyData;
    const result = processHarmonyEffect(hd, 'inscription', 'refine');
    expect(result.harmonyData.inscribedPatterns?.completedBlocks).toBe(1);
    expect(result.harmonyData.inscribedPatterns?.stacks).toBe(5);
    expect(result.harmonyData.inscribedPatterns?.currentBlock.sort()).toEqual(
      [...INSCRIBED_PATTERN_BLOCK].sort()
    );
  });

  it('should provide +2% control and intensity per stack', () => {
    const hd: HarmonyData = {
      inscribedPatterns: {
        currentBlock: [...INSCRIBED_PATTERN_BLOCK],
        completedBlocks: 0,
        stacks: 10,
      },
      recommendedTechniqueTypes: [],
    };
    const mods = getHarmonyStatModifiers(hd, 'inscription');
    expect(mods.controlMultiplier).toBeCloseTo(1.2); // 10 * 0.02 = 0.2
    expect(mods.intensityMultiplier).toBeCloseTo(1.2);
  });
});

// ============================================================
// Spiritual Resonance
// ============================================================

describe('Spiritual Resonance', () => {
  it('should initialize with no resonance', () => {
    const hd = initHarmonyData('resonance');
    expect(hd.resonance?.resonance).toBeUndefined();
    expect(hd.resonance?.strength).toBe(0);
  });

  it('should start resonance on first action', () => {
    const hd = initHarmonyData('resonance');
    const result = processHarmonyEffect(hd, 'resonance', 'fusion');
    expect(result.harmonyData.resonance?.resonance).toBe('fusion');
    expect(result.harmonyData.resonance?.strength).toBe(1);
    expect(result.harmonyDelta).toBe(0); // First action doesn't give harmony
  });

  it('should build strength and gain harmony on same-type actions', () => {
    let hd = initHarmonyData('resonance');
    hd = processHarmonyEffect(hd, 'resonance', 'fusion').harmonyData;
    // Second fusion
    const r2 = processHarmonyEffect(hd, 'resonance', 'fusion');
    expect(r2.harmonyData.resonance?.strength).toBe(2);
    expect(r2.harmonyDelta).toBe(6); // 3 * 2
    // Third fusion
    const r3 = processHarmonyEffect(r2.harmonyData, 'resonance', 'fusion');
    expect(r3.harmonyData.resonance?.strength).toBe(3);
    expect(r3.harmonyDelta).toBe(9); // 3 * 3
  });

  it('should penalize first different-type action: -9 harmony, -3 stability, -1 strength', () => {
    let hd = initHarmonyData('resonance');
    hd = processHarmonyEffect(hd, 'resonance', 'fusion').harmonyData;
    hd = processHarmonyEffect(hd, 'resonance', 'fusion').harmonyData;
    // strength=2, now refine
    const result = processHarmonyEffect(hd, 'resonance', 'refine');
    expect(result.harmonyDelta).toBe(-9);
    expect(result.stabilityDelta).toBe(-3);
    expect(result.harmonyData.resonance?.strength).toBe(1); // 2 - 1
    expect(result.harmonyData.resonance?.pendingResonance).toBe('refine');
    expect(result.harmonyData.resonance?.pendingCount).toBe(1);
  });

  it('should switch resonance after 2 consecutive different-type actions', () => {
    let hd = initHarmonyData('resonance');
    hd = processHarmonyEffect(hd, 'resonance', 'fusion').harmonyData;
    hd = processHarmonyEffect(hd, 'resonance', 'fusion').harmonyData;
    // strength=2, switch to refine
    hd = processHarmonyEffect(hd, 'resonance', 'refine').harmonyData;
    // pendingCount=1, second refine should switch without penalty
    const result = processHarmonyEffect(hd, 'resonance', 'refine');
    expect(result.harmonyData.resonance?.resonance).toBe('refine');
    expect(result.harmonyData.resonance?.pendingResonance).toBeUndefined();
    expect(result.harmonyData.resonance?.pendingCount).toBe(0);
    // No penalty on second action of change
    expect(result.harmonyDelta).toBe(0);
    expect(result.stabilityDelta).toBe(0);
  });

  it('should provide +3% critchance and +3% successChanceBonus per strength', () => {
    const hd: HarmonyData = {
      resonance: { resonance: 'fusion', strength: 5, pendingCount: 0 },
      recommendedTechniqueTypes: [],
    };
    const mods = getHarmonyStatModifiers(hd, 'resonance');
    expect(mods.critChanceBonus).toBe(15); // 5 * 3
    expect(mods.successChanceBonus).toBeCloseTo(0.15); // 5 * 0.03
  });

  it('should recommend current resonance type', () => {
    let hd = initHarmonyData('resonance');
    const result = processHarmonyEffect(hd, 'resonance', 'refine');
    expect(result.harmonyData.recommendedTechniqueTypes).toEqual(['refine']);
  });
});

// ============================================================
// Integration with applySkill
// ============================================================

describe('Harmony integration with applySkill', () => {
  const sublimeConfig: OptimizerConfig = {
    ...DEFAULT_CONFIG,
    isSublimeCraft: true,
    craftingType: 'forge',
    targetMultiplier: 2.0,
    skills: [makeSkill('fusion'), makeSkill('refine'), makeSkill('stabilize')],
  };

  it('should update harmony data when applying skills in sublime mode', () => {
    const hd = initHarmonyData('forge');
    const state = new CraftingState({
      qi: 200,
      stability: 50,
      initialMaxStability: 60,
      harmony: 0,
      harmonyData: hd,
    });

    // Apply fusion: heat should go from 0 to 2
    const newState = applySkill(state, makeSkill('fusion'), sublimeConfig);
    expect(newState).not.toBeNull();
    expect(newState!.harmonyData?.forgeWorks?.heat).toBe(2);
    // Heat 2 is suboptimal zone → -10 harmony
    expect(newState!.harmony).toBe(-10);
  });

  it('should not update harmony for non-sublime crafts', () => {
    const nonSublimeConfig: OptimizerConfig = {
      ...DEFAULT_CONFIG,
      isSublimeCraft: false,
      skills: [makeSkill('fusion')],
    };

    const state = new CraftingState({
      qi: 200,
      stability: 50,
      initialMaxStability: 60,
    });

    const newState = applySkill(state, makeSkill('fusion'), nonSublimeConfig);
    expect(newState).not.toBeNull();
    expect(newState!.harmony).toBe(0);
    expect(newState!.harmonyData).toBeUndefined();
  });

  it('should apply inscription penalty (stability penalty + pool loss) via applySkill', () => {
    const inscriptionConfig: OptimizerConfig = {
      ...DEFAULT_CONFIG,
      isSublimeCraft: true,
      craftingType: 'inscription',
      maxQi: 200,
      skills: [makeSkill('fusion'), makeSkill('stabilize')],
    };

    // Set up inscription state where only 'refine' is valid
    const hd: HarmonyData = {
      inscribedPatterns: {
        currentBlock: ['refine', 'refine'],
        completedBlocks: 0,
        stacks: 6,
      },
      recommendedTechniqueTypes: ['refine'],
    };

    const state = new CraftingState({
      qi: 100,
      stability: 50,
      initialMaxStability: 60,
      stabilityPenalty: 0,
      harmonyData: hd,
      harmony: 50,
    });

    // fusion is NOT in the block → invalid → penalty
    const newState = applySkill(state, makeSkill('fusion'), inscriptionConfig);
    expect(newState).not.toBeNull();
    expect(newState!.harmony).toBe(30); // 50 + (-20)
    expect(newState!.harmonyData?.inscribedPatterns?.stacks).toBe(3); // floor(6 * 0.5)
    // Pool: qiCost=0, inscription penalty=-25 → 100 - 0 - 25 = 75
    expect(newState!.qi).toBe(75);
    // stabilityPenalty: +1 from inscription + +1 from skill without preventsMaxStabilityDecay = 2
    expect(newState!.stabilityPenalty).toBe(2);
  });

  it('should apply harmony stat modifiers to gain calculations', () => {
    const forgeConfig: OptimizerConfig = {
      ...DEFAULT_CONFIG,
      baseIntensity: 100,
      baseControl: 100,
      isSublimeCraft: true,
      craftingType: 'forge',
      skills: [makeSkill('fusion')],
    };

    // State at sweet spot (heat=5): +50% intensity and control
    const hdSweet: HarmonyData = {
      forgeWorks: { heat: 5 },
      recommendedTechniqueTypes: [],
    };
    const stateSweet = new CraftingState({
      qi: 200,
      stability: 50,
      initialMaxStability: 60,
      harmonyData: hdSweet,
    });

    // State NOT in sweet spot (heat=0): -1000% control
    const hdBad: HarmonyData = {
      forgeWorks: { heat: 0 },
      recommendedTechniqueTypes: [],
    };
    const stateBad = new CraftingState({
      qi: 200,
      stability: 50,
      initialMaxStability: 60,
      harmonyData: hdBad,
    });

    const fusionSkill = makeSkill('fusion');
    const gainsSweet = calculateSkillGains(stateSweet, fusionSkill, forgeConfig);
    const gainsBad = calculateSkillGains(stateBad, fusionSkill, forgeConfig);

    // Sweet spot should have ~50% more completion than default
    // Bad state should have near-zero or negative intensity effect
    expect(gainsSweet.completion).toBeGreaterThan(gainsBad.completion);
  });
});
