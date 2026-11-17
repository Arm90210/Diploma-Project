# MusicSphere — Music Preference and Demand Dynamics Analysis System

Bachelor's diploma in Applied Mathematics.

**Official title:** «Երաժշտական նախասիրությունների և պահանջարկի դինամիկայի վերլուծության համակարգի մշակում»

MusicSphere is a music streaming web application that records **qualified listens** and analyses them mathematically: how genre preferences differ between countries, which tracks are genuinely trending, and what each listener might like next. Every model is implemented as tested code and evaluated reproducibly on synthetic data with planted, known patterns.

## Features

| Area | What works |
| --- | --- |
| Accounts | Register, sign in/out, edit display name; hashed passwords, secure session cookies, rate limits |
| Catalog and player | Eight original demo tracks from PostgreSQL; search, genre filter, track pages; player with queue, shuffle, repeat and seeking |
| Library | Likes and playlists saved to your account (guests: in the browser only) |
| Listening data | A listen counts only after real playback (rule `listen-v1`: ≥ 30 s or half the track; pauses and skipping ahead earn nothing; a replay counts again after 30 min); listening history |
| Music Pulse | Interactive world map of 236 countries; genre shares per country and total-variation comparisons; daily listeners; explainable trend score; any group under 10 listeners is hidden |
| Recommendations | "For you" from listeners with similar genre taste (cosine similarity), with popularity as fallback |
| Privacy | Country shared only with explicit consent; withdrawing removes it from past listens; real and synthetic data never mixed |

## Results (synthetic evaluation)

Measured on the deterministic dataset `synthetic-v2` (seed 20261117): 908 listeners in 17 countries, 52 126 counted listens, with planted breakouts, a one-day spike, a tiny-audience track and country-level tastes.

| Question | Result | Report |
| --- | --- | --- |
| Does the trend score find the planted breakout tracks? | Precision@3 = **1.00**, versus 0.33 for raw growth (fooled by the tiny-audience track) and 0.33 for popularity (fooled by the one-day spike) | [EVALUATION-PULSE.md](docs/EVALUATION-PULSE.md) |
| Are country taste differences recovered? | Estimated vs. planted between-country distances correlate **0.905** (136 pairs); smaller countries are noisier | [EVALUATION-PULSE.md](docs/EVALUATION-PULSE.md) |
| Do recommendations beat popularity? | Chronological 70/10/20 split, 850 test users: NDCG@10 **0.409** vs. 0.294, Precision@10 0.162 vs. 0.125, Recall@10 0.571 vs. 0.445; NDCG difference 95% interval [0.095, 0.133] | [EVALUATION-RECOMMENDATIONS.md](docs/EVALUATION-RECOMMENDATIONS.md) |

These show that the methods recover patterns deliberately built into simple synthetic data; they are not measurements of real listener behaviour. The formulas and their limitations are in [MATHEMATICS.md](docs/MATHEMATICS.md).

## Real, synthetic and preview

| Real (PostgreSQL) | Synthetic (labelled "Synthetic demonstration") | Browser-only | Preview / not built yet |
| --- | --- | --- | --- |
| Accounts, catalog, likes and playlists, counted listens, history, country consent, recommendations, Music Pulse "Our platform" | Music Pulse demonstration data and both evaluations (`npm run db:synthetic`) | Guest library, joined communities, opened local audio files | Communities (cards, member counts and posts are illustrative), friends, track uploads, ratings, public playlists |

With few real users, "Our platform" honestly shows "not enough listeners" — that is the privacy threshold working, not an error.

## Start locally

Use **Node.js 24 with its bundled npm 11**, and Docker with the Compose plugin. `.nvmrc` selects Node 24:

```sh
source ~/.nvm/nvm.sh
nvm install
nvm use
```

A new terminal may need `nvm use` again. Do not combine the system Node 20 executable with npm 12. Then, from the repository root:

```sh
npm ci
cp apps/api/.env.example apps/api/.env   # skip if .env is already configured
docker compose up -d --wait db           # prefix with sudo if your account lacks Docker access
npm run db:generate
npm run db:migrate
npm run db:seed        # demo tracks and the 236 countries; safe to repeat
npm run db:synthetic   # synthetic demonstration data; safe to repeat
npm run dev
```

Open <http://127.0.0.1:5173>; the API listens on <http://127.0.0.1:3001>. A guided walkthrough is in [DEMO.md](docs/DEMO.md).

Prisma commands run in `apps/api`, where they load `.env`; the example credentials are for local development only and the database must not be exposed publicly. If PostgreSQL is already installed, create a development database and change `DATABASE_URL` instead of using Docker; if port 5432 is taken, adjust both the Compose port and the URL. If the dev server reports "Port 5173 is already in use", an earlier dev server is still running — stop it first.

## Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Run the web app and API together; stop both with Ctrl+C |
| `npm run typecheck` | Check both TypeScript apps |
| `npm test` | Unit and HTTP tests (no database needed) |
| `npm run build` | Compile the API and build the web app |
| `npm run test:db -w apps/api` | Live PostgreSQL tests: constraints, sessions, catalog, library ownership, listening rules, Music Pulse round trip and consent, recommendations (fixtures are cleaned up; the demo catalog and synthetic dataset are (re)written) |
| `npm run db:generate` / `db:validate` / `db:migrate` | Prisma client, schema check, apply migrations |
| `npm run db:seed` | Insert or update demo tracks and countries (never deletes other data) |
| `npm run db:synthetic` | Regenerate the synthetic dataset (replaces only the generator's own rows) |
| `npm run pulse:evaluate` | Re-run the Music Pulse evaluation in memory → `docs/EVALUATION-PULSE.md` |
| `npm run recommend:evaluate` | Re-run the recommendation evaluation in memory → `docs/EVALUATION-RECOMMENDATIONS.md` |
| `python3 scripts/build-world-map.py <ne_50m_admin_0_countries.geojson>` | Rebuild the map and country list from Natural Earth (only to change map data) |
| `npm exec -w apps/api -- prisma migrate dev --name descriptive_name` | Create a migration after changing the schema |
| `docker compose stop` | Stop the database, keeping its data |

Production deployment is a later phase. `npm run start -w apps/api` runs the compiled API; `npm run preview -w apps/web` previews the web build but does not proxy `/api`.

## How it fits together

```text
Browser (React)  ──/api/...──▶  API (Express)  ──Prisma──▶  PostgreSQL
```

During development Vite forwards `/api` requests to Express. Express validates input and checks the session before any database work; the browser never sees database credentials. One repository, one database, no microservices: the mathematics is ordinary, unit-tested TypeScript.

```text
apps/
  web/                         React 19 + TypeScript + Vite (custom CSS, Tailwind available)
    src/App.tsx                Pages: Discover, Library, Communities, Music Pulse, Profile, track pages
    src/components/            Player, TrackList, TrackPage, Pulse, WorldMap, Profile, RegionConsent, …
    src/lib/                   API client and hooks: useCatalog, useLibrary, useListening, usePlayer
    public/audio, public/art   Original demo audio and covers (scripts/generate-demo-assets.py)
    public/geo/countries.json  World map (Natural Earth, public domain; scripts/build-world-map.py)
    test/                      Frontend logic tests
  api/                         Express 5 + TypeScript + Prisma 7
    src/modules/auth, users    Accounts, sessions, profile
    src/modules/catalog        Catalog API and demo seed
    src/modules/library        Likes and playlists
    src/modules/listening      Playback sessions, heartbeats, listen-v1 policy, history
    src/modules/analytics      Music Pulse formulas, aggregation, synthetic generator, evaluation, countries
    src/modules/location       Country choice with consent and withdrawal
    src/modules/recommend      Taste vectors, cosine neighbours, popularity baseline, evaluation
    prisma/                    Schema and versioned SQL migrations (with database constraints)
    test/                      *.test.ts (no database) and *.integration.mjs (live PostgreSQL)
scripts/                       Demo-asset and world-map generators
docs/                          Design, mathematics, evaluation and progress documents
compose.yaml                   Local PostgreSQL with persistent storage
```

## Documents

- [STEPS.md](docs/STEPS.md) — build checklist, phase by phase
- [PROGRESS.md](docs/PROGRESS.md) — dated log of what was built and exactly how it was verified
- [DEMO.md](docs/DEMO.md) — demonstration walkthrough
- [MATHEMATICS.md](docs/MATHEMATICS.md) — every formula, implementation choices and limitations
- [EVALUATION-PULSE.md](docs/EVALUATION-PULSE.md), [EVALUATION-RECOMMENDATIONS.md](docs/EVALUATION-RECOMMENDATIONS.md) — evaluation results
- [ARCHITECTURE.md](docs/ARCHITECTURE.md) — data model, API contracts, privacy rules
- [AUTHENTICATION.md](docs/AUTHENTICATION.md) — authentication and session contract
- [ROADMAP.md](docs/ROADMAP.md) — scope, phases, acceptance criteria
- [COMMUNITIES.md](docs/COMMUNITIES.md) — planned communities, friends and Community Pulse

## Principles

Only self-created or authorized music is allowed; the demo audio and covers are original, and the map data is public domain (Natural Earth). Statistics describe **this platform**, not Spotify or the wider population. Synthetic data is labelled and stored separately from real data. Regional analytics use only explicitly shared, country-level locations and hide any group smaller than 10 listeners — a project-level safeguard, not a claim of formal anonymity.
