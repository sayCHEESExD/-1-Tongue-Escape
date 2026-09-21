import { PLAYER_HEIGHT } from '@tongue/shared';
import { Bone, Group, Mesh, Object3D, Quaternion, Vector3 } from 'three';
import type { AnimationInput } from '../animation/AnimationInput.js';
import { PlayerAnimator, type AnimationState } from '../animation/PlayerAnimator.js';
import { PlayerRig } from '../animation/rig/PlayerRig.js';
import { PLAYER_MODEL_YAW_OFFSET } from '../config/worldVisuals.js';
import { TongueRenderer, type TongueView } from '../effects/TongueRenderer.js';
import { playerModelLoader } from './PlayerModelLoader.js';
import { TrailEffect } from './TrailEffect.js';

/** The mouth, from the neck joint, in character space at the bind pose. */
const MOUTH_FORWARD = 0.36;
const MOUTH_UP_FRACTION = 0.34;

/**
 * The visual half of a player, arranged so animation can never move them.
 *
 *   root          physics transform (position + facing). Gameplay owns it.
 *     visual      the bob, the lean, the fall-over and the arrival pop
 *       model     the cloned FBX (or a Bloxity body), posed by the rig
 *   worldRoot     the TONGUE and the trail, which live in WORLD space: the
 *                 tongue reaches across the lava, the trail marks where the
 *                 player has been
 */
export class PlayerCharacter {
  readonly root = new Group();
  readonly worldRoot = new Group();
  readonly trail = new TrailEffect();
  readonly tongue = new TongueRenderer();

  private readonly visual = new Group();
  private readonly defaultModel: Object3D;
  private model: Object3D;
  private animator: PlayerAnimator;
  private rig: PlayerRig;

  private neck: Bone | null = null;
  /** The neck's rotation relative to the root at the bind pose. */
  private readonly neckBind = new Quaternion();
  private mouthUp = 0.5;

  private readonly mouth = new Vector3();
  private readonly forward = new Vector3();
  private readonly qRoot = new Quaternion();
  private readonly qNeck = new Quaternion();
  private readonly qDelta = new Quaternion();
  private readonly offset = new Vector3();

  constructor() {
    this.defaultModel = playerModelLoader.createInstance();
    this.model = this.defaultModel;
    this.model.rotation.y = PLAYER_MODEL_YAW_OFFSET;
    this.root.add(this.visual);
    this.visual.add(this.model);
    this.rig = new PlayerRig(this.model, this.model);
    this.animator = new PlayerAnimator(this.rig, this.visual);
    this.worldRoot.add(this.trail.root, this.tongue.root);
    this.bindMouth();
  }

  get modelRoot(): Object3D {
    return this.model;
  }

  get body(): { visual: Group; model: Object3D } {
    return { visual: this.visual, model: this.model };
  }

  get height(): number {
    return PLAYER_HEIGHT;
  }

  /** Wear a different body, or null for the bundled one. */
  setModel(next: Object3D | null): Object3D {
    const target = next ?? this.defaultModel;
    if (target === this.model) return target;

    const previous = this.model;
    previous.removeFromParent();
    releaseBody(previous);

    target.rotation.y = PLAYER_MODEL_YAW_OFFSET;
    this.rig = new PlayerRig(target, target);
    this.rig.resetToBindPose();
    target.updateMatrixWorld(true);

    this.model = target;
    this.visual.add(target);
    this.animator.setRig(this.rig);
    this.bindMouth();
    return target;
  }

  /**
   * Record where the mouth sits relative to the neck joint, at the bind pose,
   * so the tongue can follow the head through every pose after.
   */
  private bindMouth(): void {
    this.animator.reset();
    const savedPosition = this.root.position.clone();
    const savedYaw = this.root.rotation.y;
    this.root.position.set(0, 0, 0);
    this.root.rotation.set(0, 0, 0);
    this.root.updateMatrixWorld(true);
    this.neck = this.rig.getBone('Neck1');
    if (this.neck) {
      const p = this.neck.getWorldPosition(new Vector3());
      this.neck.getWorldQuaternion(this.neckBind);
      this.mouthUp = Math.max(0.2, (PLAYER_HEIGHT - p.y) * MOUTH_UP_FRACTION);
    }
    this.root.position.copy(savedPosition);
    this.root.rotation.y = savedYaw;
    this.root.updateMatrixWorld(true);
  }

  /** The mouth, in world space, following the head's tilt. */
  mouthWorld(out: Vector3): Vector3 {
    this.root.updateMatrixWorld(true);
    this.root.getWorldQuaternion(this.qRoot);
    if (!this.neck) {
      return out.set(0, PLAYER_HEIGHT * 0.78, MOUTH_FORWARD).applyQuaternion(this.qRoot).add(this.root.position);
    }
    this.neck.getWorldPosition(out);
    this.neck.getWorldQuaternion(this.qNeck);
    // How far the neck has turned since the bind pose, as seen from the root.
    this.qDelta.copy(this.qRoot).multiply(this.neckBind).invert().premultiply(this.qNeck);
    this.offset.set(0, this.mouthUp, MOUTH_FORWARD).applyQuaternion(this.qRoot).applyQuaternion(this.qDelta);
    return out.add(this.offset);
  }

  setPosition(x: number, y: number, z: number): void {
    this.root.position.set(x, y, z);
  }

  setYaw(yaw: number): void {
    this.root.rotation.y = yaw;
  }

  setVisualScale(scale: number): void {
    this.visual.scale.setScalar(scale);
  }

  setCosmetics(trailSlot: number, tongueSlot: number, tongueLength: number): void {
    this.trail.setSlot(trailSlot);
    this.tongue.setTongue(tongueSlot);
    this.tongue.setLength(tongueLength);
  }

  update(delta: number, input: AnimationInput): void {
    this.animator.update(Math.max(0, delta), input);
  }

  /**
   * Advance the world-space effects, after the pose is written.
   *
   * @param travel the speed the player is actually covering ground at
   */
  updateEffects(delta: number, travel: number, view: TongueView | null): void {
    const p = this.root.position;
    this.trail.update(delta, p.x, p.y, p.z, travel);
    const yaw = this.root.rotation.y;
    this.forward.set(Math.sin(yaw), 0, Math.cos(yaw));
    this.tongue.update(delta, this.mouthWorld(this.mouth), this.forward, view);
  }

  get animationState(): AnimationState {
    return this.animator.currentState;
  }

  resetAnimation(): void {
    this.animator.reset();
    this.visual.scale.setScalar(1);
    this.trail.clear();
  }

  dispose(): void {
    this.trail.dispose();
    this.tongue.dispose();
    this.root.removeFromParent();
    this.worldRoot.removeFromParent();
  }
}

/** Let go of a Bloxity body's materials when it is swapped out. */
const releaseBody = (model: Object3D): void => {
  if (model.userData['bloxityBody'] !== true) return;
  model.traverse((child) => {
    const mesh = child as Mesh;
    if (!mesh.isMesh) return;
    const material = mesh.material;
    if (Array.isArray(material)) material.forEach((entry) => entry.dispose());
    else material?.dispose();
  });
};
