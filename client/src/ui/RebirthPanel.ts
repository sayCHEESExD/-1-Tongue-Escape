import { canRebirth, formatMultiplier, rebirthMultiplier, rebirthRequiredLevel } from '@tongue/shared';
import { ICONS, STAR_ICON, TONGUE_ICON } from './hudStyles.js';
import { Panel } from './Panel.js';
import { injectTongueStyles } from './tongueStyles.js';

const ARROW =
  '<svg class="te-rb__arrow" viewBox="0 0 24 24" aria-hidden="true">' +
  '<path fill="#ffffff" stroke="#141a2e" stroke-width="1.8" stroke-linejoin="round" d="M3 9h9V4.5l9 7.5-9 7.5V15H3z"/></svg>';

/**
 * The Rebirth menu, laid out as the reference:
 *
 *        Before              After
 *   [ * x1.00 ]    ->    [ * x1.50 ]
 *   [ Level 10 ]   ->    [ Level 20 ]
 *        Rebirth resets your levels!
 *   [=====          1/10            ]
 *              [ No Levels ]
 *
 * The button reads "No Levels" until the level is reached and "Rebirth" once
 * it is. The client only ASKS; the server checks its own level and count.
 */
export class RebirthPanel extends Panel {
  private readonly beforeMult: HTMLSpanElement;
  private readonly afterMult: HTMLSpanElement;
  private readonly beforeLevel: HTMLSpanElement;
  private readonly afterLevel: HTMLSpanElement;
  private readonly fill: HTMLDivElement;
  private readonly label: HTMLDivElement;
  private readonly button: HTMLButtonElement;
  private eligible = false;

  constructor(parent: HTMLElement, onRebirth: () => void) {
    injectTongueStyles();
    super(parent, 'te', 'Rebirth', ICONS.rebirth);

    const heads = document.createElement('div');
    heads.className = 'te-rb__heads aoe-font te-outline';
    heads.innerHTML = '<span>Before</span><span></span><span>After</span>';

    const row = (kind: string, icon: string): [HTMLDivElement, HTMLSpanElement, HTMLSpanElement] => {
      const el = document.createElement('div');
      el.className = 'te-rb__row';
      const before = document.createElement('div');
      before.className = `te-rb__card te-rb__card--${kind} aoe-font te-outline`;
      const beforeText = document.createElement('span');
      before.innerHTML = icon;
      before.append(beforeText);
      const arrow = document.createElement('div');
      arrow.innerHTML = ARROW;
      arrow.style.display = 'grid';
      arrow.style.placeItems = 'center';
      const after = document.createElement('div');
      after.className = `te-rb__card te-rb__card--${kind} aoe-font te-outline`;
      const afterText = document.createElement('span');
      after.innerHTML = icon;
      after.append(afterText);
      el.append(before, arrow, after);
      return [el, beforeText, afterText];
    };
    const [multRow, beforeMult, afterMult] = row('mult', STAR_ICON);
    const [levelRow, beforeLevel, afterLevel] = row('level', TONGUE_ICON);
    this.beforeMult = beforeMult;
    this.afterMult = afterMult;
    this.beforeLevel = beforeLevel;
    this.afterLevel = afterLevel;

    const note = document.createElement('div');
    note.className = 'te-rb__note aoe-font';
    note.style.color = '#b04dff';
    note.style.textShadow = '2px 0 0 #fff,-2px 0 0 #fff,0 2px 0 #fff,0 -2px 0 #fff';
    note.textContent = 'Rebirth resets your levels!';

    const bar = document.createElement('div');
    bar.className = 'te-rb__bar';
    this.fill = document.createElement('div');
    this.fill.className = 'te-rb__fill';
    this.label = document.createElement('div');
    this.label.className = 'te-rb__label aoe-font te-outline';
    bar.append(this.fill, this.label);

    const actions = document.createElement('div');
    actions.className = 'te-rb__actions';
    this.button = document.createElement('button');
    this.button.type = 'button';
    this.button.className = 'te-btn te-btn--purple te-outline';
    this.button.addEventListener('click', () => {
      if (!this.eligible) return;
      onRebirth();
      this.setOpen(false);
    });
    actions.append(this.button);

    this.body.append(heads, multRow, levelRow, note, bar, actions);
    this.setProgress(1, 0);
  }

  get isEligible(): boolean {
    return this.eligible;
  }

  setProgress(level: number, rebirths: number): void {
    const required = rebirthRequiredLevel(rebirths);
    this.eligible = canRebirth(level, rebirths);
    this.beforeMult.textContent = formatMultiplier(rebirthMultiplier(rebirths));
    this.afterMult.textContent = formatMultiplier(rebirthMultiplier(rebirths + 1));
    this.beforeLevel.textContent = `Level ${required}`;
    this.afterLevel.textContent = `Level ${rebirthRequiredLevel(rebirths + 1)}`;
    const shown = Math.min(level, required);
    this.fill.style.width = `${Math.min(100, (shown / required) * 100).toFixed(1)}%`;
    this.label.textContent = `${shown}/${required}`;
    this.button.textContent = this.eligible ? 'Rebirth' : 'No Levels';
    this.button.className = `te-btn ${this.eligible ? 'te-btn--green' : 'te-btn--purple'} te-outline`;
    this.button.disabled = !this.eligible;
  }
}
