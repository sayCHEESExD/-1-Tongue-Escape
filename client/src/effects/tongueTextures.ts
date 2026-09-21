import { tongueForSlot, type TongueTier } from '@tongue/shared';
import { CanvasTexture, NearestFilter, RepeatWrapping, SRGBColorSpace, type Texture } from 'three';

/**
 * Canvas-drawn tongue skins, one per tongue, made on first use and shared by
 * every player and every stage display wearing it. No image files: a few
 * kilobytes of canvas each, against the 12 MB budget.
 *
 * The reference tongue is BLOCKY - stacked pink bricks - so every skin is laid
 * out as bands along the tongue's length with a brick seam between them, and
 * each tongue's own character painted over that: facets, cracks, stars,
 * circuitry. U runs along the tongue, V around it.
 */
const W = 64;
const H = 32;
const cache = new Map<number, Texture>();

const hex = (value: number): string => `#${value.toString(16).padStart(6, '0')}`;

const shade = (value: number, amount: number): string => {
  const r = Math.min(255, Math.max(0, ((value >> 16) & 255) + amount));
  const g = Math.min(255, Math.max(0, ((value >> 8) & 255) + amount));
  const b = Math.min(255, Math.max(0, (value & 255) + amount));
  return `rgb(${r},${g},${b})`;
};

/** A deterministic pseudo-random sequence, so every skin is the same everywhere. */
const rng = (seed: number): (() => number) => {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
};

const paint = (tier: TongueTier, ctx: CanvasRenderingContext2D): void => {
  const random = rng(tier.slot * 7919 + 17);
  // THE BRICKS: two bands per repeat, each lit on top and shaded below.
  for (let band = 0; band < 2; band += 1) {
    const x = band * (W / 2);
    const grad = ctx.createLinearGradient(0, 0, 0, H);
    grad.addColorStop(0, shade(tier.color, 40));
    grad.addColorStop(0.5, hex(tier.color));
    grad.addColorStop(1, shade(tier.color, -45));
    ctx.fillStyle = grad;
    ctx.fillRect(x, 0, W / 2, H);
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.fillRect(x + W / 2 - 2, 0, 2, H);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    ctx.fillRect(x, 0, 2, H);
  }
  // The centre groove every tongue has.
  ctx.fillStyle = 'rgba(0,0,0,0.12)';
  ctx.fillRect(0, H / 2 - 1, W, 2);

  const accent = hex(tier.accent);
  switch (tier.fx) {
    case 'plain':
      for (let i = 0; i < 10; i += 1) {
        ctx.fillStyle = 'rgba(255,255,255,0.28)';
        ctx.beginPath();
        ctx.arc(random() * W, random() * H, 1.2, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case 'gummy':
      ctx.fillStyle = 'rgba(255,255,255,0.45)';
      ctx.fillRect(0, 4, W, 3);
      for (let i = 0; i < 16; i += 1) {
        ctx.fillStyle = i % 2 ? accent : '#ffffff';
        ctx.fillRect(random() * W, random() * H, 2, 2);
      }
      break;
    case 'slime':
      for (let i = 0; i < 9; i += 1) {
        ctx.fillStyle = accent;
        const x = random() * W;
        ctx.beginPath();
        ctx.ellipse(x, H - 3, 2.5, 5 + random() * 6, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      break;
    case 'gem':
    case 'crystal':
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 8; i += 1) {
        ctx.beginPath();
        ctx.moveTo(i * 8, 0);
        ctx.lineTo(i * 8 + 8, H / 2);
        ctx.lineTo(i * 8, H);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      for (let i = 0; i < 6; i += 1) ctx.fillRect(random() * W, random() * H, 2, 2);
      break;
    case 'lava':
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2;
      for (let i = 0; i < 7; i += 1) {
        ctx.beginPath();
        let x = random() * W;
        let y = 0;
        ctx.moveTo(x, y);
        while (y < H) {
          x += (random() - 0.5) * 10;
          y += 4 + random() * 5;
          ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      break;
    case 'fire': {
      const grad = ctx.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, 'rgba(255,240,120,0.85)');
      grad.addColorStop(1, 'rgba(255,60,0,0)');
      ctx.fillStyle = grad;
      for (let i = 0; i < 8; i += 1) {
        const x = i * 8 + random() * 4;
        ctx.beginPath();
        ctx.moveTo(x, H);
        ctx.quadraticCurveTo(x + 4, H * 0.4, x + 2, 0);
        ctx.quadraticCurveTo(x + 6, H * 0.5, x + 8, H);
        ctx.fill();
      }
      break;
    }
    case 'lightning':
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2;
      for (let row = 0; row < 3; row += 1) {
        ctx.beginPath();
        let x = 0;
        const y0 = 5 + row * 10;
        ctx.moveTo(0, y0);
        while (x < W) {
          x += 5;
          ctx.lineTo(x, y0 + (random() - 0.5) * 8);
        }
        ctx.stroke();
      }
      break;
    case 'golden':
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillRect(0, 3, W, 3);
      for (let i = 0; i < 8; i += 1) {
        const x = random() * W;
        const y = random() * H;
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x - 3, y, 6, 1);
        ctx.fillRect(x, y - 3, 1, 6);
      }
      break;
    case 'galaxy':
      ctx.fillStyle = 'rgba(255,120,240,0.35)';
      ctx.beginPath();
      ctx.ellipse(W * 0.3, H * 0.5, 14, 8, 0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(90,160,255,0.3)';
      ctx.beginPath();
      ctx.ellipse(W * 0.75, H * 0.4, 12, 7, -0.3, 0, Math.PI * 2);
      ctx.fill();
      for (let i = 0; i < 26; i += 1) {
        ctx.fillStyle = random() > 0.7 ? accent : '#ffffff';
        ctx.fillRect(random() * W, random() * H, 1.5, 1.5);
      }
      break;
    case 'void':
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 5; i += 1) {
        ctx.beginPath();
        ctx.arc(random() * W, random() * H, 3 + random() * 7, 0, Math.PI * 1.3);
        ctx.stroke();
      }
      break;
    case 'futuristic':
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 6; i += 1) {
        const y = 3 + i * 5;
        const x = random() * W * 0.5;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(x, y);
        ctx.lineTo(x + 5, y + 4);
        ctx.lineTo(W, y + 4);
        ctx.stroke();
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(x + 4, y + 2, 3, 3);
      }
      break;
  }
};

/** The shared skin for a tongue slot (0 = the default pink). */
export const tongueTexture = (slot: number): Texture => {
  const tier = tongueForSlot(slot);
  const known = cache.get(tier.slot);
  if (known) return known;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (ctx) paint(tier, ctx);
  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.magFilter = NearestFilter;
  texture.colorSpace = SRGBColorSpace;
  cache.set(tier.slot, texture);
  return texture;
};
