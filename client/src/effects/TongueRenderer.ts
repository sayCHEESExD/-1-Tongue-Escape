import {
  TONGUE,
  TonguePhase,
  tongueDistance,
  tongueExtendSeconds,
  tongueForSlot,
  tongueGlideSeconds,
  tongueGlideU,
  tonguePointAt,
  type TongueArc,
  type TongueTier,
} from '@tongue/shared';
import {

  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  RingGeometry,
  Vector3,
} from 'three';
import { ParticlePool } from './ParticlePool.js';
import { tongueTexture } from './tongueTextures.js';

/** Rings along the tongue, plus the rounded tip. */
const SEGMENTS = 36;
const TIP_RINGS = 4;
const RINGS = SEGMENTS + 1 + TIP_RINGS;
const RADIAL = 10;
/** The tongue is wide and flat, not a rope. */
const WIDTH = 1.35;
const DEPTH = 0.72;
const ROOT_RADIUS = 0.36;
const TIP_RADIUS = 0.46;
/** World units per brick band along the tongue. */
const BAND = 1.1;
/** Seconds the tongue takes to snap back after a ride. */
const RETRACT_SECONDS = 0.2;

const UP = new Vector3(0, 1, 0);

/** What a throw looks like right now, from the prediction or the replicated state. */
export interface TongueView {
  phase: TonguePhase;
  time: number;
  arc: TongueArc;
  hit: boolean;
}

const smooth = (t: number): number => {
  const c = t < 0 ? 0 : t > 1 ? 1 : t;
  return c * c * (3 - 2 * c);
};

/**
 * THE TONGUE: the game's identity, drawn.
 *
 * One dynamic flattened tube in WORLD space, rebuilt every frame from a
 * centreline: hanging from the mouth at rest (longer with every level), whipped
 * back over the head in the windup, flung out along the throw's arc, and - on
 * the ride - the remaining curve from the mouth to where it is stuck, shrinking
 * as the rider is reeled in. The arc is the SAME curve the simulation moves the
 * rider along (`tonguePointAt`), so what is drawn is what is ridden.
 *
 * Higher tongues glow and shed particles: sparks, embers, stars, drips.
 */
export class TongueRenderer {
  readonly root = new Group();

  private readonly geometry = new BufferGeometry();
  private readonly positions = new Float32Array(RINGS * RADIAL * 3);
  private readonly normals = new Float32Array(RINGS * RADIAL * 3);
  private readonly uvs = new Float32Array(RINGS * RADIAL * 2);
  private readonly material: MeshLambertMaterial;
  private readonly mesh: Mesh;
  private readonly particles = new ParticlePool(90);
  private readonly splatMaterial = new MeshBasicMaterial({
    color: 0xff7fb0,
    transparent: true,
    opacity: 0,
    side: DoubleSide,
    depthWrite: false,
  });
  private readonly splat: Mesh;

  /** Centreline, and the radius scale at each ring. */
  private readonly centers: Vector3[] = [];
  private readonly scales = new Float32Array(SEGMENTS + 1);
  private readonly point = { x: 0, y: 0, z: 0 };
  private readonly side = new Vector3();
  private readonly lift = new Vector3();
  private readonly tangent = new Vector3();
  private readonly lastSide = new Vector3(1, 0, 0);
  private readonly offset = new Vector3();
  private readonly scratch = new Vector3();
  private readonly accent = new Color();

  private tier: TongueTier = tongueForSlot(0);
  private slot = -1;
  private idleLength = 1;
  private time = 0;
  private budget = 1;
  private lastPhase: TonguePhase = TonguePhase.None;
  private retract = -1;
  private readonly retractTo = new Vector3();
  private splatLife = 0;
  private emitDebt = 0;

