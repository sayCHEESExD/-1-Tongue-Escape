import {
  COURSE_MAX_Z,
  COURSE_MIN_Z,
  COURSE_SOLIDS,
  corridorHalfWidthAt,
  RIVER,
  isOverLava,
  stageAt,
  treadmillAt,
  winPadAt,
  type CourseSolid,
  type StageDefinition,
} from '../config/course.js';
import { MOVEMENT } from '../config/movement.js';
import { TONGUE, tongueClimbFor } from '../config/tongue.js';
import { PLAYER_HEIGHT, PLAYER_RADIUS, DEATH_PLANE_Y } from '../constants/world.js';

/**
 * The gameplay shape of the world: what you can stand on, what stops you,
 * what burns you, and where a tongue can attach.
 *
 * Lives in `shared` because BOTH sides collide against it. Solids are
 * bucketed by Z so each query is a handful of boxes.
 */

const BUCKET_SIZE = 24;

/** How far BELOW a surface the feet may be and still land on it. Equals the step height. */
const LANDING_TOLERANCE = MOVEMENT.stepHeight;
const CEILING_TOLERANCE = 0.05;

export interface CourseTriggers {
  winStage: StageDefinition | null;
  /** In the lava, or out of the world. */
  fell: boolean;
  treadmill: number;
}

/** Where a tongue sticks, written by `tongueCandidate`. */
export interface TongueTarget {
  x: number;
  y: number;
  z: number;
  /** True when it is a platform to stick to. */
  hit: boolean;
}

export class WorldCollision {
  private readonly buckets = new Map<number, CourseSolid[]>();
  private readonly minBucket: number;
  private readonly maxBucket: number;

  constructor() {
    let lowest = Number.POSITIVE_INFINITY;
    let highest = Number.NEGATIVE_INFINITY;
    for (const solid of COURSE_SOLIDS) {
      const from = bucketOf(solid.minZ);
      const to = bucketOf(solid.maxZ);
      lowest = Math.min(lowest, from);
      highest = Math.max(highest, to);
      for (let b = from; b <= to; b += 1) {
        let list = this.buckets.get(b);
        if (!list) {
          list = [];
          this.buckets.set(b, list);
        }
        list.push(solid);
      }
    }
    this.minBucket = Number.isFinite(lowest) ? lowest : 0;
    this.maxBucket = Number.isFinite(highest) ? highest : 0;
  }

  /** Solids that could touch a body centred at this Z. Never allocates. */
  private near(z: number): readonly CourseSolid[] {
    const bucket = bucketOf(z);
    if (bucket < this.minBucket - 1 || bucket > this.maxBucket + 1) return EMPTY;
    SCRATCH.length = 0;
    for (let b = bucket - 1; b <= bucket + 1; b += 1) {
      const list = this.buckets.get(b);
      if (list) for (const solid of list) SCRATCH.push(solid);
    }
    return SCRATCH;
  }

  /** Height of the walkable surface under the player, or null over a gap. */
  surfaceYAt(x: number, z: number, feetY: number): number | null {
    const ceiling = feetY + MOVEMENT.stepHeight;
    let best: number | null = null;
    for (const solid of this.near(z)) {
      if (x < solid.minX - PLAYER_RADIUS || x > solid.maxX + PLAYER_RADIUS) continue;
      if (z < solid.minZ - PLAYER_RADIUS || z > solid.maxZ + PLAYER_RADIUS) continue;
      if (solid.maxY > ceiling) continue;
      if (best === null || solid.maxY > best) best = solid.maxY;
    }
    return best;
  }

  ceilingYAt(x: number, z: number, previousHeadY: number): number | null {
    let best: number | null = null;
    for (const solid of this.near(z)) {
      if (x < solid.minX || x > solid.maxX) continue;
      if (z < solid.minZ || z > solid.maxZ) continue;
      if (previousHeadY > solid.minY + CEILING_TOLERANCE) continue;
      if (best === null || solid.minY < best) best = solid.minY;
    }
    return best;
  }

  canLandOn(previousY: number, surfaceY: number): boolean {
    return previousY >= surfaceY - LANDING_TOLERANCE;
  }

  /** Push the body out of anything it walked into along ONE axis. */
  resolveAxis(axis: 0 | 2, value: number, other: number, feetY: number): number {
    const headY = feetY + PLAYER_HEIGHT;
    const stepTop = feetY + MOVEMENT.stepHeight;
    let out = value;
    for (const solid of this.near(axis === 2 ? value : other)) {
      if (solid.maxY <= stepTop) continue;
      if (solid.minY >= headY) continue;
      const minA = axis === 0 ? solid.minX : solid.minZ;
      const maxA = axis === 0 ? solid.maxX : solid.maxZ;
      const minB = axis === 0 ? solid.minZ : solid.minX;
      const maxB = axis === 0 ? solid.maxZ : solid.maxX;
      if (other + PLAYER_RADIUS <= minB || other - PLAYER_RADIUS >= maxB) continue;
      if (out + PLAYER_RADIUS <= minA || out - PLAYER_RADIUS >= maxA) continue;
      const pushLow = minA - PLAYER_RADIUS;
      const pushHigh = maxA + PLAYER_RADIUS;
      out = out - pushLow < pushHigh - out ? pushLow : pushHigh;
    }
    return out;
  }

