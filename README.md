# Brammers BattleFleet AI

Classic Battleship against an AI admiral, played three ways. Each way stands for a different style of software development:

| Mode | Board | AI opponent | Assistance |
| --- | --- | --- | --- |
| **Devin (autonomous execution)** | 10×10 | Easy (random) | Devin finds 9 of the 17 enemy ship cells and opens a simulated pull request. **Merge** it and all 9 hits land automatically for 0 human turns. **Decline** it and the 9 targets stay highlighted, but you fire every shot yourself. |
| **Code Assist (assisted development)** | 10×10 | Medium (hunt & target) | **Accept** and 3 enemy ship cells are highlighted. **Decline** and only 1 of those 3 is highlighted. Either way you fire every shot yourself. |
| **Traditional Coding (manual challenge)** | 15×15 | Hard (probability density) | None. |

> Independent demo. Not affiliated with or endorsed by Cognition. The Devin mark used here is an original, unofficial design. The percentages are game mechanics, not productivity benchmarks.

## Features

- No login needed. You get a persistent profile with a display name (2–15 characters, profanity filtered) and a customisable SVG avatar: preset, hair, hair colour, skin tone, eyes, expression, facial hair, glasses/accessories, clothing and clothing colour.
- A recovery code moves your profile to another browser (no email needed).
- Ship placement by click, keyboard and `R` to rotate, plus Randomise and Clear.
- Server-authoritative games, so the browser never sees the enemy fleet and never submits a score.
- A public leaderboard (overall and per mode) that shows avatar, name, mode, assistance, human turns, time and date.
- Personal bests and achievements (Fleet Commander, Sharpshooter, Perfect Streak, Speed Captain, Devin Commander).
- Accessible boards: every cell is a labelled button, arrow keys move between cells, Enter/Space fires. Supports reduced motion and has a mute toggle.
- A responsive layout. On phones you switch between your fleet and enemy waters, and the 15×15 board still fits.

## Rules and scoring

- Fleet: Carrier 5, Battleship 4, Cruiser 3, Submarine 3, Destroyer 2 (17 cells). Ships may touch but can't overlap or leave the board.
- One shot per turn, alternating with the AI. You fire first.
- **Human turns** go up by one for each valid shot you fire. These don't count: duplicate or invalid shots, AI shots, and Devin's autonomous merge hits.
- The **timer** starts when you press *Take command* (after the assistance step) and stops when the game ends.
- **Ranking:** fewest human turns, then fastest time, then earliest finish. All three are computed on the server. Results are *not* normalised across modes or assistance. That's deliberate, because the leaderboard is meant to show how much the autonomous mode helps.

## The AI opponents

All three get only what a real opponent would know: board size, their own shot history (miss/hit/sunk) and which of your ships are still afloat. They never get your fleet. See `src/engine/ai/`.

- **Easy:** fires at a random untried cell.
- **Medium:** hunt and target. It fires randomly until it hits, then tries the neighbouring cells, then follows the line once it knows which way the ship runs.
- **Hard:** probability density. It counts every legal placement of every surviving ship that fits the misses, hits and sunk ships so far, weights placements that cover unresolved hits much more heavily, and fires at the most likely cell.

Measured with `npm run simulate -- 5000`. These are the shots each AI needs to sink a random fleet, over 5,000 seeded games per row:

| Board | AI | Mean | p10 | Median | p90 |
| --- | --- | --- | --- | --- | --- |
| 10×10 | Easy | 95.4 | 89 | 97 | 100 |
| 10×10 | Medium | 50.9 | 39 | 51 | 62 |
| 10×10 | Hard | 44.9 | 34 | 44 | 58 |
| 15×15 | Easy | 213.3 | 198 | 217 | 224 |
| 15×15 | Medium | 96.9 | 69 | 98 | 123 |
| 15×15 | Hard | 86.5 | 58 | 85 | 121 |

In Traditional mode a human has about 86 turns on average before the Hard AI sinks them, and needs at least 17 hits from 225 cells. It's meant to be hard.

## Architecture

```
src/engine/   pure TypeScript game engine (fleet rules, shots, assistance, 3 AIs, achievements, names). No React, no I/O.
src/ui/       React components (board, placement, briefing/PR, battle HUD, results, leaderboard, avatar creator, profile)
server/       API router + Postgres access + security helpers (shared by Vercel and the Vite dev server)
api/index.ts  Vercel serverless entry point -> server/api.ts
e2e/          Playwright browser tests
```

- **Server-authoritative play:** `POST /api/games` creates the game on the server with a random seed. Each shot (`POST /api/games/:id/fire`) is checked, resolved and answered by the AI on the server. The browser only receives `publicGame()`, which leaves out the enemy fleet and the unused assistance targets until the game ends. On a win the server works out the turns, time and rank inside the same transaction.
- **Integrity:** every change to a game locks its row (`SELECT … FOR UPDATE`). That rules out double merges, double shots, playing after the game ends, and playing an abandoned game. Starting a new game abandons any active one. Tokens and recovery codes are 256-bit / 120-bit random values and are stored only as SHA-256 hashes. Rate limits cover profile creation, recovery and game creation.
- **Database:** Postgres (Supabase compatible). Schema is in `server/schema.sql`. RLS is on and the public `anon`/`authenticated` roles get no access. Only the server connects, via `DATABASE_URL`.

## Running locally

Requirements: Node 20+ and Docker (for a local Postgres).

```bash
npm install
npm run db:local          # Postgres 16 on localhost:54329
cp .env.example .env      # DATABASE_URL=postgres://postgres:postgres@localhost:54329/postgres
npm run db:migrate
npm run dev               # http://localhost:5173 (UI + /api in one server)
```

## Testing

```bash
npm run typecheck
npm run lint
npm test                  # Vitest: engine unit tests + API/DB integration tests (needs the local DB)
npx playwright install chromium
npm run test:e2e          # Playwright: desktop + mobile browser flows
npm run simulate -- 5000  # AI strength simulation
```

Tests use fixed seeds through the `X-Test-Seed` header. The server only accepts it when `ALLOW_TEST_SEED=1` **and** `NODE_ENV !== 'production'`, so it can't be used on a production deployment.

Results, the bugs found and how they were fixed are in [`docs/DEBUGGING_REPORT.md`](docs/DEBUGGING_REPORT.md).

## Deployment (Vercel + Supabase)

1. Create a Supabase project and copy the **pooled** connection string (Transaction pooler, port 6543).
2. Run the schema: `DATABASE_URL=… npm run db:migrate`.
3. Import the repo into Vercel (Vite preset). Set `DATABASE_URL` as a server-side environment variable. Never add it to `VITE_*`.
4. Deploy. `vercel.json` routes `/api/*` to the serverless function and serves the SPA for everything else.

## Known limitations

- Profiles are tied to a browser token. If you clear site data without saving your recovery code, the profile is lost.
- Rate limiting reduces "restart until you get a lucky board" but can't stop it completely, because new games are free to start.
- Per-IP limits rely on the `x-forwarded-for` header that Vercel sets.
- Sound is synthesised with the Web Audio API and plays only after the first user interaction (browser autoplay rules).
