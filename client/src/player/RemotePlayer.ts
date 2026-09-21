import {
  TONGUE,
  TREADMILLS,
  TonguePhase,
  tongueDistance,
  tongueExtendSeconds,
  tongueGlideSeconds,
  tongueGlideU,
  tonguePointAt,
} from '@tongue/shared';
import { DEATH } from '../config/animationConfig.js';
import { createAnimationInput, type AnimationInput } from '../animation/AnimationInput.js';
import type { TongueView } from '../effects/TongueRenderer.js';
import type { NetPlayerState } from '../net/netTypes.js';
import { AvatarDresser } from '../bloxity/AvatarDresser.js';
import { lookFromState } from '../bloxity/avatarLook.js';
import { NamePlate } from './NamePlate.js';
import { PlayerCharacter } from './PlayerCharacter.js';

const FOLLOW_RATE = 14;
const SNAP_DISTANCE = 12;
/** A replayed throw drifting further than this from the server's clock is resynced. */
const RESYNC_SECONDS = 0.25;

const shortestAngle = (from: number, to: number): number => {
  let diff = to - from;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
};

/**
 * Another player's character, rendered from replicated state ONLY.
 *
 * Walking is smoothed toward the replicated transform. A THROW is replayed
 * locally from its replicated arc - the same `tonguePointAt` the simulation
 * rides - so a remote sails along the exact curve, and their tongue is drawn
 * along it, rather than cutting the corners of a 20 Hz stream.
 */
export class RemotePlayer {
  readonly character: PlayerCharacter;

  private readonly plate = new NamePlate();
  private targetX = 0;
  private targetY = 0;
  private targetZ = 0;
  private targetYaw = 0;
  private readonly input: AnimationInput = createAnimationInput();
  private lastDeathCount = -1;
  private deathTime = -1;
  private placed = false;
  private onTreadmill = false;
  private travelSpeed = 0;
  private readonly dresser: AvatarDresser;
  private lastLook = '';

  /** The locally replayed throw. */
  private readonly view: TongueView = {
    phase: TonguePhase.None,
    time: 0,
    arc: { sx: 0, sy: 0, sz: 0, ex: 0, ey: 0, ez: 0 },
    hit: true,
  };
  private lastCount = -1;
  private readonly point = { x: 0, y: 0, z: 0 };

  get position(): { readonly x: number; readonly y: number; readonly z: number } {
    return { x: this.targetX, y: this.targetY, z: this.targetZ };
  }

  constructor(state: NetPlayerState) {
    this.character = new PlayerCharacter();
    this.character.root.add(this.plate.sprite);
    this.dresser = new AvatarDresser(this.character);
    this.lastCount = state.tongueCount;
    this.apply(state);
    this.character.setPosition(this.targetX, this.targetY, this.targetZ);
    this.character.setYaw(this.targetYaw);
    this.placed = true;
    this.lastDeathCount = state.deathCount;
  }

  apply(state: NetPlayerState): void {
    this.targetX = state.x;
    this.targetY = state.y;
    this.targetZ = state.z;
    this.targetYaw = state.rotationY;

    this.plate.set(state.displayName, state.avatarUrl, this.character.height);

    this.onTreadmill = state.treadmill > 0;
    this.travelSpeed = state.speed;
    this.input.grounded = state.grounded;
    this.input.horizontalSpeed = this.onTreadmill ? TREADMILLS.beltSpeed : state.speed;
    this.input.verticalVelocity = state.verticalVelocity;

    this.character.setCosmetics(state.trailSlot, state.tongueSlot, state.tongueLength);
    this.dressFrom(state);
    this.syncThrow(state);

    if (this.lastDeathCount >= 0 && state.deathCount > this.lastDeathCount) this.deathTime = 0;
    this.lastDeathCount = state.deathCount;
  }

  /** Adopt the server's throw, or resync the replay when it has drifted. */
  private syncThrow(state: NetPlayerState): void {
    const phase = state.tonguePhase as TonguePhase;
    const fresh = state.tongueCount !== this.lastCount;
    this.lastCount = state.tongueCount;
    if (phase === TonguePhase.None) {
      // The server has landed; let the replay finish its own ride.
      if (this.view.phase !== TonguePhase.Glide) this.view.phase = TonguePhase.None;
      return;
    }
    const arc = this.view.arc;
    arc.sx = state.tongueSX;
    arc.sy = state.tongueSY;
    arc.sz = state.tongueSZ;
    arc.ex = state.tongueEX;
    arc.ey = state.tongueEY;
    arc.ez = state.tongueEZ;
    this.view.hit = state.tongueHit;
    if (fresh || this.view.phase !== phase || Math.abs(this.view.time - state.tongueTime) > RESYNC_SECONDS) {
      this.view.phase = phase;
      this.view.time = state.tongueTime;
    }
  }