  /** The invisible boundary: a clamp, so nothing can tunnel it. */
  clampToBounds(x: number, z: number, out: { x: number; z: number }): void {
    const cz = z < COURSE_MIN_Z ? COURSE_MIN_Z : z > COURSE_MAX_Z ? COURSE_MAX_Z : z;
    const limit = corridorHalfWidthAt(cz);
    out.x = x < -limit ? -limit : x > limit ? limit : x;
    out.z = cz;
  }

  /** True when a point is inside the walkable corridor. */
  inBounds(x: number, z: number): boolean {
    if (z < COURSE_MIN_Z || z > COURSE_MAX_Z) return false;
    return Math.abs(x) <= corridorHalfWidthAt(z);
  }

  sampleTriggers(x: number, y: number, z: number): CourseTriggers {
    return { winStage: winPadAt(x, y, z), fell: this.hasFallen(x, y, z), treadmill: treadmillAt(x, y, z) };
  }

  /** In the lava, or past the death plane. */
  hasFallen(x: number, y: number, z: number): boolean {
    if (y <= DEATH_PLANE_Y) return true;
    return isOverLava(x, z) && y <= RIVER.lavaY + 0.25;
  }

  /**
   * CAN THE TONGUE STICK HERE? The platform under a point on a steered path.
   *
   * A landable solid other than the one the throw started on, whose top is
   * within the tongue's climb and drop of the start height, and whose edge
   * the point is inside - or within `TONGUE.captureMargin` of, so grazing an
   * edge still counts. The landing spot is the point pulled `edgeInset` inside
   * the edge, with nothing solid over it. This never reaches out for a
   * platform the path did not cross: it answers for one point only.
   *
   * @returns true and the landing spot in `out`, or false
   */
  tongueCandidate(
    px: number,
    pz: number,
    sx: number,
    sy: number,
    sz: number,
    length: number,
    out: TongueTarget,
  ): boolean {
    this.collectStanding(sx, sy, sz);
    const top = sy + tongueClimbFor(length);
    const bottom = sy - TONGUE.maxDrop;
    const margin = TONGUE.captureMargin;
    const inset = TONGUE.edgeInset;
    let best: CourseSolid | null = null;
    for (const solid of this.near(pz)) {
      if (!solid.landable || STANDING.indexOf(solid) >= 0) continue;
      if (solid.maxY < bottom || solid.maxY > top) continue;
      if (px < solid.minX - margin || px > solid.maxX + margin) continue;
      if (pz < solid.minZ - margin || pz > solid.maxZ + margin) continue;
      if (solid.maxX - solid.minX < inset * 2 || solid.maxZ - solid.minZ < inset * 2) continue;
      if (best === null || solid.maxY > best.maxY) best = solid;
    }
    if (best === null) return false;
    const x = Math.min(Math.max(px, best.minX + inset), best.maxX - inset);
    const z = Math.min(Math.max(pz, best.minZ + inset), best.maxZ - inset);
    const y = best.maxY;
    // Nothing solid - a wall, a console, a higher storey - over the landing.
    for (const solid of this.near(z)) {
      if (x < solid.minX - PLAYER_RADIUS || x > solid.maxX + PLAYER_RADIUS) continue;
      if (z < solid.minZ - PLAYER_RADIUS || z > solid.maxZ + PLAYER_RADIUS) continue;
      if (solid.maxY > y && solid.minY < y + PLAYER_HEIGHT) return false;
    }
    out.x = x;
    out.y = y;
    out.z = z;
    out.hit = true;
    return true;
  }

  /** True when something solid fills the body's space at this point and height. */
  bodyBlocked(x: number, y: number, z: number): boolean {
    for (const solid of this.near(z)) {
      if (x < solid.minX - PLAYER_RADIUS || x > solid.maxX + PLAYER_RADIUS) continue;
      if (z < solid.minZ - PLAYER_RADIUS || z > solid.maxZ + PLAYER_RADIUS) continue;
      if (solid.maxY > y + 0.05 && solid.minY < y + PLAYER_HEIGHT) return true;
    }
    return false;
  }

  /** The solids the feet are standing on, into `STANDING`. Never a tongue's platform. */
  private collectStanding(x: number, y: number, z: number): void {
    STANDING.length = 0;
    for (const solid of this.near(z)) {
      if (Math.abs(solid.maxY - y) > 0.05) continue;
      if (x < solid.minX - PLAYER_RADIUS || x > solid.maxX + PLAYER_RADIUS) continue;
      if (z < solid.minZ - PLAYER_RADIUS || z > solid.maxZ + PLAYER_RADIUS) continue;
      STANDING.push(solid);
    }
  }

  stageAt(z: number): StageDefinition | null {
    return stageAt(z);
  }
}

const SCRATCH: CourseSolid[] = [];
/** The solids underfoot at the start of a throw: never a target. */
const STANDING: CourseSolid[] = [];
const EMPTY: readonly CourseSolid[] = [];

const bucketOf = (z: number): number => Math.floor(z / BUCKET_SIZE);
