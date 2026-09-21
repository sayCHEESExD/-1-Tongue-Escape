/**
 * The course, checked by PLAYING it through the real shared simulation.
 *
 * All thirty stages are crossed with actual throws - `stepPlayer`, windup to
 * landing - at the Tongue Length of their recommended level. Each stage from
 * 2 on is then proven to ASK for that level: its gate throw, made with the
 * Tongue Length of three levels lower, runs out in the air and the rider burns.
 * The targeting rules are exercised directly, and the hub is walked.
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

console.log('\nTargeting');
{
  const stage = S.STAGES[0];
  const a = stage.islands[0];
  const b = stage.islands[1];
  const { sx, sz, yaw } = standAndAim(a, b);
  const length = S.tongueLengthFor(1);

  // Off by 15 degrees: the forward cone still finds the island, not the lava.
  const off = place(sx, a.topY, sz, yaw);
  const r1 = throwAt(off, yaw + (15 * Math.PI) / 180, length);
  check(r1.arc.hit && inside(off, b), 'aimed 15 degrees off, the tongue still takes the island ahead');

  // Facing sideways at the river wall: nothing is found by turning; the tongue runs out.
  const side = place(sx, a.topY, a.z, Math.PI / 2);
  const r2 = throwAt(side, Math.PI / 2, length);
  check(!r2.arc.hit, 'facing the wall, it does not turn to find an island');

  // Facing backward toward the start platform: that is behind the route but within the cone, and valid.
  const back = place(0, a.topY, a.z - a.depth / 2 + 0.9, Math.PI);
  const r3 = throwAt(back, Math.PI, length);
  check(r3.arc.hit && Math.abs(back.y - S.START_PLATFORM.topY) < 0.05, 'facing the start platform, it attaches there');

  // The island underfoot is never the target.
  const middle = place(a.x, a.topY, a.z - a.depth / 2 + 2, 0);
  const own = { x: 0, y: 0, z: 0, hit: false };
  collision.findTongueTarget(middle.x, middle.y, middle.z, 0, 8, own);
  check(!own.hit, 'a short throw along your own island does not stick to it');
}
{
  // Unreachable: find a deck edge where the island ahead is out of a 12-stud
  // tongue's reach. The tongue must stop at exactly 12, in the air, and the rider burn.
  const length = 12;
  let spot = null;
  const probe = { x: 0, y: 0, z: 0, hit: false };
  for (const stage of S.STAGES) {
    const deck = stage.deck;
    const z = deck.z + deck.depth / 2 - 0.9;
    if (collision.findTongueTarget(deck.x, deck.topY, z, 0, length, probe) && !probe.hit && S.isOverLava(probe.x, probe.z)) {
      spot = { x: deck.x, y: deck.topY, z };
      break;
    }
  }
  const motion = place(spot.x, spot.y, spot.z, 0);
  const { arc } = throwAt(motion, 0, length);
  const reached = Math.hypot(arc.ex - arc.sx, arc.ez - arc.sz);
  check(!arc.hit && Math.abs(reached - length) < 1e-6 && Math.abs(arc.ey - arc.sy) < 1e-6, `with no island in reach the tongue stops at exactly ${length} studs, in the air`);
  check(collision.hasFallen(motion.x, motion.y, motion.z), 'and the rider drops into the lava');
}
{
  // Nothing reachable over a platform: the rider drops onto the platform below the tongue's end.
  const motion = place(0, 0, -80, 0);
  const { arc } = throwAt(motion, 0, 12);
  check(!arc.hit && motion.grounded && Math.abs(motion.y) < 1e-6 && motion.z > -80 + 11, 'in the hub the tongue runs its length and the rider lands on the floor');
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
