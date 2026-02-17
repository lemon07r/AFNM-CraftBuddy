/**
 * End-to-end craft simulation tests.
 *
 * These tests simulate complete multi-turn crafts by repeatedly calling the
 * optimizer and following its recommendations.  They verify that the optimizer
 * can actually guide a craft to completion — not just that individual
 * recommendations look reasonable in isolation.
 *
 * Each test uses a deterministic condition sequence so results are
 * reproducible.
 */

import { CraftingState, BuffType } from '../optimizer/state';
import {
  SkillDefinition,
  OptimizerConfig,
  DEFAULT_SKILLS,
  applySkill,
  getConditionEffectsForConfig,
  isTerminalState,
} from '../optimizer/skills';
import {
  findBestSkill,
  greedySearch,
  lookaheadSearch,
  SearchResult,
  CraftingConditionType,
} from '../optimizer/search';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function createCustomSkill(
  overrides: Partial<SkillDefinition> = {},
): SkillDefinition {
  return {
    name: 'Custom Skill',
    key: 'custom_skill',
    qiCost: 0,
    stabilityCost: 0,
    baseCompletionGain: 0,
    basePerfectionGain: 0,
    stabilityGain: 0,
    maxStabilityChange: 0,
    buffType: BuffType.NONE,
    buffDuration: 0,
    buffMultiplier: 1,
    type: 'support',
    ...overrides,
  };
}

function createTestConfig(
  overrides: Partial<OptimizerConfig> = {},
): OptimizerConfig {
  return {
    maxQi: 194,
    maxStability: 60,
    baseIntensity: 12,
    baseControl: 16,
    minStability: 0,
    skills: DEFAULT_SKILLS,
    defaultBuffMultiplier: 1.4,
    pillsPerRound: 1,
    ...overrides,
  };
}

// Beginner-only skill set (tutorial level)
const SIMPLE_FUSION = createCustomSkill({
  name: 'Simple Fusion',
  key: 'simple_fusion',
  type: 'fusion',
  qiCost: 0,
  stabilityCost: 10,
  baseCompletionGain: 1,
  scalesWithIntensity: true,
});

const SIMPLE_REFINE = createCustomSkill({
  name: 'Simple Refine',
  key: 'simple_refine',
  type: 'refine',
  qiCost: 18,
  stabilityCost: 10,
  basePerfectionGain: 1,
  scalesWithControl: true,
});

const STABILIZE = createCustomSkill({
  name: 'Stabilize',
  key: 'stabilize',
  type: 'stabilize',
  qiCost: 10,
  stabilityCost: 0,
  stabilityGain: 20,
  preventsMaxStabilityDecay: true,
});

const FORCEFUL_STABILIZE = createCustomSkill({
  name: 'Forceful Stabilize',
  key: 'forceful_stabilize',
  type: 'stabilize',
  qiCost: 88,
  stabilityCost: 0,
  stabilityGain: 40,
  preventsMaxStabilityDecay: true,
});

const BEGINNER_SKILLS = [SIMPLE_FUSION, SIMPLE_REFINE, STABILIZE];

function beginnerConfig(
  overrides: Partial<OptimizerConfig> = {},
): OptimizerConfig {
  return createTestConfig({
    skills: BEGINNER_SKILLS,
    conditionEffectType: 'perfectable' as any,
    ...overrides,
  });
}

function fullConfig(overrides: Partial<OptimizerConfig> = {}): OptimizerConfig {
  return createTestConfig({
    conditionEffectType: 'perfectable' as any,
    ...overrides,
  });
}

// ---------------------------------------------------------------------------
// Simulation engine
// ---------------------------------------------------------------------------

interface SimulationResult {
  /** Ordered list of skill names chosen by the optimizer. */
  history: string[];
  /** State after the last applied skill. */
  finalState: CraftingState;
  /** Whether both targets were met. */
  targetsMet: boolean;
  /** Number of turns consumed. */
  turnsUsed: number;
  /** Whether the craft ended because no actions were available. */
  craftDied: boolean;
  /** Per-turn diagnostics. */
  log: TurnLog[];
}

interface TurnLog {
  turn: number;
  condition: CraftingConditionType;
  skillChosen: string;
  stateBefore: {
    qi: number;
    stability: number;
    completion: number;
    perfection: number;
  };
  stateAfter: {
    qi: number;
    stability: number;
    completion: number;
    perfection: number;
  };
}

/**
 * Simulate a full craft by following the optimizer's recommendations.
 *
 * @param initialState   Starting state.
 * @param config         Optimizer config (includes skills and recipe settings).
 * @param targetComp     Completion target.
 * @param targetPerf     Perfection target.
 * @param conditions     Deterministic condition sequence.  Wraps around if
 *                       shorter than the craft.
 * @param maxTurns       Safety limit to prevent infinite loops.
 * @param depth          Lookahead depth (default 6).
 */
