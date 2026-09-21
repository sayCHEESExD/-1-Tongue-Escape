import {
  HUB,
  TONGUE_PADS,
  TONGUE_STAGE,
  formatAmount,
  formatWins,
  ownsTongue,
  tongueForSlot,
  type TonguePad,
  type TongueTier,
} from '@tongue/shared';
import {
  CanvasTexture,
  CatmullRomCurve3,
  Group,
  LinearFilter,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  SphereGeometry,
  TubeGeometry,
  Vector3,
  type BufferGeometry,
  type Material,
} from 'three';
import { PALETTE } from '../config/worldVisuals.js';
import { ParticlePool } from '../effects/ParticlePool.js';
import { tongueTexture } from '../effects/tongueTextures.js';
import { CanvasSign } from './CanvasSign.js';
import { worldTextures } from './WorldTextures.js';
import { texturedBox } from './texturedBox.js';

/** World units one stud repeat covers: the spawn floor's scale. */
const TILE = 4;

const FONT = '"Fredoka", "Baloo 2", "Nunito", "Segoe UI", system-ui, sans-serif';
const hex = (value: number): string => `#${value.toString(16).padStart(6, '0')}`;

type PadState = 'locked' | 'ready' | 'owned' | 'worn';

interface Display {
  readonly pad: TonguePad;
  readonly tier: TongueTier;
  readonly model: Group;
  readonly padMaterial: MeshLambertMaterial;
  readonly label: CanvasTexture;
  readonly labelCanvas: HTMLCanvasElement;
  state: PadState | '';
}

/**
 * THE TONGUE STAGE: the physical shop on the spawn's left.
 *
 * Every tongue floats and turns over its own pad, dressed in its own skin and
 * glow, with its name, its "+N/Tongue" and its price hung above it - the
 * lower five on the front slab, the upper eight on the storey behind. A pad
 * lights GREEN when its tongue can be bought, gold once owned, and cyan for
 * the one being worn. The labels and pads are redrawn only when the player's
 * inventory changes; the buying itself is the server's.
 */
export class TongueStage {
  readonly root = new Group();

  private readonly displays: Display[] = [];
  private readonly geometries: BufferGeometry[] = [];
  private readonly materials: Material[] = [];
  private readonly signs: CanvasSign[] = [];
  private readonly particles = new ParticlePool(220);
  private time = 0;
  private emitDebt = 0;

  constructor() {
    const tongueGeometry = this.buildTongueGeometry();
    const tipGeometry = new SphereGeometry(0.62, 14, 10);
    tipGeometry.scale(1.3, 0.75, 1);
    this.geometries.push(tongueGeometry, tipGeometry);

    for (const pad of TONGUE_PADS) {
      const tier = tongueForSlot(pad.slot);

      // The pad: a dark square set into the stage, lit by its state.
      // A white stud plate, tinted by the pad's state.
      const padMaterial = new MeshLambertMaterial({ map: worldTextures.stud(0xffffff), color: PALETTE.padIdle });
      padMaterial.emissiveMap = padMaterial.map;
      this.materials.push(padMaterial);
      const padMesh = new Mesh(this.track(texturedBox(pad.size, 0.12, pad.size, TILE)), padMaterial);
      padMesh.position.set(pad.x, pad.topY + 0.06, pad.z);
      padMesh.receiveShadow = true;
      this.root.add(padMesh);

      // The tongue on display.
      const skin = new MeshLambertMaterial({ map: tongueTexture(pad.slot) });
      if (tier.glow > 0) {
        skin.emissive.setHex(0xffffff);
        skin.emissiveMap = skin.map;
        skin.emissiveIntensity = tier.glow * 0.8;
      }
      if (tier.fx === 'gummy' || tier.fx === 'crystal') {
        skin.transparent = true;
        skin.opacity = 0.85;
      }
      this.materials.push(skin);
      const model = new Group();
      const body = new Mesh(tongueGeometry, skin);
      body.castShadow = true;
      const tip = new Mesh(tipGeometry, skin);
      tip.position.set(0, -2.1, 0.55);
      model.add(body, tip);
      model.position.set(pad.x, pad.topY + 3.6, pad.z);
      model.scale.setScalar(tier.tier === 0 ? 0.95 : 0.85);
      this.root.add(model);

      // The label: name, rate and price, redrawn on inventory change.
      const labelCanvas = document.createElement('canvas');
      labelCanvas.width = 256;
      labelCanvas.height = 128;
      const label = new CanvasTexture(labelCanvas);
      label.colorSpace = SRGBColorSpace;
      label.minFilter = LinearFilter;
      label.generateMipmaps = false;
      const labelMaterial = new MeshBasicMaterial({ map: label, transparent: true, depthWrite: false });
      this.materials.push(labelMaterial);
      const labelMesh = new Mesh(this.track(new PlaneGeometry(6, 3)), labelMaterial);
      labelMesh.position.set(pad.x - 1.2, pad.topY + (tier.tier === 0 ? 5.9 : 6.8), pad.z);
      labelMesh.scale.setScalar(tier.tier === 0 ? 0.85 : 0.95);
      labelMesh.rotation.y = -Math.PI / 2;
      this.root.add(labelMesh);

      this.displays.push({ pad, tier, model, padMaterial, label, labelCanvas, state: '' });
    }

    this.buildDressing();
    this.root.add(this.particles.points);
    this.setInventory(0, 0, 0);
  }

