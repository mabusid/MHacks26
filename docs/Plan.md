# Overburden — plan (simple)

Co-op game for **four players**: an agent prepares a **real-planet** round from consistent sources; the crew builds a base under **time pressure** and must meet **sustainability requirements** to win. Repeat with a new planet or rematch.

**Status:** design only. Items marked **`[MISSING]`** need a decision before implementation.

---

## Overview

| | |
| --- | --- |
| Players | 4 (co-op in one room) |
| Variety | Random (or drawn) **real** planet/body per round; same round **shape**, different **parameters** |
| Authority | Game server holds truth (placement, stocks, clock, win/loss). Clients display and send actions. |
| Assistant | Voice helper during play: hints tied to time left and round requirements. Research agent runs **before** the build clock. |

---

## Game details

### Properties per planet

Each round loads a **planet profile**: numbers the sim uses plus one-line **source** per field (or `[MISSING]` until the research pipeline fills them).

| Property | Used for | Notes |
| --- | --- | --- |
| Body name & type | UI, briefing | e.g. Moon, Mars, Mercury |
| Surface gravity | Mass, structures (if modeled) | `[MISSING]` — required for v1 or defer? |
| Day / sol length | In-game clock vs real session timer | `[MISSING]` — scale formula |
| Solar flux / insolation | Power generation | |
| Atmosphere (pressure, composition) | ISRU, leaks, greenhouses | Optional for airless bodies |
| Surface temperature range | Thermal / heaters | `[MISSING]` — simplify to bands? |
| Radiation environment | Dose / shielding | `[MISSING]` — which table per body |
| Water / ice availability | Mining, closed loop | Boolean + class (polar ice, subsurface, none) |
| Dust / weather events | Scripted hazards | `[MISSING]` — fixed event deck per body vs agent-picked |
| Regolith / soil constraints | Berms, farming | e.g. perchlorates on Mars |
| Max landed mass | Manifest cap | e.g. single cargo limit from vehicle guide |

**`[MISSING]`** Planet roster for v1 (recommend **3–5 bodies**, not “any exoplanet”).  
**`[MISSING]`** How much the **agent may tune** vs must copy verbatim from source.  
**`[MISSING]`** Grid topology (fixed size? tiles for sun/shade/ice?).

### Properties to track for players (ledger)

What players see updating during the round:

| Track | Win/lose relevance |
| --- | --- |
| Build phase timer | Session urgency |
| In-sim time (optional) | Sustainability window | `[MISSING]` — one clock or two? |
| Oxygen | Life support |
| Water (drinking + loop) | Life support |
| Food | Life support / greenhouse |
| Power (generation vs load) | Everything powered |
| Radiation dose (crew) | Long trials | `[MISSING]` — track in v1? |
| Landed mass used / remaining | Placement |
| Round requirements checklist | Win condition progress |

**`[MISSING]`** Exact loss rules (any stock zero? power out for N seconds? dose cap?).  
**`[MISSING]`** Piece library (cabins, solar, tanks, processors, etc.) and which pieces exist on all planets.  
**`[MISSING]`** Roles (everyone places everything vs power / life support / logistics split).

### Time to build

| Phase | Purpose |
| --- | --- |
| **Briefing** | Agent outputs planet profile + win requirements; players read manifest cap and goals. |
| **Build** | Place pieces from manifest until timer ends or host locks build. |
| **Trial** (optional) | Fast-forward sim for “sustain N days” | `[MISSING]` — build-only win vs build + sim |

**`[MISSING]`** Build phase duration (e.g. 15 / 20 / 30 minutes).  
**`[MISSING]`** Whether build timer **pauses** for briefing or research.  
**`[MISSING]`** Trial length in in-sim days and tick rate (real-time vs accelerated).

---

## Game loop

```
Lobby (create / join with code)
    → Research & briefing (agent fills planet profile + requirements)
    → Build phase (timer runs)
    → Evaluate (requirements + ledger)
    → Win or lose screen
    → Rematch (same room: new planet or same planet)
```

| Step | Behavior |
| --- | --- |
| **Public room + code** | Host creates colony; up to 4 join; spectators? `[MISSING]` |
| **Start** | Host starts round after briefing is committed to server |
| **Play** | Shared state; placements and stocks update for all clients |
| **End** | Win if requirements met when timer/sim ends; else lose + reason |
| **Repeat** | New round id; new planet draw; reset grid/manifest |

**`[MISSING]`** Backend choice (e.g. SpacetimeDB vs other realtime DB).  
**`[MISSING]`** Join code lifetime, host migration, disconnect handling.  
**`[MISSING]`** Anti-cheat / server-only simulation rules.

