import { tonguePadAt, winPadAt, type WorldCollision } from '@tongue/shared';
import type { LocalPlayer } from '../player/LocalPlayer.js';

/** Seconds between two requests of the same kind. */
const REQUEST_COOLDOWN = 0.5;

export interface RunActions {
  claimStage(stageIndex: number): void;
  /** The player stepped onto a tongue's pad. */
  tonguePad(slot: number): void;
}

/**
 * Turns the player's position into REQUESTS.
 *
 * It notices a trigger and asks the server, which decides everything against
 * the transform it simulated itself. A tongue pad is asked about once per
 * ENTRY, so standing on one is one purchase attempt, not sixty a second. The
 * one exception to "only ask" is the lava: the fall-over starts the moment the
 * client can see the player is in it, and the server still decides.
 */
export class RunController {
  private stageCooldown = 0;
  private lastPad: number | null = null;

  constructor(
    private readonly collision: WorldCollision,
    private readonly actions: RunActions,
  ) {}

  /** The pad the player is standing on, for the HUD hint. */
  get standingPad(): number | null {
    return this.lastPad;
  }

  update(delta: number, player: LocalPlayer): void {
    this.stageCooldown = Math.max(0, this.stageCooldown - delta);
    if (player.isDying) {
      this.lastPad = null;
      return;
    }

    const { x, y, z } = player.position;
    if (this.collision.hasFallen(x, y, z)) {
      player.beginDeath();
      return;
    }

    const stage = winPadAt(x, y, z);
    if (stage && this.stageCooldown === 0) {
      this.stageCooldown = REQUEST_COOLDOWN;
      this.actions.claimStage(stage.index);
    }

    const pad = player.isGrounded ? tonguePadAt(x, y, z) : null;
    if (pad !== null && pad !== this.lastPad) this.actions.tonguePad(pad);
    this.lastPad = pad;
  }
}
