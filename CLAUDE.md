# +1 Tongue Escape

Browser multiplayer tongue-swinging lava obby: Three.js client, Colyseus server, npm workspaces
(`shared` / `server` / `client`). Infrastructure (Bloxity auth, persistence, Bux grants, deploy)
follows `D:\+1 Godspeed Escape`; gameplay, world and UI are this game's own.

## Commands

```bash
npm run dev                 # builds shared, then server (tsx watch, :2586) + Vite client (:5186)
npm run build               # shared + server + client (client/dist)
npm run typecheck           # all workspaces
npm run verify              # verify:course + verify:progression + verify:assets
npm run verify:capacity     # needs a running server on :2586; 18 clients, expects 15-per-room routing
npm run verify:multiplayer  # needs a running server; one client throws, another watches it replicate
npm run verify:persistence  # identity/storage/migration/purchases, JSON and Mongo (if mongod is found)
npm run size:client         # client/dist size against the 12 MB budget
```

Do NOT use python from the Bash tool on this machine (Windows Store stub stalls). Use node/sed/perl.

## Non-negotiable rules

- Ports: server **2586**, Vite **5186**, preview 4186. Room `tongueescape`, Bloxity slug `tongue-escape`, 15 per room.
- **Client build must stay under 12 MB** (currently ~2.3 MB). World textures are canvas-drawn
  (`client/src/world/WorldTextures.ts`, `client/src/effects/tongueTextures.ts`). Only `assets/` ships as files;
  `scripts/verify-assets.mjs` pins their digests.
- **Two movement modes only: walking and the tongue. There is NO jump.** Click / Space / the TONGUE touch
  button all throw. The throw is part of the SHARED sim (`shared/src/sim/PlayerSim.ts`): windup -> EXTEND
  -> GLIDE, with TWO ways to fly the EXTEND (`motion.tongueControl`, `TongueControl`):
  - **Default (Auto)**: at the press `WorldCollision.findTongueTarget` picks the original target - the farthest
    landable spot ahead (forward cone +-24 deg, never the platform underfoot) whose curved arc fits the
    Tongue Length AND flies clear until it comes down on that spot (`arcLands`). The arc is the original
    quadratic Bezier (`tongueArchY`: natural arch, flattened only to fit). Nothing reachable: a flat arc
    of the full length ahead, ending in the air. The aim point lives in (ex, ey, ez) until the freeze;
    segments head for `tongueArcPointAt` one segment further on.
  - **Player**: FRESH movement input (deadzone `steerDeadzone`) takes over for the rest of the throw. Keys
    held at the press (`AutoHeld`) only count after being released once. A/D turn, W/S pitch (clamped
    +-`maxPitch`), at most `turnPerUnit` rad/unit per ~2-stud segment. Letting go flies straight on; the
    tongue is never pulled back to the ground.
  The path freezes when the Tongue Length is spent (tip stays WHEREVER it is) or a segment hits something
  (`tongueSegmentHit`): top -> land; side within `MOVEMENT.stepHeight` of the top -> land on top; other side /
  underside / lava / wall -> end there. The GLIDE rides exactly `layTonguePath` + `sampleTonguePath` and ends
  EXACTLY at the endpoint. Not on a top: `tongueDrop` -> straight fall, no carry, no air steering until
  landing (keeps gates honest: reach can never exceed the Tongue Length). Replicated: `tongueYaw0/Pitch0/Max/Seg`,
  `tongueControl`, `tongueDrop`, `tonguePath` ((heading, pitch) per segment); clients send only inputs.
  Client camera: `ThirdPersonCamera.setTongueAim` - a close chase shot at a FIXED distance behind the tip
  while deploying (never zooms out), blended in as the tip leaves the player, eased back after the freeze.
- Client prediction replays `stepPlayer` and reconciles EVERY `PlayerMotion` field, the steered path included.
  Test harnesses must feed input at real-time pace: the server rejects more than 1.5x real time of input.
  Any new motion field must be added to `PlayerState`, `MovementService.publish`, `AuthoritativeMotion` and
  `LocalPlayer.reconcile`.
