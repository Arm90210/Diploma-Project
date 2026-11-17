# Development progress

## 2026-11-13 — Phase 1 foundation

### Implemented

- Empty workspace initialized as an npm workspace with React/TypeScript/Vite/Tailwind frontend and Express/TypeScript backend.
- Responsive foundation screen with real API/database connection checks, retry action, and honest feature-status labels.
- API liveness, database connectivity readiness, safe JSON errors, body-size limit, Helmet headers, and shutdown handling.
- PostgreSQL Compose configuration and local environment example; development services bind to loopback.
- Prisma schema, generated initial SQL migration, analytical indexes, unique keys, and SQL CHECK constraints.
- MVP/final scope, architecture and entity explanations, phase acceptance criteria, data validity/privacy rules, and mathematical evaluation plan.

### Verified

| Check | Result |
| --- | --- |
| Dependency installation | Completed; lockfile created. See advisory status below. |
| TypeScript checks for both apps | Passed with `npm run typecheck` |
| Production builds for both apps | Passed with `npm run build` |
| API HTTP tests | All 6 passed, using the tsx test runner outside the socket-restricted sandbox |
| Prisma schema validation | Passed using Prisma 6.19 CLI |
| Prisma client and migration SQL generation | Passed; engine cache access required execution outside sandbox |
| Development startup | Vite on 5173 and Express on 3001 started successfully |
| Integrated `/api/health` through Vite proxy | HTTP 200 with `status: ok` |
| Integrated `/api/ready` without PostgreSQL | HTTP 503 with safe `database: disconnected` response, as expected |

### Unverified and limitations

- Migration application, SQL CHECK execution, relational behavior, and the real-database readiness success path have **not** been integration-tested. Docker and PostgreSQL are not installed here. Readiness success is tested with an injected dependency, not a live database.
- Automated browser inspection failed because the in-app browser returned a session-access error. Responsive styles are implemented but visual rendering and browser interactions are not verified.
- The environment uses Node 20.20.2 with npm 12.2.2, an unsupported pairing according to npm's own warning. Build/tests passed, but Node 24 with its bundled npm is recommended.
- npm 12 blocked dependency lifecycle scripts. Prisma client generation was run explicitly; Vite build and tsx execution succeeded. On a clean machine, follow the documented `db:generate` step and do not assume automatic postinstall generation.
- Installation reported 4 high-severity dependency advisories. Detailed audit status is recorded below. Do not consider this foundation cleared for deployment.
- Authentication, upload safety, audio playback, social features, event validation/consent enforcement, synthetic generator, mathematical models, and analytics are planned rather than implemented.

### Next session

Finish Phase 1's database verification on local PostgreSQL: start Compose, run `npm run db:migrate`, then confirm `/api/ready` returns 200. Inspect migration constraints and indexes. Resolve dependency advisories before deployment. Begin Phase 2a with authentication/session design and its focused tests, then add the catalog and playback. Keep each step runnable and update this log.

### Dependency advisory status

The install summary reported **4 high-severity advisories**. Two subsequent online `npm audit --json` attempts failed at the registry's bulk advisory endpoint, so package identities and fixes could not be reliably retrieved. An offline audit reported zero, but that is not a current registry check and does not supersede the install warning. No forced major-version update was applied. Re-run `npm audit` with a compatible Node/npm installation and working registry access, review the dependency paths, apply appropriate upgrades, and repeat affected checks before deployment.

## 2026-11-14 — MusicSphere concept update

Adopted MusicSphere branding and added the Communities + Friends design. Updated scope and delivery gates, planned social entities, matching/evaluation model and Community Pulse rules. Friends initially means mutual follows; public communities come first. The initial migration remains unchanged. This update implements branding and planning only; social features and algorithms are not yet implemented.

## 2026-11-14 — Step-by-step execution plan

Added STEPS.md with numbered implementation tasks and demonstration gates, preserving the established phase numbering. Rechecked environment: Node 20.20.2/npm 12.2.2 remain mismatched; Docker, psql and initdb are absent from PATH. Next task is 1.2, followed by local database setup. No new application functionality is claimed by this planning update.

## 2026-11-14 — Step 1.2 completed

Installed Node 24.22.3 with npm 11.19.1 through existing nvm. Activate with `source ~/.nvm/nvm.sh && nvm use` in the project directory. System runtime/default shell configuration was not replaced. Root package engines now specify Node 24 and npm 11.

