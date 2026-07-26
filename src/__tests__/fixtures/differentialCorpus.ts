/**
 * CraftBuddy - Cross-engine differential corpus.
 *
 * The TypeScript simulator in `src/optimizer` and the Rust engine in
 * `crates/craftbuddy-engine` implement the same crafting mechanics twice. This
 * module builds a deterministic corpus of `(state, config, technique)` triples
 * together with the transition the TypeScript simulator produces for each one.
 *
 * The corpus is serialised to
 * `crates/craftbuddy-engine/tests/differential_corpus.json` by
 * `scripts/optimizer/generate-differential-corpus.ts`:
 *
 * - `src/__tests__/engineDifferential.test.ts` asserts the checked-in file
 *   still matches what TypeScript produces, so TS-side drift is caught.
 * - a Rust test in `crates/craftbuddy-engine/src/lib.rs` replays the same
 *   corpus and asserts the Rust engine agrees, so Rust-side drift is caught.
 *
 * Scope: the corpus intentionally exercises the *shared* subset - techniques
 * described by scalar fields rather than full game effect trees. Effect-driven
 * techniques are evaluated by `calculateSkillGains`'s authoritative path, which
 * the Rust engine does not receive, so including them would compare two
 * different models rather than two implementations of one model.
 */

import { CraftingState, BuffType } from '../../optimizer/state';
import {
  applySkill,
  getConditionEffectsForConfig,
  OptimizerConfig,
  SkillDefinition,
} from '../../optimizer/skills';
import { buildNativeMctsInput } from '../../optimizer/nativeMcts';
import type { HarmonyData, HarmonyType } from '../../optimizer/gameTypes';
import { HARMONY_TYPES } from '../../optimizer/harmonyRegistry';

/** Fields both engines must agree on after a single transition. */
export interface DifferentialExpectation {
  qi: number;
  stability: number;
  stabilityPenalty: number;
  completion: number;
  perfection: number;
  toxicity: number;
  harmony: number;
  step: number;
  completionBonus: number;
  controlBuffTurns: number;
  intensityBuffTurns: number;
  cooldowns: number[];
}

export interface DifferentialCase {
  /** Index into the scenario's `skills` array, matching the Rust input order. */
  skillIndex: number;
  skillKey: string;
  /** `null` when the TypeScript simulator rejects the action as illegal. */
  expected: DifferentialExpectation | null;
}

export interface DifferentialScenario {
  name: string;
  /** Rust `MctsInput`-shaped payload, produced by `buildNativeMctsInput`. */
  input: unknown;
  cases: DifferentialCase[];
}

export interface DifferentialCorpus {
  /** Bumped whenever the corpus schema changes. */
  version: number;
  scenarios: DifferentialScenario[];
}

export const DIFFERENTIAL_CORPUS_VERSION = 1;

/**
 * Deterministic 32-bit LCG.
 *
 * A fixed generator keeps the corpus reproducible across machines and language
 * runtimes, which matters because the file is checked in and diffed.
 */
class Lcg {
  private seed: number;

  constructor(seed: number) {
    this.seed = seed >>> 0;
  }

  next(): number {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return this.seed / 0x100000000;
  }

  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  pick<T>(values: readonly T[]): T {
    return values[this.int(0, values.length - 1)] as T;
  }
}

function skill(overrides: Partial<SkillDefinition> = {}): SkillDefinition {
  return {
    name: 'Simple Fusion',
    key: 'simple_fusion',
    qiCost: 12,
    stabilityCost: 6,
    baseCompletionGain: 1,
    basePerfectionGain: 0,
    stabilityGain: 0,
    maxStabilityChange: 0,
    buffType: BuffType.NONE,
    buffDuration: 0,
    buffMultiplier: 1,
    type: 'fusion',
    scalesWithIntensity: true,
    ...overrides,
  };
}

function config(overrides: Partial<OptimizerConfig> = {}): OptimizerConfig {
  return {
    maxQi: 194,
    maxStability: 60,
    baseIntensity: 12,
    baseControl: 16,
    minStability: 0,
    defaultBuffMultiplier: 1.4,
    skills: [],
    ...overrides,
  };
}

