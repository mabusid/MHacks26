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
cd /tmp && spacetime sql --server local overburden "SELECT * FROM server_info"   # query the local DB
```

Run ad-hoc `spacetime` commands from outside the repo, or rely on `spacetime.json` (database `overburden`, server `local`).
