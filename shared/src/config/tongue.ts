/**
/**
 * THE TONGUE: the game's one traversal mechanic, and its tuning.
 *
 * A press (click, the jump key, or the TONGUE button) runs one throw through
 * three phases, all of them part of the SHARED simulation so the server owns
 * the result and the client predicts it exactly:
 *
 *   1. WINDUP  - the head tilts back and the body loads the throw. Rooted.
 *   2. EXTEND  - the tongue flies out through open 3D air and the player
 *                FLIES it with the movement controls (A/D left/right, W up,
 *                S down), laying the path segment by segment. It stops when
 *                the Tongue Length is spent - wherever the tip is, in the air
 *                or not - or when the tip runs into something. Rooted.
 *   3. GLIDE   - the path is frozen and the player rides that exact 3D curve
 *                to its end, then normal movement (or a fall) resumes.
 *
 * THE TONGUE LENGTH is a stat of LEVEL alone (`tongueLengthFor`). XP decides
 * when the level changes; the length only ever changes on a level-up.
 */
export const TonguePhase = {
  None: 0,
  Windup: 1,
  Extend: 2,
  Glide: 3,
} as const;

export type TonguePhase = (typeof TonguePhase)[keyof typeof TonguePhase];

export const TONGUE = {
  /** Seconds of head-back windup before the tongue leaves the mouth. */
  windup: 0.24,
  /**
   * Deployment: a full-length throw takes `extendBase + length * extendPerUnit`
   * seconds - long enough to steer (0.6 s at 12 studs, 2.1 s at 108).
   */
  extendBase: 0.45,
  extendPerUnit: 1 / 65,
  /** The path is laid in segments of about this length, one heading each. */
  segment: 2,
  /** Most the tip may turn (left/right or up/down) per unit of length it lays, in radians: a smooth curve. */
  turnPerUnit: 0.075,
  /** Stick deflection below which the tip is not steered. */
  steerDeadzone: 0.2,
  /** Seconds of the ride: base + per unit, and a faster race past `glideFastFrom`. */
  glideBase: 0.32,
  glidePerUnit: 1 / 46,
  glideFastFrom: 40,
  glideFastPerUnit: 1 / 80,
  /** How far inside an edge the tongue must land, so the rider never lands on a lip. */
  edgeInset: 1.0,
  /**
   * THE DEFAULT ARC (nothing steered): the original curved throw. Its control
   * point sits above the higher end by base + per unit of distance, gentler
   * past `arcFlattenFrom`; flattened as needed (never below `minArch`) so the
   * whole arc fits `arcFit` of the Tongue Length.
   */
  arcBase: 4,
  arcPerUnit: 0.36,
  arcFlattenFrom: 30,
  arcFlatPerUnit: 0.18,
  minArch: 1.5,
  arcFit: 0.98,
  /** The default throw's search: nothing closer than this, sampled this finely, within this forward cone. */
  minDistance: 5,
  sampleStep: 0.5,
  coneDegrees: 24,
  coneStepDegrees: 6,
  /** The climb angle a throw leaves the mouth with (about 25 degrees up), and the steepest it may fly. */
  launchPitch: 0.44,
  maxPitch: 1.3,
  /** How far UP the tongue can reach: base + fraction of reach. */
  climbBase: 3,
  climbPerReach: 0.32,
  /** How far DOWN it will look for ground. */
  maxDrop: 40,
  /**
   * THE TONGUE LENGTH, in studs: 12 at Level 1 (the starting stat), +3 every
   * level, capped. It is the furthest (horizontal) a throw can reach.
   */
  baseLength: 12,
  lengthPerLevel: 3,
  maxLength: 200,
} as const;

/** THE Tongue Length for a level. Changes only when the level does. The one evaluator. */
export const tongueLengthFor = (level: number): number =>
  Math.min(TONGUE.maxLength, TONGUE.baseLength + Math.max(0, Math.floor(level) - 1) * TONGUE.lengthPerLevel);

/** How far above the feet a throw of this length can still land. */
export const tongueClimbFor = (length: number): number =>
  TONGUE.climbBase + length * TONGUE.climbPerReach;

// ------------------------------------------------------------ the default arc

/**
 * Height of the default arc's control point above the higher end, as the
 * original curved throw drew it: base + per unit of distance, gentler past
 * `arcFlattenFrom`.
 */
