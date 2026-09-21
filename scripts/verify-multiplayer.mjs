/**
 * Two real clients against a running server: one walks to the river and
 * throws its tongue across to the first island, steering it, the other WATCHES
 * - and must see the whole throw replicated (windup, extend, glide, the
 * take-over, the exact path) and the thrower land where the server says. Then
 * a default throw (no keys) must stay automatic and attach to island 2. Then the forgeries: a client that claims a win pad it
 * is nowhere near, or a tongue it cannot afford, is refused.
 *
 * Needs a running server (`npm run dev`), default ws://localhost:2586.
 */
import { Client } from 'colyseus.js';
import * as S from '../shared/dist/index.js';

const ENDPOINT = process.env.ENDPOINT ?? 'ws://localhost:2586';
let failures = 0;
const fail = (message) => {
  failures += 1;
  console.log(`  FAIL  ${message}`);
};
const pass = (message) => console.log(`  ok    ${message}`);
const check = (condition, message) => (condition ? pass(message) : fail(message));
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const join = async (id) => {
  const client = new Client(ENDPOINT);
  const room = await client.joinOrCreate(S.ROOM_NAME, { playerId: id });
  for (const type of ['respawn', 'authState', 'stageAwarded', 'notice']) room.onMessage(type, () => {});
  return room;
};

const stamp = Date.now().toString(36);
const thrower = await join(`mp-thrower-${stamp}`);
const watcher = await join(`mp-watcher-${stamp}`);
await sleep(500);
check(thrower.roomId === watcher.roomId, 'both clients share a room');

const self = () => thrower.state.players.get(thrower.sessionId);
const seen = () => watcher.state.players.get(thrower.sessionId);

let seq = 0;
/** Send real-time input at 60 Hz for `seconds`. */
const drive = async (input, seconds) => {
  const frames = Math.round(seconds * 60);
  for (let i = 0; i < frames; i += 1) {
    seq += 1;
    thrower.send(S.MessageType.Move, { seq, dt: 1 / 60, moveX: 0, moveZ: 0, tongue: false, cameraYaw: 0, ...input });
    if (i % 4 === 3) await sleep(66);
  }
};

// Walk from the spawn to the front of the start platform.
await drive({ moveZ: 1 }, 4);
for (let i = 0; i < 40 && self().z < S.START_PLATFORM.maxZ - 3; i += 1) await drive({ moveZ: 0.5 }, 0.1);
await drive({}, 0.5);
await sleep(300);
const before = { ...self().toJSON() };
check(before.z > S.START_PLATFORM.minZ && Math.abs(before.y - S.START_PLATFORM.topY) < 0.01, `the thrower reached the start platform (z ${before.z.toFixed(1)})`);

// Watch every phase the watcher sees.
const phases = new Set();
const controls = new Set();
const watch = setInterval(() => {
  const p = seen();
  if (p) {
    phases.add(p.tonguePhase);
    if (p.tonguePhase === S.TonguePhase.Extend) controls.add(p.tongueControl);
  }
}, 10);

const countBefore = seen().tongueCount;
await drive({ tongue: true }, 1 / 60);
// Steer slightly with A while it deploys: the watcher must receive the same bent path.
await drive({ moveX: -0.3 }, 0.9);
const thrownPath = [...self().tonguePath];
const watchedPath = [...seen().tonguePath];
await drive({}, 2.5);
await sleep(400);
clearInterval(watch);

const after = self();
const island = S.STAGES[0].islands[0];
check(seen().tongueCount === countBefore + 1, 'the watcher saw one new throw');
check(phases.has(S.TonguePhase.Windup) && phases.has(S.TonguePhase.Extend) && phases.has(S.TonguePhase.Glide), `the watcher saw windup, extend and glide (${[...phases].sort().join(',')})`);
check(controls.has(S.TongueControl.Player), 'the watcher saw the key press hand the tongue to the player');
check(thrownPath.length > 2 && JSON.stringify(thrownPath) === JSON.stringify(watchedPath), `the watcher received the same steered path (${watchedPath.length / 2} segments)`);
const headings = thrownPath.filter((_, i) => i % 2 === 0);
check(new Set(headings.slice(-3).map((h) => h.toFixed(4))).size > 1, 'and it is bent by the steering, not straight');
check(Math.abs(after.y - island.topY) < 0.01 && Math.abs(after.z - island.z) < island.depth / 2, `the thrower landed on island 1 (y ${after.y.toFixed(2)}, z ${after.z.toFixed(1)})`);
check(Math.abs(seen().z - after.z) < 0.01, 'the watcher agrees on where they landed');
check(after.deathCount === before.deathCount, 'nobody burned');

// A DEFAULT throw (no keys) from the far edge of island 1: the curved arc attaches to island 2.
{
  const island2 = S.STAGES[0].islands[1];
  for (let i = 0; i < 60 && self().z < island.z + island.depth / 2 - 1.5; i += 1) await drive({ moveZ: 0.5 }, 0.1);
  await drive({}, 0.5);
  await sleep(300);
  controls.clear();
  const watch2 = setInterval(() => {
    const p = seen();
    if (p && p.tonguePhase === S.TonguePhase.Extend) controls.add(p.tongueControl);
  }, 10);
  const count = seen().tongueCount;
  await drive({ tongue: true }, 1 / 60);
  await drive({}, 3);
  await sleep(400);
  clearInterval(watch2);
  const landed = self();
  check(seen().tongueCount === count + 1 && [...controls].every((c) => c === S.TongueControl.Auto), 'a throw with no keys stays the default arc, as the watcher sees it');
  check(seen().tongueHit === true, 'the default throw attached to the ground');
  check(Math.abs(landed.y - island2.topY) < 0.01 && Math.abs(landed.z - island2.z) < island2.depth / 2 + 0.9, `and the thrower landed on island 2 (y ${landed.y.toFixed(2)}, z ${landed.z.toFixed(1)})`);
  check(Math.abs(seen().z - landed.z) < 0.01 && landed.deathCount === before.deathCount, 'the watcher agrees, and nobody burned');
}

// Forgeries.
const wins = after.wins;
thrower.send(S.MessageType.ClaimStage, { stageIndex: 1 });
thrower.send(S.MessageType.TonguePad, { slot: 13 });
thrower.send(S.MessageType.UnlockTrail, { slot: 5 });
thrower.send(S.MessageType.Rebirth, {});
await sleep(500);
const now = self();
check(now.wins === wins, 'a win pad claimed from the wrong place pays nothing');
check(now.ownedTongues === 0 && now.tongueSlot === 0, 'a tongue claimed from the wrong place is not granted');
check(now.ownedTrails === 0, 'an unaffordable trail is not granted');
check(now.rebirths === 0, 'a rebirth below Level 10 is refused');

await thrower.leave();
await watcher.leave();
if (failures > 0) {
  console.log(`\n${failures} multiplayer check(s) failed.`);
  process.exit(1);
}
console.log('\nmultiplayer OK');
process.exit(0);
