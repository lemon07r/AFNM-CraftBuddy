import { evaluateScaling, type ScalingVariables } from '../optimizer';

/**
 * Quality-cap boost resolution (0.7.9+).
 *
 * Some crafting buffs raise the achievable quality cap instead of moving a bar:
 * the reworked Purifying Flame grants a per-realm `Purity` buff carrying
 * `bonusMaximumQuality`, and each point lifts the cap by one more 1.3x-scaled
 * threshold step. The game computes the total once per craft with
 * `getMaxStepsBoost(entity.buffs)` and threads it into
 * `getMaxCompletion`/`getMaxPerfection` as the optional `maxStepsBoost`
 * argument.
 *
 * The runtime fold, verified against the installed bundle:
 *
 * ```js
 * jvi = e => { let t = 0;
 *   for (let n of e.buffs ?? [])
 *     if (n.bonusMaximumQuality) {
 *       let r = Hl({ ...n.bonusMaximumQuality, eqn: void 0 }, { ...e.stats, stacks: 1 }, 1);
 *       t += Math.floor(r);
 *     }
 *   return t; }
 * ```
 *
 * Three details of that fold are easy to get wrong and are mirrored exactly
 * here: `eqn` is **stripped** before evaluation, `stacks` is **pinned to 1**
 * regardless of how many stacks the buff actually holds (so a
 * `scaling: 'stacks'` bonus is *not* multiplied by the held count), and each
 * buff's contribution is floored **individually** before being summed.
 *
 * This lives at the modContent boundary on purpose. It reads live game payloads,
 * and the boost reaches the optimizer only as an already-raised
 * `maxCompletionCap` / `maxPerfectionCap`, so `src/optimizer/outcome.ts` stays
 * the single authority for bands, tiers and auto-finish.
 */

/** Coerce a live stat bag into the numeric variables `evaluateScaling` wants. */
function toScalingVariables(stats: unknown): ScalingVariables {
  const variables: Record<string, number> = {};

  if (stats && typeof stats === 'object') {
    for (const [key, raw] of Object.entries(stats as Record<string, unknown>)) {
      const value = Number(raw);
      if (Number.isFinite(value)) {
        variables[key] = value;
      }
    }
  }

  // The runtime spreads the entity stats and then pins `stacks: 1`, so the pin
  // must be applied last: a stat bag carrying its own `stacks` cannot win.
  variables.stacks = 1;

  return variables as ScalingVariables;
}

/**
 * Sum the cap-raising threshold steps granted by the buffs a crafting entity
 * currently holds.
 *
 * @param buffs - the entity's live buff list. Entries are normally bare buff
 *   definitions, matching the runtime's `e.buffs`; a `{ buff, stacks }` wrapper
 *   is also unwrapped defensively, since our own extraction layer normalizes
 *   some payloads into that shape.
 * @param stats - the entity's stat bag, used for `bonusMaximumQuality` values
 *   that scale off a stat. Purity does not, but the runtime supports it.
 * @returns the total step boost. `0` when no held buff raises the cap, which
 *   reproduces the pre-0.7.9 call exactly, so it is always safe to pass on.
 *   A negative total is returned as-is, matching the runtime, which clamps the
 *   resulting step count itself.
 */
export function computeMaxStepsBoost(buffs: unknown, stats?: unknown): number {
  if (!Array.isArray(buffs)) {
    return 0;
  }

  const variables = toScalingVariables(stats);

  let boost = 0;
  for (const entry of buffs) {
    const buff = (entry as any)?.buff ?? entry;
    const bonus = (buff as any)?.bonusMaximumQuality;
    if (!bonus || typeof bonus !== 'object') {
      continue;
    }

    // `evaluateScaling` assumes a numeric `value` and throws on a malformed
    // payload, so a buff carrying a valueless bonus must be skipped rather than
    // taking down the whole cap read.
    if (!Number.isFinite(Number((bonus as any).value))) {
      continue;
    }

    // The runtime strips `eqn` before evaluating, so a bonus carrying one
    // contributes its plain value rather than an equation result.
    const steps = evaluateScaling({ ...bonus, eqn: undefined }, variables, 0);
    if (!Number.isFinite(steps)) {
      continue;
    }

    boost += Math.floor(steps);
  }

  return boost;
}
