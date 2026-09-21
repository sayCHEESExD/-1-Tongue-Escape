import {
  TONGUE,
  TREADMILLS,
  TonguePhase,
  createLaidTonguePath,
  layTonguePath,
  sampleTonguePath,
  tongueExtendSeconds,
  tongueGlideSeconds,
  tongueGlideU,
  type TonguePathState,
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
 * locally from its replicated STEERED PATH: the tongue grows along the headings
 * the thrower laid (the newest carried on toward the tip between patches),
 * and once the server freezes the path the remote rides that exact curve -
 * the same `layTonguePath`/`sampleTonguePath` the simulation rides - rather
 * than cutting the corners of a 20 Hz stream.
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

  /** The locally replayed throw, and its path copied out of the replicated state. */
  private readonly path: TonguePathState & { tongueHeadings: number[] } = {
    sx: 0,
    sy: 0,
    sz: 0,
    ex: 0,
    ey: 0,
    ez: 0,
    tongueYaw0: 0,
    tongueMax: 0,
    tongueSeg: 0,
    tongueHeadings: [],
  };
  private readonly view: TongueView = { phase: TonguePhase.None, time: 0, path: this.path, hit: true };
  private lastCount = -1;
  private readonly point = { x: 0, y: 0, z: 0 };
  private readonly laid = createLaidTonguePath();

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
    const path = this.path;
    path.sx = state.tongueSX;
    path.sy = state.tongueSY;
    path.sz = state.tongueSZ;
    path.ex = state.tongueEX;
    path.ey = state.tongueEY;
    path.ez = state.tongueEZ;
    path.tongueYaw0 = state.tongueYaw0;
    path.tongueMax = state.tongueMax;
    path.tongueSeg = state.tongueSeg;
    path.tongueHeadings.length = 0;
    const laid = state.tonguePath;
    for (let i = 0; i < laid.length; i += 1) path.tongueHeadings.push(laid[i] as number);
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

  /**
   * Advance the replayed throw. The windup and the ride run on the local clock;
   * the deployment ends only when the SERVER says the path froze, because only
   * the thrower's steering decides where and when that is.
   */
  private advanceThrow(dt: number): void {
    const view = this.view;
    if (view.phase === TonguePhase.None) return;
    view.time += dt;
    if (view.phase === TonguePhase.Windup && view.time >= TONGUE.windup) {
      view.time -= TONGUE.windup;
      view.phase = TonguePhase.Extend;
    }
    if (view.phase === TonguePhase.Glide && view.time >= this.glideSeconds()) {
      view.phase = TonguePhase.None;
      view.time = 0;
    }
  }

  private glideSeconds(): number {
    return tongueGlideSeconds(layTonguePath(this.path, 0, true, this.laid).length);
  }

  private progress(): number {
    const view = this.view;
    switch (view.phase) {
      case TonguePhase.Windup:
        return view.time / TONGUE.windup;
      case TonguePhase.Extend:
        return view.time / tongueExtendSeconds(this.path.tongueMax);
      case TonguePhase.Glide:
        return view.time / this.glideSeconds();
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
      // Ride the exact curve the thrower laid, facing along it.
      layTonguePath(this.path, 0, true, this.laid);
      const glide = tongueGlideSeconds(this.laid.length);
      const at = tongueGlideU(this.view.time / glide) * this.laid.length;
      const px = position.x;
      const pz = position.z;
      sampleTonguePath(this.laid, at, this.path.sy, this.path.ey, this.point);
      position.set(this.point.x, this.point.y, this.point.z);
      if (Math.hypot(this.point.x - px, this.point.z - pz) > 1e-3) this.character.setYaw(Math.atan2(this.point.x - px, this.point.z - pz));
    } else if (this.view.phase !== TonguePhase.None) {
      // Rooted while winding up and steering.
      position.set(this.path.sx, this.path.sy, this.path.sz);
      this.character.setYaw(this.path.tongueYaw0);
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
