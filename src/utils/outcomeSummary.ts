/**
 * CraftBuddy - Outcome Summary (AFNM 0.7.6)
 *
 * Pure presentation derivation for the conjunctive outcome model. The panel is a
 * dumb renderer of the rows produced here, and every number in those rows is
 * copied out of `SearchResult.outcomeProjection` - which `src/optimizer/search`
 * builds from `src/optimizer/outcome` and the runtime band helper.
 *
 * The one rule this module exists to enforce: **no band logic in the UI**. There
 * is no `1.3` ratio, no tier conjunction and no auto-finish predicate anywhere
 * below this line - only labels, tones and ordering. If a threshold is needed
 * that the projection does not carry, the projection must grow; it must never be
 * recomputed here.
 *
 * Lives in `src/utils` (not `src/ui`) so it is testable under the repo's `node`
 * Jest environment, mirroring `./overlayLayout.ts`.
 */

import {
  getHarmonyDefinition,
  tierRank,
  type HarmonyType,
  type OutcomeBarStatus,
  type OutcomeProjection,
  type OutcomeTier,
  type SetupForHint,
} from '../optimizer';
import { formatLargeNumber, LARGE_NUMBER_THRESHOLD } from './largeNumbers';

/** Semantic tone for a summary row; the panel maps these onto theme colors. */
export type OutcomeSummaryTone =
  | 'neutral'
  | 'positive'
  | 'warning'
  | 'danger'
  | 'accent';

/** Player-facing names for the runtime's outcome tiers. */
export const OUTCOME_TIER_LABELS: Readonly<Record<OutcomeTier, string>> = {
  failed: 'Failed',
  basic: 'Basic',
  perfect: 'Perfect',
  sublime: 'Sublime',
};

export type OutcomeBarKey = 'completion' | 'perfection';

/** One progress bar rendered against the band ladder of the target tier. */
export interface OutcomeBarRow {
  readonly bar: OutcomeBarKey;
  readonly label: string;
  /** Current value on the bar, formatted for display. */
  readonly valueLabel: string;
  readonly bands: number;
  readonly requiredBands: number;
  /** `2 / 2 bands`, or `3 bands` when the bar carries no requirement. */
  readonly bandsLabel: string;
  /** True once this bar already holds the bands the target tier needs. */
  readonly satisfied: boolean;
  /** `+128 to band 3`, or `null` when there is no next band to describe. */
  readonly nextBandLabel: string | null;
  readonly pointsToNextBand: number;
  /** `41% bonus band` when the runtime's single roll could still add one. */
  readonly bonusChanceLabel: string | null;
  /** True for the bar that is holding the projected tier back. */
  readonly isBinding: boolean;
  readonly tone: OutcomeSummaryTone;
}

/** The selected harmony and what it does to this craft. */
export interface HarmonySummaryRow {
  readonly harmonyType: HarmonyType;
  readonly label: string;
  /** `Complexity x1.3`, plus any notable per-harmony behaviour. */
  readonly detail: string;
  readonly notes: readonly string[];
  /**
   * True when the harmony's complexity multiplier actually scales this craft's
   * targets. The runtime only applies it on sublime crafts, so quoting the
   * multiplier anywhere else would be misinformation.
   */
  readonly complexityApplies: boolean;
}

/** Terminal / auto-finish indication. There is no manual finish action. */
export interface AutoFinishSummaryRow {
  readonly active: boolean;
  readonly label: string;
  readonly detail: string;
  readonly tone: OutcomeSummaryTone;
}

/** Why an action with weak gains is still the right move. */
export interface SetupSummaryRow {
  readonly techniqueKey: string;
  readonly techniqueLabel: string;
  readonly label: string;
  readonly detail: string;
  readonly tone: OutcomeSummaryTone;
}

/**
 * Native crafting auto-use coexistence notice.
 *
 * Read structurally from the auto-mode state rather than from a typed field so
 * this module does not depend on the runtime workstream's `AutoCraftUiState`
 * shape. The row simply stays absent until those fields exist at runtime.
 */
export interface AutoUseNoticeRow {
  readonly label: string;
  readonly detail: string;
  readonly tone: OutcomeSummaryTone;
}

export interface OutcomeSummary {
  readonly tier: OutcomeTier;
  readonly tierLabel: string;
  readonly targetTier: OutcomeTier;
  readonly targetTierLabel: string;
  /** `On track for Perfect` / `Sublime secured`. */
  readonly tierHeadline: string;
  /** `Target Sublime`, or `null` once the target tier is banked. */
  readonly tierDetail: string | null;
  readonly tierTone: OutcomeSummaryTone;
  /** True when the guaranteed tier already equals the target tier. */
  readonly onTarget: boolean;
  /** `Sublime if the bonus roll lands`, when a roll could still promote. */
  readonly optimisticTierLabel: string | null;
  readonly bars: readonly OutcomeBarRow[];
  readonly bindingBar: OutcomeBarKey | 'none';
  readonly bindingLabel: string;
  readonly autoFinish: AutoFinishSummaryRow;
  readonly harmony: HarmonySummaryRow | null;
}