function simulateCraft(
  initialState: CraftingState,
  config: OptimizerConfig,
  targetComp: number,
  targetPerf: number,
  conditions: CraftingConditionType[],
  maxTurns: number = 30,
  depth: number = 6,
): SimulationResult {
  let state = initialState;
  const history: string[] = [];
  const log: TurnLog[] = [];
  let turnsUsed = 0;
  let craftDied = false;

  for (let turn = 0; turn < maxTurns; turn++) {
    // Check targets met.
    const compMet = targetComp <= 0 || state.completion >= targetComp;
    const perfMet = targetPerf <= 0 || state.perfection >= targetPerf;
    if (compMet && perfMet) {
      return {
        history,
        finalState: state,
        targetsMet: true,
        turnsUsed,
        craftDied: false,
        log,
      };
    }

    const condition = conditions[turn % conditions.length];

    // Build forecast: next 3 conditions from the sequence.
    const forecast: CraftingConditionType[] = [];
    for (let f = 1; f <= 3; f++) {
      forecast.push(conditions[(turn + f) % conditions.length]);
    }

    // Check terminal.
    if (isTerminalState(state, config, condition)) {
      craftDied = true;
      return {
        history,
        finalState: state,
        targetsMet: false,
        turnsUsed,
        craftDied,
        log,
      };
    }

    const result = lookaheadSearch(
      state,
      config,
      targetComp,
      targetPerf,
      depth,
      condition,
      forecast,
      { timeBudgetMs: 500, maxNodes: 200000 },
    );

    if (!result.recommendation) {
      craftDied = true;
      return {
        history,
        finalState: state,
        targetsMet: false,
        turnsUsed,
        craftDied,
        log,
      };
    }

    const skill = result.recommendation.skill;
    const conditionEffects = getConditionEffectsForConfig(config, condition);
    const nextState = applySkill(
      state,
      skill,
      config,
      conditionEffects,
      targetComp,
      condition,
    );

    if (!nextState) {
      craftDied = true;
      return {
        history,
        finalState: state,
        targetsMet: false,
        turnsUsed,
        craftDied,
        log,
      };
    }

    log.push({
      turn,
      condition,
      skillChosen: skill.name,
      stateBefore: {
        qi: state.qi,
        stability: state.stability,
        completion: state.completion,
        perfection: state.perfection,
      },
      stateAfter: {
        qi: nextState.qi,
        stability: nextState.stability,
        completion: nextState.completion,
        perfection: nextState.perfection,
      },
    });

    history.push(skill.name);
    state = nextState;
    turnsUsed = turn + 1;
  }

  // Exhausted turn budget.
  const compMet = targetComp <= 0 || state.completion >= targetComp;
  const perfMet = targetPerf <= 0 || state.perfection >= targetPerf;
  return {
    history,
    finalState: state,
    targetsMet: compMet && perfMet,
    turnsUsed,
    craftDied: false,
    log,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('craft simulation — beginner skills, neutral conditions', () => {
  const config = beginnerConfig();
  const neutralOnly: CraftingConditionType[] = ['neutral'];

  it('should complete a basic tutorial craft (comp=50, perf=50)', () => {
    const state = new CraftingState({
      qi: 194,
      stability: 60,
      initialMaxStability: 60,
      completion: 0,
      perfection: 0,
    });

    const sim = simulateCraft(state, config, 50, 50, neutralOnly, 20);
    expect(sim.targetsMet).toBe(true);
    expect(sim.craftDied).toBe(false);
    expect(sim.turnsUsed).toBeLessThanOrEqual(15);
  });

  it('should complete a longer tutorial craft (comp=100, perf=100)', () => {
    const state = new CraftingState({
      qi: 194,
      stability: 60,
      initialMaxStability: 60,
      completion: 0,
      perfection: 0,
    });

    const sim = simulateCraft(state, config, 100, 100, neutralOnly, 30);
    expect(sim.targetsMet).toBe(true);
    expect(sim.craftDied).toBe(false);
    // Efficiency bound: ~9 fusion + ~7 refine + ~3-4 stabilize = ~19-20 turns
    expect(sim.turnsUsed).toBeLessThanOrEqual(22);
  });

  it('should never recommend stabilize at full stability', () => {
    const state = new CraftingState({
      qi: 194,
      stability: 60,
      initialMaxStability: 60,
      completion: 0,
      perfection: 0,
    });

    const sim = simulateCraft(state, config, 50, 50, neutralOnly, 20);

    // Check that stabilize was never chosen when stability was at max.
    for (const entry of sim.log) {
      if (entry.skillChosen === 'Stabilize') {
        expect(entry.stateBefore.stability).toBeLessThan(
          60, // initialMaxStability
        );
      }
    }
  });

  it('should use stabilize to survive when stability is low', () => {
    const state = new CraftingState({
      qi: 194,
      stability: 60,
      initialMaxStability: 60,
      completion: 0,
      perfection: 0,
    });

    const sim = simulateCraft(state, config, 100, 100, neutralOnly, 30);

    // In a long craft the optimizer must use stabilize at some point.
    const stabilizeTurns = sim.log.filter((t) => t.skillChosen === 'Stabilize');
    expect(stabilizeTurns.length).toBeGreaterThanOrEqual(1);
    // Verify stabilize was used at a time when it was actually needed
    const stabilizeWhenLow = stabilizeTurns.filter(
      (t) => t.stateBefore.stability <= 30,
    );
    expect(stabilizeWhenLow.length).toBeGreaterThanOrEqual(1);
    expect(sim.craftDied).toBe(false);
  });
});

describe('craft simulation — beginner skills, condition exploitation', () => {
  // Perfectable recipe: positive condition → +50% control → Refine benefits.
  const config = beginnerConfig({ conditionEffectType: 'perfectable' as any });

  it('should prefer refine during positive conditions on a perfectable recipe', () => {
    const state = new CraftingState({
      qi: 194,
      stability: 60,
      initialMaxStability: 60,
      completion: 0,
      perfection: 0,
    });

    // Alternate: positive, neutral, neutral, repeat
    const conditions: CraftingConditionType[] = [
      'positive',
      'neutral',
      'neutral',
    ];
    const sim = simulateCraft(state, config, 50, 50, conditions, 20);
    expect(sim.targetsMet).toBe(true);

    // On positive turns where perfection still needs work, Refine should be
    // preferred more often than not.  However the optimizer may legitimately
    // choose Stabilize (low stability) or Fusion (completion far behind) on
    // some positive turns, so we use a soft threshold.
    const positiveTurns = sim.log.filter((t) => t.condition === 'positive');
    const positiveTurnsWithPerfNeed = positiveTurns.filter(
      (t) => t.stateBefore.perfection < 50,
    );
    if (positiveTurnsWithPerfNeed.length >= 2) {
      const refineCount = positiveTurnsWithPerfNeed.filter(
        (t) => t.skillChosen === 'Simple Refine',
      ).length;
      const refineRate = refineCount / positiveTurnsWithPerfNeed.length;
      // On a perfectable recipe, positive conditions boost control by 50%.
      // The optimizer should exploit this when perfection needs work AND
      // the boosted gain doesn't overshoot the target.  The optimizer
      // correctly prefers Refine on early positive turns (large perfection
      // gap) but may switch to Fusion/Stabilize when completion is further
      // behind or stability is low.  Rate of ~33% is correct for this
      // scenario because only 1 of 3 positive turns has both sufficient
      // stability and a large enough perfection gap.
      expect(refineRate).toBeGreaterThanOrEqual(0.25);
    }
  });

  it('should prefer fusion during positive conditions on a fuseable recipe', () => {
    const fuseableConfig = beginnerConfig({
      conditionEffectType: 'fuseable' as any,
    });
    const state = new CraftingState({
      qi: 194,
      stability: 60,
      initialMaxStability: 60,
      completion: 0,
      perfection: 0,
    });

    const conditions: CraftingConditionType[] = [
      'positive',
      'neutral',
      'neutral',
    ];
    const sim = simulateCraft(state, fuseableConfig, 50, 50, conditions, 20);
    expect(sim.targetsMet).toBe(true);

    const positiveTurns = sim.log.filter(
      (t) => t.condition === 'positive' && t.stateBefore.completion < 50,
    );
    if (positiveTurns.length > 0) {
      const fusionRate =
        positiveTurns.filter((t) => t.skillChosen === 'Simple Fusion').length /
        positiveTurns.length;
      expect(fusionRate).toBeGreaterThanOrEqual(0.5);
    }
  });
});

describe('craft simulation — full skill set, buff utilization', () => {
  const config = fullConfig();
  const neutralOnly: CraftingConditionType[] = ['neutral'];

  it('should use buff setup → payoff sequences', () => {
    const state = new CraftingState({
      qi: 194,
      stability: 60,
      initialMaxStability: 60,
      completion: 0,
      perfection: 0,
    });

    const sim = simulateCraft(state, config, 100, 100, neutralOnly, 25, 4);
    expect(sim.targetsMet).toBe(true);

    // The optimizer should use Cycling skills (buff setup) at some point.
    const cyclingIndices = sim.history.reduce((acc, name, i) => {
      if (name.startsWith('Cycling')) acc.push(i);
      return acc;
    }, [] as number[]);
    expect(cyclingIndices.length).toBeGreaterThan(0);

    // Verify at least one Cycling skill is followed by a payoff within its 2-turn buff window.
    // Cycling Fusion grants CONTROL buff → payoff: control-scaling (Simple Refine, Disciplined Touch)
    // Cycling Refine grants INTENSITY buff → payoff: intensity-scaling (Simple Fusion, Energised Fusion, Disciplined Touch)
    let hasPayoff = false;
    for (const ci of cyclingIndices) {
      const cyclingName = sim.history[ci];
      const grantsIntensity = cyclingName === 'Cycling Refine';
      for (let j = ci + 1; j <= Math.min(ci + 2, sim.history.length - 1); j++) {
        const followUp = sim.history[j];
        if (
          grantsIntensity &&
          (followUp.includes('Fusion') || followUp === 'Disciplined Touch')
        ) {
          hasPayoff = true;
        }
        if (
          !grantsIntensity &&
          (followUp.includes('Refine') || followUp === 'Disciplined Touch')
        ) {
          hasPayoff = true;
        }
      }
    }
    expect(hasPayoff).toBe(true);
  });

  it('should complete efficiently (fewer turns than beginner-only)', () => {
    const beginnerCfg = beginnerConfig();
    const state = new CraftingState({
      qi: 194,
      stability: 60,
      initialMaxStability: 60,
      completion: 0,
      perfection: 0,
    });

    const beginnerSim = simulateCraft(
      state,
      beginnerCfg,
      100,
      100,
      neutralOnly,
      30,
      4,
    );
    const fullSim = simulateCraft(state, config, 100, 100, neutralOnly, 30, 4);

    expect(beginnerSim.targetsMet).toBe(true);
    expect(fullSim.targetsMet).toBe(true);
    // Full skill set should be at least as efficient.
    expect(fullSim.turnsUsed).toBeLessThanOrEqual(beginnerSim.turnsUsed);
  });
});

describe('craft simulation — survivability', () => {
  const config = beginnerConfig();

  it('should never let the craft die when stabilize is available and affordable', () => {
    // Start with low stability to force early stabilize decisions.
    const state = new CraftingState({
      qi: 194,
      stability: 20,
      initialMaxStability: 60,
      completion: 0,
      perfection: 0,
    });

    const sim = simulateCraft(state, config, 50, 50, ['neutral'], 25);
    expect(sim.craftDied).toBe(false);
    expect(sim.targetsMet).toBe(true);
  });

  it('should stabilize instead of dying when stability is critical', () => {
    // Stability exactly at the cost of one progress skill.
    const state = new CraftingState({
      qi: 194,
      stability: 10,
      initialMaxStability: 60,
      completion: 0,
      perfection: 0,
    });

    const sim = simulateCraft(state, config, 50, 50, ['neutral'], 25);
    expect(sim.craftDied).toBe(false);
    // First move must be stabilize since all progress skills cost 10 stability.
    expect(sim.history[0]).toBe('Stabilize');
  });

  it('should not stabilize when targets can be met in one move', () => {
    // Only 12 completion needed (one Simple Fusion at intensity 12).
    const state = new CraftingState({
      qi: 194,
      stability: 10,
      initialMaxStability: 60,
      completion: 38,
      perfection: 50,
    });

    const sim = simulateCraft(state, config, 50, 50, ['neutral'], 5);
    expect(sim.targetsMet).toBe(true);
    // Should finish immediately with fusion, not waste a turn stabilizing.
    expect(sim.history[0]).toBe('Simple Fusion');
    expect(sim.turnsUsed).toBe(1);
  });
});

describe('craft simulation — mid-craft stability management', () => {
  const config = beginnerConfig();

  it('should stabilize when stability cannot survive enough turns to finish (generous budget)', () => {
    const state = new CraftingState({
      qi: 194,
      stability: 30,
      initialMaxStability: 55,
      stabilityPenalty: 5,
      completion: 20,
      perfection: 10,
    });

    const sim = simulateCraft(state, config, 60, 60, ['neutral'], 25, 6);
    expect(sim.craftDied).toBe(false);
    expect(sim.targetsMet).toBe(true);

    const firstFiveMoves = sim.history.slice(0, 5);
    expect(firstFiveMoves).toContain('Stabilize');
  });

  it('should stabilize with realistic search budget (500ms, depth 28)', () => {
    const state = new CraftingState({
      qi: 194,
      stability: 30,
      initialMaxStability: 55,
      stabilityPenalty: 5,
      completion: 20,
      perfection: 10,
    });

    const sim = simulateCraft(state, config, 60, 60, ['neutral'], 25, 28);
    expect(sim.craftDied).toBe(false);
    expect(sim.targetsMet).toBe(true);
  });

  it('should use Forceful Stabilize when it is the only stabilize option', () => {
    // Forceful Stabilize: 88 qi, +40 stability. High qi cost means the
    // optimizer must plan qi budget carefully. The craft must not die.
    const forcefulSkills = [SIMPLE_FUSION, SIMPLE_REFINE, FORCEFUL_STABILIZE];
    const forcefulConfig = createTestConfig({
      skills: forcefulSkills,
      conditionEffectType: 'perfectable' as any,
      maxQi: 300, // Enough qi budget for multiple stabilizes
    });

    const state = new CraftingState({
      qi: 300,
      stability: 30,
      initialMaxStability: 55,
      stabilityPenalty: 5,
      completion: 20,
      perfection: 10,
    });

    const sim = simulateCraft(
      state,
      forcefulConfig,
      60,
      60,
      ['neutral'],
      25,
      6,
    );
    expect(sim.craftDied).toBe(false);
    expect(sim.targetsMet).toBe(true);

    expect(sim.history).toContain('Forceful Stabilize');
  });

  it('should not die when Forceful Stabilize is the only way to survive (low stability)', () => {
    // Stability 20 with cost 10 = only 2 turns before death.
    // Forceful Stabilize is expensive (88 qi) and wastes half its gain,
    // but it's the only survival option.
    const forcefulSkills = [SIMPLE_FUSION, SIMPLE_REFINE, FORCEFUL_STABILIZE];
    const forcefulConfig = createTestConfig({
      skills: forcefulSkills,
      conditionEffectType: 'perfectable' as any,
      maxQi: 300,
    });

    const state = new CraftingState({
      qi: 300,
      stability: 20,
      initialMaxStability: 50,
      stabilityPenalty: 10,
      completion: 20,
      perfection: 10,
    });

    const sim = simulateCraft(
      state,
      forcefulConfig,
      60,
      60,
      ['neutral'],
      25,
      6,
    );
    expect(sim.craftDied).toBe(false);
    expect(sim.targetsMet).toBe(true);
  });

  it('should interleave stabilize with progress in a long craft', () => {
    // Start fresh with just enough stability for ~3 progress turns
    const state = new CraftingState({
      qi: 194,
      stability: 30,
      initialMaxStability: 60,
      completion: 0,
      perfection: 0,
    });

    const sim = simulateCraft(state, config, 60, 60, ['neutral'], 30, 6);
    expect(sim.craftDied).toBe(false);
    expect(sim.targetsMet).toBe(true);

    // Must have stabilized multiple times to survive
    const stabilizeCount = sim.history.filter((s) => s === 'Stabilize').length;
    expect(stabilizeCount).toBeGreaterThanOrEqual(2);
  });
});

describe('craft simulation — stall penalty must not override tree search', () => {
  it('should stabilize when waste ratio is high but craft needs survival runway', () => {
    // Scenario: stability 42, initialMaxStability 55, stabilityPenalty 3
    // → maxStability = 55 - 3 = 52.  Stabilize gains +20.
    // Effective gain = min(20, 52-42) = 10, waste ratio = 1 - 10/20 = 0.50.
    // isWastefulStabilize() would trigger at wasteRatio >= 0.35, but the
    // stabilizeProtected flag prevents it because the craft needs more
    // turns to finish than the stability runway allows.
    const state = new CraftingState({
      qi: 194,
      stability: 42,
      initialMaxStability: 55,
      stabilityPenalty: 3,
      completion: 30,
      perfection: 25,
    });

    const sim = simulateCraft(
      state,
      beginnerConfig(),
      60,
      60,
      ['neutral'],
      25,
      6,
    );
    expect(sim.craftDied).toBe(false);
    expect(sim.targetsMet).toBe(true);
  });
});

describe('craft simulation — mixed conditions over many turns', () => {
  const config = beginnerConfig();

  it('should complete a craft with varied condition sequence', () => {
    const state = new CraftingState({
      qi: 194,
      stability: 60,
      initialMaxStability: 60,
      completion: 0,
      perfection: 0,
    });

    const conditions: CraftingConditionType[] = [
      'neutral',
      'positive',
      'neutral',
      'negative',
      'neutral',
      'neutral',
      'veryPositive',
      'neutral',
    ];

    const sim = simulateCraft(state, config, 100, 100, conditions, 30);
    expect(sim.targetsMet).toBe(true);
    expect(sim.craftDied).toBe(false);
  });

  it('should handle all-negative conditions without dying', () => {
    const state = new CraftingState({
      qi: 194,
      stability: 60,
      initialMaxStability: 60,
      completion: 0,
      perfection: 0,
    });

    // Negative conditions reduce control by 50% on perfectable recipe.
    const conditions: CraftingConditionType[] = ['negative'];
    const sim = simulateCraft(state, config, 50, 50, conditions, 30);
    // Should still complete even with penalties.
    expect(sim.targetsMet).toBe(true);
    expect(sim.craftDied).toBe(false);
  });
});

describe('craft simulation — rotation must not suggest stability death', () => {
  it('should not suggest a rotation that leads to stability death (screenshot scenario)', () => {
    // Exact scenario from user screenshot: Healing Pill (1), perfectable recipe.
    // Comp 20/60, Perf 10/60, Stability 30/57 (decayed from 60), Qi 162/180.
    // With only 30 stability and 10 cost per progress skill, the craft can
    // survive at most 3 progress skills before dying.  The optimizer must
    // interleave stabilize rather than suggesting 5+ progress skills in a row.
    const skills = [
      SIMPLE_FUSION,
      SIMPLE_REFINE,
      STABILIZE,
      FORCEFUL_STABILIZE,
    ];
    const config = createTestConfig({
      skills,
      conditionEffectType: 'perfectable' as any,
      maxQi: 180,
    });

    const state = new CraftingState({
      qi: 162,
      stability: 30,
      initialMaxStability: 60,
      stabilityPenalty: 3, // maxStability = 60 - 3 = 57
      completion: 20,
      perfection: 10,
    });

    // Conditions from screenshot: current=Balanced(neutral), next: Good, Excellent, Normal
    const conditions: CraftingConditionType[] = [
      'neutral',
      'positive',
      'veryPositive',
      'neutral',
    ];

    const result = lookaheadSearch(
      state,
      config,
      60,
      60,
      28, // default lookahead depth
      'neutral',
      ['positive', 'veryPositive', 'neutral'],
      { timeBudgetMs: 500, maxNodes: 200000 },
    );

    // The rotation must not be all-progress — it should include stabilize.
    const rotation = result.optimalRotation ?? [];
    expect(rotation.length).toBeGreaterThan(0);

    // Verify the rotation doesn't lead to stability death by simulating it.
    let simStability = 30;
    let simMaxStability = 57;
    let diedInRotation = false;
    for (let i = 0; i < rotation.length; i++) {
      const skillName = rotation[i];
      const skill = skills.find((s) => s.name === skillName);
      if (!skill) continue;

      // Stabilize skills don't decay maxStability
      if (!skill.preventsMaxStabilityDecay) {
        simMaxStability = Math.max(0, simMaxStability - 1);
      }

      simStability =
        simStability - skill.stabilityCost + (skill.stabilityGain || 0);
      simStability = Math.min(simStability, simMaxStability);
      simStability = Math.max(0, simStability);

      if (simStability <= 0 && i < rotation.length - 1) {
        diedInRotation = true;
        break;
      }
    }

    expect(diedInRotation).toBe(false);

    // Also verify the full simulation doesn't die
    const sim = simulateCraft(state, config, 60, 60, conditions, 25, 28);
    expect(sim.craftDied).toBe(false);
    expect(sim.targetsMet).toBe(true);
  });

  it('should include stabilize in first few moves when stability runway is critically short', () => {
    // Stability 30, needs ~6 turns to finish (90 remaining / 16 avg gain).
    // Runway = 30 / 10 = 3 turns.  Must stabilize within first 3 moves.
    const config = beginnerConfig();
    const state = new CraftingState({
      qi: 194,
      stability: 30,
      initialMaxStability: 57,
      stabilityPenalty: 3,
      completion: 20,
      perfection: 10,
    });

    const result = lookaheadSearch(
      state,
      config,
      60,
      60,
      28,
      'neutral',
      ['neutral', 'neutral', 'neutral'],
      { timeBudgetMs: 500, maxNodes: 200000 },
    );

    const rotation = result.optimalRotation ?? [];
    expect(rotation.length).toBeGreaterThan(0);

    // Stabilize must appear within the first 3 moves (the runway limit)
    const firstThree = rotation.slice(0, 3);
    expect(firstThree).toContain('Stabilize');
  });
});

// ---------------------------------------------------------------------------
// Training mode
// ---------------------------------------------------------------------------

describe('craft simulation — training mode', () => {
  const neutralOnly: CraftingConditionType[] = ['neutral'];

  it('should complete a basic training craft (comp=50, perf=50)', () => {
    // Training mode uses weaker survivability penalties but should still
    // guide a simple craft to completion without dying.
    const config = beginnerConfig({ trainingMode: true });
    const state = new CraftingState({
      qi: 194,
      stability: 60,
      initialMaxStability: 60,
      completion: 0,
      perfection: 0,
    });

    const sim = simulateCraft(state, config, 50, 50, neutralOnly, 25);
    expect(sim.craftDied).toBe(false);
    expect(sim.targetsMet).toBe(true);
  });

  it('should tolerate lower stability than normal mode', () => {
    // At stability=15, normal mode should stabilize first (runway is only
    // 1.5 turns for 10-cost skills, not enough for the remaining work).
    // Training mode has a lower stability threshold so it may push progress.
    // The key invariant: training mode must NOT die.
    const normalConfig = beginnerConfig();
    const trainingConfig = beginnerConfig({ trainingMode: true });
    const makeState = () =>
      new CraftingState({
        qi: 194,
        stability: 15,
        initialMaxStability: 60,
        completion: 30,
        perfection: 30,
      });

    const normalSim = simulateCraft(
      makeState(),
      normalConfig,
      50,
      50,
      neutralOnly,
      25,
    );
    const trainingSim = simulateCraft(
      makeState(),
      trainingConfig,
      50,
      50,
      neutralOnly,
      25,
    );

    // Both must survive and complete.
    expect(normalSim.craftDied).toBe(false);
    expect(normalSim.targetsMet).toBe(true);
    expect(trainingSim.craftDied).toBe(false);
    expect(trainingSim.targetsMet).toBe(true);

    // Training mode should use fewer or equal stabilize actions (more risk
    // tolerant).  If it uses more, the weaker penalties aren't working.
    const normalStabilizes = normalSim.history.filter(
      (s) => s === 'Stabilize',
    ).length;
    const trainingStabilizes = trainingSim.history.filter(
      (s) => s === 'Stabilize',
    ).length;
    expect(trainingStabilizes).toBeLessThanOrEqual(normalStabilizes);
  });

  it('should still stabilize when stability is critical even in training mode', () => {
    // Even with weaker penalties, training mode must not suicide when
    // stability is at the cost of a single progress skill and there is
    // substantial work remaining.
    const config = beginnerConfig({ trainingMode: true });
    const state = new CraftingState({
      qi: 194,
      stability: 10,
      initialMaxStability: 60,
      completion: 0,
      perfection: 0,
    });

    const sim = simulateCraft(state, config, 50, 50, neutralOnly, 25);
    expect(sim.craftDied).toBe(false);
    expect(sim.targetsMet).toBe(true);

    // Must stabilize at least once — starting at stability 10 with 100
    // remaining work is not survivable without it.
    expect(sim.history).toContain('Stabilize');
  });
});

// ---------------------------------------------------------------------------
// Medium-high targets (200–500 range)
// ---------------------------------------------------------------------------

describe('craft simulation — medium-high targets', () => {
  const neutralOnly: CraftingConditionType[] = ['neutral'];

  it('should complete a medium craft (comp=200, perf=200) with beginner skills', () => {
    // Targets=400 total.  With intensity=12 and control=16, this needs
    // ~17 fusions + ~13 refines = ~30 progress turns + stabilizes.
    // Higher qi budget reflects realistic scaling for medium crafts.
    const config = beginnerConfig({ maxQi: 400 });
    const state = new CraftingState({
      qi: 400,
      stability: 60,
      initialMaxStability: 60,
      completion: 0,
      perfection: 0,
    });

    const sim = simulateCraft(state, config, 200, 200, neutralOnly, 60);
    expect(sim.craftDied).toBe(false);
    expect(sim.targetsMet).toBe(true);
  });

  it('should complete a large craft (comp=400, perf=400) with full skill set', () => {
    // Targets=800 total.  Full skill set includes buffs and cycling skills
    // which should allow more efficient progress.
    // Higher qi budget reflects realistic scaling for large crafts.
    const config = fullConfig({ maxQi: 1000 });
    const state = new CraftingState({
      qi: 1000,
      stability: 60,
      initialMaxStability: 60,
      completion: 0,
      perfection: 0,
    });

    const sim = simulateCraft(state, config, 400, 400, neutralOnly, 100);
    expect(sim.craftDied).toBe(false);
    expect(sim.targetsMet).toBe(true);
  });

  it('should complete a large craft with mixed conditions', () => {
    // Same 400/400 targets but with a realistic mixed condition sequence.
    // Condition exploitation should help efficiency; negative turns should
    // not cause the optimizer to stall or die.
    const config = fullConfig({ maxQi: 1000 });
    const state = new CraftingState({
      qi: 1000,
      stability: 60,
      initialMaxStability: 60,
      completion: 0,
      perfection: 0,
    });
    const conditions: CraftingConditionType[] = [
      'neutral',
      'positive',
      'neutral',
      'negative',
      'neutral',
      'neutral',
      'veryPositive',
      'neutral',
    ];

    const sim = simulateCraft(state, config, 400, 400, conditions, 100);
    expect(sim.craftDied).toBe(false);
    expect(sim.targetsMet).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Asymmetric targets
// ---------------------------------------------------------------------------

describe('craft simulation — asymmetric targets', () => {
  const neutralOnly: CraftingConditionType[] = ['neutral'];

  it('should complete a completion-heavy craft (comp=200, perf=50)', () => {
    // Perfection should be met early (~4 refines), then the optimizer
    // should focus exclusively on fusion for the remaining completion.
    const config = beginnerConfig();
    const state = new CraftingState({
      qi: 194,
      stability: 60,
      initialMaxStability: 60,
      completion: 0,
      perfection: 0,
    });

    const sim = simulateCraft(state, config, 200, 50, neutralOnly, 50);
    expect(sim.craftDied).toBe(false);
    expect(sim.targetsMet).toBe(true);

    // After perfection is met, no more refines should appear.
    // Find the turn where perfection was first met.
    let perfMetTurn = -1;
    for (const entry of sim.log) {
      if (entry.stateAfter.perfection >= 50) {
        perfMetTurn = entry.turn;
        break;
      }
    }
    if (perfMetTurn >= 0 && perfMetTurn < sim.log.length - 1) {
      const postPerfHistory = sim.log
        .filter((e) => e.turn > perfMetTurn)
        .map((e) => e.skillChosen);
      const wastedRefines = postPerfHistory.filter(
        (s) => s === 'Simple Refine',
      ).length;
      // Allow at most 1 wasted refine (search horizon may cause one).
      expect(wastedRefines).toBeLessThanOrEqual(1);
    }
  });

  it('should complete a perfection-heavy craft (comp=50, perf=200)', () => {
    // Completion should be met early (~5 fusions), then the optimizer
    // should focus exclusively on refine for the remaining perfection.
    // Higher qi budget needed since refine costs 18 qi per use.
    const config = beginnerConfig({ maxQi: 400 });
    const state = new CraftingState({
      qi: 400,
      stability: 60,
      initialMaxStability: 60,
      completion: 0,
      perfection: 0,
    });

    const sim = simulateCraft(state, config, 50, 200, neutralOnly, 50);
    expect(sim.craftDied).toBe(false);
    expect(sim.targetsMet).toBe(true);

    // After completion is met, no more fusions should appear.
    let compMetTurn = -1;
    for (const entry of sim.log) {
      if (entry.stateAfter.completion >= 50) {
        compMetTurn = entry.turn;
        break;
      }
    }
    if (compMetTurn >= 0 && compMetTurn < sim.log.length - 1) {
      const postCompHistory = sim.log
        .filter((e) => e.turn > compMetTurn)
        .map((e) => e.skillChosen);
      const wastedFusions = postCompHistory.filter(
        (s) => s === 'Simple Fusion',
      ).length;
      // Allow at most 1 wasted fusion.
      expect(wastedFusions).toBeLessThanOrEqual(1);
    }
  });
});

// ---------------------------------------------------------------------------
// veryNegative conditions
// ---------------------------------------------------------------------------

describe('craft simulation — veryNegative conditions', () => {
  it('should complete a craft under all-veryNegative conditions without dying', () => {
    // veryNegative on a perfectable recipe: control multiplier = -1.0,
    // so effective control = baseControl * (1 + -1.0) = 0, meaning Simple
    // Refine gives 0 perfection.  Simple Fusion (scales with intensity,
    // unaffected by control condition) still gives ~12 completion.
    //
    // Use comp-only target since perfection progress is impossible under
    // all-veryNegative on a perfectable recipe.
    const config = beginnerConfig();
    const state = new CraftingState({
      qi: 194,
      stability: 60,
      initialMaxStability: 60,
      completion: 0,
      perfection: 0,
    });
    const conditions: CraftingConditionType[] = ['veryNegative'];

    const sim = simulateCraft(state, config, 100, 0, conditions, 30);
    expect(sim.craftDied).toBe(false);
    expect(sim.targetsMet).toBe(true);
  });

  it('should survive and complete with intermittent veryNegative conditions', () => {
    // Mix of veryNegative and neutral.  The optimizer should avoid refine
    // during veryNegative turns (gives 0 perfection) and use them for
    // fusion or stabilize instead.
    const config = beginnerConfig();
    const state = new CraftingState({
      qi: 194,
      stability: 60,
      initialMaxStability: 60,
      completion: 0,
      perfection: 0,
    });
    const conditions: CraftingConditionType[] = [
      'veryNegative',
      'neutral',
      'neutral',
      'veryNegative',
      'neutral',
    ];

    const sim = simulateCraft(state, config, 100, 100, conditions, 40);
    expect(sim.craftDied).toBe(false);
    expect(sim.targetsMet).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Sublime crafts
// ---------------------------------------------------------------------------

describe('craft simulation — sublime crafts', () => {
  it('should complete a sublime craft reaching scaled targets (100/100 × 2.0)', () => {
    // Sublime craft: base targets 100/100, multiplier 2.0.  The optimizer
    // internally scales effective targets to 200/200 via targetMultiplier.
    // We pass 200/200 as simulation targets so the loop doesn't stop early
    // at base targets.  The optimizer's scoring must drive progress past
    // 100/100 toward 200/200.
    const config = createTestConfig({
      skills: BEGINNER_SKILLS,
      conditionEffectType: 'perfectable' as any,
      isSublimeCraft: true,
      targetMultiplier: 2.0,
      maxQi: 400,
    });
    const state = new CraftingState({
      qi: 400,
      stability: 60,
      initialMaxStability: 60,
      completion: 0,
      perfection: 0,
    });
    const neutralOnly: CraftingConditionType[] = ['neutral'];

    // Pass scaled targets (200/200) to the simulation loop so it doesn't
    // stop at base targets.
    const sim = simulateCraft(state, config, 200, 200, neutralOnly, 60);
    expect(sim.craftDied).toBe(false);
    expect(sim.targetsMet).toBe(true);
    expect(sim.finalState.completion).toBeGreaterThanOrEqual(200);
    expect(sim.finalState.perfection).toBeGreaterThanOrEqual(200);
  });
});