Online audit identified four high advisories through Prisma tooling dependencies (`deepmerge-ts`, `effect`, `@prisma/config`, `prisma`). Upgraded Prisma/client/adapter together to 7.10.1 rather than forcing transitive major-version overrides. The updated online installation audit reported zero vulnerabilities. Added prisma.config.ts for CLI database configuration and PrismaPg for the runtime pool. Existing SQL migrations are unchanged.

Verified with Node 24: schema validation, client generation, both TypeScript checks, both production builds and all six HTTP tests passed. Compiled database client/adapter initialization also passed. These checks supersede the earlier runtime mismatch and unresolved advisory notes. Live database connectivity and migration application still await step 1.3–1.4; no PostgreSQL server is installed yet.

## 2026-11-14 — Steps 1.3 and 1.4 completed

Docker initially failed because running kernel 7.2.15 had no matching modules after an upgrade. After the user rebooted into 7.3.4 and started PostgreSQL with Compose, the initial migration applied successfully. Running migrate deploy again reported no pending migrations.

Added `npm run test:db -w apps/api`: a real PostgreSQL integration check that verifies the ten application tables and six CHECK constraints, exercises all six CHECK constraints plus a foreign key and duplicate-like uniqueness, and verifies HTTP 200 readiness through the actual Prisma database dependency. It creates fixtures inside a transaction that is intentionally rolled back. The test initially used the old error metadata layout; corrected it to inspect Prisma 7 adapter SQLSTATE and reran successfully. Compiled API build also passed. Step 1.5 browser verification remains pending.

## 2026-11-14 — Step 1.5 completed; Phase 1 foundation verified

Started the frontend/API with Node 24 and inspected the live homepage at http://127.0.0.1:5173 in the in-app browser. Frontend, API and PostgreSQL indicators all showed Connected after using Check connections. Visually inspected the desktop layout; roadmap and overview links navigated to the correct sections. Old browser tabs retained connection-error pages after the reboot; a fresh tab loaded successfully. Mobile viewport and broader accessibility testing remain later work.

The README startup sequence has now been exercised across dependency installation, generation, database startup, migration and dev startup. Phase 1 is complete for the current local environment. Next: step 2a.1, account/session contracts and migration.

## 2026-11-14 — Step 2a.1 completed

Added Session model and applied a new additive migration with token-hash uniqueness/format, expiration ordering, user foreign key and cascade deletion, plus lookup/cleanup indexes. Documented planned endpoint contracts, input rules, cookie policy, origin checks and throttling in AUTHENTICATION.md. No auth routes are implemented yet.

Schema validation, client generation, migration application, both builds, six HTTP tests and real-database integration passed. Database tests now cover session CHECK constraints, unknown users, duplicate token hashes, cascade deletion and indexes; fixtures roll back. Expiry rejection in authentication middleware remains future work. Next: 2a.2 registration, password hashing and input validation.

## 2026-11-14 — Step 2a.2 completed

Implemented POST /api/auth/register with canonicalized profile input, password validation, scrypt hashing, safe response fields and generic duplicate handling. Added Origin/content-type/body-size protection, bounded per-IP throttling and concurrent-hash limits. Production startup requires explicit HTTPS APP_ORIGINS.

Both builds, all 12 unit/HTTP tests and the PostgreSQL integration test passed. Live database checks now verify stored hashes, password verification, and separate email/username duplicate conflicts with rolled-back fixtures. Local hash timing was about 195 ms. Registration API is available; no registration screen or login behavior yet. Next: 2a.3 login, session middleware, current-user and logout.

## 2026-11-14 — Step 2a.3 completed

Added login, current-user and logout endpoints; reusable cookie/session middleware; transactional token rotation; seven-day absolute expiration; startup/hourly expired-session cleanup; and bounded per-IP/account login limits. Raw tokens appear only in HttpOnly cookies; PostgreSQL stores their hashes. Registration and login share a two-operation concurrency bound.

