/**
 * The course, checked by PLAYING it through the real shared simulation.
 *
 * All thirty stages are crossed with actual throws - `stepPlayer`, windup to
 * landing - at the Tongue Length of their recommended level. Each stage from
 * 2 on is then proven to ASK for that level: its gate throw, made with the
 * Tongue Length of three levels lower, runs out in the air and the rider burns.
 * Then the STEERING: straight, slight and strong A/D, S, letting go, the ride
 * following the exact laid curve, steering onto and away from real islands,
 * nothing in the chosen direction, and islands beyond the tongue. The hub is walked.
 *
 * Run after `npm run build:shared`.
 */
import * as S from '../shared/dist/index.js';

let failures = 0;
const fail = (message) => {
  failures += 1;
  console.log(`  FAIL  ${message}`);
};
const pass = (message) => console.log(`  ok    ${message}`);
const check = (condition, message) => (condition ? pass(message) : fail(message));

const collision = new S.WorldCollision();
const events = S.createSimEvents();
const DT = 1 / 60;

const run = (motion, input, length, seconds) => {
  for (let i = 0; i < Math.round(seconds * 60); i += 1) S.stepPlayer(motion, input, { length }, DT, collision, events);
};

const place = (x, y, z, yaw = 0) => {
  const motion = S.createMotion();
  S.resetMotion(motion, x, y, z, yaw);
  return motion;
};

/** Press the tongue once facing `yaw`, then ride it out. Returns the throw's arc. */
const throwAt = (motion, yaw, length) => {
  const press = { moveX: 0, moveZ: 0, tongue: true, cameraYaw: yaw };
  const idle = { moveX: 0, moveZ: 0, tongue: false, cameraYaw: yaw };
  S.stepPlayer(motion, press, { length }, DT, collision, events);
  const thrown = motion.tonguePhase !== S.TonguePhase.None;
  const arc = { sx: motion.sx, sy: motion.sy, sz: motion.sz, ex: motion.ex, ey: motion.ey, ez: motion.ez, hit: motion.tongueHit };
  run(motion, idle, length, 6);
  return { thrown, arc };
};

const clampTo = (value, min, max) => Math.max(min, Math.min(max, value));
const inside = (motion, s) =>
  Math.abs(motion.x - s.x) <= s.width / 2 + 0.9 && Math.abs(motion.z - s.z) <= s.depth / 2 + 0.9 && Math.abs(motion.y - s.topY) < 0.05;

/** Stand at the edge of `from` nearest `to`, and aim two units inside `to`'s nearest landable point. */
const standAndAim = (from, to) => {
  const sx = clampTo(to.x, from.x - from.width / 2 + 0.9, from.x + from.width / 2 - 0.9);
  const sz = from.z + from.depth / 2 - 0.9;
  const nx = clampTo(sx, to.x - to.width / 2 + 1, to.x + to.width / 2 - 1);
  const nz = to.z - to.depth / 2 + 1;
  const dx = to.x - nx;
  const dz = to.z - nz;
  const dl = Math.hypot(dx, dz) || 1;
  const ax = nx + (dx / dl) * 2;
  const az = nz + (dz / dl) * 2;
  return { sx, sz, yaw: Math.atan2(ax - sx, az - sz) };
};

const startSurface = {
  x: 0,
  z: (S.START_PLATFORM.minZ + S.START_PLATFORM.maxZ) / 2,
  width: 58,
  depth: S.START_PLATFORM.maxZ - S.START_PLATFORM.minZ,
  topY: S.START_PLATFORM.topY,
};

/** Cross a stage throw by throw. Returns the number of throws that did not move the rider forward. */
const crossStage = (stage, from, length) => {
  const route = [...stage.islands, stage.deck];
  let standing = from;
  let at = 0;
  let throws = 0;
  while (at < route.length && throws < route.length + 4) {
    const next = route[at];
    const { sx, sz, yaw } = standAndAim(standing, next);
    const motion = place(sx, standing.topY, sz, yaw);
    const { arc } = throwAt(motion, yaw, length);
    throws += 1;
    if (Math.hypot(arc.ex - arc.sx, arc.ez - arc.sz) > length + 1e-6) return { ok: false, why: 'a throw went past the Tongue Length' };
    // Wherever it landed along the route counts: a long tongue may skip one.
    const landed = route.findIndex((s, i) => i >= at && inside(motion, s));
    if (landed < 0) return { ok: false, why: `lost at ${at < stage.islands.length ? `island ${at + 1}` : 'the deck'} (y ${motion.y.toFixed(1)}, z ${motion.z.toFixed(1)})` };
    standing = route[landed];
    at = landed + 1;
  }
  return { ok: at >= route.length, throws };
};

