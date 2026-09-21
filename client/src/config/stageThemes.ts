import { STAGE_COUNT } from '@tongue/shared';

/**
 * How each of the thirty stages is DRESSED. Presentation only: the layout and
 * the challenge are the shared course's (`STAGE_PLANS`); this decides what it
 * looks like - the island rock, the turf on top, the props scattered over it,
 * the trees on the cliffs either side - so every stage has its own identity
 * while staying in the same studded world.
 */
export type PropKind =
  | 'grass'
  | 'flower'
  | 'bush'
  | 'rock'
  | 'mushroom'
  | 'crystal'
  | 'pinwheel'
  | 'wisp'
  | 'cactus'
  | 'shell'
  | 'coral'
  | 'ice'
  | 'bamboo'
  | 'pumpkin'
  | 'lantern'
  | 'gear'
  | 'candy'
  | 'spire'
  | 'ember'
  | 'star'
  | 'neon'
  | 'ruin';

export interface StageTheme {
  /** Island sides. */
  readonly rock: number;
  /** The turf, sand, snow or crust on every island top. */
  readonly top: number;
  /** Trees on the cliffs beside this stage. */
  readonly canopy: number;
  /** The gateway crowns and glows. */
  readonly accent: number;
  /** What is scattered over the islands, most common first. */
  readonly props: readonly PropKind[];
  /** Colours the props pick from: flowers, crystals, lights. */
  readonly tints: readonly number[];
}

const T = (
  rock: number,
  top: number,
  canopy: number,
  accent: number,
  props: readonly PropKind[],
  tints: readonly number[],
): StageTheme => ({ rock, top, canopy, accent, props, tints });

