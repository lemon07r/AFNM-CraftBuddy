import type {
  CraftingConditionType,
  ConditionTransitionProvider,
  SearchConfig,
  ConditionTransition,
} from './types';

export {
  normalizeConditionType,
  getConditionTransitionsWithProvider,
  getGeneratedConditionDistribution,
};

/** Game UI + runtime always expose 3 future conditions. */
export const VISIBLE_CONDITION_QUEUE_LENGTH = 3;

function normalizeConditionType(
  condition: string | undefined,
): CraftingConditionType {
  if (!condition) return 'neutral';
  const c = String(condition).toLowerCase();
  switch (c) {
    case 'neutral':
    case 'balanced':
      return 'neutral';
    case 'positive':
    case 'harmonious':
      return 'positive';
    case 'negative':
    case 'resistant':
      return 'negative';
    case 'verypositive':
    case 'excellent':
    case 'brilliant':
      return 'veryPositive';
    case 'verynegative':
    case 'corrupted':
      return 'veryNegative';
    default:
      return c as CraftingConditionType;
  }
}

interface ConditionDistributionEntry {
  condition: CraftingConditionType;
  probability: number;
}

let activeConditionTransitionProvider: ConditionTransitionProvider | undefined;

export function setConditionTransitionProvider(
  provider: ConditionTransitionProvider | undefined,
): void {
  activeConditionTransitionProvider = provider;
}

