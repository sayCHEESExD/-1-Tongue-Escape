import { treadmillAt } from '../config/course.js';
import { MOVEMENT } from '../config/movement.js';
import {
  TONGUE,
  TonguePhase,
  createLaidTonguePath,
  layTonguePath,
  sampleTonguePath,
  steerTongue,
  tongueArchY,
  tongueArcPointAt,
  tongueDirection,
  tongueExtendSpeed,
  tongueGlideSeconds,
  tongueGlideU,
  tongueSegmentsFor,
  type TonguePathState,
} from '../config/tongue.js';
import { PLAYER_HEIGHT, PLAYER_RADIUS, SPAWN_POSITION, SPAWN_ROTATION_Y } from '../constants/world.js';
import { rotateTowards } from '../types/math.js';
import type { TongueHit, TongueTarget, WorldCollision } from './WorldCollision.js';

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
  /**
   * Dropping from a mid-air tongue end: a straight fall from the endpoint, no
   * steering, until the feet land. Cleared on landing.
   */
  tongueDrop: boolean;
  /**
   * Who flies the tongue this throw: `TongueControl`. It starts AUTO (the
   * default arc); fresh movement input hands the tip to the player for the
   * rest of the throw. Keys already held at the press (walking up to an edge)
   * do not count until they have been let go once.
   */
  tongueControl: number;
  /** Monotonic count of throws, so a remote can mirror them. */
  tongueCount: number;
  /** The flown path laid so far: (heading, pitch) per segment. */
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
  tongueDrop: false,
  tongueControl: 0,
  tongueCount: 0,
  sx: 0,
  sy: 0,
  sz: 0,
  ex: 0,
  ey: 0,
  ez: 0,
  tongueYaw0: 0,
  tonguePitch0: 0,
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
  to.tongueDrop = from.tongueDrop;
  to.tongueControl = from.tongueControl;
  to.tongueCount = from.tongueCount;
  to.sx = from.sx;
  to.sy = from.sy;
  to.sz = from.sz;
  to.ex = from.ex;
  to.ey = from.ey;
  to.ez = from.ez;
  to.tongueYaw0 = from.tongueYaw0;
  to.tonguePitch0 = from.tonguePitch0;
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
  motion.tongueDrop = false;
  motion.tongueControl = TongueControl.Auto;
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
const HIT: TongueHit = { t: 0, nx: 0, ny: 0, nz: 0, kind: 'none', topY: 0, landable: false };
const POINT = { x: 0, y: 0, z: 0 };
const TIP = { x: 0, y: 0, z: 0 };
const DIR = { x: 0, y: 0, z: 0 };
const STEER = { heading: 0, pitch: 0 };
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
 * Who flies the tongue during a throw.
 *
 *  - Auto: the default arc to the target found at the press. Movement input
 *    now takes over.
 *  - AutoHeld: the default arc, but movement keys were already held at the
 *    press; they must be let go once before they can take over.
 *  - Player: the player steers the tip, for the rest of the throw.
 */
export const TongueControl = { Auto: 0, AutoHeld: 1, Player: 2 } as const;

const stickHeld = (input: MovementInput): boolean => Math.hypot(input.moveX, input.moveZ) >= TONGUE.steerDeadzone;

/**
 * Start a throw: the windup. The DEFAULT path is aimed now - the original
 * curved throw to the reachable island ahead (`findTongueTarget`), whose aim
 * point is kept in (ex, ey, ez) until the path freezes. The tongue leaves the
 * mouth along that arc's launch direction.
 */
