import { injectTongueStyles } from './tongueStyles.js';

export type ToastTone = 'good' | 'bad' | 'gold' | 'pink';

/** Short outlined messages in the upper middle: purchases, equips, refusals. */
export class Toasts {
  private readonly root: HTMLDivElement;
  private lastText = '';
  private lastAt = 0;

  constructor(parent: HTMLElement) {
    injectTongueStyles();
    this.root = document.createElement('div');
    this.root.className = 'te-toasts';
    parent.appendChild(this.root);
  }

  show(text: string, tone: ToastTone = 'good'): void {
    const now = performance.now();
    // The same message twice in a row is one message.
    if (text === this.lastText && now - this.lastAt < 1500) return;
    this.lastText = text;
    this.lastAt = now;
    const toast = document.createElement('div');
    toast.className = `te-toast te-toast--${tone} te-outline`;
    toast.textContent = text;
    this.root.appendChild(toast);
    while (this.root.childElementCount > 3) this.root.firstElementChild?.remove();
    window.setTimeout(() => toast.remove(), 2500);
  }

  dispose(): void {
    this.root.remove();
  }
}

/** The single green hint line at the top centre. */
export class HintLine {
  private readonly root: HTMLDivElement;
  private text = '';

  constructor(parent: HTMLElement) {
    injectTongueStyles();
    this.root = document.createElement('div');
    this.root.className = 'te-hint';
    this.root.hidden = true;
    parent.appendChild(this.root);
  }

  set(text: string): void {
    if (text === this.text) return;
    this.text = text;
    this.root.textContent = text;
    this.root.hidden = text.length === 0;
  }

  dispose(): void {
    this.root.remove();
  }
}