const naturalArch = (distance: number): number =>
  TONGUE.arcBase +
  Math.min(distance, TONGUE.arcFlattenFrom) * TONGUE.arcPerUnit +
  Math.max(0, distance - TONGUE.arcFlattenFrom) * TONGUE.arcFlatPerUnit;

const ARC_SAMPLES = 32;

/** Length of the quadratic Bezier S -> (mid, cy) -> E. */
export const tongueArcLength = (
  sx: number, sy: number, sz: number, ex: number, ey: number, ez: number, cy: number,
): number => {
  const cx = (sx + ex) / 2;
  const cz = (sz + ez) / 2;
  let length = 0;
  let px = sx;
  let py = sy;
  let pz = sz;
  for (let i = 1; i <= ARC_SAMPLES; i += 1) {
    const t = i / ARC_SAMPLES;
    const a = (1 - t) * (1 - t);
    const b = 2 * (1 - t) * t;
    const c = t * t;
    const x = a * sx + b * cx + c * ex;
    const y = a * sy + b * cy + c * ey;
    const z = a * sz + b * cz + c * ez;
    length += Math.hypot(x - px, y - py, z - pz);
    px = x;
    py = y;
    pz = z;
  }
  return length;
};

/**
 * THE DEFAULT ARC's control height from S to E for a tongue of `length`: the
 * original curved throw's arch when it fits the Tongue Length, flattened just
 * enough to fit when it does not, never flatter than `TONGUE.minArch` above
 * the higher end. Null when even that does not fit: out of reach.
 */
export const tongueArchY = (
  sx: number, sy: number, sz: number, ex: number, ey: number, ez: number, length: number,
): number | null => {
  const budget = length * TONGUE.arcFit;
  const top = Math.max(sy, ey);
  const d = Math.hypot(ex - sx, ez - sz);
  const natural = top + naturalArch(d);
  if (tongueArcLength(sx, sy, sz, ex, ey, ez, natural) <= budget) return natural;
  let lo = top + TONGUE.minArch;
  if (tongueArcLength(sx, sy, sz, ex, ey, ez, lo) > budget) return null;
  let hi = natural;
  for (let i = 0; i < 24; i += 1) {
    const mid = (lo + hi) / 2;
    if (tongueArcLength(sx, sy, sz, ex, ey, ez, mid) <= budget) lo = mid;
    else hi = mid;
  }
  return lo;
};

/**
 * The point at arc length `at` along the default arc S -> E with control
 * height `cy`, into `out`. Past the end it carries on along the final
 * direction, so a tongue that has not met the ground yet keeps going down.
 */
export const tongueArcPointAt = (
  sx: number, sy: number, sz: number, ex: number, ey: number, ez: number, cy: number,
  at: number,
  out: { x: number; y: number; z: number },
): void => {
  const cx = (sx + ex) / 2;
  const cz = (sz + ez) / 2;
  let travelled = 0;
  let px = sx;
  let py = sy;
  let pz = sz;
  for (let i = 1; i <= ARC_SAMPLES; i += 1) {
    const t = i / ARC_SAMPLES;
    const a = (1 - t) * (1 - t);
    const b = 2 * (1 - t) * t;
    const c = t * t;
    const x = a * sx + b * cx + c * ex;
    const y = a * sy + b * cy + c * ey;
    const z = a * sz + b * cz + c * ez;
    const step = Math.hypot(x - px, y - py, z - pz);
    if (travelled + step >= at || i === ARC_SAMPLES) {
      const f = step > 1e-12 ? (at - travelled) / step : 0;
      out.x = px + (x - px) * f;
      out.y = py + (y - py) * f;
      out.z = pz + (z - pz) * f;
      return;
    }
    travelled += step;
    px = x;
    py = y;
    pz = z;
  }
};

/** The endpoints of one throw. Feet positions, not the mouth. */
export interface TongueArc {
  sx: number;
  sy: number;
  sz: number;
  ex: number;
  ey: number;
  ez: number;
}

/** Seconds the GLIDE phase lasts for a path of this length. */
export const tongueGlideSeconds = (distance: number): number => {
  const d = Math.max(0, distance);
  return (
    TONGUE.glideBase +
    Math.min(d, TONGUE.glideFastFrom) * TONGUE.glidePerUnit +
    Math.max(0, d - TONGUE.glideFastFrom) * TONGUE.glideFastPerUnit
  );
};

