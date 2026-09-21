/**
 * THE TONGUE UPGRADES: the thirteen tongues on the two-storey display stage.
 *
 * Each one is PERMANENT and sets how much Tongue a step is worth. They are
 * BOUGHT with Wins on the stage itself: walk onto a tongue's pad, and if you
 * hold its price it is paid and the tongue is yours and worn. Walking onto the
 * pad of a tongue you already own wears it again.
 *
 * The DEFAULT tongue (slot 0) is not on the stage and is never bought: it is
 * the plain pink +1 every player starts with. Blueberry is the first tongue
 * that can be purchased, as specified.
 *
 * Slot order is the stage's order: the five on the lower tier (Blueberry to
 * Ruby, front to back), then the eight on the upper tier (Crystal to
 * Futuristic). Every tongue also carries its LOOK - presentation only, which
 * the server never reads - so the stage and the tongue on a player agree.
 */

/** How the client dresses a tongue. Presentation only. */
export type TongueFx =
  /** Plain, glossy. */
  | 'plain'
  /** Translucent, wobbly, with a sugary sheen. */
  | 'gummy'
  /** Dripping, glowing goo. */
  | 'slime'
  /** Faceted gem with glints. */
  | 'gem'
  /** Icy crystal with frost motes. */
  | 'crystal'
  /** Cracked molten rock with embers. */
  | 'lava'
  /** Flames licking along it. */
  | 'fire'
  /** Crackling arcs. */
  | 'lightning'
  /** Polished gold with sparkles. */
  | 'golden'
  /** Starry nebula. */
  | 'galaxy'
  /** Dark matter with purple wisps. */
  | 'void'
  /** Neon circuitry. */
  | 'futuristic';

export interface TongueTier {
  /** 0 = the default tongue; 1..13 = the stage, in stage order. */
  readonly slot: number;
  readonly name: string;
  /** Tongue earned per STEP while this tongue is worn, before multipliers. */
  readonly perStep: number;
  /** Wins the tongue COSTS. Spent from the wallet when it is bought. */
  readonly cost: number;
  /** Body colour. */
  readonly color: number;
  /** Secondary colour: the tip, the glow, the particles. */
  readonly accent: number;
  /** How strongly it glows, 0..1. */
  readonly glow: number;
  readonly fx: TongueFx;
  /** 0 = lower tier, 1 = upper tier. The stage layout reads it. */
  readonly tier: 0 | 1;
}

export const DEFAULT_TONGUE: TongueTier = {
  slot: 0,
  name: 'Tongue',
  perStep: 1,
  cost: 0,
  color: 0xff9ec4,
  accent: 0xff6fa5,
  glow: 0,
  fx: 'plain',
  tier: 0,
};

export const TONGUE_TIERS: readonly TongueTier[] = [
  { slot: 1, name: 'Blueberry Tongue', perStep: 2, cost: 1, color: 0x6a4cff, accent: 0x9d8bff, glow: 0.05, fx: 'plain', tier: 0 },
  { slot: 2, name: 'Gummy Tongue', perStep: 3, cost: 5, color: 0xff5fb8, accent: 0x7cf2ff, glow: 0.12, fx: 'gummy', tier: 0 },
  { slot: 3, name: 'Slime Tongue', perStep: 5, cost: 15, color: 0x46e83c, accent: 0xb6ff5a, glow: 0.25, fx: 'slime', tier: 0 },
  { slot: 4, name: 'Emerald Tongue', perStep: 8, cost: 40, color: 0x12c46e, accent: 0xb8ffd8, glow: 0.3, fx: 'gem', tier: 0 },
  { slot: 5, name: 'Ruby Tongue', perStep: 12, cost: 100, color: 0xe0103c, accent: 0xff8aa0, glow: 0.35, fx: 'gem', tier: 0 },
  { slot: 6, name: 'Crystal Tongue', perStep: 18, cost: 250, color: 0xcfefff, accent: 0xffffff, glow: 0.45, fx: 'crystal', tier: 1 },
  { slot: 7, name: 'Lava Tongue', perStep: 27, cost: 600, color: 0x3a1a10, accent: 0xff7a1a, glow: 0.55, fx: 'lava', tier: 1 },
  { slot: 8, name: 'Fire Tongue', perStep: 40, cost: 1_500, color: 0xff4a12, accent: 0xffd23a, glow: 0.7, fx: 'fire', tier: 1 },
  { slot: 9, name: 'Lightning Tongue', perStep: 60, cost: 4_000, color: 0x2a7bff, accent: 0xbfe4ff, glow: 0.75, fx: 'lightning', tier: 1 },
  { slot: 10, name: 'Golden Tongue', perStep: 90, cost: 10_000, color: 0xffc21a, accent: 0xfff2a8, glow: 0.8, fx: 'golden', tier: 1 },
  { slot: 11, name: 'Galaxy Tongue', perStep: 135, cost: 25_000, color: 0x6b2bd9, accent: 0xff8af0, glow: 0.85, fx: 'galaxy', tier: 1 },
  { slot: 12, name: 'Void Tongue', perStep: 200, cost: 60_000, color: 0x15071f, accent: 0xa640ff, glow: 0.9, fx: 'void', tier: 1 },
  { slot: 13, name: 'Futuristic Tongue', perStep: 300, cost: 150_000, color: 0x1ad8ff, accent: 0xff3df2, glow: 1, fx: 'futuristic', tier: 1 },
];

/** Thirteen purchasable tongues. `verify:progression` asserts it. */
export const TONGUE_TIER_COUNT = TONGUE_TIERS.length;

const BY_SLOT = new Map<number, TongueTier>(TONGUE_TIERS.map((tier) => [tier.slot, tier]));

/** The tongue in a slot, or the default tongue for 0 and anything unknown. */
export const tongueForSlot = (slot: number): TongueTier =>
  BY_SLOT.get(Math.floor(slot)) ?? DEFAULT_TONGUE;

/** True when `slot` names one of the thirteen stage tongues. */
export const isStageTongue = (slot: number): boolean => BY_SLOT.has(Math.floor(slot));

/** Bit for one slot in the owned mask. Slot 1 is bit 0. */
export const tongueBit = (slot: number): number => 1 << (Math.floor(slot) - 1);

export const ownsTongue = (ownedMask: number, slot: number): boolean =>
  Math.floor(slot) === 0 || (isStageTongue(slot) && (ownedMask & tongueBit(slot)) !== 0);

/** Every bit a valid owned mask may carry. */
export const ALL_TONGUE_BITS = TONGUE_TIERS.reduce((mask, tier) => mask | tongueBit(tier.slot), 0);

/** Tongue per step from the worn tongue - the default for anything not owned. */
export const tonguePerStepOf = (slot: number, ownedMask: number): number =>
  ownsTongue(ownedMask, slot) ? tongueForSlot(slot).perStep : DEFAULT_TONGUE.perStep;
