import { RIVER, STAGES, formatWins, type IslandDefinition, type StageDefinition } from '@tongue/shared';
import {
  CylinderGeometry,
  Group,
  Mesh,
  MeshLambertMaterial,
  OctahedronGeometry,
  SphereGeometry,
  type BufferGeometry,
} from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RAINBOW, themeFor, type PropKind, type StageTheme } from '../config/stageThemes.js';
import { CanvasSign } from './CanvasSign.js';
import { worldTextures } from './WorldTextures.js';
import { texturedBox, worldScaledUv } from './texturedBox.js';

const TILE = 4;
/** How near (in Z) a stage's signs are built, and how far before they are let go. */
const SIGN_NEAR = 420;
const SIGN_FAR = 540;

/** Deterministic PRNG, so every client dresses the islands identically. */
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

type Add = (geometry: BufferGeometry, color: number, glow?: boolean) => void;

interface Signs {
  stage: CanvasSign;
  pad: CanvasSign;
}

/**
 * THE STAGES, DRESSED. Every island gets a turf lip on top in its stage's
 * colour and a scatter of small props - plants, rocks, and the stage's own
 * things: pinwheels and wind wisps on the Windy Isles, crystals in the
 * caverns, candy canes in the cove. Each stage's gateway rises from the river
 * walls where it begins, and its signs are built only while the player is
 * near, so thirty stages of canvas text never sit in memory at once.
 *
 * Everything is the spawn's stud plate (`worldTextures.stud`), merged per
 * stage and colour; props have no collision - they are scenery on the tops.
 */
export class StageDecor {
  readonly root = new Group();

  private readonly materials = new Map<string, MeshLambertMaterial>();
  private readonly geometries: BufferGeometry[] = [];
  private readonly signs = new Map<number, Signs>();

  constructor() {
    for (const stage of STAGES) this.buildStage(stage);
  }

  /** Build the signs of the stages near the viewer, and let the far ones go. */
  update(viewerZ: number): void {
    for (const stage of STAGES) {
      const distance = Math.min(Math.abs(viewerZ - stage.signZ), Math.abs(viewerZ - stage.pad.z));
      const built = this.signs.get(stage.index);
      if (!built && distance < SIGN_NEAR) this.signs.set(stage.index, this.buildSigns(stage));
      else if (built && distance > SIGN_FAR) {
        built.stage.dispose();
        built.pad.dispose();
        this.signs.delete(stage.index);
      }
    }
  }

  private buildSigns(stage: StageDefinition): Signs {
    const sign = new CanvasSign(30, 12, [
      { text: `STAGE ${stage.index}`, size: 1, fill: '#ffffff', stroke: '#1a1a2e', strokeWidth: 0.16 },
      { text: `Recommended Level: ${stage.recommendedLevel}`, size: 0.34, fill: '#ff6ee8', stroke: '#2a0a3a', strokeWidth: 0.2 },
      { text: stage.name, size: 0.32, fill: '#7fe6ff', stroke: '#0b2a44', strokeWidth: 0.2 },
    ]);
    sign.mesh.position.set(0, stage.signY, stage.signZ);
    sign.mesh.rotation.y = Math.PI;
    this.root.add(sign.mesh);

    const reward = stage.winReward;
    const pad = new CanvasSign(9, 3, [
      { text: `+${formatWins(reward)} Win${reward === 1 ? '' : 's'}`, size: 1, fill: stage.index % 2 ? '#ffd21f' : '#4fe3ff', stroke: '#1a1a2e', strokeWidth: 0.18 },
    ]);
    pad.mesh.position.set(stage.pad.x, stage.pad.topY + 4.2, stage.pad.z);
    pad.mesh.rotation.y = Math.PI;
    this.root.add(pad.mesh);
    return { stage: sign, pad };
  }