  /** A curled, tapered tongue shape, shared by every display. */
  private buildTongueGeometry(): TubeGeometry {
    const curve = new CatmullRomCurve3([
      new Vector3(0, 1.6, 0),
      new Vector3(0, 0.9, 0.5),
      new Vector3(0, -0.2, 0.7),
      new Vector3(0, -1.3, 0.55),
      new Vector3(0, -2.1, 0.55),
    ]);
    const tube = new TubeGeometry(curve, 24, 0.55, 10, false);
    // Flatten into a tongue: wide across, thin front to back.
    tube.scale(1.35, 1, 0.75);
    return tube;
  }

  /** The heading, the carpet in front, and the stair rails. */
  private buildDressing(): void {
    const s = TONGUE_STAGE;
    const heading = new CanvasSign(30, 8, [
      { text: 'TONGUES', size: 1, fill: '#ffffff', stroke: '#16203d', strokeWidth: 0.16 },
      { text: 'Spend Wins on stronger tongues!', size: 0.46, fill: '#ffe14d', stroke: '#16203d', strokeWidth: 0.16 },
    ]);
    heading.mesh.position.set(s.upperBackX - 0.1, s.wallTopY - 3.5, (s.minZ + s.maxZ) / 2);
    heading.mesh.rotation.y = -Math.PI / 2;
    this.signs.push(heading);
    this.root.add(heading.mesh);

    const stripe = this.lambert(PALETTE.carpetStripe);
    const carpet = this.lambert(PALETTE.carpet);
    const length = s.maxZ - s.minZ;
    const strip = new Mesh(this.track(texturedBox(4, 0.06, length, TILE)), stripe);
    strip.position.set(s.front - 2.5, HUB.floorY + 0.03, (s.minZ + s.maxZ) / 2);
    const red = new Mesh(this.track(texturedBox(3, 0.08, length - 1, TILE)), carpet);
    red.position.set(s.front - 2.5, HUB.floorY + 0.05, (s.minZ + s.maxZ) / 2);
    this.root.add(strip, red);

    // A lip along the front of the upper storey, so it reads as a stage.
    const lip = new Mesh(this.track(texturedBox(0.6, 0.6, s.lowerMaxZ - s.lowerMinZ, TILE)), this.lambert(0xb8b3d6));
    lip.position.set(s.lowerBackX + 0.3, s.upperTopY + 0.3, (s.lowerMinZ + s.lowerMaxZ) / 2);
    this.root.add(lip);
  }

