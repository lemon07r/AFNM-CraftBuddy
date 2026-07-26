/**
 * CraftBuddy - Native crafting auto-use contract (AFNM 0.7.5)
 *
 * 0.7.5 added a native crafting auto-use loadout: the player configures slots on
 * `player.player.currentCraftingAutoUseLoadout`, and the game applies the
 * matching pills/reagents *immediately before* every technique dispatch. It is a
 * pre-technique hook, not a background timer.
 *
 * This module owns the contract shared by the controller, the executor and the
 * craft-state extraction seam. The reader (`readNativeAutoUseStatus`) and the
 * selection projection (`projectNativeAutoUse`) are added by the auto-use
 * coexistence work; until then CraftBuddy behaves as it always has and treats
 * the native loadout as inactive, which is the pre-0.7.5 status quo rather than
 * a claim about the live game.
 */

/**
 * What the native crafting auto-use loadout will do on the next technique.
 *
 * `coveredItemNames` is the set CraftBuddy must not also consume: proposing an
 * item the loadout already handles is the duplicate-consumption bug.
 */
export interface NativeAutoUseStatus {
  /** Whether a loadout with at least one usable slot is configured. */
  readonly active: boolean;
  /** Number of configured slots, including ones that cannot fire right now. */
  readonly slotCount: number;
  /** Normalized item names the native loadout may consume. */
  readonly coveredItemNames: ReadonlySet<string>;
  /** Runtime `pillsPerRound` ceiling on how many items one turn can apply. */
  readonly pillsPerRound: number;
  /** Runtime `maxtoxicity - toxicity` headroom the selection stops at. */
  readonly availableToxicity: number;
  /** Training mode applies items without removing them from the inventory. */
  readonly trainingMode: boolean;
}

/**
 * The "no native loadout" status.
 *
 * Used as the default on runtime snapshots so the absence of a reading is
 * explicit and every consumer sees the same shape.
 */
export const INACTIVE_NATIVE_AUTO_USE: NativeAutoUseStatus = {
  active: false,
  slotCount: 0,
  coveredItemNames: new Set<string>(),
  pillsPerRound: 0,
  availableToxicity: 0,
  trainingMode: false,
};