function clampProbability(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function normalizeConditionDistribution(
  entries: ConditionDistributionEntry[],
): ConditionDistributionEntry[] {
  const merged = new Map<CraftingConditionType, number>();
  for (const entry of entries) {
    if (!entry?.condition) continue;
    const probability = clampProbability(entry.probability);
    if (probability <= 0) continue;
    merged.set(
      entry.condition,
      (merged.get(entry.condition) || 0) + probability,
    );
  }
  const total = Array.from(merged.values()).reduce(
    (sum, value) => sum + value,
    0,
  );
  if (total <= 0) {
    return [{ condition: 'neutral', probability: 1 }];
  }
  return Array.from(merged.entries())
    .map(([condition, probability]) => ({
      condition,
      probability: probability / total,
    }))
    .sort((a, b) => b.probability - a.probability);
}

function getGeneratedConditionDistribution(
  currentCondition: CraftingConditionType,
  nextConditions: CraftingConditionType[],
  harmony: number,
  discordance: number = 0,
): ConditionDistributionEntry[] {
  const current = normalizeConditionType(currentCondition);
  const queue = nextConditions.map(normalizeConditionType);
  const negativeDelta = harmony < 0 ? Math.abs(harmony) / 100 : 0;
  const positiveDelta = harmony > 0 ? Math.abs(harmony) / 100 : 0;
  const lastCondition = queue.length > 0 ? queue[queue.length - 1] : undefined;

  if (discordance > 0) {
    // Bounds here describe probabilities of random()<threshold; neither the
    // runtime's harmony nor its discordance input is clamped before the rolls.
    const active = clampProbability(discordance);
    const extreme = active * clampProbability(0.18 / discordance);
    const mild = active - extreme;
    const positive = clampProbability(0.5 + (harmony / 100) * 0.25);
    return normalizeConditionDistribution([
      { condition: 'neutral', probability: 1 - active },
      { condition: 'veryPositive', probability: extreme / 2 },
      { condition: 'veryNegative', probability: extreme / 2 },
      { condition: 'positive', probability: mild * positive },
      { condition: 'negative', probability: mild * (1 - positive) },
    ]);
  }

  if (lastCondition === 'veryPositive' || lastCondition === 'veryNegative') {
    return [{ condition: 'neutral', probability: 1 }];
  }
  if (lastCondition === 'positive') {
    const upgradeChance = clampProbability(0.3 * positiveDelta);
    return normalizeConditionDistribution([
      { condition: 'veryPositive', probability: upgradeChance },
      { condition: 'neutral', probability: 1 - upgradeChance },
    ]);
  }
  if (lastCondition === 'negative') {
    const upgradeChance = clampProbability(0.3 * negativeDelta);
    return normalizeConditionDistribution([
      { condition: 'veryNegative', probability: upgradeChance },
      { condition: 'neutral', probability: 1 - upgradeChance },
    ]);
  }

  let changeProbability = 0;
  if (
    current === 'neutral' &&
    queue.every((condition) => condition === 'neutral')
  ) {
    changeProbability = 1;
  } else {
    let neutralCount = 0;
    for (let i = queue.length - 1; i >= 0; i--) {
      if (queue[i] === 'neutral') {
        neutralCount++;
      } else {
        break;
      }
    }
    changeProbability = clampProbability(
      neutralCount * (0.15 + 0.15 * Math.max(negativeDelta, positiveDelta)),
    );
  }

  const positiveChance = clampProbability((harmony + 100) / 200);
  return normalizeConditionDistribution([
    { condition: 'neutral', probability: 1 - changeProbability },
    {
      condition: 'positive',
      probability: changeProbability * positiveChance,
    },
    {
      condition: 'negative',
      probability: changeProbability * (1 - positiveChance),
    },
  ]);
}

function pickBranchConditionDistribution(
  distribution: ConditionDistributionEntry[],
  cfg: SearchConfig,
): ConditionDistributionEntry[] {
  if (!cfg.enableConditionBranchingAfterForecast) {
    const first = distribution[0] || { condition: 'neutral', probability: 1 };
    return [{ condition: first.condition, probability: 1 }];
  }

  const keptByProbability = distribution.filter(
    (entry) => entry.probability >= cfg.conditionBranchMinProbability,
  );
  const limited = (
    keptByProbability.length > 0 ? keptByProbability : distribution
  ).slice(0, Math.max(1, Math.floor(cfg.conditionBranchLimit)));

  return normalizeConditionDistribution(limited);
}

function getMostLikelyCondition(
  distribution: ConditionDistributionEntry[],
): CraftingConditionType {
  return (distribution[0]?.condition || 'neutral') as CraftingConditionType;
}

function getConditionTransitions(
  currentCondition: CraftingConditionType,
  nextConditions: CraftingConditionType[],
  harmony: number,
  cfg: SearchConfig,
): ConditionTransition[] {
  const queue = nextConditions.map(normalizeConditionType);
  const discordance = cfg.conditionDiscordance ?? 0;
  if (queue.length > 0) {
    const nextCondition = queue[0];
    const shiftedQueue = queue.slice(1);
    const appendedDistribution = getGeneratedConditionDistribution(
      nextCondition,
      shiftedQueue,
      harmony,
      discordance,
    );
    const appendedBranches = pickBranchConditionDistribution(
      appendedDistribution,
      cfg,
    );
    return appendedBranches.map((entry) => ({
      nextCondition,
      nextQueue: [...shiftedQueue, entry.condition],
      probability: entry.probability,
    }));
  }

  const generatedDistribution = getGeneratedConditionDistribution(
    currentCondition,
    queue,
    harmony,
    discordance,
  );
  const branchedDistribution = pickBranchConditionDistribution(
    generatedDistribution,
    cfg,
  );
  return branchedDistribution.map((entry) => {
    const appendedDistribution = getGeneratedConditionDistribution(
      entry.condition,
      [],
      harmony,
      discordance,
    );
    const appendedCondition = getMostLikelyCondition(appendedDistribution);
    return {
      nextCondition: entry.condition,
      nextQueue: [appendedCondition],
      probability: entry.probability,
    };
  });
}

function getConditionTransitionsWithProvider(
  currentCondition: CraftingConditionType,
  nextConditions: CraftingConditionType[],
  harmony: number,
  cfg: SearchConfig,
): ConditionTransition[] {
  if (activeConditionTransitionProvider) {
    try {
      const provided = activeConditionTransitionProvider(
        currentCondition,
        nextConditions,
        harmony,
        cfg,
      );
      if (Array.isArray(provided) && provided.length > 0) {
        const normalized = provided
          .map((entry) => ({
            nextCondition: normalizeConditionType(entry?.nextCondition),
            nextQueue: Array.isArray(entry?.nextQueue)
              ? entry.nextQueue.map(normalizeConditionType)
              : [],
            probability: clampProbability(entry?.probability ?? 0),
          }))
          .filter((entry) => entry.probability > 0);
        const total = normalized.reduce(
          (sum, entry) => sum + entry.probability,
          0,
        );
        if (total > 0) {
          return normalized.map((entry) => ({
            ...entry,
            probability: entry.probability / total,
          }));
        }
      }
    } catch (error) {
      console.warn(
        '[CraftBuddy] Condition transition provider failed, using local fallback:',
        error,
      );
    }
  }
  return getConditionTransitions(
    currentCondition,
    nextConditions,
    harmony,
    cfg,
  );
}

export function normalizeForecastConditionQueue(
  currentConditionType: CraftingConditionType | undefined,
  forecastedConditionTypes: CraftingConditionType[],
  harmony: number,
  visibleQueueLength: number = VISIBLE_CONDITION_QUEUE_LENGTH,
  discordance: number = 0,
): CraftingConditionType[] {
  const targetLength = Math.max(0, Math.floor(visibleQueueLength));
  const normalizedCurrent = normalizeConditionType(currentConditionType);
  const queue = forecastedConditionTypes
    .map(normalizeConditionType)
    .slice(0, targetLength);

  while (queue.length < targetLength) {
    const distribution = getGeneratedConditionDistribution(
      normalizedCurrent,
      queue,
      harmony,
      discordance,
    );
    queue.push(getMostLikelyCondition(distribution));
  }

  return queue;
}
