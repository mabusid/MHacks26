# Overburden — plan (simple)

Co-op **learning game** for **four players**. An agent researches a **random real planet** (solar system or exoplanet) from public space data; the crew has **2:30** to build a base on a shared 2D grid that meets **three goals**. There is no live score — the **voice assistant's hints** are the only feedback. The debrief ties the result back to the real science.

**Pitch:** a fun way to touch research/space data that rarely gets attention — real planets give a sense of **scale and variety**.

**Status:** design only. Items marked **`[MISSING]`** need a decision before implementation.

---

## Overview

| | |
| --- | --- |
| Players | 4, co-op in one room, each on their own device |
| Round length | ~3.5 min total (briefing ~20s, **build 2:30**, debrief ~20s) |
| Variety | Random real planet per round; **same loop, same timer, same pieces** — planet data changes piece stats and the twist goal |
| View | **2D** grid; background art changes per planet type |
| Authority | **SpacetimeDB** — shared state, reducers, subscriptions; clients render only |
| Assistant | **Grok Voice** in-match hints; separate **research agent** runs during the lobby |

---

## Design pillars

1. **Learning first.** Every number the game uses comes from a cited source (or is labeled *estimated*). Briefing, hints, and debrief all repeat the planet's **headline fact**.
2. **Short and readable.** At most **3 goals**, ~7 piece types, ~8–12 pieces in a winning base.
3. **Tradeoffs, not chores.** Every piece trades **landed mass**, **build time**, or **power** against another — and the planet's real data decides which trade wins.
4. **Shared everything.** No roles. Everyone can place every piece; the short timer and the "what should we build?" discussion drive cooperation.
5. **Hints are the feedback.** No live pass/fail. Players reason from per-piece stats and ask the assistant.

---

## Tech stack

