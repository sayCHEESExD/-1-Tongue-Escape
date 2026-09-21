import { HUB, TREADMILLS, TREADMILL_TIERS, canUseTreadmill, type TreadmillDefinition } from '@tongue/shared';
import {
  CircleGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  RingGeometry,
  type BufferGeometry,
  type Material,
  type Texture,
} from 'three';
import { PALETTE } from '../config/worldVisuals.js';
import { CanvasSign } from './CanvasSign.js';
import { worldTextures } from './WorldTextures.js';
import { texturedBox } from './texturedBox.js';

/** World units one stud repeat covers: the spawn floor's scale. */
const TILE = 4;

interface Rig {
  readonly tier: TreadmillDefinition;
  readonly belt: MeshLambertMaterial;
  readonly screen: MeshBasicMaterial;
}

/**
 * TONGUE TRAINING, on the spawn's right: three treadmills side by side on a
 * red carpet with a yellow stripe, each with a console, a target screen and a
 * floating sign - "Tongue Training x2 / 3 Rebirths" - under the bay's heading.
 *
 * The belts scroll. A treadmill the player lacks the rebirths for shows a
 * dimmed screen; the SERVER is what actually refuses to pay it.
 */
export class TrainingBay {
  readonly root = new Group();

  private readonly rigs: Rig[] = [];
  private readonly geometries: BufferGeometry[] = [];
  private readonly materials: Material[] = [];
  private readonly signs: CanvasSign[] = [];
  private rebirths = -1;
  private scroll = 0;

  constructor(beltTexture: Texture) {
    this.buildCarpet();
    const frame = this.lambert(PALETTE.treadmillFrame);
    const headX = TREADMILLS.centerX - TREADMILLS.beltLength / 2;

    for (const tier of TREADMILL_TIERS) {
      const group = new Group();
      group.position.set(0, HUB.floorY, tier.z);

      // The deck under the belt, and the belt itself.
      const deck = this.box(TREADMILLS.beltLength + 0.4, 0.35, TREADMILLS.beltWidth + 0.8, frame);
      deck.position.set(TREADMILLS.centerX, 0.175, 0);
      const beltMap = beltTexture.clone();
      beltMap.needsUpdate = true;
      // The box already tiles every 4 units; stretch the tread across the belt width.
      beltMap.repeat.set(1, TILE / TREADMILLS.beltWidth);
      const belt = new MeshLambertMaterial({ map: beltMap });
      this.materials.push(belt);
      const beltMesh = this.box(TREADMILLS.beltLength, 0.26, TREADMILLS.beltWidth, belt);
      beltMesh.position.set(TREADMILLS.centerX, TREADMILLS.beltTopY - 0.13, 0);
      beltMesh.receiveShadow = true;

      // Side rails.
      const tint = this.lambert(tier.color);
      for (const side of [-1, 1]) {
        const rail = this.box(TREADMILLS.beltLength * 0.7, 0.3, 0.3, tint);
        rail.position.set(TREADMILLS.centerX - TREADMILLS.beltLength * 0.15, 2.2, side * (TREADMILLS.beltWidth / 2 + 0.25));
        const post = this.box(0.3, 2.2, 0.3, tint);
        post.position.set(headX + 0.6, 1.1, side * (TREADMILLS.beltWidth / 2 + 0.25));
        group.add(rail, post);
      }

      // The console at the head: an upright with a target screen.
      const upright = this.box(TREADMILLS.consoleDepth, TREADMILLS.consoleHeight, TREADMILLS.beltWidth + 0.6, tint);
      upright.position.set(headX - TREADMILLS.consoleDepth / 2, TREADMILLS.consoleHeight / 2, 0);
      upright.castShadow = true;
      const screen = new MeshBasicMaterial({ color: 0xffffff });
      this.materials.push(screen);
      const face = new Mesh(new CircleGeometry(1.3, 24), screen);
      this.geometries.push(face.geometry);
      face.rotation.y = Math.PI / 2;
      face.position.set(headX + 0.02, TREADMILLS.consoleHeight - 1.6, 0);
      const ringMaterial = this.basic(0x1b2a4a);
      const ring = new Mesh(new RingGeometry(0.55, 0.85, 24), ringMaterial);
      this.geometries.push(ring.geometry);
      ring.rotation.y = Math.PI / 2;
      ring.position.set(headX + 0.04, TREADMILLS.consoleHeight - 1.6, 0);
      const dot = new Mesh(new CircleGeometry(0.28, 16), ringMaterial);
      this.geometries.push(dot.geometry);
      dot.rotation.y = Math.PI / 2;
      dot.position.set(headX + 0.05, TREADMILLS.consoleHeight - 1.6, 0);

      group.add(deck, beltMesh, upright, face, ring, dot);
      this.root.add(group);

      // The sign over the console, as in the reference.
      const sign = new CanvasSign(8, 3.4, [
        { text: `x${tier.multiplier} Tongue`, size: 1, fill: tier.index === 3 ? '#ff7fe0' : '#7fe6ff', stroke: '#101830', strokeWidth: 0.16 },
        {
          text: tier.rebirthsRequired === 0 ? 'Free' : `${tier.rebirthsRequired} Rebirths`,
          size: 0.72,
          fill: '#7fe6ff',
          stroke: '#101830',
          strokeWidth: 0.16,
        },
      ]);
      sign.mesh.position.set(headX - 0.4, TREADMILLS.consoleHeight + 2.4, tier.z);
      sign.mesh.rotation.y = Math.PI / 2;
      this.signs.push(sign);
      this.root.add(sign.mesh);

      const name = new CanvasSign(8, 1.2, [
        { text: tier.name, size: 1, fill: '#ffffff', stroke: '#101830', strokeWidth: 0.18 },
      ]);
      name.mesh.position.set(headX - 0.4, TREADMILLS.consoleHeight + 0.5, tier.z);
      name.mesh.rotation.y = Math.PI / 2;
      this.signs.push(name);
      this.root.add(name.mesh);

      this.rigs.push({ tier, belt, screen });
    }

    // The bay's heading, on the hub wall behind the consoles.
    const heading = new CanvasSign(34, 7, [
      { text: 'TRAINERS', size: 1, fill: '#ffffff', stroke: '#16203d', strokeWidth: 0.16 },
      { text: 'GET EXTRA WINS FOR CURRENCY', size: 0.55, fill: '#ffe14d', stroke: '#16203d', strokeWidth: 0.16 },
    ]);
    heading.mesh.position.set(HUB.minX + 0.3, 13, (TREADMILLS.carpet.minZ + TREADMILLS.carpet.maxZ) / 2);
    heading.mesh.rotation.y = Math.PI / 2;
    this.signs.push(heading);
    this.root.add(heading.mesh);

    this.setRebirths(0);
  }

