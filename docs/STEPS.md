# MusicSphere build checklist

Work through one numbered step at a time. Explain its purpose, implement it, run the relevant checks, and update PROGRESS.md before moving on. Each phase ends with a runnable demonstration and a Git checkpoint. The existing ROADMAP.md remains the detailed scope and estimate reference.

## Phase 1 — Finish the foundation (completed)

- [x] 1.1 Create frontend/API workspaces, initial schema, migration and project documents.
- [x] 1.2 Use a compatible Node/npm pair; investigate and resolve dependency advisories, then rebuild.
- [x] 1.3 Install/start local PostgreSQL using the existing Docker Compose configuration.
- [x] 1.4 Apply the initial migration; verify tables, constraints and database readiness against the real server.
- [x] 1.5 Inspect the homepage in a browser, check connections, and verify the setup instructions.

Done when: a clean setup starts both apps and the database; builds and HTTP tests pass; migrations apply; the homepage reports connected services. Do not mark the database complete from mocked readiness tests.

## Phase 2a — Accounts and profiles

- [x] 2a.1 Define account/session API contracts, validation and session migration.
- [x] 2a.2 Implement registration with password hashing and duplicate-account handling.
- [x] 2a.3 Implement login, revocable cookie sessions, current-user endpoint and logout.
- [x] 2a.4 Build registration/login screens and editable basic profile. (Interface milestone, 2026-11-16.)
- [ ] 2a.5 Test authorization, session expiry/revocation, CSRF protection and login limits.

Done when: register, log in, reload while signed in, edit your own profile and log out; another user's private data remains inaccessible.

## Phase 2b — Uploads, catalog and playback

- [ ] 2b.1 Validate permitted audio/cover uploads and store metadata plus rights declaration.
- [x] 2b.2 Build bounded catalog/search endpoints and track pages. (2026-11-17.)
- [ ] 2b.3 Serve audio with byte-range support and access checks.
- [ ] 2b.4 Build play/pause, seek, skip and queue controls.
- [ ] 2b.5 Test with authorized audio, invalid uploads, seek requests and failed-upload cleanup.

Done when: upload a real permitted track, find it and play/seek it in the browser.

## Phase 3 — Personal library

- [x] 3.1 Implement likes and saved-track views. (Account-backed, 2026-11-17.)
- [x] 3.2 Implement playlist creation, membership, ordering and deletion. (2026-11-17; reordering by drag is not offered yet — tracks keep insertion order.)
- [ ] 3.3 Add public/private visibility and shareable public playlist pages.
- [ ] 3.4 Add track ratings/reviews and test ownership and visibility.

Done when: a user's library persists after reload and private playlists cannot be read by other users.

## Phase 3b — Friends and communities

- [ ] 3b.1 Add follows, mutual-follow friends, blocking and profile visibility rules.
- [ ] 3b.2 Add public community creation, joining/leaving, roles and membership history.
- [ ] 3b.3 Add track-linked posts, replies and reactions.
- [ ] 3b.4 Add owner/moderator controls, reporting and posting limits.
- [ ] 3b.5 Add an activity feed respecting sharing settings and test all permission boundaries.

Done when: two accounts can connect, join a community and discuss music with working moderation. Private communities remain a later extension.

## Phase 4 — Reliable listening data

- [x] 4.1 Define and persist server-issued playback sessions and sequenced heartbeats. (2026-11-17.)
- [x] 4.2 Implement qualification, pause/seek handling, replay limits and duplicate prevention. (Policy listen-v1, 2026-11-17.)
- [ ] 4.3 Add consent controls, listening history and personal genre/artist statistics. Listening history done 2026-11-17; region consent controls and personal statistics pending.
- [ ] 4.4 Build deterministic synthetic data with a fixed seed/date, including social and membership histories.
- [ ] 4.5 Test time boundaries, retries, consent withdrawal and real/synthetic isolation.

Done when: playback produces trustworthy events; clicking play repeatedly cannot inflate streams; synthetic results are visibly labeled.

## Phase 5 — Regional trends

- [ ] 5.1 Build regional genre distributions and privacy suppression.
- [ ] 5.2 Implement growth, moving averages and the explainable trend score.
- [ ] 5.3 Build regional comparison and trend dashboards.
- [ ] 5.4 Evaluate known synthetic breakouts, sparse cases and false alerts.

Done when: popularity and growth are distinguishable and small cohorts do not reveal individual behavior.

## Phase 6 — Song recommendations

- [ ] 6.1 Implement genre vectors and cosine similarity with hand-worked fixtures.
- [ ] 6.2 Implement neighbor recommendations and popularity fallback.
- [ ] 6.3 Add recommendation explanations and discovery UI.
- [ ] 6.4 Run chronological baseline evaluation; report Precision@K, Recall@K, NDCG@K and coverage.

Done when: a reproducible report compares the algorithm against popularity without future-data leakage.

## Phase 6b — Community intelligence

- [ ] 6b.1 Build equal-member-weighted community vectors and visibility-safe artist/social signals.
- [ ] 6b.2 Implement community matching with missing-data fallback and explanations.
- [ ] 6b.3 Add Community Pulse using historical membership and consistent cohorts.
- [ ] 6b.4 Evaluate matching baselines, cohort churn and community-region suppression.

Done when: users can discover relevant communities and inspect explainable aggregate trends.

## Phase 7 — Diploma readiness

- [ ] 7.1 Run full user journeys, query-performance checks and deployment security review.
- [ ] 7.2 Verify desktop/mobile layouts and error/empty/loading states.
- [ ] 7.3 Finish setup guide, architecture diagrams and mathematical results/limitations.
- [ ] 7.4 Rehearse a reproducible demonstration on a clean environment.

Done when: the application can be installed, demonstrated and explained from the documentation.
