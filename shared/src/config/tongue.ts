/**
/**
 * THE TONGUE: the game's one traversal mechanic, and its tuning.
 *
 * A press (click, the jump key, or the TONGUE button) runs one throw through
 * three phases, all of them part of the SHARED simulation so the server owns
 * the result and the client predicts it exactly:
 *
 *   1. WINDUP  - the head tilts back and the body loads the throw. Rooted.
 *   2. EXTEND  - the tongue flies out and the player STEERS it with the
 *                movement controls, laying the path segment by segment. It
 *                sticks to a platform the path crosses (where the tip would
 *                leave it), or stops at the Tongue Length exactly. Rooted.
 *   3. GLIDE   - the path is frozen and the player rides that exact curve to
 *                its end - onto the platform, or into the air to drop.
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
  /** Most the tip may turn per unit of length it lays, in radians: a smooth curve, never a corner. */
  turnPerUnit: 0.075,
  /** Stick deflection below which the tip is not steered. */
  steerDeadzone: 0.2,
  /** How far outside a platform's edge the tip still counts as over it. */
  captureMargin: 0.8,
  /** Path laid before a platform can catch the tongue, so it never sticks at the lips. */
  stickMinDistance: 3,
  /** Seconds of the ride: base + per unit, and a faster race past `glideFastFrom`. */
  glideBase: 0.32,
  glidePerUnit: 1 / 46,
  glideFastFrom: 40,
  glideFastPerUnit: 1 / 80,
  /** How far inside an edge the tongue must land, so the rider never lands on a lip. */
  edgeInset: 1.0,
  /** Height of the arc's control point above the higher end: base + per unit, gentler past `arcFlattenFrom`. */
  arcBase: 4,
  arcPerUnit: 0.36,
  arcFlattenFrom: 30,
  arcFlatPerUnit: 0.18,
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
 * THE STEERED TONGUE PATH.
 *
 * After the windup the tongue's tip travels out at `tongueExtendSpeed`, and
 * the player STEERS it with the movement controls: every segment the tip lays
 * turns its heading toward the direction held (camera-relative, exactly as
 * walking is), by at most `TONGUE.turnPerUnit` radians per unit of length -
 * so the path is a smooth curve and never a corner. Nothing held: the tip
 * flies straight on. The path stops at the Tongue Length exactly.
 *
 * A path is its START (feet), its initial heading, its segment length and one
 * heading per laid segment. That is all the server replicates, and every
 * point on the curve - drawn or ridden - comes from `layTonguePath` +
 * `sampleTonguePath`, so what is drawn is what is ridden.
 */
export interface TonguePathState extends TongueArc {
  /** Heading the throw left the mouth with (the camera's yaw at the press). */
  tongueYaw0: number;
  /** The Tongue Length at the press: the most path this throw can lay. */
  tongueMax: number;
  /** Length of one laid segment: `tongueMax` split into equal segments. */
  tongueSeg: number;
  /** One heading per laid segment, in order. */
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
 * Turn a heading toward the held direction for one segment of `seg` units.
 * The stick is read camera-relative, exactly as walking reads it: W is the way
 * the camera faces, S behind it, A and D its left and right. A partial stick
 * turns proportionally less. Nothing held: the heading is unchanged.
 */
export const steerTongueHeading = (
  heading: number,
  moveX: number,
  moveZ: number,
  cameraYaw: number,
  seg: number,
): number => {
  const magnitude = Math.min(1, Math.hypot(moveX, moveZ));
  if (magnitude < TONGUE.steerDeadzone) return heading;
  const sin = Math.sin(cameraYaw);
  const cos = Math.cos(cameraYaw);
  const dirX = moveZ * sin - moveX * cos;
  const dirZ = moveZ * cos + moveX * sin;
  const desired = Math.atan2(dirX, dirZ);
  let diff = desired - heading;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff <= -Math.PI) diff += Math.PI * 2;
  const limit = TONGUE.turnPerUnit * seg * magnitude;
  return heading + (Math.abs(diff) <= limit ? diff : Math.sign(diff) * limit);
};

/** Arch height of a path this long: how far the tongue curves up between its ends. */
export const tongueArchHeight = (length: number): number => {
  const d = Math.max(0, length);
  return (
    0.5 *
    (TONGUE.arcBase +
      Math.min(d, TONGUE.arcFlattenFrom) * TONGUE.arcPerUnit +
      Math.max(0, d - TONGUE.arcFlattenFrom) * TONGUE.arcFlatPerUnit)
  );
};

