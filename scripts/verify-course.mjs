/**
 * The course, checked by PLAYING it through the real shared simulation.
 *
 * All thirty stages are crossed with actual throws - `stepPlayer`, windup to
 * landing - at the Tongue Length of their recommended level, using only the
 * DEFAULT throw (aim, click, no keys): the curved arc to the island ahead.
 * Each stage from 2 on is then proven to ASK for that level: with the Tongue
 * Length of three levels lower, neither the default throw nor any way of
 * STEERING it (W climb, S dive, A/D curve, taken over at any point) reaches
 * the gate island.
 * Then both modes: the default arc curves up and down onto the ground ahead
 * and ignores keys held at the press; fresh keys hand the tip to the player,
 * who can climb, dive and curve it freely in 3D, never pulled back to the
 * ground; the Tongue Length is a hard limit; a steered tip freezes wherever
 * it is (high above the lava included); the rider follows the exact 3D curve,
 * ends exactly at its end, then drops straight down.
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

const NONE = () => ({ moveX: 0, moveZ: 0 });

/**
 * Throw from (x, y, z) with the camera facing `yaw` and a tongue of `length`.
 * `fly(segment)` = { moveX, moveZ } is held while the tongue is deployed
 * (`segment` = segments laid so far); `air` is held once the ride is over.
 * Records the tip while deploying, the rider while riding, and the rider the
 * moment the ride ends.
 */
const flyThrow = (x, y, z, yaw, length, fly = NONE, air = NONE, after = 3, press = NONE()) => {
  const motion = place(x, y, z, yaw);
  const tips = [];
  const ride = [];
  let frozen = null;
  let arrived = null;
  for (let step = 0; step < 60 * 10; step += 1) {
    const was = motion.tonguePhase;
    // The press itself is made with the keys given by `press` (default: none held).
    const held = step === 0 ? press : was === S.TonguePhase.Glide ? NONE() : fly(motion.tongueHeadings.length / 2);
    S.stepPlayer(motion, { moveX: held.moveX, moveZ: held.moveZ, tongue: step === 0, cameraYaw: yaw }, { length }, DT, collision, events);
    if (motion.tonguePhase === S.TonguePhase.Extend) {
      const laid = S.layTonguePath(motion, S.TONGUE.maxLength, false, S.createLaidTonguePath());
      tips.push([laid.xs[laid.count - 1], laid.ys[laid.count - 1], laid.zs[laid.count - 1]]);
    }
    if (was === S.TonguePhase.Extend && motion.tonguePhase === S.TonguePhase.Glide) {
      frozen = {
        tongueHeadings: [...motion.tongueHeadings], sx: motion.sx, sy: motion.sy, sz: motion.sz, ex: motion.ex, ey: motion.ey, ez: motion.ez,
        hit: motion.tongueHit, control: motion.tongueControl, tongueYaw0: motion.tongueYaw0, tonguePitch0: motion.tonguePitch0, tongueSeg: motion.tongueSeg, tongueMax: motion.tongueMax,
      };
    }
    if (motion.tonguePhase === S.TonguePhase.Glide) ride.push([motion.x, motion.y, motion.z]);
    if (was === S.TonguePhase.Glide && motion.tonguePhase === S.TonguePhase.None) {
      arrived = { x: motion.x, y: motion.y, z: motion.z, grounded: motion.grounded };
      break;
    }
    if (step > 1 && motion.tonguePhase === S.TonguePhase.None && !frozen) break;
  }
  const fall = [];
  for (let i = 0; i < Math.round(after * 60); i += 1) {
    const held = air();
    S.stepPlayer(motion, { moveX: held.moveX, moveZ: held.moveZ, tongue: false, cameraYaw: yaw }, { length }, DT, collision, events);
    fall.push(motion.y);
    if (motion.grounded && i > 5) break;
  }
  return { motion, frozen, ride, tips, arrived, fall };
};

