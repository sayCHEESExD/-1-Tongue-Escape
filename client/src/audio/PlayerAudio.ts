import type { AudioManager } from './AudioManager.js';

const MIN_AUDIBLE_SPEED = 2.5;
const STRIDE_DISTANCE = 2.6;
const MAX_STEPS_PER_SECOND = 7;

export interface PlayerAudioInput {
  readonly horizontalSpeed: number;
  readonly maxRunSpeed: number;
  readonly isGrounded: boolean;
  readonly isDying: boolean;
  readonly onTreadmill: boolean;
  readonly thrownEdge: boolean;
  readonly attachedEdge: boolean;
  readonly landedEdge: boolean;
}

/**
 * The local player's sounds: footfalls per stride (the belt's, on a
 * treadmill), the "thwip" of a throw, the splat as it sticks, the landing, and
 * the fall into the lava.
 */
export class PlayerAudio {
  private stride = 0;
  private sinceBeat = 0;
  private wasDying = false;

  constructor(private readonly audio: AudioManager) {}

  update(delta: number, player: PlayerAudioInput): void {
    if (player.isDying) {
      if (!this.wasDying) {
        this.wasDying = true;
        this.audio.play('death');
      }
      this.stride = 0;
      return;
    }
    this.wasDying = false;

    if (player.thrownEdge) this.audio.play('tongue');
    if (player.attachedEdge) this.audio.play('attach', 0.8);
    if (player.landedEdge) this.audio.play('land', 0.7);

    this.sinceBeat += delta;
    if (!player.isGrounded) {
      this.stride = 0;
      return;
    }
    const pace = player.onTreadmill ? player.maxRunSpeed : player.horizontalSpeed;
    if (pace < MIN_AUDIBLE_SPEED) {
      this.stride = 0;
      return;
    }
    this.stride += pace * delta;
    if (this.stride < STRIDE_DISTANCE) return;
    this.stride = 0;
    if (this.sinceBeat < 1 / MAX_STEPS_PER_SECOND) return;
    this.sinceBeat = 0;
    this.audio.play('step', 0.5);
  }
}