  /** Show which treadmills this player may use. Presentation only. */
  setRebirths(rebirths: number): void {
    if (rebirths === this.rebirths) return;
    this.rebirths = rebirths;
    for (const rig of this.rigs) {
      const open = canUseTreadmill(rig.tier.index, rebirths);
      rig.screen.color.setHex(open ? 0xffffff : 0x6b7080);
    }
  }

  update(delta: number): void {
    this.scroll = (this.scroll + delta * (TREADMILLS.beltSpeed / 4)) % 1;
    for (const rig of this.rigs) {
      if (rig.belt.map) rig.belt.map.offset.x = this.scroll;
    }
  }

  private buildCarpet(): void {
    const c = TREADMILLS.carpet;
    const stripe = this.lambert(PALETTE.carpetStripe);
    const carpet = this.lambert(PALETTE.carpet);
    const w = c.maxX - c.minX;
    const d = c.maxZ - c.minZ;
    const under = this.box(w, 0.06, d, stripe);
    under.position.set((c.minX + c.maxX) / 2, HUB.floorY + 0.03, (c.minZ + c.maxZ) / 2);
    const top = this.box(w - 1.6, 0.08, d - 1.6, carpet);
    top.position.set((c.minX + c.maxX) / 2, HUB.floorY + 0.05, (c.minZ + c.maxZ) / 2);
    under.receiveShadow = true;
    top.receiveShadow = true;
    this.root.add(under, top);
  }

  private box(w: number, h: number, d: number, material: Material): Mesh {
    const geometry = texturedBox(w, h, d, TILE);
    this.geometries.push(geometry);
    return new Mesh(geometry, material);
  }

  private lambert(color: number): MeshLambertMaterial {
    // The spawn's stud plate, in this colour.
    const material = new MeshLambertMaterial({ map: worldTextures.stud(color) });
    this.materials.push(material);
    return material;
  }

  private basic(color: number): MeshBasicMaterial {
    const material = new MeshBasicMaterial({ color });
    this.materials.push(material);
    return material;
  }

  dispose(): void {
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials) material.dispose();
    for (const sign of this.signs) sign.dispose();
    this.root.removeFromParent();
  }
}
