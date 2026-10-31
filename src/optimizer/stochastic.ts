/** Deterministic, bounded enumeration of Bernoulli decisions. No RNG or global state. */
export type ChanceResolver = (key: string, probability: number) => number;

class DecisionRequired {
  constructor(
    readonly key: string,
    readonly probability: number,
  ) {}
}

export interface Distribution<T> {
  outcomes: Array<{ probability: number; value: T }>;
  /** Probability not evaluated within the branch budget. Never renormalized away. */
  unresolvedProbability: number;
}

export function enumerateDecisions<T>(
  evaluate: (resolve: ChanceResolver) => T,
  maxOutcomes = 64,
): Distribution<T> {
  const pending = [{ probability: 1, decisions: new Map<string, number>() }];
  const outcomes: Distribution<T>['outcomes'] = [];
  let attempts = 0;
  const limit = Math.max(1, Math.floor(maxOutcomes));
  while (pending.length && outcomes.length < limit && attempts++ < limit * 16) {
    const branch = pending.pop()!;
    try {
      const value = evaluate((key, rawProbability) => {
        const probability = Math.max(0, Math.min(1, rawProbability));
        if (probability === 0 || probability === 1) return probability;
        const decision = branch.decisions.get(key);
        if (decision !== undefined) return decision;
        throw new DecisionRequired(key, probability);
      });
      outcomes.push({ probability: branch.probability, value });
    } catch (error) {
      if (!(error instanceof DecisionRequired)) throw error;
      for (const decision of [1, 0]) {
        const probability =
          branch.probability *
          (decision ? error.probability : 1 - error.probability);
        if (probability > 0)
          pending.push({
            probability,
            decisions: new Map(branch.decisions).set(error.key, decision),
          });
      }
    }
  }
  return {
    outcomes,
    unresolvedProbability: pending.reduce(
      (sum, branch) => sum + branch.probability,
      0,
    ),
  };
}

export function scopeResolver(
  resolve: ChanceResolver | undefined,
  prefix: string,
): ChanceResolver | undefined {
  return resolve
    ? (key, probability) => resolve(`${prefix}/${key}`, probability)
    : undefined;
}

export function resolvedCrit(
  chance: number,
  multiplier: number,
  resolve: ChanceResolver,
  key: string,
  overcrit = 0,
): number {
  const critical = resolve(key, Math.max(0, Math.min(100, chance)) / 100);
  if (!critical) return 1;
  let count = 1,
    chainChance = Math.min(chance, 100);
  for (let i = 0; i < 9 && overcrit > 0; i++) {
    chainChance = Math.floor((chainChance * Math.min(overcrit, 90)) / 100);
    if (
      chainChance <= 0 ||
      !resolve(key + '/chain:' + i, Math.min(chainChance, 100) / 100)
    )
      break;
    count++;
  }
  return (
    (count *
      (multiplier +
        Math.max(0, chance - 100) * 3 +
        Math.max(0, overcrit - 90) * 5)) /
    100
  );
}

const prdCoefficients = new Map<number, number>();
/** Installed 0.7.18 JLc: calibrate increasing per-attempt probability. */
export function prdCoefficient(probability: number): number {
  if (probability <= 0 || probability >= 1)
    return Math.max(0, Math.min(1, probability));
  const cached = prdCoefficients.get(probability);
  if (cached !== undefined) return cached;
  const meanTrials = (coefficient: number) => {
    let mean = 0,
      remaining = 1;
    for (let i = 1; i <= Math.ceil(1 / coefficient); i++) {
      const p = Math.min(1, coefficient * i);
      mean += i * p * remaining;
      remaining *= 1 - p;
      if (remaining < 1e-9) break;
    }
    return mean;
  };
  let low = 0,
    high = probability;
  for (let i = 0; i < 64; i++) {
    const mid = (low + high) / 2;
    if (meanTrials(mid) > 1 / probability) low = mid;
    else high = mid;
  }
  const coefficient = (low + high) / 2;
  prdCoefficients.set(probability, coefficient);
  return coefficient;
}
