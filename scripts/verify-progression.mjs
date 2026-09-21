/**
 * The progression rules, exercised in-process against the server's own
 * services.
 *
 * Every figure the specification pins down is asserted EXACTLY: Level 1 with
 * 12/17, the thirteen tongues in stage order with Blueberry first at 1 Win and
 * +2, the five trails, the treadmills' rebirth gates and multipliers, and the
 * rebirth ladder. Then the services are driven through what a client can reach
 * - including every refusal - so "the server decides" is proven, not claimed.
 *
 * Run after `npm run build:server`.
 */
import * as S from '../shared/dist/index.js';
import { PlayerState } from '../server/dist/rooms/state/PlayerState.js';
import { TongueService } from '../server/dist/progression/TongueService.js';
import { TongueShopService } from '../server/dist/progression/TongueShopService.js';
import { TrailService } from '../server/dist/progression/TrailService.js';
import { RebirthService } from '../server/dist/progression/RebirthService.js';
import { StageService } from '../server/dist/progression/StageService.js';

let failures = 0;
const fail = (message) => {
  failures += 1;
  console.log(`  FAIL  ${message}`);
};
const pass = (message) => console.log(`  ok    ${message}`);
const check = (condition, message) => (condition ? pass(message) : fail(message));
const near = (a, b) => Math.abs(a - b) < 1e-9;

let clockOffset = 0;
const realNow = Date.now;
Date.now = () => realNow() + clockOffset;
const later = () => {
  clockOffset += 1000;
};

const fresh = (id = 'p1') => {
  const player = new PlayerState();
  player.sessionId = id;
  return player;
};

console.log('\nStarting values');
{
  const player = fresh();
  const tongues = new TongueService();
  tongues.initialise(player);
  const progress = S.resolveLevel(player.xp);
  check(player.xp === 0 && player.tongueLength === 12, 'a new player holds 0 XP and a Tongue Length (Total Tongue) of 12');
  check(progress.level === 1 && progress.into === 0 && progress.required === 17, `Level 1 with 0/17 XP (got ${progress.into}/${progress.required})`);
  check(player.tongueSlot === 0 && player.ownedTongues === 0, 'the default tongue is worn and nothing is owned');
  check(player.tonguePerStep === 1, 'the default tongue earns +1 per step');
}

console.log('\nXP and Tongue Length are separate');
{
  const player = fresh('px');
  const tongues = new TongueService();
  tongues.initialise(player);
  tongues.credit('px', player, 1 / 60, 0, true);
  const lengths = [];
  // Walk step by step through two level-ups, recording the length after every step.
  while (player.level < 3) {
    tongues.credit('px', player, 0.1, S.TONGUE_STEP.strideDistance / 2, true);
    lengths.push([player.level, player.tongueLength, player.xp]);
  }
  const byLevel = new Map();
  for (const [level, length] of lengths) (byLevel.get(level) ?? byLevel.set(level, new Set()).get(level)).add(length);
  check([...byLevel.values()].every((set) => set.size === 1), 'while XP rises inside a level, Tongue Length never moves');
  check(byLevel.get(1)?.has(12) && byLevel.get(2)?.has(15) && byLevel.get(3)?.has(18), 'Tongue Length is 12, then 15 on reaching Level 2, then 18 on Level 3');
  check(player.xp !== player.tongueLength, 'the XP figure is not the Tongue figure');
}

console.log('\nThe thirteen tongues');
{
  const names = [
    'Blueberry', 'Gummy', 'Slime', 'Emerald', 'Ruby', 'Crystal', 'Lava', 'Fire',
    'Lightning', 'Golden', 'Galaxy', 'Void', 'Futuristic',
  ].map((n) => `${n} Tongue`);
  check(S.TONGUE_TIERS.length === 13, 'thirteen purchasable tongues');
  check(S.TONGUE_TIERS.every((tier, i) => tier.name === names[i] && tier.slot === i + 1), 'in stage order, none missing');
  const blueberry = S.tongueForSlot(1);
  check(blueberry.cost === 1 && blueberry.perStep === 2, 'Blueberry costs 1 Win and gives +2 per step');
  check(S.DEFAULT_TONGUE.name !== 'Blueberry Tongue' && S.DEFAULT_TONGUE.slot === 0, 'Blueberry is not the default tongue');
  check(S.TONGUE_TIERS.every((tier, i) => i === 0 || (tier.cost > S.TONGUE_TIERS[i - 1].cost && tier.perStep > S.TONGUE_TIERS[i - 1].perStep)), 'every tongue costs and earns more than the last');
  check(S.TONGUE_TIERS.every((tier, i) => i === 0 || tier.glow >= S.TONGUE_TIERS[i - 1].glow), 'higher tongues glow at least as much');
  check(S.TONGUE_TIERS.filter((t) => t.tier === 0).length === 5 && S.TONGUE_TIERS.filter((t) => t.tier === 1).length === 8, 'five on the lower tier, eight on the upper');
}

