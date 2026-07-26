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
 * Scope: the corpus covers the whole searchable action space - scalar
 * techniques, effect-tree techniques, mastery (including conditional and
 * `upgradeKey` masteries), generic active buffs and their per-turn effect trees
 * (which is how Soulflame is modelled), toxicity, gated techniques, and item
 * (pill/reagent) actions.
 */

import { CraftingState, BuffType, TrackedBuff } from '../../optimizer/state';
import {
  applySkill,
  getConditionEffectsForConfig,
  OptimizerConfig,
  SkillDefinition,
} from '../../optimizer/skills';
import { buildNativeMctsInput } from '../../optimizer/nativeMcts';
import type {
  BuffDefinition,
  HarmonyData,
  HarmonyType,
} from '../../optimizer/gameTypes';
import { HARMONY_TYPES } from '../../optimizer/harmonyRegistry';

/** Buff stacks after a transition, in the engine's iteration order. */
export interface DifferentialBuffState {
  key: string;
  stacks: number;
}

/** Remaining item counts after a transition, in iteration order. */
export interface DifferentialItemState {
  key: string;
  count: number;
}

/**
 * Flattened harmony-subsystem digest.
 *
 * The subsystem state machines are the part of harmony most likely to drift,
 * because each one has its own bookkeeping. Comparing the scalar `harmony`
 * value alone would let a wrong Forge heat or a stale Resonance pending switch
 * pass unnoticed as long as the resulting delta happened to match.
 */
export interface DifferentialHarmonyDigest {
  forgeHeat: number | null;
  forgeLastBuffedHeat: number | null;
  alchemicalCharges: string[] | null;
  alchemicalLastCombo: string[] | null;
  inscriptionCurrentBlock: string[] | null;
  inscriptionCompletedBlocks: number | null;
  inscriptionStacks: number | null;
  resonanceType: string | null;
  resonanceStrength: number | null;
  resonancePending: string | null;
  resonancePendingCount: number | null;
  echoAttunedType: string | null;
  echoLastOutcome: string | null;
  decreeFocusedBar: string | null;
  decreeLastCompletion: number | null;
  decreeLastPerfection: number | null;
}

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
  buffs: DifferentialBuffState[];
  items: DifferentialItemState[];
  consumedPillsThisTurn: number;
  harmonyData: DifferentialHarmonyDigest;
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

/**
 * Schema version.
 *
 * 2 added `buffs`, `items`, `consumedPillsThisTurn` and the `harmonyData`
 * digest, plus the effect-tree/mastery/buff/item scenarios that exercise them.
 */
export const DIFFERENTIAL_CORPUS_VERSION = 2;

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

/**
 * Buff definitions used by the effect-tree scenarios.
 *
 * Soulflame deliberately has no dedicated code path in either engine: it is a
 * plain buff whose per-turn effect tree pays perfection, bites stability and
 * burns a stack. That is exactly why it belongs in the corpus - if the generic
 * machinery drifts, this is where it shows.
 */
