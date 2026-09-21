import { treadmillAt } from '../config/course.js';
import { MOVEMENT } from '../config/movement.js';
import {
  TONGUE,
  TonguePhase,
  tongueDistance,
  tongueExtendSeconds,
  tongueGlideSeconds,
  tongueGlideU,
  tonguePointAt,
  type TongueArc,
} from '../config/tongue.js';
import { PLAYER_HEIGHT, SPAWN_POSITION, SPAWN_ROTATION_Y } from '../constants/world.js';
import { rotateTowards } from '../types/math.js';
import type { TongueTarget, WorldCollision } from './WorldCollision.js';

/**
 * THE movement simulation, shared by the server and by client prediction.
 *
 * The server runs it to own the result and the client runs the identical
 * function to predict ahead of the network, so the two can only disagree
 * through inputs, never through maths. Two ways to move and no others:
 * WALKING, and the TONGUE throw (windup, extend, glide). There is no jump.
 */

/** Everything that makes up a player's physical state. */
export interface PlayerMotion extends TongueArc {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  yaw: number;
  grounded: boolean;
  /** Treadmill the player is standing on, or 0. Derived from position. */
  treadmill: number;
  /** The throw in progress, or `TonguePhase.None`. */
  tonguePhase: TonguePhase;
  /** Seconds into the current phase. */
  tongueTime: number;
  /** True when the throw attached to a platform; false when it ended in the air at full length. */
  tongueHit: boolean;
  /** Edge-detect for the tongue control, so a hold is one throw. */
  tongueLatched: boolean;
  /** Monotonic count of throws, so a remote can mirror them. */
  tongueCount: number;
}

/** One frame of player intent. Carries no position - only what was pressed. */
export interface MovementInput {
  moveX: number;
  moveZ: number;
  /** The tongue control (click, jump key, TONGUE button), held. */
  tongue: boolean;
  cameraYaw: number;
}

/** Server-owned tuning the step reads but never changes. */
export interface SimParams {
  /** The authoritative TONGUE LENGTH stat, from the player's level. Never from XP. */
  length: number;
}

/** Edges this step produced, consumed by the animator, the effects and the sound. */
export interface SimEvents {
  /** A throw began (the windup). */
  tongueThrown: boolean;
  /** The tongue attached and the ride began. */
  tongueAttached: boolean;
  /** The ride ended at the endpoint. */
  tongueArrived: boolean;
  landed: boolean;
}

/** Largest single step the simulation will take, in seconds. */
export const MAX_SIM_DELTA = 0.1;

export const createMotion = (): PlayerMotion => ({
  x: SPAWN_POSITION.x,
  y: SPAWN_POSITION.y,
  z: SPAWN_POSITION.z,
  vx: 0,
  vy: 0,
  vz: 0,
  yaw: SPAWN_ROTATION_Y,
  grounded: true,
  treadmill: 0,
  tonguePhase: TonguePhase.None,
  tongueTime: 0,
  tongueHit: false,
  tongueLatched: false,
  tongueCount: 0,
  sx: 0,
  sy: 0,
  sz: 0,
  ex: 0,
  ey: 0,
  ez: 0,
});

export const createSimEvents = (): SimEvents => ({
  tongueThrown: false,
  tongueAttached: false,
  tongueArrived: false,
  landed: false,
});

export const createMovementInput = (): MovementInput => ({ moveX: 0, moveZ: 0, tongue: false, cameraYaw: 0 });

export const copyMotion = (from: PlayerMotion, to: PlayerMotion): void => {
  to.x = from.x;
  to.y = from.y;
  to.z = from.z;
  to.vx = from.vx;
  to.vy = from.vy;
  to.vz = from.vz;
  to.yaw = from.yaw;
  to.grounded = from.grounded;
  to.treadmill = from.treadmill;
  to.tonguePhase = from.tonguePhase;
  to.tongueTime = from.tongueTime;
  to.tongueHit = from.tongueHit;
  to.tongueLatched = from.tongueLatched;
  to.tongueCount = from.tongueCount;
  to.sx = from.sx;
  to.sy = from.sy;
  to.sz = from.sz;
  to.ex = from.ex;
  to.ey = from.ey;
  to.ez = from.ez;
};

/** Reset to a spawn transform. Cancels any throw. */
export const resetMotion = (
  motion: PlayerMotion,
  x = SPAWN_POSITION.x,
  y = SPAWN_POSITION.y,
  z = SPAWN_POSITION.z,
  yaw = SPAWN_ROTATION_Y,
): void => {
  motion.x = x;
  motion.y = y;
  motion.z = z;
  motion.vx = 0;
  motion.vy = 0;
  motion.vz = 0;
  motion.yaw = yaw;
  motion.grounded = true;
  motion.treadmill = 0;
  motion.tonguePhase = TonguePhase.None;
  motion.tongueTime = 0;
  motion.tongueHit = false;
  motion.tongueLatched = false;
};

