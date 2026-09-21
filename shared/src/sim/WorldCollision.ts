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
import { TONGUE, tongueArcLength, tongueArcPointAt, tongueArchY, tongueClimbFor } from '../config/tongue.js';
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

/** Where a default throw aims, written by `findTongueTarget`. */
export interface TongueTarget {
  x: number;
  y: number;
  z: number;
  /** True when it is a platform to land on; false for a point in the air. */
  hit: boolean;
}

const ARC_POINT = { x: 0, y: 0, z: 0 };
const ARC_HIT: TongueHit = { t: 0, nx: 0, ny: 0, nz: 0, kind: 'none', topY: 0, landable: false };

/** The solids underfoot at the start of a throw: never a target. */
const STANDING: CourseSolid[] = [];

/** The default throw's forward cone, nearest angle first: 0, +6, -6, +12, ... degrees. */
const CONE_OFFSETS: number[] = (() => {
  const out = [0];
  for (let a = TONGUE.coneStepDegrees; a <= TONGUE.coneDegrees + 1e-9; a += TONGUE.coneStepDegrees) {
    out.push((a * Math.PI) / 180, (-a * Math.PI) / 180);
  }
  return out;
})();

/** What a tongue tip ran into, written by `tongueSegmentHit`. */
export interface TongueHit {
  /** Fraction along the segment. */
  t: number;
  /** The face's outward normal. */
  nx: number;
  ny: number;
  nz: number;
  /** A platform's top (land on it), a side or underside (end there and fall), or the lava. */
  kind: 'none' | 'top' | 'side' | 'under' | 'lava';
  /** For a solid: its top, and whether it can be stood on. */
  topY: number;
  landable: boolean;
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
   * WHAT THE TONGUE TIP RUNS INTO flying from p0 to p1 (the feet's path).
   *
   * The earliest of: entering any solid box (its face tells how: a top, a
   * side, an underside), reaching the lava's surface over the river, or
   * leaving the world's walls. Nothing else: open air is open air, and the
   * tip is never pulled toward the ground or toward an island.
   *
   * @returns true with the fraction along the segment and the face normal in `out`
   */
  tongueSegmentHit(
    x0: number,
    y0: number,
    z0: number,
    x1: number,
    y1: number,
    z1: number,
    out: TongueHit,
  ): boolean {
    const dx = x1 - x0;
    const dy = y1 - y0;
    const dz = z1 - z0;
    let best = Number.POSITIVE_INFINITY;
    out.kind = 'none';

    for (const solid of this.near((z0 + z1) / 2)) {
      // Slab test: the parameter range where the segment is inside each slab.
      let enter = Number.NEGATIVE_INFINITY;
      let exit = Number.POSITIVE_INFINITY;
      let axis = -1;
      let sign = 0;
      let miss = false;
      const slabs: readonly (readonly [number, number, number, number])[] = [
        [x0, dx, solid.minX, solid.maxX],
        [y0, dy, solid.minY, solid.maxY],
        [z0, dz, solid.minZ, solid.maxZ],
      ];
      for (let k = 0; k < 3; k += 1) {
        const [p, d, lo, hi] = slabs[k] as readonly [number, number, number, number];
        if (Math.abs(d) < 1e-12) {
          if (p <= lo || p >= hi) {
            miss = true;
            break;
          }
          continue;
        }
        let t0 = (lo - p) / d;
        let t1 = (hi - p) / d;
        let faceSign = -1;
        if (t0 > t1) {
          const swap = t0;
          t0 = t1;
          t1 = swap;
          faceSign = 1;
        }
        if (t0 > enter) {
          enter = t0;
          axis = k;
          sign = faceSign;
        }
        if (t1 < exit) exit = t1;
        if (enter >= exit) {
          miss = true;
          break;
        }
      }
      if (miss || axis < 0) continue;
      // Starting on a face and leaving it (the floor underfoot, flying up) is not a hit.
      if (exit <= 1e-9 || enter > 1) continue;
      const t = Math.max(0, enter);
      if (enter < -1e-9 && t === 0) {
        // Began inside this solid: only a hit if the tip is heading deeper into it.
        continue;
      }
      if (t < best) {
        best = t;
        out.t = t;
        out.nx = axis === 0 ? sign : 0;
        out.ny = axis === 1 ? sign : 0;
        out.nz = axis === 2 ? sign : 0;
        out.kind = axis === 1 && sign > 0 ? 'top' : axis === 1 ? 'under' : 'side';
        out.topY = solid.maxY;
        out.landable = solid.landable;
      }
    }

    // The lava's surface, over the river.
    const lava = RIVER.lavaY;
    if (y0 > lava && y1 <= lava) {
      const t = (y0 - lava) / (y0 - y1);
      if (t < best && isOverLava(x0 + dx * t, z0 + dz * t)) {
        best = t;
        out.t = t;
        out.nx = 0;
        out.ny = 1;
        out.nz = 0;
        out.kind = 'lava';
        out.landable = false;
      }
    }

    // The world's walls: stop where the tip would leave the playable space.
    if (!this.inBounds(x1, z1)) {
      let lo = 0;
      let hi = 1;
      for (let i = 0; i < 20; i += 1) {
        const mid = (lo + hi) / 2;
        if (this.inBounds(x0 + dx * mid, z0 + dz * mid)) lo = mid;
        else hi = mid;
      }
      if (lo < best) {
        best = lo;
        out.t = lo;
        const px = x0 + dx * lo;
        const pz = z0 + dz * lo;
        const limit = corridorHalfWidthAt(pz);
        out.nx = px > limit - 0.05 ? -1 : px < -limit + 0.05 ? 1 : 0;
        out.ny = 0;
        out.nz = out.nx === 0 ? (dz > 0 ? -1 : 1) : 0;
        out.kind = 'side';
        out.landable = false;
      }
    }
    return out.kind !== 'none';
  }

  /**
   * The platform a default throw can land on at one column: the highest
   * LANDABLE solid whose top is in [minY, maxY], that the point is at least
   * `TONGUE.edgeInset` inside, with nothing solid over the landing spot.
   */
  private tongueSolidAt(x: number, z: number, minY: number, maxY: number): CourseSolid | null {
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
    return this.bodyBlocked(x, best.maxY, z) ? null : best;
  }

  /**
   * True when the default arc S -> E flies clear of everything until it comes
   * down on E's surface: traced through the same test the tongue itself uses.
   */
  private arcLands(sx: number, sy: number, sz: number, ex: number, ey: number, ez: number, cy: number): boolean {
    const length = tongueArcLength(sx, sy, sz, ex, ey, ez, cy);
    const steps = Math.max(4, Math.ceil(length / 0.75));
    let px = sx;
    let py = sy;
    let pz = sz;
    for (let i = 1; i <= steps + 2; i += 1) {
      // Two short steps past the end, so the arc meets the surface it comes down on.
      tongueArcPointAt(sx, sy, sz, ex, ey, ez, cy, (length * i) / steps, ARC_POINT);
      if (this.tongueSegmentHit(px, py, pz, ARC_POINT.x, ARC_POINT.y, ARC_POINT.z, ARC_HIT)) {
        if (ARC_HIT.kind !== 'top') return false;
        const hx = px + (ARC_POINT.x - px) * ARC_HIT.t;
        const hz = pz + (ARC_POINT.z - pz) * ARC_HIT.t;
        const hy = py + (ARC_POINT.y - py) * ARC_HIT.t;
        return Math.abs(hy - ey) < 0.05 && Math.hypot(hx - ex, hz - ez) < 2;
      }
      px = ARC_POINT.x;
      py = ARC_POINT.y;
      pz = ARC_POINT.z;
    }
    return false;
  }

  /**
   * WHERE A DEFAULT THROW GOES - the one the player does not steer.
   *
   *  1. A reachable island or platform AHEAD: along the aim, the farthest
   *     landable spot (not on the platform underfoot) that the default arc
   *     can reach within the Tongue Length.
   *  2. Failing that, the same a few degrees either side, nearest angle
   *     first, never beyond `TONGUE.coneDegrees`.
   *  3. Nothing in reach: a point ahead at the height it left from, as far
   *     as the natural arc of the full Tongue Length carries (short of the
   *     walls). The tongue ends in the air there and the rider drops. An
   *     island just out of reach stays out of reach.
   *
   * @returns false only when there is no room at all to throw
   */
  findTongueTarget(x: number, y: number, z: number, yaw: number, length: number, out: TongueTarget): boolean {
    STANDING.length = 0;
    for (const solid of this.near(z)) {
      if (Math.abs(solid.maxY - y) > 0.05) continue;
      if (x < solid.minX - PLAYER_RADIUS || x > solid.maxX + PLAYER_RADIUS) continue;
      if (z < solid.minZ - PLAYER_RADIUS || z > solid.maxZ + PLAYER_RADIUS) continue;
      STANDING.push(solid);
    }
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
        const cy = tongueArchY(x, y, z, px, solid.maxY, pz, length);
        if (cy === null || !this.arcLands(x, y, z, px, solid.maxY, pz, cy)) continue;
        out.x = px;
        out.y = solid.maxY;
        out.z = pz;
        out.hit = true;
        return true;
      }
    }

    // Nothing reachable: as far ahead as the natural arc of the full length carries.
    const dirX = Math.sin(yaw);
    const dirZ = Math.cos(yaw);
    let reached = 0;
    for (let d = TONGUE.sampleStep; d <= length + 1e-9; d += TONGUE.sampleStep) {
      const px = x + dirX * d;
      const pz = z + dirZ * d;
      if (!this.inBounds(px, pz)) break;
      if (tongueArchY(x, y, z, px, y, pz, length) === null) break;
      reached = d;
    }
    if (reached <= 0) return false;
    out.x = x + dirX * reached;
    out.y = y;
    out.z = z + dirZ * reached;
    out.hit = false;
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

  stageAt(z: number): StageDefinition | null {
    return stageAt(z);
  }
}

const SCRATCH: CourseSolid[] = [];
const EMPTY: readonly CourseSolid[] = [];

const bucketOf = (z: number): number => Math.floor(z / BUCKET_SIZE);
