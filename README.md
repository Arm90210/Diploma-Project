# Resonance — Music Preference and Demand Dynamics Analysis System

Bachelor's diploma in Applied Mathematics.

**Official title:** «Երաժշտական նախասիրությունների և պահանջարկի դինամիկայի վերլուծության համակարգի մշակում»

Resonance is a working name. This repository currently contains **Phase 1 foundations**, not a finished streaming service. There are no accounts, uploads, audio playback, recommendations, or analytics endpoints yet. The homepage shows actual connection checks and a roadmap; it contains no fabricated music statistics.

## Start locally

Recommended: **Node.js 24 LTS with its bundled npm**, and Docker with the Compose plugin. `.nvmrc` records Node 24 for users of nvm. The installed Node 20.20.2 can compile this foundation, but the workspace's npm 12 warns that this Node version is unsupported. Use a compatible Node/npm pair for ongoing development.

Run these commands from the repository root:

```sh
npm ci
cp apps/api/.env.example apps/api/.env
# Skip the copy if you have already configured .env.
docker compose up -d --wait db
npm run db:generate
npm run db:migrate
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
| `npm test` | Test API liveness, readiness failure/success, and HTTP errors |
| `npm run db:validate` | Validate Prisma schema (requires `.env`, not a live database) |
| `npm run db:generate` | Generate typed Prisma client after schema edits |
| `npm run db:migrate` | Apply committed migrations to PostgreSQL |
| `npm exec -w apps/api -- prisma migrate dev --name descriptive_name` | Create a migration after changing the schema, with a local database running |
| `docker compose stop` | Stop database, preserve stored data |

Production deployment is a later phase. `npm run start -w apps/api` runs the compiled API. `npm run preview -w apps/web` previews the frontend build locally, but does **not** proxy API requests; integrated development uses `npm run dev`. A production reverse proxy will serve the frontend and route `/api` to Express under one origin.

## Understand the files

```text
apps/
  web/                     React + TypeScript + Vite + Tailwind
    src/App.tsx            Foundation screen and connection checks
    src/styles.css         Responsive layout and theme
    vite.config.ts         /api development proxy
  api/                     Express + TypeScript
    src/app.ts             HTTP app; database checker injected for tests
    src/server.ts          Listen on a port, connect Prisma, stop cleanly
    src/db.ts              Shared Prisma client / connection pool
    prisma/schema.prisma   Relational data model
    prisma/migrations/     Versioned SQL, including database constraints
    test/app.test.ts       HTTP integration tests
compose.yaml               Local PostgreSQL with persistent storage
docs/                      Scope, architecture, mathematics, progress
```

The browser sends `fetch('/api/...')`. Vite forwards that request to Express in development. Express validates inputs and applies authorization before using Prisma; Prisma translates queries into PostgreSQL operations. Express returns JSON, which React displays. The browser never receives database credentials or queries PostgreSQL directly. Currently only health/readiness endpoints exist. Upload storage and audio range responses arrive in Phase 2.

We use one repository and one database, without microservices, Redis, or a separate Python service. Mathematical functions can be ordinary tested TypeScript modules. Prisma 6.19 is deliberately pinned with its matching client for a simple, established configuration; upgrades are explicit later work. Tailwind uses its Vite integration. Recharts is deferred until there is real analytics data to plot.

## Project documents

- [Scope, phases, acceptance criteria](docs/ROADMAP.md)
- [Database design and architecture](docs/ARCHITECTURE.md)
- [Mathematical models and evaluation plan](docs/MATHEMATICS.md)
- [Progress and verification results](docs/PROGRESS.md)

Only self-created or authorized music is allowed. All future statistics describe **this platform**, not Spotify or the wider population. Synthetic datasets must be separately labeled and filtered. Regional analytics require explicit consent, coarse regions, and suppression of small cohorts. These are design requirements; their runtime enforcement will be implemented and tested in the relevant phases.

## Implementation references

- [Vite setup and runtime requirements](https://vite.dev/guide/)
- [Tailwind's Vite integration](https://tailwindcss.com/docs/installation/using-vite)
- [Prisma 6 schema reference](https://www.prisma.io/docs/orm/v6/reference/prisma-schema-reference)

The last verification run could not inspect the UI in a browser or apply the migration: browser session access failed, and PostgreSQL/Docker are absent on this machine. See the progress log for exact results and dependency advisory status. The tested development servers can run while the database is unavailable.
