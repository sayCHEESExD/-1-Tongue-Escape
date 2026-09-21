import { formatAmount } from '@tongue/shared';
import { injectTongueStyles } from './tongueStyles.js';

/** At most this many on screen at once: a fast walker gets a shower, not a wall. */
const POOL_SIZE = 14;
/** Matches the `aoe-pop-float` animation in the HUD sheet. */
const LIFETIME_MS = 1150;
/** Keep clear of the HUD by this much, and of the screen's edges. */
const HUD_MARGIN = 24;
const EDGE_MARGIN = 0.08;

interface Pop {
  root: HTMLDivElement;
  value: HTMLSpanElement;
  timer: number;
}

/**
 * "+3" POPS: every XP gain - the XP that fills the level bar - flashes up as
 * its amount at a random spot around the screen, floats up and fades.
 *
 * Built on the HUD sheet's existing `.aoe-pop` look and animation. The spot
 * is picked each time inside the open middle of the screen, clear of the HUD
 * (the left tiles, the trophy, the hint and the level bar, wherever the
 * responsive layout has put them), so a pop never lands on a button.
 */
export class XpPopups {
  private readonly layer: HTMLDivElement;
  private readonly pops: Pop[] = [];
  private next = 0;

  constructor(parent: HTMLElement) {
    injectTongueStyles();
    this.layer = document.createElement('div');
    this.layer.className = 'aoe-pops';
    this.layer.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < POOL_SIZE; i += 1) {
      const root = document.createElement('div');
      root.className = 'aoe-pop te-xp-pop';
      root.hidden = true;
      const value = document.createElement('span');
      value.className = 'aoe-pop__value te-xp-pop__value';
      root.append(value);
      this.layer.append(root);
      this.pops.push({ root, value, timer: 0 });
    }
    parent.appendChild(this.layer);
  }

  /** Show one gain of `amount` XP. */
  show(amount: number): void {
    if (!(amount > 0)) return;
    const pop = this.pops[this.next] as Pop;
    this.next = (this.next + 1) % this.pops.length;

    const spot = this.randomSpot();
    pop.value.textContent = `+${formatAmount(amount)}`;
    pop.root.style.left = `${spot.x}px`;
    pop.root.style.top = `${spot.y}px`;
    pop.root.style.setProperty('--aoe-pop-tilt', `${(Math.random() * 24 - 12).toFixed(1)}deg`);
    pop.root.style.setProperty('--aoe-pop-scale', (0.9 + Math.random() * 0.35).toFixed(2));
    // Restart the animation on a recycled element.
    pop.root.hidden = false;
    pop.root.classList.remove('aoe-pop--run');
    void pop.root.offsetWidth;
    pop.root.classList.add('aoe-pop--run');
    window.clearTimeout(pop.timer);
    pop.timer = window.setTimeout(() => {
      pop.root.hidden = true;
      pop.root.classList.remove('aoe-pop--run');
    }, LIFETIME_MS);
  }

  dispose(): void {
    for (const pop of this.pops) window.clearTimeout(pop.timer);
    this.layer.remove();
  }

  /** A random point in the open part of the screen, clear of the HUD. */
  private randomSpot(): { x: number; y: number } {
    const w = window.innerWidth;
    const h = window.innerHeight;
    let left = w * EDGE_MARGIN;
    let right = w * (1 - EDGE_MARGIN);
    let top = h * 0.14;
    let bottom = h * 0.78;
    const rect = (selector: string): DOMRect | null => {
      const el = document.querySelector(selector);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 ? r : null;
    };
    const rail = rect('.aoe-rail');
    if (rail) left = Math.max(left, rail.right + HUD_MARGIN * 2);
    const wins = rect('.aoe-wins');
    if (wins) top = Math.max(top, wins.bottom + HUD_MARGIN);
    const hint = rect('.te-hint');
    if (hint) top = Math.max(top, hint.bottom + HUD_MARGIN);
    const hud = rect('.te-hud');
    if (hud) bottom = Math.min(bottom, hud.top - HUD_MARGIN * 2);
    const stick = rect('.aoe-touch__stick');
    const button = rect('.aoe-touch__jump');
    if (button) right = Math.min(right, button.left - HUD_MARGIN);
    if (stick) bottom = Math.min(bottom, stick.top - HUD_MARGIN);
    // A tiny screen: fall back to the middle band rather than nowhere.
    if (right - left < 60) {
      left = w * 0.3;
      right = w * 0.7;
    }
    if (bottom - top < 60) {
      top = h * 0.3;
      bottom = h * 0.6;
    }
    return { x: left + Math.random() * (right - left), y: top + Math.random() * (bottom - top) };
  }
}