Both builds, all 22 unit/HTTP tests and both PostgreSQL integration tests passed. Live lifecycle verification covered stored token hashes, safe response fields, persistence across new API instances, generic failed credentials, preservation of the old session on failed login, successful rotation, independent devices, idempotent logout, exact expiration boundary and account-deletion revocation. Fixture accounts/sessions were cleaned up. Secure cookie flags were verified at HTTP-header level; actual browser login/HTTPS testing remains for the UI/deployment steps. No additional migration or dependency was required. Next: 2a.4 account screens and profile editing.

## 2026-11-16 — Interface presentation milestone

Built a responsive MusicSphere interface: discovery dashboard, genre/search filtering, original artwork, eight generated audio studies, persistent audio player (seek/volume/queue/shuffle/repeat), local likes and playlists, community previews, synthetic regional charts, local audio opening, account dialogs, and profile editing. Profile display-name updates use an authenticated, origin-checked API and persist in PostgreSQL; ownership comes from the session.

Preview collections are browser-local and partitioned by account. Community member counts and charts are illustrative; joining is local and draft posts last for the current visit. No live social network, recommendations, cloud music uploads, or real analytics are claimed. Audio and artwork are original generated assets; reproduce with `python3 scripts/generate-demo-assets.py`.

Verified production build and 23 API tests; live database tests cover sessions and profile persistence. Browser checked desktop and 390px mobile layouts, audio playback with advancing time, likes, playlist creation and adding tracks, community/chart navigation and account dialog. This milestone improves presentation coverage; it is not a claim that 40% of the full research/backend scope is complete.

## 2026-11-17 — Database-backed catalog

Handoff check: local `main` and `origin/main` were the same commit (`ab4fd0e`) and every tracked source/doc file on the development machine matched it byte for byte, so there was no uncommitted work. README and STEPS were behind the code (account screens/profile editing already existed); both are corrected.

### Implemented

- Migration `202611170001_catalog`: adds a unique `Track.slug` with a format CHECK (`Track_slug_format`) and makes `Track.uploaderId` optional so platform-curated tracks need no fake uploader account. Existing rows would be back-filled with their UUID as slug. Uploader deletion is still restricted.
- Repeatable seed (`npm run db:seed`): the eight original studies, one artist with a fixed ID, four genres. One transaction; rows matched by ID/name/slug, so re-seeding keeps track UUIDs stable and never deletes other data. Demo tracks are REAL catalog entries (see ARCHITECTURE.md for why synthesized audio is not SYNTHETIC data).
- Public read-only endpoints `GET /api/catalog/tracks`, `/tracks/:ref`, `/genres` with strict, bounded query validation, REAL-only filtering and an explicit public projection (no uploader, rights text or origin). Contract in ARCHITECTURE.md.
- Frontend loads tracks from the API (`useCatalog`), with honest loading, error-with-retry and empty-catalog states; the player starts empty and is primed when the catalog arrives. Editorial mixes reference slugs. Genre tabs derive from catalog genres (now alphabetical). Visual design unchanged.
- Browser-stored preview likes/playlists that used the old IDs (`study-0` …) are converted to database UUIDs when the catalog loads; unknown IDs are kept, duplicates removed. Library storage itself is still browser-local.

### Checked first in a cloud workspace (before local verification)

| Check | Result |
| --- | --- |
| All three migrations applied in order to a fresh PostgreSQL 16 server | Passed |
| Slug uniqueness, format CHECK (rejects `Bad Slug`, `-a`, `a--b`), NOT NULL; null uploader accepted; UUID-text slug accepted | Passed |
| Catalog migration on a database that already contains a track | Back-fill passed; uploader deletion still restricted |
| Catalog contract tests (query validation, track references, URL mapping, projection, demo assets incl. WAV-header durations = 24 000 ms) | 6/6 passed |
| Frontend catalog-logic tests (legacy-ID migration, API mapping) | 3/3 passed with Node 24 |
| Strict TypeScript check of the dependency-free catalog modules | Passed |

### Verified on the development machine (Node 24, PostgreSQL 17 via Docker)

| Check | Result |
| --- | --- |
| `npm run db:generate` | Passed |
| `npm run typecheck` (both apps) | Passed |
| `npm test` | 33 API tests and 3 frontend tests passed |
| `npm run build` (both apps) | Passed |
| `npm run db:migrate` | All 3 migrations applied; none pending |
| `npm run db:seed`, repeated | Passed: 8 tracks, 0 created, 8 updated (idempotent) |
| `npm run test:db -w apps/api` | 3/3 passed: catalog (repeatable seed, REAL-only API, search, detail, genres), schema/constraints, login lifecycle |
| Browser checklist before commit | Track list loads from the API, Play the mix plays with advancing time, search "night" finds Night Drive, earlier library items remain |

