# Overburden — plan (simple)

Co-op **learning game** for **four players**. An agent researches a **random real planet** (solar system or exoplanet) from public space data, and **that research sets the win criteria** — the requirements, their thresholds, which pieces work, and the mass budget all come from the planet's real numbers. The crew has **2:30** to build a base on a shared 2D grid that meets **three requirements**. There is no live score — the **voice assistant's hints** are the only feedback. The debrief ties the result back to the real science.

**Pitch:** a fun way to touch research/space data that rarely gets attention — real planets give a sense of **scale and variety**.

**Status:** design only. All numbers below are **starting values** — tune in playtest. Only the demo script is still open (**`[MISSING]`**).

**Implementation order:** [Implementation.md](./Implementation.md)  
**UI layout:** [design.md](./design.md)

---

## Overview

| | |
| --- | --- |
| Players | 4, co-op in one room, each on their own device |
| Round length | ~3.5 min total (briefing ~20s, **build 2:30**, debrief ~20s) |
| Variety | Random real planet per round; **same loop, same timer, same pieces** — **research sets the win criteria** (thresholds, twist, usable pieces, mass budget) |
| View | **2D** grid; background art changes per planet type |
| Authority | **SpacetimeDB** — shared state, reducers, subscriptions; clients render only |
| Assistant | **Grok Voice** hints, same audio on every device (mutable); **research agent** runs during the lobby |

---

## Design pillars

1. **Learning first.** Every number the game uses comes from a cited source (or is labeled *estimated*). Briefing, hints, and debrief all repeat the planet's **headline fact**.
2. **Research decides how you win.** The agent's findings become the round's **Mission Requirements Card**: each requirement shows its threshold, the researched fact it came from, and the source. Different research → different criteria, not just different numbers on the same answer.
3. **Short and readable.** At most **3 requirements**, 8 piece types, ~8–12 pieces in a winning base.
4. **Tradeoffs, not chores.** Every piece trades **landed mass**, **build time**, or **power** against another — and the planet's real data decides which trade wins.
5. **Shared everything.** No roles. Everyone can place every piece; the short timer and the "what should we build?" discussion drive cooperation.
6. **Hints are the feedback.** No live pass/fail. Players reason from per-piece stats; Mission Control watches the grid and talks — fun facts early, increasingly specific hints later.

---

## Tech stack

