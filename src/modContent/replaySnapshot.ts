import { CraftingState, findBestSkill } from '../optimizer';
import type {
  SearchConfig,
  SearchResult,
  SkillRecommendation,
} from '../optimizer';
import type { SkillDefinition, OptimizerConfig } from '../optimizer/skills';
import type { HarmonyDataSource } from './harmonyState';

export interface OptimizerReplaySearchConfigSnapshot extends Pick<
  SearchConfig,
  'timeBudgetMs' | 'maxNodes' | 'beamWidth'
> {}

export interface OptimizerReplayInputSnapshot {
  createdAt: string;
  searchEpoch: number;
  lookaheadDepth: number;
  targets: {
    completion: number;
    perfection: number;
    stability: number;
  };
  caps: {
    maxCompletionCap: number | null;
    maxPerfectionCap: number | null;
  };
  conditions: {
    current: string;
    forecast: string[];
    normalizedForecast: string[];
  };
  searchConfig: OptimizerReplaySearchConfigSnapshot;
  settings: {
    lookaheadDepth: number;
    searchTimeBudgetMs: number;
    searchMaxNodes: number;
    searchBeamWidth: number;
    compactMode: boolean;
    panelVisible: boolean;
  };
  state: Record<string, unknown>;
  config: Record<string, unknown>;
  context: {
    recipeName?: string;
    craftingType: string;
    craftingTypeSource: string;
    isSublimeCraft: boolean;
    sublimeTargetMultiplier: number;
    sublimeDetectionSignals: unknown[];
    targetStabilityAtSearchStart: number;
    integration: Record<string, unknown>;
    rawCraftContext: Record<string, unknown>;
  };
}

export interface OptimizerReplaySnapshot {
  input: OptimizerReplayInputSnapshot;
  output?: {
    recommendation?: {
      skill?: {
        key?: string;
        name?: string;
        type?: string;
      } | null;
    } | null;
    [key: string]: unknown;
  };
  error?: string;
  completedAt?: string;
}

export interface OptimizerReplayExecution {
  config: OptimizerConfig;
  result: SearchResult;
  state: CraftingState;
}

export function sanitizeForJson(
  value: unknown,
  seen: WeakSet<object> = new WeakSet(),
): unknown {
  if (value === undefined) return null;
  if (value === null) return null;
  const valueType = typeof value;
  if (
    valueType === 'number' ||
    valueType === 'string' ||
    valueType === 'boolean'
  ) {
    return value;
  }
  if (valueType === 'bigint') {
    return value.toString();
  }
  if (valueType === 'symbol') {
    return String(value);
  }
  if (valueType === 'function') {
    return '[Function]';
  }
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (value instanceof Map) {
    const out: Record<string, unknown> = {};
    value.forEach((entry, key) => {
      out[String(key)] = sanitizeForJson(entry, seen);
    });
    return out;
  }
  if (value instanceof Set) {
    return Array.from(value).map((entry) => sanitizeForJson(entry, seen));
  }
  if (Array.isArray(value)) {
    return value.map((entry) => sanitizeForJson(entry, seen));
  }
  if (valueType === 'object') {
    const objectValue = value as Record<string, unknown>;
    if (seen.has(objectValue)) {
      return '[Circular]';
    }
    seen.add(objectValue);
    const out: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(objectValue)) {
      if (entry === undefined) continue;
      out[key] = sanitizeForJson(entry, seen);
    }
    seen.delete(objectValue);
    return out;
  }

  return String(value);
}

function mapToPlainObject<T>(
  map: Map<string, T>,
  serialize: (value: T) => unknown = (value) => value,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  map.forEach((value, key) => {
    out[key] = serialize(value);
  });
  return out;
}

