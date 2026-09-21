import {
  MOVEMENT,
  TONGUE,
  TREADMILLS,
  TonguePhase,
  WorldCollision,
  copyMotion,
  createMotion,
  createSimEvents,
  horizontalSpeed,
  resetMotion,
  stepPlayer,
  tongueDistance,
  tongueExtendSeconds,
  tongueGlideSeconds,
  type MoveMessage,
  type MovementInput,
  type PlayerMotion,
  type SimParams,
} from '@tongue/shared';
import { Vector3 } from 'three';
import { createAnimationInput, type AnimationInput } from '../animation/AnimationInput.js';
import { DEATH } from '../config/animationConfig.js';
import type { TongueView } from '../effects/TongueRenderer.js';
import type { InputState } from '../input/InputState.js';
import { NamePlate } from './NamePlate.js';
import { PlayerCharacter } from './PlayerCharacter.js';

const MAX_PENDING_INPUTS = 240;
const FIXED_DT = 1 / 60;
const MAX_STEPS_PER_FRAME = 5;
const ARRIVE_DURATION = 0.16;
const RESPAWN_ACK_TIMEOUT = 1.5;
const RESPAWN_NUDGE_INTERVAL = 0.75;
const SNAP_DISTANCE = 5;
const CORRECTION_RATE = 14;

const lerp = (from: number, to: number, alpha: number): number => from + (to - from) * alpha;

const EMPTY_INPUTS: MoveMessage[] = [];

export type PlacementKind = 'none' | 'respawn' | 'correction';

interface PendingInput {
  seq: number;
  dt: number;
  input: MovementInput;
}

/** The authoritative fields the client reconciles against: EVERY field of `PlayerMotion`. */
export interface AuthoritativeMotion {
  x: number;
  y: number;
  z: number;
  rotationY: number;
  velocityX: number;
  velocityY: number;
  velocityZ: number;
  grounded: boolean;
  lastInputSeq: number;
  tonguePhase: number;
  tongueTime: number;
  tongueHit: boolean;
  tongueLatched: boolean;
  tongueCount: number;
  tongueSX: number;
  tongueSY: number;
  tongueSZ: number;
  tongueEX: number;
  tongueEY: number;
  tongueEZ: number;
}

/**
 * The locally controlled character: a PREDICTION of a server-owned simulation.
 *
 * Runs the identical `stepPlayer` - tongue throws included - so the character
 * responds instantly, keeps every input the server has not acknowledged, and
 * on each server update snaps to the authoritative state and replays them.
 */
export class LocalPlayer {
  readonly character: PlayerCharacter;
  readonly position = new Vector3();
  readonly velocity = new Vector3();

  private readonly previous = { x: 0, y: 0, z: 0 };
  private readonly motion: PlayerMotion = createMotion();
  private readonly events = createSimEvents();
  private readonly replayEvents = createSimEvents();
  private readonly collision: WorldCollision;
  private readonly params: SimParams = { length: TONGUE.baseLength };

  private readonly pending: PendingInput[] = [];
  private nextSeq = 1;
  private readonly outgoing: MoveMessage[] = [];
  private accumulator = 0;
  private readonly correction = new Vector3();
  private placement: PlacementKind = 'none';
  private deathTime = -1;
  private arriveTime = -1;
  private awaitingRespawn = false;
  private respawnWait = 0;
  private stuckTime = -1;
  private turnSignal = 0;
  /**
   * A press that has not yet reached a simulation step. A click lasts one
   * frame, and a frame on a fast display may run no fixed step at all - so a
   * press is HELD here until a step has consumed it, and never lost.
   */
  private pressPending = false;
  private wasHeld = false;
  private readonly animationInput: AnimationInput = createAnimationInput();
  private readonly plate = new NamePlate();
  private readonly view: TongueView = {
    phase: TonguePhase.None,
    time: 0,
    arc: { sx: 0, sy: 0, sz: 0, ex: 0, ey: 0, ez: 0 },
    hit: true,
  };

  /** Edges this frame, for sound and camera. */
  thrownEdge = false;
  attachedEdge = false;
  arrivedEdge = false;
  landedEdge = false;

