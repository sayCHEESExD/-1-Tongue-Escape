import {
  isStageTongue,
  ownsTongue,
  tongueBit,
  tongueForSlot,
  tonguePadAt,
  type TongueTier,
} from '@tongue/shared';
import type { PlayerState } from '../rooms/state/PlayerState.js';
import type { TongueService } from './TongueService.js';
import { wallet } from './Wallet.js';

export type PadResult =
  | { readonly ok: true; readonly action: 'bought' | 'equipped'; readonly tier: TongueTier }
  | {
      readonly ok: false;
      readonly reason: 'unknown-slot' | 'not-on-pad' | 'too-few-wins' | 'already-worn' | 'cooldown';
      readonly tier?: TongueTier;
    };

/** Milliseconds between two accepted pad actions from one player. Spam only. */
const COOLDOWN_MS = 300;

/**
 * Server authority over the physical Tongue stage.
 *
 * A purchase is a DELIBERATE ACT: the player walks onto a tongue's pad. The
 * position is checked against the transform the server itself simulated, the
 * price is checked and then SPENT - last, so a refusal never costs anything -
 * and a bought tongue is worn at once. A pad whose tongue is already owned
 * wears it again. The client sends a slot number and nothing else.
 */
export class TongueShopService {
  private readonly lastAt = new Map<string, number>();

  initialise(player: PlayerState): void {
    this.lastAt.set(player.sessionId, 0);
    this.sanitise(player);
  }

  forget(sessionId: string): void {
    this.lastAt.delete(sessionId);
  }

  pad(player: PlayerState, slot: unknown, tongues: TongueService): PadResult {
    if (typeof slot !== 'number' || !Number.isInteger(slot) || !isStageTongue(slot)) {
      return { ok: false, reason: 'unknown-slot' };
    }
    const tier = tongueForSlot(slot);
    if (tonguePadAt(player.x, player.y, player.z) !== tier.slot) return { ok: false, reason: 'not-on-pad', tier };

    const now = Date.now();
    if (now - (this.lastAt.get(player.sessionId) ?? 0) < COOLDOWN_MS) return { ok: false, reason: 'cooldown', tier };

    if (ownsTongue(player.ownedTongues, tier.slot)) {
      if (player.tongueSlot === tier.slot) return { ok: false, reason: 'already-worn', tier };
      player.tongueSlot = tier.slot;
      this.lastAt.set(player.sessionId, now);
      tongues.syncDerived(player);
      return { ok: true, action: 'equipped', tier };
    }

    if (!wallet.spend(player, tier.cost)) return { ok: false, reason: 'too-few-wins', tier };
    player.ownedTongues |= tongueBit(tier.slot);
    player.tongueSlot = tier.slot;
    this.lastAt.set(player.sessionId, now);
    tongues.syncDerived(player);
    return { ok: true, action: 'bought', tier };
  }

  /** A worn tongue the player turns out not to own falls back to the default. */
  sanitise(player: PlayerState): void {
    if (!ownsTongue(player.ownedTongues, player.tongueSlot)) player.tongueSlot = 0;
  }
}
