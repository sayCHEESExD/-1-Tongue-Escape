import { TRAIL_TIERS, formatMultiplier, formatWins, isTrailOwned, type TrailTier } from '@tongue/shared';
import { ICONS, TONGUE_ICON } from './hudStyles.js';
import { Panel } from './Panel.js';
import { injectTongueStyles } from './tongueStyles.js';

export interface TrailActions {
  unlock(slot: number): void;
  equip(slot: number): void;
}

const hex = (value: number): string => `#${value.toString(16).padStart(6, '0')}`;

/** The trail's art: a wavy streak in its colour with sparkles, and the runner. */
const trailArt = (tier: TrailTier): string => {
  const fill =
    tier.style === 'rainbow'
      ? `url(#te-rainbow-${tier.slot})`
      : hex(tier.color);
  const defs =
    tier.style === 'rainbow'
      ? `<defs><linearGradient id="te-rainbow-${tier.slot}" x1="0" x2="1"><stop offset="0" stop-color="#ff3b3b"/><stop offset="0.25" stop-color="#ffd21f"/><stop offset="0.5" stop-color="#3fdc4a"/><stop offset="0.75" stop-color="#3fa9ff"/><stop offset="1" stop-color="#b04dff"/></linearGradient></defs>`
      : '';
  return (
    `<svg viewBox="0 0 120 80" aria-hidden="true">${defs}` +
    `<path d="M6 30c14-12 26 4 40-6s26-10 36 0v34c-10-10-22-8-36 0s-26-8-40 4z" fill="${fill}" stroke="#141a2e" stroke-width="5" stroke-linejoin="round"/>` +
    '<path d="M28 34l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" fill="#fff"/>' +
    '<path d="M58 30l2 5 5 2-5 2-2 5-2-5-5-2 5-2z" fill="#fff"/>' +
    '<rect x="80" y="12" width="22" height="22" rx="4" fill="#fff" stroke="#141a2e" stroke-width="4"/>' +
    '<rect x="78" y="34" width="26" height="22" rx="4" fill="#fff" stroke="#141a2e" stroke-width="4"/>' +
    '<rect x="76" y="54" width="12" height="18" rx="3" fill="#fff" stroke="#141a2e" stroke-width="4"/>' +
    '<rect x="92" y="54" width="12" height="18" rx="3" fill="#fff" stroke="#141a2e" stroke-width="4"/>' +
    '</svg>'
  );
};

interface Row {
  readonly tier: TrailTier;
  readonly root: HTMLDivElement;
  readonly button: HTMLButtonElement;
}

/**
 * The Trails menu, as the reference lays it out: a purple card per trail with
 * its name, its art, its "x1.25 Tongue" and a price button with the trophy.
 * Owned trails show Equip / Equipped instead. The client only asks.
 */
export class TrailsPanel extends Panel {
  private readonly rows: Row[] = [];
  private wins = 0;
  private owned = 0;
  private worn = 0;

  constructor(parent: HTMLElement, actions: TrailActions) {
    injectTongueStyles();
    super(parent, 'te', 'Trails', ICONS.trail);

    const list = document.createElement('div');
    list.className = 'te-trails';
    for (const tier of TRAIL_TIERS) {
      const root = document.createElement('div');
      root.className = 'te-trail';
      const left = document.createElement('div');
      const name = document.createElement('div');
      name.className = 'te-trail__name aoe-font te-outline';
      name.textContent = tier.name;
      const art = document.createElement('div');
      art.className = 'te-trail__art';
      art.innerHTML = trailArt(tier);
      const mult = document.createElement('div');
      mult.className = 'te-trail__mult aoe-font te-outline';
      mult.innerHTML = `${TONGUE_ICON}<span>${formatMultiplier(tier.multiplier).replace('.00', '')} Tongue</span>`;
      art.append(mult);
      left.append(name, art);

      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'te-btn te-btn--gold te-trail__buy te-outline';
      button.addEventListener('click', () => {
        if (isTrailOwned(this.owned, tier.slot)) {
          actions.equip(this.worn === tier.slot ? 0 : tier.slot);
        } else if (this.wins >= tier.winsRequired) {
          actions.unlock(tier.slot);
        }
      });
      root.append(left, button);
      list.append(root);
      this.rows.push({ tier, root, button });
    }
    this.body.append(list);
    this.refresh();
  }

  /** True when a trail can be bought right now: the tile's badge. */
  get hasAffordable(): boolean {
    return TRAIL_TIERS.some((tier) => !isTrailOwned(this.owned, tier.slot) && this.wins >= tier.winsRequired);
  }

  setInventory(wins: number, ownedTrails: number, trailSlot: number): void {
    if (wins === this.wins && ownedTrails === this.owned && trailSlot === this.worn) return;
    this.wins = wins;
    this.owned = ownedTrails;
    this.worn = trailSlot;
    this.refresh();
  }

  private refresh(): void {
    for (const row of this.rows) {
      const owned = isTrailOwned(this.owned, row.tier.slot);
      const worn = this.worn === row.tier.slot;
      row.root.classList.toggle('te-trail--equipped', worn);
      if (owned) {
        row.button.innerHTML = worn ? 'Equipped' : 'Equip';
        row.button.className = `te-btn ${worn ? 'te-btn--cyan' : 'te-btn--green'} te-trail__buy te-outline`;
        row.button.disabled = false;
      } else {
        row.button.innerHTML = `${ICONS.trophy}<span>${formatWins(row.tier.winsRequired)}</span>`;
        row.button.className = 'te-btn te-btn--gold te-trail__buy te-outline';
        row.button.disabled = this.wins < row.tier.winsRequired;
        row.button.style.opacity = row.button.disabled ? '0.7' : '1';
      }
    }
  }
}