  setEffectBudget(budget: number): void {
    this.character.tongue.setEffectBudget(budget);
  }

  private dressFrom(state: NetPlayerState): void {
    const avatar = state.avatar;
    if (!avatar) return;
    const look = lookFromState(avatar);
    const key = JSON.stringify(look);
    if (key === this.lastLook) return;
    this.lastLook = key;
    this.dresser.setLook(look.appearance, look.proportions);
  }

  /** Advance the replayed throw through its phases, exactly as the simulation does. */
  private advanceThrow(dt: number): void {
    const view = this.view;
    if (view.phase === TonguePhase.None) return;
    view.time += dt;
    const distance = tongueDistance(view.arc);
    if (view.phase === TonguePhase.Windup && view.time >= TONGUE.windup) {
      view.time -= TONGUE.windup;
      view.phase = TonguePhase.Extend;
    }
    if (view.phase === TonguePhase.Extend) {
      const extend = tongueExtendSeconds(distance);
      if (view.time >= extend) {
        view.time -= extend;
        view.phase = TonguePhase.Glide;
      }
    }
    if (view.phase === TonguePhase.Glide && view.time >= tongueGlideSeconds(distance)) {
      view.phase = TonguePhase.None;
      view.time = 0;
    }
  }

  private progress(): number {
    const view = this.view;
    const distance = tongueDistance(view.arc);
    switch (view.phase) {
      case TonguePhase.Windup:
        return view.time / TONGUE.windup;
      case TonguePhase.Extend:
        return view.time / tongueExtendSeconds(distance);
      case TonguePhase.Glide:
        return view.time / tongueGlideSeconds(distance);
      default:
        return 0;
    }
  }

  update(delta: number): void {
    const dt = Math.max(0, delta);
    const wasThrowing = this.view.phase !== TonguePhase.None;
    this.advanceThrow(dt);
    const position = this.character.root.position;

    if (this.view.phase === TonguePhase.Glide) {
      // Ride the exact curve.
      const glide = tongueGlideSeconds(tongueDistance(this.view.arc));
      tonguePointAt(this.view.arc, tongueGlideU(this.view.time / glide), this.point);
      position.set(this.point.x, this.point.y, this.point.z);
      const arc = this.view.arc;
      this.character.setYaw(Math.atan2(arc.ex - arc.sx, arc.ez - arc.sz));
    } else if (this.view.phase !== TonguePhase.None) {
      const arc = this.view.arc;
      position.set(arc.sx, arc.sy, arc.sz);
      this.character.setYaw(Math.atan2(arc.ex - arc.sx, arc.ez - arc.sz));
    } else {
      const gap = Math.hypot(this.targetX - position.x, this.targetY - position.y, this.targetZ - position.z);
      if (!this.placed || (gap > SNAP_DISTANCE && !wasThrowing)) {
        position.set(this.targetX, this.targetY, this.targetZ);
        this.character.setYaw(this.targetYaw);
        this.placed = true;
        this.character.trail.clear();
      } else {
        const alpha = 1 - Math.exp(-FOLLOW_RATE * dt);
        position.x += (this.targetX - position.x) * alpha;
        position.y += (this.targetY - position.y) * alpha;
        position.z += (this.targetZ - position.z) * alpha;
        const yaw = this.character.root.rotation.y;
        this.character.setYaw(yaw + shortestAngle(yaw, this.targetYaw) * alpha);
      }
    }

    if (this.deathTime >= 0) {
      this.deathTime += dt;
      if (this.deathTime > DEATH.duration) this.deathTime = -1;
    }
    this.input.dying = this.deathTime >= 0;
    this.input.tonguePhase = this.input.dying ? TonguePhase.None : this.view.phase;
    this.input.tongueProgress = this.progress();
    if (this.view.phase !== TonguePhase.None) this.input.grounded = false;

    this.character.update(dt, this.input);
    this.character.updateEffects(dt, this.onTreadmill ? 0 : this.travelSpeed, this.view);
  }

  dispose(): void {
    this.plate.dispose();
    this.dresser.dispose();
    this.character.dispose();
  }
}