// ------------------------------------------------------------ the steered path

/**
 * THE STEERED TONGUE PATH, IN 3D.
 *
 * After the windup the tongue's tip flies out at `tongueExtendSpeed` through
 * open air, and the player FLIES it with the movement controls: A/D curve it
 * left/right, W climbs, S dives, nothing held carries it straight on. Every
 * segment turns at most `TONGUE.turnPerUnit` radians per unit of length on
 * each axis - a smooth curve, never a corner - and the climb angle is capped
 * short of vertical. Nothing pulls it toward the ground or toward an island:
 * the path goes exactly where it is flown, and stops when the Tongue Length is
 * spent (or when the tip runs into something solid, or the lava).
 *
 * A path is its START (the feet), its launch heading and pitch, its segment
 * length, and one (heading, pitch) pair per laid segment. That is all the
 * server replicates, and every point on it - drawn or ridden - comes from
 * `layTonguePath` + `sampleTonguePath`, so what is drawn is what is ridden.
 */
export interface TonguePathState extends TongueArc {
  /** Heading the throw left the mouth with (the camera's yaw at the press). */
  tongueYaw0: number;
  /** Climb angle it left with, radians above horizontal. */
  tonguePitch0: number;
  /** The Tongue Length at the press: the most path this throw can lay. */
  tongueMax: number;
  /** Length of one laid segment: `tongueMax` split into equal segments. */
  tongueSeg: number;
  /** Two numbers per laid segment, (heading, pitch), in order. */
  tongueHeadings: ArrayLike<number>;
}

/** How many equal segments a tongue of this length is laid in, and how long each is. */
export const tongueSegmentsFor = (length: number): { count: number; seg: number } => {
  const max = Math.max(0.5, Number.isFinite(length) ? length : TONGUE.baseLength);
  const count = Math.max(1, Math.ceil(max / TONGUE.segment));
  return { count, seg: max / count };
};

/** How fast the tip travels out, units per second, for a tongue of this length. */
export const tongueExtendSpeed = (length: number): number =>
  Math.max(1, length) / (TONGUE.extendBase + Math.max(1, length) * TONGUE.extendPerUnit);

/** Seconds a full-length deployment takes. */
export const tongueExtendSeconds = (length: number): number => Math.max(1, length) / tongueExtendSpeed(length);

/**
 * Fly the tip for one segment of `seg` units: the stick's X turns it (A left,
 * D right), its Y pitches it (W up, S down), each by up to `turnPerUnit * seg`
 * scaled by how far the stick is pushed. Relative to the tip's own direction,
 * like flying - so it can climb, dive, curve and come back round.
 */
export const steerTongue = (
  heading: number,
  pitch: number,
  moveX: number,
  moveZ: number,
  seg: number,
  out: { heading: number; pitch: number },
): void => {
  const magnitude = Math.min(1, Math.hypot(moveX, moveZ));
  if (magnitude < TONGUE.steerDeadzone) {
    out.heading = heading;
    out.pitch = pitch;
    return;
  }
  const scale = Math.min(1, magnitude) / magnitude;
  const turn = TONGUE.turnPerUnit * seg;
  // The camera faces along +heading; its LEFT (A, moveX -1) is +heading.
  out.heading = heading - moveX * scale * turn;
  out.pitch = Math.max(-TONGUE.maxPitch, Math.min(TONGUE.maxPitch, pitch + moveZ * scale * turn));
};

/** The unit direction of a (heading, pitch). */
export const tongueDirection = (heading: number, pitch: number, out: { x: number; y: number; z: number }): void => {
  const c = Math.cos(pitch);
  out.x = Math.sin(heading) * c;
  out.y = Math.sin(pitch);
  out.z = Math.cos(heading) * c;
};

/** A path laid out as points in 3D, with running arc length. */
export interface LaidTonguePath {
  readonly xs: Float64Array;
  readonly ys: Float64Array;
  readonly zs: Float64Array;
  readonly cum: Float64Array;
  /** Points used, the start included. */
  count: number;
  /** Total length along the path. */
  length: number;
}

/** Most points a path can have: a 200-stud tongue in 2-stud segments, the start and a tip. */
const MAX_POINTS = 256;
const DIR = { x: 0, y: 0, z: 0 };

