# MusicSphere — Music Preference and Demand Dynamics Analysis System

Bachelor's diploma in Applied Mathematics.

**Official title:** «Երաժշտական նախասիրությունների և պահանջարկի դինամիկայի վերլուծության համակարգի մշակում»

MusicSphere is the working product name: music streaming and social discovery through people and communities. Implemented so far: the foundation, database-backed accounts and sessions (register, log in, sign out, edit display name), a responsive MusicSphere interface with a working audio player, a **database-backed music catalog** served by `/api/catalog` (seeded with eight original demo studies), **account-backed likes and playlists** (`/api/library`; guests keep a browser-only library), **track pages with qualified listening history** (`/api/listening`, policy `listen-v1`), **personal recommendations** (`/api/recommendations`; cosine neighbours vs. popularity, evaluated chronologically in [EVALUATION-RECOMMENDATIONS.md](docs/EVALUATION-RECOMMENDATIONS.md)), and **Music Pulse** (`/api/pulse`): regional genre distributions, total-variation comparisons and the explainable trend score over real data (with privacy suppression) or a clearly labelled deterministic synthetic demonstration (`npm run db:synthetic`), evaluated in [EVALUATION-PULSE.md](docs/EVALUATION-PULSE.md). Still preview-only (browser-local or illustrative): community membership and posts. Not yet implemented: uploads, listening-event collection, friends, recommendations and real analytics. See [PROGRESS.md](docs/PROGRESS.md) for exactly what is verified.

## Start locally

Use **Node.js 24 with its bundled npm 11**, and Docker with the Compose plugin. `.nvmrc` selects Node 24. With an existing nvm installation, activate it before running project commands:

```sh
source ~/.nvm/nvm.sh
nvm install
nvm use
```

This changes the active shell's runtime; a new terminal may need `nvm use` again. Do not combine the system Node 20 executable with npm 12.

Run these commands from the repository root:

```sh
npm ci
cp apps/api/.env.example apps/api/.env
# Skip the copy if you have already configured .env.
docker compose up -d --wait db
npm run db:generate
npm run db:migrate
npm run db:seed     # original demo catalog; safe to repeat
npm run db:synthetic # synthetic demonstration data for Music Pulse; safe to repeat
npm run dev
```

Open <http://localhost:5173>. The API listens on <http://localhost:3001>. Prisma commands run in `apps/api`, where they load `.env`. The local example credentials are for development only. If PostgreSQL is already installed, create a development database and change `DATABASE_URL` instead of using Docker. Do not expose this development database publicly.