  private buildStage(stage: StageDefinition): void {
    const theme = themeFor(stage.index);
    const random = seeded(0xdec0 + stage.index * 104729);
    const buckets = new Map<string, BufferGeometry[]>();
    const add: Add = (geometry, color, glow = false) => {
      const key = `${color}:${glow ? 1 : 0}`;
      let list = buckets.get(key);
      if (!list) {
        list = [];
        buckets.set(key, list);
      }
      // Boxes and cylinders are indexed, crystals are not; a merge needs them all alike.
      if (geometry.index) {
        const flat = geometry.toNonIndexed();
        geometry.dispose();
        list.push(flat);
      } else {
        list.push(geometry);
      }
    };

    const islands = [...stage.islands, ...stage.extras];
    islands.forEach((island, i) => {
      const top = stage.pattern === 'finale' ? (RAINBOW[i % RAINBOW.length] as number) : theme.top;
      this.cap(island, top, add);
      this.sides(island, top, theme, random, add);
      const count = Math.max(2, Math.min(14, Math.round((island.width * island.depth) / 16)));
      for (let n = 0; n < count; n += 1) {
        const x = island.x + (random() - 0.5) * (island.width - 1.4);
        const z = island.z + (random() - 0.5) * (island.depth - 1.4);
        prop(pick(theme, random), x, island.topY, z, random, theme, add);
      }
    });

    // The deck: turf, and props around its rim, clear of the win pad.
    const deck = stage.deck;
    this.cap(deck, theme.top, add);
    for (let n = 0; n < 14; n += 1) {
      const edge = random() * 4;
      const along = random() - 0.5;
      const x = edge < 2 ? deck.x + along * (deck.width - 3) : deck.x + (edge < 3 ? -1 : 1) * (deck.width / 2 - 1.5);
      const z = edge < 2 ? deck.z + (edge < 1 ? -1 : 1) * (deck.depth / 2 - 1.5) : deck.z + along * (deck.depth - 3);
      if (Math.abs(x - stage.pad.x) < 6 && Math.abs(z - stage.pad.z) < 6) continue;
      prop(pick(theme, random), x, deck.topY, z, random, theme, add);
    }

    this.gateway(stage, theme, add);

    for (const [key, parts] of buckets) {
      const merged = mergeGeometries(parts, false);
      for (const part of parts) part.dispose();
      if (!merged) continue;
      this.geometries.push(merged);
      const [color, glow] = key.split(':');
      const mesh = new Mesh(merged, this.material(Number(color), glow === '1'));
      mesh.receiveShadow = true;
      this.root.add(mesh);
    }
  }

  /** A turf lip on an island's top, a hair proud of every edge so no face is shared. */
  private cap(island: IslandDefinition, color: number, add: Add): void {
    const lip = texturedBox(island.width + 0.14, 0.4, island.depth + 0.14, TILE);
    lip.translate(island.x, island.topY - 0.2 + 0.012, island.z);
    add(lip, color);
  }

  /**
   * Break the cube: rock chunks jutting from the sides just under the lip, and
   * turf hanging over the edge. Never flush with a face, so nothing z-fights.
   */
  private sides(island: IslandDefinition, top: number, theme: StageTheme, random: () => number, add: Add): void {
    const perimeter = 2 * (island.width + island.depth);
    const count = Math.max(3, Math.min(10, Math.round(perimeter / 7)));
    for (let i = 0; i < count; i += 1) {
      const face = Math.floor(random() * 4);
      const along = random() - 0.5;
      const size = 0.7 + random() * 1.1;
      const out = size * (0.25 + random() * 0.2);
      const alongX = face < 2 ? along * (island.width - size) : 0;
      const alongZ = face >= 2 ? along * (island.depth - size) : 0;
      const x = face === 2 ? island.x - island.width / 2 - out + size / 2 : face === 3 ? island.x + island.width / 2 + out - size / 2 : island.x + alongX;
      const z = face === 0 ? island.z - island.depth / 2 - out + size / 2 : face === 1 ? island.z + island.depth / 2 + out - size / 2 : island.z + alongZ;
      const y = island.topY - 0.9 - random() * 2.4;
      add(block(size, size * 0.8, size, x, y, z, 0, 0), shade(theme.rock, random() > 0.5 ? 16 : -14));
      if (random() > 0.45) {
        // A tuft of turf spilling over the lip above it.
        add(block(size * 0.9, 0.5, 0.35, x, island.topY - 0.2, z, face >= 2 ? Math.PI / 2 : 0), top);
      }
    }
  }