const beginThrow = (motion: PlayerMotion, input: MovementInput, params: SimParams, collision: WorldCollision): boolean => {
  const length = Number.isFinite(params.length) && params.length > 0 ? params.length : TONGUE.baseLength;
  if (!collision.findTongueTarget(motion.x, motion.y, motion.z, input.cameraYaw, length, TARGET)) return false;
  const { seg } = tongueSegmentsFor(length);
  motion.sx = motion.x;
  motion.sy = motion.y;
  motion.sz = motion.z;
  motion.ex = TARGET.x;
  motion.ey = TARGET.y;
  motion.ez = TARGET.z;
  motion.tongueHit = false;
  motion.tongueYaw0 = input.cameraYaw;
  motion.tongueMax = length;
  motion.tongueSeg = seg;
  // The launch: the default arc's first direction (the head tilts back, the tongue goes up and out).
  const cy = tongueArchY(motion.sx, motion.sy, motion.sz, motion.ex, motion.ey, motion.ez, length) ?? motion.sy + TONGUE.minArch;
  tongueArcPointAt(motion.sx, motion.sy, motion.sz, motion.ex, motion.ey, motion.ez, cy, seg, POINT);
  motion.tongueYaw0 = Math.atan2(POINT.x - motion.sx, POINT.z - motion.sz);
  motion.tonguePitch0 = Math.atan2(POINT.y - motion.sy, Math.hypot(POINT.x - motion.sx, POINT.z - motion.sz));
  motion.tongueControl = stickHeld(input) ? TongueControl.AutoHeld : TongueControl.Auto;
  motion.tongueHeadings.length = 0;
  motion.tonguePhase = TonguePhase.Windup;
  motion.tongueTime = 0;
  motion.tongueCount += 1;
  motion.vx = 0;
  motion.vy = 0;
  motion.vz = 0;
  motion.yaw = input.cameraYaw;
  return true;
};

/** Hand the tongue to the player on FRESH movement input. */
const updateControl = (motion: PlayerMotion, input: MovementInput): void => {
  if (motion.tongueControl === TongueControl.Player) return;
  const held = stickHeld(input);
  if (motion.tongueControl === TongueControl.AutoHeld) {
    if (!held) motion.tongueControl = TongueControl.Auto;
    return;
  }
  if (held) motion.tongueControl = TongueControl.Player;
};

/** The laid point `index` of the path (0 = the start), into `out`. */
const pathPoint = (motion: PlayerMotion, index: number, out: { x: number; y: number; z: number }): void => {
  out.x = motion.sx;
  out.y = motion.sy;
  out.z = motion.sz;
  for (let i = 0; i < index; i += 1) {
    tongueDirection(motion.tongueHeadings[i * 2] as number, motion.tongueHeadings[i * 2 + 1] as number, DIR);
    out.x += DIR.x * motion.tongueSeg;
    out.y += DIR.y * motion.tongueSeg;
    out.z += DIR.z * motion.tongueSeg;
  }
};

/**
 * FREEZE THE PATH with its end at (x, y, z). `kind` is what the tip met:
 * nothing (the length ran out - it ends right there in the air), a platform's
 * top (the rider will land on it), a side or underside (the rider ends clear
 * of it and falls), or the lava.
 */
const lockPath = (
  motion: PlayerMotion,
  x: number,
  y: number,
  z: number,
  kind: TongueHit['kind'],
  events: SimEvents,
): void => {
  if (motion.tongueHeadings.length === 0) {
    // Nothing was laid: there is no path to ride.
    motion.tonguePhase = TonguePhase.None;
    motion.tongueTime = 0;
    return;
  }
  motion.ex = x;
  motion.ey = y;
  motion.ez = z;
  motion.tongueHit = kind === 'top';
  motion.tonguePhase = TonguePhase.Glide;
  motion.tongueTime = 0;
  motion.grounded = false;
  events.tongueAttached = true;
};

/**
 * DEPLOY: lay the path one segment at a time, each flown by what the player
 * holds, through open 3D air. It stops only when the Tongue Length is spent
 * (the tip freezes wherever it is) or when a segment runs into something.
 */
