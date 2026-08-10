/**
 * CraftBuddy - live craft-state signatures for the auto-craft revision guard.
 *
 * The auto-craft controller compares a *processed* fingerprint (built from the
 * state CraftBuddy last extracted) to detect that a craft advanced. That is not
 * enough to make automation safe: a recommendation is dispatched
 * `READY_DELAY_MS` after it was scheduled, and the live craft can move in
 * between - the player acts, the native auto-use loadout consumes a pill, a buff
 * ticks. Re-deriving the processed fingerprint at dispatch time would return the
 * same string, because it is built from CraftBuddy's own cached state.
 *
 * So this module reads the *store* instead, at dispatch time, and produces a
 * signature that changes whenever anything the recommendation depended on
 * changed. It is deliberately pure and store-shaped: every field is read
 * defensively, and a state that cannot be read is reported as unverifiable
 * rather than guessed at, so automation can pause instead of firing blind.
 */

/** A field-wise signature of the live craft state. */
export type LiveCraftStateReading =
  | {
      readonly ok: true;
      readonly signature: string;
      /** `progressState.step`, exposed so the settle phase can require a turn. */
      readonly step: number;
    }
  | { readonly ok: false; readonly reason: string };

export interface CraftStateBuffLike {
  readonly name?: string;
  readonly stacks?: number;
  /** 0.7.7+ trigger-written per-instance state (blaze, stored, ...). */
  readonly internalState?: Record<string, number>;
}

export interface CraftStateInventoryEntry {
  readonly name?: string;
  readonly stacks?: number;
}

export interface CraftStateTechniqueLike {
  readonly name?: string;
  readonly currentCooldown?: number;
}