  /** Two pillars on the river walls where the stage begins, crowned in its accent. */
  private gateway(stage: StageDefinition, theme: StageTheme, add: Add): void {
    const z = stage.startZ + 2;
    for (const side of [-1, 1]) {
      const x = side * (RIVER.halfWidth + RIVER.wallThickness / 2);
      const pillar = texturedBox(3, 12, 3, TILE);
      pillar.translate(x, RIVER.wallTopY + 1 + 6, z);
      add(pillar, theme.rock);
      const band = texturedBox(3.4, 1, 3.4, TILE);
      band.translate(x, RIVER.wallTopY + 1 + 11.5, z);
      add(band, theme.top);
      const crown = worldScaledUv(new OctahedronGeometry(1.8, 0), 6, 6);
      crown.scale(1, 1.5, 1);
      crown.translate(x, RIVER.wallTopY + 1 + 14.8, z);
      add(crown, theme.accent, true);
    }
  }

  private material(color: number, glow: boolean): MeshLambertMaterial {
    const key = `${color}:${glow ? 1 : 0}`;
    const known = this.materials.get(key);
    if (known) return known;
    const material = new MeshLambertMaterial({ map: worldTextures.stud(color) });
    if (glow) {
      material.emissive.setHex(0xffffff);
      material.emissiveMap = material.map;
      material.emissiveIntensity = 0.75;
    }
    this.materials.set(key, material);
    return material;
  }

  dispose(): void {
    for (const built of this.signs.values()) {
      built.stage.dispose();
      built.pad.dispose();
    }
    this.signs.clear();
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of this.materials.values()) material.dispose();
    this.root.removeFromParent();
  }
}

/** A prop kind for this theme: the first ones listed turn up most. */
const pick = (theme: StageTheme, random: () => number): PropKind =>
  theme.props[Math.min(theme.props.length - 1, Math.floor(random() ** 1.6 * theme.props.length))] as PropKind;

/** A studded box, turned and placed. */
const block = (w: number, h: number, d: number, x: number, y: number, z: number, ry = 0, rz = 0): BufferGeometry => {
  const geometry = texturedBox(w, h, d, TILE);
  if (rz) geometry.rotateZ(rz);
  if (ry) geometry.rotateY(ry);
  geometry.translate(x, y, z);
  return geometry;
};

const cylinder = (top: number, bottom: number, h: number, x: number, y: number, z: number, sides = 7): BufferGeometry => {
  const geometry = worldScaledUv(new CylinderGeometry(top, bottom, h, sides), Math.PI * 2 * Math.max(top, bottom), h);
  geometry.translate(x, y + h / 2, z);
  return geometry;
};

const gem = (r: number, stretch: number, x: number, y: number, z: number, tilt = 0): BufferGeometry => {
  const geometry = worldScaledUv(new OctahedronGeometry(r, 0), 4, 4);
  geometry.scale(1, stretch, 1);
  if (tilt) geometry.rotateZ(tilt);
  geometry.translate(x, y + r * stretch, z);
  return geometry;
};

