# MusicSphere interface demo

Run Node 24 (`source ~/.nvm/nvm.sh && nvm use`), start PostgreSQL (`sudo docker compose up -d --wait db`), then `npm run dev`. Open http://127.0.0.1:5173.

1. Discover: select Play the mix; try pause, next, seeking and volume. Eight original 24-second audio studies are bundled.
2. Like a track, create a playlist, then use a track's plus button to add it. Visit Your library. These collections survive reload in this browser, separately for each account.
3. Search by track title or genre; try the genre filters.
4. Communities: explore a community and join its local preview. Draft posts are not published and disappear on reload.
5. Music Pulse: change the region and period to explore an explicitly synthetic chart scenario.
6. Sign in or register with the local backend; edit your display name in Profile. Accounts, sessions and profile updates use PostgreSQL.
7. Open local audio from the sidebar to play a file you own. It is not uploaded or shared; temporary file references disappear on reload/account switch.

The UI is responsive, with bottom navigation on phones. Friends, real community persistence, cloud uploads, server-backed playlists, recommendation algorithms and event-driven analytics are later milestones.

Original assets: `scripts/generate-demo-assets.py` synthesizes audio with oscillators and creates SVG covers; no third-party recordings or album art are included.