export interface CraftStateSignatureInput {
  readonly step: number;
  readonly qi: number;
  readonly completion: number;
  readonly perfection: number;
  readonly stability: number;
  readonly maxStability: number;
  readonly toxicity: number;
  readonly condition: string | undefined;
  readonly forecastConditions: readonly (string | undefined)[];
  readonly buffs: readonly CraftStateBuffLike[] | undefined;
  readonly techniques: readonly CraftStateTechniqueLike[] | undefined;
  readonly quickAccess: readonly (string | undefined)[] | undefined;
  readonly inventory: readonly CraftStateInventoryEntry[] | undefined;
  readonly harmony: number;
  readonly harmonyData: unknown;
  readonly consumedPills: number;
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function readNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function readArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function normalizeKey(value: unknown): string {
  return String(value ?? '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_');
}

/**
 * Canonical digest of an arbitrary nested value.
 *
 * Object keys are sorted so two structurally equal harmony payloads always
 * digest identically, whatever order the runtime happened to build them in.
 */
export function serializeCanonicalValue(value: unknown): string {
  if (value === null || value === undefined) {
    return 'none';
  }
  if (Array.isArray(value)) {
    return `[${value.map(serializeCanonicalValue).join(',')}]`;
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const entries = Object.keys(record)
      .sort()
      .map((key) => `${key}=${serializeCanonicalValue(record[key])}`);
    return `{${entries.join(',')}}`;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? String(value) : 'nan';
  }
  return String(value);
}

/**
 * Digest of the harmony subsystem payload (`progressState.harmonyTypeData`).
 *
 * Harmony mini-game state is what several harmonies actually score on, so
 * a recommendation computed against one heat/resonance/echo state must never be
 * dispatched against another.
 */
export function serializeHarmonyData(harmonyData: unknown): string {
  return serializeCanonicalValue(harmonyData ?? null);
}

/**
 * Digest of the available-technique set.
 *
 * Cooldowns already have their own signature, but the *set* of techniques can
 * change mid-craft (a gated technique unlocking, a companion technique
 * appearing), which changes the legal action space and therefore the
 * recommendation.
 */
export function serializeTechniqueRoster(
  techniques: readonly CraftStateTechniqueLike[] | undefined,
): string {
  if (!techniques?.length) {
    return 'none';
  }
  return (
    techniques
      .map((technique) => normalizeKey(technique?.name))
      .filter(Boolean)
      .sort()
      .join('|') || 'none'
  );
}

function serializeCooldowns(
  techniques: readonly CraftStateTechniqueLike[] | undefined,
): string {
  if (!techniques?.length) {
    return 'none';
  }
  return (
    techniques
      .map((technique) => {
        const key = normalizeKey(technique?.name);
        const cooldown = readNumber(technique?.currentCooldown, 0);
        return key && cooldown > 0 ? `${key}:${cooldown}` : null;
      })
      .filter((entry): entry is string => Boolean(entry))
      .sort()
      .join('|') || 'none'
  );
}

function serializeBuffs(
  buffs: readonly CraftStateBuffLike[] | undefined,
): string {
  if (!buffs?.length) {
    return 'none';
  }
  return (
    buffs
      .map((buff) => {
        const base = `${normalizeKey(buff?.name)}:${readNumber(buff?.stacks, 0)}`;
        // Trigger-written buff state (0.7.7+) changes stat scaling without
        // touching stacks, so a recommendation computed against one blaze /
        // stored value must never be dispatched against another.
        const internalState = buff?.internalState;
        if (!internalState) {
          return base;
        }
        const statePart = Object.keys(internalState)
          .sort()
          .map(
            (stateKey) =>
              `${stateKey}=${readNumber(internalState[stateKey], Number.NaN)}`,
          )
          .filter((entry) => !entry.endsWith('=NaN'))
          .join(',');
        return statePart ? `${base}{${statePart}}` : base;
      })
      .sort()
      .join('|') || 'none'
  );
}

function serializeQuickAccessInventory(
  quickAccess: readonly (string | undefined)[] | undefined,
  inventory: readonly CraftStateInventoryEntry[] | undefined,
): string {
  if (!quickAccess?.length) {
    return 'none';
  }
  return (
    quickAccess
      .filter((name): name is string => Boolean(name))
      .map((name) => {
        const stacks = (inventory ?? []).reduce(
          (sum, entry) =>
            entry?.name === name ? sum + readNumber(entry.stacks, 0) : sum,
          0,
        );
        return `${normalizeKey(name)}:${stacks}`;
      })
      .join('|') || 'none'
  );
}

/**
 * Build the field-wise signature.
 *
 * Every field the optimizer reads is represented, so any change the
 * recommendation could depend on produces a different string.
 */
export function buildCraftStateSignature(
  input: CraftStateSignatureInput,
): string {
  return [
    `step:${readNumber(input.step)}`,
    `qi:${readNumber(input.qi)}`,
    `comp:${readNumber(input.completion)}`,
    `perf:${readNumber(input.perfection)}`,
    `stab:${readNumber(input.stability)}`,
    `max:${readNumber(input.maxStability)}`,
    `tox:${readNumber(input.toxicity)}`,
    `pills:${readNumber(input.consumedPills)}`,
    `cond:${normalizeKey(input.condition) || 'none'}`,
    `queue:${
      input.forecastConditions
        .map((entry) => normalizeKey(entry))
        .filter(Boolean)
        .join(',') || 'none'
    }`,
    `harmony:${readNumber(input.harmony)}`,
    `harmonyData:${serializeHarmonyData(input.harmonyData)}`,
    `cooldowns:${serializeCooldowns(input.techniques)}`,
    `techniques:${serializeTechniqueRoster(input.techniques)}`,
    `buffs:${serializeBuffs(input.buffs)}`,
    `items:${serializeQuickAccessInventory(input.quickAccess, input.inventory)}`,
  ].join(';');
}

/** The field names that differ between two signatures. */
export function diffCraftStateSignatures(
  previous: string,
  next: string,
): readonly string[] {
  const parse = (signature: string): Map<string, string> => {
    const fields = new Map<string, string>();
    for (const segment of signature.split(';')) {
      const separator = segment.indexOf(':');
      if (separator <= 0) {
        continue;
      }
      fields.set(segment.slice(0, separator), segment.slice(separator + 1));
    }
    return fields;
  };

  const previousFields = parse(previous);
  const nextFields = parse(next);
  const keys: string[] = [];
  previousFields.forEach((_value, key) => keys.push(key));
  nextFields.forEach((_value, key) => {
    if (!previousFields.has(key)) {
      keys.push(key);
    }
  });

  return keys
    .filter((key) => previousFields.get(key) !== nextFields.get(key))
    .sort();
}

interface StoreLike {
  getState?: () => unknown;
}

/**
 * Read the live craft state straight from the store and signature it.
 *
 * Reports `ok: false` - not a fallback value - whenever the state cannot be
 * established, because "I could not check" and "nothing changed" must never
 * collapse into the same answer for automation.
 */
export function readLiveCraftStateSignature(
  store: unknown,
): LiveCraftStateReading {
  const getState = (store as StoreLike | null | undefined)?.getState;
  if (typeof getState !== 'function') {
    return { ok: false, reason: 'The game store is not available to read.' };
  }

  let state: Record<string, unknown> | undefined;
  try {
    state = readRecord(getState.call(store));
  } catch (error) {
    return {
      ok: false,
      reason: `Reading the game store failed: ${
        error instanceof Error
          ? error.message
          : String(error ?? 'unknown error')
      }`,
    };
  }
  if (!state) {
    return { ok: false, reason: 'The game store returned no state.' };
  }

  const crafting = readRecord(state.crafting);
  if (!crafting) {
    return {
      ok: false,
      reason: 'Live crafting state is missing from the store.',
    };
  }

  const player = readRecord(crafting.player);
  if (!player) {
    return { ok: false, reason: 'Live crafting player state is missing.' };
  }

  const progressState = readRecord(crafting.progressState);
  if (!progressState) {
    return { ok: false, reason: 'Live crafting progress state is missing.' };
  }

  const stats = readRecord(player.stats);
  const recipeStats = readRecord(crafting.recipeStats);
  const stabilityPenalty = readNumber(progressState.stabilityPenalty, 0);
  const targetStability = readNumber(recipeStats?.stability, 0);

  const signature = buildCraftStateSignature({
    step: readNumber(progressState.step, 0),
    qi: readNumber(stats?.pool, 0),
    completion: readNumber(progressState.completion, 0),
    perfection: readNumber(progressState.perfection, 0),
    stability: readNumber(progressState.stability, 0),
    maxStability:
      targetStability > 0
        ? targetStability - stabilityPenalty
        : -stabilityPenalty,
    toxicity: readNumber(stats?.toxicity, 0),
    condition:
      typeof progressState.condition === 'string'
        ? progressState.condition
        : undefined,
    forecastConditions: readArray(progressState.nextConditions).map((entry) =>
      typeof entry === 'string' ? entry : undefined,
    ),
    buffs: readArray(player.buffs).map((entry) => {
      const buff = readRecord(entry);
      const rawInternalState = readRecord(buff?.internalState);
      const internalState: Record<string, number> = {};
      if (rawInternalState) {
        for (const [stateKey, stateValue] of Object.entries(
          rawInternalState,
        )) {
          const numeric = readNumber(stateValue, Number.NaN);
          if (Number.isFinite(numeric)) {
            internalState[stateKey] = numeric;
          }
        }
      }
      return {
        name: typeof buff?.name === 'string' ? buff.name : undefined,
        stacks: readNumber(buff?.stacks, 0),
        internalState:
          Object.keys(internalState).length > 0 ? internalState : undefined,
      };
    }),
    techniques: readArray(player.techniques).map((entry) => {
      const technique = readRecord(entry);
      return {
        name: typeof technique?.name === 'string' ? technique.name : undefined,
        currentCooldown: readNumber(technique?.currentCooldown, 0),
      };
    }),
    quickAccess: readArray(player.craftingQuickAccess).map((entry) =>
      typeof entry === 'string' ? entry : undefined,
    ),
    inventory: readArray(readRecord(state.inventory)?.items).map((entry) => {
      const item = readRecord(entry);
      return {
        name: typeof item?.name === 'string' ? item.name : undefined,
        stacks: readNumber(item?.stacks, 0),
      };
    }),
    harmony: readNumber(progressState.harmony, 0),
    harmonyData: progressState.harmonyTypeData ?? null,
    consumedPills: readNumber(progressState.consumedPills, 0),
  });

  return { ok: true, signature, step: readNumber(progressState.step, 0) };
}