console.log('\nTongue Length');
check(S.tongueLengthFor(1) === 12, 'Level 1 Tongue Length is 12 studs');
check(S.tongueLengthFor(5) === 24, 'Level 5 Tongue Length is 24 studs');
let steady = true;
for (let level = 1; level < 60; level += 1) if (S.tongueLengthFor(level + 1) - S.tongueLengthFor(level) !== 3) steady = false;
check(steady, 'every level-up adds exactly 3 studs');
{
  // XP within a level never moves the length: the stat is a function of level alone.
  const into = S.totalXpToReach(4);
  const same = [into, into + 1, into + S.xpForNextLevel(4) - 1].map((xp) => S.tongueLengthFor(S.resolveLevel(xp).level));
  check(same.every((v) => v === same[0]) && S.tongueLengthFor(S.resolveLevel(into + S.xpForNextLevel(4)).level) === same[0] + 3, 'XP inside a level leaves Tongue Length alone; the level-up adds to it');
}

console.log('\nThirty stages');
check(S.STAGES.length === 30 && S.STAGE_COUNT === 30, 'exactly 30 stages');
check(new Set(S.STAGES.map((s) => s.name)).size === 30, 'thirty different names');
const signature = (s) => JSON.stringify(s.islands.map((i) => [i.x.toFixed(1), i.width.toFixed(1), i.depth.toFixed(1), i.topY.toFixed(1)]));
check(new Set(S.STAGES.map(signature)).size === 30, 'no two stages share a layout');
check(S.STAGES.every((s, i) => i === 0 || s.pattern !== S.STAGES[i - 1].pattern), 'no two stages in a row share a pattern');
check(S.STAGES.every((s, i) => i === 0 || s.recommendedLevel > S.STAGES[i - 1].recommendedLevel), 'every stage asks for a higher level than the last');
check(S.STAGES[0].winReward === 1 && S.STAGES[1].recommendedLevel === 5, 'Stage 1 pays +1 Win; Stage 2 recommends Level 5');
const widest = (s) => Math.max(...s.islands.map((i) => i.width));
check(S.STAGES[0].islands.every((i) => i.width >= 20) && widest(S.STAGES[2]) < 10, 'Stage 1 is broad; the stepping-stone stage is small');

let from = startSurface;
for (const stage of S.STAGES) {
  const level = Math.max(1, stage.recommendedLevel);
  const length = S.tongueLengthFor(level);
  const result = crossStage(stage, from, length);
  check(result.ok, `stage ${String(stage.index).padStart(2)} ${stage.name.padEnd(16)} (${stage.pattern}) crossed at Level ${level} / ${length} studs${result.ok ? ` in ${result.throws} throws` : `: ${result.why}`}`);

  if (stage.gate >= 0) {
    const short = S.tongueLengthFor(Math.max(1, level - 3));
    const gateFrom = stage.gate === 0 ? from : stage.islands[stage.gate - 1];
    const gateTo = stage.islands[stage.gate];
    const { sx, sz, yaw } = standAndAim(gateFrom, gateTo);
    const motion = place(sx, gateFrom.topY, sz, yaw);
    const { arc } = throwAt(motion, yaw, short);
    const later = [...stage.islands.slice(stage.gate), stage.deck].some((s) => inside(motion, s));
    const burned = collision.hasFallen(motion.x, motion.y, motion.z);
    if (arc.hit || later || !burned) fail(`stage ${stage.index}: the gate throw was made with only ${short} studs`);
  }
  from = stage.deck;
}
pass('every gate throw fails three levels short: the tongue runs out and the rider burns');

console.log('\nSteering the tongue');

/**
 * Throw from (x, y, z) facing `yaw` with a tongue of `length`, holding
 * `steer(step)` = { moveX, moveZ } (camera-relative, the camera facing `yaw`)
 * every step. Records the rider during the ride.
 */
