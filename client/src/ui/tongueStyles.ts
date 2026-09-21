import { injectHudStyles } from './hudStyles.js';

/**
 * The +1 Tongue Escape layer over the shared HUD sheet, laid out as the
 * reference screenshots are:
 *
 *   - top-left: a big trophy and the Wins count;
 *   - down the left: chunky square tiles in a two-column grid, label across
 *     the bottom edge, red "!" badge when something can be done - anchored to
 *     the LEFT edge at its VERTICAL CENTRE;
 *   - bottom centre: "Total Tongue: N", "Rebirth: +N%" at the bar's right
 *     shoulder, and the cyan studded level bar - "Level 1 ... 12/17";
 *   - top centre: one green hint line;
 *   - the Rebirth and Trails menus: studded light-grey cards, a red X.
 *
 * EVERY SIZE AND OFFSET IS IN HUD UNITS (var(--u), defined in the shared sheet),
 * with a pixel floor only where text must stay readable: the whole HUD scales
 * and re-anchors together with the viewport - no per-device sizes.
 *
 * NO BACKTICKS IN THE STYLESHEET: it is a template literal.
 */
let injected = false;

export const injectTongueStyles = (): void => {
  if (injected) return;
  injected = true;
  injectHudStyles();

  const style = document.createElement('style');
  style.textContent = `
:root {
  --te-ink: #141a2e;
  --te-cyan: #3fd2ff;
  --te-cyan-dark: #1a9fdc;
  --te-purple: #b04dff;
  --te-studs: radial-gradient(circle at 50% 50%, rgba(255,255,255,0.55) 0 22%, rgba(0,0,0,0.07) 24% 28%, transparent 30%),
    linear-gradient(135deg, rgba(255,255,255,0.35), rgba(0,0,0,0.06));

  /*
   * THE HUD'S GEOMETRY, in HUD units (var(--u), see the shared sheet): one
   * place for every size and offset, so the whole HUD scales and re-anchors
   * together. Other rules - the touch controls included - read these.
   */
  --te-edge: max(10px, calc(18 * var(--u)));
  --te-top: calc(max(10px, env(safe-area-inset-top, 0px)) + var(--aoe-portal-top, 0px));
  --te-tile: calc(122 * var(--u));
  --te-tile-gap-x: calc(16 * var(--u));
  --te-tile-gap-y: calc(30 * var(--u));
  --te-hud-bottom: max(calc(12 * var(--u)), env(safe-area-inset-bottom, 0px));
  --te-hud-top-h: calc(62 * var(--u));
  --te-bar-h: calc(62 * var(--u));
  /* The whole bottom block, bar and "Total Tongue" line, from the screen's bottom edge. */
  --te-hud-reserve: calc(var(--te-hud-bottom) + var(--te-hud-top-h) + var(--te-bar-h) + 8px);
}
.te-outline {
  color: #fff;
  text-shadow:
    3px 0 0 var(--te-ink), -3px 0 0 var(--te-ink), 0 3px 0 var(--te-ink), 0 -3px 0 var(--te-ink),
    2px 2px 0 var(--te-ink), -2px 2px 0 var(--te-ink), 2px -2px 0 var(--te-ink), -2px -2px 0 var(--te-ink),
    0 4px 6px rgba(0,0,0,0.35);
}

/* ---- Wins: the trophy, top-left ------------------------------------------ */
.aoe-wins {
  left: max(var(--te-edge), env(safe-area-inset-left, 0px));
  /* Below the top-centre hint line even when it wraps on a narrow screen. */
  top: calc(var(--te-top) + max(50px, calc(58 * var(--u))));
  transform: none;
  gap: calc(4 * var(--u));
}
.aoe-wins__icon { width: calc(112 * var(--u)); height: calc(112 * var(--u)); }
.aoe-wins__value {
  font-size: calc(88 * var(--u));
  color: #ffffff;
}

/* ---- The left tiles: a two-column grid, anchored LEFT + VERTICAL CENTRE ---- */
.aoe-rail {
  --gs-rail: var(--te-tile);
  left: max(var(--te-edge), env(safe-area-inset-left, 0px));
  top: 50%;
  transform: translateY(-50%);
  display: grid;
  grid-template-columns: repeat(2, var(--gs-rail));
  gap: var(--te-tile-gap-y) var(--te-tile-gap-x);
}
.aoe-tile { border-radius: calc(14 * var(--u)); }
.aoe-tile .aoe-icon { width: 78%; height: 78%; object-fit: contain; filter: drop-shadow(0 3px 3px rgba(0,0,0,0.35)); }
.aoe-tile__label { font-size: max(11px, calc(34 * var(--u))); bottom: calc(-16 * var(--u)); }
.aoe-tile--trails { --tile-a: #ff6be0; --tile-b: #a44bff; }
.aoe-tile--rebirth { --tile-a: #58b8ff; --tile-b: #2f6fe0; }
.aoe-tile--audio { --tile-a: #ffec5c; --tile-b: #f5b800; }
.aoe-tile--bux { --tile-a: #6fe06a; --tile-b: #2f9e2b; }

/* ---- Bottom centre: Total Tongue and the level bar, anchored BOTTOM + CENTRE ---- */
.te-hud {
  position: fixed;
  left: 50%;
  bottom: var(--te-hud-bottom);
  transform: translateX(-50%);
  /* Scales with the HUD; never the full width of a phone. */
  width: min(calc(780 * var(--u)), 80vw);
  pointer-events: none;
  user-select: none;
  z-index: 20;
  font-family: var(--gs-font);
  font-weight: 700;
}
.te-hud__top { position: relative; height: var(--te-hud-top-h); }
.te-hud__total {
  position: absolute;
  left: 50%;
  bottom: 2px;
  transform: translateX(-50%);
  white-space: nowrap;
  font-size: max(14px, calc(44 * var(--u)));
  line-height: 1;
}
.te-hud__rebirth {
  position: absolute;
  right: 0;
  bottom: calc(4 * var(--u));
  white-space: nowrap;
  font-size: max(10px, calc(28 * var(--u)));
  color: #c678ff;
  text-shadow:
    2px 0 0 #2a0b52, -2px 0 0 #2a0b52, 0 2px 0 #2a0b52, 0 -2px 0 #2a0b52,
    2px 2px 0 #2a0b52, -2px 2px 0 #2a0b52, 2px -2px 0 #2a0b52, -2px -2px 0 #2a0b52;
}
.te-bar {
  position: relative;
  height: var(--te-bar-h);
  border: max(2px, calc(4 * var(--u))) solid var(--te-ink);
  border-radius: calc(10 * var(--u));
  background: #e9ecf2;
  background-image: repeating-linear-gradient(90deg, rgba(0,0,0,0.07) 0 3px, transparent 3px calc(26 * var(--u)));
  overflow: hidden;
  box-shadow: 0 calc(5 * var(--u)) 0 rgba(0,0,0,0.25);
}
.te-bar__fill {
  position: absolute;
  inset: 0 auto 0 0;
  width: 0%;
  background:
    repeating-linear-gradient(90deg, rgba(255,255,255,0.18) 0 3px, transparent 3px calc(26 * var(--u))),
    linear-gradient(180deg, #6fe2ff, var(--te-cyan) 55%, var(--te-cyan-dark));
  border-right: 3px solid rgba(20,26,46,0.35);
  transition: width 180ms ease-out;
}
.te-bar__level, .te-bar__count {
  position: absolute;
  top: 50%;
  transform: translateY(-50%);
  font-size: max(13px, calc(40 * var(--u)));
  line-height: 1;
  white-space: nowrap;
}
.te-bar__level { left: calc(14 * var(--u)); }
.te-bar__count { right: calc(14 * var(--u)); }
.te-hud--up .te-hud__total { animation: te-bump 420ms ease-out; }
@keyframes te-bump { 0% { transform: translateX(-50%) scale(1); } 35% { transform: translateX(-50%) scale(1.12); } 100% { transform: translateX(-50%) scale(1); } }

/* ---- The hint line, top centre -------------------------------------------- */
.te-hint {
  position: fixed;
  top: calc(var(--te-top) + calc(14 * var(--u)));
  left: 50%;
  transform: translateX(-50%);
  z-index: 20;
  pointer-events: none;
  font-family: var(--gs-font);
  font-weight: 700;
  font-size: max(12px, calc(26 * var(--u)));
  color: #5dff6a;
  /* One line where it fits; wraps between the top corners (wins, account) where it does not. */
  width: max-content;
  max-width: calc(100vw - 2 * max(84px, calc(170 * var(--u))));
  text-align: center;
  line-height: 1.2;
  text-shadow:
    2px 0 0 #0d3a12, -2px 0 0 #0d3a12, 0 2px 0 #0d3a12, 0 -2px 0 #0d3a12,
    2px 2px 0 #0d3a12, -2px 2px 0 #0d3a12, 2px -2px 0 #0d3a12, -2px -2px 0 #0d3a12;
}
.te-hint[hidden] { display: none; }

/* ---- Toasts: purchases, equips, refusals ----------------------------------- */
.te-toasts {
  position: fixed;
  left: 50%;
  top: 22%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: calc(8 * var(--u));
  z-index: 30;
  pointer-events: none;
  max-width: 90vw;
}
.te-toast {
  font-family: var(--gs-font);
  font-weight: 700;
  font-size: max(13px, calc(32 * var(--u)));
  text-align: center;
  animation: te-toast 2400ms ease-out forwards;
}
.te-toast--good { color: #5dff6a; }
.te-toast--bad { color: #ff5a5a; }
.te-toast--gold { color: #ffd21f; }
.te-toast--pink { color: #ff7fd0; }
@keyframes te-toast {
  0% { opacity: 0; transform: translateY(12px) scale(0.8); }
  10% { opacity: 1; transform: translateY(0) scale(1.08); }
  18% { transform: scale(1); }
  80% { opacity: 1; }
  100% { opacity: 0; transform: translateY(-18px); }
}

/* ---- XP pops: "+3" at random spots, in the level bar's cyan ----------------- */
.te-xp-pop__value {
  font-size: max(16px, calc(46 * var(--u)));
  color: #6fe2ff;
  text-shadow:
    3px 0 0 #0b3c66, -3px 0 0 #0b3c66, 0 3px 0 #0b3c66, 0 -3px 0 #0b3c66,
    2px 2px 0 #0b3c66, -2px 2px 0 #0b3c66, 2px -2px 0 #0b3c66, -2px -2px 0 #0b3c66,
    0 4px 6px rgba(0, 0, 0, 0.35);
}

/* ---- The level-up popup ---------------------------------------------------- */
.te-lvl {
  position: fixed;
  left: 50%;
  top: 24%;
  transform: translateX(-50%);
  z-index: 31;
  pointer-events: none;
  user-select: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: calc(10 * var(--u)) calc(28 * var(--u)) calc(12 * var(--u));
  border-radius: calc(18 * var(--u));
  background: radial-gradient(ellipse at center, rgba(10, 16, 34, 0.55), rgba(10, 16, 34, 0) 72%);
  font-family: var(--gs-font);
  font-weight: 700;
  white-space: nowrap;
}
.te-lvl[hidden] { display: none; }
.te-lvl__title { font-size: max(11px, calc(26 * var(--u))); letter-spacing: 0.08em; color: #ffffff; }
.te-lvl__levels {
  font-size: max(18px, calc(48 * var(--u)));
  line-height: 1.1;
  color: #4fd8ff;
  text-shadow:
    3px 0 0 #0b3c66, -3px 0 0 #0b3c66, 0 3px 0 #0b3c66, 0 -3px 0 #0b3c66,
    2px 2px 0 #0b3c66, -2px 2px 0 #0b3c66, 2px -2px 0 #0b3c66, -2px -2px 0 #0b3c66,
    0 0 18px rgba(79, 216, 255, 0.55);
}
.te-lvl__tongue {
  position: relative;
  font-size: max(19px, calc(52 * var(--u)));
  line-height: 1.1;
  color: #ff9a12;
  text-shadow:
    4px 0 0 #2a1300, -4px 0 0 #2a1300, 0 4px 0 #2a1300, 0 -4px 0 #2a1300,
    3px 3px 0 #2a1300, -3px 3px 0 #2a1300, 3px -3px 0 #2a1300, -3px -3px 0 #2a1300,
    0 6px 4px rgba(0, 0, 0, 0.35);
}
/* The gradient fill, laid over the outlined text: yellow on top, orange below. */
.te-lvl__tongue::after {
  content: attr(data-text);
  position: absolute;
  inset: 0;
  text-shadow: none;
  background: linear-gradient(180deg, #fff27a 0%, #ffc21a 45%, #ff7a0a 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.te-lvl__gain { font-size: max(12px, calc(30 * var(--u))); color: #5dff6a; }
.te-lvl--in { animation: te-lvl-in 460ms cubic-bezier(0.2, 1.4, 0.4, 1) both; }
.te-lvl--out { animation: te-lvl-out 450ms ease-in forwards; }
@keyframes te-lvl-in {
  0% { opacity: 0; transform: translateX(-50%) scale(0.4); }
  100% { opacity: 1; transform: translateX(-50%) scale(1); }
}
@keyframes te-lvl-out {
  0% { opacity: 1; transform: translateX(-50%) translateY(0); }
  100% { opacity: 0; transform: translateX(-50%) translateY(-26px); }
}
@media (prefers-reduced-motion: reduce) {
  .te-lvl--in, .te-lvl--out { animation-duration: 1ms; }
}

/* ---- The music tile: the supplied speaker, struck through when muted ------ */
.aoe-tile--audio .aoe-icon { width: 74%; height: 74%; }
.aoe-tile--audio.aoe-tile--off::after {
  content: "";
  position: absolute;
  left: 14%;
  right: 14%;
  top: 50%;
  height: max(3px, calc(7 * var(--u)));
  margin-top: max(-3px, calc(-3 * var(--u)));
  border-radius: calc(4 * var(--u));
  background: #ff3b3b;
  border: max(1px, calc(2 * var(--u))) solid var(--te-ink);
  transform: rotate(-40deg);
  pointer-events: none;
}

/* ---- Menus: the studded light-grey card of the reference ------------------- */
.aoe-panel--te .aoe-panel__box {
  background-color: #eef0f4;
  background-image: var(--te-studs);
  background-size: 34px 34px, 100% 100%;
  border: 5px solid var(--te-ink);
  border-radius: 18px;
}
.aoe-panel--te .aoe-panel__head {
  background: transparent;
  color: #fff;
  justify-content: flex-start;
  padding-top: 10px;
}
.aoe-panel--te .aoe-panel__title {
  text-align: left;
  font-size: clamp(28px, 3vw, 46px);
  text-shadow:
    3px 0 0 var(--te-ink), -3px 0 0 var(--te-ink), 0 3px 0 var(--te-ink), 0 -3px 0 var(--te-ink),
    2px 2px 0 var(--te-ink), -2px 2px 0 var(--te-ink), 2px -2px 0 var(--te-ink), -2px -2px 0 var(--te-ink);
}
.aoe-panel--te .aoe-panel__close {
  width: clamp(50px, 5vw, 78px);
  height: clamp(50px, 5vw, 78px);
  font-size: clamp(28px, 3vw, 46px);
  border-radius: 12px;
  background: linear-gradient(180deg, #ff5a5a, #d91f1f);
  border: 4px solid var(--te-ink);
}

/* The rebirth menu. */
.te-rb__heads { display: grid; grid-template-columns: 1fr 70px 1fr; text-align: center; margin-bottom: 8px; font-size: clamp(20px, 2.2vw, 34px); }
.te-rb__row { display: grid; grid-template-columns: 1fr 70px 1fr; align-items: center; gap: 10px 0; margin-bottom: 12px; }
.te-rb__card {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: clamp(54px, 5.6vw, 84px);
  border: 4px solid var(--te-ink);
  border-radius: 12px;
  font-size: clamp(22px, 2.6vw, 42px);
  box-shadow: inset 0 3px 0 rgba(255,255,255,0.35);
}
.te-rb__card .aoe-icon { height: 1.1em; width: auto; }
.te-rb__card--mult { background: linear-gradient(180deg, #45c8ff, #1a8fe0); }
.te-rb__card--level { background: linear-gradient(180deg, #ffc93a, #ff8a1a); }
.te-rb__arrow { justify-self: center; width: 46px; height: 46px; }
.te-rb__note { text-align: center; font-size: clamp(18px, 2vw, 30px); margin: 4px 0 10px; }
.te-rb__bar {
  position: relative;
  height: clamp(40px, 4vw, 56px);
  border: 4px solid var(--te-ink);
  border-radius: 12px;
  background: #d9dce3;
  overflow: hidden;
  margin: 0 4% 16px;
}
.te-rb__fill { position: absolute; inset: 0 auto 0 0; background: linear-gradient(180deg, #b6ff3a, #62d41a); transition: width 200ms ease-out; }
.te-rb__label { position: absolute; inset: 0; display: grid; place-items: center; font-size: clamp(18px, 2vw, 30px); }
.te-rb__actions { display: flex; justify-content: center; gap: 14px; }
.te-btn {
  font-family: var(--gs-font);
  font-weight: 700;
  font-size: clamp(20px, 2.2vw, 34px);
  padding: 10px 28px;
  border: 4px solid var(--te-ink);
  border-radius: 14px;
  color: #fff;
  cursor: pointer;
  box-shadow: 0 5px 0 rgba(0,0,0,0.3), inset 0 3px 0 rgba(255,255,255,0.3);
}
.te-btn:active:not(:disabled) { transform: translateY(3px); box-shadow: 0 2px 0 rgba(0,0,0,0.3); }
.te-btn--purple { background: linear-gradient(180deg, #c05cff, #8a2be2); }
.te-btn--green { background: linear-gradient(180deg, #6fe06a, #2f9e2b); }
.te-btn--cyan { background: linear-gradient(180deg, #56d4ff, #1fa8e8); }
.te-btn--gold { background: linear-gradient(180deg, #d6ff3a, #9ad414); color: #fff; }
.te-btn:disabled { cursor: default; filter: saturate(0.85); }

/* The trails menu. */
.te-trails { display: flex; flex-direction: column; gap: 12px; max-height: min(62vh, 560px); overflow-y: auto; padding: 4px 6px 8px; }
.te-trail {
  display: grid;
  grid-template-columns: 1fr auto;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border: 4px solid var(--te-ink);
  border-radius: 14px;
  background: linear-gradient(180deg, #ea8bff, #b04dff);
  box-shadow: inset 0 3px 0 rgba(255,255,255,0.3);
}
.te-trail--equipped { background: linear-gradient(180deg, #7fe6ff, #2f9ee8); }
.te-trail__name { font-size: clamp(22px, 2.3vw, 38px); line-height: 1.05; }
.te-trail__art { display: flex; align-items: center; gap: 10px; }
.te-trail__art svg { width: clamp(80px, 8vw, 128px); height: auto; filter: drop-shadow(0 3px 3px rgba(0,0,0,0.3)); }
.te-trail__mult { display: flex; align-items: center; gap: 4px; font-size: clamp(16px, 1.6vw, 26px); }
.te-trail__mult .aoe-icon { width: 1.2em; height: 1.2em; }
.te-trail__buy { display: flex; align-items: center; gap: 8px; min-width: 150px; justify-content: center; }
.te-trail__buy .aoe-icon { height: 1.2em; width: auto; }

/*
 * TOUCH: the stick and the TONGUE button share the bottom corners with the
 * level bar. Upright, there is no room beside the bar, so the controls stand
 * on top of it (the bar stays anchored to the bottom). Sideways, the bar fits
 * between them: it narrows, if it has to, to the gap they leave.
 */
@media (orientation: portrait) {
  body.aoe-touch-mode { --aoe-controls-lift: var(--te-hud-reserve); }
}
@media (orientation: landscape) {
  body.aoe-touch-mode .te-hud {
    width: min(
      calc(780 * var(--u)),
      80vw,
      calc(100vw - 2 * (max(26px + 2 * var(--aoe-stick-radius, 48px), 24px + var(--aoe-jump-size, 88px)) + 12px))
    );
  }
}
`;
  document.head.appendChild(style);
};
