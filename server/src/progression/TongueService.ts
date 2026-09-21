import {
  MAX_SIM_DELTA,
  MOVEMENT,
  TONGUE_STEP,
  TREADMILLS,
  describeTongueRate,
  resolveLevel,
  tongueLengthFor,
  tonguePerStepFor,
  treadmillMultiplier,
  type TongueRateInputs,
} from '@tongue/shared';
import type { PlayerState } from '../rooms/state/PlayerState.js';
import { logger } from '../util/logger.js';

const SCOPE = 'tongue';

interface Tracker {
  /** Distance banked toward the next STEP. */
  banked: number;
  /** True until the first step after a placement, so spawning pays nothing. */
  fresh: boolean;
  loggedRate: number;
}

export interface TongueGain {
  readonly gained: number;
  readonly levelsGained: number;
  /** The treadmill the player stood on without the rebirths it needs, or 0. */
  readonly lockedTreadmill: number;
}

/**
 * Server authority over XP farming, levels and the Tongue Length stat.
 *
 * THE ONE PLACE XP IS EVER GRANTED, and it grants it for exactly one
 * thing: STEPS. Every `strideDistance` of ground actually covered pays the
 * rate; a treadmill supplies the distance instead and multiplies the rate by
 * its own figure - IF the player has the rebirths it requires, checked here
 * against the server's own count. A locked treadmill pays nothing at all.
 *
 * What is measured is the server's OWN simulated step. Standing still, a
 * teleport and a tongue ride all pay nothing: the feet must be on the ground.
 */
export class TongueService {
  private readonly trackers = new Map<string, Tracker>();

  initialise(player: PlayerState): void {
    this.syncDerived(player);
    this.reset(player.sessionId);
  }

  forget(sessionId: string): void {
    this.trackers.delete(sessionId);
  }

  reset(sessionId: string): void {
    const existing = this.trackers.get(sessionId);
    this.trackers.set(sessionId, { banked: 0, fresh: true, loggedRate: existing?.loggedRate ?? -1 });
  }

  /**
   * Credit one simulated step.
   *
   * @param distance  horizontal distance the authoritative position moved
   * @param onGround  true when the step began and ended grounded, walking
   */
  credit(sessionId: string, player: PlayerState, stepSeconds: number, distance: number, onGround: boolean): TongueGain {
    const tracker = this.trackers.get(sessionId);
    if (!tracker) {
      this.reset(sessionId);
      return { gained: 0, levelsGained: 0, lockedTreadmill: 0 };
    }
    const step = Number.isFinite(stepSeconds) ? Math.max(0, Math.min(stepSeconds, MAX_SIM_DELTA)) : 0;

    const base = this.rateOf(player);
    if (base !== tracker.loggedRate) {
      tracker.loggedRate = base;
      logger.info(SCOPE, `${sessionId} rate: ${describeTongueRate(this.rateInputs(player))}`);
    }

    let travelled = 0;
    let rate = base;
    let lockedTreadmill = 0;
    if (!tracker.fresh && step > 0 && onGround) {
      if (player.treadmill > 0) {
        const multiplier = treadmillMultiplier(player.treadmill, player.rebirths);
        if (multiplier > 0) {
          travelled = TREADMILLS.beltSpeed * step;
          rate = base * multiplier;
        } else {
          lockedTreadmill = player.treadmill;
        }
      } else if (distance <= this.maxCreditedStep(step)) {
        travelled = distance >= TONGUE_STEP.movingSpeed * step ? distance : 0;
      }
    }

    let gained = 0;
    if (travelled > 0) {
      tracker.banked += travelled;
      while (tracker.banked + 1e-9 >= TONGUE_STEP.strideDistance) {
        tracker.banked -= TONGUE_STEP.strideDistance;
        gained += rate;
      }
    }
    tracker.fresh = false;

    const beforeLevel = player.level;
    if (gained > 0) {
      player.xp += gained;
      player.lifetimeXp += gained;
    }
    this.syncDerived(player);
    return { gained, levelsGained: player.level - beforeLevel, lockedTreadmill };
  }

  /**
   * Re-derive level, Tongue Length and rate. The TONGUE LENGTH follows the
   * LEVEL - never the XP - so it moves only when a level-up happens.
   */
  syncDerived(player: PlayerState): void {
    player.level = resolveLevel(player.xp).level;
    player.tongueLength = tongueLengthFor(player.level);
    player.tonguePerStep = this.rateOf(player);
  }

  private rateInputs(player: PlayerState): TongueRateInputs {
    return {
      tongueSlot: player.tongueSlot,
      ownedTongues: player.ownedTongues,
      trailSlot: player.trailSlot,
      ownedTrails: player.ownedTrails,
      rebirths: player.rebirths,
    };
  }

  private rateOf(player: PlayerState): number {
    return tonguePerStepFor(this.rateInputs(player));
  }

  /** Largest walk the server will credit from one step: walk speed with slack. */
  private maxCreditedStep(stepSeconds: number): number {
    return MOVEMENT.moveSpeed * stepSeconds * TONGUE_STEP.creditSlack + 0.2;
  }
}
