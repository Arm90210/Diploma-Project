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

## 2026-11-17 — Database-backed catalog (implemented; full local verification pending)

Handoff check: local `main` and `origin/main` were the same commit (`ab4fd0e`) and every tracked source/doc file on the development machine matched it byte for byte, so there was no uncommitted work. README and STEPS were behind the code (account screens/profile editing already existed); both are corrected.

### Implemented

- Migration `202611170001_catalog`: adds a unique `Track.slug` with a format CHECK (`Track_slug_format`) and makes `Track.uploaderId` optional so platform-curated tracks need no fake uploader account. Existing rows would be back-filled with their UUID as slug. Uploader deletion is still restricted.
- Repeatable seed (`npm run db:seed`): the eight original studies, one artist with a fixed ID, four genres. One transaction; rows matched by ID/name/slug, so re-seeding keeps track UUIDs stable and never deletes other data. Demo tracks are REAL catalog entries (see ARCHITECTURE.md for why synthesized audio is not SYNTHETIC data).
- Public read-only endpoints `GET /api/catalog/tracks`, `/tracks/:ref`, `/genres` with strict, bounded query validation, REAL-only filtering and an explicit public projection (no uploader, rights text or origin). Contract in ARCHITECTURE.md.
- Frontend loads tracks from the API (`useCatalog`), with honest loading, error-with-retry and empty-catalog states; the player starts empty and is primed when the catalog arrives. Editorial mixes reference slugs. Genre tabs derive from catalog genres (now alphabetical). Visual design unchanged.
- Browser-stored preview likes/playlists that used the old IDs (`study-0` …) are converted to database UUIDs when the catalog loads; unknown IDs are kept, duplicates removed. Library storage itself is still browser-local.

### Verified in this session (cloud workspace; project dependencies could not be installed there)

| Check | Result |
| --- | --- |
| All three migrations applied in order to a fresh PostgreSQL 16 server | Passed |
| Slug uniqueness, format CHECK (rejects `Bad Slug`, `-a`, `a--b`), NOT NULL; null uploader accepted; UUID-text slug accepted | Passed |
| Catalog migration on a database that already contains a track | Back-fill passed; uploader deletion still restricted |
| Catalog contract tests (query validation, track references, URL mapping, projection, demo assets incl. WAV-header durations = 24 000 ms) | 6/6 passed |
| Frontend catalog-logic tests (legacy-ID migration, API mapping) | 3/3 passed with Node 24 |
| Strict TypeScript check of the dependency-free catalog modules | Passed |

### Not yet verified — run on the development machine

The machine's own shell was unavailable (insufficient free disk space for the sandbox), and the cloud workspace could not install npm packages. Therefore the full `npm run typecheck`, `npm run build`, the HTTP tests in `test/catalog.test.ts`, `npm run test:db` (including the new `catalog.integration.mjs` and the updated `database.integration.mjs`), Prisma client generation and browser playback **have not been run yet** for this step. Do not mark the step complete until they pass.

### Next

Run the checks above; then account-backed likes and playlists (step 2 of the agreed order), including server-side import of these browser-local collections after sign-in.