Not covered: the loading/error/empty states were implemented but not exercised in a browser with the API stopped; mobile layout was not re-inspected for this step (no layout changes were made).

### Next

Account-backed likes and playlists (step 2 of the agreed order), including server-side import of these browser-local collections after sign-in.

## 2026-11-17 — Account-backed likes and playlists

### Implemented

- `/api/library` (contract in ARCHITECTURE.md): read library; like/unlike; create/delete playlists; add/remove playlist tracks; one-time import of a browser collection. Session required on every route; ownership from the session only; other users' playlists return 404; exact-origin checks and JSON-only bodies on mutations; strict UUID/title/size validation; limits of 200 playlists and 500 tracks per playlist; row locks for safe concurrent additions.
- Migration `202611170002_library`: `Playlist_title_not_blank` CHECK. Likes/playlists tables were already in the initial schema.
- Frontend `useLibrary`: guests keep the browser-only library; signed-in users load from the API with loading and error-with-retry states, optimistic updates that re-sync from the server on failure, wording that says where music is saved, and a new "Delete this playlist" action (with confirmation).
- Existing preview collections are not silently lost: the collection stored in this browser for the signed-in account is imported once and cleared only after the server confirms. The guest collection stays in guest mode (see ARCHITECTURE.md for why). Joined communities remain browser-local.

### Checked in the cloud workspace

| Check | Result |
| --- | --- |
| All four migrations on a fresh PostgreSQL 16; blank title rejected; `FOR NO KEY UPDATE` lock followed by playlist insert in the same transaction | Passed |
| Library contract tests (titles, creation body, UUIDs, import bounds) | 4/4 passed (plus 6 catalog contract tests) |
| Frontend logic tests (legacy IDs, API mapping, import titles and bounds) | 5/5 passed |

### Verified on the development machine

The first local run found one TypeScript error (Express 5 types route parameters as `string | string[]`); fixed with a typed parameter helper in the library router. Then:

| Check | Result |
| --- | --- |
| `npm run db:migrate` | `202611170002_library` applied |
| `npm run typecheck`, `npm run build` | Passed |
| `npm test` | 41 API tests and 5 frontend tests passed |
| `npm run test:db -w apps/api` | 4/4 passed, including `library.integration.mjs` (two accounts, isolation, persistence across a new API instance, idempotency, import, concurrent additions, deletion) |
| Browser journey before commit | Sign in → like → create playlist → add track → reload → content remains; sign out shows the separate guest library |

Not covered: the library loading/error states and a failed import were not exercised in a browser; the 200-playlist and 500-track limits are tested only at the API layer.

## 2026-11-17 — Track pages and qualified listening history

### Implemented

- Listening policy `listen-v1` as pure, unit-tested functions (formal definition in MATHEMATICS.md section 0): credit only for real-time-bounded media progress while playing; pauses, seeks and faster-than-real-time claims earn nothing; unique timeline coverage for completion; qualification at min(30 s, 50%); 30-minute per-user/track cooldown; sequence-based retry safety.
- Migration `202611170003_listening`: `PlaybackSession` table (partial progress, CHECKs, cascades), `ListeningEvent.policyVersion`, index for cooldown/history lookups.
- `/api/listening`: start session, heartbeats, end, personal history, public per-track stats with the 10-listener threshold (contract in ARCHITECTURE.md). Row locks make retries and parallel heartbeats safe; user-level lock prevents two sessions from both passing the cooldown.
- Frontend: `useListening` reports playback for signed-in users (never guests or local files); track detail page at `#track/<slug>` (play, like, add, your counted listens, audience numbers or "< 10", plain-language counting rules); Your library → Recently played; playlists now display in their saved order (previously catalog order).

### Checked in the cloud workspace

| Check | Result |
| --- | --- |
| All five migrations on a fresh PostgreSQL 16; new table, CHECKs, FKs and indexes present | Passed |
| Listening policy tests (threshold, continuous play, pause, seek forward/back, seek to end, faster-than-real-time, jitter tolerance, delayed-heartbeat cap, retries, clamping, interval merging, cooldown boundary, request validation) | 14/14 passed |
| All other pure tests (catalog, library contracts) | 10/10 passed |