/** A path laid out as points in the horizontal plane, with running arc length. */
export interface LaidTonguePath {
  readonly xs: Float64Array;
  readonly zs: Float64Array;
  readonly cum: Float64Array;
  /** Points used, the start included. */
  count: number;
  /** Total horizontal length. */
  length: number;
}

/** Most points a path can have: a 200-stud tongue in 2-stud segments, the start and a tip. */
const MAX_POINTS = 256;

export const createLaidTonguePath = (): LaidTonguePath => ({
  xs: new Float64Array(MAX_POINTS),
  zs: new Float64Array(MAX_POINTS),
  cum: new Float64Array(MAX_POINTS),
  count: 0,
  length: 0,
});

/**
 * Lay a path's points.
 *
 * @param extended  while deploying: how far the tip has travelled; the tip is
 *                  drawn that far along the last heading beyond the laid points
 *                  (pass the laid length or less to draw just the laid points)
 * @param locked    the path is frozen: its last point is pinned to (ex, ez),
 *                  where the tongue stuck or ran out
 */
export const layTonguePath = (
  path: TonguePathState,
  extended: number,
  locked: boolean,
  out: LaidTonguePath,
): LaidTonguePath => {
  const headings = path.tongueHeadings;
  const n = Math.min(headings.length, MAX_POINTS - 2);
  out.xs[0] = path.sx;
  out.zs[0] = path.sz;
  out.cum[0] = 0;
  let count = 1;
  let heading = path.tongueYaw0;
  for (let i = 0; i < n; i += 1) {
    heading = headings[i] as number;
    out.xs[count] = (out.xs[count - 1] as number) + Math.sin(heading) * path.tongueSeg;
    out.zs[count] = (out.zs[count - 1] as number) + Math.cos(heading) * path.tongueSeg;
    count += 1;
  }
  if (locked) {
    if (count > 1) {
      out.xs[count - 1] = path.ex;
      out.zs[count - 1] = path.ez;
    }
  } else {
    const beyond = Math.min(extended, path.tongueMax) - n * path.tongueSeg;
    if (beyond > 1e-6) {
      out.xs[count] = (out.xs[count - 1] as number) + Math.sin(heading) * beyond;
      out.zs[count] = (out.zs[count - 1] as number) + Math.cos(heading) * beyond;
      count += 1;
    }
  }
  for (let i = 1; i < count; i += 1) {
    out.cum[i] =
      (out.cum[i - 1] as number) +
      Math.hypot((out.xs[i] as number) - (out.xs[i - 1] as number), (out.zs[i] as number) - (out.zs[i - 1] as number));
  }
  out.count = count;
  out.length = out.cum[count - 1] as number;
  return out;
};

/**
 * A point on a laid path at arc length `at`, with the tongue's arch: the height
 * runs from `startY` to `endY` along the path, bowed up by `tongueArchHeight`
 * in the middle. Both the rider and the renderer use exactly this.
 */
export const sampleTonguePath = (
  laid: LaidTonguePath,
  at: number,
  startY: number,
  endY: number,
  out: { x: number; y: number; z: number },
): void => {
  const length = laid.length;
  const a = length <= 0 ? 0 : Math.min(Math.max(at, 0), length);
  let i = 1;
  while (i < laid.count - 1 && (laid.cum[i] as number) < a) i += 1;
  if (laid.count < 2) {
    out.x = laid.xs[0] as number;
    out.z = laid.zs[0] as number;
  } else {
    const c0 = laid.cum[i - 1] as number;
    const c1 = laid.cum[i] as number;
    const t = c1 > c0 ? (a - c0) / (c1 - c0) : 1;
    out.x = (laid.xs[i - 1] as number) + ((laid.xs[i] as number) - (laid.xs[i - 1] as number)) * t;
    out.z = (laid.zs[i - 1] as number) + ((laid.zs[i] as number) - (laid.zs[i - 1] as number)) * t;
  }
  const f = length > 0 ? a / length : 0;
  out.y = startY + (endY - startY) * f + tongueArchHeight(length) * 4 * f * (1 - f);
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
