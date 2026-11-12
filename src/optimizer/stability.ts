export interface ActionSurvivabilityFloor {
  stability: number;
  maxStability: number;
  survivalProbability: number;
}

export interface StabilityOutcome {
  stability: number;
  maxStability: number;
  probability: number;
}

export interface SurvivalConditionedStability {
  stability: number;
  stabilityPenalty: number;
}

/** Turn-local quadrature: cleanup rounds each realized outcome, not its mean. */
export class StabilityProjection {
  private outcomes: Array<{
    stability: number;
    penalty: number;
    probability: number;
    techniqueSucceeded?: boolean;
  }>;
  // Legacy scalar gains and phase boundaries retain their established EV
  // state. When those collapse a roll, keep its survival branches through the
  // very same appliers rather than teaching the floor another effect language.
  private survival?: StabilityProjection;

  constructor(
    stability: number,
    penalty: number,
    previous?: StabilityProjection,
  ) {
    this.outcomes = [{ stability, penalty, probability: 1 }];
    const inherited = previous?.survival ?? previous;
    // Certain setup/mastery phases already have this exact point state. Only
    // retain a separate distribution when the EV boundary actually lost one.
    if (
      inherited &&
      (inherited.outcomes.length !== 1 ||
        inherited.outcomes[0].stability !== stability ||
        inherited.outcomes[0].penalty !== penalty)
    ) {
      this.survival = inherited.copySurvival();
    }
  }

  private copySurvival(): StabilityProjection {
    if (this.survival) return this.survival.copySurvival();
    const copy = new StabilityProjection(0, 0);
    copy.outcomes = this.outcomes.map((outcome) => ({ ...outcome }));
    return copy;
  }

  /** Keep compatibility EV unchanged, without treating a scalar mean as certain. */
  changeExpectedTechnique(
    expected: number,
    realized: number,
    probability: number,
  ): void {
    const survival = this.survival ?? this.copySurvival();
    this.survival = undefined;
    this.change(expected);
    survival.change(realized, 0, probability);
    this.survival = survival;
  }

  /** One action success roll shared by every technique resource effect. */
  beginTechnique(probability: number): void {
    this.survival?.beginTechnique(probability);
    if (probability >= 1) return;
    this.outcomes = this.outcomes.flatMap((outcome) => [
      ...(probability > 0
        ? [
            {
              ...outcome,
              probability: outcome.probability * probability,
              techniqueSucceeded: true,
            },
          ]
        : []),
      ...(probability < 1
        ? [
            {
              ...outcome,
              probability: outcome.probability * (1 - probability),
              techniqueSucceeded: false,
            },
          ]
        : []),
    ]);
  }

  endTechnique(): void {
    this.survival?.endTechnique();
    for (const outcome of this.outcomes) delete outcome.techniqueSucceeded;
  }

  changeTechnique(
    stability: number,
    penalty: number,
    probability: number,
  ): void {
    this.change(stability, penalty, probability, true);
  }

  change(
    stability: number,
    penalty = 0,
    probability = 1,
    successOnly = false,
  ): void {
    this.survival?.change(stability, penalty, probability, successOnly);
    if (probability <= 0 || (stability === 0 && penalty === 0)) return;
    if (probability >= 1) {
      for (const outcome of this.outcomes) {
        if (successOnly && outcome.techniqueSucceeded === false) continue;
        outcome.stability += stability;
        outcome.penalty += penalty;
      }
      return;
    }
    const next = new Map<string, (typeof this.outcomes)[number]>();
    const add = (value: (typeof this.outcomes)[number]) => {
      const key = `${value.stability}:${value.penalty}:${value.techniqueSucceeded ?? ''}`;
      const old = next.get(key);
      if (old) old.probability += value.probability;
      else next.set(key, value);
    };
    for (const outcome of this.outcomes) {
      if (successOnly && outcome.techniqueSucceeded === false) {
        add({ ...outcome });
        continue;
      }
      if (probability < 1)
        add({
          ...outcome,
          probability: outcome.probability * (1 - probability),
        });
      add({
        ...outcome,
        stability: outcome.stability + stability,
        penalty: outcome.penalty + penalty,
        probability: outcome.probability * probability,
      });
    }
    this.outcomes = Array.from(next.values());
  }

  restoreMaximum(): void {
    this.survival?.restoreMaximum();
    this.outcomes = this.outcomes.map((outcome) => ({
      ...outcome,
      penalty: 0,
    }));
  }

  /** Signed live expectation before turn cleanup, including earlier triggers. */
  meanStability(): number {
    return this.outcomes.reduce(
      (sum, outcome) => sum + outcome.stability * outcome.probability,
      0,
    );
  }

  pay(
    cost: number,
    outcomes?: Array<{ cost: number; probability: number }>,
  ): void {
    if (!outcomes?.length) return this.change(-cost);
    this.survival?.pay(cost, outcomes);
    this.outcomes = this.outcomes.flatMap((old) =>
      outcomes.map((payment) => ({
        ...old,
        stability: old.stability - payment.cost,
        probability: old.probability * payment.probability,
      })),
    );
  }

  finish(
    initialMaximum: number,
    decay: boolean,
    cleanup: boolean,
    visitOutcome?: (outcome: StabilityOutcome) => void,
  ): {
    stability: number;
    penalty: number;
    floor: ActionSurvivabilityFloor;
    survivalConditioned?: SurvivalConditionedStability;
  } {
    let stability = 0;
    let penalty = 0;
    let minimumStability = Infinity;
    let minimumMaximum = Infinity;
    let survivalProbability = 0;
    let survivingStability = 0;
    let survivingPenalty = 0;
    for (const outcome of this.outcomes) {
      const p = cleanup
        ? Math.max(
            0,
            Math.min(
              initialMaximum,
              Math.ceil(outcome.penalty + Number(decay)),
            ),
          )
        : outcome.penalty;
      const s = cleanup
        ? Math.floor(
            Math.max(0, Math.min(initialMaximum - p, outcome.stability)),
          )
        : outcome.stability;
      stability += outcome.probability * s;
      penalty += outcome.probability * p;
      minimumStability = Math.min(minimumStability, s);
      const maximum = Math.max(0, initialMaximum - p);
      minimumMaximum = Math.min(minimumMaximum, maximum);
      if (s > 0) {
        survivalProbability += outcome.probability;
        survivingStability += outcome.probability * s;
        survivingPenalty += outcome.probability * p;
      }
      if (!this.survival)
        visitOutcome?.({
          stability: s,
          maxStability: maximum,
          probability: outcome.probability,
        });
    }
    const survival = this.survival?.finish(
      initialMaximum,
      decay,
      cleanup,
      visitOutcome,
    );
    return {
      stability,
      penalty,
      floor: survival?.floor ?? {
        stability: minimumStability,
        maxStability: minimumMaximum,
        survivalProbability: Math.max(0, Math.min(1, survivalProbability)),
      },
      survivalConditioned: survival
        ? survival.survivalConditioned
        : survivalProbability > 0
          ? {
              stability: survivingStability / survivalProbability,
              stabilityPenalty: survivingPenalty / survivalProbability,
            }
          : undefined,
    };
  }
}
