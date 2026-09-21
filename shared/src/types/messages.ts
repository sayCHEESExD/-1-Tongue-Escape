import type { AvatarAppearance, AvatarProportions } from './avatar.js';

/**
 * Client -> server input (MessageType.Move).
 *
 * INPUT ONLY. No position, velocity or target: the server simulates movement
 * and every throw from intent and owns the result.
 */
export interface MoveMessage {
  /** Monotonically increasing input sequence number. */
  seq: number;
  /** Seconds this input covers. Clamped and rate-limited server-side. */
  dt: number;
  /** -1..1, camera-relative. */
  moveX: number;
  /** -1..1, camera-relative. */
  moveZ: number;
  /** The tongue control, held. Only a fresh PRESS throws. */
  tongue: boolean;
  /** Yaw the camera faced: movement is camera-relative and a throw aims along it. */
  cameraYaw: number;
}

/** Why a player was placed. */
export type RespawnReason = 'fell' | 'manual' | 'join' | 'stage' | 'rebirth';

/** Server -> client authoritative placement (MessageType.Respawn). */
export interface RespawnMessage {
  x: number;
  y: number;
  z: number;
  rotationY: number;
  reason: RespawnReason;
}

/** Client -> server: "I reached this stage's win pad." A request, never a grant. */
export interface ClaimStageMessage {
  stageIndex: number;
}

/** Server -> client: a stage reward landed. Presentation only. */
export interface StageAwardedMessage {
  stageIndex: number;
  wins: number;
  total: number;
}

/** Client -> server: "I am on this tongue's pad." */
export interface TonguePadMessage {
  slot: number;
}

/** Client -> server: buy or wear a trail by slot. */
export interface SlotMessage {
  slot: number;
}

/** Server -> client: what happened to a purchase or equip, so the UI can say so. */
export interface NoticeMessage {
  kind: 'bought' | 'equipped' | 'refused' | 'rebirth' | 'locked';
  text: string;
}

export interface SetAvatarMessage {
  appearance: AvatarAppearance;
  proportions: AvatarProportions;
}

export interface SetIdentityMessage {
  displayName: string;
  avatarUrl: string;
}

/** Client -> server: the portal's game TOKEN, or null when signed out. */
export interface SetAuthMessage {
  token: string | null;
}

export type AuthStatus = 'account' | 'guest' | 'unavailable';

export interface AuthStateMessage {
  status: AuthStatus;
  note?: string;
}
