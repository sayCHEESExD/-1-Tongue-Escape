import type { Aabb } from '../types/math.js';
import { tongueClimbFor, tongueLengthFor } from './tongue.js';
import { TONGUE_TIERS } from './tongues.js';

/**
 * THE WORLD, as data. The server collides against it, the client predicts
 * against it and draws it - one array, so a platform the player can see but
 * not stand on is structurally impossible.
 *
 * Layout (spawn faces +Z, down the lava river):
 *
 *   BACK WALL  (z = -92)   the three leaderboards
 *   RIGHT      (-X)        Tongue Training: three treadmills on a red carpet
 *   LEFT       (+X)        the two-storey Tongue stage with stairs at both ends
 *   AHEAD      (z >= 0)    the long, straight lava river: thirty stages, each
 *                          a run of islands in its own pattern ending on a
 *                          deck with a win pad
 */

export type SolidKind =
  | 'hub'
  | 'start'
  | 'island'
  | 'deck'
  | 'winPad'
  | 'wall'
  | 'stageBase'
  | 'stageUpper'
  | 'stageWall'
  | 'stair'
  | 'belt'
  | 'console';

export interface CourseSolid extends Aabb {
  readonly kind: SolidKind;
  /** 0 = the hub; otherwise the stage it belongs to. */
  readonly stage: number;
  /** True when a tongue may attach to its top. */
  readonly landable: boolean;
}

/** The spawn hub. */
export const HUB = {
  minX: -70,
  maxX: 70,
  minZ: -92,
  maxZ: 0,
  floorY: 0,
  floorThickness: 4,
  wallHeight: 30,
} as const;

/**
 * How deep the hub's front walls (either side of the river mouth) run into
 * the course. The river walls and cliffs begin exactly where they end, so no
 * two walls ever occupy the same space.
 */
export const HUB_FRONT_WALL_DEPTH = 8;

/** The lava river's cross-section. Its length follows from the stages. */
const RIVER_BASE = {
  halfWidth: 30,
  startZ: 0,
  /** The lava surface. Anything at or under it burns. */
  lavaY: -3,
  /** Where island and wall columns start, well under the lava. */
  bedY: -14,
  /** Top of the river's side walls. Not landable. */
  wallTopY: 22,
  wallThickness: 12,
} as const;

/** Start platform: the grey slab the river begins from, one step up from the hub. */
export const START_PLATFORM = { minZ: 0, maxZ: 14, topY: 0.8 } as const;

export interface IslandDefinition {
  readonly x: number;
  readonly z: number;
  /** Size across (X) and along (Z). */
  readonly width: number;
  readonly depth: number;
  readonly topY: number;
}

/** How a stage's islands are laid out: its traversal challenge. */
export type StagePattern =
  | 'broad'
  | 'scatter'
  | 'stones'
  | 'weave'
  | 'zigzag'
  | 'climb'
  | 'descend'
  | 'narrow'
  | 'pillars'
  | 'leaps'
  | 'fork'
  | 'finale';

export interface StageDefinition {
  /** 1-based. */
  readonly index: number;
  readonly name: string;
  readonly pattern: StagePattern;
  readonly startZ: number;
  readonly endZ: number;
  /** The level whose Tongue Length the stage is built around. 0 for Stage 1. */
  readonly recommendedLevel: number;
  readonly winReward: number;
  /** The route, in order. */
  readonly islands: readonly IslandDefinition[];
  /** Landable side islands off the route: the other half of a fork. */
  readonly extras: readonly IslandDefinition[];
  /** The deck at the stage's end, where its win pad sits. */
  readonly deck: IslandDefinition;
  readonly pad: { readonly x: number; readonly z: number; readonly size: number; readonly topY: number };
  /** Where the big "STAGE N" sign hangs. */
  readonly signZ: number;
  readonly signY: number;
  /** Index into `islands` of the throw that a Tongue three levels short cannot make. -1 for Stage 1. */
  readonly gate: number;
}

/** Height of a win pad above its deck. Under a step, so it is walked onto. */
export const WIN_PAD_HEIGHT = 0.2;

