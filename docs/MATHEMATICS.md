# Mathematical plan and evaluation

Sections 0, 2 and 3 are implemented (2026-11-17): code in `apps/api/src/modules/listening/policy.ts` and `apps/api/src/modules/analytics/` (`math.ts` formulas, `pulse.ts` aggregation, `synthetic.ts` generator, `evaluate.ts` evaluation), results in [EVALUATION-PULSE.md](EVALUATION-PULSE.md). Section 1 (recommendations) is still a proposal. Implementation choices beyond the text below: percentile rank = (average rank − 1)/(n − 1); the trend window closes at the UTC midnight at or before the reference time; per-day and previous-week counts below 10 listeners are hidden too; the playlist-add signal is omitted (no timestamped add events) and the remaining weights are renormalized. Keep the first versions small enough to derive and explain at the defense. Store parameters with each evaluation run.

## 0. Qualified listens — the input data (policy `listen-v1`, implemented)

All later models consume *counted listening events*. Their definition (code: `apps/api/src/modules/listening/policy.ts`, unit-tested):

A playback session receives heartbeats `(s_i, p_i, π_i)` (sequence, media position in ms, playing flag) at server times `τ_i`. Heartbeats with `s_i ≤ s_{i-1}` are ignored (retries). For consecutive accepted heartbeats, with wall time `Δτ = τ_i − τ_{i−1}` and media advance `Δp = p_i − p_{i−1}`, the credited time is

`c_i = min(Δp, C)` if `π_{i−1}` is true and `0 ≤ Δp ≤ Δτ + ε`, otherwise `c_i = 0`,

with tolerance `ε = 2 s` and per-interval cap `C = 60 s`. Paused intervals (`π_{i−1}` false), backward or forward seeks, and claims of faster-than-real-time progress therefore earn nothing. Accepted listening time is `A = Σ c_i`. Each credited interval `[p_{i−1}, p_{i−1}+c_i)` is merged into a set `I` of disjoint timeline intervals; completion is `|I| / D` for track duration `D` (unique coverage, so seeking to the end is not completion, and repeats do not raise it).

A session *qualifies* when `A ≥ min(30 s, D/2)`. A qualified session creates one event (unique per session) only if the same user has no counted event for the same track in the previous 30 minutes; the event time is the server qualification time. Events store `listenedMs = A`, completion, source, data origin and the policy version.

Limitations to state at the defense: the server cannot verify that the client really played audio (a modified client can report plausible positions), so the rules bound inflation by real time, sequence and cooldown rather than proving authenticity. Up to one heartbeat interval (≈10 s) is not credited when a track is switched mid-play.

## 1. Genre preferences and cosine recommendations

For user u and genre g, define `v[u,g] = sum_e w(e) * a(track(e),g)` over qualified events in a chosen history window. Start with `w(e)=1`, capped at three events per user/track/day; `a(t,g)=1/number_of_genres(t)` when track t belongs to genre g, otherwise zero. Fractional allocation prevents multi-genre tracks from getting extra total weight. Later compare optional recency decay or explicit rating weights as separate experiments.

Cosine similarity is `sim(u,v) = dot(v[u],v[v]) / (norm(v[u]) * norm(v[v]))`. A zero vector has similarity zero. Example: `(3,4)` and `(4,3)` have cosine `24/25 = 0.96`; `(1,0)` and `(0,1)` have zero similarity. Cosine measures similarity in proportions rather than raw activity volume.

Choose up to 20 most similar users with positive similarity. For an unseen track t, start with `score(u,t) = sum_v sim(u,v)*I(v listened to t) / sum_v sim(u,v)`. Sort candidates by score, then training-period unique listeners and track ID for deterministic ties. Exclude the target user's known tracks. For no history or no useful neighbors, fall back to training-period platform popularity; regional popularity is opt-in and only when privacy thresholds are met. Favorite genres and ratings can later supplement the vector with separately documented weights.

Baseline: recommend top tracks by distinct qualified listeners in the training window, excluding known tracks. Apply identical eligibility and history filters to both methods.

Evaluation: use one chronological global split (e.g. earliest 70% training, next 10% validation, latest 20% test by time). Fit preferences, neighbors, popularity, and all parameters using training only; select weights on validation; report test results once. Relevant tracks are previously unseen eligible tracks in each user's held-out qualified events. Tracks first uploaded after training cannot enter the training catalog; report their exclusion and the cold-start subset separately. Evaluate users with at least one eligible held-out track; report sample counts and excluded users.