  constructor(collision: WorldCollision) {
    this.collision = collision;
    this.character = new PlayerCharacter();
    this.character.root.add(this.plate.sprite);
    this.previous.x = this.motion.x;
    this.previous.y = this.motion.y;
    this.previous.z = this.motion.z;
    this.syncFromMotion();
    this.syncCharacter();
  }

  get horizontalSpeed(): number {
    return horizontalSpeed(this.motion);
  }

  get isGrounded(): boolean {
    return this.motion.grounded;
  }

  get onTreadmill(): boolean {
    return this.motion.treadmill > 0;
  }

  get treadmill(): number {
    return this.motion.treadmill;
  }

  get tonguePhase(): TonguePhase {
    return this.motion.tonguePhase;
  }

  /** The throw's arc, for the camera to frame. */
  get tongueArc(): Readonly<PlayerMotion> {
    return this.motion;
  }

  get maxRunSpeed(): number {
    return MOVEMENT.moveSpeed;
  }

  drainOutgoing(): MoveMessage[] {
    if (this.outgoing.length === 0) return EMPTY_INPUTS;
    const batch = this.outgoing.slice();
    this.outgoing.length = 0;
    return batch;
  }

  /** The server's Tongue Length stat: how far a throw can reach. Changes only on a level-up. */
  setTongueLength(length: number): void {
    if (Number.isFinite(length) && length > 0) this.params.length = length;
  }

  setCosmetics(trailSlot: number, tongueSlot: number, tongueLength: number): void {
    this.character.setCosmetics(trailSlot, tongueSlot, tongueLength);
  }

  setDisplayName(displayName: string, avatarUrl: string): void {
    this.plate.set(displayName, avatarUrl, this.character.height);
  }

  teleport(x: number, y: number, z: number, rotationY: number): void {
    resetMotion(this.motion, x, y, z, rotationY);
    this.previous.x = x;
    this.previous.y = y;
    this.previous.z = z;
    this.pending.length = 0;
    this.outgoing.length = 0;
    this.accumulator = 0;
    this.correction.set(0, 0, 0);
    this.placement = 'respawn';
    this.deathTime = -1;
    this.stuckTime = -1;
    this.arriveTime = 0;
    this.pressPending = false;
    this.character.resetAnimation();
    this.character.setVisualScale(0.15);
    this.syncFromMotion();
    this.syncCharacter();
  }

  beginDeath(): void {
    if (this.deathTime >= 0) return;
    this.deathTime = 0;
    this.arriveTime = -1;
    this.awaitingRespawn = true;
    this.respawnWait = 0;
    this.stuckTime = -1;
    this.pending.length = 0;
    this.outgoing.length = 0;
    this.correction.set(0, 0, 0);
    this.accumulator = 0;
    this.motion.vx = 0;
    this.motion.vy = 0;
    this.motion.vz = 0;
    this.motion.tonguePhase = TonguePhase.None;
  }

  get isDying(): boolean {
    return this.deathTime >= 0;
  }

  get deathComplete(): boolean {
    return this.deathTime >= DEATH.duration;
  }

  consumeRespawnNudge(): boolean {
    if (this.stuckTime < RESPAWN_NUDGE_INTERVAL) return false;
    this.stuckTime = 0;
    return true;
  }

  acknowledgeRespawn(): void {
    this.awaitingRespawn = false;
    this.respawnWait = 0;
  }