export function buildSkillSnapshot(
  skill: SkillDefinition,
): Record<string, unknown> {
  return {
    name: skill.name,
    key: skill.key,
    type: skill.type,
    actionKind: skill.actionKind || 'skill',
    qiCost: skill.qiCost,
    stabilityCost: skill.stabilityCost,
    successChance: skill.successChance ?? 1,
    baseCompletionGain: skill.baseCompletionGain,
    basePerfectionGain: skill.basePerfectionGain,
    stabilityGain: skill.stabilityGain,
    maxStabilityChange: skill.maxStabilityChange,
    buffType: skill.buffType,
    buffDuration: skill.buffDuration,
    buffMultiplier: skill.buffMultiplier,
    scalesWithControl: !!skill.scalesWithControl,
    scalesWithIntensity: !!skill.scalesWithIntensity,
    isDisciplinedTouch: !!skill.isDisciplinedTouch,
    preventsMaxStabilityDecay: !!skill.preventsMaxStabilityDecay,
    toxicityCost: skill.toxicityCost ?? 0,
    toxicityCleanse: skill.toxicityCleanse ?? 0,
    cooldown: skill.cooldown ?? 0,
    mastery: skill.mastery ? sanitizeForJson(skill.mastery) : null,
    masteryEntries: skill.masteryEntries
      ? sanitizeForJson(skill.masteryEntries)
      : [],
    conditionRequirement: skill.conditionRequirement
      ? String(skill.conditionRequirement)
      : null,
    buffRequirement: skill.buffRequirement
      ? sanitizeForJson(skill.buffRequirement)
      : null,
    buffCost: skill.buffCost ? sanitizeForJson(skill.buffCost) : null,
    restoresQi: !!skill.restoresQi,
    qiRestore: skill.qiRestore ?? 0,
    restoresMaxStabilityToFull: !!skill.restoresMaxStabilityToFull,
    consumesTurn: skill.consumesTurn,
    itemName: skill.itemName ?? null,
    reagentOnlyAtStepZero: !!skill.reagentOnlyAtStepZero,
    effects: skill.effects ? sanitizeForJson(skill.effects) : [],
    grantedBuff: skill.grantedBuff ? sanitizeForJson(skill.grantedBuff) : null,
    nativeTechnique: skill.nativeTechnique
      ? sanitizeForJson(skill.nativeTechnique)
      : null,
  };
}

export function buildConfigSnapshot(
  config: OptimizerConfig,
): Record<string, unknown> {
  return {
    maxQi: config.maxQi,
    maxStability: config.maxStability,
    maxCompletion: config.maxCompletion ?? null,
    maxPerfection: config.maxPerfection ?? null,
    baseIntensity: config.baseIntensity,
    baseControl: config.baseControl,
    minStability: config.minStability,
    defaultBuffMultiplier: config.defaultBuffMultiplier,
    pillsPerRound: config.pillsPerRound ?? 1,
    maxToxicity: config.maxToxicity ?? 0,
    craftingType: config.craftingType ?? null,
    conditionEffectType: config.conditionEffectType ?? null,
    conditionEffectsData: config.conditionEffectsData
      ? sanitizeForJson(config.conditionEffectsData)
      : null,
    isSublimeCraft: !!config.isSublimeCraft,
    targetMultiplier: config.targetMultiplier ?? 1,
    targetCompletion: config.targetCompletion ?? null,
    targetPerfection: config.targetPerfection ?? null,
    trainingMode: !!config.trainingMode,
    skills: config.skills.map(buildSkillSnapshot),
  };
}

export function buildStateSnapshot(
  state: CraftingState,
  harmonyDataSource: HarmonyDataSource,
): Record<string, unknown> {
  return {
    qi: state.qi,
    stability: state.stability,
    maxStability: state.maxStability,
    initialMaxStability: state.initialMaxStability,
    stabilityPenalty: state.stabilityPenalty,
    completion: state.completion,
    perfection: state.perfection,
    critChance: state.critChance,
    critMultiplier: state.critMultiplier,
    successChanceBonus: state.successChanceBonus,
    poolCostPercentage: state.poolCostPercentage,
    stabilityCostPercentage: state.stabilityCostPercentage,
    controlBuffTurns: state.controlBuffTurns,
    intensityBuffTurns: state.intensityBuffTurns,
    controlBuffMultiplier: state.controlBuffMultiplier,
    intensityBuffMultiplier: state.intensityBuffMultiplier,
    toxicity: state.toxicity,
    maxToxicity: state.maxToxicity,
    harmony: state.harmony,
    harmonyData: state.harmonyData ? sanitizeForJson(state.harmonyData) : null,
    harmonyDataSource,
    step: state.step,
    completionBonus: state.completionBonus,
    consumedPillsThisTurn: state.consumedPillsThisTurn,
    cooldowns: mapToPlainObject(state.cooldowns),
    items: mapToPlainObject(state.items),
    buffs: mapToPlainObject(state.buffs, (buff) => ({
      name: buff.name,
      stacks: buff.stacks,
      definition: buff.definition ? sanitizeForJson(buff.definition) : null,
    })),
    nativeVariables: state.nativeVariables
      ? sanitizeForJson(state.nativeVariables)
      : null,
  };
}