/** One small prop standing on a surface at (x, y, z). */
const prop = (kind: PropKind, x: number, y: number, z: number, random: () => number, theme: StageTheme, add: Add): void => {
  const tint = (): number => theme.tints[Math.floor(random() * theme.tints.length)] as number;
  const turn = random() * Math.PI * 2;
  // Big enough to read from the chase camera, small enough never to crowd a landing.
  const s = (0.8 + random() * 0.5) * 1.55;
  switch (kind) {
    case 'grass':
      for (let i = 0; i < 3; i += 1) {
        const h = (0.45 + random() * 0.45) * s;
        add(block(0.14, h, 0.14, x + (i - 1) * 0.18, y + h / 2, z + (random() - 0.5) * 0.2, turn, (i - 1) * 0.28), 0x4fbf3a);
      }
      break;
    case 'flower': {
      const h = 0.55 * s;
      add(block(0.09, h, 0.09, x, y + h / 2, z), 0x3f9e2f);
      add(block(0.36 * s, 0.14, 0.36 * s, x, y + h + 0.05, z, turn), tint());
      add(block(0.14, 0.18, 0.14, x, y + h + 0.1, z), 0xffe14d);
      break;
    }
    case 'bush':
      add(block(0.9 * s, 0.7 * s, 0.9 * s, x, y + 0.35 * s, z, turn), theme.canopy);
      add(block(0.6 * s, 0.5 * s, 0.6 * s, x + 0.3 * s, y + 0.75 * s, z - 0.15 * s, turn), theme.canopy);
      break;
    case 'rock':
      add(block(0.9 * s, 0.55 * s, 0.75 * s, x, y + 0.27 * s, z, turn), shade(theme.rock, 18));
      if (random() > 0.5) add(block(0.45 * s, 0.35 * s, 0.4 * s, x + 0.55 * s, y + 0.17 * s, z + 0.2, turn * 1.7), shade(theme.rock, -10));
      break;
    case 'mushroom': {
      const h = 0.5 * s;
      add(cylinder(0.1 * s, 0.14 * s, h, x, y, z), 0xf4eee0);
      add(cylinder(0.12 * s, 0.48 * s, 0.26 * s, x, y + h, z, 8), tint());
      break;
    }
    case 'crystal': {
      const color = tint();
      for (let i = 0; i < 3; i += 1) add(gem(0.22 * s, 2.4 - i * 0.5, x + (i - 1) * 0.28, y, z + (random() - 0.5) * 0.3, (i - 1) * 0.3), color, true);
      break;
    }
    case 'pinwheel': {
      // A little windmill: a pole, a hub, four coloured blades set at 45 degrees.
      const h = 1.5 * s;
      add(block(0.1, h, 0.1, x, y + h / 2, z), 0xf4f4f4);
      add(block(0.18, 0.18, 0.18, x, y + h, z - 0.08), 0xffffff);
      for (let i = 0; i < 4; i += 1) {
        const blade = texturedBox(0.62 * s, 0.16 * s, 0.05, TILE);
        blade.translate(0.31 * s, 0, 0);
        blade.rotateZ(Math.PI / 4 + (i * Math.PI) / 2);
        blade.translate(x, y + h, z - 0.12);
        add(blade, i % 2 === 0 ? tint() : 0xffffff);
      }
      break;
    }
    case 'wisp':
      // A gust made visible: two pale streaks hanging in the air.
      for (let i = 0; i < 2; i += 1) {
        add(block(1.6 * s, 0.06, 0.22, x + i * 0.5, y + 1.6 + i * 0.7 + random() * 0.8, z + i * 0.4, turn, 0.08), 0xeef8ff, true);
      }
      break;
    case 'cactus': {
      const h = 1.2 * s;
      add(block(0.34, h, 0.34, x, y + h / 2, z), 0x3f9e3a);
      add(block(0.26, 0.5 * s, 0.26, x + 0.32, y + h * 0.6, z), 0x3f9e3a);
      add(block(0.34, 0.14, 0.14, x + 0.2, y + h * 0.42, z), 0x3f9e3a);
      break;
    }
    case 'shell':
      add(block(0.42 * s, 0.14, 0.32 * s, x, y + 0.07, z, turn), tint());
      add(block(0.28 * s, 0.1, 0.22 * s, x + 0.35, y + 0.05, z - 0.2, turn * 0.5), tint());
      break;
    case 'coral': {
      const color = tint();
      add(cylinder(0.09, 0.12, 0.8 * s, x, y, z), color);
      add(cylinder(0.07, 0.09, 0.55 * s, x + 0.22, y + 0.2, z + 0.1), color);
      add(cylinder(0.07, 0.09, 0.5 * s, x - 0.2, y + 0.15, z - 0.12), color);
      break;
    }
    case 'ice':
      for (let i = 0; i < 3; i += 1) add(cylinder(0, 0.22 * s, (0.9 - i * 0.2) * s, x + (i - 1) * 0.3, y, z + (random() - 0.5) * 0.3, 6), 0xcfeeff, i === 0);
      break;
    case 'bamboo':
      for (let i = 0; i < 3; i += 1) {
        const h = (1.4 + random() * 1.2) * s;
        const bx = x + (i - 1) * 0.3;
        add(block(0.14, h, 0.14, bx, y + h / 2, z + (random() - 0.5) * 0.3), 0x7cc83a);
        add(block(0.18, 0.06, 0.18, bx, y + h * 0.5, z), 0x5a9e2a);
      }
      break;
    case 'pumpkin': {
      const ball = worldScaledUv(new SphereGeometry(0.38 * s, 8, 6), 4, 4);
      ball.scale(1.2, 0.85, 1.2);
      ball.translate(x, y + 0.32 * s, z);
      add(ball, 0xff8a1f);
      add(block(0.08, 0.2, 0.08, x, y + 0.66 * s, z), 0x3f7a2a);
      break;
    }
    case 'lantern': {
      const h = 1.3 * s;
      add(block(0.1, h, 0.1, x, y + h / 2, z), 0x2c3448);
      add(block(0.3, 0.36, 0.3, x, y + h + 0.1, z), tint(), true);
      break;
    }
    case 'gear': {
      const cog = worldScaledUv(new CylinderGeometry(0.5 * s, 0.5 * s, 0.14, 8), 4, 1);
      cog.rotateX(Math.PI / 2);
      cog.rotateY(turn);
      cog.translate(x, y + 0.5 * s, z);
      add(cog, 0xb87333);
      add(block(0.18, 0.5 * s, 0.18, x, y + 0.25 * s, z), 0x6a4a2a);
      break;
    }
    case 'candy': {
      const h = 1.1 * s;
      for (let i = 0; i < 4; i += 1) add(cylinder(0.1, 0.1, h / 4, x, y + (i * h) / 4, z), i % 2 === 0 ? 0xffffff : tint());
      const ball = worldScaledUv(new SphereGeometry(0.3 * s, 8, 6), 4, 4);
      ball.translate(x, y + h + 0.2, z);
      add(ball, tint());
      break;
    }
    case 'spire':
      add(cylinder(0, 0.3 * s, 1.8 * s, x, y, z, 5), tint(), random() > 0.5);
      add(cylinder(0, 0.18 * s, 1.0 * s, x + 0.35, y, z + 0.2, 5), shade(theme.rock, 12));
      break;
    case 'ember':
      add(block(0.5 * s, 0.3 * s, 0.45 * s, x, y + 0.15 * s, z, turn), shade(theme.rock, -8));
      add(gem(0.16 * s, 1.6, x + 0.1, y + 0.2 * s, z, 0.2), tint(), true);
      break;
    case 'star':
      add(block(0.08, 1.1 * s, 0.08, x, y + 0.55 * s, z), 0xdfe4ee);
      add(gem(0.24 * s, 1, x, y + 1.1 * s, z), tint(), true);
      break;
    case 'neon': {
      const h = (1 + random() * 0.8) * s;
      add(block(0.12, h, 0.12, x, y + h / 2, z), tint(), true);
      break;
    }
    case 'ruin': {
      const h = (0.6 + random() * 1.0) * s;
      add(block(0.55, h, 0.55, x, y + h / 2, z), 0xe8d08a);
      if (random() > 0.5) add(block(0.8, 0.2, 0.8, x, y + h + 0.1, z), 0xffd21f);
      break;
    }
  }
};

/** A colour a little lighter or darker. */
const shade = (color: number, amount: number): number => {
  const c = (shift: number): number => Math.min(255, Math.max(0, ((color >> shift) & 255) + amount));
  return (c(16) << 16) | (c(8) << 8) | c(0);
};
