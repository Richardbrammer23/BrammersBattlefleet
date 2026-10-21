# Debugging Report: Brammers BattleFleet AI

Every defect below was actually hit during development and fixed. None were invented. Results come from real runs on the development VM (Node 20.20.2, Postgres 16 in Docker, Chromium headless via Playwright).

## Test results

| Check | Command | Result |
| --- | --- | --- |
| Type check | `npm run typecheck` | Pass, 0 errors |
| Lint | `npm run lint` | Pass, 0 problems |
| Unit + API/DB tests | `npm test` | **55 / 55 passed** (37 engine, 18 API) |
| Browser tests | `npm run test:e2e` | **11 / 11 passed** (10 desktop at 1440×900, 1 mobile on Pixel 7) |
| Production build | `npm run build` | Pass. JS 245 kB (77 kB gzip), CSS 22 kB |
| AI simulation | `npm run simulate -- 5000` | See below |

### What the browser tests cover
- The name input stops at 15 characters, and invalid names can't be submitted.
- A profile with a custom avatar survives a reload. Renaming it persists.
- A recovery code restores the profile in a fresh browser context.
- **Devin merge:** the PR card is shown, merging lands exactly 9 hits with 0 human turns, the player finishes the remaining 8 cells, the result shows 8 turns and a rank, and the leaderboard row shows name and avatar. Mode filters include and exclude the row correctly.
- **Devin decline:** 9 targets are highlighted, none are auto-hit, and the first manual shot counts as 1 turn.
- **Code Assist accept:** 3 targets are highlighted, there are 0 hits, and the turn count is 0.
- **Code Assist decline:** exactly 1 target is highlighted.
- **Traditional:** the board has 225 cells and no highlights. A repeat shot is blocked and doesn't add a turn. The keyboard works (arrow keys move focus, Enter fires). The timer runs.
- **Traditional loss:** a player who only misses is defeated by the Hard AI and isn't ranked.
- An in-progress game resumes after a reload. Restart abandons it.
- **Mobile:** the 15×15 board fits a 412 px viewport with cells at least 19 px, there's no horizontal scroll, and the fleet/enemy toggle works.

### AI simulation (shots for each AI to sink a random fleet, 5,000 seeded games per row)

| Board | AI | Mean | p10 | Median | p90 | Min | Max |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 10×10 | Easy | 95.4 | 89 | 97 | 100 | 60 | 100 |
| 10×10 | Medium | 50.9 | 39 | 51 | 62 | 23 | 76 |
| 10×10 | Hard | 44.9 | 34 | 44 | 58 | 21 | 71 |
| 15×15 | Easy | 213.3 | 198 | 217 | 224 | 141 | 225 |
| 15×15 | Medium | 96.9 | 69 | 98 | 123 | 31 | 153 |
| 15×15 | Hard | 86.5 | 58 | 85 | 121 | 31 | 152 |

The difficulty order holds (Easy > Medium > Hard shots needed) on both board sizes. In Traditional mode (15×15 vs Hard), a human has about 86 turns on average before losing and needs at least 17 hits. The 15×15 size was kept at the product owner's request.

## Bugs found and fixed

### 1. Profanity filter bypassed with leetspeak (security / content)
- **Symptom:** the API test `rejects profane names including leetspeak` showed that a name like `sh1t f4ce` was accepted.
- **Root cause:** name normalisation removed all non-letters *before* blocklist matching, so the digits that stood in for letters were simply dropped (`sh1t` became `sht`).
- **Fix:** `src/engine/names.ts` now maps `0 1 3 4 5 7 8` to `o i e a s t b` before stripping and matching.
- **Verified:** the API test passes, and the profile tests in the 55/55 run still pass.

### 2. Abandoned games could still be started and played (game integrity)
- **Symptom:** the API test `abandons active games when a new one starts` expected `409` on `POST /games/:id/start` for an abandoned game but got `200`.
- **Root cause:** `mutateGame()` checked the phase inside the serialised game JSON (still `briefing`) but not the row's `phase` column, which the abandon query had set to `abandoned`.
- **Fix:** `server/api.ts` now reads the row phase under `SELECT … FOR UPDATE` and returns `409 game_abandoned` before any change.
- **Verified:** the API test passes, and the E2E test "restart abandons it" passes.

### 3. Engine "human can lose" test never reached defeat (test design)
- **Symptom:** `expected 'playing' to be 'lost'`.
- **Root cause:** the test fired 83 deliberate misses on a 10×10 board against the Easy (random) AI. The simulation shows Easy needs about 95 shots on average, so the AI often hadn't won yet.
- **Fix:** the test now plays Traditional (15×15, Hard AI) and fires until the game ends.
- **Verified:** it passes deterministically with a fixed seed.