  /** Redraw pads and labels for this player's Wins and tongues. */
  setInventory(wins: number, ownedTongues: number, wornSlot: number): void {
    for (const display of this.displays) {
      const slot = display.pad.slot;
      const state: PadState =
        slot === wornSlot ? 'worn' : ownsTongue(ownedTongues, slot) ? 'owned' : wins >= display.tier.cost ? 'ready' : 'locked';
      if (state === display.state) continue;
      display.state = state;
      display.padMaterial.color.setHex(
        state === 'worn' ? PALETTE.padWorn : state === 'owned' ? PALETTE.padOwned : state === 'ready' ? PALETTE.padReady : PALETTE.padIdle,
      );
      display.padMaterial.emissive.setHex(state === 'locked' ? 0x000000 : display.padMaterial.color.getHex());
      display.padMaterial.emissiveIntensity = state === 'locked' ? 0 : 0.45;
      this.drawLabel(display, state);
    }
  }

  private drawLabel(display: Display, state: PadState): void {
    const ctx = display.labelCanvas.getContext('2d');
    if (!ctx) return;
    const { width, height } = display.labelCanvas;
    ctx.clearRect(0, 0, width, height);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    const line = (text: string, y: number, size: number, fill: string): void => {
      ctx.font = `700 ${size}px ${FONT}`;
      ctx.lineWidth = size * 0.28;
      ctx.strokeStyle = '#141a2e';
      ctx.strokeText(text, width / 2, y);
      ctx.fillStyle = fill;
      ctx.fillText(text, width / 2, y);
    };
    const tier = display.tier;
    line(tier.name, 26, 30, hex(tier.fx === 'void' ? tier.accent : tier.color === 0x15071f ? tier.accent : tier.color));
    line(`+${formatAmount(tier.perStep)}/Tongue`, 66, 30, '#ffffff');
    const status =
      state === 'worn' ? 'Equipped' : state === 'owned' ? 'Owned - step to equip' : `${formatWins(tier.cost)} Wins Required`;
    line(status, 104, 24, state === 'worn' ? '#7fe6ff' : state === 'owned' ? '#ffd24a' : state === 'ready' ? '#5dff6a' : '#ffe14d');
    display.label.needsUpdate = true;
  }

  /**
   * Turn the tongues and shed their sparkles. Only near the viewer: the stage
   * sleeps once the player is out on the lava.
   */
  update(delta: number, viewerX: number, viewerZ: number): void {
    this.time += delta;
    const near = viewerZ < 20;
    for (let i = 0; i < this.displays.length; i += 1) {
      const display = this.displays[i] as Display;
      display.model.rotation.y = this.time * 0.9 + i * 0.4;
      display.model.position.y = display.pad.topY + 3.6 + Math.sin(this.time * 2 + i) * 0.25;
    }
    if (near) {
      this.emitDebt += delta * 40;
      while (this.emitDebt >= 1) {
        this.emitDebt -= 1;
        const display = this.displays[Math.floor(Math.random() * this.displays.length)] as Display;
        if (display.tier.glow < 0.25) continue;
        const p = display.model.position;
        const a = Math.random() * Math.PI * 2;
        const r = 0.6 + Math.random() * 1.2;
        const rising = display.tier.fx === 'fire' || display.tier.fx === 'lava';
        this.particles.spawn(
          p.x + Math.cos(a) * r,
          p.y - 1 + Math.random() * 3,
          p.z + Math.sin(a) * r,
          0,
          rising ? 2.5 : 0.6,
          0,
          Math.random() > 0.5 ? display.tier.accent : 0xffffff,
          0.5 + display.tier.glow * 0.5,
          0.9,
          0,
          0.4,
        );
      }
    }
    void viewerX;
    this.particles.update(delta);
  }

  private track<T extends BufferGeometry>(geometry: T): T {
    this.geometries.push(geometry);
    return geometry;
  }

  private lambert(color: number): MeshLambertMaterial {
    // The spawn's stud plate, in this colour.
    const material = new MeshLambertMaterial({ map: worldTextures.stud(color) });
    this.materials.push(material);
    return material;
  }

  dispose(): void {
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
    for (const display of this.displays) display.label.dispose();
    for (const sign of this.signs) sign.dispose();
    this.particles.dispose?.();
    this.root.removeFromParent();
  }
}