const steerThrow = (x, y, z, yaw, length, steer = () => ({ moveX: 0, moveZ: 0 })) => {
  const motion = place(x, y, z, yaw);
  let step = 0;
  const input = () => {
    const held = steer(step);
    return { moveX: held.moveX, moveZ: held.moveZ, tongue: step === 0, cameraYaw: yaw };
  };
  const ride = [];
  let frozen = null;
  for (; step < 60 * 8; step += 1) {
    const was = motion.tonguePhase;
    S.stepPlayer(motion, input(), { length }, DT, collision, events);
    if (was === S.TonguePhase.Extend && motion.tonguePhase === S.TonguePhase.Glide) {
      frozen = { headings: [...motion.tongueHeadings], sx: motion.sx, sy: motion.sy, sz: motion.sz, ex: motion.ex, ey: motion.ey, ez: motion.ez, hit: motion.tongueHit, yaw0: motion.tongueYaw0, seg: motion.tongueSeg, max: motion.tongueMax };
    }
    if (motion.tonguePhase === S.TonguePhase.Glide) ride.push([motion.x, motion.y, motion.z]);
    if (step > 1 && motion.tonguePhase === S.TonguePhase.None && frozen) break;
  }
  run(motion, { moveX: 0, moveZ: 0, tongue: false, cameraYaw: yaw }, length, 2);
  return { motion, frozen, ride };
};

/** The frozen path as the renderer and the rider see it. */
const laidOf = (f) =>
  S.layTonguePath(
    { sx: f.sx, sy: f.sy, sz: f.sz, ex: f.ex, ey: f.ey, ez: f.ez, tongueYaw0: f.yaw0, tongueMax: f.max, tongueSeg: f.seg, tongueHeadings: f.headings },
    0,
    true,
    S.createLaidTonguePath(),
  );

/** Hold a WORLD direction (radians) with the camera facing `cameraYaw`. */
const hold = (worldYaw, cameraYaw, amount = 1) => ({ moveX: -Math.sin(worldYaw - cameraYaw) * amount, moveZ: Math.cos(worldYaw - cameraYaw) * amount });

