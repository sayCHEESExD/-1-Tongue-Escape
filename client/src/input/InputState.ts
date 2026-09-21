/** Normalised, device-agnostic input snapshot consumed by the player controller. */
export interface InputState {
  /** -1 (left) .. 1 (right), camera-relative. */
  moveX: number;
  /** -1 (back) .. 1 (forward), camera-relative. */
  moveZ: number;
  /**
   * The TONGUE control, HELD: a left click on the world, Space (the jump key
   * throws the tongue - there is no jump), or the on-screen TONGUE button.
   * Only a fresh press throws; the shared simulation edge-detects it.
   */
  tongue: boolean;
}

export const createInputState = (): InputState => ({ moveX: 0, moveZ: 0, tongue: false });