/** Thirty stages: a name and a challenge each. The client dresses them. */
export const STAGE_PLANS: readonly { readonly name: string; readonly pattern: StagePattern }[] = [
  { name: 'Meadow Falls', pattern: 'broad' },
  { name: 'Pebble Shoals', pattern: 'scatter' },
  { name: 'Mushroom Hollow', pattern: 'stones' },
  { name: 'Windy Isles', pattern: 'weave' },
  { name: 'Sunset Sands', pattern: 'zigzag' },
  { name: 'Crystal Caverns', pattern: 'climb' },
  { name: 'Frosty Floes', pattern: 'narrow' },
  { name: 'Jungle Canopy', pattern: 'pillars' },
  { name: 'Cherry Blossom', pattern: 'fork' },
  { name: 'Basalt Steps', pattern: 'descend' },
  { name: 'Candy Cove', pattern: 'stones' },
  { name: 'Coral Reef', pattern: 'weave' },
  { name: 'Autumn Grove', pattern: 'leaps' },
  { name: 'Toxic Swamp', pattern: 'zigzag' },
  { name: 'Bamboo Heights', pattern: 'pillars' },
  { name: 'Golden Ruins', pattern: 'fork' },
  { name: 'Glacier Pass', pattern: 'climb' },
  { name: 'Canyon Run', pattern: 'narrow' },
  { name: 'Moonstone', pattern: 'scatter' },
  { name: 'Obsidian Forge', pattern: 'descend' },
  { name: 'Amethyst Spires', pattern: 'pillars' },
  { name: 'Neon Grid', pattern: 'zigzag' },
  { name: 'Ember Wastes', pattern: 'leaps' },
  { name: 'Sky Garden', pattern: 'climb' },
  { name: 'Storm Front', pattern: 'weave' },
  { name: 'Rusty Gears', pattern: 'stones' },
  { name: 'Nebula Drift', pattern: 'fork' },
  { name: 'Prism Peaks', pattern: 'narrow' },
  { name: 'Void Rim', pattern: 'leaps' },
  { name: 'Rainbow Summit', pattern: 'finale' },
];

export const STAGE_COUNT = STAGE_PLANS.length;

/** Stage 1 is for a fresh tongue; Stage 2 recommends Level 5; each stage after asks one level more. */
export const recommendedLevelFor = (index: number): number => (index <= 1 ? 0 : 5 + (index - 2));

/** Wins a stage's pad pays: +1, +2, +3 ... growing faster in the late stages. */
export const stageReward = (index: number): number => Math.max(index, Math.round(1.35 ** (index - 1)));

/** Islands a surface this high or low still counts as. */
const TOP_MIN = 0.5;
const TOP_MAX = 26;
/** The height most patterns drift back toward, so no stage inherits a ceiling or a floor. */
const HOME_Y = 7;
/** Where a rider stands (inside the far edge) and where a tongue lands (inside the near edge). */
const STAND_INSET = 0.9;
const LAND_INSET = 1.0;
/** Every throw is at least this much shorter than the stage's Tongue Length. */
const THROW_MARGIN = 2;

