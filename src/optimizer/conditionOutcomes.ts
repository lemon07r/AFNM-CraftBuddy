import type { CraftingCondition } from './gameTypes';

/** Exact distribution of the installed 0.7.18 getNextCondition queue append. */
export function generatedConditions(
  current: CraftingCondition,
  queue: readonly CraftingCondition[],
  harmony: number,
  discordance = 0,
): Array<{ condition: CraftingCondition; probability: number }> {
  const h = Math.max(-100, Math.min(100, harmony));
  const d = Math.max(0, Math.min(1, discordance));
  if (d > 0) {
    const extreme = Math.min(1, 0.18 / d);
    const positive = 0.5 + (h / 100) * 0.25;
    return [
      { condition: 'neutral' as const, probability: 1 - d },
      { condition: 'veryPositive' as const, probability: d * extreme * 0.5 },
      { condition: 'veryNegative' as const, probability: d * extreme * 0.5 },
      {
        condition: 'positive' as const,
        probability: d * (1 - extreme) * positive,
      },
      {
        condition: 'negative' as const,
        probability: d * (1 - extreme) * (1 - positive),
      },
    ].filter((o) => o.probability > 0);
  }
  const last = queue[queue.length - 1];
  if (last === 'veryPositive' || last === 'veryNegative')
    return [{ condition: 'neutral', probability: 1 }];
  if (last === 'positive' || last === 'negative') {
    const p = 0.3 * Math.max(0, (last === 'positive' ? h : -h) / 100);
    return [
      {
        condition:
          last === 'positive'
            ? ('veryPositive' as const)
            : ('veryNegative' as const),
        probability: p,
      },
      { condition: 'neutral' as const, probability: 1 - p },
    ].filter((o) => o.probability > 0);
  }
  let neutrals = 0;
  for (let i = queue.length - 1; i >= 0 && queue[i] === 'neutral'; i--)
    neutrals++;
  const change =
    current === 'neutral' && queue.every((c) => c === 'neutral')
      ? 1
      : Math.min(1, neutrals * (0.15 + (0.15 * Math.abs(h)) / 100));
  const positive = (h + 100) / 200;
  return [
    { condition: 'neutral' as const, probability: 1 - change },
    { condition: 'positive' as const, probability: change * positive },
    { condition: 'negative' as const, probability: change * (1 - positive) },
  ].filter((o) => o.probability > 0);
}
