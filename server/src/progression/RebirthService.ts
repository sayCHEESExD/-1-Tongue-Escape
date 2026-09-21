import { STARTING_XP, canRebirth, rebirthMultiplier } from '@tongue/shared';
import type { PlayerState } from '../rooms/state/PlayerState.js';
import type { TongueService } from './TongueService.js';

export type RebirthResult =
  | { readonly ok: true; readonly rebirths: number; readonly multiplier: number }
  | { readonly ok: false; readonly reason: 'not-eligible' };

/**
 * Server authority over rebirths.
 *
 * "Rebirth resets your levels!": XP goes back to 0 - Level 1, and so the
 * Level 1 Tongue Length of 12 - in exchange for a permanently bigger
 * multiplier. Wins, owned tongues, trails and lifetime XP are untouched.
 * The client sends an empty message; eligibility is the server's own level.
 */
export class RebirthService {
  rebirth(player: PlayerState, tongues: TongueService): RebirthResult {
    if (!canRebirth(player.level, player.rebirths)) return { ok: false, reason: 'not-eligible' };
    player.rebirths += 1;
    player.xp = STARTING_XP;
    tongues.syncDerived(player);
    return { ok: true, rebirths: player.rebirths, multiplier: rebirthMultiplier(player.rebirths) };
  }
}