console.log('\nTrails');
{
  const expected = [
    ['Orange Trail', 25, 1.25],
    ['Blue Trail', 50, 1.5],
    ['Green Trail', 75, 1.75],
    ['Purple Trail', 100, 2],
    ['Rainbow Trail', 125, 2.5],
  ];
  check(S.TRAIL_TIERS.length === 5, 'five trails');
  check(S.TRAIL_TIERS.every((t, i) => t.name === expected[i][0] && t.winsRequired === expected[i][1] && t.multiplier === expected[i][2]), 'names, wins and multipliers exactly as specified');
  check(S.trailMultiplier(3, 0) === 1, 'an unowned trail multiplies by 1');
}

console.log('\nRebirth ladder');
check(S.rebirthMultiplier(0) === 1 && S.rebirthMultiplier(1) === 1.5 && S.rebirthMultiplier(2) === 2, 'x1.00 -> x1.50 -> x2.00');
check(S.rebirthRequiredLevel(0) === 10 && S.rebirthRequiredLevel(1) === 20, 'first rebirth at Level 10, then Level 20');

console.log('\nTongue per step (TongueService)');
{
  const player = fresh();
  const tongues = new TongueService();
  tongues.initialise(player);
  tongues.credit('p1', player, 1 / 60, 0, true); // the fresh step pays nothing
  const walk = (steps) => {
    for (let i = 0; i < steps * 2; i += 1) tongues.credit('p1', player, 0.1, S.TONGUE_STEP.strideDistance / 2, true);
  };
  const before = player.xp;
  walk(10);
  check(player.xp - before === 10, `ten strides pay +10 with the default tongue (got ${player.xp - before})`);
  check(player.lifetimeXp === player.xp, 'lifetime XP grows with it');

  const b2 = player.xp;
  tongues.credit('p1', player, 0.2, S.TONGUE_STEP.strideDistance, false);
  check(player.xp === b2, 'a step in the air (a tongue ride) pays nothing');
  tongues.credit('p1', player, 0.016, 400, true);
  check(player.xp === b2, 'a teleport pays nothing');

  player.ownedTongues = S.tongueBit(1);
  player.tongueSlot = 1;
  player.ownedTrails = S.trailMask(1);
  player.trailSlot = 1;
  player.rebirths = 1;
  tongues.syncDerived(player);
  check(near(player.tonguePerStep, 2 * 1.5 * 1.25), `Blueberry x rebirth 1.5 x Orange 1.25 = ${player.tonguePerStep}`);

  // Treadmills: the gate is the server's.
  const t0 = player.xp;
  player.treadmill = 2;
  const locked = tongues.credit('p1', player, 0.25, 0, true);
  check(player.xp === t0 && locked.lockedTreadmill === 2, 'x2 treadmill pays NOTHING with 1 rebirth');
  player.rebirths = 3;
  tongues.syncDerived(player);
  const rate = player.tonguePerStep;
  const t1 = player.xp;
  for (let i = 0; i < 20; i += 1) tongues.credit('p1', player, 0.1, 0, true);
  const paidSteps = Math.floor((S.TREADMILLS.beltSpeed * 2) / S.TONGUE_STEP.strideDistance + 1e-9);
  check(near(player.xp - t1, paidSteps * rate * 2), `x2 treadmill pays double with 3 rebirths (${player.xp - t1})`);
  player.treadmill = 3;
  const l3 = tongues.credit('p1', player, 0.1, 0, true);
  check(l3.lockedTreadmill === 3, 'x3 treadmill still locked at 3 rebirths');
  player.rebirths = 5;
  tongues.syncDerived(player);
  const t3 = player.xp;
  for (let i = 0; i < 20; i += 1) tongues.credit('p1', player, 0.1, 0, true);
  check(near(player.xp - t3, paidSteps * player.tonguePerStep * 3), 'x3 treadmill pays triple with 5 rebirths');
}

