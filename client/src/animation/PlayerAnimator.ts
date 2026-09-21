import { TonguePhase } from '@tongue/shared';
import type { Group } from 'three';
import { AIRBORNE, DEATH, IDLE, LANDING, LOCOMOTION, TONGUE_POSES, TRANSITIONS } from '../config/animationConfig.js';
import type { AnimationInput } from './AnimationInput.js';
import { LocomotionCycle } from './LocomotionCycle.js';
import { PoseBuffer } from './PoseBuffer.js';
import type { PlayerRig } from './rig/PlayerRig.js';

/**
 * TWO ways to move, and the animator has exactly those: the WALK (idle and the
 * locomotion cycle) and the TONGUE (windup, throw, glide). Falling off a ledge
 * and the fall-over into the lava are the only other states.
 */
export type AnimationState = 'idle' | 'run' | 'windup' | 'throw' | 'glide' | 'airborne' | 'landing' | 'dying';

const clamp = (value: number, min: number, max: number): number => (value < min ? min : value > max ? max : value);
const ease = (t: number): number => t * t * (3 - 2 * t);

/**
 * Writes ONLY to bones (via `PlayerRig`) and to the visual node's position and
 * rotation. It never touches the physics root.
 */
export class PlayerAnimator {
  private readonly locomotion = new LocomotionCycle();
  private readonly target = new PoseBuffer();
  private readonly from = new PoseBuffer();
  private readonly output = new PoseBuffer();

  private state: AnimationState = 'idle';
  private stateTime = 0;
  private blendTime = 0;
  private blendDuration = 0;
  private idleTime = 0;
  private wasGrounded = true;
  private lean = 0;
  private bank = 0;

  constructor(
    private rig: PlayerRig,
    private readonly visual: Group,
  ) {}

  get currentState(): AnimationState {
    return this.state;
  }

  setRig(rig: PlayerRig): void {
    this.rig = rig;
  }

  reset(): void {
    this.state = 'idle';
    this.stateTime = 0;
    this.blendDuration = 0;
    this.wasGrounded = true;
    this.lean = 0;
    this.bank = 0;
    this.target.reset();
    this.from.reset();
    this.output.reset();
    this.rig.resetToBindPose();
    this.visual.position.set(0, 0, 0);
    this.visual.rotation.set(0, 0, 0);
  }

  update(delta: number, input: AnimationInput): void {
    const dt = Math.max(0, delta);
    this.stateTime += dt;
    this.resolveState(input);
    this.writePose(dt, input);
    this.apply(dt, input);
  }

  private resolveState(input: AnimationInput): void {
    if (input.dying) {
      this.setState('dying', TRANSITIONS.toDeath);
      return;
    }
    if (this.state === 'dying') this.setState('idle', TRANSITIONS.toLocomotion);

    switch (input.tonguePhase) {
      case TonguePhase.Windup:
        this.setState('windup', TRANSITIONS.toWindup);
        this.wasGrounded = false;
        return;
      case TonguePhase.Extend:
        this.setState('throw', TRANSITIONS.toThrow);
        this.wasGrounded = false;
        return;
      case TonguePhase.Glide:
        this.setState('glide', TRANSITIONS.toGlide);
        this.wasGrounded = false;
        return;
      default:
        break;
    }

    if (input.landed || (input.grounded && !this.wasGrounded)) {
      this.wasGrounded = true;
      this.setState('landing', TRANSITIONS.toLanding);
      return;
    }
    this.wasGrounded = input.grounded;

    if (!input.grounded) {
      this.setState('airborne', TRANSITIONS.toAirborne);
      return;
    }
    if (this.state === 'landing' && this.stateTime < LANDING.duration) return;
    this.setState(input.horizontalSpeed < LOCOMOTION.idleSpeed ? 'idle' : 'run', TRANSITIONS.toLocomotion);
  }