  constructor() {
    for (let i = 0; i <= SEGMENTS; i += 1) this.centers.push(new Vector3());
    this.geometry.setAttribute('position', new BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('normal', new BufferAttribute(this.normals, 3));
    this.geometry.setAttribute('uv', new BufferAttribute(this.uvs, 2));
    const indices: number[] = [];
    for (let r = 0; r < RINGS - 1; r += 1) {
      for (let k = 0; k < RADIAL; k += 1) {
        const a = r * RADIAL + k;
        const b = r * RADIAL + ((k + 1) % RADIAL);
        const c = (r + 1) * RADIAL + k;
        const d = (r + 1) * RADIAL + ((k + 1) % RADIAL);
        indices.push(a, c, b, b, c, d);
      }
    }
    this.geometry.setIndex(indices);
    this.material = new MeshLambertMaterial({ map: tongueTexture(0) });
    this.mesh = new Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;

    const ring = new RingGeometry(0.4, 1.4, 20);
    ring.rotateX(-Math.PI / 2);
    this.splat = new Mesh(ring, this.splatMaterial);
    this.splat.visible = false;

    this.root.add(this.mesh, this.splat, this.particles.points);
    this.setTongue(0);
  }

  /** Wear a tongue: its skin, its glow and its particles. */
  setTongue(slot: number): void {
    if (slot === this.slot) return;
    this.slot = slot;
    this.tier = tongueForSlot(slot);
    this.material.map = tongueTexture(slot);
    this.material.emissiveMap = this.tier.glow > 0 ? this.material.map : null;
    this.material.emissive.setHex(this.tier.glow > 0 ? 0xffffff : 0x000000);
    this.material.emissiveIntensity = this.tier.glow * 0.75;
    this.material.transparent = this.tier.fx === 'gummy' || this.tier.fx === 'crystal';
    this.material.opacity = this.material.transparent ? 0.86 : 1;
    this.material.needsUpdate = true;
    this.accent.setHex(this.tier.accent);
    this.splatMaterial.color.setHex(this.tier.fx === 'plain' ? this.tier.color : this.tier.accent);
  }

  /**
   * The Tongue Length stat, in studs. The resting tongue hangs longer as it
   * grows, and a throw is drawn exactly as far as the simulation sent it -
   * which the Tongue Length caps. It changes on a level-up, never from XP.
   */
  setLength(length: number): void {
    const studs = Number.isFinite(length) ? Math.max(0, length - TONGUE.baseLength) : 0;
    this.idleLength = 0.9 + Math.min(studs, 120) * 0.012;
  }

  /** 0..1: how much of the particle work this tongue may do. */
  setEffectBudget(budget: number): void {
    this.budget = Math.min(Math.max(budget, 0), 1);
  }

  /** The slap at the target: a ring on the ground and a burst. Lava splashes orange. */
  splatAt(x: number, y: number, z: number, hit: boolean): void {
    this.splat.position.set(x, y + 0.06, z);
    this.splat.visible = true;
    this.splatLife = 1;
    this.splatMaterial.color.setHex(hit ? (this.tier.fx === 'plain' ? this.tier.color : this.tier.accent) : 0xff7a1a);
    const burst = Math.round(18 * (0.4 + this.budget * 0.6));
    for (let i = 0; i < burst; i += 1) {
      const a = (i / burst) * Math.PI * 2;
      const speed = 5 + (i % 4);
      this.particles.spawn(
        x,
        y + 0.3,
        z,
        Math.cos(a) * speed,
        4 + (i % 3) * 2,
        Math.sin(a) * speed,
        hit ? this.tier.accent : 0xffa21a,
        hit ? 0.7 : 1.1,
        0.55,
        18,
        2,
      );
    }
  }

  /**
   * Rebuild the tongue for this frame.
   *
   * @param mouth    the mouth, in world space
   * @param forward  the character's facing, horizontal, normalised
   * @param view     the throw in progress, or null at rest
   */
  update(delta: number, mouth: Vector3, forward: Vector3, view: TongueView | null): void {
    const dt = Math.max(0, delta);
    this.time += dt;
    const phase = view ? view.phase : TonguePhase.None;

    if (this.lastPhase === TonguePhase.Glide && phase === TonguePhase.None && view) {
      this.retract = 0;
      this.retractTo.set(view.arc.ex, view.arc.ey, view.arc.ez);
    }
    // A tongue that stuck slaps the platform; one that ran out ends in the air.
    if (this.lastPhase !== TonguePhase.Glide && phase === TonguePhase.Glide && view && view.hit) {
      this.splatAt(view.arc.ex, view.arc.ey, view.arc.ez, true);
    }
    this.lastPhase = phase;

    let reach = 0;
    if (view && phase === TonguePhase.Windup) {
      this.buildWindup(mouth, forward, smooth(view.time / TONGUE.windup));
    } else if (view && phase === TonguePhase.Extend) {
      const e = view.time / tongueExtendSeconds(tongueDistance(view.arc));
      reach = this.buildArc(mouth, view.arc, 0, 1 - (1 - Math.min(e, 1)) ** 3, 1 - Math.min(e, 1));
    } else if (view && phase === TonguePhase.Glide) {
      const u = tongueGlideU(view.time / tongueGlideSeconds(tongueDistance(view.arc)));
      reach = this.buildArc(mouth, view.arc, u, 1, 0);
    } else if (this.retract >= 0) {
      this.retract += dt;
      const t = Math.min(this.retract / RETRACT_SECONDS, 1);
      this.buildIdle(mouth, forward, dt);
      // Blend from a straight snap toward where it was stuck into the rest pose.
      for (let i = 0; i <= SEGMENTS; i += 1) {
        const s = i / SEGMENTS;
        this.scratch.copy(mouth).lerp(this.retractTo, s * (1 - t) * 0.5);
        (this.centers[i] as Vector3).lerp(this.scratch, 1 - smooth(t));
      }
      if (t >= 1) this.retract = -1;
    } else {
      this.buildIdle(mouth, forward, dt);
    }

    this.writeTube();
    this.emit(dt, reach);
    this.particles.update(dt);

    if (this.splatLife > 0) {
      this.splatLife = Math.max(0, this.splatLife - dt * 1.6);
      const grow = 1 + (1 - this.splatLife) * 1.6;
      this.splat.scale.set(grow, 1, grow);
      this.splatMaterial.opacity = this.splatLife * 0.8;
      if (this.splatLife === 0) this.splat.visible = false;
    }
  }

  /** At rest: out of the mouth, over the lip, and hanging down the chest. */
  private buildIdle(mouth: Vector3, forward: Vector3, dt: number): void {
    const sway = Math.sin(this.time * 2.4) * 0.06;
    const len = this.idleLength;
    for (let i = 0; i <= SEGMENTS; i += 1) {
      const s = i / SEGMENTS;
      const out = Math.sin(Math.min(s * 2.2, 1) * Math.PI * 0.5) * 0.42;
      const drop = Math.max(0, s - 0.18) * len * 1.2;
      const c = this.centers[i] as Vector3;
      c.copy(mouth).addScaledVector(forward, out + sway * s).addScaledVector(UP, -drop);
      this.scales[i] = 1 - s * 0.15;
    }
    void dt;
  }

  /** The windup: the tongue whips up and back over the head, loading the throw. */
  private buildWindup(mouth: Vector3, forward: Vector3, t: number): void {
    this.buildIdle(mouth, forward, 0);
    const len = 1.4 + this.idleLength * 0.6;
    for (let i = 0; i <= SEGMENTS; i += 1) {
      const s = i / SEGMENTS;
      const angle = s * Math.PI * 0.95;
      this.scratch
        .copy(mouth)
        .addScaledVector(forward, Math.cos(angle) * 0.35 * s - Math.sin(angle * 0.5) * len * s * 0.6)
        .addScaledVector(UP, Math.sin(angle) * len * 0.55 + s * 0.3);
      (this.centers[i] as Vector3).lerp(this.scratch, t);
    }
  }

  /**
   * Along the throw's own curve, from the rider (`from`) to `to`, with the root
   * pinned to the mouth. `wobble` shakes the tongue as it flies out.
   *
   * @returns the drawn length, for the particle budget
   */
  private buildArc(mouth: Vector3, arc: TongueArc, from: number, to: number, wobble: number): number {
    const mouthLift = mouth.y - this.feetAt(arc, from);
    tonguePointAt(arc, from, this.point);
    this.offset.set(mouth.x - this.point.x, mouth.y - this.point.y - mouthLift, mouth.z - this.point.z);
    let length = 0;
    for (let i = 0; i <= SEGMENTS; i += 1) {
      const s = i / SEGMENTS;
      const v = from + (to - from) * s;
      tonguePointAt(arc, v, this.point);
      // The root is at the mouth; the far end is on the ground.
      const lift = mouthLift * (1 - s);
      const pin = 1 - smooth(s * 3);
      const c = this.centers[i] as Vector3;
      c.set(
        this.point.x + this.offset.x * pin,
        this.point.y + lift + this.offset.y * pin,
        this.point.z + this.offset.z * pin,
      );
      if (wobble > 0) c.y += Math.sin(s * 9 - this.time * 30) * wobble * 0.7 * s;
      this.scales[i] = 1;
      if (i > 0) length += c.distanceTo(this.centers[i - 1] as Vector3);
    }
    return length;
  }

  /** The rider's feet height at `u`, for the mouth offset. */
  private feetAt(arc: TongueArc, u: number): number {
    tonguePointAt(arc, u, this.point);
    return this.point.y;
  }

  private writeTube(): void {
    let along = 0;
    let at = 0;
    let uv = 0;
    const tipDir = this.tangent;
    for (let r = 0; r < RINGS; r += 1) {
      const i = Math.min(r, SEGMENTS);
      const c = this.centers[i] as Vector3;
      const prev = this.centers[Math.max(0, i - 1)] as Vector3;
      const next = this.centers[Math.min(SEGMENTS, i + 1)] as Vector3;
      if (r <= SEGMENTS) {
        tipDir.subVectors(next, prev);
        if (tipDir.lengthSq() < 1e-8) tipDir.set(0, -1, 0);
        tipDir.normalize();
        if (r > 0) along += c.distanceTo(prev);
      }

      // The rounded tip: a few rings past the end, closing to a point.
      let radius = ROOT_RADIUS + (TIP_RADIUS - ROOT_RADIUS) * (i / SEGMENTS);
      radius *= this.scales[i] ?? 1;
      let cx = c.x;
      let cy = c.y;
      let cz = c.z;
      if (r > SEGMENTS) {
        const k = (r - SEGMENTS) / TIP_RINGS;
        const push = Math.sin(k * Math.PI * 0.5) * TIP_RADIUS * 0.9;
        cx += tipDir.x * push;
        cy += tipDir.y * push;
        cz += tipDir.z * push;
        radius *= Math.cos(k * Math.PI * 0.5);
      }

      this.side.crossVectors(tipDir, UP);
      if (this.side.lengthSq() < 1e-6) this.side.copy(this.lastSide);
      else this.side.normalize();
      this.lastSide.copy(this.side);
      this.lift.crossVectors(this.side, tipDir).normalize();

      for (let k = 0; k < RADIAL; k += 1) {
        const a = (k / RADIAL) * Math.PI * 2;
        const sx = Math.cos(a) * WIDTH;
        const sy = Math.sin(a) * DEPTH;
        const nx = this.side.x * sx + this.lift.x * sy;
        const ny = this.side.y * sx + this.lift.y * sy;
        const nz = this.side.z * sx + this.lift.z * sy;
        this.positions[at] = cx + nx * radius;
        this.positions[at + 1] = cy + ny * radius;
        this.positions[at + 2] = cz + nz * radius;
        const len = Math.hypot(nx, ny, nz) || 1;
        this.normals[at] = nx / len;
        this.normals[at + 1] = ny / len;
        this.normals[at + 2] = nz / len;
        this.uvs[uv] = along / BAND;
        this.uvs[uv + 1] = k / RADIAL;
        at += 3;
        uv += 2;
      }
    }
    (this.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
    (this.geometry.getAttribute('normal') as BufferAttribute).needsUpdate = true;
    (this.geometry.getAttribute('uv') as BufferAttribute).needsUpdate = true;
  }

  /** Shed the tongue's particles along its length: more for longer, glowier tongues. */
  private emit(dt: number, reach: number): void {
    if (this.tier.glow < 0.2 || this.budget <= 0) return;
    const length = Math.max(reach, 1.5);
    this.emitDebt += dt * this.tier.glow * this.budget * (10 + length * 1.2);
    const fx = this.tier.fx;
    while (this.emitDebt >= 1) {
      this.emitDebt -= 1;
      const s = Math.random();
      const c = this.centers[Math.round(s * SEGMENTS)] as Vector3;
      const jx = (Math.random() - 0.5) * 0.5;
      const jz = (Math.random() - 0.5) * 0.5;
      const alt = Math.random() > 0.5;
      switch (fx) {
        case 'slime':
          this.particles.spawn(c.x + jx, c.y - 0.2, c.z + jz, 0, -1, 0, this.tier.accent, 0.5, 0.8, 16, 0);
          break;
        case 'fire':
        case 'lava':
          this.particles.spawn(c.x + jx, c.y, c.z + jz, jx, 3 + Math.random() * 3, jz, alt ? this.tier.accent : 0xff5a10, 0.7, 0.5, -3, 1);
          break;
        case 'lightning':
          this.particles.spawn(c.x + jx * 2, c.y + (Math.random() - 0.5), c.z + jz * 2, jx * 8, (Math.random() - 0.5) * 6, jz * 8, alt ? 0xffffff : this.tier.accent, 0.45, 0.18, 0, 0);
          break;
        case 'galaxy':
        case 'void':
          this.particles.spawn(c.x + jx * 2, c.y + jz * 2, c.z + jz, jx, 0.6, jz, alt ? 0xffffff : this.tier.accent, 0.4, 0.9, 0, 0.5);
          break;
        default:
          this.particles.spawn(c.x + jx, c.y + 0.2, c.z + jz, jx, 1.2, jz, alt ? 0xffffff : this.tier.accent, 0.4, 0.6, -1, 0.5);
          break;
      }
    }
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
    this.splat.geometry.dispose();
    this.splatMaterial.dispose();
    this.particles.dispose?.();
    this.root.removeFromParent();
  }
}

