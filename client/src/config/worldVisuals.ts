/**
 * THE PALETTE: a bright, blocky, studded toy world - grey-blue stud plates for
 * the hub, dark blue studded walls, a red carpet with a yellow stripe, white
 * display stages, red-brown dirt cliffs with grass on top, and a river of
 * glowing orange lava.
 *
 * COLOUR ONLY. Every coordinate lives in `@tongue/shared`'s course config.
 */
export const PALETTE = {
  /** The hub: grey-blue stud plates. */
  hub: '#9aa1b6',
  hubDark: '#80879e',
  hubLight: '#b3b9cb',

  /** The hub's big walls and the background blocks. */
  wall: '#3d4c86',
  wallDark: '#2e3a6a',
  wallLight: '#5363a3',

  /** Islands and decks: dark checkered stone plates. */
  island: '#666a78',
  islandAlt: '#575b68',
  islandSide: '#6e7282',
  deck: '#4c505c',
  deckAlt: '#3f424d',
  start: '#8d92a3',

  /** The river cliffs: red-brown dirt with a grass cap. */
  dirt: '#b8583d',
  dirtDark: '#94432d',
  grass: 0x42b638,
  grassDark: 0x2f8f2a,

  /** THE LAVA. */
  lava: '#ff8a1c',
  lavaHot: '#ffd23a',
  lavaCrust: '#c9420c',

  /** The red carpet and its stripe. */
  carpet: 0xe0312f,
  carpetStripe: 0xffd400,

  /** The tongue stage: white-lavender studded plates. */
  stage: '#e9e7f4',
  stageDark: '#cfcce0',
  padIdle: 0x1b1c24,
  padReady: 0x39e64a,
  padOwned: 0xf0c040,
  padWorn: 0x7fe6ff,

  /** Treadmills. */
  treadmillFrame: 0x2c3448,
  treadmillBelt: '#2a2e38',
  treadmillMark: '#e8ecf5',

  /** Win pads, by stage. */
  winPad: [0xffe600, 0x27d6ff] as readonly number[],

  /** Boards: dark slate in a blue frame. */
  boardFrame: 0x3f7cff,
  boardFrameDark: 0x2446a8,
  boardPanel: '#152036',
  boardPanelEdge: '#2b3b5c',
  boardStripe: 'rgba(255, 224, 138, 0.06)',
  boardInk: '#050912',
  boardHeading: '#ffe08a',
  boardName: '#ffffff',
  boardValue: '#7fe6ff',

  /** Sky and fog. */
  skyTop: 0x3d8fe0,
  sky: 0x8cc8ff,
  fog: 0xcfe4ff,
  skyCloud: 0xffffff,
  skyCloudShade: 0xd6e6f7,

  /** Trees. */
  trunk: 0x7a4a2a,
  canopy: 0x3fae3f,
  canopyShade: 0x2f8f2f,
} as const;

/** Fog band. */
export const WORLD_FOG = {
  near: 220,
  far: 820,
} as const;

/** Yaw correction for the supplied player FBX. It already faces +Z. */
export const PLAYER_MODEL_YAW_OFFSET = 0;
