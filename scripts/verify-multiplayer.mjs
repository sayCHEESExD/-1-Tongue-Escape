/**
 * Two real clients against a running server: one walks to the river and
 * throws its tongue across to the first island, the other WATCHES - and must
 * see the whole throw replicated (windup, extend, glide) and the thrower land
 * where the server says. Then the forgeries: a client that claims a win pad it
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
const watch = setInterval(() => {
  const p = seen();
  if (p) phases.add(p.tonguePhase);
}, 10);

const countBefore = seen().tongueCount;
await drive({ tongue: true }, 1 / 60);
await drive({}, 2.5);
await sleep(400);
clearInterval(watch);

const after = self();
const island = S.STAGES[0].islands[0];
check(seen().tongueCount === countBefore + 1, 'the watcher saw one new throw');
check(phases.has(S.TonguePhase.Windup) && phases.has(S.TonguePhase.Extend) && phases.has(S.TonguePhase.Glide), `the watcher saw windup, extend and glide (${[...phases].sort().join(',')})`);
check(seen().tongueHit === true, 'the throw attached to ground');
check(Math.abs(after.y - island.topY) < 0.01 && Math.abs(after.z - island.z) < island.depth / 2, `the thrower landed on island 1 (y ${after.y.toFixed(2)}, z ${after.z.toFixed(1)})`);
check(Math.abs(seen().z - after.z) < 0.01, 'the watcher agrees on where they landed');
check(after.deathCount === before.deathCount, 'nobody burned');

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
