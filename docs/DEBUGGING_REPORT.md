# Debugging Report: Brammers BattleFleet AI

Every defect below was actually hit during development and fixed. None were invented. Results come from real runs on the development VM (Node 20.20.2, Postgres 16 in Docker, Chromium headless via Playwright).

## Test results

| Check | Command | Result |
| --- | --- | --- |
| Type check | `npm run typecheck` | Pass, 0 errors |
| Lint | `npm run lint` | Pass, 0 problems |
| Unit + API/DB tests | `npm test` | **57 / 57 passed** (39 engine, 18 API) |
| Browser tests | `npm run test:e2e` | **14 / 14 passed** (13 desktop at 1440×900, 1 mobile on Pixel 7) |
| Production build | `npm run build` | Pass. JS 250 kB (79 kB gzip), CSS 23 kB |
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
- **Two-click placement:** the first square shows only the directions that fit; a second square in the same row or column (adjacent or further away) fills the ship in right, down, left or up. Clicking the first square again cancels. All 17 cells get placed.
- **Captain Brammer's turn:** his reply takes at least 1.9 s (normal speed, no test shortcut), the HUD reads "Captain Brammer is targeting…", and his hit/miss message is shown.
- **Leaderboard play again:** the full leaderboard offers "Play again — Traditional Coding" after a Traditional game and opens the 15×15 placement screen.
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

### 12. Hit/miss messages vanished almost instantly with reduced motion (accessibility)
- **Symptom:** the new browser test for Captain Brammer's reply couldn't find his "missed at …" message, even though his shot had landed on the board.
- **Root cause:** toasts were hidden with the same timer helper as animations. That helper shortens every delay to 80 ms when the player prefers reduced motion, so the shot messages were gone before anyone could read them. It had been like this since the first version; no earlier test checked toast text.
- **Fix:** toasts now always stay on screen for 2.2 s. Reduced motion still shortens the animations.
- **Verified:** the Captain Brammer test now finds the message (the browser tests run with reduced motion on).

### 13. Fast test mode for Captain Brammer's delay was ignored (test harness)
- **Symptom:** after adding the 2-second delay, the Devin win test failed and the Traditional loss test timed out.
- **Root cause:** the delay was read once, when the battle code loaded. The dev-only `?fastAi=1` flag is saved when the app first renders, which is later, so tests always got the full 2 s per turn.
- **Fix:** the delay is now read at the start of each of Captain Brammer's turns.
- **Verified:** the full suite runs at its old speed. Production always uses 2 s: the fast flag only exists in dev builds and isn't in the production bundle.

### 14. The E2E `fire` step raced the victory screen (test design)
- **Symptom:** the Devin win test failed now and then because the cell it had just fired at was "not found". In repeated runs the Traditional loss test also timed out waiting for the HUD.
- **Root cause:** with reduced motion, the result screen replaces the battle screen 80 ms after the last shot. The board and HUD disappear, and the tests sometimes looked for them after they were gone.
- **Fix:** the `fire` helper accepts either the updated cell or the result screen. The loss loop stops when the result screen is showing or the HUD reads "Defeat".
- **Verified:** the loss test passed 4 repeated runs, and the full browser suite passes.

### 15. A diagonal second click moved the ship's start square (placement UX)
- **Symptom:** found in the recorded play-test. Selecting the Carrier, clicking E5, then clicking F6 (diagonal) placed nothing, and the start square silently jumped from E5 to F6.
- **Root cause:** `shipTowards` correctly returns no ship for a diagonal click, but the click handler in `Placement.tsx` then treated the click as a new first square whenever that square was a legal start.
- **Fix:** with a start square chosen, any second click that isn't a valid straight-line placement is rejected. The start square stays put and the status line explains why: "Pick a square in the same row or column as E5", or "It doesn't fit that way" for a blocked direction. Clicking the start square again or pressing Esc still cancels.
- **Verified:** the placement browser test now clicks a diagonal square, then checks that A1 is still the start square, no ship was placed and the message shows. All 14 browser tests and 57 unit tests pass.

### 16. Sign-in and game start failed on the Vercel preview (deployment config)
- **Symptom:** reported by the user. On the PR #1 preview, creating a profile and starting a game both failed with "Something went wrong (server_error)". `/api/health` still returned 200, but `/api/leaderboard` and `/api/players` returned 500.
- **Root cause:** the Vercel runtime logs for the preview show `Error: DATABASE_URL is not configured` on every failing request (`server/db.ts:8`). `vercel env ls` showed `DATABASE_URL` set for **Production only**, so preview deployments had no database.
- **Why not just copy the production value:** the preview would then write into the production tables, and test games would show on the real leaderboard.
- **Fix:** `scripts/create-preview-db.ts` creates a separate `preview` schema in the same Supabase database, with its own copy of the tables, and a least-privilege `battlefleet_preview` login whose `search_path` is `preview`. Its pooler URL was added to Vercel as a **Sensitive, Preview-only** `DATABASE_URL`, piped from a local 0600 file, so it never appeared in code, logs or chat. Production settings are unchanged.
- **Isolation verified (as `battlefleet_preview`):**
  - `search_path` is `preview`, and it can read and write the preview tables.
  - Reading `public.players` and `public.games` is denied with `42501 permission denied`, so it can't see production data.
  - Creating tables is denied, and reading Supabase's `auth` schema is denied.
