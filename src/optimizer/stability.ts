/** Turn-local quadrature: cleanup rounds each realized outcome, not its mean. */
export class StabilityProjection {
  private outcomes: Array<{
    stability: number;
    penalty: number;
    probability: number;
    techniqueSucceeded?: boolean;
  }>;

  constructor(stability: number, penalty: number) {
    this.outcomes = [{ stability, penalty, probability: 1 }];
  }

  /** One action success roll shared by every technique resource effect. */
  beginTechnique(probability: number): void {
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
  ): { stability: number; penalty: number } {
    let stability = 0;
    let penalty = 0;
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
    }
    return { stability, penalty };
  }
}
