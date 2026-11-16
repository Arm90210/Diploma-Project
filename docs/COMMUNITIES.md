# MusicSphere: communities and social discovery

Adopted concept, 2026-11-14. The Armenian diploma title remains unchanged. This document specifies planned functionality; Phase 1 currently implements only the foundation.

## Delivery scope

The first working social version includes profiles, following, public user-created/artist/genre communities, membership, text posts with optional track links, one level of replies, one reaction per user/post, and basic owner moderation. Friends means mutual following, computed from follow edges; there is no separate friend-request system initially. Private communities, regional community categories, deeper threads, pinned posts and shared community playlists follow after membership and visibility rules are tested. Live group listening and forecasting remain future work.

The diploma release still requires geographic analysis, trend detection and evaluated song recommendations. Community Discovery and Community Pulse are high-priority extensions using the same qualified listening dataset. Artist dashboards and displayed friend compatibility are optional. Adding communities increases the schedule: reserve 5–8 focused days for basic communities and 4–6 for discovery/pulse beyond the original estimates, plus learning and evaluation time.

## Planned entities and rules

Add these through new migrations in their implementation phases; do not rewrite the initial migration.

| Entity | Relationships and constraints |
| --- | --- |
| UserFollow | Composite key follower/followed, no self-follow, timestamp, reverse index |
| UserBlock | Composite blocker/blocked key, no self-block; overrides follow, feed and discovery visibility |
| Community | Unique slug, name, description, owner, type, optional artist or genre target, visibility, data origin |
| CommunityMember | Unique community/user pair, role OWNER/MODERATOR/MEMBER, status and join time; index by user |
| MembershipPeriod | User/community, joinedAt and optional leftAt; preserve nonoverlapping periods for historical analytics |
| CommunityPost | Community, author, bounded text, optional track, timestamps, moderation/deletion state |
| PostComment | Post, author, optional parent, bounded text; parent must belong to same post; initially one reply level |
| PostReaction | Unique user/post pair, reaction type and timestamp |
| CommunityPlaylist | Unique community/playlist link; linked playlist must be visible to its audience |

Require an artist target for artist communities and a genre target for genre communities. Do not imply an artist community is officially endorsed. Enforce one owner matching the owner membership in a transaction; transfer ownership before the owner leaves. Membership changes and period updates are transactional. Index posts by community/createdAt and comments by post/createdAt. Retain SYNTHETIC/REAL isolation across communities, membership and interactions.

Members may post; authors may edit/delete their content; moderators may remove content and manage ordinary members; only owners may assign moderators or transfer ownership. Add reporting, rate limits and blocking to the social release. Test unauthorized writes, cross-community comment parents, duplicate joins/reactions, owner departure and deleted content access. Private communities later require authorization on every content, search, feed, playlist and aggregate endpoint, including counts.

Feed entries include public reviews, published playlists and community posts that the viewer can access. Likes are included only when the author opts into sharing them. Listening activity sharing is a separate default-off setting. Public taste comparisons and discovery participation also require an explicit setting; permitting personal recommendations does not automatically publish a taste profile.

## Community Discovery model

Reuse the capped, fractional genre vectors from MATHEMATICS.md. Normalize each eligible member's nonzero genre vector to sum to one, then average those vectors into the community vector. This gives each member equal weight. Exclude the candidate user from the centroid and all other aggregate features. Only consenting members and qualified training-window events contribute; require at least 10 eligible members. Small communities use declared artist/genre metadata as a clearly labeled fallback.

For user u and community c:

`C(u,c) = 0.60*S(u,c) + 0.25*A(u,c) + 0.15*F(u,c)`

- S: cosine similarity between the user vector and community centroid.
- A: Jaccard overlap of the user's top 10 artists and the community's top 10 artists. Community artist preferences average normalized per-member preferences; deterministic ID ordering breaks ties. Empty union means unavailable.
- F: number of the user's visible, unblocked mutual friends in the community divided by all eligible visible mutual friends. No eligible friends means unavailable.

All available components are in [0,1]. Renormalize weights over available components and show the components used. If no reliable component exists, use a labeled popularity or metadata fallback. Exclude communities already joined, banned communities and inaccessible private communities. Never reveal hidden friendships or membership via explanations. `100*C` is a match score, not a calibrated probability of enjoying a community. The illustrative 87% in the proposal is not a measured result.

Compare popularity by eligible member count, genre-only cosine, and the full weighted score. Use chronological membership joins as held-out relevance; construct membership, friendship, artist and preference features as of the training cutoff. Tune weights on validation only. Report Precision@K, Recall@K, NDCG@K, coverage and sample counts. Exclude already joined communities; report cold-start and communities created after cutoff separately. A held-out join is an imperfect proxy for satisfaction; later retention/activity can be a secondary outcome. Include ablations removing artist/social terms to show whether added complexity helps.

## Community Pulse and geography

Reuse the trend model with a community cohort. Count only listening events occurring during a qualifying membership period, with appropriate analytics consent. One event can contribute to multiple communities; never sum those overlapping community counts into a platform total. Community membership does not establish the listener's geographic location.

Distinguish weekly active listeners from total members. Label growth as listener growth or membership growth with explicit equal-length windows. Community growth can reflect new members rather than changing tastes: show a secondary comparison among members present throughout both windows, with its own minimum sample threshold.

Require at least 10 consenting distinct users in every displayed community or community-region cohort; retain the trend model's separate minimum of 20 current track listeners. Suppress small cells, denominators and complementary slices; constrain filters to reduce differencing. Private community analytics remain restricted to authorized members. Do not expose individual listens or infer location from a regional community name. Withdrawal clears attributable location data and invalidates derived aggregates under the existing privacy policy.

A statement such as 'particularly among members in Armenia' needs a defined comparison: show Armenia's listener change and rate alongside other eligible regional cohorts and the window. Otherwise use neutral counts. Do not present correlation as evidence that a community caused regional growth. New releases shared by members are post metadata, distinct from measured listening trends.

Extend the seeded generator with membership periods, follow graphs, community preferences, newcomers, withdrawals and sparse intersections. Test centroid weighting, leave-one-out exclusion, empty vectors, hidden membership, temporal leakage, cohort churn, overlapping groups, suppression boundaries and recovery of seeded breakouts.