export function reviveConfigSnapshot(
  snapshot: Record<string, unknown>,
): OptimizerConfig {
  return {
    ...(snapshot as unknown as OptimizerConfig),
    skills: ((snapshot.skills as SkillDefinition[]) || []).map((skill) => ({
      ...skill,
    })),
  };
}

export function reviveStateSnapshot(
  snapshot: Record<string, unknown>,
): CraftingState {
  return new CraftingState({
    ...(snapshot as ConstructorParameters<typeof CraftingState>[0]),
    cooldowns: new Map(Object.entries((snapshot.cooldowns as object) || {})),
    items: new Map(Object.entries((snapshot.items as object) || {})),
    buffs: new Map(Object.entries((snapshot.buffs as object) || {})),
  });
}

function summarizeRecommendation(
  recommendation: SearchResult['recommendation'],
): Record<string, unknown> | null {
  if (!recommendation) return null;
  return {
    skill: {
      name: recommendation.skill.name,
      key: recommendation.skill.key,
      type: recommendation.skill.type,
    },
    score: recommendation.score,
    qualityRating: recommendation.qualityRating ?? null,
    expectedGains: recommendation.expectedGains,
    immediateGains: recommendation.immediateGains,
    effectiveCosts: recommendation.effectiveCosts ?? null,
    followUpSkill: recommendation.followUpSkill ?? null,
    consumesBuff: recommendation.consumesBuff ?? false,
    reasoning: recommendation.reasoning,
  };
}

export function buildResultSnapshot(
  result: SearchResult,
): Record<string, unknown> {
  return {
    isTerminal: result.isTerminal,
    targetsMet: result.targetsMet,
    recommendation: summarizeRecommendation(result.recommendation),
    alternatives: result.alternativeSkills.map(
      (recommendation: SkillRecommendation) => ({
        skill: {
          name: recommendation.skill.name,
          key: recommendation.skill.key,
          type: recommendation.skill.type,
        },
        score: recommendation.score,
        qualityRating: recommendation.qualityRating ?? null,
        expectedGains: recommendation.expectedGains,
        immediateGains: recommendation.immediateGains,
        effectiveCosts: recommendation.effectiveCosts ?? null,
        followUpSkill: recommendation.followUpSkill ?? null,
        consumesBuff: recommendation.consumesBuff ?? false,
        reasoning: recommendation.reasoning,
      }),
    ),
    blockedReasons: result.blockedReasons ?? [],
    optimalRotation: result.optimalRotation ?? [],
    expectedFinalState: result.expectedFinalState ?? null,
    searchMetrics: result.searchMetrics ?? null,
  };
}

export function replayOptimizerSnapshot(
  snapshot: OptimizerReplaySnapshot,
): OptimizerReplayExecution {
  const config = reviveConfigSnapshot(snapshot.input.config);
  const state = reviveStateSnapshot(snapshot.input.state);
  const result = findBestSkill(
    state,
    config,
    snapshot.input.targets.completion,
    snapshot.input.targets.perfection,
    false,
    snapshot.input.lookaheadDepth,
    snapshot.input.conditions.current,
    snapshot.input.conditions.normalizedForecast ||
      snapshot.input.conditions.forecast,
    snapshot.input.searchConfig,
  );

  return {
    config,
    result,
    state,
  };
}
