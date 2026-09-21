import { TonguePhase } from '@tongue/shared';

/**
 * The gameplay signals the animator consumes each frame. It reads these and
 * never writes back. The local player fills it from its prediction and every
 * remote from replicated state, so both run the exact same animation code.
 */
export interface AnimationInput {
  grounded: boolean;
  /** Horizontal speed in world units per second (the belt's, on a treadmill). */
  horizontalSpeed: number;
  verticalVelocity: number;
  /** -1..1 steering, for the lean. */
  turn: number;
  /** The throw in progress: windup, extend, glide - or none. */
  tonguePhase: TonguePhase;
  /** 0..1 through the current tongue phase. */
  tongueProgress: number;
  landed: boolean;
  dying: boolean;
}

export const createAnimationInput = (): AnimationInput => ({
  grounded: true,
  horizontalSpeed: 0,
  verticalVelocity: 0,
  turn: 0,
  tonguePhase: TonguePhase.None,
  tongueProgress: 0,
  landed: false,
  dying: false,
});
