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

/** Where a throw will land, written by `findTongueTarget`. */
export interface TongueTarget {
  x: number;
  y: number;
  z: number;
  /** True when it attached to a platform; false when it ended in the air at its full length. */
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
   * The platform a tongue can attach to at one column: the highest LANDABLE
   * solid whose top is in [minY, maxY], that the point is at least
   * `TONGUE.edgeInset` inside, and with nothing solid over the landing spot.
   * Null when there is none.
   */
  tongueSolidAt(x: number, z: number, minY: number, maxY: number): CourseSolid | null {
    const inset = TONGUE.edgeInset;
    let best: CourseSolid | null = null;
    for (const solid of this.near(z)) {
      if (!solid.landable) continue;
      if (solid.maxY < minY || solid.maxY > maxY) continue;
      if (x < solid.minX + inset || x > solid.maxX - inset) continue;
      if (z < solid.minZ + inset || z > solid.maxZ - inset) continue;
      if (best === null || solid.maxY > best.maxY) best = solid;
    }
    if (best === null) return null;
    const top = best.maxY;
    // Nothing solid - a wall, a console, a higher storey - may occupy the
    // body's space at the landing.
    for (const solid of this.near(z)) {
      if (x < solid.minX - PLAYER_RADIUS || x > solid.maxX + PLAYER_RADIUS) continue;
      if (z < solid.minZ - PLAYER_RADIUS || z > solid.maxZ + PLAYER_RADIUS) continue;
      if (solid.maxY > top && solid.minY < top + PLAYER_HEIGHT) return null;
    }
    return best;
  }

  /** True when something solid fills the body's space at this point and height. */
  private blocked(x: number, y: number, z: number): boolean {
    for (const solid of this.near(z)) {
      if (x < solid.minX - PLAYER_RADIUS || x > solid.maxX + PLAYER_RADIUS) continue;
      if (z < solid.minZ - PLAYER_RADIUS || z > solid.maxZ + PLAYER_RADIUS) continue;
      if (solid.maxY > y + 0.05 && solid.minY < y + PLAYER_HEIGHT) return true;
    }
    return false;
  }

  /** The solids the feet are standing on, into `STANDING`. */
  private collectStanding(x: number, y: number, z: number): void {
    STANDING.length = 0;
    for (const solid of this.near(z)) {
      if (Math.abs(solid.maxY - y) > 0.05) continue;
      if (x < solid.minX - PLAYER_RADIUS || x > solid.maxX + PLAYER_RADIUS) continue;
      if (z < solid.minZ - PLAYER_RADIUS || z > solid.maxZ + PLAYER_RADIUS) continue;
      STANDING.push(solid);
    }
  }

  /**
   * WHERE A THROW GOES. Evaluated by the server against its own state; the
   * client runs the identical search to predict it.
   *
   *  1. A reachable island or platform DIRECTLY AHEAD: along the aim, the
   *     farthest landable spot within the Tongue Length, on any platform
   *     other than the one underfoot.
   *  2. Failing that, the same search a few degrees either side, nearest
   *     angle first, never beyond `TONGUE.coneDegrees` - the tongue never
   *     turns sideways, let alone behind, to find something.
   *  3. Nothing in reach: the tongue flies straight ahead to its FULL LENGTH
   *     and no further (or to the last free point before a wall), ending in
   *     the air at the height it left from. The rider races to that end and
   *     drops wherever it is - onto ground if there is any, into the lava if
   *     not. An island just out of reach stays out of reach.
   *
   * @returns false only when there is no room at all to throw
   */
  findTongueTarget(
    x: number,
    y: number,
    z: number,
    yaw: number,
    length: number,
    out: TongueTarget,
  ): boolean {
    this.collectStanding(x, y, z);
    const top = y + tongueClimbFor(length);
    const bottom = y - TONGUE.maxDrop;
    const steps = Math.floor((length - TONGUE.minDistance) / TONGUE.sampleStep);

    for (const offset of CONE_OFFSETS) {
      const angle = yaw + offset;
      const dirX = Math.sin(angle);
      const dirZ = Math.cos(angle);
      for (let i = 0; i <= steps; i += 1) {
        const d = length - i * TONGUE.sampleStep;
        const px = x + dirX * d;
        const pz = z + dirZ * d;
        if (!this.inBounds(px, pz)) continue;
        const solid = this.tongueSolidAt(px, pz, bottom, top);
        if (solid === null || STANDING.indexOf(solid) >= 0) continue;
        out.x = px;
        out.y = solid.maxY;
        out.z = pz;
        out.hit = true;
        return true;
      }
    }

    // Nothing reachable: the tongue's real length, straight ahead.
    const dirX = Math.sin(yaw);
    const dirZ = Math.cos(yaw);
    let reached = 0;
    for (let d = TONGUE.sampleStep; d <= length + 1e-9; d += TONGUE.sampleStep) {
      const px = x + dirX * d;
      const pz = z + dirZ * d;
      if (!this.inBounds(px, pz) || this.blocked(px, y, pz)) break;
      reached = d;
    }
    if (reached < TONGUE.minDistance) return false;
    out.x = x + dirX * reached;
    out.y = y;
    out.z = z + dirZ * reached;
    out.hit = false;
    return true;
  }

  stageAt(z: number): StageDefinition | null {
    return stageAt(z);
  }
}

const SCRATCH: CourseSolid[] = [];
/** The solids underfoot at the start of a throw: never a target. */
const STANDING: CourseSolid[] = [];
/** The forward cone, nearest angle first: 0, +6, -6, +12, -12 ... degrees. */
const CONE_OFFSETS: readonly number[] = (() => {
  const out = [0];
  for (let a = TONGUE.coneStepDegrees; a <= TONGUE.coneDegrees + 1e-9; a += TONGUE.coneStepDegrees) {
    out.push((a * Math.PI) / 180, (-a * Math.PI) / 180);
  }
  return out;
})();
const EMPTY: readonly CourseSolid[] = [];

const bucketOf = (z: number): number => Math.floor(z / BUCKET_SIZE);