/** A deterministic PRNG, so the course is the same on every machine. */
const seeded = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** One island as a pattern asks for it, before the reach rules are applied. */
interface Raw {
  width: number;
  depth: number;
  x: number;
  rise: number;
  /** How much of the stage's throw budget this gap should ask for, 0..1. */
  reach: number;
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** The islands a pattern asks for. `climb` is the tallest a throw may rise. */
const rawIslands = (pattern: StagePattern, random: () => number, climb: number, stage: number): Raw[] => {
  const between = (a: number, b: number): number => lerp(a, b, random());
  const side = (i: number): number => (i % 2 === 0 ? 1 : -1);
  const out: Raw[] = [];
  const add = (raw: Raw): void => {
    out.push(raw);
  };
  const riseCap = Math.max(1, climb - 2);
  switch (pattern) {
    case 'broad':
      for (let i = 0; i < 8; i += 1) add({ width: between(20, 26), depth: between(14, 18), x: between(-6, 6), rise: between(-1.2, 1.6), reach: between(0.55, 0.85) });
      break;
    case 'scatter':
      for (let i = 0; i < 8; i += 1) add({ width: between(8, 12), depth: between(8, 10), x: between(-14, 14), rise: between(-3, Math.min(4, riseCap)), reach: between(0.7, 0.95) });
      break;
    case 'stones':
      for (let i = 0; i < 10; i += 1) add({ width: between(5, 7), depth: between(5, 7), x: between(-9, 9), rise: between(-1, 1.5), reach: between(0.45, 0.72) });
      break;
    case 'weave':
      for (let i = 0; i < 8; i += 1) add({ width: between(9, 12), depth: 9, x: 16 * Math.sin((i + 1) * 1.3 + stage), rise: between(-1, 2), reach: between(0.7, 0.9) });
      break;
    case 'zigzag':
      for (let i = 0; i < 8; i += 1) {
        const width = between(8, 10);
        add({ width, depth: 10, x: side(i) * (RIVER_BASE.halfWidth - width / 2 - 2), rise: between(-1, 2), reach: between(0.75, 0.95) });
      }
      break;
    case 'climb':
      // A steady climb of about 24 over the stage, whatever the tongue could manage in one go.
      for (let i = 0; i < 7; i += 1) add({ width: between(10, 14), depth: 10, x: between(-6, 6), rise: Math.min(riseCap, between(3, 4.6)), reach: between(0.6, 0.8) });
      break;
    case 'descend':
      add({ width: 14, depth: 12, x: 0, rise: riseCap, reach: 0.6 });
      for (let i = 1; i < 7; i += 1) add({ width: between(10, 13), depth: 10, x: between(-10, 10), rise: -between(3, 6), reach: between(0.75, 0.95) });
      break;
    case 'narrow':
      for (let i = 0; i < 7; i += 1) add({ width: between(4, 5), depth: between(14, 18), x: between(-12, 12), rise: between(-2, Math.min(3, riseCap)), reach: between(0.75, 0.95) });
      break;
    case 'pillars':
      for (let i = 0; i < 8; i += 1) add({ width: between(4, 5), depth: between(4, 5), x: between(-12, 12), rise: between(-6, Math.min(7, riseCap)), reach: between(0.7, 0.9) });
      break;
    case 'leaps':
      for (let i = 0; i < 5; i += 1) add({ width: between(12, 16), depth: 12, x: between(-5, 5), rise: between(-2, Math.min(3, riseCap)), reach: between(0.9, 0.97) });
      break;
    case 'fork':
      for (let i = 0; i < 7; i += 1) {
        const width = between(8, 10);
        add({ width, depth: 10, x: side(i) * between(width / 2 + 2, 14), rise: between(-1, 2), reach: between(0.75, 0.9) });
      }
      break;
    case 'finale': {
      const mix: StagePattern[] = ['stones', 'zigzag', 'pillars', 'climb', 'narrow', 'leaps'];
      for (const part of mix) {
        const pair = rawIslands(part, random, climb, stage);
        add(pair[0] as Raw);
        add(pair[1] as Raw);
      }
      break;
    }
  }
  return out;
};

/** How far sideways a throw must reach beyond what the two islands' widths give for free. */
const lateralNeed = (from: IslandDefinition, x: number, width: number): number =>
  Math.max(0, Math.abs(x - from.x) - (from.width / 2 - STAND_INSET) - (width / 2 - LAND_INSET));

/**
 * Lay out one stage from its pattern, then apply the reach rules to every
 * throw: none needs more than `budget` (the stage's Tongue Length less a
 * margin), and the gate throw needs `budget - 1` - more than a tongue three
 * levels shorter can give, so the stage genuinely asks for its level.
 */
const buildStage = (index: number, from: IslandDefinition): StageDefinition => {
  const plan = STAGE_PLANS[index - 1] as (typeof STAGE_PLANS)[number];
  const level = Math.max(1, recommendedLevelFor(index));
  const length = tongueLengthFor(level);
  const budget = length - THROW_MARGIN;
  const climb = tongueClimbFor(length);
  const random = seeded(0x51a6e + index * 7919);
  const raws = rawIslands(plan.pattern, random, climb, index);
  const gate = index === 1 ? -1 : Math.floor(raws.length / 2);

  const islands: IslandDefinition[] = [];
  const extras: IslandDefinition[] = [];
  let prev = from;
  const place = (raw: Raw, want: number): IslandDefinition => {
    const width = raw.width;
    const limit = RIVER_BASE.halfWidth - width / 2 - 1;
    let x = Math.max(-limit, Math.min(limit, raw.x));
    // Too far sideways for this budget: pull it in until the throw fits.
    while (lateralNeed(prev, x, width) > want * 0.8) x = lerp(x, prev.x, 0.2);
    const lateral = lateralNeed(prev, x, width);
    const need = Math.max(want, Math.hypot(3 + STAND_INSET + LAND_INSET, lateral));
    const gap = Math.max(3, Math.sqrt(Math.max(0, need * need - lateral * lateral)) - STAND_INSET - LAND_INSET);
    const top = Math.max(TOP_MIN, Math.min(TOP_MAX, prev.topY + Math.max(-30, Math.min(climb - 2, raw.rise))));
    const island = { x, z: prev.z + prev.depth / 2 + gap + raw.depth / 2, width, depth: raw.depth, topY: top };
    return island;
  };

  raws.forEach((raw, i) => {
    const want = i === gate ? budget - 1 : Math.min(budget, Math.max(4.5, raw.reach * budget));
    // Heights: a climb starts low and a descent starts high; everything else
    // wanders around HOME_Y rather than inheriting where the last stage ended.
    let rise = raw.rise;
    if (plan.pattern === 'climb' && i === 0) rise = 2 - prev.topY;
    else if (plan.pattern === 'descend' && i === 0) rise = Math.min(climb - 2, TOP_MAX - prev.topY);
    else if (plan.pattern !== 'climb' && plan.pattern !== 'descend') rise += (HOME_Y - prev.topY) * 0.35;
    const island = place({ ...raw, rise }, want);
    islands.push(island);
    // A fork: its mirror is just as reachable, and either route continues.
    if (plan.pattern === 'fork' && Math.abs(island.x) >= island.width / 2 + 1.5) extras.push({ ...island, x: -island.x });
    prev = island;
  });

  const deck = place({ width: 40, depth: 24, x: 0, rise: random() * 2 - 1 + (plan.pattern === 'climb' ? 0 : (HOME_Y - prev.topY) * 0.3), reach: 0.6 }, Math.min(budget, Math.max(4.5, 0.6 * budget)));
  const startZ = from.z + from.depth / 2;
  return {
    index,
    name: plan.name,
    pattern: plan.pattern,
    startZ,
    endZ: deck.z + deck.depth / 2,
    recommendedLevel: recommendedLevelFor(index),
    winReward: stageReward(index),
    islands,
    extras,
    deck,
    pad: { x: -12, z: deck.z + 2, size: 8, topY: deck.topY + WIN_PAD_HEIGHT },
    signZ: index === 1 ? 6 : from.z + 6,
    signY: (index === 1 ? START_PLATFORM.topY : from.topY) + 16,
    gate,
  };
};

const buildStages = (): StageDefinition[] => {
  const stages: StageDefinition[] = [];
  let from: IslandDefinition = {
    x: 0,
    z: (START_PLATFORM.minZ + START_PLATFORM.maxZ) / 2,
    width: RIVER_BASE.halfWidth * 2,
    depth: START_PLATFORM.maxZ - START_PLATFORM.minZ,
    topY: START_PLATFORM.topY,
  };
  for (let index = 1; index <= STAGE_PLANS.length; index += 1) {
    const stage = buildStage(index, from);
    stages.push(stage);
    from = stage.deck;
  }
  return stages;
};

export const STAGES: readonly StageDefinition[] = buildStages();

const LAST_STAGE = STAGES[STAGES.length - 1] as StageDefinition;

/** The lava river. It runs to just past the last stage's deck. */
export const RIVER = {
  ...RIVER_BASE,
  endZ: LAST_STAGE.endZ + 20,
} as const;

// ------------------------------------------------------------ the training bay

/**
 * TONGUE TRAINING, on the player's RIGHT (-X): three treadmills side by side
 * on a red carpet. Belts run along X with the console at the -X head, so a
 * trainer steps on from the hub side and faces the wall. The requirement is
 * enforced by the SERVER: a treadmill whose rebirths are not met pays nothing.
 */
export interface TreadmillDefinition {
  /** 1-based. */
  readonly index: number;
  readonly name: string;
  readonly multiplier: number;
  readonly rebirthsRequired: number;
  readonly z: number;
  readonly color: number;
}

export const TREADMILLS = {
  centerX: -50,
  beltLength: 11,
  beltWidth: 5,
  beltTopY: 0.6,
  consoleDepth: 2,
  consoleHeight: 4.6,
  /** Belt surface speed, world units per second: what walking pays. */
  beltSpeed: 16,
  carpet: { minX: -68, maxX: -30, minZ: -60, maxZ: -8 },
} as const;

export const TREADMILL_TIERS: readonly TreadmillDefinition[] = [
  { index: 1, name: 'Tongue Training x1', multiplier: 1, rebirthsRequired: 0, z: -48, color: 0x9aa3b5 },
  { index: 2, name: 'Tongue Training x2', multiplier: 2, rebirthsRequired: 3, z: -34, color: 0x3fd0ff },
  { index: 3, name: 'Tongue Training x3', multiplier: 3, rebirthsRequired: 5, z: -20, color: 0xff5fd2 },
];

export const NO_TREADMILL = 0;

export const treadmillByIndex = (index: number): TreadmillDefinition | undefined =>
  TREADMILL_TIERS.find((tier) => tier.index === index);

/** True when this many rebirths may train on this treadmill. */
export const canUseTreadmill = (index: number, rebirths: number): boolean => {
  const tier = treadmillByIndex(index);
  return tier !== undefined && Math.floor(rebirths) >= tier.rebirthsRequired;
};

/** The treadmill multiplier this many rebirths actually get on `index`: 0 when locked. */
export const treadmillMultiplier = (index: number, rebirths: number): number => {
  const tier = treadmillByIndex(index);
  if (!tier) return 0;
  return canUseTreadmill(index, rebirths) ? tier.multiplier : 0;
};

/** Which belt a position is standing on, or 0. Position alone decides. */
export const treadmillAt = (x: number, y: number, z: number): number => {
  if (y < TREADMILLS.beltTopY - 0.8 || y > TREADMILLS.beltTopY + 2) return NO_TREADMILL;
  if (Math.abs(x - TREADMILLS.centerX) > TREADMILLS.beltLength / 2) return NO_TREADMILL;
  for (const tier of TREADMILL_TIERS) {
    if (Math.abs(z - tier.z) <= TREADMILLS.beltWidth / 2) return tier.index;
  }
  return NO_TREADMILL;
};

// ------------------------------------------------------------- the tongue stage

/**
 * THE TONGUE STAGE, on the player's LEFT (+X), facing the hub.
 *
 * Two storeys: the five lower tongues on a white slab at the front, the eight
 * upper tongues on the storey behind, and a stairway at each end climbing to
 * it. Each tongue floats and turns over its own pad; walking onto the pad buys
 * it (or wears it again, once owned).
 */
export const TONGUE_STAGE = {
  front: 34,
  lowerBackX: 45,
  upperBackX: 60,
  wallBackX: 63,
  minZ: -74,
  maxZ: -6,
  lowerMinZ: -66,
  lowerMaxZ: -14,
  lowerTopY: 0.4,
  upperTopY: 4.8,
  wallTopY: 18,
  stairFromX: 36,
  stairSteps: 8,
  lowerPadX: 40,
  lowerPadSize: 5.4,
  upperPadX: 52.5,
  upperPadSize: 4.6,
} as const;

export interface TonguePad {
  readonly slot: number;
  readonly x: number;
  readonly z: number;
  readonly topY: number;
  readonly size: number;
}

const buildPads = (): TonguePad[] => {
  const pads: TonguePad[] = [];
  const lower = TONGUE_TIERS.filter((tier) => tier.tier === 0);
  const upper = TONGUE_TIERS.filter((tier) => tier.tier === 1);
  const spread = (count: number, minZ: number, maxZ: number, index: number): number =>
    minZ + ((maxZ - minZ) / count) * (index + 0.5);
  lower.forEach((tier, i) =>
    pads.push({
      slot: tier.slot,
      x: TONGUE_STAGE.lowerPadX,
      z: spread(lower.length, TONGUE_STAGE.lowerMinZ, TONGUE_STAGE.lowerMaxZ, i),
      topY: TONGUE_STAGE.lowerTopY,
      size: TONGUE_STAGE.lowerPadSize,
    }),
  );
  upper.forEach((tier, i) =>
    pads.push({
      slot: tier.slot,
      x: TONGUE_STAGE.upperPadX,
      z: spread(upper.length, TONGUE_STAGE.lowerMinZ, TONGUE_STAGE.lowerMaxZ, i),
      topY: TONGUE_STAGE.upperTopY,
      size: TONGUE_STAGE.upperPadSize,
    }),
  );
  return pads;
};

export const TONGUE_PADS: readonly TonguePad[] = buildPads();

/** The tongue pad a position stands on, or null. Position alone decides. */
export const tonguePadAt = (x: number, y: number, z: number): number | null => {
  for (const pad of TONGUE_PADS) {
    if (y < pad.topY - 0.6 || y > pad.topY + 1.5) continue;
    if (Math.abs(x - pad.x) > pad.size / 2) continue;
    if (Math.abs(z - pad.z) > pad.size / 2) continue;
    return pad.slot;
  }
  return null;
};

/** Where the three leaderboards hang on the back wall. */
export const BOARDS = {
  x: [-34, 0, 34] as const,
  z: HUB.minZ,
  y: 3,
  width: 24,
  height: 17,
} as const;

// ------------------------------------------------------------------ solids

const solids: CourseSolid[] = [];

const box = (
  kind: SolidKind,
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
  minZ: number,
  maxZ: number,
  stage = 0,
): void => {
  const landable = kind !== 'wall' && kind !== 'stageWall' && kind !== 'console';
  solids.push({ kind, minX, maxX, minY, maxY, minZ, maxZ, stage, landable });
};

// The hub floor and its walls.
box('hub', HUB.minX, HUB.maxX, HUB.floorY - HUB.floorThickness, HUB.floorY, HUB.minZ, HUB.maxZ);
box('wall', HUB.minX - 10, HUB.maxX + 10, -4, HUB.wallHeight, HUB.minZ - 8, HUB.minZ);
box('wall', HUB.maxX, HUB.maxX + 10, -4, HUB.wallHeight, HUB.minZ, HUB.maxZ + HUB_FRONT_WALL_DEPTH);
box('wall', HUB.minX - 10, HUB.minX, -4, HUB.wallHeight, HUB.minZ, HUB.maxZ + HUB_FRONT_WALL_DEPTH);
// The hub's front walls, from the river bed so the lava never shows under them.
box('wall', RIVER.halfWidth, HUB.maxX, RIVER.bedY, HUB.wallHeight, HUB.maxZ, HUB.maxZ + HUB_FRONT_WALL_DEPTH);
box('wall', HUB.minX, -RIVER.halfWidth, RIVER.bedY, HUB.wallHeight, HUB.maxZ, HUB.maxZ + HUB_FRONT_WALL_DEPTH);

// The river walls and its far end. They begin where the hub's front walls
// end, so the two never overlap.
const RIVER_WALL_FROM = HUB.maxZ + HUB_FRONT_WALL_DEPTH;
box('wall', RIVER.halfWidth, RIVER.halfWidth + RIVER.wallThickness, RIVER.bedY, RIVER.wallTopY, RIVER_WALL_FROM, RIVER.endZ + 10);
box('wall', -RIVER.halfWidth - RIVER.wallThickness, -RIVER.halfWidth, RIVER.bedY, RIVER.wallTopY, RIVER_WALL_FROM, RIVER.endZ + 10);
box('wall', -RIVER.halfWidth, RIVER.halfWidth, RIVER.bedY, RIVER.wallTopY + 6, RIVER.endZ, RIVER.endZ + 10);

// The start platform.
box('start', -RIVER.halfWidth, RIVER.halfWidth, RIVER.bedY, START_PLATFORM.topY, START_PLATFORM.minZ, START_PLATFORM.maxZ);

// The stages: islands, the deck at each end, and its win pad.
for (const stage of STAGES) {
  for (const island of stage.islands) {
    box(
      'island',
      island.x - island.width / 2,
      island.x + island.width / 2,
      RIVER.bedY,
      island.topY,
      island.z - island.depth / 2,
      island.z + island.depth / 2,
      stage.index,
    );
  }
  for (const island of stage.extras) {
    box('island', island.x - island.width / 2, island.x + island.width / 2, RIVER.bedY, island.topY, island.z - island.depth / 2, island.z + island.depth / 2, stage.index);
  }
  const deck = stage.deck;
  box('deck', deck.x - deck.width / 2, deck.x + deck.width / 2, RIVER.bedY, deck.topY, deck.z - deck.depth / 2, deck.z + deck.depth / 2, stage.index);
  const half = stage.pad.size / 2;
  box('winPad', stage.pad.x - half, stage.pad.x + half, deck.topY, stage.pad.topY, stage.pad.z - half, stage.pad.z + half, stage.index);
}

// The treadmills: belt and console.
for (const tier of TREADMILL_TIERS) {
  const half = TREADMILLS.beltWidth / 2;
  const headX = TREADMILLS.centerX - TREADMILLS.beltLength / 2;
  box('belt', headX, TREADMILLS.centerX + TREADMILLS.beltLength / 2, HUB.floorY, TREADMILLS.beltTopY, tier.z - half, tier.z + half);
  box('console', headX - TREADMILLS.consoleDepth, headX, HUB.floorY, TREADMILLS.consoleHeight, tier.z - half - 0.3, tier.z + half + 0.3);
}

// The tongue stage.
{
  const s = TONGUE_STAGE;
  box('stageBase', s.front, s.lowerBackX, HUB.floorY, s.lowerTopY, s.lowerMinZ, s.lowerMaxZ);
  box('stageUpper', s.lowerBackX, s.upperBackX, HUB.floorY, s.upperTopY, s.minZ, s.maxZ);
  box('stageWall', s.upperBackX, s.wallBackX, HUB.floorY, s.wallTopY, s.minZ, s.maxZ);
  const run = (s.lowerBackX - s.stairFromX) / s.stairSteps;
  const rise = s.upperTopY / s.stairSteps;
  for (const [minZ, maxZ] of [
    [s.minZ, s.lowerMinZ],
    [s.lowerMaxZ, s.maxZ],
  ] as const) {
    for (let i = 1; i <= s.stairSteps; i += 1) {
      // Each step its own band, so no two steps share a face (the union - and
      // so the collision - is exactly the old stacked staircase).
      box('stair', s.stairFromX + (i - 1) * run, s.stairFromX + i * run, HUB.floorY, rise * i, minZ, maxZ);
    }
  }
}

export const COURSE_SOLIDS: readonly CourseSolid[] = solids;

// ------------------------------------------------------------------ queries

/** The stage containing a Z, or null (the hub). */
export const stageAt = (z: number): StageDefinition | null =>
  STAGES.find((stage) => z >= stage.startZ && z <= stage.endZ) ?? null;

/** The stage whose win pad a position stands on, or null. */
export const winPadAt = (x: number, y: number, z: number): StageDefinition | null => {
  for (const stage of STAGES) {
    const pad = stage.pad;
    if (y < pad.topY - 0.6 || y > pad.topY + 2) continue;
    if (Math.abs(x - pad.x) > pad.size / 2) continue;
    if (Math.abs(z - pad.z) > pad.size / 2) continue;
    return stage;
  }
  return null;
};

/** True when a column is over the lava (inside the river, not on the hub). */
export const isOverLava = (x: number, z: number): boolean =>
  z >= RIVER.startZ && z <= RIVER.endZ && Math.abs(x) <= RIVER.halfWidth;

/** Half-width of the walkable corridor at a Z: the hub is wide, the river narrow. */
export const corridorHalfWidthAt = (z: number): number =>
  z < HUB.maxZ + 0.5 ? HUB.maxX - 0.8 : RIVER.halfWidth - 0.8;

export const COURSE_MIN_Z = HUB.minZ + 0.8;
export const COURSE_MAX_Z = RIVER.endZ - 0.8;
