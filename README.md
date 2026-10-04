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

Optional: copy `server/.env.example` → `server/.env` and set `XAI_API_KEY` (a regular API key from console.x.ai → API Keys, not a management key). Without it, hints fall back to templates.

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
cd /tmp && spacetime sql --server local overburden "SELECT * FROM server_info"   # query the local DB
```

If a schema change can't migrate existing rows, reset the local DB: `cd /tmp && spacetime delete --server local overburden` (then `pnpm dev` republishes).

Run ad-hoc `spacetime` commands from outside the repo, or rely on `spacetime.json` (database `overburden`, server `local`).

## Manual UI check (two tabs)

1. Tab 1 create, tab 2 join → both show the shell: top bar (code copies on click), crew with colors and open seats.
2. Host: **Dev: load a test planet** → research log lines appear, then a "Destination locked" card.
3. **Start briefing** → planet card (facts, source tags, estimated values in amber) + Mission Requirements Card; background tint matches the planet.
4. **Begin build** → timer in the top bar counts down (red under 0:30); at 0:00 everyone lands on the debrief.
5. Narrow the window below 1024px → layout stacks top bar → content → crew.
