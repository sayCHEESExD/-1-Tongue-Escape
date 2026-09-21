/**
 * Network-level constants. Must stay identical on client and server.
 */

/** Colyseus room registered by the server and joined by the client. */
export const ROOM_NAME = 'tongueescape';

/**
 * Default server port. Override with the PORT env var on the server.
 *
 * Deliberately NOT 2567: the earlier games in this series occupy 2567-2574 on
 * the same machine, and sharing a port means whichever server starts first
 * silently serves both clients.
 */
export const DEFAULT_SERVER_PORT = 2586;

/**
 * Most players in ONE room.
 *
 * The matchmaker locks a room at this figure and opens another, so a
 * sixteenth player gets a new room rather than a refusal - which is what
 * "routed, not rejected" means here.
 */
export const MAX_PLAYERS_PER_ROOM = 15;

/**
 * How many OTHER players are drawn at once.
 *
 * A RENDERING limit, not a networking one: every player in the room is
 * tracked and synchronised on every patch; only the nearest are drawn.
 */
export const VISIBLE_REMOTE_PLAYERS = 10;

/** How many of the visible remotes get FULL tongue particle effects. */
export const FULL_EFFECT_REMOTE_PLAYERS = 4;

/** Server simulation / state broadcast rate, in Hz. */
export const SERVER_TICK_RATE = 20;

/** Milliseconds between server ticks. */
export const SERVER_TICK_MS = 1000 / SERVER_TICK_RATE;

/**
 * Client->server and server->client message identifiers.
 *
 * A const object rather than an enum so it survives `verbatimModuleSyntax` and
 * erases cleanly in both build pipelines.
 */
export const MessageType = {
  /** Client -> server: one frame of INPUT. Never a transform. */
  Move: 'move',
  /** Server -> client: authoritative respawn instruction. */
  Respawn: 'respawn',
  /** Client -> server: "I think I finished a stage." A request, never a grant. */
  ClaimStage: 'claimStage',
  /** Client -> server: "put me back at the spawn". */
  RequestRespawn: 'requestRespawn',
  /** Server -> client: a stage reward was granted. Drives the celebration. */
  StageAwarded: 'stageAwarded',
  /** Client -> server: "rebirth me". Carries nothing. */
  Rebirth: 'rebirth',
  /** Client -> server: "I am standing on this tongue's pad: buy it, or wear it if owned." */
  TonguePad: 'tonguePad',
  /** Client -> server: buy the trail in this slot. */
  UnlockTrail: 'unlockTrail',
  /** Client -> server: wear an OWNED trail, or 0 to take it off. */
  EquipTrail: 'equipTrail',
  /** Server -> client: the outcome of a purchase or an equip, for feedback. */
  Notice: 'notice',
  /** Client -> server: "this is what my Bloxity avatar looks like". */
  SetAvatar: 'setAvatar',
  /** Client -> server: the player's Bloxity DISPLAY NAME and portrait. */
  SetIdentity: 'setIdentity',
  /**
   * Client -> server: the portal's game TOKEN, or null when signed out. Sent
   * whenever the login changes mid-session. Never an account id: the server
   * asks Bloxity who the token belongs to.
   */
  SetAuth: 'setAuth',
  /** Server -> client: whose progress this session is now playing on. */
  AuthState: 'authState',
} as const;

export type MessageType = (typeof MessageType)[keyof typeof MessageType];