console.log('\nThe tongue stage (TongueShopService)');
{
  const player = fresh('p2');
  const tongues = new TongueService();
  const shop = new TongueShopService();
  tongues.initialise(player);
  shop.initialise(player);
  const pad = S.TONGUE_PADS.find((p) => p.slot === 1);
  const r1 = shop.pad(player, 1, tongues);
  check(!r1.ok && r1.reason === 'not-on-pad', 'buying from across the hub is refused');
  player.x = pad.x;
  player.y = pad.topY;
  player.z = pad.z;
  later();
  const r2 = shop.pad(player, 1, tongues);
  check(!r2.ok && r2.reason === 'too-few-wins' && player.ownedTongues === 0, 'no Wins, no tongue');
  player.wins = 1;
  later();
  const r3 = shop.pad(player, 1, tongues);
  check(r3.ok && r3.action === 'bought' && player.wins === 0 && player.tongueSlot === 1, 'with 1 Win: bought, paid, and worn');
  check(player.tonguePerStep === 2, 'and each step is now worth +2');
  later();
  const r4 = shop.pad(player, 1, tongues);
  check(!r4.ok && r4.reason === 'already-worn', 'standing on it again does nothing');
  check(!shop.pad(player, 99, tongues).ok && !shop.pad(player, '1', tongues).ok && !shop.pad(player, 0, tongues).ok, 'forged slots are refused');
  // Buy Gummy, then walk back to Blueberry to re-equip it.
  const gummy = S.TONGUE_PADS.find((p) => p.slot === 2);
  player.wins = 5;
  player.x = gummy.x;
  player.z = gummy.z;
  later();
  check(shop.pad(player, 2, tongues).ok && player.tongueSlot === 2 && player.wins === 0, 'Gummy bought for 5');
  player.x = pad.x;
  player.z = pad.z;
  later();
  const r5 = shop.pad(player, 1, tongues);
  check(r5.ok && r5.action === 'equipped' && player.tongueSlot === 1 && player.wins === 0, 'an owned tongue is re-equipped for free');
  player.tongueSlot = 7;
  shop.sanitise(player);
  check(player.tongueSlot === 0, 'a worn tongue that is not owned falls back to the default');
}

console.log('\nTrails (TrailService)');
{
  const player = fresh('p3');
  const tongues = new TongueService();
  const trails = new TrailService();
  tongues.initialise(player);
  trails.initialise(player);
  player.wins = 24;
  check(!trails.unlock(player, 1, tongues).ok && player.wins === 24, 'Orange with 24 Wins is refused');
  player.wins = 25;
  later();
  check(trails.unlock(player, 1, tongues).ok && player.wins === 0 && player.trailSlot === 1, 'Orange bought for 25, worn');
  check(near(player.tonguePerStep, 1.25), 'and multiplies Tongue by 1.25');
  check(!trails.equip(player, 2, tongues).ok, 'an unowned trail cannot be worn');
  check(trails.equip(player, 0, tongues).ok && player.tonguePerStep === 1, 'taking it off removes the bonus');
}

console.log('\nRebirth (RebirthService)');
{
  const player = fresh('p4');
  const tongues = new TongueService();
  const rebirths = new RebirthService();
  tongues.initialise(player);
  check(!rebirths.rebirth(player, tongues).ok, 'refused below Level 10');
  player.xp = S.totalXpToReach(10);
  player.wins = 7;
  player.ownedTongues = S.tongueBit(1);
  tongues.syncDerived(player);
  check(player.level === 10, 'at Level 10');
  const result = rebirths.rebirth(player, tongues);
  check(result.ok && player.rebirths === 1 && result.multiplier === 1.5, 'rebirth 1: x1.50');
  check(player.level === 1 && player.xp === 0 && player.tongueLength === 12, 'levels reset to Level 1: 0 XP, Tongue Length 12');
  check(player.wins === 7 && player.ownedTongues === S.tongueBit(1), 'Wins and tongues are kept');
  check(!rebirths.rebirth(player, tongues).ok, 'the next rebirth needs Level 20');
}

console.log('\nStage wins (StageService)');
{
  const player = fresh('p5');
  const stages = new StageService();
  stages.initialise('p5');
  check(!stages.claim('p5', player, 1).granted, 'a claim from the spawn is refused');
  const pad = S.STAGES[0].pad;
  player.x = pad.x;
  player.y = pad.topY;
  player.z = pad.z;
  later();
  const award = stages.claim('p5', player, 1);
  check(award.granted && player.wins === 1, 'standing on the Stage 1 pad pays +1 Win');
  check(!stages.claim('p5', player, 2).granted, 'claiming Stage 2 from Stage 1\'s pad is refused');
}

if (failures > 0) {
  console.log(`\n${failures} progression check(s) failed.`);
  process.exit(1);
}
console.log('\nprogression OK');