---

## Research pipeline

Runs **before** the build timer (or overlaps briefing only).

### Agent responsibilities

1. Pick or receive **planet** (random from allowlist).
2. **Fetch / map** environment and mission facts into the **round schema** (no free-form physics in the reducer).
3. Output **win requirements** (template filled: e.g. “close water loop”, “survive 7 sols”, “shield dose under X”).
4. Store result on server as **`parameter` rows** players and the voice helper can read.

### Agent design

| Topic | Direction |
| --- | --- |
| **Platform** | `[MISSING]` — e.g. xAI API (chat + tools), Cursor agent, local script |
| **Where it runs** | `[MISSING]` — server-side job only (recommended); never client with secrets |
| **Tools** | `[MISSING]` — list, e.g. `get_planet_facts`, `set_parameter`, `set_win_conditions` |
| **Validation** | Reject profile rows without `source_id`; cap numeric ranges; human-readable briefing card |
| **Search** | `[MISSING]` — allowed during research only; forbidden during build? |

**`[MISSING]`** Latency budget (max seconds for research before players wait).  
**`[MISSING]`** Fallback if agent fails (cached default pack for that planet).  
**`[MISSING]`** Who triggers research (host button vs auto on room create).

---

## Research source

Goal: **one primary source** (or one API) that is **easy to parse** and covers most planets in the allowlist.

| Candidate | Pros | Cons |
| --- | --- | --- |
| **NASA Planetary Fact Sheets** (HTML tables per body) | Official, one row per planet, comparable fields | Not all bodies; some fields sparse; HTML parsing |
| **NASA SSD / Horizons** | Ephemerides, precise | Overkill for surface colony; harder for “habitat” facts |
| **Wikipedia + Wikidata** | Broad coverage, structured props in Wikidata | Mixed provenance; not ideal as *single* authority |
| **Custom JSON pack** (you maintain) | Fully parseable; game-safe | Not “live research”; agent only selects/composes |

**Working recommendation until decided:** treat **Planetary Fact Sheets** as the **canonical numeric surface** for the allowlist, plus a **checked-in JSON override** for game-specific fields (mass cap, crew size, life-support rates). Agent maps sheet → schema; gaps marked `assumption` with defaults.

**`[MISSING]`** Final choice of single source.  
**`[MISSING]`** Citation format stored on each parameter row.  
**`[MISSING]`** Life-support rates source (separate NASA doc — not on fact sheets).  
**`[MISSING]`** Parser: static scrape vs manual JSON vs MCP tool.

---

## Voice assistant (in-game)

During **build** (and trial if present): players ask for help; hints tighten as **time runs down**.

| Topic | Direction |
| --- | --- |
| **API** | Voice realtime API (e.g. xAI Grok Voice) via **server-minted ephemeral token** |
| **Inputs** | Round parameters, ledger, requirements checklist, **time remaining** |
| **Outputs** | Spoken hints; optional **one suggested action** (confirm before placing) |
| **Rules** | `[MISSING]` — no invented rates; must read server state via tools |
| **Escalation** | `[MISSING]` — e.g. at 50% / 25% time, more specific hints |

**`[MISSING]`** Tool list (`read_timer`, `read_stocks`, `read_requirements`, …).  
**`[MISSING]`** Behavior when API key absent (text-only or disabled).  
**`[MISSING]`** Mobile vs desktop UX for push-to-talk.

---

## Frontend format

**Deferred** until game details, loop, and server schema are stable.

**`[MISSING]`** Stack (e.g. Vite + React + 3D grid).  
**`[MISSING]`** Phone role (spectator sheet vs full player).

---

## Backend & multiplayer (recommended tab)

| Topic | Notes |
| --- | --- |
| Shared state | Room, members, planet profile, pieces, stocks, timer, win/loss |
| Tick / sim | `[MISSING]` — continuous timer only vs discrete resource ticks |
| Identity | `[MISSING]` — anonymous join vs accounts |

---

## Acceptance checks (when building)

1. Four clients join one code; one placement visible on all screens.  
2. Agent (or fixture) commits a planet profile; all clients show same requirements.  
3. Timer reaches zero; win/loss matches server evaluation.  
4. Voice helper cites time left and a requirement from server tools, not guesswork.  
5. Rematch starts new round without stale planet data.

---

## Archive

The previous long design (fixed Moon/Mars sites, cited reducer pack, Spacetime table list) is superseded by this document. Recover from git history if needed.