Report Precision@10, Recall@10, NDCG@10, user/catalog coverage, and cold-start coverage. Define Precision@10 denominator as 10 (missing recommendations count as misses). Recall divides by eligible relevant tracks; NDCG rewards relevant items near the top. Compare per-user results, optionally bootstrap users with a fixed seed for uncertainty intervals. Synthetic recovery tests verify behavior; real performance claims need real data and should acknowledge small samples.

## 2. Popularity dynamics and emerging trends

Popularity is current audience size; momentum is a change in audience. Compare equal, adjacent, complete seven-day UTC windows with the same source filter. Let U0 and U1 be distinct listeners in previous/current windows. A smoothed growth signal is `g=(U1-U0)/(U0+20)`. Additive smoothing reduces division by zero, but eligibility and shrinkage are still needed.

Require at least 20 current unique listeners before a track is eligible. Compute four signals: g; distinct liking listeners / U1; distinct playlist-adding listeners / U1; and fraction of U1 with at least two qualified sessions. Count engagements from current listeners within the same window so rates stay within `[0,1]`. Playlist additions require timestamped events, which will be added before this signal is enabled. If a signal is unavailable, omit it and renormalize the declared weights; do not substitute invented values.

Normalize each signal across eligible tracks using empirical percentile ranks in `[0,1]`, assigning average ranks to ties (all equal -> 0.5). This is robust to extreme magnitudes and permits different units. Initial weights: growth 0.55, like rate 0.20, playlist-add rate 0.15, repeat-listener rate 0.10. Weights are transparent hypotheses, not learned truths.

`trend(t) = 100 * U1/(U1+50) * sum_j weight[j] * percentile(signal[j])`.

Show raw U0/U1, smoothed and unsmoothed growth when defined, cohort size, windows, score components, and thresholds alongside the score. No history means 'new entry', not infinite growth. Using unique listeners and shrinkage helps avoid tiny-sample leaders. A large established audience with 2% growth may still rank below a smaller rapidly growing track, but the composite score does not guarantee any fixed pairwise outcome. Show a separate popularity chart. For region-specific trends, apply privacy suppression before ranking and use a consistent eligible region cohort. Cross-region breadth is a descriptive metric initially, not an arbitrary extra weight.

Use seven-day moving averages of daily unique listeners for visual smoothing. Do not sum daily uniques and call that weekly unique listeners. Multi-genre genre trends aggregate fractional contributions; document when unique genre listeners overlap rather than assuming counts are additive.

Evaluate with seeded synthetic series containing a sustained breakout, steady popular tracks, a one-day spike, a tiny-denominator case, and weekly seasonality. Measure precision@K against seeded breakout labels, detection lag, ranking sensitivity to weights/thresholds, and false alerts. Compare to raw growth and current popularity. For real data, evaluate whether scores predict next-window listener growth without using that future window in scoring; association does not establish causation.

## 3. Regional preference distributions

For each eligible region r, count fractional genre contributions from qualified listens with the same per-user/track/day cap. Define `p[r,g] = count[r,g] / sum_h count[r,h]`. Fractions sum to one when genre metadata is present; separately report excluded uncategorized events. This describes event-weighted demand, so active users contribute more. An equal-user-weighted distribution is a useful sensitivity check.

Compare regions with total variation distance: `TV(p,q)=0.5*sum_g abs(p[g]-q[g])`. It ranges from zero (identical distributions) to one (disjoint genre distributions). Example: `(0.7,0.3)` versus `(0.2,0.8)` gives TV 0.5. Use identical genre vocabulary, UTC window, eligibility rules, and data origin. Empty or suppressed cohorts return 'insufficient data', not zeros that imply a measured distribution.

Test normalization, identical/disjoint distributions, missing genres, empty cohorts, and suppression boundaries. Recover known seeded regional distributions and check stability by resampling users rather than individual events, since repeated observations from one user are dependent. Optional significance testing comes only after discussing assumptions with the supervisor; repeated streams are not independent survey samples.

## Shared evaluation rules

Record dataset seed, generator version, reference date, origin, split boundaries, catalog snapshot, model version, weights, thresholds, eligibility and sample counts. Keep a small hand-worked fixture for each formula and test zero vectors, ties, no data, UTC boundaries, retries and sparse regions. Never tune on the final test set. Dashboard labels must say 'Our platform' or 'Synthetic demonstration', and show the time range and minimum sample rules.

## Community extension

See [Communities and social discovery](COMMUNITIES.md) for the planned social entities, membership history, community preference vectors, normalized matching score, chronological evaluation and Community Pulse privacy rules. These extend the existing models and arrive in later migrations and feature phases.
