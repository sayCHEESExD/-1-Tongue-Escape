import { injectTongueStyles } from './tongueStyles.js';

/** Seconds the popup holds before it floats away. */
const HOLD_MS = 2400;
const FADE_MS = 450;

/**
 * THE LEVEL-UP POPUP, laid out as the reference:
 *
 *              LEVEL UP!
 *         Level 1 > Level 2           (cyan)
 *   Tongue 12 studs > 15 studs        (orange-gold)
 *              +3 Tongue
 *
 * Shown only when the LEVEL changes - never for XP. Several level-ups in a row
 * (a treadmill session, a big stride) merge into one popup that runs from the
 * first level to the latest.
 */
export class LevelUpPopup {
  private readonly root: HTMLDivElement;
  private readonly levels: HTMLDivElement;
  private readonly tongue: HTMLDivElement;
  private readonly gain: HTMLDivElement;
  private fromLevel = 0;
  private fromLength = 0;
  private hideTimer = 0;
  private doneTimer = 0;
  private visible = false;

  constructor(parent: HTMLElement) {
    injectTongueStyles();
    this.root = document.createElement('div');
    this.root.className = 'te-lvl';
    this.root.hidden = true;
    this.root.setAttribute('role', 'status');
    const title = document.createElement('div');
    title.className = 'te-lvl__title te-outline';
    title.textContent = 'LEVEL UP!';
    this.levels = document.createElement('div');
    this.levels.className = 'te-lvl__levels';
    this.tongue = document.createElement('div');
    this.tongue.className = 'te-lvl__tongue';
    this.gain = document.createElement('div');
    this.gain.className = 'te-lvl__gain te-outline';
    this.root.append(title, this.levels, this.tongue, this.gain);
    parent.appendChild(this.root);
  }

  /** A level-up happened: from `oldLevel` at `oldLength` studs to `newLevel` at `newLength`. */
  show(oldLevel: number, oldLength: number, newLevel: number, newLength: number): void {
    if (!this.visible) {
      this.fromLevel = oldLevel;
      this.fromLength = oldLength;
    }
    const gained = Math.max(0, newLength - this.fromLength);
    this.levels.textContent = `Level ${this.fromLevel} > Level ${newLevel}`;
    this.tongue.textContent = `Tongue ${fmt(this.fromLength)} studs > ${fmt(newLength)} studs`;
    this.tongue.dataset['text'] = this.tongue.textContent;
    this.gain.textContent = `+${fmt(gained)} Tongue`;

    this.visible = true;
    this.root.hidden = false;
    this.root.classList.remove('te-lvl--out', 'te-lvl--in');
    void this.root.offsetWidth;
    this.root.classList.add('te-lvl--in');
    window.clearTimeout(this.hideTimer);
    window.clearTimeout(this.doneTimer);
    this.hideTimer = window.setTimeout(() => {
      this.root.classList.add('te-lvl--out');
      this.doneTimer = window.setTimeout(() => {
        this.root.hidden = true;
        this.visible = false;
      }, FADE_MS);
    }, HOLD_MS);
  }

  dispose(): void {
    window.clearTimeout(this.hideTimer);
    window.clearTimeout(this.doneTimer);
    this.root.remove();
  }
}

const fmt = (value: number): string => (Number.isInteger(value) ? String(value) : value.toFixed(1));
