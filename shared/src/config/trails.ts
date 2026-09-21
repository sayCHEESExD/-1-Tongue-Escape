/**
 * Trails: a MULTIPLIER on the Tongue a step is worth, bought in the Trails
 * menu with Wins and worn visibly behind the player.
 *
 * Exactly the five specified. The multiplier goes through the one shared rate
 * formula (`tonguePerStepFor`); a trail that is not owned multiplies by 1.
 */

/** How the client draws a trail. Presentation only. */
export type TrailStyle = 'solid' | 'rainbow';

export interface TrailTier {
  /** 1-based slot, matching the menu rows top to bottom. */
  readonly slot: number;
  readonly name: string;
  /** Multiplier on Tongue per step while worn. */
  readonly multiplier: number;
  /** Wins the trail COSTS. Spent from the wallet when it is bought. */
  readonly winsRequired: number;
  readonly color: number;
  readonly style: TrailStyle;
}

export const TRAIL_TIERS: readonly TrailTier[] = [
  { slot: 1, name: 'Orange Trail', multiplier: 1.25, winsRequired: 25, color: 0xff8a1f, style: 'solid' },
  { slot: 2, name: 'Blue Trail', multiplier: 1.5, winsRequired: 50, color: 0x2f8bff, style: 'solid' },
  { slot: 3, name: 'Green Trail', multiplier: 1.75, winsRequired: 75, color: 0x35d34a, style: 'solid' },
  { slot: 4, name: 'Purple Trail', multiplier: 2, winsRequired: 100, color: 0xa04dff, style: 'solid' },
  { slot: 5, name: 'Rainbow Trail', multiplier: 2.5, winsRequired: 125, color: 0xff3df2, style: 'rainbow' },
];

/** Nothing worn. */
export const NO_TRAIL = 0;

export const trailBySlot = (slot: number): TrailTier | undefined =>
  TRAIL_TIERS.find((tier) => tier.slot === slot);

/** One bit per slot, so the whole inventory is a single replicated integer. */
export const trailMask = (slot: number): number => 1 << (Math.floor(slot) - 1);

export const isTrailOwned = (owned: number, slot: number): boolean =>
  slot >= 1 && (owned & trailMask(slot)) !== 0;

/** Every bit a valid owned mask may carry. */
export const ALL_TRAIL_BITS = TRAIL_TIERS.reduce((mask, tier) => mask | trailMask(tier.slot), 0);

/** Multiplier from the worn trail: 1 for none, and for anything not owned. */
export const trailMultiplier = (slot: number, owned: number): number => {
  const tier = trailBySlot(slot);
  if (!tier) return 1;
  return isTrailOwned(owned, tier.slot) ? tier.multiplier : 1;
};
