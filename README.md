# Overburden (MHacks26)

Co-op learning game: four players build a base on a real planet researched from NASA data, with Grok Voice as Mission Control. Design in [docs/Plan.md](docs/Plan.md); build phases in [docs/Implementation.md](docs/Implementation.md).

## Setup

1. **Node 22+** and **pnpm** (via Corepack: `corepack enable`).
2. **SpacetimeDB CLI 2.x:**
   ```sh
   curl -sSf https://install.spacetimedb.com | sh
   echo 'export PATH="$HOME/.local/bin:$PATH"' >> ~/.zshrc   # then open a new terminal
   ```
3. Install and run:
   ```sh
   pnpm install
   pnpm dev
   ```
   Open http://localhost:5173.

Optional: copy `server/.env.example` → `server/.env` and set `XAI_API_KEY` (a regular API key from console.x.ai → API Keys, not a management key). With it, a Grok research agent picks and writes up each planet; without it, research is scripted (curated bodies or live exoplanets) and hints fall back to templates.

## What `pnpm dev` runs

| Tag | Process | Port |
| --- | --- | --- |
| `[db]` | Local SpacetimeDB (`spacetime start`; reuses one already running) | 3000 |
| `[module]` | `spacetime dev`: rebuilds + republishes `spacetimedb/` and regenerates `client/src/module_bindings` on change | — |
| `[client]` | Vite + React | 5173 |
| `[server]` | Node service (research agent, voice) | 8787 |

## Layout

| Path | Purpose |
| --- | --- |
| `packages/shared` | Pure game logic shared by module, client, and server (`pnpm test` runs its tests) |
| `spacetimedb/` | SpacetimeDB TypeScript module (tables, reducers) |
| `client/` | Vite + React client; `src/module_bindings` is generated — don't edit by hand |
| `server/` | Node service |
| `scripts/dev.mjs` | The `pnpm dev` orchestrator |

## Commands

```sh
pnpm test        # unit tests
pnpm typecheck   # all packages
pnpm check:phase1   # multiplayer checks against the running dev stack (needs `pnpm dev`)
pnpm check:phase3   # research commit + start/briefing/build (add --wait-end to wait out the timer)
pnpm check:phase4   # room-scoped subscriptions
pnpm check:phase5   # placement, budget, berm digging, cursors
pnpm check:phase6   # scoring, debrief results, rematch, room cleanup
pnpm check:phase7   # automatic research, provenance (live NASA archive)
pnpm check:phase8   # research agent (live xAI), curated bodies, cached pack
pnpm check:phase9   # Mission Control: cues, captions, audio broadcast, grid-aware hints
pnpm build:pack     # rebuild data/cached_pack/ (offline fallback planets)
cd /tmp && spacetime sql --server local overburden "SELECT * FROM server_info"   # query the local DB
```

If a schema change can't migrate existing rows, reset the local DB: `cd /tmp && spacetime delete --server local overburden` (then `pnpm dev` republishes).

Run ad-hoc `spacetime` commands from outside the repo, or rely on `spacetime.json` (database `overburden`, server `local`).

## Manual UI check (two tabs)

1. Home: base-scene backdrop with one card — name, **Create room**, code + **Join**.
2. Tab 1 create, tab 2 join → **split card**: left = code (tap to copy) + crew with colors + open seats; right = research.
3. Research starts by itself: log lines stream on the right, then the planet name, headline, 2–3 key numbers (Moon / Mars from curated NASA data, or a real exoplanet from the NASA Exoplanet Archive); backdrop tint matches. **dev: test planet** still overrides it.
4. **Start mission** → briefing card: planet, 3 one-line requirements, "Build starts in 10…" — the build starts on its own (host can **Skip**).
5. Build: big timer top center (red under 0:30), mass top right, requirements on the right (**Planet facts & sources** toggle), Mission Control bar at the bottom — **tap the bar to mute/unmute**.
   - Pick a piece in the palette (or keys **1–8**), click a tile to place; hovered tiles outline teal/red. **Remove** (or **R**) then click a piece.
   - **Berm**: press and hold a tile touching the habitat — the ring fills (~2.3 s on the Moon); let go early to cancel.
   - The other tab's cursor moves live with their name; a wrong tile shows a red toast with the reason.
6. **Mission Control** (build): ~4 s in, a welcome fun fact plays and types out in the bottom bar; more facts at 2:05 / 1:45, then hints at 1:30, 1:10, 0:50, 0:30, 0:15 that follow your grid (place the suggested piece and the next hint says “Nice — …”). If the bar says **tap to enable sound**, tap it once (browsers block audio until you interact). Tap again to mute this device only — captions keep typing. Without an xAI key, the browser reads the same lines aloud.
7. At 0:00 (or host **Lock in early**) → debrief split card: **MISSION SUCCESS / FAILED**, ✓/✗ with one reason per requirement, the key fact, **Sources** link. Host **Next planet** → lobby, or straight into the briefing if a planet is already prepared.
   - Dev: the **dev: board read** panel on the build screen shows what Mission Control will see (worst requirement + suggested moves).
8. Narrow the window below 1024px → halves stack; the Mission Control bar stays pinned at the bottom.