### Verified on the development machine (first run, no fixes needed)

| Check | Result |
| --- | --- |
| `npm run db:generate`, `npm run db:migrate` | `202611170003_listening` applied |
| `npm run typecheck`, `npm run build` | Passed |
| `npm test` | 59 API tests and 5 frontend tests passed |
| `npm run test:db -w apps/api` | 5/5 passed, including `listening.integration.mjs` (qualification at 12 s, retry, event fields and policy version, end idempotency, isolation, cooldown not-counted then counted after 31 min, pause, seek to end, five parallel identical heartbeats credited once, synthetic-account refusal, history, stats threshold) |
| Browser journey before commit | Signed-in play ≥ 15 s appears in Recently played; track page shows 1 counted listen; immediate replay stays at 1 |

Not covered: heartbeat behaviour in a background tab and the "< 10 listeners" display with 10 or more real listeners were not exercised in a browser; the browser tracker (`useListening`) has no automated test.

## 2026-11-17 — Music Pulse: regional distributions, trends and evaluation

### Implemented

- Pure formulas (`analytics/math.ts`): complete adjacent UTC weeks, per-user/track/day cap of 3, fractional genre distribution with uncategorized count, total variation distance, tie-averaged percentile ranks, trend score with eligibility (U1 ≥ 20), smoothing, shrinkage, new-entry handling and renormalized weights (playlist signal omitted), 7-day moving average.
- `computePulse`: one origin per call; suppression before ranking (whole cohort < 10 → no numbers; per-day, previous-week, popularity and region rows < 10 hidden individually); region comparison by TV distance.
- Deterministic generator `synthetic-v1` (seed 20261117, reference 2026-11-16, 600 users in 5 regions, 36 tracks, 8 weeks; planted breakouts, steady hits, one-day spike, tiny-denominator track, weekend seasonality, known regional preferences) and in-memory evaluation → docs/EVALUATION-PULSE.md.
- Migration `202611170004_pulse` (`SyntheticDataset` provenance). `npm run db:synthetic` writes the dataset in one transaction, replacing only its own rows. Regions (AM, DE, US, FR, JP) seeded by `npm run db:seed`.
- `/api/pulse` (public aggregates) and `/api/location` (choose with explicit consent, withdraw → past event regions cleared). Contract in ARCHITECTURE.md.
- Music Pulse page rewired to the API (same design): Synthetic demonstration / Our platform switch, region filter, honest suppression message, daily chart, genre shares, trending table with components and formula, popularity list, region distances. Profile: country sharing with consent and withdrawal; outdated "stays in this browser" text corrected.
- Live tests now run one file at a time (`--test-concurrency=1`) because the Pulse test regenerates the synthetic dataset.

### Evaluation results (synthetic, in memory; full tables in EVALUATION-PULSE.md)

Trend score precision@3 = 1.00 against the planted breakouts, versus 0.67 for raw growth (which ranks the one-day spike first) and 0.33 for current popularity; the spike reaches rank 4 and is never in the top 3 on any of the last 15 days; the tiny-denominator track is never eligible; precision@3 stays 1.00 across growth weights 0.40–0.70 and thresholds 10–40; detection by the window ending 2026-11-08 (2 of 3 breakouts in the top 3). Regional estimates are within TV 0.03–0.08 of the planted preferences. Estimated between-region distances (mean 0.244) are smaller than planted (0.300); regenerating without replays and excluding the spike gives 0.299, showing the estimator is sound and the gap comes from simulated behaviour (demand ≠ preference).

### Checked in the cloud workspace

| Check | Result |
| --- | --- |
| All six migrations on a fresh PostgreSQL 16; reference-date midnight CHECK | Passed |
| Pulse formula tests (windows, cap, distribution, TV, percentiles, hand-worked trend score, playlist renormalization, moving average) | 8/8 passed |
| Generator determinism, planted structure, suppression, region filtering, evaluation assertions | 5/5 passed |
| All other pure tests (listening policy, catalog/library contracts) | 24/24 passed |
| `npm run pulse:evaluate` equivalent (writes EVALUATION-PULSE.md) | Ran in 1.6 s |