const open = { x: 0, y: S.START_PLATFORM.topY, z: S.START_PLATFORM.minZ + 1 };
{
  // Over the start platform's open slab, facing down the river, nothing reachable in 12 studs sideways.
  const L = 12;
  const straight = steerThrow(open.x, open.y, open.z, 0, L);
  const f = straight.frozen;
  const laid = laidOf(f);
  check(f && f.headings.every((h) => Math.abs(h - 0) < 1e-12), 'straight forward: every segment keeps the initial heading');
  check(f && !f.hit && Math.abs(laid.length - L) < 1e-9, `straight forward: the path is exactly ${laid.length.toFixed(2)} studs, the Tongue Length`);

  const slightLeft = steerThrow(open.x, open.y, open.z, 0, L, () => ({ moveX: -0.35, moveZ: 0 })).frozen;
  const strongLeft = steerThrow(open.x, open.y, open.z, 0, L, () => ({ moveX: -1, moveZ: 0 })).frozen;
  const slightRight = steerThrow(open.x, open.y, open.z, 0, L, () => ({ moveX: 0.35, moveZ: 0 })).frozen;
  const strongRight = steerThrow(open.x, open.y, open.z, 0, L, () => ({ moveX: 1, moveZ: 0 })).frozen;
  const endX = (fr) => laidOf(fr).xs[laidOf(fr).count - 1];
  // Camera facing +Z: its left (A) is +X, its right (D) is -X.
  check(endX(slightLeft) > 0.2 && endX(strongLeft) > endX(slightLeft) + 0.2, `A bends the tongue left, harder when held fully (${endX(slightLeft).toFixed(2)} then ${endX(strongLeft).toFixed(2)})`);
  check(endX(slightRight) < -0.2 && endX(strongRight) < endX(slightRight) - 0.2, `D bends it right, harder when held fully (${endX(slightRight).toFixed(2)} then ${endX(strongRight).toFixed(2)})`);
  const turnLimit = S.TONGUE.turnPerUnit * strongLeft.seg + 1e-9;
  const smooth = [strongLeft, strongRight].every((fr) => fr.headings.every((h, i) => Math.abs(h - (i === 0 ? fr.yaw0 : fr.headings[i - 1])) <= turnLimit));
  check(smooth, `no corners: every segment turns at most ${(S.TONGUE.turnPerUnit * strongLeft.seg * 180 / Math.PI).toFixed(1)} degrees`);
  check([slightLeft, strongLeft, slightRight, strongRight].every((fr) => Math.abs(laidOf(fr).length - L) < 1e-6), 'steered paths are still exactly the Tongue Length');
}
{
  // Steer for the first part only, then let go: the tongue keeps its heading and bends no further.
  const L = 36;
  const r = steerThrow(0, S.STAGES[0].deck.topY, S.STAGES[0].deck.z + 11, 0, L, (step) => (step < 30 ? { moveX: -1, moveZ: 0 } : { moveX: 0, moveZ: 0 }));
  const hs = r.frozen.headings;
  const bent = hs.findIndex((h) => Math.abs(h) > 0.01);
  const lastBend = hs.reduce((last, h, i) => (i > 0 && Math.abs(h - hs[i - 1]) > 1e-12 ? i : last), 0);
  const steady = hs.slice(lastBend).every((h) => h === hs[lastBend]);
  check(bent >= 0 && steady && lastBend < hs.length - 3, `letting go stops the bend: segments ${lastBend + 1}..${hs.length} keep one heading`);
}
{
  // W and S: holding S turns the tongue around behind.
  const L = 60;
  const back = steerThrow(0, S.STAGES[0].deck.topY, S.STAGES[0].deck.z, 0, L, () => ({ moveX: 0, moveZ: -1 })).frozen;
  const last = back.headings[back.headings.length - 1];
  check(back && Math.cos(last) < -0.5, `S steers it backward (final heading ${(last * 180 / Math.PI).toFixed(0)} degrees from forward)`);
}
{
  // The rider follows the EXACT frozen curve, to its end.
  const L = 24;
  const r = steerThrow(open.x, open.y, open.z, 0, L, () => ({ moveX: -1, moveZ: 0 }));
  const laid = laidOf(r.frozen);
  const onPath = r.ride.every(([x, y, z]) => {
    let best = Infinity;
    for (let a = 0; a <= laid.length; a += laid.length / 2000) {
      const p = { x: 0, y: 0, z: 0 };
      S.sampleTonguePath(laid, a, r.frozen.sy, r.frozen.ey, p);
      best = Math.min(best, Math.hypot(p.x - x, p.y - y, p.z - z));
    }
    return best < 0.05;
  });
  check(r.ride.length > 10 && onPath, `the ride follows the curve that was laid (${r.ride.length} ride steps, every one on the path)`);
}

// Find a real island pair where steering decides the outcome, at its stage's Tongue Length.
const findCase = (wantSteerLands) => {
  for (const stage of S.STAGES.slice(1)) {
    const L = S.tongueLengthFor(stage.recommendedLevel);
    const route = [...stage.islands, stage.deck];
    for (let i = 1; i < route.length; i += 1) {
      const from = route[i - 1];
      const to = route[i];
      const { sx, sz, yaw } = standAndAim(from, to);
      for (const off of [25, -25, 35, -35, 45, -45]) {
        const aim = yaw + (off * Math.PI) / 180;
        if (wantSteerLands) {
          const straight = steerThrow(sx, from.topY, sz, aim, L);
          if (inside(straight.motion, to)) continue;
          const steered = steerThrow(sx, from.topY, sz, aim, L, () => hold(yaw, aim));
          if (inside(steered.motion, to)) return { stage, i, off, straight, steered, to };
        } else {
          const straight = steerThrow(sx, from.topY, sz, yaw, L);
          if (!inside(straight.motion, to)) break;
          const away = steerThrow(sx, from.topY, sz, yaw, L, () => hold(yaw - Math.sign(off) * Math.PI / 2, yaw));
          if (!inside(away.motion, to)) return { stage, i, off, straight, away, to };
        }
      }
    }
  }
  return null;
};
{
  const c = findCase(true);
  check(c !== null, c ? `steering toward an island: stage ${c.stage.index}, aimed ${c.off} degrees off - unsteered it misses, steered onto it it lands` : 'no island could be reached by steering toward it');
  const a = findCase(false);
  check(a !== null && !inside(a.away.motion, a.to), a ? `steering away from an island: stage ${a.stage.index} - aimed at it it lands, steered away it does not` : 'no away case found');
}
{
  // No island in the chosen direction: ends in the air at full length (or at the wall), the rider drops and burns.
  const island = S.STAGES[1].islands[3];
  const L = S.tongueLengthFor(5);
  const r = steerThrow(island.x, island.topY, island.z, island.x > 0 ? Math.PI / 2 : -Math.PI / 2, L, () => ({ moveX: 0, moveZ: 0 }));
  const laid = laidOf(r.frozen);
  check(!r.frozen.hit && laid.length <= L + 1e-6, `facing the lava with nothing to catch it, the tongue ends in the air after ${laid.length.toFixed(1)} studs (max ${L})`);
  check(collision.hasFallen(r.motion.x, r.motion.y, r.motion.z), 'and the rider drops into the lava');
}
{
  // An island beyond the tongue: steering at it does not stretch the tongue.
  const stage = S.STAGES[4];
  const from = stage.islands[stage.gate - 1];
  const to = stage.islands[stage.gate];
  const short = S.tongueLengthFor(stage.recommendedLevel - 3);
  const { sx, sz, yaw } = standAndAim(from, to);
  const r = steerThrow(sx, from.topY, sz, yaw, short, () => hold(yaw, yaw));
  check(!r.frozen.hit && Math.abs(laidOf(r.frozen).length - short) < 1e-6 && !inside(r.motion, to), `an island beyond the tongue stays out of reach: the tongue stops at ${short} studs`);
}