export const horizontalSpeed = (motion: PlayerMotion): number => Math.hypot(motion.vx, motion.vz);

/** Sanitise one input before it is simulated. Applied on the SERVER. */
export const sanitiseInput = (input: Partial<MovementInput> | undefined): MovementInput => {
  const finite = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) ? value : 0);
  let moveX = finite(input?.moveX);
  let moveZ = finite(input?.moveZ);
  const magnitude = Math.hypot(moveX, moveZ);
  if (magnitude > 1) {
    moveX /= magnitude;
    moveZ /= magnitude;
  }
  return { moveX, moveZ, tongue: input?.tongue === true, cameraYaw: finite(input?.cameraYaw) };
};

const BOUNDS = { x: 0, z: 0 };
const TARGET: TongueTarget = { x: 0, y: 0, z: 0, hit: false };
const POINT = { x: 0, y: 0, z: 0 };

/**
 * Advance one player by one step.
 *
 * @param motion    mutated in place
 * @param input     already sanitised intent
 * @param params    server-owned tuning
 * @param delta     seconds; clamped internally to [0, MAX_SIM_DELTA]
 * @param collision the course the player moves through
 * @param events    mutated in place with the edges this step produced
 */
export const stepPlayer = (
  motion: PlayerMotion,
  input: MovementInput,
  params: SimParams,
  delta: number,
  collision: WorldCollision,
  events: SimEvents,
): void => {
  events.tongueThrown = false;
  events.tongueAttached = false;
  events.tongueArrived = false;
  events.landed = false;

  const dt = Number.isFinite(delta) ? Math.min(Math.max(delta, 0), MAX_SIM_DELTA) : 0;
  if (dt === 0) return;

  const pressed = input.tongue && !motion.tongueLatched;
  motion.tongueLatched = input.tongue;

  // A throw in progress owns the body until it lands.
  if (motion.tonguePhase !== TonguePhase.None) {
    advanceTongue(motion, dt, events);
    motion.treadmill = 0;
    return;
  }

  if (pressed && motion.grounded && beginThrow(motion, input, params, collision)) {
    events.tongueThrown = true;
    motion.treadmill = 0;
    return;
  }

  const wasGrounded = motion.grounded;
  applyHorizontal(motion, input, dt);
  motion.vy -= MOVEMENT.gravity * dt;

  const travel = Math.hypot(motion.vx, motion.vy, motion.vz) * dt;
  const substeps = Math.max(1, Math.min(Math.ceil(travel / MOVEMENT.maxSubstepDistance), MOVEMENT.maxSubsteps));
  const sub = dt / substeps;
  for (let i = 0; i < substeps; i += 1) integrate(motion, sub, collision);

  motion.treadmill = motion.grounded ? treadmillAt(motion.x, motion.y, motion.z) : 0;
  if (!wasGrounded && motion.grounded) events.landed = true;
};

/** Find the target and start the windup. False when there is nothing to throw at. */
const beginThrow = (
  motion: PlayerMotion,
  input: MovementInput,
  params: SimParams,
  collision: WorldCollision,
): boolean => {
  const length = Number.isFinite(params.length) && params.length > 0 ? params.length : TONGUE.baseLength;
  if (!collision.findTongueTarget(motion.x, motion.y, motion.z, input.cameraYaw, length, TARGET)) return false;
  motion.sx = motion.x;
  motion.sy = motion.y;
  motion.sz = motion.z;
  motion.ex = TARGET.x;
  motion.ey = TARGET.y;
  motion.ez = TARGET.z;
  motion.tongueHit = TARGET.hit;
  motion.tonguePhase = TonguePhase.Windup;
  motion.tongueTime = 0;
  motion.tongueCount += 1;
  motion.vx = 0;
  motion.vy = 0;
  motion.vz = 0;
  motion.yaw = Math.atan2(TARGET.x - motion.x, TARGET.z - motion.z);
  return true;
};