### Verified on the development machine

The first local run found one error in the new live test itself (it called `login` with positional arguments instead of `{ email, password }`); fixed. Then:

| Check | Result |
| --- | --- |
| `npm run db:generate`, `npm run db:migrate` | `202611170004_pulse` applied |
| `npm run db:seed` | Demo catalog and regions ready |
| `npm run db:synthetic` | synthetic-v1, seed 20261117: 600 users, 36 tracks, 34 712 events, 2 208 likes |
| `npm run typecheck`, `npm run build` | Passed |
| `npm test` | 75 API tests and 5 frontend tests passed |
| `npm run test:db -w apps/api` | 6/6 passed, including `pulse.integration.mjs`: API numbers from PostgreSQL equal the in-memory computation for the same seed (all regions and Germany), real data untouched, synthetic accounts cannot sign in, consent choose/move/withdraw clears past event regions, region-without-consent rejected by the database |
| Browser check before commit | Music Pulse synthetic view (breakouts lead trending, regions change the genre mix), Our platform shows the suppression message, Profile country sharing and withdrawal |

Not covered: mobile layout of the new Pulse table was not inspected; Pulse performance was not measured beyond the demonstration volume.

## 2026-11-17 — Song recommendations and chronological evaluation

### Implemented

- `recommend/model.ts` (pure): taste vectors with fractional genre allocation and the daily cap, cosine similarity, up to k positive neighbours, `score(u,t) = Σ sim·I / Σ sim`, deterministic ties (score, training listeners, track ID), known-track exclusion, popularity baseline and fallback, optional popularity fill.
- `recommend/evaluate.ts` (pure): one global chronological 70/10/20 split; everything fitted on training only; neighbour count (5/10/20/40) and fill chosen on validation by NDCG@10; test reported once; Precision@10 (denominator 10), Recall@10, NDCG@10, user/catalog coverage, personalised share, cold-start count, paired user bootstrap. `npm run recommend:evaluate` writes docs/EVALUATION-RECOMMENDATIONS.md.
- `GET /api/recommendations` (REAL data only, 180-day history, liked and heard tracks excluded, at least 5 similar listeners for personal picks, qualitative explanations). Discover → For you section; plays from it are recorded with source `RECOMMENDATION`.

### Evaluation results (synthetic; full tables in EVALUATION-RECOMMENDATIONS.md)

Validation chose k = 40 without fill (k = 20 is within 0.003 NDCG). On the test period (563 users): cosine neighbours NDCG@10 0.419, Precision@10 0.171, Recall@10 0.590 versus popularity 0.320, 0.139, 0.473. Paired bootstrap 95% intervals for the differences are all above zero (NDCG +0.099 [0.080, 0.120]). No cold-start users exist in this dataset (all synthetic users are active from week one); the fallback is covered by unit tests. Caveats recorded in the report: genre-planted data favours genre-based neighbours; the 36-track catalogue makes recall high for both methods.

### Checked in the cloud workspace

| Check | Result |
| --- | --- |
| Recommendation tests (MATHEMATICS.md cosine example, zero vectors, fractional allocation and cap, neighbour selection, hand-worked scores, tie-breaks, fallbacks, privacy minimum, fill, hand-worked P/R/NDCG, split ordering, bootstrap determinism, evaluation outcome) | 11/11 passed |
| All other pure tests | 37/37 passed |

### Verified on the development machine

| Check | Result |
| --- | --- |
| `npm run typecheck`, `npm run build` | Passed |
| `npm test` | 87 API tests and 5 frontend tests passed |
| `npm run test:db -w apps/api` | 7/7 passed, including `recommend.integration.mjs` (six similar real fixture listeners → personal picks led by their shared tracks; heard and liked tracks excluded; synthetic tracks never recommended; a new account gets non-personal picks) |

Browser finding and fix: the developer account had already heard all 8 demo tracks, so the recommendation list was empty and the first version hid the For you section silently. The section now always appears for signed-in users with explicit loading, error-with-retry and "you've heard everything we could suggest" states (explaining the 180-day/liked exclusion and the catalog size). Checked in the browser after the fix; the typecheck is re-run as part of the commit command.

Not covered: personal ("similar listeners") picks were only exercised by the live test, because the development database has a single real listener; real-data recommendation quality cannot be measured until there are real users.