| Layer | Choice | Role |
| --- | --- | --- |
| **Live multiplayer & sim** | [SpacetimeDB](https://spacetimedb.com/) (TypeScript module + client SDK) | Rooms, join codes, placements, cursors, timer, evaluation, hint captions; **reducers** are the only writers; clients **subscribe**. |
| **Node service** | Node + TypeScript, WebSocket server | Holds `XAI_API_KEY`; runs the **research agent** and **one Grok Voice session per room**; broadcasts hint audio out. Connects to Spacetime with a **server identity**. |
| **In-game AI** | [xAI Grok Voice](https://docs.x.ai/) (realtime voice) | Watches the grid (via a server-computed board read) and speaks fun facts early, then increasingly specific hints. Runs server-side so every device hears the same thing. |
| **Research agent** | xAI chat API with tool calling, on the Node service | One provider, one key. Fetches planet data, maps it to the schema, streams progress, commits the round. |
| **Frontend** | Vite + React + TypeScript; grid as **DOM/CSS grid** (no canvas) | 8×8 grid is small — DOM gives hover tooltips, click targets, and styling for free. Planet background via CSS art per planet type. |
| **Research data** | NASA Exoplanet Archive (live) + checked-in solar-system JSON + NASA BVAD | See **Research sources**. |

---

## Round structure

```
Lobby (create / join with code)  ← research agent runs here, in background
    → Briefing   (~20s)   planet card, research log, **Mission Requirements Card**
    → Build      (2:30)   place pieces on shared grid, voice hints, no live score
    → Evaluate   (instant) server formula
    → Debrief    (~20s)   per-requirement result, reason, the real fact behind it, sources
    → Rematch    (new planet)
```

| Step | Behavior |
| --- | --- |
| **Room + code** | Host creates room; up to 4 join with a 4-letter code. No spectators in v1. |
| **Research** | Starts automatically on room create; next planet pre-researched during each debrief so rematch is instant. Host's **Start** is enabled once a round is committed. |
| **Briefing** | Not counted against the build timer. Host taps **Begin build**. |
| **Build** | Timer runs server-side; ends at 0:00 (or host locks early). |
| **Evaluate** | Reducer applies the evaluation formula; writes result + reason. |
| **Rematch** | New round id, new planet, grid and mass budget reset. |

---

## Mission requirements (set by research)

The round's win criteria are **produced by the research agent** from the planet's real data. The structure is fixed (3 requirements, same formula), but **every threshold, which twist applies, which pieces are usable, and the mass budget** come from researched values. Players see them on the **Mission Requirements Card** in the briefing — each line says *what*, *how much*, and *because of which real fact*:

> **Power through the night** — store 6 power of night load × 3 · *because a lunar night lasts ~14 Earth days* (NASA Moon Fact Sheet)
> **Life support** — 12 water + 12 O₂ units · *ice is available in shadowed craters* (LCROSS) · *no usable atmosphere for O₂*
> **Radiation shielding** — 4 berms · *surface dose ~1.4 mSv/day, no atmosphere* (Chang'e 4 LND)

Crew size (**4**, one per player) and mission length (**30 sols**) are fixed so rounds stay comparable; everything else comes from research.

### Research → criteria

| Requirement | Researched inputs | What the research decides |
| --- | --- | --- |
| **Power** (always) | Insolation, dust, day length, temperature | Solar output per array; **night storage** needed (night band); **thermal load** added to the base load |
| **Life support** (always) | BVAD crew rates; water/ice presence; atmosphere composition | Water & O₂ thresholds (from BVAD); whether the **ice drill** is usable (ice tiles exist); whether the **O₂ unit** needs water or uses CO₂ |
| **Twist** (one) | Radiation dose, atmosphere, temperature, dust record | Which twist applies and its threshold (see below) |
| **Mass budget** | All of the above | Cheapest winning build under these criteria × 1.25 (see **Evaluation**) |

### Twists (agent picks one from what its research triggers)

| Twist | Triggered by research showing | Threshold set by research |
| --- | --- | --- |
| **Radiation** | Surface pressure < 0.01 bar, or exoplanet atmosphere unknown | **4** berms adjacent to habitat; **6** if measured surface dose > 10 mSv/day (e.g. Europa, inside Jupiter's radiation belts) |
| **Thermal** | Mean surface temp (or `pl_eqt`) < 250 K or > 330 K | **+1 power** (200–250 K or 330–400 K) · **+2 power** (< 200 K or > 400 K) — heating or cooling |
| **Dust storms** | Recorded global dust storms (Mars) | Solar output **×0.5**; night band **+1** (max 3) |

If several trigger, the agent picks one, preferring a twist **different from last round**, and writes a one-line justification citing the fact. If none trigger, default to **Radiation**.

A twist's effect applies **only when it is the chosen twist** (e.g. Mars with Dust chosen gets the solar ×0.5 and night +1, but no thermal load), so every round has exactly 3 requirements.

### Research supplies the facts, server computes the thresholds

- The research produces **sourced parameters** (each tied to a tool fetch — see **Research pipeline**). The criteria follow from those parameters by the rules above, so **different research → different criteria**.
- `commit_round` **computes every threshold** (night band, thermal load, ISRU availability, berm count) from the committed parameters. The agent never does the math, so it can't get it wrong.
- The agent decides **which planet, which twist** (among those the data triggers), and **how each requirement is explained**. Every because-line must reference a parameter row, so explanations can't drift from the data.

### Life-support units (shown in debrief, from BVAD)

- **1 water unit ≈ 30 kg** → 12 units ≈ 360 kg ≈ 4 crew × 30 sols × ~3 kg/person/day.
- **1 O₂ unit ≈ 8.4 kg** → 12 units ≈ 100 kg ≈ 4 crew × 30 sols × ~0.84 kg/person/day.

---

## Piece library

Mass is in **cargo units (CU)**. The **habitat** (2×2) is pre-placed at grid center and draws **4 power** (life support for 4 crew). Pieces can be **removed for a full refund**.

| Piece | Mass | Power | Gives | Placement | Planet data it depends on |
| --- | --- | --- | --- | --- | --- |
| **Solar array** | 1 | +3 × insolation (cap 2.0), day only | Power | Lit tiles | Insolation, dust |
| **Battery** | 2 | — | Covers 2 power of night load per night band | Anywhere; needs ≥ 1 solar to charge | Night length |
| **Reactor** (fission) | 10 | +6 flat, day and night | Power | Anywhere | — (the "far from the star" answer) |
| **Water tank** | 2 | — | +6 water | Anywhere | — |
| **O₂ tank** | 2 | — | +6 O₂ | Anywhere | — |
| **Ice drill** | 2 | −2 | +18 water | **Ice tiles only** | Water/ice presence |
| **O₂ unit** | 1 | −1 | +12 O₂; **uses 6 water** unless atmosphere is CO₂-rich | Anywhere | Atmosphere composition |
| **Berm** (Overburden) | **0** | — | Radiation shielding | Orthogonally adjacent to habitat | Gravity sets build time |

**Build time:** all pieces place instantly except **berms**: hold for `2s + 2s × min(g / 9.8, 1)` (Moon ≈ 2.3s, Mars ≈ 2.8s).

### Core tradeoffs

- **Ship it vs make it:** tanks are heavy but need no power; drill / O₂ unit are light but cost power.
- **Mass vs time:** berms cost no mass but cost build time and tiles near the habitat.
- **Solar vs reactor:** solar is cheap per CU but weak far from the star and needs batteries for long nights.
- **Grid placement:** drills need ice tiles (often shaded), solar needs lit tiles, berms compete for habitat-adjacent tiles.

### Balance check (starting values)

Cheapest winning build per planet should differ — this is what makes planets feel different.

| Planet (twist from research) | Cheapest build | CU | Lesson |
| --- | --- | --- | --- |
| **Moon south pole** (radiation) | Reactor + ice drill + 2 O₂ tanks + 4 berms | 16 | 14-day night kills solar; polar ice in shadowed craters |
| **Mars** (dust storms) | Reactor + O₂ unit (CO₂ air) + 2 water tanks | 15 | Make O₂ from the atmosphere (like NASA's MOXIE) |
| **Titan** (thermal, 94 K → +2) | Reactor + 2 water tanks + 2 O₂ tanks | 18 | ~1% of Earth's sunlight; heating eats your power |
| **Bright exoplanet** (insolation 1.5, radiation) | 1 solar + 4 batteries + tanks + 4 berms | 17 | Near a star with short nights, solar wins |

### Mass budget

`budget = ceil(cheapest winning build × 1.25)`, clamped to **14–24 CU**. Every planet ends up equally tight (~25% slack). If the cheapest build is over 24 CU, redraw the planet.

---

## Grid

- **8×8**, 2D. Habitat **2×2** at center → **8** habitat-adjacent tiles for berms.
- **Shaded tiles:** 12, generated per round (crater shadows / terrain).
- **Ice tiles:** 4 if the planet has water/ice, else 0. On polar bodies (Moon, Mercury) ice tiles are **inside shaded tiles** — real permanently shadowed craters.
- Solar on lit tiles only; drills on ice tiles only; everything else anywhere free.
- Everyone sees everyone's **live cursor** (name + color).
- **Coordinates** labeled on the grid edges (columns **A–H**, rows **1–8**) so spoken hints can point at tiles ("put a drill on the ice at C6").

---

## What players see

| Visible | Hidden |
| --- | --- |
| Build timer | Whether each requirement currently passes |
| Mass used / remaining | Aggregate production totals |
| Placed pieces |  |
| Per-piece stats **on this planet** on hover (e.g. "Solar: +1.3 power here (0.43× Earth sunlight)") |  |
| Mission Requirements Card — thresholds + the fact behind each (no checkmarks) |  |
| Headline fact + planet card (re-openable) |  |
| Hint captions (live transcript of the voice) |  |

---

## Evaluation & board read

Counts below only include validly placed pieces.

```
load      = 4 + 2·drills + 1·o2_units + thermal_load        # thermal_load 0/1/2 from research
reactor   = 6 · reactors
solar     = Σ lit solar arrays · 3 · min(insolation, 2) · (dust ? 0.5 : 1)
band      = night ≤ 24 h → 1 · ≤ 10 Earth days → 2 · longer → 3   (+1 if dust, max 3)

Power      : reactor + solar ≥ load
             AND batteries ≥ ceil(max(0, load − reactor) / 2) · band
             AND (batteries = 0 OR solar arrays ≥ 1)
Water      : 6·water_tanks + 18·drills − (co2_atmosphere ? 0 : 6·o2_units) ≥ 12
O₂         : 6·o2_tanks + 12·o2_units ≥ 12
Radiation  : berms adjacent to habitat ≥ required (4 or 6, from researched dose)
```

- **Evaluation** runs once at 0:00 and stores per-requirement pass/fail + reason.
- **Board read** (computed by the Node service at each voice cue from public tables, using the same shared code):
  - **Diagnosis:** per-requirement status, the **worst-failing requirement, its shortfall, and the planet fact responsible** (e.g. "Power: night short by 4; night = 14 Earth days").
  - **Suggestion:** from the winnability enumeration, the winning build **closest to the current board** (fewest adds/removes, then least mass) → a short action list with tiles, e.g. `add ice_drill @ C6`, `remove solar @ F2`. Tiles = first valid free tile nearest the habitat.
  - **Board summary:** pieces with coordinates, free ice / lit / habitat-adjacent tiles, mass used / remaining, pending berms.
  - **Change since last cue:** requirements that flipped to passing, whether the board changed at all.
  - Players never see the board read directly — only what Mission Control says.
- **Winnability check** (in `commit_round`): brute-force piece counts (solar 0–12, battery 0–9, reactor 0–2, each tank 0–4, drill 0–2, O₂ unit 0–2 → ~90k combos, trivial), confirm one fits the grid's tile constraints, compute cheapest cost, set the mass budget, or reject.

---

## Voice assistant (in-game)

**Listen-only.** Players don't talk to it — Mission Control speaks timed hints. Same voice on **every device**, with a per-device **mute**.

| Topic | Direction |
| --- | --- |
| **Session** | **One Grok Voice session per room, run on the Node service** (not in a browser). Survives host changes. Text in, audio out — no microphones. |
| **What it looks at** | The **grid**: at every cue Node computes a fresh **board read** (diagnosis + suggestion + board summary + change since last cue) and sends it as one text message with the time left and the cue's mode. No tool calls needed. |
| **When it speaks** | Scheduled cues from Spacetime, ~every 20 s, shifting from facts to hints (see schedule below). |
| **Output** | Node broadcasts Grok's audio to **all devices in the room** over WebSocket; transcript written to the `hint` table → **captions on every screen**. |
| **Mute** | Local toggle per device (audio off, captions stay). Default on. |
| **Grounding** | Never does math and never invents numbers — it only phrases the board read, facts, and tiles it was given. |
| **Style** | ≤ 2 sentences. Hints name one requirement, the researched fact behind it, and (later) a piece + tile. |
| **Acknowledge progress** | If a requirement flipped to passing since the last cue, open with a short "Nice — power's covered." |
| **No repeats** | If the board hasn't changed since the last hint, escalate one level instead of repeating. If audio is still playing when a cue fires, skip that cue. |
| **All passing** | Encouragement + a fun fact, and "you can lock in early." |
| **No API key / API down** | Node writes template lines (fun facts verbatim; hints from the board read) to the `hint` table on the same schedule; every device speaks them with browser `speechSynthesis` (still same audio everywhere, still mutable). |

### Cue schedule (2:30 build)

| Time left | Mode | Example |
| --- | --- | --- |
| **2:25** | Welcome + fun fact | "Welcome to the Moon's south pole. A single night here lasts about 14 Earth days." |
| **2:05** | Fun fact | "The ice you're standing near sits in craters that haven't seen sunlight in billions of years — LCROSS confirmed it in 2009." |
| **1:45** | Fun fact (ties to a requirement) | "With no atmosphere, radiation hits the surface at about 1.4 millisieverts a day." |
| **1:30** | Hint — **nudge** (which system is weak) | "Your crew's going to get thirsty." |
| **1:10** | Hint — **direction** (piece type + why) | "Water's short, and this planet has ice — something should be drilling." |
| **0:50** | Hint — **direction** | "Nights here are two weeks long; solar alone won't carry you." |
| **0:30** | Hint — **exact** (piece + tile) | "Put an ice drill on C6." |
| **0:15** | Hint — **exact** / last call | "Two berms next to the habitat — D3 and E3 — and you're done." |

Fun facts come from the research agent (see `write_card`), so they're sourced like everything else. Hint levels are a floor: "no repeats" can push a hint more specific earlier.

---

## Research pipeline

Runs in the **lobby** (and during debrief for the next round) so players never wait.

**Principle: tools fetch, the agent interprets.** Numbers and their sources come from tools, never from the model's memory. The model's job is choosing, connecting, and explaining.

### Provenance rule

- Every fetch tool returns rows of `{ field, value, unit, source_label, source_url, reflink?, fetch_id }`.
- `set_parameter` takes a **`fetch_id` + field**, not a typed-in number. The Node service keeps a per-round fetch cache and **rejects any value that didn't come from a fetch**.
- The only exception is `mark_estimated(field, note)`, which applies the **fixed default** from the profile table and records why the value is unknown. The agent can't choose the estimated value.
- Result: the agent physically can't put an invented number into the game.

### Data tiers

| Tier | What | When | Trust |
| --- | --- | --- | --- |
| **1. Structured API** | NASA Exoplanet Archive TAP (`pscomppars`) | **Live**, every exoplanet round (one ADQL query, ~1s) | High |
| **2. Curated JSON** | `data/solar_system.json` — fact-sheet numbers + mission facts (LCROSS, Curiosity RAD, MOXIE, …) with a source URL per field | **Live read**, hand-verified once | High |
| **3. Web search** | Published findings on specific exoplanets (e.g. JWST observations of rocky exoplanet atmospheres) | **Offline only** — used to build the cached pack, never during a live round | Medium → reviewed by us |

**Tier 3 rules:** a search result may replace an *estimated* field only if its URL is on the domain allowlist (`nasa.gov`, `esa.int`, `arxiv.org`, `iopscience.iop.org`, `nature.com`, `science.org`, `aanda.org`). Every tier-3 value is stored with its quote + URL and **manually reviewed** before it goes into the pack.

### What the agent actually does (where an LLM adds value)

1. **Pick an interesting planet** from the filtered pool (nearby, unusual star, famous system) rather than a uniform random row. 50% solar system / 50% exoplanet; no repeats in a session.
2. **Fetch** via tier 1 or 2 and **map** fetched fields to the profile with `set_parameter(fetch_id, field)`.
3. **Mark unknowns** with `mark_estimated` and write a plain "why we don't know" note (e.g. *"Rotation hasn't been measured; planets this close to their star are often tidally locked."*).
4. **Choose the twist** among those the data triggers (prefer one different from last round) and write a one-line justification referencing the parameter.
5. **Write the card text:** each requirement's because-line, the headline fact, a scale comparison (distance, size vs Earth, sunlight vs Earth), and **3 fun facts** for Mission Control's opening cues (the third ties to a requirement). If `reflink` is present, credit the paper ("radius measured by …").
6. **Narrate** to `research_log` as it goes (shown in the lobby/briefing — the research is part of the show), e.g. *"Querying NASA Exoplanet Archive… TRAPPIST-1 e: 0.66× Earth's sunlight."*
7. **Commit** via `commit_round`. The reducer checks every parameter has a source or estimate note, **computes the thresholds**, runs the winnability check, and sets the mass budget.

### Agent tools

| Tool | Returns / does |
| --- | --- |
| `list_candidates(filter)` | Short list of eligible planets (name, distance, star type) to choose from |
| `fetch_exoplanet(name)` | Tier 1 rows with `fetch_id`, source, `reflink` |
| `fetch_solar_system_body(name)` | Tier 2 rows with `fetch_id`, source |
| `set_parameter(fetch_id, field)` | Copies a fetched value into the round profile |
| `mark_estimated(field, note)` | Applies the fixed default + explanation |
| `choose_twist(kind, justification, param_ref)` | Must be a twist the parameters trigger |
| `write_card(because_lines[], headline, scale_text, fun_facts[3])` | Each line and fun fact references a parameter row |
| `log_step(text)` | Streams to `research_log` |
| `commit_round()` | Server validates, computes thresholds, winnability, budget |

### Rules

- No numbers from model memory; no search during a live round; no agent calls during build.
- **Latency budget: 20s.** On timeout, error, or a failed winnability check (after 2 redraws), draw from the **cached pack**.
- **Cached pack** = the "deep research" edition: ~10 planets (all 6 solar-system bodies + 4 exoplanets) researched offline with tiers 1–3, reviewed by us, and checked into the repo. Same schema as a live round.

---

## Planet pool & profile

### Pool

- **Solar system (6):** Moon (south pole), Mars, Mercury (pole), Ceres, Titan, Europa.
- **Exoplanets:** NASA Exoplanet Archive `pscomppars` table, filtered:
  - `pl_rade` ≤ 1.6 (likely rocky)
  - `pl_insol` between 0.25 and 4
  - `pl_eqt` between 150 and 400 K
  - `sy_dist` known
- Anything that fails the winnability check is redrawn.

### Profile fields

| Field | Drives | Solar system | Exoplanet |
| --- | --- | --- | --- |
| Name, type, distance, size vs Earth | Briefing, scale card | Fact Sheet | `pl_name`, `sy_dist` (pc → ly), `pl_rade` |
| Insolation (Earth = 1) | Solar output | Fact Sheet (solar irradiance / 1361 W/m²) | `pl_insol` |
| Night length | Night band | Fact Sheet (day length / 2) | **Estimated:** band 2 — rotation unknown; close-in planets may be tidally locked |
| Temperature | Thermal twist & load | Fact Sheet mean surface temp | `pl_eqt` |
| Gravity | Berm build time | Fact Sheet | Derived: `pl_bmasse / pl_rade²` × 9.8; **estimated** (assume Earth density) if mass is missing, an upper limit (`pl_bmasselim = 1`), or not a direct measurement (`pl_bmassprov` ≠ "Mass") |
| Atmosphere (pressure, CO₂-rich?) | Radiation twist, O₂ unit mode | Fact Sheet | **Estimated:** unknown → no usable atmosphere |
| Water/ice | Ice tiles | Curated per body with mission source (e.g. LCROSS, MESSENGER, Dawn) | **Estimated:** unknown → no ice |
| Surface radiation dose | Radiation twist threshold (4 vs 6 berms) | Curated with mission source (Moon ~1.4 mSv/day — Chang'e 4 LND; Mars ~0.7 mSv/day — Curiosity RAD; Europa: far higher, Galileo) | **Estimated:** unknown → 4 berms |
| Dust storms | Dust twist | Curated (Mars only) | No |

Each stored parameter row: `{ round_id, field, value, unit, status: sourced | estimated, source_label, source_url, note }`.

Each stored requirement row: `{ round_id, kind: power | life_support | twist, threshold, derived_from: [field…], because_text }` — the card players see, and what the voice and debrief cite.

---

## Research sources

| Source | Tier | Used for | How |
| --- | --- | --- | --- |
| **NASA Exoplanet Archive** — TAP API, `pscomppars` | 1 | Exoplanet radius, mass, insolation, temperature, distance, star type; per-field paper refs (`*_reflink` columns — confirm when writing the query) | Live ADQL query, JSON output |
| **NASA Planetary & Satellite Fact Sheets** | 2 | Solar-system body numbers | **One-time script** scrapes into `data/solar_system.json` with a source URL per field; hand-check the 6 bodies |
| **Mission sources** (LCROSS, MESSENGER, Dawn, MOXIE, Chang'e 4 LND, Curiosity RAD, Galileo) | 2 | Ice presence, CO₂ ISRU, surface radiation dose | Curated fields in `data/solar_system.json` |
| **NASA BVAD** (Baseline Values and Assumptions Document) | 2 | Crew O₂ and water rates | Constants in game config, cited in debrief |
| **Allowlisted web sources** (NASA, ESA, arXiv, journals) | 3 | Exoplanet atmosphere / notable findings | Offline only, reviewed, cached pack |
| **Game constants** | — | Piece stats, mission length, crew size | `packages/shared/src/pieces.ts` (TypeScript, bundled into the module; not presented as research) |

---

## Debrief (learning moment)

- Per-requirement pass/fail with the reason in plain language, linked back to the research line that set it.
- The **real fact behind the result**: "You ran out of power on night 3 — the Moon's night lasts about 14 Earth days."
- Real-world units: "Your crew needed ~360 kg of water and ~100 kg of oxygen for 30 sols."
- Scale card: distance (light-years), size vs Earth, sunlight vs Earth.
- **What we don't know yet**: list of *estimated* fields with their notes.
- Sources with links.

---

## Backend & multiplayer (SpacetimeDB)

| Topic | Notes |
| --- | --- |
| Tables | Public: `room`, `member`, `round`, `planet_parameter`, `requirement`, `tile`, `piece`, `cursor`, `research_log`, `hint`, `result`. Private: `server_config`. Scheduled: build end, `hint_cue`, berm completion, room TTL |
| Player reducers | `create_room`, `join_room`, `start_round`, `begin_build`, `place_piece`, `remove_piece`, `start_berm`, `cancel_berm`, `move_cursor`, `lock_build`, `rematch` |
| Server-only reducers | `commit_round`, `log_research`, `post_hint` (Node service identity only); `set_server_identity` (publisher only) |
| Timer | One-shot scheduled row ends the build at 0:00 and runs evaluation; clients count down locally from `build_ends_at` |
| Lifecycle | `client_connected` / `client_disconnected` mark members online/offline |
| Identity | Anonymous Spacetime identities; token kept in `sessionStorage` (per tab) so a refresh rejoins as the same member and separate tabs are separate players. Online = the identity has at least one live connection. |
| Host migration | On host disconnect, the **longest-joined online member** becomes host. Voice is unaffected (it runs on the Node service). A returning ex-host rejoins as a normal member. |
| Room lifetime | Join code valid while the room exists; room deleted **5 min after the last member leaves**. |
| Disconnects mid-build | Round keeps going; pieces stay. Rejoining shows current state. |
| Trust | Reducers are the only writers; reducers validate tile type, mass budget, adjacency, phase; clients never compute pass/fail. |
| Cursor rate | Client throttles `move_cursor` to ~15/s. |

---

## Acceptance checks

1. Four clients join one code; a placement and live cursors appear on all screens.
2. Research agent (or cached pack) commits a planet; all clients show the same Mission Requirements Card, with every threshold traceable to a sourced parameter.
3. Two different planets produce different requirement cards (different twist or thresholds); `set_parameter` rejects a value with no matching `fetch_id`.
4. Winnability check rejects an impossible planet and sets the budget for a valid one.
5. Opening cues speak sourced fun facts; later cues reflect the **current grid** (failing requirement, its researched fact, and a specific piece + tile at 0:30).
6. A hint plays on all four devices; muting one device silences only that device while captions remain.
7. Host disconnects mid-build; another member becomes host and the round continues.
8. Timer hits 0:00; evaluation and debrief match the formula.
9. Rematch loads a new planet with no stale data.

---

## Demo script

**`[MISSING]`** To write after the core is built (target: one full ~3.5 min round).

---

## Archive

Earlier designs (fixed Moon/Mars sites, longer build + trial phases, roles, host-device voice) are superseded by this document. Recover from git history if needed.