const BUFF_DEFINITIONS: Record<string, BuffDefinition> = {
  soulflame: {
    name: 'Soulflame',
    canStack: true,
    maxStacks: 5,
    effects: [
      { kind: 'perfection', amount: { value: 4, scaling: 'stacks' } },
      { kind: 'stability', amount: { value: -3 } },
      { kind: 'addStack', stacks: { value: -1 } },
    ],
  },
  purifyingIntensity: {
    name: 'Purifying Intensity',
    canStack: true,
    maxStacks: 4,
    stats: {
      intensity: { value: 2, scaling: 'stacks' },
      poolCostPercentage: { value: 120 },
    },
    effects: [{ kind: 'addStack', stacks: { value: -1 } }],
  },
  turbidQi: {
    name: 'Turbid Qi',
    canStack: true,
    stats: {
      poolCostFlat: { value: 2, scaling: 'stacks' },
    },
    // Purely a cost tax: no per-turn effects, so it also covers the
    // stats-only buff shape.
    effects: [],
  },
  fusionEcho: {
    name: 'Fusion Echo',
    canStack: false,
    effects: [{ kind: 'pool', amount: { value: -4 } }],
    onFusion: [
      { kind: 'completion', amount: { value: 9 } },
      { kind: 'negate' },
    ],
    onRefine: [{ kind: 'perfection', amount: { value: 5 } }],
  },
  volatileEssence: {
    name: 'Volatile Essence',
    canStack: true,
    maxStacks: 3,
    effects: [
      { kind: 'changeToxicity', amount: { value: -5 } },
      { kind: 'maxStability', amount: { value: -1 } },
      {
        kind: 'perfection',
        amount: { value: 12 },
        condition: { kind: 'chance', percentage: 40 },
      },
    ],
  },
  falseFusionReady: {
    name: 'False Fusion Ready',
    canStack: true,
    maxStacks: 2,
    // A pure gate token; its whole job is unlocking `false_fusion`.
    effects: [],
  },
  lingeringWarmth: {
    name: 'Lingering Warmth',
    canStack: false,
    effects: [
      {
        kind: 'stability',
        amount: { value: 6 },
        condition: { kind: 'stability', mode: 'less', percentage: 50 },
      },
      { kind: 'negate' },
    ],
  },
};

function trackedBuff(definitionKey: string, stacks: number): TrackedBuff {
  const definition = BUFF_DEFINITIONS[definitionKey];
  if (!definition) throw new Error(`unknown buff fixture: ${definitionKey}`);
  return { name: definition.name, stacks, definition };
}

function buffMap(
  entries: ReadonlyArray<[string, string, number]>,
): Map<string, TrackedBuff> {
  const map = new Map<string, TrackedBuff>();
  for (const [key, definitionKey, stacks] of entries) {
    map.set(key, trackedBuff(definitionKey, stacks));
  }
  return map;
}

/**
 * Techniques described by effect trees, mastery entries and buff gates.
 *
 * These are the shapes the runtime actually ships; the scalar set above only
 * survives for offline fixtures.
 */