const extendTongue = (motion: PlayerMotion, input: MovementInput, collision: WorldCollision, events: SimEvents): void => {
  const { count } = tongueSegmentsFor(motion.tongueMax);
  const reached = motion.tongueTime * tongueExtendSpeed(motion.tongueMax);
  let laid = motion.tongueHeadings.length / 2;
  let arch: number | null = null;
  updateControl(motion, input);
  while (laid < count && (laid + 1) * motion.tongueSeg <= reached + 1e-9) {
    const heading = laid === 0 ? motion.tongueYaw0 : (motion.tongueHeadings[laid * 2 - 2] as number);
    const pitch = laid === 0 ? motion.tonguePitch0 : (motion.tongueHeadings[laid * 2 - 1] as number);
    pathPoint(motion, laid, TIP);
    if (motion.tongueControl === TongueControl.Player) {
      // The player flies it: A/D curve, W/S climb and dive, from where it is heading now.
      steerTongue(heading, pitch, input.moveX, input.moveZ, motion.tongueSeg, STEER);
    } else {
      // The default arc: head for the arc's point one segment further along.
      if (arch === null) arch = tongueArchY(motion.sx, motion.sy, motion.sz, motion.ex, motion.ey, motion.ez, motion.tongueMax) ?? motion.sy + TONGUE.minArch;
      tongueArcPointAt(motion.sx, motion.sy, motion.sz, motion.ex, motion.ey, motion.ez, arch, (laid + 1) * motion.tongueSeg, POINT);
      const dx = POINT.x - TIP.x;
      const dy = POINT.y - TIP.y;
      const dz = POINT.z - TIP.z;
      const flat = Math.hypot(dx, dz);
      STEER.heading = flat > 1e-9 ? Math.atan2(dx, dz) : heading;
      STEER.pitch = Math.atan2(dy, flat);
    }
    tongueDirection(STEER.heading, STEER.pitch, DIR);
    const x1 = TIP.x + DIR.x * motion.tongueSeg;
    const y1 = TIP.y + DIR.y * motion.tongueSeg;
    const z1 = TIP.z + DIR.z * motion.tongueSeg;
    motion.tongueHeadings.push(STEER.heading, STEER.pitch);
    laid += 1;
    if (collision.tongueSegmentHit(TIP.x, TIP.y, TIP.z, x1, y1, z1, HIT)) {
      // The tip met something part-way along this segment: the path ends there.
      const hx = TIP.x + (x1 - TIP.x) * HIT.t;
      const hy = TIP.y + (y1 - TIP.y) * HIT.t;
      const hz = TIP.z + (z1 - TIP.z) * HIT.t;
      if (HIT.kind === 'top' || HIT.kind === 'lava') {
        lockPath(motion, hx, hy, hz, HIT.kind, events);
      } else if (HIT.kind === 'side' && HIT.landable && HIT.topY - hy <= MOVEMENT.stepHeight) {
        // Met a platform's side within a step of its top: up onto the lip, as walking would.
        lockPath(motion, hx - HIT.nx * PLAYER_RADIUS, HIT.topY, hz - HIT.nz * PLAYER_RADIUS, 'top', events);
      } else if (HIT.kind === 'under') {
        lockPath(motion, hx, hy - PLAYER_HEIGHT - 0.05, hz, HIT.kind, events);
      } else {
        const out = PLAYER_RADIUS + 0.05;
        lockPath(motion, hx + HIT.nx * out, hy, hz + HIT.nz * out, HIT.kind, events);
      }
      if (HIT.t <= 1e-9 && laid === 1) {
        // Ran into something at the very mouth: nothing to ride.
        motion.tonguePhase = TonguePhase.None;
        motion.tongueTime = 0;
      }
      return;
    }
  }
  if (laid >= count) {
    // The Tongue Length is spent: the tip stops right where it is, in the air or not.
    pathPoint(motion, laid, TIP);
    lockPath(motion, TIP.x, TIP.y, TIP.z, 'none', events);
  }
};

/** Windup, deploy (flown), glide along the frozen path. */
const advanceTongue = (
  motion: PlayerMotion,
  input: MovementInput,
  collision: WorldCollision,
  dt: number,
  events: SimEvents,
): void => {
  motion.tongueTime += dt;

  if (motion.tonguePhase === TonguePhase.Windup) {
    updateControl(motion, input);
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
    // THE END OF THE CURVE, exactly - high in the air, on a platform, wherever.
    motion.x = motion.ex;
    motion.y = motion.ey;
    motion.z = motion.ez;
    if (motion.tongueHit) {
      motion.vx = 0;
      motion.vz = 0;
      motion.vy = 0;
    } else {
      // Nothing underfoot: the rider stops at the endpoint and falls straight
      // down from there under gravity - no leftover ride speed, no steering -
      // so a tip parked above an island drops onto it, and a tip that fell
      // short cannot be stretched by steering the fall.
      motion.vx = 0;
      motion.vz = 0;
      motion.vy = 0;
      motion.tongueDrop = true;
    }
    motion.grounded = motion.tongueHit;
    motion.tonguePhase = TonguePhase.None;
    motion.tongueTime = 0;
    events.tongueArrived = true;
    if (motion.tongueHit) events.landed = true;
    return;
  }

  // Ride the exact 3D curve the player flew.
  sampleTonguePath(LAID, tongueGlideU(motion.tongueTime / glide) * LAID.length, POINT);
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
  if (motion.tongueDrop && !motion.grounded) return;

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
  motion.tongueDrop = false;
};