  reconcile(state: AuthoritativeMotion): void {
    if (this.awaitingRespawn) return;

    const predictedX = this.motion.x;
    const predictedY = this.motion.y;
    const predictedZ = this.motion.z;

    const m = this.motion;
    m.x = state.x;
    m.y = state.y;
    m.z = state.z;
    m.vx = state.velocityX;
    m.vy = state.velocityY;
    m.vz = state.velocityZ;
    m.yaw = state.rotationY;
    m.grounded = state.grounded;
    m.tonguePhase = state.tonguePhase as TonguePhase;
    m.tongueTime = state.tongueTime;
    m.tongueHit = state.tongueHit;
    m.tongueLatched = state.tongueLatched;
    m.tongueCount = state.tongueCount;
    m.sx = state.tongueSX;
    m.sy = state.tongueSY;
    m.sz = state.tongueSZ;
    m.ex = state.tongueEX;
    m.ey = state.tongueEY;
    m.ez = state.tongueEZ;

    let kept = 0;
    for (const entry of this.pending) {
      if (entry.seq <= state.lastInputSeq) continue;
      this.pending[kept] = entry;
      kept += 1;
    }
    this.pending.length = kept;

    for (const entry of this.pending) {
      stepPlayer(m, entry.input, this.params, entry.dt, this.collision, this.replayEvents);
    }

    const dx = predictedX - m.x;
    const dy = predictedY - m.y;
    const dz = predictedZ - m.z;
    const snapped = Math.hypot(dx, dy, dz) > SNAP_DISTANCE;
    this.correction.set(snapped ? 0 : dx, snapped ? 0 : dy, snapped ? 0 : dz);
    if (snapped) {
      this.previous.x = m.x;
      this.previous.y = m.y;
      this.previous.z = m.z;
      if (this.placement === 'none') this.placement = 'correction';
    }
    this.syncFromMotion();
    this.syncCharacter();
  }

  update(delta: number, input: Readonly<InputState>, cameraYaw: number): void {
    this.tickRespawnBarrier(delta);
    this.thrownEdge = false;
    this.attachedEdge = false;
    this.arrivedEdge = false;
    this.landedEdge = false;

    if (this.deathTime >= 0) {
      this.deathTime += delta;
      if (this.deathTime >= DEATH.duration) this.stuckTime = this.stuckTime < 0 ? 0 : this.stuckTime + delta;
      this.emitIdleInputs(delta);
      this.updateAnimation(delta, true);
      this.character.updateEffects(delta, 0, null);
      return;
    }

    // A fresh press is remembered until a step takes it.
    if (input.tongue && !this.wasHeld) this.pressPending = true;
    this.wasHeld = input.tongue;

    this.accumulator += Math.max(0, delta);
    this.turnSignal = input.moveX;

    let steps = 0;
    while (this.accumulator >= FIXED_DT && steps < MAX_STEPS_PER_FRAME) {
      this.accumulator -= FIXED_DT;
      steps += 1;

      const movement: MovementInput = {
        moveX: input.moveX,
        moveZ: input.moveZ,
        tongue: this.pressPending || input.tongue,
        cameraYaw,
      };
      this.pressPending = false;

      const seq = this.nextSeq;
      this.nextSeq += 1;
      this.previous.x = this.motion.x;
      this.previous.y = this.motion.y;
      this.previous.z = this.motion.z;

      stepPlayer(this.motion, movement, this.params, FIXED_DT, this.collision, this.events);
      this.thrownEdge = this.thrownEdge || this.events.tongueThrown;
      this.attachedEdge = this.attachedEdge || this.events.tongueAttached;
      this.arrivedEdge = this.arrivedEdge || this.events.tongueArrived;
      this.landedEdge = this.landedEdge || this.events.landed;

      this.pending.push({ seq, dt: FIXED_DT, input: movement });
      if (this.pending.length > MAX_PENDING_INPUTS) this.pending.shift();
      this.outgoing.push({
        seq,
        dt: FIXED_DT,
        moveX: movement.moveX,
        moveZ: movement.moveZ,
        tongue: movement.tongue,
        cameraYaw,
      });
    }
    if (this.accumulator > FIXED_DT * MAX_STEPS_PER_FRAME) this.accumulator = 0;

    this.advanceArrival(delta);
    this.decayCorrection(delta);
    this.syncFromMotion();
    this.syncCharacter();
    this.updateAnimation(delta, false);
    this.character.updateEffects(delta, this.onTreadmill ? 0 : this.horizontalSpeed, this.tongueView());
  }

  consumePlacement(): PlacementKind {
    const kind = this.placement;
    this.placement = 'none';
    return kind;
  }

  readMotion(into: PlayerMotion): void {
    copyMotion(this.motion, into);
  }

