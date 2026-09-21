import { ArraySchema, Schema, type } from '@colyseus/schema';
import { AvatarState } from './AvatarState.js';
import {
  PlayerAnimationState,
  SPAWN_POSITION,
  SPAWN_ROTATION_Y,
  STARTING_XP,
  TONGUE,
  TonguePhase,
  type PlayerAnimationState as AnimationState,
} from '@tongue/shared';

/**
 * Replicated per-player state.
 *
 * Every field is written by the SERVER: transform and motion by the
 * authoritative simulation, progression and inventories by their own
 * service. Nothing is ever copied from a client message.
 */
export class PlayerState extends Schema {
  @type('string') sessionId = '';

  @type('float32') x: number = SPAWN_POSITION.x;
  @type('float32') y: number = SPAWN_POSITION.y;
  @type('float32') z: number = SPAWN_POSITION.z;
  @type('float32') rotationY: number = SPAWN_ROTATION_Y;

  @type('float32') speed = 0;
  @type('float32') verticalVelocity = 0;
  @type('boolean') grounded = true;

  /** Authoritative velocity, for client reconciliation. */
  @type('float32') velocityX = 0;
  @type('float32') velocityY = 0;
  @type('float32') velocityZ = 0;
  @type('uint32') lastInputSeq = 0;

  /**
   * THE THROW IN PROGRESS. Replicated so the client can reconcile its
   * prediction against the server's throw, and so every remote can draw the
   * tongue and ride the same curve.
   */
  @type('uint8') tonguePhase: number = TonguePhase.None;
  @type('float32') tongueTime = 0;
  @type('boolean') tongueHit = false;
  @type('boolean') tongueLatched = false;
  @type('boolean') tongueDrop = false;
  @type('uint8') tongueControl = 0;
  @type('uint32') tongueCount = 0;
  @type('float32') tongueSX = 0;
  @type('float32') tongueSY = 0;
  @type('float32') tongueSZ = 0;
  @type('float32') tongueEX = 0;
  @type('float32') tongueEY = 0;
  @type('float32') tongueEZ = 0;
  /**
   * THE FLOWN 3D PATH the player is laying (or has laid): its launch heading and
   * pitch, the Tongue Length it was thrown with, its segment length, and a
   * (heading, pitch) pair per segment. It only grows during a throw, so a patch
   * carries just the new segments.
   */
  @type('float32') tongueYaw0 = 0;
  @type('float32') tonguePitch0 = 0;
  @type('float32') tongueMax = 0;
  @type('float32') tongueSeg = 0;
  @type(['float32']) tonguePath = new ArraySchema<number>();

  @type('uint32') deathCount = 0;
  /** Treadmill the player is standing on, or 0. Derived by the simulation. */
  @type('uint8') treadmill = 0;

  @type('string') animation: AnimationState = PlayerAnimationState.Idle;

  @type(AvatarState) avatar = new AvatarState();

  @type('string') displayName = '';
  @type('string') avatarUrl = '';

  /** Server-authoritative progression. */
  @type('uint32') level = 1;
  @type('uint32') rebirths = 0;
  /** Written through `Wallet` only. */
  @type('float64') wins = 0;
  /** XP toward the level curve. Written by TongueService and RebirthService. */
  @type('float64') xp = STARTING_XP;
  /** XP earned, ever. Never reset. */
  @type('float64') lifetimeXp = STARTING_XP;
  /** XP per step off a treadmill ("Tongue per step"), from the one shared formula. */
  @type('float64') tonguePerStep = 1;
  /**
   * THE TONGUE LENGTH stat, in studs: derived from LEVEL only, so it changes
   * on a level-up and at no other time. The simulation throws with it.
   */
  @type('float32') tongueLength: number = TONGUE.baseLength;

  /** The worn tongue (0 = default) and the owned stage tongues. TongueShopService only. */
  @type('uint8') tongueSlot = 0;
  @type('uint16') ownedTongues = 0;

  /** Trails. TrailService only. */
  @type('uint8') trailSlot = 0;
  @type('uint8') ownedTrails = 0;

  @type('uint32') bestStage = 0;
  @type('float64') playSeconds = 0;

  /** True once the server has simulated at least one input for this player. */
  @type('boolean') ready = false;
}
