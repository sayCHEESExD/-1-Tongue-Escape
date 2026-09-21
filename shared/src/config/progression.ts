import { rebirthMultiplier } from './rebirth.js';
import { tonguePerStepOf } from './tongues.js';
import { trailMultiplier } from './trails.js';

/**
 * XP: the progression figure, and the level curve it feeds.
 *
 * Every figure here is SERVER-AUTHORITATIVE. The client displays what was
 * replicated and never decides any of it.
 *
 * XP is EARNED BY STEPS. A step is `TONGUE_STEP.strideDistance` units of
 * ground actually covered, and every step pays the player's rate. A treadmill
 * supplies the distance instead, so a player standing on one takes steps
 * without going anywhere - and the treadmill's own multiplier applies there.
 *
 * THE RATE is deterministic, the product of exactly these and nothing else:
 *
 *   worn tongue's Tongue/step  x  rebirth multiplier  x  worn trail multiplier
 *     (x the treadmill's multiplier, while training on one)
 *
 * `tonguePerStepFor` is the ONE place that product is computed.
 */

/**
 * XP and TONGUE are different things. XP is earned per step and decides when
 * the LEVEL changes; the level decides the TONGUE LENGTH (`tongueLengthFor`,
 * 12 studs at Level 1 - the HUD's "Total Tongue"). A new player holds 0 XP.
 */
export const STARTING_XP = 0;

/** The largest Wins total that can be held (float64 on the wire, exact to here). */
export const MAX_WINS = Number.MAX_SAFE_INTEGER;

export const TONGUE_STEP = {
  /** World units of ground travel that make one STEP. */
  strideDistance: 3.2,
  /** Ground speed below which the player counts as NOT MOVING. */
  movingSpeed: 1.5,
  /** Slack on the largest distance one simulated step may honestly cover. */
  creditSlack: 1.6,
} as const;

/** Everything that decides a player's XP per step (shown in the menus as "Tongue per step"). */
export interface TongueRateInputs {
  readonly tongueSlot: number;
  readonly ownedTongues: number;
  readonly trailSlot: number;
  readonly ownedTrails: number;
  readonly rebirths: number;
}

/** THE rate, in Tongue per step, off a treadmill. The one formula. */
export const tonguePerStepFor = (inputs: TongueRateInputs): number =>
  tonguePerStepOf(inputs.tongueSlot, inputs.ownedTongues) *
  rebirthMultiplier(inputs.rebirths) *
  trailMultiplier(inputs.trailSlot, inputs.ownedTrails);

/** A readable breakdown, for the server log. */
export const describeTongueRate = (inputs: TongueRateInputs): string =>
  `${tonguePerStepOf(inputs.tongueSlot, inputs.ownedTongues)} x rebirth ${rebirthMultiplier(inputs.rebirths)}` +
  ` x trail ${trailMultiplier(inputs.trailSlot, inputs.ownedTrails)} = ${tonguePerStepFor(inputs)}`;

// ---------------------------------------------------------------- the curve

/**
 * The level curve. Level 1 needs 17 XP, as in the reference ("/17"), growing
 * 25% a level and easing to 12% past level 25 so the top is a long climb
 * rather than an absurd one. There is no level cap.
 */
export const LEVEL_CURVE = {
  base: 17,
  growth: 1.25,
  taperFrom: 25,
  taperGrowth: 1.12,
} as const;

/** XP needed to advance FROM `level` to the next one. Rounded, and load-bearing. */
export const xpForNextLevel = (level: number): number => {
  const step = Math.max(1, Math.floor(level));
  const fast = Math.min(step - 1, LEVEL_CURVE.taperFrom - 1);
  const slow = Math.max(0, step - LEVEL_CURVE.taperFrom);
  return Math.round(LEVEL_CURVE.base * LEVEL_CURVE.growth ** fast * LEVEL_CURVE.taperGrowth ** slow);
};

/** Cumulative XP to have REACHED each level, grown on demand. Level 1 is 0 XP. */
const CUMULATIVE: number[] = [0, 0];

const extendTo = (level: number): void => {
  while (CUMULATIVE.length <= level) {
    const last = CUMULATIVE.length - 1;
    const next = (CUMULATIVE[last] as number) + xpForNextLevel(last);
    if (!Number.isFinite(next)) return;
    CUMULATIVE.push(next);
  }
};

export const totalXpToReach = (level: number): number => {
  const target = Math.max(1, Math.floor(level));
  extendTo(target);
  return CUMULATIVE[Math.min(target, CUMULATIVE.length - 1)] ?? 0;
};

export interface LevelProgress {
  readonly level: number;
  /** XP earned toward the next level. */
  readonly into: number;
  /** XP needed for the next level. */
  readonly required: number;
  /** 0..1 fill for the level bar. */
  readonly fraction: number;
}

/** Resolve an XP total into a level and a bar position. */
export const resolveLevel = (xp: number): LevelProgress => {
  const total = Number.isFinite(xp) ? Math.max(0, xp) : 0;
  while ((CUMULATIVE[CUMULATIVE.length - 1] as number) <= total) {
    const before = CUMULATIVE.length;
    extendTo(before + 64);
    if (CUMULATIVE.length === before) break;
  }
  let low = 1;
  let high = CUMULATIVE.length - 1;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if ((CUMULATIVE[mid] as number) <= total) low = mid;
    else high = mid - 1;
  }
  const required = xpForNextLevel(low);
  const into = total - (CUMULATIVE[low] as number);
  return {
    level: low,
    into,
    required,
    fraction: required > 0 ? Math.min(Math.max(into / required, 0), 1) : 0,
  };
};

/** Compact display: 940, 13.2K, 453.6K, 3.1M, 2.5B, 4T. */
export const formatAmount = (value: number): string => {
  const amount = Number.isFinite(value) ? Math.max(0, value) : 0;
  const compact = (divisor: number, suffix: string): string => {
    const scaled = amount / divisor;
    const text = scaled >= 100 ? scaled.toFixed(0) : scaled.toFixed(1).replace(/\.0$/, '');
    return `${text}${suffix}`;
  };
  if (amount >= 1e12) return compact(1e12, 'T');
  if (amount >= 1e9) return compact(1e9, 'B');
  if (amount >= 1e6) return compact(1e6, 'M');
  if (amount >= 10_000) return compact(1_000, 'K');
  return Math.floor(amount).toLocaleString('en-US');
};

/** Wins, with separators under a million and compact past it. */
export const formatWins = (value: number): string => {
  const amount = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  return amount < 1_000_000 ? amount.toLocaleString('en-US') : formatAmount(amount);
};

/** A multiplier as the menus print it: x1.00, x1.50, x2.50. */
export const formatMultiplier = (value: number): string => `x${value.toFixed(2)}`;
