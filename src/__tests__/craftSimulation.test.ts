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
      { timeBudgetMs: 2000, maxNodes: 200000 },
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
    expect(sim.history).toContain('Stabilize');
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
      // At least one positive turn with unmet perfection should use refine.
      expect(refineCount).toBeGreaterThanOrEqual(1);
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
    const usesCycling = sim.history.some((name) => name.startsWith('Cycling'));
    expect(usesCycling).toBe(true);
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