- **Preview verified in a recorded browser play-test** on the PR #1 preview (production build, so real 2 s turns and no test seeds):
  - A new profile with an avatar was created and survived a reload, as did an avatar change.
  - Devin merge gave 9 autonomous hits with 0 human turns, and a full Devin game was won in 17 human turns. The win showed on the preview leaderboard with avatar and name.
  - Code Assist accept showed 3 targets and decline showed 1. Traditional ran on 225 cells with no assistance.
  - The fixed diagonal placement held E5. Captain Brammer replied after 2,001 ms with the board locked. Audio cues and mute behaved as designed, and Play again worked for all three modes.
  - Across 96 preview responses there were no 4xx/5xx responses and no console or page errors. The only failures were 11 requests cancelled by the reloads themselves (`net::ERR_ABORTED`).
  - A final read-only check of the production leaderboard did not include the preview test player.

### 17. Merging PR #1 didn't redeploy production straight away (deployment pipeline, external)
- **Symptom:** PR #1 was merged at 15:29:04 UTC. A 5-minute poll found no new Vercel production deployment, and the live site still served the old JS bundle. To get the approved change live, a production deployment of the exact merge commit `e12bfb0` was created through the Vercel API (`dpl_9GhmEFh6…`, 15:34:45 UTC).
- **Investigation (read-only):**
  - The Vercel project is linked to GitHub `Richardbrammer23/BrammersBattlefleet`, and `main` is the production branch. The earlier push of `6d20197` to `main` was built for production by Git (`source: git`) 2 s after the push.
  - `vercel.json` has no `ignoreCommand` and no `git.deploymentEnabled` override.
  - The merge commit's author, `devin-ai-integration[bot]`, was not the problem: Vercel later built that same commit itself.
  - GitHub commit statuses on `e12bfb0` show **two** production deployments. One is the manual one. The other is Vercel's own Git deployment, `dpl_9bvESYpx…` (`source: git`, `target: production`), created at **15:38:07**, 9 minutes after the merge and about 4 minutes after the poll gave up. That Git deployment is the one serving `brammers-battlefleet.vercel.app` now. Both deployments built the same commit, so the site didn't change between them.
  - Push-to-build delay for every push that day:

    | Commit | Pushed (UTC) | Vercel build created | Delay |
    | --- | --- | --- | --- |
    | `6d20197` (main) | 13:15:41 | 13:15:43 | 2 s |
    | `fe9cc06` | 14:07:20 | 14:07:23 | 3 s |
    | `37be893` | 14:31:15 | 14:41:14 | 10 min |
    | `f03cc51` | 14:51:24 | 15:01:12 | 10 min |
    | `8fb6da0` | 14:59:28 | 15:11:55 | 12 min |
    | `e3f7284` | 15:18:34 | 15:38:11 | 20 min |
    | `e12bfb0` (merge to main) | 15:29:04 | 15:38:07 | 9 min |

  - The last two pushes were processed together at 15:38. That points to GitHub delivering its notifications late, not to anything in the project.
- **Root cause:** GitHub had an incident on 21 Oct 2026, "Delays for Pull Requests and Webhook deliveries" (githubstatus.com, investigating from 14:52 UTC and still unresolved when this report was written). Vercel's Git integration deploys when it receives GitHub's push webhook, so a late webhook means a late deploy. The project configuration was correct.
- **Fix:** none needed in the project. Changing Vercel or GitHub settings wouldn't make GitHub's webhooks arrive faster. A GitHub Actions deploy job wouldn't help either, because Actions was degraded in the same incident. The process lesson: after a merge, confirm the production deployment from Vercel or the commit status. If it hasn't appeared within about 15 minutes, check githubstatus.com and redeploy that exact commit, rather than changing project settings.

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
- Vercel's team alias `brammers-battlefleet-richard-brammr.vercel.app` is behind Vercel Authentication. Use the production URL below.

## Live verification (production)
Deployed to https://brammers-battlefleet.vercel.app (Vercel, auto-deploys from `main`) with a dedicated Supabase Postgres project. The runtime connects as a restricted `battlefleet_app` role. That role can only read and write the four game tables. It was checked and is denied creating or dropping tables and reading the `auth` schema.