The frontend and health endpoint work without PostgreSQL; the database card will show unavailable. Readiness reports connectivity only, not whether migrations have been applied. If API startup fails, inspect the terminal; if the API works but PostgreSQL is unavailable, verify the container and connection URL. If port 5432 is occupied, use your existing local server or adjust both the Compose port and URL.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Run Vite and Express together; stop both with Ctrl+C |
| `npm run typecheck` | Check both TypeScript apps |
| `npm run build` | Compile API and build frontend into their respective `dist` folders |
| `npm run test:db -w apps/api` | Build API and verify PostgreSQL constraints, login lifecycle, catalog, library ownership/persistence and listening rules; fixtures are rolled back or cleaned up (the demo catalog itself is seeded) |
| `npm test` | API HTTP/unit tests (health, auth, profile, catalog, library, listening policy and API) and frontend logic tests; no database needed |
| `npm run db:validate` | Validate Prisma schema (requires `.env`, not a live database) |
| `npm run db:generate` | Generate typed Prisma client after schema edits |
| `npm run db:migrate` | Apply committed migrations to PostgreSQL |
| `npm run db:seed` | Insert or update the eight original demo tracks and the country list (matched by slug/code; never deletes other data) |
| `npm run db:synthetic` | Generate the deterministic synthetic demonstration dataset (replaces only the generator's own SYNTHETIC rows) |
| `npm run pulse:evaluate` | Re-run the Music Pulse evaluation in memory and rewrite docs/EVALUATION-PULSE.md |
| `npm run recommend:evaluate` | Re-run the chronological recommendation evaluation in memory and rewrite docs/EVALUATION-RECOMMENDATIONS.md |
| `npm exec -w apps/api -- prisma migrate dev --name descriptive_name` | Create a migration after changing the schema, with a local database running |
| `docker compose stop` | Stop database, preserve stored data |

Production deployment is a later phase. `npm run start -w apps/api` runs the compiled API. `npm run preview -w apps/web` previews the frontend build locally, but does **not** proxy API requests; integrated development uses `npm run dev`. A production reverse proxy will serve the frontend and route `/api` to Express under one origin.

## Understand the files

```text
apps/
  web/                     React + TypeScript + Vite + Tailwind
    src/App.tsx            MusicSphere interface (pages, library, communities)
    src/lib/useCatalog.ts  Loads tracks from /api/catalog
    src/lib/useLibrary.ts  Guest (browser) or account (API) library
    src/lib/useListening.ts Reports playback heartbeats for signed-in users
    src/styles.css         Responsive layout and theme
    vite.config.ts         /api development proxy
  api/                     Express + TypeScript
    src/app.ts             HTTP app; database checker injected for tests
    src/server.ts          Listen on a port, connect Prisma, stop cleanly
    src/db.ts              Shared Prisma client / connection pool
    src/modules/catalog/   Catalog API, validation, demo seed data
    src/modules/library/   Signed-in likes/playlists API and browser-library import
    src/modules/listening/ Playback sessions, heartbeats, qualification policy, history
    src/modules/analytics/ Music Pulse formulas, aggregation, synthetic generator, evaluation
    src/modules/location/  Optional country choice with consent and withdrawal
    src/modules/recommend/ Taste vectors, cosine neighbours, popularity baseline, evaluation
    src/seed.ts            `npm run db:seed` entry point
    prisma/schema.prisma   Relational data model
    prisma/migrations/     Versioned SQL, including database constraints
    test/app.test.ts       HTTP integration tests
compose.yaml               Local PostgreSQL with persistent storage
docs/                      Scope, architecture, mathematics, progress
```

The browser sends `fetch('/api/...')`. Vite forwards that request to Express in development. Express validates inputs and applies authorization before using Prisma; Prisma translates queries into PostgreSQL operations. Express returns JSON, which React displays. The browser never receives database credentials or queries PostgreSQL directly. Health/readiness, authentication, profile and read-only catalog endpoints exist. Upload storage and audio range responses arrive in Phase 2.

We use one repository and one database, without microservices, Redis, or a separate Python service. Mathematical functions can be ordinary tested TypeScript modules. Prisma 7.10.1, its client and PostgreSQL adapter are pinned together. `apps/api/prisma.config.ts` configures CLI migrations; `src/db.ts` configures the runtime connection pool. Tailwind uses its Vite integration. Recharts is deferred until there is real analytics data to plot.

## Project documents

Start with the [step-by-step build checklist](docs/STEPS.md). Phase 1 is verified locally; accounts and the interface milestone followed. Catalog, account library, track pages, qualified listening history, Music Pulse and recommendations are done; next are real communities and diploma readiness.

- [Communities, friends, discovery and Community Pulse](docs/COMMUNITIES.md)
- [Authentication API and session contract](docs/AUTHENTICATION.md)
- [Scope, phases, acceptance criteria](docs/ROADMAP.md)
- [Database design and architecture](docs/ARCHITECTURE.md)
- [Mathematical models and evaluation plan](docs/MATHEMATICS.md)
- [Progress and verification results](docs/PROGRESS.md)

Only self-created or authorized music is allowed. All future statistics describe **this platform**, not Spotify or the wider population. Synthetic datasets must be separately labeled and filtered. Regional analytics require explicit consent, coarse regions, and suppression of small cohorts. These are design requirements; their runtime enforcement will be implemented and tested in the relevant phases.

## Implementation references

- [Vite setup and runtime requirements](https://vite.dev/guide/)
- [Tailwind's Vite integration](https://tailwindcss.com/docs/installation/using-vite)
- [Prisma 7 upgrade guide](https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7)

PostgreSQL is now running locally and the initial migration and live database checks have passed. Desktop browser verification passed, including connection refresh and section navigation; mobile checks remain later work. See the progress log for exact results. If your account lacks Docker socket access, prefix the Compose startup command with `sudo`; Prisma commands run without sudo.
