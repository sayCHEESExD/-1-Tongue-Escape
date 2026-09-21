import {
  COURSE_SOLIDS,
  HUB,
  HUB_FRONT_WALL_DEPTH,
  RIVER,
  SPAWN_POSITION,
  STAGES,
  START_PLATFORM,
  WorldCollision,
  formatWins,
  type CourseSolid,
} from '@tongue/shared';
import {
  CylinderGeometry,
  DoubleSide,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PlaneGeometry,
  Scene,
  SphereGeometry,
  type BufferGeometry,
  type Material,
  type Texture,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PALETTE } from '../config/worldVisuals.js';
import { CanvasSign } from './CanvasSign.js';
import { Scoreboard } from './Scoreboard.js';
import { Sky } from './Sky.js';
import { TongueStage } from './TongueStage.js';
import { TrainingBay } from './TrainingBay.js';
import { StageDecor } from './StageDecor.js';
import { WinTrophies } from './WinTrophies.js';
import { themeFor } from '../config/stageThemes.js';
import { worldTextures } from './WorldTextures.js';
import { texturedBox, worldScaledUv } from './texturedBox.js';

/** World units one stud texture repeat covers (two studs). */
const TILE = 4;

/** A deterministic PRNG, so every client places the same trees. */
const seeded = (seed: number): (() => number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/**
 * The visible world. Every solid it draws comes from `COURSE_SOLIDS` - the
 * same array the collision is built from - merged per material, so the whole
 * course is a few dozen draw calls.
 */
export class CourseWorld {
  readonly root = new Group();
  readonly collision = new WorldCollision();
  readonly scoreboard: Scoreboard;
  readonly training: TrainingBay;
  readonly stage: TongueStage;
  readonly sky: Sky;
  readonly winTrophies = new WinTrophies();
  readonly decor = new StageDecor();

  private readonly textures = worldTextures;
  private readonly materials: Material[] = [];
  private readonly signs: CanvasSign[] = [];
  private lavaMap: Texture | null = null;
  private lavaMaterial: MeshBasicMaterial | null = null;
  private readonly winPadMaterials: MeshLambertMaterial[] = [];
  private time = 0;

  constructor() {
    this.buildSolids();
    this.buildLava();
    this.buildCliffs();
    this.buildBackdrop();
    this.buildArrows();
    this.buildSigns();

    this.training = new TrainingBay(this.textures.belt(PALETTE.treadmillBelt, PALETTE.treadmillMark));
    this.stage = new TongueStage();
    this.scoreboard = new Scoreboard();
    this.sky = new Sky();
    this.root.add(this.training.root, this.stage.root, this.scoreboard.root, this.sky.root, this.winTrophies.root, this.decor.root);
  }

  addTo(scene: Scene): void {
    scene.add(this.root);
  }

  update(delta: number, viewerX: number, viewerZ: number): void {
    this.time += delta;
    if (this.lavaMap) {
      this.lavaMap.offset.x = Math.sin(this.time * 0.15) * 0.3;
      this.lavaMap.offset.y = -this.time * 0.25;
    }
    if (this.lavaMaterial) {
      const glow = 0.9 + Math.sin(this.time * 1.7) * 0.1;
      this.lavaMaterial.color.setRGB(glow, glow, glow);
    }
    const pulse = 0.45 + (Math.sin(this.time * 3) + 1) * 0.2;
    for (const material of this.winPadMaterials) material.emissiveIntensity = pulse;
    this.training.update(delta);
    this.stage.update(delta, viewerX, viewerZ);
    this.decor.update(viewerZ);
    this.sky.follow(viewerX, viewerZ);
    this.winTrophies.update(delta);
  }

  // --------------------------------------------------------------- solids

  private buildSolids(): void {
    const groups = new Map<string, { material: Material; parts: BufferGeometry[]; shadow: boolean }>();
    const add = (key: string, make: () => Material, solid: CourseSolid, shadow = true): void => {
      let group = groups.get(key);
      if (!group) {
        group = { material: make(), parts: [], shadow };
        groups.set(key, group);
      }
      group.parts.push(boxFor(solid, TILE));
    };

    for (const solid of COURSE_SOLIDS) {
      switch (solid.kind) {
        case 'hub':
          add('hub', () => this.textured(this.textures.studs(PALETTE.hub, PALETTE.hubDark, PALETTE.hubLight)), solid, false);
          break;
        case 'start':
          add('start', () => this.textured(this.textures.studs(PALETTE.start, PALETTE.hubDark, PALETTE.hubLight)), solid);
          break;
        case 'island':
        case 'deck':
          // Each stage's rock, in the spawn's stud plate.
          add(`rock${solid.stage}`, () => this.textured(this.textures.stud(themeFor(solid.stage).rock)), solid);
          break;
        case 'wall':
          if (solid.minZ >= RIVER.startZ - 0.01 && Math.abs(solid.minX) < RIVER.halfWidth + RIVER.wallThickness + 1 && solid.maxX - solid.minX <= RIVER.wallThickness + 0.1) {
            add('dirt', () => this.textured(this.textures.stud(PALETTE.dirt)), solid);
          } else if (solid.minZ >= RIVER.endZ - 0.01) {
            add('dirt', () => this.textured(this.textures.stud(PALETTE.dirt)), solid);
          } else {
            add('wall', () => this.textured(this.textures.studs(PALETTE.wall, PALETTE.wallDark, PALETTE.wallLight)), solid);
          }
          break;
        case 'stageBase':
        case 'stageUpper':
        case 'stageWall':
        case 'stair':
          add('stage', () => this.textured(this.textures.studs(PALETTE.stage, PALETTE.stageDark, '#ffffff')), solid);
          break;
        case 'winPad': {
          const color = PALETTE.winPad[solid.stage - 1] ?? 0xffe600;
          add(`win${solid.stage}`, () => {
            const material = new MeshLambertMaterial({ map: this.textures.stud(color) });
            material.emissive.setHex(0xffffff);
            material.emissiveMap = material.map;
            material.emissiveIntensity = 0.5;
            this.materials.push(material);
            this.winPadMaterials.push(material);
            return material;
          }, solid, false);
          break;
        }
        case 'belt':
        case 'console':
          // Drawn by the training bay.
          break;
      }
    }

    for (const group of groups.values()) {
      const merged = mergeGeometries(group.parts, false);
      for (const part of group.parts) part.dispose();
      if (!merged) continue;
      const mesh = new Mesh(merged, group.material);
      mesh.receiveShadow = true;
      mesh.castShadow = group.shadow;
      this.root.add(mesh);
    }
  }

  // ----------------------------------------------------------------- lava

  /** The river of lava: one wide plane, glowing, crawling slowly downstream. */
  private buildLava(): void {
    const width = RIVER.halfWidth * 2 + 4;
    const length = RIVER.endZ - RIVER.startZ + 10;
    const map = this.textures.stud(PALETTE.lava).clone();
    map.needsUpdate = true;
    map.repeat.set(width / TILE, length / TILE);
    this.lavaMap = map;
    const material = new MeshBasicMaterial({ map, fog: false });
    this.materials.push(material);
    this.lavaMaterial = material;
    const plane = new PlaneGeometry(width, length);
    plane.rotateX(-Math.PI / 2);
    const lava = new Mesh(plane, material);
    lava.position.set(0, RIVER.lavaY, (RIVER.startZ + RIVER.endZ) / 2);
    this.root.add(lava);
  }

  // --------------------------------------------------------------- scenery

  /** Stepped dirt cliffs with grass caps and round trees, rising away from the river. */
  private buildCliffs(): void {
    const dirt: BufferGeometry[] = [];
    const grass: BufferGeometry[] = [];
    const trees = new Map<number, { trunks: BufferGeometry[]; light: BufferGeometry[]; dark: BufferGeometry[] }>();
    const treesAt = (z: number): { trunks: BufferGeometry[]; light: BufferGeometry[]; dark: BufferGeometry[] } => {
      const stage = STAGES.find((s) => z <= s.endZ)?.index ?? STAGES.length;
      let set = trees.get(stage);
      if (!set) {
        set = { trunks: [], light: [], dark: [] };
        trees.set(stage, set);
      }
      return set;
    };
    const random = seeded(0x7ee5);
    const inner = RIVER.halfWidth + RIVER.wallThickness;
    // Behind the hub's front walls, never inside them: the two used to share
    // their first eight units and the faces fought.
    const fromZ = HUB.maxZ + HUB_FRONT_WALL_DEPTH;
    const length = RIVER.endZ + 10 - fromZ;
    const midZ = (fromZ + RIVER.endZ + 10) / 2;

    for (const side of [-1, 1]) {
      // The grass cap on the river wall itself.
      const cap = texturedBox(RIVER.wallThickness, 1, length, TILE);
      cap.translate(side * (RIVER.halfWidth + RIVER.wallThickness / 2), RIVER.wallTopY + 0.5, midZ);
      grass.push(cap);
      // Two more tiers behind it, each higher.
      const tiers = [
        { from: inner, width: 20, top: RIVER.wallTopY + 9 },
        { from: inner + 20, width: 26, top: RIVER.wallTopY + 20 },
      ];
      for (const tier of tiers) {
        const block = texturedBox(tier.width, tier.top - RIVER.bedY, length, TILE);
        block.translate(side * (tier.from + tier.width / 2), (tier.top + RIVER.bedY) / 2, midZ);
        dirt.push(block);
        const top = texturedBox(tier.width, 1, length, TILE);
        top.translate(side * (tier.from + tier.width / 2), tier.top + 0.5, midZ);
        grass.push(top);
      }
      // Trees along each tier.
      const rows = [
        { x: RIVER.halfWidth + RIVER.wallThickness / 2, y: RIVER.wallTopY + 1, step: 34 },
        { x: inner + 10, y: RIVER.wallTopY + 10, step: 26 },
        { x: inner + 32, y: RIVER.wallTopY + 21, step: 30 },
      ];
      for (const row of rows) {
        for (let z = fromZ + 8 + random() * 10; z < RIVER.endZ; z += row.step + random() * 12) {
          const x = side * (row.x + (random() - 0.5) * 6);
          const s = 1.4 + random() * 1.2;
          const set = treesAt(z);
          const trunks = set.trunks;
          const canopy = set.light;
          const canopyDark = set.dark;
          const trunk = worldScaledUv(new CylinderGeometry(0.5 * s, 0.7 * s, 5 * s, 6), Math.PI * 1.2 * s, 5 * s);
          trunk.translate(x, row.y + 2.5 * s, z);
          trunks.push(trunk);
          const ball = worldScaledUv(new SphereGeometry(3.4 * s, 10, 8), Math.PI * 6.8 * s, Math.PI * 3.4 * s);
          ball.translate(x, row.y + 7 * s, z);
          (random() > 0.5 ? canopy : canopyDark).push(ball);
          if (random() > 0.5) {
            const block = texturedBox(4 * s, 3 * s, 4 * s, TILE);
            block.translate(x + 1.5 * s, row.y + 5.5 * s, z - 1.2 * s);
            canopyDark.push(block);
          }
        }
      }
    }
    this.addMerged(dirt, this.textured(this.textures.stud(PALETTE.dirt)), true);
    this.addMerged(grass, this.textured(this.textures.studs('#46b83c', '#2f8f2a', '#6fd862')), false);
    const trunkMaterial = this.textured(this.textures.stud(PALETTE.trunk));
    for (const [stage, set] of trees) {
      const canopy = themeFor(stage).canopy;
      this.addMerged(set.trunks, trunkMaterial, true);
      this.addMerged(set.light, this.textured(this.textures.stud(canopy)), true);
      this.addMerged(set.dark, this.textured(this.textures.stud(darker(canopy))), true);
    }
  }

  /** Big studded blue blocks and towers ringing the world, as in the reference skyline. */
  private buildBackdrop(): void {
    const blocks: BufferGeometry[] = [];
    const light: BufferGeometry[] = [];
    const random = seeded(0xb10c);
    const place = (x: number, z: number, w: number, h: number, d: number): void => {
      const block = texturedBox(w, h, d, TILE * 2);
      block.translate(x, h / 2 - 4, z);
      (random() > 0.5 ? blocks : light).push(block);
    };
    // Behind the hub.
    for (let x = -130; x <= 130; x += 26) place(x + random() * 3.5, HUB.minZ - 40 - random() * 40, 22, 50 + random() * 70, 22);
    // Along both sides of the hub.
    for (const side of [-1, 1]) {
      for (let z = HUB.minZ; z < 10; z += 28) place(side * (HUB.maxX + 34 + random() * 20), z, 24, 45 + random() * 60, 24);
    }
    // Far along the river, beyond the cliffs.
    for (const side of [-1, 1]) {
      for (let z = 40; z < RIVER.endZ + 120; z += 46) place(side * (120 + random() * 60), z, 30, 60 + random() * 80, 30);
    }
    // Past the far end.
    for (let x = -102; x <= 102; x += 34) place(x, RIVER.endZ + 70 + random() * 30, 28, 70 + random() * 70, 28);

    this.addMerged(blocks, this.textured(this.textures.studs(PALETTE.wall, PALETTE.wallDark, PALETTE.wallLight)), false);
    this.addMerged(light, this.textured(this.textures.studs('#4a5c9e', '#394a84', '#6475b8')), false);
  }

  /** White chevrons on the floor, pointing from the spawn to the river. */
  private buildArrows(): void {
    const material = new MeshBasicMaterial({
      map: this.textures.chevron(),
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      opacity: 0.92,
    });
    this.materials.push(material);
    const parts: BufferGeometry[] = [];
    for (let z = SPAWN_POSITION.z + 6; z < HUB.maxZ - 2; z += 4.5) {
      const arrow = new PlaneGeometry(3.4, 3.4);
      arrow.rotateX(-Math.PI / 2);
      arrow.rotateY(Math.PI);
      arrow.translate(0, HUB.floorY + 0.04, z);
      parts.push(arrow);
    }
    this.addMerged(parts, material, false);
  }

  /** The game's title over the river mouth. Stage and pad signs live in StageDecor. */
  private buildSigns(): void {
    const title = new CanvasSign(46, 10, [
      { text: '+1 TONGUE ESCAPE', size: 1, fill: '#ff7fbf', stroke: '#2a0a22', strokeWidth: 0.16 },
      { text: 'Throw your tongue across the lava!', size: 0.42, fill: '#ffffff', stroke: '#1a1a2e', strokeWidth: 0.18 },
    ]);
    title.mesh.position.set(0, 34, START_PLATFORM.minZ + 2);
    title.mesh.rotation.y = Math.PI;
    this.track(title);
  }

  // --------------------------------------------------------------- helpers

  private track(sign: CanvasSign): void {
    this.signs.push(sign);
    this.root.add(sign.mesh);
  }

  private addMerged(parts: BufferGeometry[], material: Material, shadow: boolean): void {
    if (parts.length === 0) return;
    const merged = mergeGeometries(parts, false);
    for (const part of parts) part.dispose();
    if (!merged) return;
    const mesh = new Mesh(merged, material);
    mesh.castShadow = shadow;
    mesh.receiveShadow = true;
    this.root.add(mesh);
  }

  private textured(map: Texture): Material {
    const material = new MeshLambertMaterial({ map });
    this.materials.push(material);
    return material;
  }

  private solid(color: number): Material {
    const material = new MeshLambertMaterial({ color });
    this.materials.push(material);
    return material;
  }

  dispose(): void {
    this.textures.dispose();
    for (const material of this.materials) material.dispose();
    for (const sign of this.signs) sign.dispose();
    this.lavaMap?.dispose();
    this.training.dispose();
    this.stage.dispose();
    this.scoreboard.dispose();
    this.sky.dispose();
    this.winTrophies.dispose();
    this.decor.dispose();
    this.root.removeFromParent();
  }
}

const boxFor = (solid: CourseSolid, tile: number): BufferGeometry => {
  const geometry = texturedBox(solid.maxX - solid.minX, solid.maxY - solid.minY, solid.maxZ - solid.minZ, tile);
  geometry.translate((solid.minX + solid.maxX) / 2, (solid.minY + solid.maxY) / 2, (solid.minZ + solid.maxZ) / 2);
  return geometry;
};

/** A canopy's shaded half. */
const darker = (color: number): number => {
  const c = (shift: number): number => Math.max(0, ((color >> shift) & 255) - 30);
  return (c(16) << 16) | (c(8) << 8) | c(0);
};
