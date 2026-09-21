import type { TonguePhase } from '../config/tongue.js';

/** Transform-only view of a player. */
export interface PlayerTransform {
  x: number;
  y: number;
  z: number;
  /** Yaw in radians. */
  rotationY: number;
}

/**
 * Visual states the animator can be in. PRESENTATION only: gameplay authority
 * never lives here.
 */
export const PlayerAnimationState = {
  Idle: 'idle',
  Walk: 'walk',
  Tongue: 'tongue',
  Falling: 'falling',
  Dying: 'dying',
} as const;

export type PlayerAnimationState = (typeof PlayerAnimationState)[keyof typeof PlayerAnimationState];

/** The replicated motion a remote needs to animate and draw its tongue. */
export interface PlayerMotionState {
  speed: number;
  verticalVelocity: number;
  grounded: boolean;
  deathCount: number;
  treadmill: number;
  tonguePhase: TonguePhase;
  tongueTime: number;
  tongueHit: boolean;
  tongueCount: number;
  tongueSX: number;
  tongueSY: number;
  tongueSZ: number;
  tongueEX: number;
  tongueEY: number;
  tongueEZ: number;
  /** The flown 3D path: launch heading and pitch, Tongue Length at the press, segment length, (heading, pitch) per segment. */
  tongueYaw0: number;
  tonguePitch0: number;
  tongueMax: number;
  tongueSeg: number;
  tonguePath: ArrayLike<number>;
}

/** Server-authoritative progression snapshot. */
export interface PlayerProgression {
  level: number;
  rebirths: number;
  wins: number;
  /** XP toward the level curve. Decides the level. Reset by a rebirth. */
  xp: number;
  /** XP earned, ever. */
  lifetimeXp: number;
  /** XP per step off a treadmill ("Tongue per step" in the menus), from the one shared formula. */
  tonguePerStep: number;
  /** THE TONGUE LENGTH stat, in studs: a function of level only. The HUD's "Total Tongue". */
  tongueLength: number;
  tongueSlot: number;
  ownedTongues: number;
  trailSlot: number;
  ownedTrails: number;
  bestStage: number;
  playSeconds: number;
}
