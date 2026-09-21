/**
 * THE TONGUE: the game's one traversal mechanic, and its tuning.
 *
 * A press (click, the jump key, or the TONGUE button) runs one throw through
 * three phases, all of them part of the SHARED simulation so the server owns
 * the result and the client predicts it exactly:
 *
 *   1. WINDUP  - the head tilts back and the body loads the throw. Rooted.
 *   2. EXTEND  - the tongue flies out along its arc and slaps onto the ground
 *                at the target. Rooted.
 *   3. GLIDE   - the player rides the curve to the endpoint, then walks.
 *
 * The TARGET is found from the server's own state (`findTongueTarget`): the
 * reachable island or platform AHEAD, searched within a narrow forward cone.
 * When none is in reach the tongue flies out to its full LENGTH - no further -
 * and ends in the air; the rider races to that end and drops. Nothing about a
 * throw is ever sent by a client except "pressed" and which way it faced.
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
  /** Seconds the tongue takes to reach its target: base + per unit of distance. */
  extendBase: 0.12,
  extendPerUnit: 1 / 190,
  /** Seconds of the ride: base + per unit, and a faster race past `glideFastFrom`. */
  glideBase: 0.32,
  glidePerUnit: 1 / 46,
  glideFastFrom: 40,
  glideFastPerUnit: 1 / 80,
  /** Nothing closer than this is worth a throw: the tongue looks further. */
  minDistance: 5,
  /** Spacing of the samples along the aim when looking for ground. */
  sampleStep: 0.5,
  /** How far inside an edge the tongue must land, so the rider never lands on a lip. */
  edgeInset: 1.0,
  /** Height of the arc's control point above the higher end: base + per unit, gentler past `arcFlattenFrom`. */
  arcBase: 4,
  arcPerUnit: 0.36,
  arcFlattenFrom: 30,
  arcFlatPerUnit: 0.18,
  /** Half-angle of the forward cone searched for a platform, and its step, in degrees. */
  coneDegrees: 24,
  coneStepDegrees: 6,
  /** Fraction of the ride's speed a rider keeps when a tongue ends in the air. */
  missCarry: 0.25,
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

/** Seconds the EXTEND phase lasts for a throw of this length. */
export const tongueExtendSeconds = (distance: number): number =>
  TONGUE.extendBase + Math.max(0, distance) * TONGUE.extendPerUnit;

/** Seconds the GLIDE phase lasts for a throw of this length. */
export const tongueGlideSeconds = (distance: number): number => {
  const d = Math.max(0, distance);
  return (
    TONGUE.glideBase +
    Math.min(d, TONGUE.glideFastFrom) * TONGUE.glidePerUnit +
    Math.max(0, d - TONGUE.glideFastFrom) * TONGUE.glideFastPerUnit
  );
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

/** Straight-line length of a throw. */
export const tongueDistance = (arc: TongueArc): number =>
  Math.hypot(arc.ex - arc.sx, arc.ey - arc.sy, arc.ez - arc.sz);

/** Height of the arc's control point. */
export const tongueControlY = (arc: TongueArc): number => {
  const d = tongueDistance(arc);
  return (
    Math.max(arc.sy, arc.ey) +
    TONGUE.arcBase +
    Math.min(d, TONGUE.arcFlattenFrom) * TONGUE.arcPerUnit +
    Math.max(0, d - TONGUE.arcFlattenFrom) * TONGUE.arcFlatPerUnit
  );
};

/**
 * A point on the throw's curve: a quadratic Bezier from the start, over a
 * control point raised above the midpoint, to the end. The rider follows
 * exactly this; the renderer draws exactly this.
 */
export const tonguePointAt = (
  arc: TongueArc,
  u: number,
  out: { x: number; y: number; z: number },
): void => {
  const t = u < 0 ? 0 : u > 1 ? 1 : u;
  const a = (1 - t) * (1 - t);
  const b = 2 * (1 - t) * t;
  const c = t * t;
  const cx = (arc.sx + arc.ex) / 2;
  const cz = (arc.sz + arc.ez) / 2;
  const cy = tongueControlY(arc);
  out.x = a * arc.sx + b * cx + c * arc.ex;
  out.y = a * arc.sy + b * cy + c * arc.ey;
  out.z = a * arc.sz + b * cz + c * arc.ez;
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