| Layer | Choice | Role |
| --- | --- | --- |
| **Live multiplayer & sim** | [SpacetimeDB](https://spacetimedb.com/) (TypeScript module + client SDK) | Rooms, join codes, placements, timer, diagnosis, evaluation; **reducers** are the only writers; clients **subscribe**. |
| **In-game AI** | [xAI Grok Voice](https://docs.x.ai/) (realtime voice) | Hints grounded in server-computed diagnosis. Small **Node** service holds `XAI_API_KEY` and mints ephemeral tokens. |
| **Pre-round research** | Research agent on the Node service | Fetches planet data, maps it to the round schema, streams progress, commits via a `commit_round` reducer. |
| **Frontend** | 2D web client (likely Vite + React + canvas/PixiJS) | Grid, pieces, live cursors, briefing/debrief screens. |
| **Research source data** | NASA Exoplanet Archive + NASA Planetary Fact Sheets + NASA BVAD | See **Research sources**. |

**`[MISSING]`** Research agent framework (likely xAI chat + tool calls, to keep one provider).  
**`[MISSING]`** Final frontend libraries (canvas vs PixiJS).

---

## Round structure

```
Lobby (create / join with code)  ← research agent runs here, in background
    → Briefing   (~20s)   planet card, headline fact, scale comparison, 3 goals
    → Build      (2:30)   place pieces on shared grid, voice hints, no live score
    → Evaluate   (instant) server formula
    → Debrief    (~20s)   per-goal result, reason, the real fact behind it, sources
    → Rematch    (new planet)
```

| Step | Behavior |
| --- | --- |
| **Room + code** | Host creates room; up to 4 join with a code. No spectators in v1. |
| **Research** | Starts automatically on room create; re-runs on rematch. Host's **Start** is enabled once a round is committed. |
| **Briefing** | Not counted against the build timer. |
| **Build** | Timer runs server-side; ends at 0:00 (or host locks early). |
| **Evaluate** | Reducer applies the evaluation formula; writes result + reason. |
| **Rematch** | New round id, new planet, grid and mass budget reset. |

---

## Goals (max 3 per round)

Every round uses the same template:

| Goal | Type | Passes when |
| --- | --- | --- |
| **Power** | Fixed | Daytime generation ≥ load, **and** night is covered (battery storage ≥ load × night length, or reactor output ≥ load) |
| **Life support** | Fixed | Water **and** O₂ each last the mission: `starting stock + (production − use) × mission length ≥ 0` |
| **Planet twist** | Picked from the planet's most extreme known parameter | See below |

| Twist | Triggered by | Requirement |
| --- | --- | --- |
| **Radiation** | No / thin atmosphere, or flare-prone star | ≥ N berm tiles adjacent to the habitat |
| **Cold** | Low surface / equilibrium temperature | Extra heating load added to Power goal |
| **Low light / dust** | Low insolation or dust storms | Solar output reduced further; night storage requirement increased |

Mission length is a fixed abstract duration (e.g. 30 sols) so the math stays the same every round; the planet changes the rates.

**`[MISSING]`** Exact thresholds for picking each twist.

---

## Piece library

The **habitat** is pre-placed at grid center. Players place everything else from a shared mass budget. Pieces can be **removed for a full refund** (trial and error is part of the game).

| Piece | Cost | Gives | Planet data it depends on |
| --- | --- | --- | --- |
| **Solar array** | Light | Power × insolation (Earth = 1.0); 0 at night | Insolation, day/night length, dust |
| **Battery** | Medium | Stores power for the night | Night length |
| **Reactor** (RTG/fission) | Very heavy | Flat power, day and night | — (the "far from the star" answer) |
| **Water tank** | Mass = water | Fixed water, no power | — |
| **Ice drill** | Medium + power | Water over time; **ice tiles only** | Water/ice presence |
| **O₂ unit** | Light + power | O₂ from water (electrolysis) or CO₂ atmosphere if present | Atmosphere composition |
| **Berm** (Overburden) | **0 mass**, slow to build (~3s hold) | Radiation shielding when adjacent to habitat | Radiation; gravity sets dig speed |

Core tradeoffs:

- **Ship it vs make it:** tanks are fast but heavy; drill/O₂ unit are light but cost power.
- **Mass vs time:** berms cost no mass but cost build time — the game's namesake.
- **Solar vs reactor:** decided by distance from the star (e.g. Mars ≈ 0.43× Earth sunlight, Titan ≈ 0.01×).
- **Grid placement:** drills need ice tiles; berms must touch the habitat; solar needs lit tiles.

Design rule: each planet should change the best build in **at least two** of these tradeoffs. Every planet field must move at least one piece stat, or it is cut.

**`[MISSING]`** Base numbers (mass, output, power draw) per piece.  
**`[MISSING]`** Total mass budget (fixed across rounds; may be scaled by the winnability check).

---

## Grid

- **8×8**, 2D, habitat pre-placed at center.
- Tile types: **lit**, **shaded**, **ice**, set per planet (e.g. ice only where the planet has water/ice).
- Placement is near-instant (except berms). Everyone sees everyone's **live cursor**.

---

## What players see

| Visible | Hidden |
| --- | --- |
| Build timer | Whether each goal currently passes |
| Mass used / remaining | Aggregate production totals |
| Placed pieces |  |
| Per-piece stats **on this planet** on hover (e.g. "Solar: 0.43× here") |  |
| The 3 goals (no checkmarks) |  |
| Headline fact + planet card (re-openable) |  |

---

## Evaluation & diagnosis

- **Evaluation** is a deterministic formula (see **Goals**), not a time-stepped sim. Runs once at 0:00.
- **Diagnosis** reuses the same formula. A reducer recomputes it on every place/remove and stores the **worst-failing goal + shortfall + the planet fact responsible** (e.g. "Power: night storage short by 40%, night = 11 Earth days"). The voice assistant reads this; players never see it directly.
- **Winnability check:** on `commit_round`, the server brute-forces piece counts within the mass budget (few piece types → cheap) and confirms at least one winning build fits the grid. If none, scale the mass budget or redraw.

---

## Voice assistant (in-game)

| Topic | Direction |
| --- | --- |
| **API** | Grok Voice (realtime) via server-minted ephemeral token |
| **Where it runs** | **One session on the host device** (shared speaker); anyone in the room talks to it via push-to-talk on the host (e.g. spacebar / big button). Avoids four devices talking over each other. |
| **Grounding** | Never does math. Reads the server **diagnosis** and planet facts via tools, then phrases a hint. |
| **Tools** | `read_diagnosis`, `read_time_left`, `read_goals`, `read_planet_fact(field)`, `read_board` |
| **Proactive hints** | At **1:30, 0:45, 0:15** left, triggered by the host client on timer thresholds |
| **Escalation** | Vague → specific: "your water plan won't last" → "short on water; this planet has ice" → "an ice drill on the ice tile bottom-left closes it" |
| **Style** | One goal + one real fact per hint; short (expect only 2–4 exchanges per round) |
| **No API key** | Same diagnosis rendered as text hints on the same schedule |

---

## Research pipeline

Runs in the **lobby** so briefing never waits.

### Agent steps

1. Draw a planet from the eligible pool.
2. Fetch data (Exoplanet Archive / Fact Sheets) and map to the **planet profile** schema.
3. Mark unknown fields **estimated** with a default and a one-line "why unknown" for the briefing.
4. Pick the twist, the headline fact, and a scale comparison (distance, size vs Earth).
5. Stream progress lines to a `research_log` table (shown on the briefing screen — the research is part of the show).
6. Call `commit_round` via the Node service (server identity). Reducer validates ranges, requires a source per field, and runs the winnability check.

### Agent tools

`fetch_exoplanet(name | random_filtered)`, `fetch_fact_sheet(body)`, `set_parameter(field, value, source, status)`, `set_twist(kind)`, `set_headline(text)`, `log_step(text)`, `commit_round()`.

### Rules

- The agent may **pick and phrase** (twist, headline, briefing text). It may **not** change sourced numbers.
- No search or agent calls during build.
- **Fallback:** a checked-in **cached pack** (~10 pre-validated planets). If research fails or exceeds the latency budget, draw from the pack.

**`[MISSING]`** Latency budget (suggest ≤ 20s, then fall back to cache).

---

## Planet pool & profile

### Pool

- **Solar system:** rocky bodies with a surface — candidates: Moon, Mars, Mercury, Ceres, Titan, Europa.
- **Exoplanets:** NASA Exoplanet Archive, filtered to likely-rocky (radius ≤ ~1.6 Earth radii) with insolation and equilibrium temperature known and within a playable range.
- Excluded: gas giants, Venus-surface-like extremes. Anything that fails the winnability check is redrawn.

**`[MISSING]`** Final solar-system list and exoplanet filter thresholds.

### Profile fields

| Field | Drives | Source (solar system / exoplanet) |
| --- | --- | --- |
| Name, type, distance, size vs Earth | Briefing, scale comparison | Fact Sheet / `sy_dist`, `pl_rade` |
| Insolation (Earth = 1) | Solar output | Fact Sheet / `pl_insol` |
| Day/night length | Battery requirement | Fact Sheet / usually **estimated** (rotation unknown) |
| Temperature | Cold twist, heating load | Fact Sheet / `pl_eqt` |
| Gravity | Berm dig speed | Fact Sheet / derived from `pl_rade` + `pl_bmasse` |
| Atmosphere | O₂ unit mode, radiation twist | Fact Sheet / usually **estimated** |
| Water/ice | Ice tiles, drill availability | Mission literature / **estimated** |
| Radiation / dust | Twist selection | Curated / star type (`st_spectype`) |

Each stored parameter: `{ field, value, unit, status: sourced | estimated, source_label, source_url }`.

---

## Research sources

| Source | Used for |
| --- | --- |
| **NASA Exoplanet Archive** (TAP API, structured) | Exoplanet insolation, temperature, radius, mass, distance, star type |
| **NASA Planetary / Satellite Fact Sheets** | Solar-system body numbers |
| **NASA BVAD** (Baseline Values and Assumptions Document) | Crew life-support rates (e.g. ~0.84 kg O₂ per person per day) |
| **Checked-in game constants** | Piece stats, mass budget, mission length |

**`[MISSING]`** Parser for Fact Sheets (one-time scrape into JSON is likely simplest).

---

## Debrief (learning moment)

- Per-goal pass/fail with the reason in plain language.
- The **real fact behind the result**: "You ran out of power on night 3 — this planet's night lasts 11 Earth days."
- Scale card: distance (light-years), size vs Earth, sunlight vs Earth.
- **What we don't know yet**: list of *estimated* fields.
- Sources with links.

---

## Backend & multiplayer (SpacetimeDB)

| Topic | Notes |
| --- | --- |
| Tables | `room`, `member`, `round`, `planet_parameter`, `piece`, `cursor`, `diagnosis`, `research_log`, `result` |
| Reducers | `create_room`, `join`, `start_round`, `place_piece`, `remove_piece`, `move_cursor`, `lock_build`, `evaluate`, `rematch`, `commit_round` (server identity only) |
| Timer | Scheduled reducer ends the build at 0:00 and calls `evaluate` |
| Identity | Anonymous Spacetime identities; no accounts |
| Room lifetime | Join code lives as long as the room. If the host drops, the next member becomes host (and voice moves to their device). |
| Trust | Reducers are the only writers; clients never compute pass/fail |

---

## Acceptance checks

1. Four clients join one code; a placement and live cursors appear on all screens.
2. Research agent (or cached pack) commits a planet; all clients show the same briefing, goals, and sourced facts.
3. Winnability check rejects an impossible planet.
4. Diagnosis updates on place/remove; voice hint cites the failing goal and a real planet fact from tools.
5. Timer hits 0:00; evaluation and debrief match the server formula.
6. Rematch loads a new planet with no stale data.

---

## Demo script

**`[MISSING]`** To write after the core is built (target: one full ~3.5 min round).

---

## Archive

Earlier designs (fixed Moon/Mars sites, longer build + trial phases, roles) are superseded by this document. Recover from git history if needed.