  private setState(next: AnimationState, duration: number): void {
    if (next === this.state) return;
    this.from.copyFrom(this.output);
    this.state = next;
    this.stateTime = 0;
    this.blendTime = 0;
    this.blendDuration = duration;
  }

  private writePose(dt: number, input: AnimationInput): void {
    switch (this.state) {
      case 'idle': {
        this.locomotion.settleTowardNeutral(dt);
        this.idleTime += dt;
        const breath = Math.sin(this.idleTime * IDLE.breathFrequency * Math.PI * 2);
        this.target.applyDefinition(IDLE.basePose);
        this.target.add('Spine1', breath * IDLE.breathAmount);
        this.target.add('Neck1', -breath * IDLE.breathAmount * 0.6);
        this.target.bobY = breath * IDLE.breathBob;
        break;
      }
      case 'run':
        this.locomotion.advance(dt, input.horizontalSpeed, 1, false);
        this.locomotion.writePose(this.target, input.horizontalSpeed, 1);
        break;
      case 'windup': {
        // The effort builds: deeper the longer it is held, with a tremble.
        const t = ease(clamp(input.tongueProgress, 0, 1));
        const shake = Math.sin(this.stateTime * 60) * 0.03 * t;
        this.target.applyDefinition(TONGUE_POSES.windup, 0.45 + 0.55 * t);
        this.target.add('Neck1', shake);
        this.target.add('Spine1', -shake);
        this.target.bobY = TONGUE_POSES.windupBob * t;
        break;
      }
      case 'throw':
        this.target.applyDefinition(TONGUE_POSES.throw);
        this.target.bobY = -0.06;
        break;
      case 'glide': {
        this.target.applyDefinition(TONGUE_POSES.glide);
        // Legs kick a little as they trail.
        const kick = Math.sin(this.stateTime * 14) * 0.12;
        this.target.add('LegL1', kick);
        this.target.add('LegR1', -kick);
        this.target.bobY = 0;
        break;
      }
      case 'airborne':
        this.target.applyDefinition(AIRBORNE.fall);
        this.target.bobY = 0;
        break;
      case 'landing': {
        const depth = 1 - ease(clamp(this.stateTime / LANDING.duration, 0, 1));
        this.target.applyDefinition(LANDING.pose, depth);
        this.target.bobY = LANDING.bobY * depth;
        break;
      }
      case 'dying':
        this.target.applyDefinition(DEATH.pose);
        this.target.bobY = 0;
        break;
    }
  }

  private apply(dt: number, input: AnimationInput): void {
    if (this.blendDuration > 0) {
      this.blendTime += dt;
      const t = clamp(this.blendTime / this.blendDuration, 0, 1);
      this.output.lerpBetween(this.from, this.target, ease(t));
      if (t >= 1) this.blendDuration = 0;
    } else {
      this.output.copyFrom(this.target);
    }
    this.rig.applyPose(this.output);

    if (this.state === 'dying') {
      const t = ease(clamp(this.stateTime / DEATH.duration, 0, 1));
      this.visual.rotation.set(DEATH.pitch * t, 0, DEATH.roll * t);
      this.visual.position.y = -DEATH.drop * t;
      return;
    }

    // The whole-body lean: back in the windup, forward on the throw and the ride.
    const wantLean =
      this.state === 'windup'
        ? TONGUE_POSES.windupLean * ease(clamp(input.tongueProgress, 0, 1))
        : this.state === 'throw'
          ? TONGUE_POSES.throwLean
          : this.state === 'glide'
            ? TONGUE_POSES.glideLean
            : 0;
    this.lean += (wantLean - this.lean) * (1 - Math.exp(-14 * dt));

    const wantBank = this.state === 'run' ? -input.turn * LOCOMOTION.bankAngle * 0.6 : 0;
    this.bank += (wantBank - this.bank) * (1 - Math.exp(-LOCOMOTION.bankRate * dt));

    this.visual.rotation.set(this.lean, 0, this.bank);
    this.visual.position.y = this.output.bobY;
  }
}