console.log('\nThe hub');
{
  const motion = S.createMotion();
  run(motion, { moveX: 0, moveZ: 0, tongue: false, cameraYaw: 0 }, 12, 0.5);
  check(motion.grounded && Math.abs(motion.y) < 1e-6, 'the spawn stands on the hub floor');
  for (const tier of S.TREADMILL_TIERS) {
    const m = place(S.TREADMILLS.centerX + S.TREADMILLS.beltLength / 2 + 3, 0, tier.z);
    run(m, { moveX: 0, moveZ: 1, tongue: false, cameraYaw: -Math.PI / 2 }, 12, 0.6);
    check(m.treadmill === tier.index, `${tier.name} can be walked onto`);
  }
  check(!S.canUseTreadmill(2, 2) && S.canUseTreadmill(2, 3) && !S.canUseTreadmill(3, 4) && S.canUseTreadmill(3, 5), 'x2 needs 3 rebirths, x3 needs 5');
  const st = S.TONGUE_STAGE;
  for (const z of [(st.minZ + st.lowerMinZ) / 2, (st.lowerMaxZ + st.maxZ) / 2]) {
    const m = place(st.stairFromX - 4, 0, z);
    run(m, { moveX: 0, moveZ: 1, tongue: false, cameraYaw: Math.PI / 2 }, 12, 1.5);
    check(m.grounded && Math.abs(m.y - st.upperTopY) < 1e-6, `the stairs at z ${z} climb to the upper storey`);
  }
  check(S.TONGUE_PADS.length === 13 && S.TONGUE_PADS.every((pad) => S.tonguePadAt(pad.x, pad.topY, pad.z) === pad.slot), 'thirteen tongue pads, each recognised');
}

console.log('\nWin pads');
let pads = 0;
for (const stage of S.STAGES) {
  const m = place(stage.deck.x, stage.deck.topY, stage.deck.z - stage.deck.depth / 2 + 2);
  const yaw = Math.atan2(stage.pad.x - m.x, stage.pad.z - m.z);
  for (let i = 0; i < 180 && !S.winPadAt(m.x, m.y, m.z); i += 1) run(m, { moveX: 0, moveZ: 1, tongue: false, cameraYaw: yaw }, 12, DT);
  if (S.winPadAt(m.x, m.y, m.z)?.index === stage.index) pads += 1;
  else fail(`stage ${stage.index} win pad cannot be walked onto`);
}
check(pads === 30, `all 30 win pads can be walked onto (+${S.STAGES.map((s) => s.winReward).join(', +')})`);

if (failures > 0) {
  console.log(`\n${failures} course check(s) failed.`);
  process.exit(1);
}
console.log('\ncourse OK');
