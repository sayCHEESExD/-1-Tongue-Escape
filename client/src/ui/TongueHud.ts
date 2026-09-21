import { formatAmount, rebirthBonusPercent, resolveLevel } from '@tongue/shared';
import { injectTongueStyles } from './tongueStyles.js';

/**
 * The bottom-centre readout, as in the reference:
 *
 *            Total Tongue: 12            Rebirth: +0%
 *   [ Level 1 ======cyan======........           5/17 ]
 *
 * TWO DIFFERENT NUMBERS. "Total Tongue" is the Tongue Length stat, which
 * moves only on a level-up; the bar is XP toward the next level, resolved by
 * the same shared curve the server uses. Both are replicated server state.
 */
export class TongueHud {
  private readonly root: HTMLDivElement;
  private readonly total: HTMLDivElement;
  private readonly rebirth: HTMLDivElement;
  private readonly fill: HTMLDivElement;
  private readonly level: HTMLDivElement;
  private readonly count: HTMLDivElement;
  private lastXp = -1;
  private lastLength = -1;
  private lastRebirths = -1;
  private bumpTimer = 0;

  constructor(parent: HTMLElement) {
    injectTongueStyles();
    this.root = document.createElement('div');
    this.root.className = 'te-hud';

    const top = document.createElement('div');
    top.className = 'te-hud__top';
    this.total = document.createElement('div');
    this.total.className = 'te-hud__total te-outline';
    this.rebirth = document.createElement('div');
    this.rebirth.className = 'te-hud__rebirth';
    top.append(this.total, this.rebirth);

    const bar = document.createElement('div');
    bar.className = 'te-bar';
    this.fill = document.createElement('div');
    this.fill.className = 'te-bar__fill';
    this.level = document.createElement('div');
    this.level.className = 'te-bar__level te-outline';
    this.count = document.createElement('div');
    this.count.className = 'te-bar__count te-outline';
    bar.append(this.fill, this.level, this.count);

    this.root.append(top, bar);
    parent.appendChild(this.root);
  }

  update(xp: number, tongueLength: number, rebirths: number): void {
    if (xp !== this.lastXp) {
      this.lastXp = xp;
      const progress = resolveLevel(xp);
      this.level.textContent = `Level ${progress.level}`;
      this.count.textContent = `${formatAmount(progress.into)}/${formatAmount(progress.required)}`;
      this.fill.style.width = `${(progress.fraction * 100).toFixed(1)}%`;
    }
    if (tongueLength !== this.lastLength) {
      const rose = this.lastLength >= 0 && tongueLength > this.lastLength;
      this.lastLength = tongueLength;
      this.total.textContent = `Total Tongue: ${formatAmount(tongueLength)}`;
      if (rose) this.bump();
    }
    if (rebirths !== this.lastRebirths) {
      this.lastRebirths = rebirths;
      this.rebirth.textContent = `Rebirth: +${rebirthBonusPercent(rebirths)}%`;
    }
  }

  private bump(): void {
    if (this.bumpTimer) return;
    this.root.classList.add('te-hud--up');
    this.bumpTimer = window.setTimeout(() => {
      this.root.classList.remove('te-hud--up');
      this.bumpTimer = 0;
    }, 440);
  }

  dispose(): void {
    window.clearTimeout(this.bumpTimer);
    this.root.remove();
  }
}
