# +1 Tongue Escape

A browser multiplayer obby where your tongue is the only way across a river of lava. Throw it, watch it
arc out and slap onto an island, then ride the curve across. Every step grows your tongue; a longer tongue
reaches further islands.

Three.js client, authoritative Colyseus server (15 players per room), hosted on Bloxity.

## Play

| Action | PC | Mobile |
| --- | --- | --- |
| Walk | WASD / arrows | left stick |
| Look | mouse | drag |
| Throw tongue | left click or Space | TONGUE button |
| Take over and steer the tongue while it deploys: climb / dive | W / S (up / down arrows) | stick up / down |
| Take over and steer the tongue while it deploys: curve left / right | A / D (left / right arrows) | stick left / right |
| Trails menu | T | Trails tile |
| Rebirth menu | R | Rebirth tile |
| Music | M | Music tile |

## The game

- **Tongue progression.** Walking earns Tongue per step. You start at Total Tongue 12, Level 1 (12/17).
  Levels lengthen your tongue's reach.
- **Tongue Training** (right of spawn). Treadmills x1, x2 (3 rebirths) and x3 (5 rebirths).
- **Tongue stage** (left of spawn). Thirteen tongues on a two-storey stage, from Blueberry (1 Win, +2 per step)
  to Futuristic. Walk onto a pad to buy, or to re-equip one you own.
- **The lava river.** Stage 1 has broad islands for an early tongue. Stage 2 (recommended Level 5) has
  smaller, scattered, higher islands. Win pads pay +1 and +2 Wins.
- **The tongue.** Click with no keys: the head tilts back and the tongue arcs up and over, coming down
  on the island ahead that it can reach. That's the default and it's all you need to cross a stage. Press
  W / A / S / D (or move the stick) while it flies out to take the tip over yourself: W climbs, S dives,
  A / D curve, freely in 3D, and nothing pulls it back to the ground. It is yours for the rest of that
  throw. Keys you were already holding when you clicked (walking up to the edge) don't count. When your
  Tongue Length runs out the tip stops where it is, even high above the lava. You ride the exact curve to
  that point; if it didn't come down on an island, you drop straight down from there. While the tongue
  flies out the camera follows its tip from just behind, then eases back for the ride.
- **Rebirth.** Resets your level for a permanent Tongue multiplier: x1.5, then +0.5 per rebirth.
- **Trails.** Orange, Blue, Green, Purple and Rainbow multiply Tongue by x1.25 up to x2.5.
- **Leaderboards.** Top Rebirths, Top Wins and Top Tongue on the spawn's back wall.

## Develop

```bash
npm install
npm run dev
```

Client on http://localhost:5186, server on :2586. See `CLAUDE.md` for the rules, verification scripts and
layout facts.

## Deploy (Bloxity Hosting)

`.github/workflows/deploy.yml` publishes on every push:

| Branch | Channel | Frontend | Backend (WebSocket) |
| --- | --- | --- | --- |
| `dev` | DEV | https://tongue-escape.dev.play.bloxity.io | wss://tongue-escape.dev.host.bloxity.io |
| `main` | PROD | https://tongue-escape.play.bloxity.io | wss://tongue-escape.host.bloxity.io |

Any other branch does not deploy. A manual run (Actions, "Run workflow") follows the same mapping.

- **Backend:** the Colyseus server is built from the root `Dockerfile` and pushed to
  `ghcr.io/<owner>/tongue-escape-server:<channel>-<sha>`. It is rolled with
  `POST https://legion.bloxity.io/v1/apps/tongue-escape/deploy`, using the commit SHA as the version,
  `seatCap` 15 (the room size) and `maxReplicas` 5. Legion injects `PORT` and `MONGODB_URI`, and
  probes `/health`.
- **Frontend:** `client/dist` is built with that channel's WebSocket URL baked in, zipped with
  `index.html` at the root, and uploaded raw to
  `POST https://api.bloxity.io/v1/hosting/games/tongue-escape/frontend?channel=<channel>&version=<sha>`.

One-time setup:

1. Create the game `tongue-escape` on https://hosting.bloxity.io (My Games).
2. Add the repository secret `LEGION_DEPLOY_TOKEN` (the token from My Games, behind the eye icon).
3. After the first run, make the GHCR package `tongue-escape-server` public (repository, Packages,
   Package settings, Change visibility) so Legion can pull it.

Progress lives in the Legion-injected MongoDB, per channel, so deploys never reset players.