function harmonyDataFor(harmonyType: HarmonyType): HarmonyData {
  const data: HarmonyData = { recommendedTechniqueTypes: [] };
  switch (harmonyType) {
    case 'forge':
      data.forgeWorks = { heat: 3, lastBuffedHeat: 3 };
      break;
    case 'alchemical':
      data.alchemicalArts = { charges: ['fusion'], lastCombo: [] };
      break;
    case 'inscription':
      data.inscribedPatterns = {
        currentBlock: ['fusion'],
        completedBlocks: 1,
        stacks: 2,
      };
      break;
    case 'resonance':
      data.resonance = {
        resonance: 'fusion',
        strength: 2,
        pendingResonance: undefined,
        pendingCount: 0,
      };
      break;
    case 'enhancingEcho':
      // Attuned so both the echo (50%) and discord (200%) cost branches run.
      data.enhancingEcho = { attunedType: 'fusion', lastOutcome: 'attune' };
      break;
    case 'eccentricDecree':
      data.eccentricDecree = {
        focusedBar: 'completion',
        lastCompletion: 40,
        lastPerfection: 30,
      };
      break;
    case 'formless':
      break;
  }
  return data;
}

/** Technique set shared by most scenarios: one per scaling/cost shape. */
function baseSkillSet(): SkillDefinition[] {
  return [
    skill(),
    skill({
      name: 'Careful Refinement',
      key: 'careful_refinement',
      qiCost: 14,
      stabilityCost: 5,
      baseCompletionGain: 0,
      basePerfectionGain: 1,
      type: 'refine',
      scalesWithControl: true,
      scalesWithIntensity: false,
    }),
    skill({
      name: 'Steady Hand',
      key: 'steady_hand',
      qiCost: 8,
      stabilityCost: 0,
      baseCompletionGain: 0,
      basePerfectionGain: 0,
      stabilityGain: 12,
      type: 'support',
      scalesWithIntensity: false,
    }),
    skill({
      name: 'Focused Control',
      key: 'focused_control',
      qiCost: 10,
      stabilityCost: 3,
      baseCompletionGain: 0,
      basePerfectionGain: 0,
      buffType: BuffType.CONTROL,
      buffDuration: 3,
      buffMultiplier: 1.4,
      type: 'support',
      scalesWithIntensity: false,
    }),
    skill({
      name: 'Surging Intensity',
      key: 'surging_intensity',
      qiCost: 10,
      stabilityCost: 3,
      baseCompletionGain: 0,
      basePerfectionGain: 0,
      buffType: BuffType.INTENSITY,
      buffDuration: 2,
      buffMultiplier: 1.5,
      type: 'support',
      scalesWithIntensity: false,
    }),
    skill({
      name: 'Reinforce Vessel',
      key: 'reinforce_vessel',
      qiCost: 16,
      stabilityCost: 0,
      baseCompletionGain: 0,
      basePerfectionGain: 0,
      maxStabilityChange: 5,
      preventsMaxStabilityDecay: true,
      cooldown: 3,
      type: 'support',
      scalesWithIntensity: false,
    }),
    skill({
      name: 'Purge Toxins',
      key: 'purge_toxins',
      qiCost: 6,
      stabilityCost: 2,
      baseCompletionGain: 0,
      basePerfectionGain: 0,
      toxicityCleanse: 15,
      type: 'support',
      scalesWithIntensity: false,
    }),
    skill({
      name: 'Volatile Fusion',
      key: 'volatile_fusion',
      qiCost: 18,
      stabilityCost: 9,
      baseCompletionGain: 2,
      basePerfectionGain: 0,
      toxicityCost: 12,
      successChance: 0.75,
      type: 'fusion',
      scalesWithIntensity: true,
    }),
    skill({
      name: 'Draw Breath',
      key: 'draw_breath',
      qiCost: 0,
      stabilityCost: 4,
      baseCompletionGain: 0,
      basePerfectionGain: 0,
      restoresQi: true,
      qiRestore: 30,
      type: 'support',
      scalesWithIntensity: false,
    }),
  ];
}