/** Windup, extend, glide: rooted for the first two, riding the curve for the third. */
const advanceTongue = (motion: PlayerMotion, dt: number, events: SimEvents): void => {
  motion.tongueTime += dt;
  const distance = tongueDistance(motion);

  if (motion.tonguePhase === TonguePhase.Windup) {
    if (motion.tongueTime < TONGUE.windup) return;
    motion.tongueTime -= TONGUE.windup;
    motion.tonguePhase = TonguePhase.Extend;
  }

  if (motion.tonguePhase === TonguePhase.Extend) {
    const extend = tongueExtendSeconds(distance);
    if (motion.tongueTime < extend) return;
    motion.tongueTime -= extend;
    motion.tonguePhase = TonguePhase.Glide;
    motion.grounded = false;
    events.tongueAttached = true;
  }

  const glide = tongueGlideSeconds(distance);
  const px = motion.x;
  const py = motion.y;
  const pz = motion.z;

  if (motion.tongueTime >= glide) {
    motion.x = motion.ex;
    motion.y = motion.ey;
    motion.z = motion.ez;
    if (motion.tongueHit) {
      motion.vx = 0;
      motion.vz = 0;
      motion.vy = 0;
    } else {
      // The tongue ran out in the air: keep a little of the ride and drop.
      const carry = TONGUE.missCarry;
      const speed = Math.hypot(motion.vx, motion.vz) * carry;
      const scale = speed > MOVEMENT.moveSpeed ? MOVEMENT.moveSpeed / speed : 1;
      motion.vx *= carry * scale;
      motion.vz *= carry * scale;
      motion.vy = Math.min(0, motion.vy) * carry;
    }
    motion.grounded = motion.tongueHit;
    motion.tonguePhase = TonguePhase.None;
    motion.tongueTime = 0;
    events.tongueArrived = true;
    if (motion.tongueHit) events.landed = true;
    return;
  }

  tonguePointAt(motion, tongueGlideU(motion.tongueTime / glide), POINT);
  motion.x = POINT.x;
  motion.y = POINT.y;
  motion.z = POINT.z;
  motion.vx = (POINT.x - px) / dt;
  motion.vy = (POINT.y - py) / dt;
  motion.vz = (POINT.z - pz) / dt;
  motion.grounded = false;
};

const integrate = (motion: PlayerMotion, dt: number, collision: WorldCollision): void => {
  const previousY = motion.y;

  motion.x += motion.vx * dt;
  const correctedX = collision.resolveAxis(0, motion.x, motion.z, motion.y);
  if (correctedX !== motion.x) {
    motion.x = correctedX;
    motion.vx = 0;
  }

  motion.z += motion.vz * dt;
  const correctedZ = collision.resolveAxis(2, motion.z, motion.x, motion.y);
  if (correctedZ !== motion.z) {
    motion.z = correctedZ;
    motion.vz = 0;
  }

  motion.y += motion.vy * dt;

  collision.clampToBounds(motion.x, motion.z, BOUNDS);
  motion.x = BOUNDS.x;
  motion.z = BOUNDS.z;

  resolveCeiling(motion, previousY, collision);
  resolveGround(motion, previousY, collision);
};

const applyHorizontal = (motion: PlayerMotion, input: MovementInput, dt: number): void => {
  const hasInput = input.moveX !== 0 || input.moveZ !== 0;
  // The camera looks along (sin, cos); its RIGHT is (-cos, sin).
  const sin = Math.sin(input.cameraYaw);
  const cos = Math.cos(input.cameraYaw);
  const dirX = input.moveZ * sin - input.moveX * cos;
  const dirZ = input.moveZ * cos + input.moveX * sin;
  const target = MOVEMENT.moveSpeed;
  const control = motion.grounded ? 1 : MOVEMENT.airControl;

  if (hasInput) {
    const rate = Math.min((MOVEMENT.acceleration * control * dt) / target, 1);
    motion.vx += (dirX * target - motion.vx) * rate;
    motion.vz += (dirZ * target - motion.vz) * rate;
    motion.yaw = rotateTowards(motion.yaw, Math.atan2(dirX, dirZ), MOVEMENT.turnSpeed * dt);
  } else if (motion.grounded) {
    const drop = MOVEMENT.deceleration * dt;
    const speed = horizontalSpeed(motion);
    if (speed <= drop || speed < 1e-6) {
      motion.vx = 0;
      motion.vz = 0;
    } else {
      const scale = (speed - drop) / speed;
      motion.vx *= scale;
      motion.vz *= scale;
    }
  }
};

const resolveCeiling = (motion: PlayerMotion, previousY: number, collision: WorldCollision): void => {
  if (motion.vy <= 0) return;
  const ceiling = collision.ceilingYAt(motion.x, motion.z, previousY + PLAYER_HEIGHT);
  if (ceiling === null || motion.y + PLAYER_HEIGHT <= ceiling) return;
  motion.y = ceiling - PLAYER_HEIGHT;
  motion.vy = 0;
};

const resolveGround = (motion: PlayerMotion, previousY: number, collision: WorldCollision): void => {
  const surfaceY = collision.surfaceYAt(motion.x, motion.z, previousY);
  if (surfaceY === null || motion.vy > 0 || motion.y > surfaceY) {
    motion.grounded = false;
    return;
  }
  if (!collision.canLandOn(previousY, surfaceY)) {
    motion.grounded = false;
    return;
  }
  motion.y = surfaceY;
  motion.vy = 0;
  motion.grounded = true;
};