  private tongueView(): TongueView | null {
    const m = this.motion;
    const view = this.view;
    view.phase = m.tonguePhase;
    // The body is drawn a fraction of a step behind the simulation; so is the tongue.
    view.time = Math.max(0, m.tongueTime - FIXED_DT + this.accumulator);
    view.hit = m.tongueHit;
    view.arc.sx = m.sx;
    view.arc.sy = m.sy;
    view.arc.sz = m.sz;
    view.arc.ex = m.ex;
    view.arc.ey = m.ey;
    view.arc.ez = m.ez;
    return view;
  }

  /** The speed the FEET move at: the belt's, on a treadmill. */
  private get feetSpeed(): number {
    return this.onTreadmill ? TREADMILLS.beltSpeed : this.horizontalSpeed;
  }

  private phaseProgress(): number {
    const m = this.motion;
    switch (m.tonguePhase) {
      case TonguePhase.Windup:
        return m.tongueTime / TONGUE.windup;
      case TonguePhase.Extend:
        return m.tongueTime / tongueExtendSeconds(tongueDistance(m));
      case TonguePhase.Glide:
        return m.tongueTime / tongueGlideSeconds(tongueDistance(m));
      default:
        return 0;
    }
  }

  private advanceArrival(delta: number): void {
    if (this.arriveTime < 0) return;
    this.arriveTime += delta;
    const t = Math.min(this.arriveTime / ARRIVE_DURATION, 1);
    if (t >= 1) {
      this.arriveTime = -1;
      this.character.setVisualScale(1);
      return;
    }
    this.character.setVisualScale(0.15 + 0.85 * t * (2 - t) + 0.08 * Math.sin(t * Math.PI));
  }

  private emitIdleInputs(delta: number): void {
    this.accumulator += Math.max(0, delta);
    let steps = 0;
    while (this.accumulator >= FIXED_DT && steps < MAX_STEPS_PER_FRAME) {
      this.accumulator -= FIXED_DT;
      steps += 1;
      this.outgoing.push({ seq: this.nextSeq, dt: FIXED_DT, moveX: 0, moveZ: 0, tongue: false, cameraYaw: this.motion.yaw });
      this.nextSeq += 1;
    }
    if (this.accumulator > FIXED_DT * MAX_STEPS_PER_FRAME) this.accumulator = 0;
  }

  private tickRespawnBarrier(delta: number): void {
    if (!this.awaitingRespawn) return;
    this.respawnWait += delta;
    if (this.respawnWait < RESPAWN_ACK_TIMEOUT) return;
    this.awaitingRespawn = false;
    this.respawnWait = 0;
  }

  private decayCorrection(delta: number): void {
    if (this.correction.lengthSq() < 1e-8) {
      this.correction.set(0, 0, 0);
      return;
    }
    this.correction.multiplyScalar(Math.exp(-CORRECTION_RATE * delta));
  }

  private syncFromMotion(): void {
    const alpha = Math.min(Math.max(this.accumulator / FIXED_DT, 0), 1);
    this.position.set(
      lerp(this.previous.x, this.motion.x, alpha) + this.correction.x,
      lerp(this.previous.y, this.motion.y, alpha) + this.correction.y,
      lerp(this.previous.z, this.motion.z, alpha) + this.correction.z,
    );
    this.velocity.set(this.motion.vx, this.motion.vy, this.motion.vz);
  }

  private updateAnimation(delta: number, dying: boolean): void {
    const a = this.animationInput;
    a.grounded = this.motion.grounded;
    a.horizontalSpeed = this.feetSpeed;
    a.verticalVelocity = this.motion.vy;
    a.turn = dying ? 0 : this.turnSignal;
    a.tonguePhase = dying ? TonguePhase.None : this.motion.tonguePhase;
    a.tongueProgress = this.phaseProgress();
    a.landed = !dying && this.landedEdge;
    a.dying = dying;
    this.character.update(delta, a);
  }

  private syncCharacter(): void {
    this.character.setPosition(this.position.x, this.position.y, this.position.z);
    this.character.root.rotation.y = this.motion.yaw;
  }
}
