# MusicSphere interface demo

Run Node 24 (`source ~/.nvm/nvm.sh && nvm use`), start PostgreSQL (`sudo docker compose up -d --wait db`), then `npm run db:migrate`, `npm run db:seed` (first time, or any time; it is repeatable) and `npm run dev`. Open http://127.0.0.1:5173.

1. Discover: select Play the mix; try pause, next, seeking and volume. Eight original 24-second audio studies are loaded from the PostgreSQL catalog through `/api/catalog`. If the API or database is down, the track lists show an error with a Try again button instead of fake data.
2. Like a track, create a playlist, then use a track's plus button to add it. Visit Your library. Signed in, likes and playlists are saved to your account in PostgreSQL: reload, or sign in from another browser, and they are still there. As a guest they are kept only in this browser. The first time you sign in, anything that account had saved in this browser is moved into the account once.
3. Open a track's details (the ••• button on a row). Signed in, play a track for at least 12 seconds without skipping ahead: it appears under Your library → Recently played and your counted listens on the track page go up. Replaying it straight away does not count again for 30 minutes; pausing or skipping ahead adds no listening time. Audience numbers stay hidden until 10 different people have listened.
4. Search by track title or genre; try the genre filters.
5. Communities: explore a community and join its local preview. Draft posts are not published and disappear on reload.
6. Music Pulse (run `npm run db:synthetic` once first): the **Synthetic demonstration** view shows trending tracks with every score component, regional genre mixes and distances, and daily listeners; switch regions to compare. The planted breakouts rank first and the one-day spike does not (see docs/EVALUATION-PULSE.md). Switch to **Our platform** for real data: with fewer than 10 listeners it honestly shows nothing. In Profile, you can share your country (with explicit consent) and withdraw it, which also removes it from your past listens.
7. Sign in or register with the local backend; edit your display name in Profile. Accounts, sessions and profile updates use PostgreSQL.
8. Open local audio from the sidebar to play a file you own. It is not uploaded or shared; temporary file references disappear on reload/account switch.

The UI is responsive, with bottom navigation on phones. Friends, real community persistence, cloud uploads, recommendation algorithms and event-driven analytics are later milestones.

Original assets: `scripts/generate-demo-assets.py` synthesizes audio with oscillators and creates SVG covers; no third-party recordings or album art are included.