/** The frozen path as the renderer and the rider see it. */
const laidOf = (f) => S.layTonguePath(f, 0, true, S.createLaidTonguePath());
const pairs = (f) => {
  const out = [];
  for (let i = 0; i < f.tongueHeadings.length; i += 2) out.push([f.tongueHeadings[i], f.tongueHeadings[i + 1]]);
  return out;
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

/**
 * WAYS TO FLY A THROW, as a player steers: hold one key (W climb, S dive, or
 * nothing) for the first k segments and another for the rest, for EVERY k -
 * the continuous control a player has, sampled at every segment. Optionally
 * curving A/D the whole way, and optionally holding forward through the drop
 * afterwards (which does nothing: the drop is straight down).
 */
const flightPlans = (length, withCurves = false) => {
  const { count } = S.tongueSegmentsFor(length);
  const plans = [];
  const combos = [[0, 0], [-1, 0], [1, 0], [1, -1], [-1, 1], [0, 1], [0, -1], [-0.5, 0], [0.5, 0]];
  const sides = withCurves ? [0, 1, -1, 0.4, -0.4] : [0];
  for (const air of withCurves ? [0, 1] : [0]) {
    for (const side of sides) {
      for (const [first, second] of combos) {
        for (let k = first === second ? count : 1; k <= count; k += 1) {
          plans.push({
            label: `${first} for ${k} segs then ${second}${side ? ` side ${side}` : ''}${air ? ' +air' : ''}`,
            fly: (seg) => ({ moveX: side, moveZ: seg < k ? first : second }),
            air: () => ({ moveX: 0, moveZ: air }),
          });
        }
      }
    }
  }
  return plans;
};

/** Aim at the island's centre from the standing edge. */
const standAndAimCentre = (from, to) => {
  const { sx, sz } = standAndAim(from, to);
  return { sx, sz, yaw: Math.atan2(to.x - sx, to.z - sz) };
};

/** Cross a stage throw by throw with DEFAULT throws only: aim, click, no keys. */
const crossStage = (stage, from, length) => {
  const route = [...stage.islands, stage.deck];
  let standing = from;
  let at = 0;
  let throws = 0;
  while (at < route.length && throws < route.length + 4) {
    const next = route[at];
    const { sx, sz, yaw } = standAndAim(standing, next);
    const r = flyThrow(sx, standing.topY, sz, yaw, length);
    throws += 1;
    if (!r.frozen) return { ok: false, why: 'the throw did not leave the mouth' };
    if (r.frozen.control !== S.TongueControl.Auto) return { ok: false, why: 'a default throw was steered' };
    if (laidOf(r.frozen).length > length + 1e-6) return { ok: false, why: 'a throw went past the Tongue Length' };
    const landed = route.findIndex((s, i) => i >= at && inside(r.motion, s));
    if (landed < 0) return { ok: false, why: `the default throw missed ${at < stage.islands.length ? `island ${at + 1}` : 'the deck'} (y ${r.motion.y.toFixed(1)}, z ${r.motion.z.toFixed(1)})` };
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
let gatesHeld = 0;
let gatesTotal = 0;
for (const stage of S.STAGES) {
  const level = Math.max(1, stage.recommendedLevel);
  const length = S.tongueLengthFor(level);
  const result = crossStage(stage, from, length);
  check(result.ok, `stage ${String(stage.index).padStart(2)} ${stage.name.padEnd(16)} (${stage.pattern}) crossed at Level ${level} / ${length} studs${result.ok ? ` with ${result.throws} default throws, no keys` : `: ${result.why}`}`);

  if (stage.gate >= 0) {
    gatesTotal += 1;
    const short = S.tongueLengthFor(Math.max(1, level - 3));
    const gateFrom = stage.gate === 0 ? from : stage.islands[stage.gate - 1];
    const gateTo = stage.islands[stage.gate];
    const aims = [standAndAimCentre(gateFrom, gateTo), standAndAim(gateFrom, gateTo)];
    let reached = null;
    for (const { sx, sz, yaw } of aims) {
      reached ??= flightPlans(short, true).find((plan) => {
        const r = flyThrow(sx, gateFrom.topY, sz, yaw, short, plan.fly, plan.air, 2);
        return [...stage.islands.slice(stage.gate), stage.deck].some((s) => inside(r.motion, s));
      });
    }
    if (reached) fail(`stage ${stage.index}: the gate island was reached with only ${short} studs (${reached.label})`);
    else gatesHeld += 1;
  }
  from = stage.deck;
}
check(gatesHeld === gatesTotal, `${gatesHeld} of ${gatesTotal} gates hold three levels short: neither the default throw nor any way of steering it (every key, taken over at every segment, curved or not, both aims) reaches the gate island`);
{
  // A longer tongue than a stage asks for: the default throw still lands somewhere safe - never short onto a lip.
  for (const extra of [5, 20]) {
    let burned = 0;
    let throwsMade = 0;
    let fromSurface = startSurface;
    for (const stage of S.STAGES) {
      const L = S.tongueLengthFor(Math.max(1, stage.recommendedLevel) + extra);
      const route = [...stage.islands, stage.deck];
      let standing = fromSurface;
      for (const next of route) {
        const { sx, sz, yaw } = standAndAim(standing, next);
        const r = flyThrow(sx, standing.topY, sz, yaw, L);
        throwsMade += 1;
        if (!r.motion.grounded || collision.hasFallen(r.motion.x, r.motion.y, r.motion.z)) burned += 1;
        standing = next;
      }
      fromSurface = stage.deck;
    }
    check(burned === 0, `${extra} levels over every stage's recommendation, all ${throwsMade} default throws land on solid ground (${burned} burned)`);
  }
}

console.log('\nThe default throw (nothing steered)');
const isl1 = S.STAGES[0].islands[0];
const aim1 = standAndAim(startSurface, isl1);
const L1 = S.tongueLengthFor(1);
{
  const r = flyThrow(aim1.sx, startSurface.topY, aim1.sz, aim1.yaw, L1);
  const f = r.frozen;
  const ps = pairs(f);
  const pitches = ps.map(([, p]) => p);
  check(f && f.control === S.TongueControl.Auto && inside(r.motion, isl1), 'click with no keys: the tongue finds the island ahead and the rider lands on it');
  check(f.tonguePitch0 > 0.3 && pitches[pitches.length - 1] < -0.2, `it is a curved arc, not a straight line: it leaves climbing ${(f.tonguePitch0 * 180 / Math.PI).toFixed(0)} degrees and comes down onto the island at ${(-pitches[pitches.length - 1] * 180 / Math.PI).toFixed(0)} degrees`);
  check(pitches.every((p, i) => i === 0 || p <= pitches[i - 1] + 1e-9), 'the arc bends smoothly downward all the way, like the original throw');
  check(f.hit && Math.abs(f.ey - isl1.topY) < 1e-6 && laidOf(f).length <= L1 + 1e-9, `it attaches to the island's top, within the Tongue Length (${laidOf(f).length.toFixed(1)} of ${L1} studs)`);
}
{
  // Walking up to the edge with W held and clicking: still the default throw.
  const r = flyThrow(aim1.sx, startSurface.topY, aim1.sz, aim1.yaw, L1, () => ({ moveX: 0, moveZ: 1 }), NONE, 3, { moveX: 0, moveZ: 1 });
  check(r.frozen && r.frozen.control === S.TongueControl.AutoHeld && inside(r.motion, isl1), 'walking up with W held and clicking still throws the default arc: keys held at the press do not steer');
}
{
  // Nothing reachable ahead (sideways over the lava): the natural arc to its full length, then a drop.
  const island = S.STAGES[1].islands[3];
  const side = island.x > 0 ? Math.PI / 2 : -Math.PI / 2;
  const L = S.tongueLengthFor(3);
  const r = flyThrow(island.x, island.topY, island.z, side, L);
  const f = r.frozen;
  check(f && !f.hit && Math.abs(laidOf(f).length - L) < 1e-6 && collision.hasFallen(r.motion.x, r.motion.y, r.motion.z), `with nothing in reach the default arc runs its full ${L} studs, ends in the air, and the rider drops into the lava`);
}
{
  // An island beyond the Tongue Length is never the default target.
  const stage = S.STAGES[4];
  const from1 = stage.islands[stage.gate - 1];
  const to = stage.islands[stage.gate];
  const short = S.tongueLengthFor(stage.recommendedLevel - 3);
  const { sx, sz, yaw } = standAndAim(from1, to);
  const r = flyThrow(sx, from1.topY, sz, yaw, short);
  check(!inside(r.motion, to) && laidOf(r.frozen).length <= short + 1e-6, `an island beyond the tongue is not targeted: the default throw with ${short} studs does not reach it`);
}

console.log('\nSteering the tongue in 3D');
// Over the start platform's open slab, facing down the river.
const open = { x: 0, y: S.START_PLATFORM.topY, z: S.START_PLATFORM.minZ + 1 };
const turnLimit = (f) => S.TONGUE.turnPerUnit * f.tongueSeg + 1e-9;
const noCorners = (f) =>
  pairs(f).every(([h, p], i) => {
    const [h0, p0] = i === 0 ? [f.tongueYaw0, f.tonguePitch0] : pairs(f)[i - 1];
    return Math.abs(h - h0) <= turnLimit(f) && Math.abs(p - p0) <= turnLimit(f);
  });
const W = () => ({ moveX: 0, moveZ: 1 });
const Sk = () => ({ moveX: 0, moveZ: -1 });
{
  const L = 24;
  const auto = flyThrow(open.x, open.y, open.z, 0, L).frozen;
  const up = flyThrow(open.x, open.y, open.z, 0, L, W).frozen;
  const down = flyThrow(open.x, open.y + 30, open.z, 0, L, Sk).frozen;
  const level = flyThrow(open.x, open.y + 30, open.z, 0, L, (seg) => (seg < 1 ? { moveX: 0, moveZ: 0.5 } : NONE())).frozen;
  check(up.control === S.TongueControl.Player && down.control === S.TongueControl.Player, 'pressing a movement key while it deploys hands the tip to the player');
  check(up.ey > auto.ey + 5 && !up.hit, `W climbs: the steered tip ends ${(up.ey - open.y).toFixed(1)} up, in the air - it is not forced back to the ground`);
  check(down.ey < level.ey - 3, `S dives: the tip ends ${(level.ey - down.ey).toFixed(1)} lower than a tip let go of`);
  check(pairs(up).every(([, p]) => p <= S.TONGUE.maxPitch + 1e-12) && pairs(down).every(([, p]) => p >= -S.TONGUE.maxPitch - 1e-12), 'climbs and dives never pass the steepest pitch');

  const slightLeft = flyThrow(open.x, open.y, open.z, 0, L, () => ({ moveX: -0.35, moveZ: 0 })).frozen;
  const strongLeft = flyThrow(open.x, open.y, open.z, 0, L, () => ({ moveX: -1, moveZ: 0 })).frozen;
  const slightRight = flyThrow(open.x, open.y, open.z, 0, L, () => ({ moveX: 0.35, moveZ: 0 })).frozen;
  const strongRight = flyThrow(open.x, open.y, open.z, 0, L, () => ({ moveX: 1, moveZ: 0 })).frozen;
  // Camera facing +Z: its left (A) is +X, its right (D) is -X.
  check(slightLeft.ex > 0.2 && strongLeft.ex > slightLeft.ex + 0.2, `A curves the tongue left, harder when held fully (${slightLeft.ex.toFixed(2)} then ${strongLeft.ex.toFixed(2)})`);
  check(slightRight.ex < -0.2 && strongRight.ex < slightRight.ex - 0.2, `D curves it right, harder when held fully (${slightRight.ex.toFixed(2)} then ${strongRight.ex.toFixed(2)})`);
  const diag = flyThrow(open.x, open.y, open.z, 0, L, () => ({ moveX: -1, moveZ: 1 })).frozen;
  check(diag.ex > 0.5 && diag.ey > up.ey - 20 && diag.ey > open.y + 5, 'W+A together fly a rising curve to the left: diagonal in 3D');
  check([up, down, strongLeft, strongRight, diag].every(noCorners), `no corners while steering: each segment turns and pitches at most ${(S.TONGUE.turnPerUnit * auto.tongueSeg * 180 / Math.PI).toFixed(1)} degrees`);
  check([up, slightLeft, strongLeft, slightRight, strongRight, diag].filter((fr) => !fr.hit).every((fr) => Math.abs(laidOf(fr).length - L) < 1e-6), 'every steered path that meets nothing is exactly the Tongue Length');
}
{
  // Take over part-way: the path so far is the default arc; from the key press it is the player's.
  const L = 36;
  const stage = S.STAGES[0];
  const aim = standAndAim(stage.islands[0], stage.islands[1]);
  const auto = flyThrow(aim.sx, stage.islands[0].topY, aim.sz, aim.yaw, L).frozen;
  const late = flyThrow(aim.sx, stage.islands[0].topY, aim.sz, aim.yaw, L, (seg) => (seg < 5 ? NONE() : W())).frozen;
  const a = pairs(auto);
  const b = pairs(late);
  const same = b.slice(0, 5).every(([h, p], i) => h === a[i][0] && p === a[i][1]);
  const diverged = b.findIndex(([h, p], i) => !a[i] || h !== a[i][0] || p !== a[i][1]);
  check(late.control === S.TongueControl.Player && same && diverged >= 5 && late.ey > auto.ey + 5, `taking over mid-flight: the default arc up to the key press (${diverged} segments), then the player climbs away from it`);
}
{
  // Letting go after steering: the player keeps the tongue - it flies straight on, not back to the ground.
  const L = 36;
  const r = flyThrow(0, S.STAGES[0].deck.topY + 20, S.STAGES[0].deck.z + 11, 0, L, (seg) => (seg < 5 ? { moveX: -1, moveZ: 1 } : NONE()));
  const ps = pairs(r.frozen);
  const lastBend = ps.reduce((last, [h, p], i) => (i > 0 && (h !== ps[i - 1][0] || p !== ps[i - 1][1]) ? i : last), 0);
  check(r.frozen.control === S.TongueControl.Player && lastBend > 0 && lastBend < ps.length - 3 && ps.slice(lastBend).every(([h, p]) => h === ps[lastBend][0] && p === ps[lastBend][1]), `letting go keeps it the player's: segments ${lastBend + 1}..${ps.length} fly straight on, not pulled down to the ground`);
}
{
  // The tongue is never pinned to the ground while steered: the tip climbs far above anything below.
  const L = 60;
  const r = flyThrow(open.x, open.y, open.z, 0, L, W);
  const highest = Math.max(...r.tips.map((t) => t[1]));
  check(highest > open.y + 30, `holding W, the tip climbs to ${highest.toFixed(1)} while deploying`);
}
{
  // High above the lava: the tip freezes where the length runs out; the rider ends there EXACTLY, then falls.
  const island = S.STAGES[1].islands[3];
  const L = S.tongueLengthFor(10);
  const side = island.x > 0 ? Math.PI / 2 : -Math.PI / 2;
  const r = flyThrow(island.x, island.topY, island.z, side, L, (seg) => (seg < 6 ? W() : { moveX: 0.1, moveZ: 0 }));
  const f = r.frozen;
  const laid = laidOf(f);
  const aboveLava = f.ey - S.RIVER.lavaY;
  check(!f.hit && Math.abs(laid.length - L) < 1e-6, `steered over the lava: the tongue stops at exactly ${laid.length.toFixed(1)} studs (Tongue Length ${L})`);
  check(aboveLava > 20, `the tip freezes in mid-air, ${aboveLava.toFixed(1)} above the lava - not dropped to the nearest ground`);
  check(r.arrived && Math.hypot(r.arrived.x - f.ex, r.arrived.y - f.ey, r.arrived.z - f.ez) < 1e-9 && !r.arrived.grounded, 'the rider arrives exactly at that mid-air endpoint, not grounded');
  check(r.fall.length > 10 && r.fall[10] < f.ey && collision.hasFallen(r.motion.x, r.motion.y, r.motion.z), 'and only then falls straight down, into the lava');
}
{
  // The rider follows the EXACT frozen 3D curve, vertical included - steered or not.
  const check3d = (r) => {
    const laid = laidOf(r.frozen);
    const p = { x: 0, y: 0, z: 0 };
    return r.ride.length > 10 && r.ride.every(([x, y, z]) => {
      let best = Infinity;
      for (let a = 0; a <= laid.length; a += laid.length / 3000) {
        S.sampleTonguePath(laid, a, p);
        best = Math.min(best, Math.hypot(p.x - x, p.y - y, p.z - z));
      }
      return best < 0.05;
    });
  };
  const steered = flyThrow(open.x, open.y, open.z, 0, 40, (seg) => ({ moveX: -0.5, moveZ: seg < 3 ? 1 : -1 }));
  const auto = flyThrow(aim1.sx, startSurface.topY, aim1.sz, aim1.yaw, L1);
  const ys = steered.ride.map((q) => q[1]);
  check(check3d(steered) && check3d(auto), 'the ride follows exactly the curve that was laid, default or steered');
  check(Math.max(...ys) > ys[0] + 3 && ys[ys.length - 1] < Math.max(...ys) - 1, 'the ride rises and drops with the curve');
}
{
  // Running into things while steering: a tip meeting an island's side just under the lip lands on top; lower, it does not.
  const to = S.STAGES[0].islands[0];
  const { sx, sz, yaw } = standAndAim(startSurface, to);
  let mantled = null;
  let tooLow = null;
  for (const plan of [1, 2, 3].flatMap((level) => Array.from({ length: 50 }, (_, i) => ({ level, dive: (i + 1) / 50 })))) {
    if (mantled !== null && tooLow !== null) break;
    const { level, dive } = plan;
    const r = flyThrow(sx, startSurface.topY, sz, yaw, S.tongueLengthFor(level), () => ({ moveX: 0, moveZ: -dive }));
    if (!r.frozen || r.frozen.control !== S.TongueControl.Player) continue;
    // Where the flown path crossed the island's near face (the path as laid, before the freeze pinned its end).
    const laid = S.layTonguePath(r.frozen, S.TONGUE.maxLength, false, S.createLaidTonguePath());
    const face = to.z - to.depth / 2;
    let hitY = null;
    for (let i = 1; i < laid.count && hitY === null; i += 1) {
      const z0 = laid.zs[i - 1];
      const z1 = laid.zs[i];
      if (z0 < face && z1 >= face) hitY = laid.ys[i - 1] + ((face - z0) / (z1 - z0)) * (laid.ys[i] - laid.ys[i - 1]);
    }
    if (hitY === null || hitY >= to.topY) continue;
    const below = to.topY - hitY;
    if (below <= S.MOVEMENT.stepHeight && inside(r.motion, to)) mantled ??= below;
    if (below > S.MOVEMENT.stepHeight + 0.2 && !inside(r.motion, to) && collision.hasFallen(r.motion.x, r.motion.y, r.motion.z)) tooLow ??= below;
  }
  check(mantled !== null, `a steered tip meeting an island's side just below its lip (${mantled?.toFixed(2)} below, step height ${S.MOVEMENT.stepHeight}) lands on top of it`);
  check(tooLow !== null, `one meeting the side well below the lip (${tooLow?.toFixed(2)} below) is not lifted onto it: the rider falls`);
  const island = S.STAGES[1].islands[3];
  const side = island.x > 0 ? Math.PI / 2 : -Math.PI / 2;
  const dive = flyThrow(island.x, island.topY, island.z, side, S.tongueLengthFor(10), Sk);
  check(dive.frozen && Math.abs(dive.frozen.ey - S.RIVER.lavaY) < 1e-6 && collision.hasFallen(dive.motion.x, dive.motion.y, dive.motion.z), 'a steered dive into the lava stops at the lava and burns');
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
