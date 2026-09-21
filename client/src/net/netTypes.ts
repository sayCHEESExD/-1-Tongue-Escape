import type { AvatarAppearance, AvatarProportions } from '@tongue/shared';
import type { PlayerAnimationState, PlayerMotionState } from '@tongue/shared';
import type { MapSchema } from '@colyseus/schema';

/**
 * Client-side TYPE mirror of the server's Colyseus schema.
 *
 * Types only - colyseus.js builds the concrete schema instances at runtime
 * from the handshake reflection.
 */
export interface NetPlayerState extends PlayerMotionState {
  sessionId: string;
  displayName: string;
  avatarUrl: string;
  x: number;
  y: number;
  z: number;
  rotationY: number;
  animation: PlayerAnimationState;

  level: number;
  rebirths: number;
  wins: number;
  xp: number;
  lifetimeXp: number;
  tonguePerStep: number;
  tongueLength: number;
  tongueSlot: number;
  ownedTongues: number;
  trailSlot: number;
  ownedTrails: number;
  bestStage: number;
  playSeconds: number;

  velocityX: number;
  velocityY: number;
  velocityZ: number;
  lastInputSeq: number;
  tongueLatched: boolean;
  tongueDrop: boolean;
  tongueControl: number;
  ready: boolean;

  avatar: AvatarAppearance & AvatarProportions;
}

export interface NetLeaderEntry {
  handle: string;
  name: string;
  avatarUrl: string;
  value: number;
}

export interface NetLeaderboardState {
  rebirths: ArrayLike<NetLeaderEntry>;
  wins: ArrayLike<NetLeaderEntry>;
  tongue: ArrayLike<NetLeaderEntry>;
}

export interface NetCourseState {
  players: MapSchema<NetPlayerState>;
  elapsed: number;
  leaderboard: NetLeaderboardState;
}

/** A leaderboard flattened into plain data, ready to draw. */
export interface LeaderboardSnapshot {
  rebirths: readonly NetLeaderEntry[];
  wins: readonly NetLeaderEntry[];
  tongue: readonly NetLeaderEntry[];
}

export type ConnectionStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'error';
