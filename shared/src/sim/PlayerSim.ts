import { treadmillAt } from '../config/course.js';
import { MOVEMENT } from '../config/movement.js';
import {
  TONGUE,
  TonguePhase,
  createLaidTonguePath,
  layTonguePath,
  sampleTonguePath,
  steerTongueHeading,
  tongueExtendSpeed,
  tongueGlideSeconds,
  tongueGlideU,
  tongueSegmentsFor,
  type TonguePathState,
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
 * WALKING, and the TONGUE throw (windup, a STEERED deploy, the glide). There is no jump.
 */

/** Everything that makes up a player's physical state. */
export interface PlayerMotion extends TonguePathState {
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
  /** The steered path laid so far: one heading per segment. */
  tongueHeadings: number[];
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
  tongueYaw0: 0,
  tongueMax: 0,
  tongueSeg: 0,
  tongueHeadings: [],
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
  to.tongueYaw0 = from.tongueYaw0;
  to.tongueMax = from.tongueMax;
  to.tongueSeg = from.tongueSeg;
  to.tongueHeadings.length = 0;
  for (const heading of from.tongueHeadings) to.tongueHeadings.push(heading);
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
  motion.tongueHeadings.length = 0;
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
const TIP = { x: 0, z: 0 };
const LAID = createLaidTonguePath();

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

  // A throw in progress owns the body until it lands. While it deploys, the
  // movement controls STEER THE TONGUE instead of walking the body.
  if (motion.tonguePhase !== TonguePhase.None) {
    advanceTongue(motion, input, collision, dt, events);
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

/**
 * Start a throw: the windup. The path starts at the feet, heading the way the
 * camera faces. False (no throw) only when the very first stretch is blocked
 * by a wall and is not a platform - there is no room to throw at all.
 */
const beginThrow = (
  motion: PlayerMotion,
  input: MovementInput,
  params: SimParams,
  collision: WorldCollision,
): boolean => {
  const length = Number.isFinite(params.length) && params.length > 0 ? params.length : TONGUE.baseLength;
  const { seg } = tongueSegmentsFor(length);
  const yaw = input.cameraYaw;
  const fx = motion.x + Math.sin(yaw) * seg;
  const fz = motion.z + Math.cos(yaw) * seg;
  const firstFree =
    collision.inBounds(fx, fz) &&
    (!collision.bodyBlocked(fx, motion.y, fz) ||
      collision.tongueCandidate(fx, fz, motion.x, motion.y, motion.z, length, TARGET));
  if (!firstFree) return false;

  motion.sx = motion.x;
  motion.sy = motion.y;
  motion.sz = motion.z;
  motion.ex = motion.x;
  motion.ey = motion.y;
  motion.ez = motion.z;
  motion.tongueHit = false;
  motion.tongueYaw0 = yaw;
  motion.tongueMax = length;
  motion.tongueSeg = seg;
  motion.tongueHeadings.length = 0;
  motion.tonguePhase = TonguePhase.Windup;
  motion.tongueTime = 0;
  motion.tongueCount += 1;
  motion.vx = 0;
  motion.vy = 0;
  motion.vz = 0;
  motion.yaw = yaw;
  return true;
};

/** The laid point `index` of the path (0 = the start), into `out`. */
const pathPoint = (motion: PlayerMotion, index: number, out: { x: number; z: number }): void => {
  out.x = motion.sx;
  out.z = motion.sz;
  for (let i = 0; i < index; i += 1) {
    const h = motion.tongueHeadings[i] as number;
    out.x += Math.sin(h) * motion.tongueSeg;
    out.z += Math.cos(h) * motion.tongueSeg;
  }
};

/**
 * FREEZE THE PATH at its current tip. The tongue sticks when the tip is over a
 * platform, and otherwise ends in the air at the height it left from; the
 * ride begins.
 */
const lockPath = (motion: PlayerMotion, collision: WorldCollision, events: SimEvents): void => {
  const n = motion.tongueHeadings.length;
  if (n === 0) {
    // Nothing was laid: there is no path to ride.
    motion.tonguePhase = TonguePhase.None;
    motion.tongueTime = 0;
    return;
  }
  pathPoint(motion, n, TIP);
  const along = n * motion.tongueSeg;
  if (along >= TONGUE.stickMinDistance && collision.tongueCandidate(TIP.x, TIP.z, motion.sx, motion.sy, motion.sz, motion.tongueMax, TARGET)) {
    motion.ex = TARGET.x;
    motion.ey = TARGET.y;
    motion.ez = TARGET.z;
    motion.tongueHit = true;
  } else {
    motion.ex = TIP.x;
    motion.ey = motion.sy;
    motion.ez = TIP.z;
    motion.tongueHit = false;
  }
  motion.tonguePhase = TonguePhase.Glide;
  motion.tongueTime = 0;
  motion.grounded = false;
  events.tongueAttached = true;
};

/**
 * DEPLOY: lay the path one segment at a time, each turned toward what the
 * player holds. Stops - and freezes - when the path leaves a platform it had
 * reached (sticking to that platform), when the next segment would run into a
 * wall or out of the world, or when the Tongue Length is used up.
 */
const extendTongue = (
  motion: PlayerMotion,
  input: MovementInput,
  collision: WorldCollision,
  events: SimEvents,
): void => {
  const { count } = tongueSegmentsFor(motion.tongueMax);
  const reached = motion.tongueTime * tongueExtendSpeed(motion.tongueMax);
  while (motion.tongueHeadings.length < count && (motion.tongueHeadings.length + 1) * motion.tongueSeg <= reached + 1e-9) {
    const n = motion.tongueHeadings.length;
    const heading = steerTongueHeading(
      n === 0 ? motion.tongueYaw0 : (motion.tongueHeadings[n - 1] as number),
      input.moveX,
      input.moveZ,
      input.cameraYaw,
      motion.tongueSeg,
    );
    pathPoint(motion, n, TIP);
    const px = TIP.x + Math.sin(heading) * motion.tongueSeg;
    const pz = TIP.z + Math.cos(heading) * motion.tongueSeg;
    const along = (n + 1) * motion.tongueSeg;
    const onPlatform =
      along >= TONGUE.stickMinDistance &&
      collision.tongueCandidate(px, pz, motion.sx, motion.sy, motion.sz, motion.tongueMax, TARGET);
    const wasOnPlatform =
      n * motion.tongueSeg >= TONGUE.stickMinDistance &&
      collision.tongueCandidate(TIP.x, TIP.z, motion.sx, motion.sy, motion.sz, motion.tongueMax, TARGET);
    const blocked = !collision.inBounds(px, pz) || (!onPlatform && collision.bodyBlocked(px, motion.sy, pz));
    // Leaving a platform it had reached, or about to hit a wall: freeze here.
    if (blocked || (wasOnPlatform && !onPlatform)) {
      lockPath(motion, collision, events);
      return;
    }
    motion.tongueHeadings.push(heading);
  }
  if (motion.tongueHeadings.length >= count) lockPath(motion, collision, events);
};

/** Windup, deploy (steered), glide along the frozen path. */
const advanceTongue = (
  motion: PlayerMotion,
  input: MovementInput,
  collision: WorldCollision,
  dt: number,
  events: SimEvents,
): void => {
  motion.tongueTime += dt;

  if (motion.tonguePhase === TonguePhase.Windup) {
    if (motion.tongueTime < TONGUE.windup) return;
    motion.tongueTime -= TONGUE.windup;
    motion.tonguePhase = TonguePhase.Extend;
  }

  if (motion.tonguePhase === TonguePhase.Extend) {
    extendTongue(motion, input, collision, events);
    // The ride starts on the next step, from the frozen path.
    return;
  }

  if (motion.tonguePhase !== TonguePhase.Glide) return;

  layTonguePath(motion, 0, true, LAID);
  const glide = tongueGlideSeconds(LAID.length);
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

  // Ride the exact curve the player laid.
  sampleTonguePath(LAID, tongueGlideU(motion.tongueTime / glide) * LAID.length, motion.sy, motion.ey, POINT);
  motion.x = POINT.x;
  motion.y = POINT.y;
  motion.z = POINT.z;
  motion.vx = (POINT.x - px) / dt;
  motion.vy = (POINT.y - py) / dt;
  motion.vz = (POINT.z - pz) / dt;
  if (Math.hypot(motion.vx, motion.vz) > 0.01) motion.yaw = Math.atan2(motion.vx, motion.vz);
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