function effectSkillSet(): SkillDefinition[] {
  return [
    skill({
      name: 'Effect Refine',
      key: 'effect_refine',
      qiCost: 12,
      stabilityCost: 5,
      type: 'refine',
      scalesWithIntensity: false,
      baseCompletionGain: 0,
      basePerfectionGain: 0,
      effects: [
        { kind: 'perfection', amount: { value: 3, stat: 'control' } },
        { kind: 'stability', amount: { value: -2 } },
      ],
    }),
    skill({
      name: 'Effect Fusion',
      key: 'effect_fusion',
      qiCost: 16,
      stabilityCost: 7,
      type: 'fusion',
      scalesWithIntensity: false,
      baseCompletionGain: 0,
      effects: [
        { kind: 'completion', amount: { value: 2, stat: 'intensity' } },
        {
          kind: 'completion',
          amount: { value: 20 },
          condition: { kind: 'chance', percentage: 35 },
        },
      ],
    }),
    skill({
      name: 'Conditional Surge',
      key: 'conditional_surge',
      qiCost: 10,
      stabilityCost: 4,
      type: 'fusion',
      scalesWithIntensity: false,
      baseCompletionGain: 0,
      effects: [
        {
          kind: 'completion',
          amount: { value: 30 },
          condition: { kind: 'pool', mode: 'more', percentage: 50 },
        },
        {
          kind: 'perfection',
          amount: { value: 10 },
          condition: { kind: 'stability', mode: 'less', percentage: 40 },
        },
      ],
    }),
    skill({
      name: 'Mastered Refine',
      key: 'mastered_refine',
      qiCost: 14,
      stabilityCost: 5,
      type: 'refine',
      scalesWithIntensity: false,
      baseCompletionGain: 0,
      effects: [
        {
          kind: 'perfection',
          amount: { value: 2, stat: 'control', upgradeKey: 'refine_power' },
        },
      ],
      masteryEntries: [
        { kind: 'control', percentage: 25 },
        { kind: 'critchance', percentage: 15 },
        { kind: 'upgrade', upgradeKey: 'refine_power', change: 1 },
        {
          kind: 'intensity',
          percentage: 50,
          condition: { kind: 'stability', mode: 'less', percentage: 40 },
        },
      ],
      mastery: {
        controlBonus: 0,
        intensityBonus: 0,
        poolCostReduction: 0.25,
        stabilityCostReduction: 2,
        successChanceBonus: 0,
        critChanceBonus: 0,
        critMultiplierBonus: 0,
      },
    }),
    skill({
      name: 'Kindle Soulflame',
      key: 'kindle_soulflame',
      qiCost: 12,
      stabilityCost: 3,
      type: 'support',
      scalesWithIntensity: false,
      baseCompletionGain: 0,
      effects: [
        {
          kind: 'createBuff',
          buff: BUFF_DEFINITIONS.soulflame,
          stacks: { value: 2 },
        },
      ],
      grantedBuff: BUFF_DEFINITIONS.soulflame,
    }),
    skill({
      name: 'Quench Soulflame',
      key: 'quench_soulflame',
      qiCost: 6,
      stabilityCost: 0,
      type: 'stabilize',
      scalesWithIntensity: false,
      baseCompletionGain: 0,
      effects: [
        {
          kind: 'consumeBuff',
          buff: BUFF_DEFINITIONS.soulflame,
          stacks: { value: 1 },
        },
        { kind: 'stability', amount: { value: 8 } },
      ],
    }),
    skill({
      name: 'Disciplined Touch',
      key: 'disciplined_touch',
      qiCost: 20,
      stabilityCost: 8,
      type: 'refine',
      scalesWithIntensity: false,
      baseCompletionGain: 1,
      basePerfectionGain: 1,
      isDisciplinedTouch: true,
    }),
    skill({
      name: 'Prime False Fusion',
      key: 'prime_false_fusion',
      qiCost: 8,
      stabilityCost: 2,
      type: 'support',
      scalesWithIntensity: false,
      baseCompletionGain: 0,
      effects: [
        {
          kind: 'createBuff',
          buff: BUFF_DEFINITIONS.falseFusionReady,
          stacks: { value: 1 },
        },
      ],
      grantedBuff: BUFF_DEFINITIONS.falseFusionReady,
    }),
    skill({
      name: 'False Fusion',
      key: 'false_fusion',
      qiCost: 24,
      stabilityCost: 10,
      type: 'fusion',
      scalesWithIntensity: false,
      baseCompletionGain: 0,
      buffRequirement: { buffName: 'false_fusion_ready', amount: 1 },
      buffCost: { buffName: 'false_fusion_ready', amount: 1 },
      effects: [
        { kind: 'completion', amount: { value: 6, stat: 'intensity' } },
      ],
    }),
    skill({
      name: 'Restorative Pool',
      key: 'restorative_pool',
      qiCost: 0,
      stabilityCost: 6,
      type: 'support',
      scalesWithIntensity: false,
      baseCompletionGain: 0,
      effects: [
        { kind: 'pool', amount: { value: 45 } },
        { kind: 'maxStability', amount: { value: 3 } },
      ],
    }),
    skill({
      name: 'Qi Restoring Pill',
      key: 'qi_restoring_pill',
      qiCost: 0,
      stabilityCost: 0,
      type: 'support',
      scalesWithIntensity: false,
      baseCompletionGain: 0,
      actionKind: 'item',
      consumesTurn: false,
      itemName: 'Qi Restoring Pill',
      toxicityCost: 9,
      effects: [{ kind: 'pool', amount: { value: 40 } }],
    }),
    skill({
      name: 'Cleansing Pill',
      key: 'cleansing_pill',
      qiCost: 0,
      stabilityCost: 0,
      type: 'support',
      scalesWithIntensity: false,
      baseCompletionGain: 0,
      actionKind: 'item',
      consumesTurn: false,
      itemName: 'Cleansing Pill',
      toxicityCleanse: 20,
    }),
    skill({
      name: 'Spirit Reagent',
      key: 'spirit_reagent',
      qiCost: 0,
      stabilityCost: 0,
      type: 'support',
      scalesWithIntensity: false,
      baseCompletionGain: 0,
      actionKind: 'item',
      consumesTurn: false,
      itemName: 'Spirit Reagent',
      reagentOnlyAtStepZero: true,
      effects: [
        {
          kind: 'createBuff',
          buff: BUFF_DEFINITIONS.purifyingIntensity,
          stacks: { value: 3 },
        },
      ],
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

function digestHarmonyData(
  data: HarmonyData | undefined,
): DifferentialHarmonyDigest {
  return {
    forgeHeat: data?.forgeWorks?.heat ?? null,
    forgeLastBuffedHeat: data?.forgeWorks?.lastBuffedHeat ?? null,
    alchemicalCharges: data?.alchemicalArts
      ? [...data.alchemicalArts.charges]
      : null,
    alchemicalLastCombo: data?.alchemicalArts
      ? [...data.alchemicalArts.lastCombo]
      : null,
    inscriptionCurrentBlock: data?.inscribedPatterns
      ? [...data.inscribedPatterns.currentBlock]
      : null,
    inscriptionCompletedBlocks:
      data?.inscribedPatterns?.completedBlocks ?? null,
    inscriptionStacks: data?.inscribedPatterns?.stacks ?? null,
    resonanceType: data?.resonance?.resonance ?? null,
    resonanceStrength: data?.resonance?.strength ?? null,
    resonancePending: data?.resonance?.pendingResonance ?? null,
    resonancePendingCount: data?.resonance?.pendingCount ?? null,
    echoAttunedType: data?.enhancingEcho?.attunedType ?? null,
    echoLastOutcome: data?.enhancingEcho?.lastOutcome ?? null,
    decreeFocusedBar: data?.eccentricDecree?.focusedBar ?? null,
    decreeLastCompletion: data?.eccentricDecree?.lastCompletion ?? null,
    decreeLastPerfection: data?.eccentricDecree?.lastPerfection ?? null,
  };
}

function buildScenario(spec: ScenarioSpec): DifferentialScenario {
  // Item actions are part of the searchable action space on both sides now, so
  // the corpus must not filter them out: doing so would leave pills and
  // reagents unproven precisely where the two engines could disagree.
  const skills = spec.config.skills || [];
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
            buffs: Array.from(next.buffs.entries()).map(([key, buff]) => ({
              key,
              stacks: buff.stacks,
            })),
            items: Array.from(next.items.entries()).map(([key, count]) => ({
              key,
              count,
            })),
            consumedPillsThisTurn: next.consumedPillsThisTurn,
            harmonyData: digestHarmonyData(next.harmonyData),
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
    state: new CraftingState({
      qi: 150,
      stability: 55,
      initialMaxStability: 60,
    }),
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

/**
 * Scenarios for the mechanics the Rust engine gained in this pass.
 *
 * Each one is aimed at a specific divergence risk rather than at coverage for
 * its own sake, so a failure names the mechanic that broke.
 */
function effectMechanicScenarios(): ScenarioSpec[] {
  const skills = effectSkillSet();
  const items = new Map<string, number>([
    ['qi_restoring_pill', 3],
    ['cleansing_pill', 1],
    ['spirit_reagent', 2],
  ]);
  const effectConfig = (overrides: Partial<OptimizerConfig> = {}) =>
    config({
      skills,
      maxToxicity: 100,
      targetCompletion: 150,
      targetPerfection: 110,
      pillsPerRound: 2,
      ...overrides,
    });

  const specs: ScenarioSpec[] = [];

  specs.push({
    name: 'effects-baseline',
    state: new CraftingState({
      qi: 170,
      stability: 50,
      initialMaxStability: 60,
      maxToxicity: 100,
      items,
    }),
    config: effectConfig(),
    targetCompletion: 150,
    targetPerfection: 110,
    condition: 'neutral',
  });

  // Low pool and low stability flip the resource-conditioned effects and the
  // conditional mastery, which is the case most likely to diverge.
  specs.push({
    name: 'effects-low-resources',
    state: new CraftingState({
      qi: 60,
      stability: 14,
      initialMaxStability: 60,
      stabilityPenalty: 8,
      toxicity: 30,
      maxToxicity: 100,
      completion: 120,
      perfection: 40,
      completionBonus: 1,
      items,
    }),
    config: effectConfig(),
    targetCompletion: 150,
    targetPerfection: 110,
    condition: 'neutral',
  });

  specs.push({
    name: 'effects-soulflame-active',
    state: new CraftingState({
      qi: 150,
      stability: 46,
      initialMaxStability: 60,
      maxToxicity: 100,
      buffs: buffMap([['soulflame', 'soulflame', 3]]),
      items,
    }),
    config: effectConfig(),
    targetCompletion: 150,
    targetPerfection: 110,
    condition: 'neutral',
  });

  specs.push({
    name: 'effects-soulflame-last-stack',
    state: new CraftingState({
      qi: 150,
      stability: 20,
      initialMaxStability: 60,
      maxToxicity: 100,
      buffs: buffMap([['soulflame', 'soulflame', 1]]),
      items,
    }),
    config: effectConfig(),
    targetCompletion: 150,
    targetPerfection: 110,
    condition: 'neutral',
  });

  specs.push({
    name: 'effects-buff-stat-contributions',
    state: new CraftingState({
      qi: 160,
      stability: 44,
      initialMaxStability: 60,
      maxToxicity: 100,
      buffs: buffMap([
        ['purifying_intensity', 'purifyingIntensity', 3],
        ['turbid_qi', 'turbidQi', 4],
      ]),
      items,
    }),
    config: effectConfig(),
    targetCompletion: 150,
    targetPerfection: 110,
    condition: 'neutral',
  });

  specs.push({
    name: 'effects-action-type-hooks',
    state: new CraftingState({
      qi: 150,
      stability: 40,
      initialMaxStability: 60,
      maxToxicity: 100,
      buffs: buffMap([['fusion_echo', 'fusionEcho', 1]]),
      items,
    }),
    config: effectConfig(),
    targetCompletion: 150,
    targetPerfection: 110,
    condition: 'neutral',
  });

  specs.push({
    name: 'effects-toxicity-and-max-stability',
    state: new CraftingState({
      qi: 140,
      stability: 38,
      initialMaxStability: 60,
      stabilityPenalty: 4,
      toxicity: 45,
      maxToxicity: 60,
      buffs: buffMap([['volatile_essence', 'volatileEssence', 2]]),
      items,
    }),
    config: effectConfig({ maxToxicity: 60 }),
    targetCompletion: 150,
    targetPerfection: 110,
    condition: 'neutral',
  });

  specs.push({
    name: 'effects-gated-technique-ready',
    state: new CraftingState({
      qi: 180,
      stability: 50,
      initialMaxStability: 60,
      maxToxicity: 100,
      buffs: buffMap([['false_fusion_ready', 'falseFusionReady', 2]]),
      items,
    }),
    config: effectConfig(),
    targetCompletion: 150,
    targetPerfection: 110,
    condition: 'neutral',
  });

  // No `false_fusion_ready`: the gated technique must be rejected identically.
  specs.push({
    name: 'effects-gated-technique-locked',
    state: new CraftingState({
      qi: 180,
      stability: 50,
      initialMaxStability: 60,
      maxToxicity: 100,
      items,
    }),
    config: effectConfig(),
    targetCompletion: 150,
    targetPerfection: 110,
    condition: 'neutral',
  });

  // Step 0 is the only step where a reagent is legal.
  specs.push({
    name: 'effects-items-step-zero',
    state: new CraftingState({
      qi: 90,
      stability: 55,
      initialMaxStability: 60,
      maxToxicity: 100,
      step: 0,
      items,
    }),
    config: effectConfig(),
    targetCompletion: 150,
    targetPerfection: 110,
    condition: 'neutral',
  });

  specs.push({
    name: 'effects-items-pill-budget-spent',
    state: new CraftingState({
      qi: 90,
      stability: 55,
      initialMaxStability: 60,
      maxToxicity: 100,
      step: 4,
      consumedPillsThisTurn: 2,
      items,
    }),
    config: effectConfig(),
    targetCompletion: 150,
    targetPerfection: 110,
    condition: 'neutral',
  });

  specs.push({
    name: 'effects-items-exhausted',
    state: new CraftingState({
      qi: 90,
      stability: 55,
      initialMaxStability: 60,
      maxToxicity: 100,
      step: 2,
      items: new Map<string, number>([['cleansing_pill', 1]]),
      toxicity: 30,
    }),
    config: effectConfig(),
    targetCompletion: 150,
    targetPerfection: 110,
    condition: 'neutral',
  });

  // Turbid Qi grants a stack on every third step from 100 onward.
  specs.push({
    name: 'effects-turbid-qi-step',
    state: new CraftingState({
      qi: 150,
      stability: 40,
      initialMaxStability: 60,
      maxToxicity: 100,
      step: 101,
      buffs: buffMap([['turbid_qi', 'turbidQi', 5]]),
      items,
    }),
    config: effectConfig(),
    targetCompletion: 150,
    targetPerfection: 110,
    condition: 'neutral',
  });

  specs.push({
    name: 'effects-conditional-buff-effect',
    state: new CraftingState({
      qi: 150,
      stability: 18,
      initialMaxStability: 60,
      maxToxicity: 100,
      buffs: buffMap([['lingering_warmth', 'lingeringWarmth', 1]]),
      items,
    }),
    config: effectConfig(),
    targetCompletion: 150,
    targetPerfection: 110,
    condition: 'neutral',
  });

  // Effect trees crossed with conditions and with every harmony subsystem: the
  // interaction is where per-mechanic ports usually diverge.
  const conditionConfig = effectConfig({
    conditionEffectsData: {
      neutral: [],
      positive: [
        { kind: 'control', multiplier: 0.5 },
        { kind: 'pool', multiplier: 0.75 },
      ],
      negative: [
        { kind: 'intensity', multiplier: -0.25 },
        { kind: 'stability', multiplier: 1.5 },
      ],
      veryPositive: [{ kind: 'intensity', multiplier: 1 }],
      veryNegative: [{ kind: 'pool', multiplier: 1.5 }],
    },
  });
  for (const condition of ['positive', 'negative', 'veryNegative']) {
    specs.push({
      name: `effects-condition-${condition}`,
      state: new CraftingState({
        qi: 160,
        stability: 44,
        initialMaxStability: 60,
        maxToxicity: 100,
        buffs: buffMap([['soulflame', 'soulflame', 2]]),
        items,
      }),
      config: conditionConfig,
      targetCompletion: 150,
      targetPerfection: 110,
      condition,
    });
  }

  for (const harmonyType of HARMONY_TYPES) {
    specs.push({
      name: `effects-harmony-${harmonyType}`,
      state: new CraftingState({
        qi: 175,
        stability: 48,
        initialMaxStability: 60,
        maxToxicity: 100,
        harmony: 30,
        harmonyData: harmonyDataFor(harmonyType),
        buffs: buffMap([
          ['soulflame', 'soulflame', 2],
          ['purifying_intensity', 'purifyingIntensity', 2],
        ]),
        items,
      }),
      config: effectConfig({
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

/**
 * Randomised effect-tree scenarios.
 *
 * The hand-written cases above pin known interactions; these cover shapes
 * nobody thought to write down, which is how the first pass found most of its
 * 237 divergences.
 */
function randomEffectScenarios(count: number): ScenarioSpec[] {
  const rng = new Lcg(0x51ed_3c07);
  const skills = effectSkillSet();
  const buffPool: ReadonlyArray<[string, string]> = [
    ['soulflame', 'soulflame'],
    ['purifying_intensity', 'purifyingIntensity'],
    ['turbid_qi', 'turbidQi'],
    ['fusion_echo', 'fusionEcho'],
    ['volatile_essence', 'volatileEssence'],
    ['false_fusion_ready', 'falseFusionReady'],
    ['lingering_warmth', 'lingeringWarmth'],
  ];
  const conditions = ['neutral', 'positive', 'negative'] as const;
  const specs: ScenarioSpec[] = [];

  for (let index = 0; index < count; index++) {
    const initialMaxStability = rng.int(40, 80);
    const stabilityPenalty = rng.int(0, 12);
    const isSublime = rng.next() < 0.5;
    const harmonyType = isSublime ? rng.pick(HARMONY_TYPES) : undefined;

    const buffEntries: Array<[string, string, number]> = [];
    for (const [key, definitionKey] of buffPool) {
      if (rng.next() < 0.45) {
        buffEntries.push([key, definitionKey, rng.int(1, 4)]);
      }
    }
    const items = new Map<string, number>();
    if (rng.next() < 0.7) items.set('qi_restoring_pill', rng.int(1, 3));
    if (rng.next() < 0.5) items.set('cleansing_pill', rng.int(1, 2));
    if (rng.next() < 0.4) items.set('spirit_reagent', rng.int(1, 2));

    const targetCompletion = rng.int(60, 300);
    const targetPerfection = rng.int(40, 220);

    specs.push({
      name: `random-effects-${index}`,
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
        poolCostFlat: rng.int(0, 5),
        poolCostPercentage: rng.int(60, 140),
        stabilityCostPercentage: rng.int(60, 140),
        controlBuffTurns: rng.int(0, 2),
        intensityBuffTurns: rng.int(0, 2),
        controlBuffMultiplier: 1 + rng.int(2, 6) / 10,
        intensityBuffMultiplier: 1 + rng.int(2, 6) / 10,
        toxicity: rng.int(0, 60),
        maxToxicity: 100,
        completionBonus: rng.int(0, 4),
        step: rng.pick([0, 1, 7, 99, 100, 101, 102]),
        consumedPillsThisTurn: rng.int(0, 2),
        harmony: isSublime ? rng.int(-100, 100) : 0,
        harmonyData: harmonyType ? harmonyDataFor(harmonyType) : undefined,
        buffs: buffMap(buffEntries),
        items,
      }),
      config: config({
        skills,
        maxQi: rng.int(120, 220),
        baseIntensity: rng.int(6, 40),
        baseControl: rng.int(6, 40),
        maxToxicity: 100,
        craftingType: harmonyType,
        isSublimeCraft: isSublime,
        targetCompletion,
        targetPerfection,
        pillsPerRound: rng.int(1, 3),
      }),
      targetCompletion,
      targetPerfection,
      condition: rng.pick(conditions),
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
  const specs = [
    ...handWrittenScenarios(),
    ...randomScenarios(48),
    ...effectMechanicScenarios(),
    ...randomEffectScenarios(40),
  ];
  return {
    version: DIFFERENTIAL_CORPUS_VERSION,
    scenarios: specs.map(buildScenario),
  };
}