interface ScenarioSpec {
  name: string;
  state: CraftingState;
  config: OptimizerConfig;
  targetCompletion: number;
  targetPerfection: number;
  condition: string;
}

function buildScenario(spec: ScenarioSpec): DifferentialScenario {
  // The Rust engine never receives item actions, so the differential must not
  // either; keeping the filter identical keeps skill indices aligned.
  const skills = (spec.config.skills || []).filter(
    (entry) => entry.actionKind !== 'item',
  );
  const conditionEffects = getConditionEffectsForConfig(
    spec.config,
    spec.condition,
  );

  const cases: DifferentialCase[] = skills.map((entry, skillIndex) => {
    const next = applySkill(
      spec.state,
      entry,
      spec.config,
      conditionEffects,
      spec.targetCompletion,
      spec.condition,
    );
    return {
      skillIndex,
      skillKey: entry.key,
      expected: next
        ? {
            qi: next.qi,
            stability: next.stability,
            stabilityPenalty: next.stabilityPenalty,
            completion: next.completion,
            perfection: next.perfection,
            toxicity: next.toxicity,
            harmony: next.harmony,
            step: next.step,
            completionBonus: next.completionBonus,
            controlBuffTurns: next.controlBuffTurns,
            intensityBuffTurns: next.intensityBuffTurns,
            cooldowns: skills.map((other) => next.getCooldown(other.key)),
          }
        : null,
    };
  });

  return {
    name: spec.name,
    input: buildNativeMctsInput({
      state: spec.state,
      config: spec.config,
      targetCompletion: spec.targetCompletion,
      targetPerfection: spec.targetPerfection,
      currentConditionType: spec.condition,
      forecastedConditionTypes: [],
    }),
    cases,
  };
}

function handWrittenScenarios(): ScenarioSpec[] {
  const skills = baseSkillSet();
  const specs: ScenarioSpec[] = [];

  specs.push({
    name: 'baseline-neutral',
    state: new CraftingState({ qi: 150, stability: 55, initialMaxStability: 60 }),
    config: config({ skills }),
    targetCompletion: 120,
    targetPerfection: 90,
    condition: 'neutral',
  });

  specs.push({
    name: 'active-buffs',
    state: new CraftingState({
      qi: 150,
      stability: 40,
      initialMaxStability: 60,
      stabilityPenalty: 6,
      controlBuffTurns: 2,
      intensityBuffTurns: 1,
      controlBuffMultiplier: 1.4,
      intensityBuffMultiplier: 1.5,
      completionBonus: 2,
    }),
    config: config({ skills }),
    targetCompletion: 120,
    targetPerfection: 90,
    condition: 'neutral',
  });

  specs.push({
    name: 'cost-modifiers',
    state: new CraftingState({
      qi: 120,
      stability: 45,
      initialMaxStability: 60,
      poolCostFlat: 4,
      poolCostPercentage: 80,
      stabilityCostPercentage: 130,
    }),
    config: config({ skills }),
    targetCompletion: 120,
    targetPerfection: 90,
    condition: 'neutral',
  });

  specs.push({
    name: 'crit-and-overcrit',
    state: new CraftingState({
      qi: 180,
      stability: 50,
      initialMaxStability: 60,
      critChance: 140,
      critMultiplier: 180,
      successChanceBonus: 0.1,
    }),
    config: config({ skills }),
    targetCompletion: 120,
    targetPerfection: 90,
    condition: 'neutral',
  });

  specs.push({
    name: 'toxicity-pressure',
    state: new CraftingState({
      qi: 140,
      stability: 40,
      initialMaxStability: 60,
      toxicity: 55,
      maxToxicity: 60,
    }),
    config: config({ skills, maxToxicity: 60 }),
    targetCompletion: 120,
    targetPerfection: 90,
    condition: 'neutral',
  });

  specs.push({
    name: 'cooldown-active',
    state: new CraftingState({
      qi: 140,
      stability: 40,
      initialMaxStability: 60,
      cooldowns: new Map([['reinforce_vessel', 2]]),
    }),
    config: config({ skills }),
    targetCompletion: 120,
    targetPerfection: 90,
    condition: 'neutral',
  });

  const conditionConfig = config({
    skills,
    conditionEffectsData: {
      neutral: [],
      positive: [
        { kind: 'control', multiplier: 0.5 },
        { kind: 'pool', multiplier: 0.75 },
        { kind: 'chance', bonus: 0.1 },
      ],
      negative: [
        { kind: 'intensity', multiplier: -0.25 },
        { kind: 'stability', multiplier: 1.5 },
      ],
      veryPositive: [
        { kind: 'control', multiplier: 1 },
        { kind: 'intensity', multiplier: 1 },
      ],
      veryNegative: [{ kind: 'pool', multiplier: 1.5 }],
    },
  });
  for (const condition of [
    'positive',
    'negative',
    'veryPositive',
    'veryNegative',
  ]) {
    specs.push({
      name: `condition-${condition}`,
      state: new CraftingState({
        qi: 160,
        stability: 48,
        initialMaxStability: 60,
      }),
      config: conditionConfig,
      targetCompletion: 120,
      targetPerfection: 90,
      condition,
    });
  }

  for (const harmonyType of HARMONY_TYPES) {
    specs.push({
      name: `harmony-${harmonyType}`,
      state: new CraftingState({
        qi: 170,
        stability: 50,
        initialMaxStability: 60,
        harmony: 20,
        harmonyData: harmonyDataFor(harmonyType),
      }),
      config: config({
        skills,
        craftingType: harmonyType,
        isSublimeCraft: true,
      }),
      targetCompletion: 150,
      targetPerfection: 110,
      condition: 'neutral',
    });
  }

  return specs;
}

