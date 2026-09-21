/**
 * Movement tuning for a WALKING CHARACTER.
 *
 * The client predicts with these numbers and the server simulates with them,
 * so there is exactly one copy. There are TWO ways to move and no others:
 * walking, and the tongue (see `tongue.ts`). There is NO jump - the jump key
 * throws the tongue.
 */
export interface MovementConfig {
  /** Walk speed, world units per second. */
  readonly moveSpeed: number;
  readonly acceleration: number;
  readonly deceleration: number;
  /** Fraction of ground acceleration retained while airborne (walking off a ledge). */
  readonly airControl: number;
  /** Downward acceleration, world units per second squared. */
  readonly gravity: number;
  /** Turn rate toward the movement direction, radians per second. */
  readonly turnSpeed: number;
  /** Largest distance one substep may integrate. */
  readonly maxSubstepDistance: number;
  readonly maxSubsteps: number;
  /**
   * Height the character steps up without help. Stair risers, the stage
   * slabs and the treadmill belts are all below it; every island edge in the
   * lava is far above it, which is what makes the tongue the only way across.
   */
  readonly stepHeight: number;
}

export const MOVEMENT: MovementConfig = {
  moveSpeed: 16,
  acceleration: 90,
  deceleration: 80,
  airControl: 0.35,
  gravity: 70,
  turnSpeed: 11,
  maxSubstepDistance: 0.6,
  maxSubsteps: 48,
  stepHeight: 1.0,
};