### 4. Postgres transaction typing errors (build)
- **Symptom:** `tsc` errors TS2345, TS2344 and TS2349 in `server/api.ts` where `recordVictory()` was called inside `sql.begin()`.
- **Root cause:** the helper was typed with the top-level `Sql` type rather than `postgres.TransactionSql`, and the row type was missing `phase`.
- **Fix:** typed the parameter as `postgres.TransactionSql` and added `phase` to the row type.
- **Verified:** `npm run typecheck` is clean.

### 5. Avatar preset selection failed type-checking (frontend)
- **Symptom:** TS2345 in `src/ui/AvatarCreator.tsx`. The object built when a preset was chosen wasn't assignable to `AvatarConfig`.
- **Root cause:** a generic `[k]: v` update widened `preset` to the union of *all* option values, which includes hair styles and colours.
- **Fix:** handle the preset path separately with a narrowed `AvatarConfig['preset']` value.
- **Verified:** the typecheck is clean, and the E2E avatar customisation test passes.

### 6. Devin "autonomous attacks" banner covered the HUD (UI)
- **Symptom:** a Playwright screenshot taken during the merge animation showed the fixed banner over the turn counter and timer.
- **Root cause:** the banner was pinned `top: 76px`, which is the same position as the HUD.
- **Fix:** moved the banner to the bottom of the viewport.
- **Verified:** checked by screenshot again.

### 7. Mute button showed an empty box on systems without emoji fonts (UI)
- **Symptom:** in headless Chromium screenshots the mute toggle showed a "tofu" box.
- **Root cause:** the icon used 🔊/🔇 emoji characters.
- **Fix:** replaced them with an inline SVG speaker icon. It keeps `aria-label` and `aria-pressed`.
- **Verified:** checked by screenshot on desktop and mobile.

### 8. Mode cards overflowed the screen on mobile (responsive)
- **Symptom:** in a Pixel 7 screenshot of the home page, the mode cards ran past the right edge of the viewport.
- **Root cause:** the single-column grid used `1fr`. Its implicit `min-width: auto` let long content push the track wider than the viewport.
- **Fix:** changed to `minmax(0, 1fr)` for the single-column layouts.
- **Verified:** the mobile E2E check for no horizontal scroll passes.

### 9. Playwright desktop project also ran the mobile spec (test config)
- **Symptom:** `mobile.spec.ts` failed under the `desktop` project because both boards are visible at 1440 px.
- **Root cause:** the desktop project had no `testIgnore`, so it picked up the mobile-only spec.
- **Fix:** added `testIgnore: /mobile\.spec\.ts/` to the desktop project.
- **Verified:** the run has 11 tests, each in the right project.

### 10. E2E defeat loop hung after the game ended (test design)
- **Symptom:** the Traditional loss test timed out trying to click a disabled cell.
- **Root cause:** the loop stopped only when the result screen appeared. That screen comes about 1.2 s after defeat, so the loop tried to fire again while the board was already locked.
- **Fix:** the loop now stops as soon as the turn indicator reads "Defeat".
- **Verified:** the test passes.

### 11. Duplicate-shot E2E step couldn't click the fired cell (test design, confirms behaviour)
- **Symptom:** the test timed out clicking a cell it had already fired at.
- **Root cause:** the UI marks fired cells `aria-disabled`, which Playwright treats as not clickable. The UI was already blocking the duplicate, which is the behaviour the requirement asks for.
- **Fix:** the test now checks `aria-disabled="true"`, force-clicks, and confirms the turn counter doesn't change. The server-side duplicate rejection is covered separately by an API test.

## Security review summary
- The enemy fleet and unused assistance targets never leave the server while a game is active (engine test plus `publicGame()`).
- Scores, turns, time and rank are computed on the server. The client never submits them.
- Row locks prevent duplicate PR merges and simultaneous duplicate shots (concurrency API tests send parallel requests).
- Tokens are stored only as hashes. Recovery rotates the session and invalidates the old one.
- The test seed is accepted only when `ALLOW_TEST_SEED=1` and not in production (API test).
- RLS is on, with no anon/authenticated grants. `DATABASE_URL` is server-only.

## Known limitations
- Rate limiting reduces "restart until you get a lucky board" but can't fully stop it.
- Clearing browser data without saving the recovery code loses the profile.
- Sound needs a user gesture first (browser autoplay policy).
- Live deployment checks are pending until hosting credentials are available (see the hand-off notes).

## Readiness
Locally, the engine, API, UI, accessibility and responsive behaviour are complete and fully tested. Production readiness depends on deploying to Vercel with a Supabase database and repeating a smoke test against the live URL.