export const STAGE_THEMES: readonly StageTheme[] = [
  T(0x7a6048, 0x58c83a, 0x3fae3f, 0xffd21f, ['grass', 'flower', 'bush', 'rock'], [0xff5a8a, 0xffe14d, 0xffffff]), // Meadow Falls
  T(0x8a8f9c, 0xe3cf8f, 0x3fae3f, 0x4fd8ff, ['rock', 'shell', 'grass'], [0xff9ec4, 0xfff2d6, 0x9fd8ff]), // Pebble Shoals
  T(0x6b4f3a, 0x4f9e3a, 0x2f8f3f, 0xff4d4d, ['mushroom', 'grass', 'rock'], [0xff3b3b, 0xb070ff, 0xffb21a]), // Mushroom Hollow
  T(0x8f9aa8, 0x7fd65a, 0x5bc24a, 0xffffff, ['grass', 'pinwheel', 'wisp', 'flower', 'rock'], [0xff4f9a, 0x4fd8ff, 0xffe14d, 0x7cff6a]), // Windy Isles
  T(0xc98a4a, 0xf0c870, 0x8fbf4a, 0xff8a1f, ['cactus', 'rock', 'grass'], [0xff5a8a, 0xffe14d]), // Sunset Sands
  T(0x4a4a6a, 0x7a7ab0, 0x4f9e7a, 0x4fd8ff, ['crystal', 'rock'], [0x4fd8ff, 0xff7fe0, 0xb6ff5a]), // Crystal Caverns
  T(0x9fc6e8, 0xf2f8ff, 0xeef6ff, 0x9fe8ff, ['ice', 'rock', 'bush'], [0xbfe4ff, 0xffffff]), // Frosty Floes
  T(0x5a4028, 0x2f9e2f, 0x1f8f2a, 0x7cff6a, ['bush', 'grass', 'flower', 'bamboo'], [0xff3b3b, 0xffb21a, 0xb070ff]), // Jungle Canopy
  T(0x8a6a6a, 0x9ad06a, 0xffa6d0, 0xff9ec4, ['flower', 'bush', 'grass'], [0xffb3d9, 0xff7fbf, 0xffffff]), // Cherry Blossom
  T(0x2e2e36, 0x48484f, 0x3f6f3f, 0xff6a1a, ['rock', 'ember', 'crystal'], [0xff6a1a, 0xffb21a]), // Basalt Steps
  T(0xff8fc8, 0xfff0f6, 0x7fe8c0, 0xff5fb8, ['candy', 'bush', 'star'], [0xff4f9a, 0x4fd8ff, 0xffe14d, 0x7cff6a]), // Candy Cove
  T(0xe0c89a, 0xf5e0b0, 0x4fae8a, 0xff7f7f, ['coral', 'shell', 'rock'], [0xff7f7f, 0xff9ec4, 0xffb21a, 0xb070ff]), // Coral Reef
  T(0x7a5030, 0xd88a2a, 0xe06a1a, 0xff8a1f, ['pumpkin', 'bush', 'grass', 'rock'], [0xff8a1f, 0xd8401a, 0xffd21f]), // Autumn Grove
  T(0x3a4a2a, 0x6aa03a, 0x6a3a8a, 0x9dff3a, ['mushroom', 'grass', 'ember'], [0x9dff3a, 0xb070ff, 0x6aff9a]), // Toxic Swamp
  T(0x6a7a4a, 0x9ad06a, 0x5aae3a, 0xb6ff5a, ['bamboo', 'grass', 'rock'], [0x7cc83a, 0xb6ff5a]), // Bamboo Heights
  T(0xc9a84a, 0xe8d08a, 0x8fbf4a, 0xffd21f, ['ruin', 'rock', 'grass'], [0xffd21f, 0xffffff]), // Golden Ruins
  T(0x7fb0d8, 0xe8f4ff, 0xeef6ff, 0xbfe4ff, ['ice', 'crystal', 'rock'], [0xbfe4ff, 0xffffff, 0x9fe8ff]), // Glacier Pass
  T(0xb8583d, 0xd98a5a, 0x8fbf4a, 0xff8a1f, ['cactus', 'rock', 'grass'], [0xff5a8a, 0xffe14d]), // Canyon Run
  T(0x5a6078, 0xc8ccd8, 0x6a7ab0, 0xdfe8ff, ['crystal', 'rock', 'star'], [0xdfe8ff, 0x9fb4ff, 0xffffff]), // Moonstone
  T(0x1e1a24, 0x3a2a3a, 0x4a2a2a, 0xff5a1a, ['ember', 'spire', 'rock'], [0xff5a1a, 0xffb21a]), // Obsidian Forge
  T(0x4a2a6a, 0x8a5ac8, 0xb58aff, 0xd070ff, ['spire', 'crystal', 'rock'], [0xd070ff, 0xff7fe0, 0x9f6aff]), // Amethyst Spires
  T(0x1a1a3a, 0x2a2a5a, 0x2a4a8a, 0x3fffe0, ['neon', 'gear', 'lantern'], [0x3fffe0, 0xff3df2, 0x4fd8ff]), // Neon Grid
  T(0x5a2a1a, 0x8a3a1a, 0x6a3a1a, 0xff4a12, ['ember', 'rock', 'spire'], [0xff4a12, 0xffd23a]), // Ember Wastes
  T(0xa0b8d8, 0x8ad86a, 0x6fd86a, 0xffe14d, ['flower', 'bush', 'pinwheel', 'grass'], [0xff4f9a, 0xffe14d, 0x4fd8ff, 0xffffff]), // Sky Garden
  T(0x4a5068, 0x6a7088, 0x3f5f6f, 0xfff06a, ['wisp', 'rock', 'lantern', 'neon'], [0xfff06a, 0x9fd8ff]), // Storm Front
  T(0x7a4a2a, 0x9a6a3a, 0x6a6a3a, 0xffb21a, ['gear', 'rock', 'lantern'], [0xffb21a, 0xb87333]), // Rusty Gears
  T(0x2a1a4a, 0x5a3a8a, 0x7a4ac8, 0xff8af0, ['star', 'crystal', 'wisp'], [0xff8af0, 0x9fb4ff, 0xffffff]), // Nebula Drift
  T(0xd0d8e8, 0xffffff, 0xbfd8ff, 0xff3df2, ['crystal', 'spire', 'star'], [0xff3b3b, 0xffd21f, 0x3fdc4a, 0x3fa9ff, 0xb04dff]), // Prism Peaks
  T(0x120a1a, 0x2a1a3a, 0x2a1a3a, 0xa640ff, ['spire', 'crystal', 'ember'], [0xa640ff, 0x6a2aff]), // Void Rim
  T(0xf2f2ff, 0xffffff, 0xff9ec4, 0xff3df2, ['flower', 'star', 'crystal', 'candy'], [0xff3b3b, 0xffd21f, 0x3fdc4a, 0x3fa9ff, 0xb04dff]), // Rainbow Summit
];

/** The rainbow the finale's island tops cycle through. */
export const RAINBOW: readonly number[] = [0xff5a5a, 0xffa62b, 0xffe14d, 0x5ed64f, 0x3fa9ff, 0x9b6bff];

export const themeFor = (stage: number): StageTheme =>
  STAGE_THEMES[Math.min(Math.max(stage, 1), STAGE_COUNT) - 1] as StageTheme;