export const createLaidTonguePath = (): LaidTonguePath => ({
  xs: new Float64Array(MAX_POINTS),
  ys: new Float64Array(MAX_POINTS),
  zs: new Float64Array(MAX_POINTS),
  cum: new Float64Array(MAX_POINTS),
  count: 0,
  length: 0,
});

/**
 * Lay a path's points in 3D.
 *
 * @param extended  while deploying: how far the tip has travelled; the tip is
 *                  drawn that far along the last direction beyond the laid points
 * @param locked    the path is frozen: its last point is pinned to (ex, ey, ez),
 *                  where it stopped - the end of its length, or what it ran into
 */
export const layTonguePath = (
  path: TonguePathState,
  extended: number,
  locked: boolean,
  out: LaidTonguePath,
): LaidTonguePath => {
  const pairs = path.tongueHeadings;
  const n = Math.min(Math.floor(pairs.length / 2), MAX_POINTS - 2);
  out.xs[0] = path.sx;
  out.ys[0] = path.sy;
  out.zs[0] = path.sz;
  out.cum[0] = 0;
  let count = 1;
  let heading = path.tongueYaw0;
  let pitch = path.tonguePitch0;
  for (let i = 0; i < n; i += 1) {
    heading = pairs[i * 2] as number;
    pitch = pairs[i * 2 + 1] as number;
    tongueDirection(heading, pitch, DIR);
    out.xs[count] = (out.xs[count - 1] as number) + DIR.x * path.tongueSeg;
    out.ys[count] = (out.ys[count - 1] as number) + DIR.y * path.tongueSeg;
    out.zs[count] = (out.zs[count - 1] as number) + DIR.z * path.tongueSeg;
    count += 1;
  }
  if (locked) {
    if (count > 1) {
      out.xs[count - 1] = path.ex;
      out.ys[count - 1] = path.ey;
      out.zs[count - 1] = path.ez;
    }
  } else {
    const beyond = Math.min(extended, path.tongueMax) - n * path.tongueSeg;
    if (beyond > 1e-6) {
      tongueDirection(heading, pitch, DIR);
      out.xs[count] = (out.xs[count - 1] as number) + DIR.x * beyond;
      out.ys[count] = (out.ys[count - 1] as number) + DIR.y * beyond;
      out.zs[count] = (out.zs[count - 1] as number) + DIR.z * beyond;
      count += 1;
    }
  }
  for (let i = 1; i < count; i += 1) {
    out.cum[i] =
      (out.cum[i - 1] as number) +
      Math.hypot(
        (out.xs[i] as number) - (out.xs[i - 1] as number),
        (out.ys[i] as number) - (out.ys[i - 1] as number),
        (out.zs[i] as number) - (out.zs[i - 1] as number),
      );
  }
  out.count = count;
  out.length = out.cum[count - 1] as number;
  return out;
};

/** The point at arc length `at` along a laid path. Rider and renderer both use exactly this. */
export const sampleTonguePath = (laid: LaidTonguePath, at: number, out: { x: number; y: number; z: number }): void => {
  if (laid.count < 2) {
    out.x = laid.xs[0] as number;
    out.y = laid.ys[0] as number;
    out.z = laid.zs[0] as number;
    return;
  }
  const a = Math.min(Math.max(at, 0), laid.length);
  let i = 1;
  while (i < laid.count - 1 && (laid.cum[i] as number) < a) i += 1;
  const c0 = laid.cum[i - 1] as number;
  const c1 = laid.cum[i] as number;
  const t = c1 > c0 ? (a - c0) / (c1 - c0) : 1;
  out.x = (laid.xs[i - 1] as number) + ((laid.xs[i] as number) - (laid.xs[i - 1] as number)) * t;
  out.y = (laid.ys[i - 1] as number) + ((laid.ys[i] as number) - (laid.ys[i - 1] as number)) * t;
  out.z = (laid.zs[i - 1] as number) + ((laid.zs[i] as number) - (laid.zs[i - 1] as number)) * t;
};

/**
 * How far along the curve the rider is, `s` being the fraction of the glide
 * elapsed: a pull that starts firm, peaks, and eases into the landing.
 */
export const tongueGlideU = (s: number): number => {
  const t = s < 0 ? 0 : s > 1 ? 1 : s;
  const eased = t * t * (3 - 2 * t);
  return eased * 0.55 + t * 0.45;
};