- **XP and Tongue Length are different values.** XP (`xp`, per step) decides the level; the level alone decides
  `tongueLength` = `tongueLengthFor(level)` = 12 + 3 per level (HUD "Total Tongue", the popup, and the
  simulation's throw limit). Never derive tongue length from XP. The level-up popup fires on a level change only.
- **Progression values are pinned** (asserted by `verify:progression`): new player 0 XP, Tongue Length 12,
  Level 1 needs 17 XP (bar 0/17); default tongue +1/step; Blueberry = 1 Win, +2/step, first of 13 stage tongues
  (order is the stage order, never drop one); trails Orange 25/x1.25, Blue 50/x1.5, Green 75/x1.75,
  Purple 100/x2, Rainbow 125/x2.5; treadmills x1 (0 rebirths), x2 (3), x3 (5) enforced in `TongueService`;
  rebirth x1 -> x1.5 (+0.5 each), requires Level 10, 20, 30...; a rebirth resets XP to 0 (Tongue Length 12).
- XP per step ("Tongue per step") = worn tongue x rebirth x trail (x treadmill on a belt): `tonguePerStepFor`.
- Wins are SPENT on tongues (walk onto the pad on the stage; owned pad = equip) and trails (Trails menu).
- **30 stages**, generated deterministically in `shared/src/config/course.ts` from `STAGE_PLANS` (name +
  pattern). Stage k recommends Level 0, 5, 6, 7 ... (`recommendedLevelFor`); every throw fits that level's
  Tongue Length minus 2, and each stage's GATE throw needs one stud less than that - out of reach three levels
  lower. After ANY course or tongue edit run `npm run verify:course` (~5 min): it crosses all 30 stages with
  DEFAULT throws only (no keys), checks default throws 5 and 20 levels over never burn, and proves neither
  the default throw nor any steering (every key, taken over at every segment) reaches a gate three levels short.
  Stage dressing (turf, props, trees, gateways, lazy signs) is client-only:
  `client/src/config/stageThemes.ts` + `client/src/world/StageDecor.ts` (merge only non-indexed geometry).
- No checkpoints: any death returns to spawn; a win pad banks Wins and returns to spawn.
- **One surface style.** Every stylised mesh uses the spawn stud plate: `worldTextures.stud(color)`
  (shared singleton in `client/src/world/WorldTextures.ts`) on `texturedBox(..., 4)` geometry, or
  world-scaled UVs for curved pieces. Only the treadmill belt tread, signs and tongue skins differ.
- **No overlapping solids.** River walls and cliffs start at `HUB.maxZ + HUB_FRONT_WALL_DEPTH`, where the
  hub front walls end; stair steps are separate bands. Coplanar or overlapping faces z-fight.

## Layout facts

- Spawn (0, 0, -62) faces +Z. Leaderboards (Top Rebirths / Top Wins / Top Tongue) on the back wall z=-92.
- Training (treadmills) on the RIGHT (-X), heading "TRAINERS GET EXTRA WINS FOR CURRENCY".
- Tongue stage on the LEFT (+X): lower slab (5 tongues) + upper storey (8 tongues), stairs at both Z ends.
- River: x in [-30, 30], lava y=-3, z 0..~14,900. Each stage ends on a 40x24 deck with its win pad
  (rewards +1, +2, +3 ... growing to +6021 at Stage 30, `stageReward`).
- Music tile uses `assets/ui/Sound.png` (struck through when muted).

## Progress and identity

Unchanged from the Godspeed pattern: per-key storage (`server/src/persistence/`), Mongo via `MONGODB_URI`
else JSON (`TONGUE_DATA_DIR`), profile read at join (4105 refusal on storage failure), identity = Bloxity
token verified server-side, guest -> account migration, webhook-recorded Bux grants (`wins_small`,
`wins_large`). Profile fields: `xp, lifetimeXp, wins, ownedTongues, tongueSlot, rebirths,
ownedTrails, trailSlot, bestStage, playSeconds` (legacy `totalTongue`/`lifetimeTongue` are read as XP).

## Verification before calling anything done

`npm run typecheck && npm run verify && npm run build:client && npm run size:client`, then
`npm run verify:capacity` and `npm run verify:multiplayer` against a running dev server, and
`npm run verify:persistence` after any change to auth, persistence, join/leave/switch paths or the webhook.
