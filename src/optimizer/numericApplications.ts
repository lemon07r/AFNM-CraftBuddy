import type { ScalingVariables } from './gameTypes';
import { safeFloor, safeMultiply } from '../utils/largeNumbers';

/** The common preparation boundary for individual numeric applications. */
export interface NumericApplication {
  /** Existing expected-state gain, before the resource-specific applier. */
  amount: number;
  /** Realized gain used by stability's per-outcome cleanup. */
  realizedAmount: number;
  probability: number;
}

export function applyGainBoost(amount: number, boost: number): number {
  if (amount <= 0 || boost === 0 || !Number.isFinite(boost)) return amount;
  return safeFloor(safeMultiply(amount, 1 + boost / 100));
}

export function prepareNumericApplication(
  kind: string,
  rawAmount: number,
  variables: ScalingVariables,
  probability = 1,
): NumericApplication {
  const boost =
    kind === 'completion'
      ? variables.completionBoost
      : kind === 'perfection'
        ? variables.perfectionBoost
        : kind === 'stability'
          ? variables.stabilityBoost
          : kind === 'pool'
            ? variables.qiBoost
            : 0;
  return {
    amount: applyGainBoost(rawAmount * probability, boost),
    realizedAmount: applyGainBoost(rawAmount, boost),
    probability,
  };
}