- **API smoke test (16/16 passed):** 16-character name rejected; player created; enemy fleet absent from the client payload; Code Assist decline returns exactly 1 highlight; duplicate and out-of-bounds shots rejected (409); bad token rejected (401); recovery code restores the profile and invalidates the old token; abandoned game rejects shots; leaderboard reachable. The test-seed header is ignored in production.
- **Browser tests against the live URL (2/2 passed):** desktop: profile, Devin merge (9 hits, 0 human turns), first human shot and AI reply, Code Assist decline (1 highlighted target), Traditional 15×15 board. Mobile (iPhone 13 viewport): the 15×15 board fits with no horizontal scroll.
- **Secrets and headers:** the production JS/CSS bundle contains no database URL, Supabase host or project ref, `DATABASE_URL`, service-role value or token pattern. HSTS, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff` and `Referrer-Policy` headers are present.
- Test players were deleted afterwards, so the leaderboard starts empty.

One defect turned up in the verification tooling, not in the app. The first smoke script sent shots as `{x, y}`, but the API expects `{r, c}`, so its first shot was rejected as out-of-bounds. The script was corrected and re-run. No app change was needed.

## Production smoke test after PR #1 (21 Oct 2026)
This was a recorded browser run against https://brammers-battlefleet.vercel.app. That URL serves deployment `dpl_9bvESYpx…` of merge commit `e12bfb0`; its JS bundle `index-BSqnZRcj.js` is byte-for-byte the same name as a local `npm run build` of `main`.

**How it was kept off the leaderboard:**
- One throwaway player, `QA Smoke`, played 5 games. Every game was abandoned before the fleet was sunk. Only won games are ranked, so nothing was ranked.
- Afterwards the `QA Smoke` row was deleted with the app role, and its 5 games went with it through `on delete cascade`.
- Database counts after cleanup: 2 players, 0 `QA Smoke` rows, and 4 games, all real won games by Captain Richard.
- The leaderboard had 3 entries at the start and 4 at the end. The extra one is a genuine Captain Richard Devin win in 13 turns, recorded during the run before any QA game was created. `QA Smoke` never appeared on it.

**Passed:**
- **Registration:** `QA Smoke` was created with the Admiral avatar, and a reload kept the profile and avatar.
- **Recovery:** copying the recovery code showed a confirmation, and restoring it in a fresh browser context brought back the same player ID and avatar. The original device was then signed out: `GET /api/players/me` returned 401 and it went back to Welcome.
- **Placement:** two-click placement worked horizontally and vertically. The diagonal E5→F6 was rejected and E5 stayed as the start square. Randomise placed all 17 cells, and the game started.
- **Devin merge:** 9 autonomous hits and 0 human turns, then 2 manual shots.
- **Devin decline:** 9 highlighted targets, 0 automatic shots, and the manual-execution description. One highlighted and one non-highlighted cell were fired.
- **Code Assist:** accept showed 3 targets and decline showed exactly 1. Highlighted targets had to be fired manually, and a fired highlight was used up. Two human turns each.
- **Traditional:** 225 cells in placement and in battle, no assistance or highlights, 3 shots.
- **Captain Brammer:** the name is correct on Home, the waters heading, the targeting HUD and the miss messages, and the title is unchanged.
  - His reply took **2,000.7 ms**.
  - A forced second click during his turn sent no extra fire request.
- **Play again:** the full leaderboard loaded with names and avatars. "Play again — Traditional Coding" opened a fresh 225-cell placement without creating a game.
- **Audio (instrumented Web Audio):**
  - Nothing plays until the first click or key press.
  - Menu music and battle sonar both started.
  - Captain Brammer's miss cue played at 620/480/700 Hz.
  - Mute scheduled zero new audio events, and unmute restored the sonar hum and pings (55 Hz and 1,320 Hz).
- **Network:** 44 API responses: 37×200, 6×201 and 1 deliberate 401 (the signed-out old device). There were no other failed requests, no page errors and no console warnings. The only console error came with that deliberate 401.

**Not verified in production (and why):**
- Captain Brammer's hit and sunk cues: all 11 of his replies happened to miss, and no extra shots were fired to force a hit. The hit cue (90/260 Hz) was verified on the Preview.
- Victory, defeat and result screens: deliberately not played, to keep test results off the leaderboard. They are covered by the local E2E suite and the Preview Devin win.
- How the music and sounds actually sound: needs a human listener.
- The new build on real phones: the mobile layout is covered by the local Pixel 7 E2E test.

## Readiness
**Tests run for this sign-off, on `main` at `e12bfb0`:**
- Typecheck and lint are clean.
- Vitest: 57/57.
- Build passes.
- Playwright: 14/14 locally.
- The production browser smoke test above passed.
- The production API answered health and leaderboard with 200, the bundle contains no secrets, and the security headers are present.

**Assessment: ready for public play.** All three modes, profiles, recovery, ship placement, Captain Brammer's 2 s turns, Play again and the leaderboard work in production with no unexpected errors. Preview deployments use a separate `preview` schema, so they can't write to the live leaderboard.

**Outstanding risks and manual checks:**
- The GitHub repository is still **private**: logged-out requests return 404. The owner has to switch it to Public for the public-repo deliverable.
- Until GitHub's webhook incident is resolved, deploys after a merge may arrive late. See #17.
- Someone can still keep restarting until they get a lucky board. Rate limits slow this down but can't stop it.
- A profile is lost if browser data is cleared and the recovery code wasn't saved.
- The Vercel runtime logs a Node `DEP0169` `url.parse()` deprecation warning on `/api`. It is harmless today and is not raised by app code.
- Still to check by hand: listen to the music and sounds, see a Captain Brammer hit, sunk and defeat in production, and play once on a real phone.
