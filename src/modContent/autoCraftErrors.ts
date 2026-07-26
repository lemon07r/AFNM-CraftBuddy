/**
 * CraftBuddy - typed auto-craft execution failures.
 *
 * These live in their own module so the executor can throw them and the
 * controller can react to them without the two importing each other's values.
 * The distinction between them is the point: a stale state means "recalculate",
 * an unverifiable state means "pause", and an auto-use conflict means "the game
 * already owns this consumption" - collapsing them into a generic error is how
 * automation ends up firing an action against state it never confirmed.
 *
 * Each constructor restores its prototype explicitly: the build targets ES5, so
 * subclassing the built-in `Error` otherwise breaks `instanceof`, and these are
 * only useful if the controller can tell them apart.
 */

/** The live craft moved after the recommendation was produced. */
export class StaleCraftStateError extends Error {
  readonly changed: readonly string[];

  constructor(changed: readonly string[]) {
    super(
      `The live craft state changed (${
        changed.length > 0 ? changed.join(', ') : 'unknown fields'
      }) after the recommendation was produced.`,
    );
    Object.setPrototypeOf(this, StaleCraftStateError.prototype);
    this.name = 'StaleCraftStateError';
    this.changed = changed;
  }
}

/** The live craft state could not be read, so nothing may be dispatched. */
export class UnverifiableCraftStateError extends Error {
  readonly reason: string;

  constructor(reason: string) {
    super(reason);
    Object.setPrototypeOf(this, UnverifiableCraftStateError.prototype);
    this.name = 'UnverifiableCraftStateError';
    this.reason = reason;
  }
}

/**
 * CraftBuddy was asked to consume an item the native auto-use loadout owns.
 *
 * Should be unreachable - covered items are removed from the action space and
 * the policy is downgraded - so it exists to make a regression loud instead of
 * double-consuming the player's pills.
 */
export class NativeAutoUseConflictError extends Error {
  readonly itemName: string;

  constructor(itemName: string) {
    super(
      `Your crafting auto-use loadout already applies ${itemName}, so auto mode refused to use it a second time.`,
    );
    Object.setPrototypeOf(this, NativeAutoUseConflictError.prototype);
    this.name = 'NativeAutoUseConflictError';
    this.itemName = itemName;
  }
}

/**
 * A technique had to be executed through the game's own control - so the native
 * pre-technique auto-use hook fires - but no such control could be found.
 *
 * Dispatching straight to the store would skip the loadout and silently drop the
 * items the player configured, so automation stops instead.
 */
export class NativeAutoUseUnreachableError extends Error {
  readonly actionName: string;

  constructor(actionName: string) {
    super(
      `Could not find the in-game control for ${actionName}. Your crafting auto-use loadout is active, and auto mode will not dispatch a technique in a way that skips it.`,
    );
    Object.setPrototypeOf(this, NativeAutoUseUnreachableError.prototype);
    this.name = 'NativeAutoUseUnreachableError';
    this.actionName = actionName;
  }
}
