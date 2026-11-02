/** Turn-local quadrature: cleanup rounds each realized outcome, not its mean. */
export class StabilityProjection {
  private outcomes: Array<{
    stability: number;
    penalty: number;
    probability: number;
  }>;

  constructor(stability: number, penalty: number) {
    this.outcomes = [{ stability, penalty, probability: 1 }];
  }

  change(stability: number, penalty = 0, probability = 1): void {
    if (probability <= 0 || (stability === 0 && penalty === 0)) return;
    if (probability >= 1) {
      for (const outcome of this.outcomes) {
        outcome.stability += stability;
        outcome.penalty += penalty;
      }
      return;
    }
    const next = new Map<string, (typeof this.outcomes)[number]>();
    const add = (value: (typeof this.outcomes)[number]) => {
      const key = `${value.stability}:${value.penalty}`;
      const old = next.get(key);
      if (old) old.probability += value.probability;
      else next.set(key, value);
    };
    for (const outcome of this.outcomes) {
      if (probability < 1)
        add({
          ...outcome,
          probability: outcome.probability * (1 - probability),
        });
      add({
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