function randomScenarios(count: number): ScenarioSpec[] {
  const rng = new Lcg(0x0c1a_f7b5);
  const skills = baseSkillSet();
  const conditions = [
    'neutral',
    'positive',
    'negative',
    'veryPositive',
    'veryNegative',
  ] as const;
  const specs: ScenarioSpec[] = [];

  for (let index = 0; index < count; index++) {
    const initialMaxStability = rng.int(40, 80);
    const stabilityPenalty = rng.int(0, 15);
    const isSublime = rng.next() < 0.4;
    const harmonyType = isSublime ? rng.pick(HARMONY_TYPES) : undefined;
    specs.push({
      name: `random-${index}`,
      state: new CraftingState({
        qi: rng.int(0, 200),
        stability: rng.int(1, initialMaxStability - stabilityPenalty),
        initialMaxStability,
        stabilityPenalty,
        completion: rng.int(0, 200),
        perfection: rng.int(0, 160),
        critChance: rng.int(0, 160),
        critMultiplier: rng.int(120, 220),
        successChanceBonus: rng.int(0, 3) / 10,
        poolCostFlat: rng.int(0, 6),
        poolCostPercentage: rng.int(60, 140),
        stabilityCostPercentage: rng.int(60, 140),
        controlBuffTurns: rng.int(0, 3),
        intensityBuffTurns: rng.int(0, 3),
        controlBuffMultiplier: 1 + rng.int(2, 6) / 10,
        intensityBuffMultiplier: 1 + rng.int(2, 6) / 10,
        toxicity: rng.int(0, 40),
        maxToxicity: 100,
        completionBonus: rng.int(0, 4),
        step: rng.int(0, 30),
        harmony: isSublime ? rng.int(-100, 100) : 0,
        harmonyData: harmonyType ? harmonyDataFor(harmonyType) : undefined,
      }),
      config: config({
        skills,
        maxQi: rng.int(120, 220),
        baseIntensity: rng.int(6, 40),
        baseControl: rng.int(6, 40),
        maxToxicity: 100,
        craftingType: harmonyType,
        isSublimeCraft: isSublime,
      }),
      targetCompletion: rng.int(60, 300),
      targetPerfection: rng.int(40, 220),
      condition: rng.pick(conditions),
    });
  }

  return specs;
}

/** Build the full corpus. Deterministic: same input every run. */
export function buildDifferentialCorpus(): DifferentialCorpus {
  const specs = [...handWrittenScenarios(), ...randomScenarios(48)];
  return {
    version: DIFFERENTIAL_CORPUS_VERSION,
    scenarios: specs.map(buildScenario),
  };
}
