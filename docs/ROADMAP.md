# Scope and practical roadmap

## MVP and final scope

The diploma MVP is a small, complete vertical slice: register/login, upload a permitted track with title/artist/genres/cover, browse/search a track catalog, play/pause/seek/skip with a queue, create playlists, like tracks, and see personal listening history. Qualified listening events then power a basic regional dashboard, an explainable trend ranking, and cosine-based recommendations compared with popularity. The mathematical slice is essential to the MVP; a polished streaming UI alone is insufficient.

Keep the first release focused: one primary artist per track, no album management, one entry per track in each playlist, authenticated uploads, and coarse manually selected regions. The database permits multi-genre tracks. Track search begins with bounded case-insensitive queries; full text search is justified only after measuring performance.

Final target adds public user profiles/playlists, follows, comments and 1–5 reviews, friend activity, artist analytics, regional/time filters, and a reliable demonstration with documentation. Album browsing can follow the core catalog. Collaborative playlists, external catalogs, automated location inference, complex forecasting, and advanced ML are optional extensions. External Spotify access is not required.

## Phases and completion gates

Work estimates are approximate focused development days, not deadlines; allow additional time for learning and supervisor feedback.

| Phase | Work | Completion gate | Estimate |
| --- | --- | --- | --- |
| 1 | Workspace, strict TypeScript, responsive shell, API health/readiness, initial schema/migration, docs | Typechecks, build, HTTP tests, schema validation; apply migration on available PostgreSQL | 2–3 days |
| 2a | Registration/login/logout, password hashing, session cookies, profile, account permissions | Session revocation, duplicate accounts, unauthenticated access and ownership tested | 3–5 days |
| 2b | Authorized uploads, validated audio/cover, track catalog/search, byte-range streaming, player/queue | Real permitted audio plays and seeks; invalid files rejected; upload/stream limits tested | 4–6 days |
| 3 | Playlists, ordering, likes, public sharing; later follows/comments/reviews | Ownership enforcement, uniqueness, reorder transaction, persistence verified | 3–5 days |
| 4 | Server-issued playback sessions, heartbeats, qualified listens, history/personal analytics, seeded generator | Pause/seek/retry/duplicate rules tested; deterministic synthetic data isolated | 4–6 days |
| 5 | Regional aggregates, suppression, charts and comparisons, trend score | Known synthetic trend recovered; low counts hidden; consent withdrawal tested | 4–6 days |
| 6 | Preference vectors, cosine neighbors, rankings, chronological evaluation | Reproducible comparison against popularity, limitations recorded | 4–6 days |
| 7 | Integration tests, query plans, UX/security checks, thesis diagrams, demo instructions | Clean setup on another machine and rehearsed end-to-end defense | 4–6 days |

Start each phase with a short explanation and acceptance criteria. Finish with tests, a runnable app, and an updated progress log. Do not implement every table or install every planned package ahead of its feature.

## Phase 2 design checkpoints

Use password hashing with a modern library and server-managed revocable sessions in HttpOnly cookies. Add the session table with that feature. Include secure cookies under HTTPS, SameSite policy, CSRF protection, login rate limits, canonicalized email/usernames, and ownership checks. Do not store bearer tokens in browser localStorage. Agree on any public deployment requirements before production setup.

Audio files live outside the public web root with generated storage keys, not user filenames. Validate file signatures and decoded duration, restrict size/types, record the rights declaration, and serve supported byte ranges. Original filenames and arbitrary filesystem paths never become download URLs. Add cover validation and cleanup of failed uploads.

## Demonstration plan

Demonstrate account creation, an authorized upload, playback, playlist creation, qualified history, and recommendations. Use a separate clearly marked synthetic mode for useful volumes of regional/trend data. Show the mathematical formulas alongside one worked example and measured baseline results. Never describe synthetic accuracy as proof of real-world user satisfaction.