export interface OutcomeSummaryInput {
  /**
   * Absent on legacy replay snapshots and hand-built fixtures. Callers must
   * degrade to their pre-0.7.5 layout when `buildOutcomeSummary` returns `null`.
   */
  readonly projection?: OutcomeProjection;
  /** Harmony the player selected for this craft, when known. */
  readonly harmonyType?: HarmonyType;
}

/** Format a bar value the same way the rest of the panel formats gains. */
function formatValue(value: number): string {
  const safe = Number.isFinite(value) ? Math.max(0, value) : 0;
  if (safe >= LARGE_NUMBER_THRESHOLD) {
    return formatLargeNumber(safe, 1);
  }
  return Math.round(safe).toLocaleString();
}

function formatPercent(value: number): string {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
  return `${Math.round(clamped * 100)}%`;
}

/**
 * Turn a technique key into a readable name (`false_fusion` -> `False Fusion`).
 *
 * Keys arrive normalized from `src/optimizer`, so this is presentation-only and
 * intentionally does not consult any technique registry.
 */
export function formatTechniqueKey(techniqueKey: string): string {
  const words = techniqueKey
    .replace(/[_-]+/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .trim()
    .split(/\s+/)
    .filter((word) => word.length > 0);
  if (words.length === 0) {
    return techniqueKey;
  }
  return words
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

function buildBarRow(
  bar: OutcomeBarKey,
  status: OutcomeBarStatus,
  bindingBar: OutcomeBarKey | 'none',
): OutcomeBarRow {
  const satisfied = status.bands >= status.requiredBands;
  const isBinding = bindingBar === bar;
  const hasNextBand = status.pointsToNextBand > 0;

  return {
    bar,
    label: bar === 'completion' ? 'Completion' : 'Perfection',
    valueLabel: formatValue(status.value),
    bands: status.bands,
    requiredBands: status.requiredBands,
    bandsLabel:
      status.requiredBands > 0
        ? `${status.bands} / ${status.requiredBands} bands`
        : `${status.bands} ${status.bands === 1 ? 'band' : 'bands'}`,
    satisfied,
    nextBandLabel: hasNextBand
      ? `+${formatValue(status.pointsToNextBand)} to band ${status.bands + 1}`
      : null,
    pointsToNextBand: Math.max(0, status.pointsToNextBand),
    bonusChanceLabel:
      status.bonusChance > 0 && hasNextBand
        ? `${formatPercent(status.bonusChance)} bonus band`
        : null,
    isBinding,
    tone: satisfied ? 'positive' : isBinding ? 'warning' : 'neutral',
  };
}

function buildTierTone(
  tier: OutcomeTier,
  targetTier: OutcomeTier,
): OutcomeSummaryTone {
  if (tier === 'failed') {
    return 'danger';
  }
  return tierRank(tier) >= tierRank(targetTier) ? 'positive' : 'warning';
}

function buildHarmonyRow(
  harmonyType: HarmonyType | undefined,
  complexityApplies: boolean,
): HarmonySummaryRow | null {
  if (!harmonyType) {
    return null;
  }
  const definition = getHarmonyDefinition(harmonyType);
  if (!definition) {
    return null;
  }

  const notes: string[] = [];
  if (definition.pinsHarmony) {
    notes.push('Holds harmony at its peak');
  }
  if (definition.modifiesActionCosts) {
    notes.push('Scales Qi and stability costs');
  }

  const parts = complexityApplies
    ? [`Complexity x${definition.complexityMultiplier}`]
    : ['No complexity scaling outside sublime crafts'];
  if (notes.length > 0) {
    parts.push(notes[0]);
  }

  return {
    harmonyType,
    label: definition.name,
    detail: parts.join(' | '),
    notes,
    complexityApplies,
  };
}

function buildAutoFinishRow(
  projection: OutcomeProjection,
): AutoFinishSummaryRow {
  if (!projection.willAutoFinish) {
    return {
      active: false,
      label: 'Craft continues',
      detail:
        'The craft has not reached the point where the game resolves it, so there is still room to act.',
      tone: 'neutral',
    };
  }

  const tierLabel = OUTCOME_TIER_LABELS[projection.tier];
  return {
    active: true,
    label: `Auto-finishing as ${tierLabel}`,
    detail:
      'This craft resolves itself on the next input - there is no manual finish action, so nothing further can be banked.',
    tone: buildTierTone(projection.tier, projection.targetTier),
  };
}

function buildBindingLabel(
  projection: OutcomeProjection,
  targetTierLabel: string,
): string {
  if (projection.bindingBar === 'none') {
    return `Both bars meet ${targetTierLabel}`;
  }
  const barLabel =
    projection.bindingBar === 'completion' ? 'Completion' : 'Perfection';
  return `${barLabel} is holding ${targetTierLabel} back`;
}

/**
 * Derive every outcome row the panel renders.
 *
 * Returns `null` when the search result carries no projection (older replay
 * snapshots), which is the caller's signal to render the legacy layout instead
 * of inventing thresholds.
 */
export function buildOutcomeSummary(
  input: OutcomeSummaryInput,
): OutcomeSummary | null {
  const projection = input.projection;
  if (!projection) {
    return null;
  }

  const tierLabel = OUTCOME_TIER_LABELS[projection.tier];
  const targetTierLabel = OUTCOME_TIER_LABELS[projection.targetTier];
  const onTarget = tierRank(projection.tier) >= tierRank(projection.targetTier);
  const canPromoteOnBonus =
    tierRank(projection.optimisticTier) > tierRank(projection.tier);

  return {
    tier: projection.tier,
    tierLabel,
    targetTier: projection.targetTier,
    targetTierLabel,
    tierHeadline: onTarget
      ? `${tierLabel} secured`
      : `On track for ${tierLabel}`,
    tierDetail: onTarget ? null : `Target ${targetTierLabel}`,
    tierTone: buildTierTone(projection.tier, projection.targetTier),
    onTarget,
    optimisticTierLabel: canPromoteOnBonus
      ? `${OUTCOME_TIER_LABELS[projection.optimisticTier]} if the bonus roll lands`
      : null,
    bars: [
      buildBarRow('completion', projection.completion, projection.bindingBar),
      buildBarRow('perfection', projection.perfection, projection.bindingBar),
    ],
    bindingBar: projection.bindingBar,
    bindingLabel: buildBindingLabel(projection, targetTierLabel),
    autoFinish: buildAutoFinishRow(projection),
    // Only a sublime craft has the runtime apply the complexity multiplier, and
    // `targetTier === 'sublime'` is exactly the evaluator's own record of that.
    harmony: buildHarmonyRow(
      input.harmonyType,
      projection.targetTier === 'sublime',
    ),
  };
}

/**
 * Describe a gated-technique setup hint so a low-gain turn reads as deliberate.
 */
export function buildSetupSummary(
  hint: SetupForHint | undefined,
): SetupSummaryRow | null {
  if (!hint || typeof hint.techniqueKey !== 'string' || !hint.techniqueKey) {
    return null;
  }
  // Prefer the label the game itself shows. 0.7.6 renamed False Fusion to
  // "Strive for Completion" while leaving the key as `false_fusion`, so the
  // key-derived title is only a fallback for hints recorded without a label.
  const suppliedName =
    typeof hint.techniqueName === 'string' ? hint.techniqueName.trim() : '';
  const techniqueLabel =
    suppliedName.length > 0
      ? suppliedName
      : formatTechniqueKey(hint.techniqueKey);
  const detail = hint.reason?.trim();
  return {
    techniqueKey: hint.techniqueKey,
    techniqueLabel,
    label: `Setup for ${techniqueLabel}`,
    detail:
      detail && detail.length > 0
        ? detail
        : `Unlocks ${techniqueLabel} rather than paying off this turn.`,
    tone: 'accent',
  };
}

function readStringField(source: object, key: string): string | undefined {
  const value = (source as Record<string, unknown>)[key];
  return typeof value === 'string' && value.trim().length > 0
    ? value.trim()
    : undefined;
}

/**
 * Derive the native auto-use coexistence notice from the auto-mode state.
 *
 * Accepts `unknown` on purpose: the fields are supplied by the runtime
 * workstream's controller, so reading them structurally keeps this module (and
 * the panel) compiling against either version of `AutoCraftUiState`.
 */
export function buildAutoUseNotice(autoMode: unknown): AutoUseNoticeRow | null {
  if (typeof autoMode !== 'object' || autoMode === null) {
    return null;
  }
  const notice = readStringField(autoMode, 'policyNotice');
  const nativeActive =
    (autoMode as Record<string, unknown>).nativeAutoUseActive === true;

  if (!notice && !nativeActive) {
    return null;
  }

  return {
    label: nativeActive
      ? 'Native auto-use loadout active'
      : 'Auto policy adjusted',
    detail:
      notice ??
      'The game consumes your crafting auto-use loadout itself, so AutoBuddy leaves those items alone.',
    tone: 'accent',
  };
}
