/**
 * Rebirth: the prestige ladder.
 *
 * A rebirth trades the current level for a permanently bigger Tongue
 * multiplier. Wins, owned tongues and trails are untouched.
 *
 * As in the reference menu: before the first rebirth the multiplier is x1.00
 * and the next one needs Level 10; after it the multiplier is x1.50 and the
 * next one needs Level 20. Every rebirth adds another 0.5 and another ten
 * levels. Both functions are open-ended, so the ladder extends without edits.
 */

/** Tongue multiplier added per rebirth. */
export const MULTIPLIER_PER_REBIRTH = 0.5;

/** Level the first rebirth needs, and how many more each later one needs. */
export const FIRST_REBIRTH_LEVEL = 10;
export const REBIRTH_LEVEL_STEP = 10;

/** Level the NEXT rebirth needs, given how many have been performed. */
export const rebirthRequiredLevel = (count: number): number =>
  FIRST_REBIRTH_LEVEL + REBIRTH_LEVEL_STEP * Math.max(0, Math.floor(count));

/** Tongue multiplier granted by `count` completed rebirths. */
export const rebirthMultiplier = (count: number): number =>
  1 + Math.max(0, Math.floor(count)) * MULTIPLIER_PER_REBIRTH;

/** A player may rebirth once they have reached the level the next rung needs. */
export const canRebirth = (level: number, count: number): boolean =>
  Math.floor(level) >= rebirthRequiredLevel(count);

/** "+50%" for x1.5: the HUD's rebirth readout. */
export const rebirthBonusPercent = (count: number): number =>
  Math.round((rebirthMultiplier(count) - 1) * 100);
