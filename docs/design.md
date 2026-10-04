# Overburden — UI design

Layout, look, and transitions for every phase. Rules, copy, and visibility: [Plan.md](./Plan.md). The 3D world's rendering style and camera: [look.md](./look.md).

**Direction:** one **3D world** behind everything (a persistent React Three Fiber scene: planet → landing site → build site), with a **mission-control HUD** in HTML on top. The interactive **build board stays an HTML grid**, tilted for depth (2.5D) — exact taps, crisp A–H / 1–8 labels, keyboard play, and phones all keep working. *(Decided after an independent design review: a 3D raycast board would cost precision, accessibility, and phone usability for little gain.)*

**Content principle:** less to read. Short labels, numbers over sentences, one line per idea. Detail (sources, full facts) is one tap away, never on the main HUD during the build.

---

## Stack

| Layer | Choice |
| --- | --- |
| 3D world | `@react-three/fiber` 9 + `@react-three/drei` 10 (React 19 compatible) — **one `<Canvas>` mounted for the whole session**, behind the HUD, never remounted between phases. Low-poly procedural terrain and habitat in toon materials, drawn through a low-res "pixel diorama" post pass (look.md). Renders on demand during the build and under reduced motion; DPR capped at 2 (only the final upscale pays for it). |
| Board | HTML/CSS grid (focusable buttons with aria-labels), CSS 2.5D tilt on wide screens, **flat top-down on phones**. Tiles are thick terrain slabs. Pieces are isometric 3D models (same art in palette and on the board). |
| HUD | Screen-space HTML panels with `--hud-*` design tokens (no in-world HTML). |
| Fallback | If WebGL is unavailable or the context is lost, the scene is replaced by the CSS/SVG backdrop. The game is fully playable without 3D. |

---

## Best practices (how they apply here)

| Practice | Overburden |
| --- | --- |
| Critical info only | Build HUD = timer, mass, 3 requirement lines, palette + one info line, Mission Control. No live pass/fail (Plan). |
| Fixed homes | Top bar = context (planet, host, leave) · center = world/board · right rail = requirements · bottom = palette then Mission Control. Same positions in every phase that uses them. |
| Hierarchy | Timer largest during the build; planet name secondary; everything else tertiary. |
| Color is never alone | Valid tile = teal rim **+ dot**; invalid = dimmed, **no dot**; over budget = coral **+ "over by N"**; pass/fail = ✓/✗ glyphs. Tile types use **pattern + legend**, not only shade. |
| Reserved colors | Teal = valid/primary, coral = invalid/urgent/fail, green = success, amber = host/estimated. **Crew colors avoid all four:** blue `#60a5fa`, pink `#f472b6`, yellow `#facc15`, violet `#a78bfa`. |
| Don't block the play area | Panels sit on edges; the board never sits under a panel; toasts appear between board and palette. |
| Touch | No hover-only information: selecting a tool marks **all valid tiles at once**; requirement details expand on tap; the info line mirrors any tooltip. Targets ≥ 40 px. |
| Keyboard | Arrow keys move between tiles (DOM buttons), Enter places, 1–9 pick pieces, R = remove. |
| Motion | Camera moves only in the briefing (hides loading) and debrief; ease-in-out 1.5–2.5 s. `prefers-reduced-motion`: no camera moves, no blink. **The build timer never starts while the camera is moving.** |
| Contrast | HUD text ≥ 4.5:1, timer ≥ 3:1 large. |

---

## Theme — "Orbital Command"

Matte regolith, brushed-metal habitat, emissive teal only for interactive/selected, amber/coral for warnings. Calm, authoritative camera — no shake, no neon arcade.

**Tokens** (CSS variables): `--hud-bg rgba(8,12,20,.88)` · `--hud-border` cool grey 16% · `--hud-accent #2dd4bf` · `--hud-warn #fbbf24` · `--hud-danger #f87171` · `--hud-ok #4ade80` · `--hud-text #e2e8f0` · `--hud-muted #8e9ab0` · `--hud-radius 14px` · `--hud-blur 12px` · monospace for numbers, codes, logs, Mission Control.

**Planet palettes** (rule-driven, as today): dust twist → rust, low sunlight → icy amber/teal, airless with ice → grey, exoplanet → purple. Applied to terrain, fog, light tint, and a 5–10% tint on HUD borders. **Never a different layout per planet.**

---

## Screen layer stack

```
┌──────────────────────────────────────────────┐
│ TOP BAR (context)                            │   HTML
├──────────────────────────────────────────────┤
│        3D WORLD (persistent <Canvas>)        │   R3F, no pointer events
│        + HUD panels / board on top           │   HTML
├──────────────────────────────────────────────┤
│ MISSION CONTROL (build only)                 │   HTML
└──────────────────────────────────────────────┘
```

| Phase | 3D world | HUD |
| --- | --- | --- |
| **Home** | Generic planet as a horizon below the card, slow drift | One centered card: title, name, **Create room**, code + **Join** |
| **Lobby** | Destination planet as a horizon once researched (generic before) | Split card: **Crew** · **Mission intel** |
| **Briefing** | Camera drops from orbit to the landing site (2.2 s); base framed left of the card | Centered card: planet, headline fact, 1–2 numbers, goal line, 3 requirement lines, countdown |
| **Build** | Static terrain around the site | Top bar · 2.5D board + palette · right rail · Mission Control |
| **Debrief** | Build site, camera pulls back and slowly orbits the base | Split card: **Crew** · **Verdict** |

---

## Phase specs

### Home
Card over the orbiting planet. Primary = Create (teal fill); Join = code field + button. Clicking either also enables sound (browser autoplay rule). No top bar.

### Lobby
```
┌────────────────────┬───────────────────────────────┐
│ CREW               │ MISSION INTEL                  │
│ MHKT  ⧉ copy       │ › Querying NASA archive…       │
│ ■ Ana  ★ host      │ › Sunlight 0.65× Earth’s       │
│ ■ Ben              │ → TRAPPIST-1 e                 │
│ ○ open seat        │   headline · 2–3 key numbers   │
│ [🔊 Sound on]      │                    [ START ]   │
│ Leave              │   (host) or "Waiting for host" │
└────────────────────┴───────────────────────────────┘
```
- **Crew:** code (tap to copy), color swatch, ★ host, open seats, **Sound on/off** for this device, Leave.
- **Intel:** research log streams (mono) → planet card. Host **Start** bottom-right; while research runs it reads "Researching…" (disabled). Dev test-planet loader lives here (dev only).

### Briefing (~12 s, automatic)
Centered card: planet name, **headline fact** (the planet's learning moment), 1–2 numbers, one **goal line** ("Fill all 3 before time runs out · stay under 33 CU"), the **same 3 requirement lines as the build rail** (icon + one line), "Build starts in N". Host sees **Skip**. The camera push-in happens during this countdown.

### Build
```
┌──────────────────────────────────────────────────────────────┐
│ Mars · ★ Ana · Leave        ⏱ 1:02          ▓▓▓▓▓░░ 12/27 CU │
├──────────────────────────────────────────┬───────────────────┤
│      A  B  C  D  E  F  G  H              │ REQUIREMENTS      │
│   1  ▢  ▢  ▨  ▢  ▢  ▢  ▢  ▢   (tilted)   │ ⚡ Power … ▸       │
│   2  ▢  ☀  ▢  ▢  ▢  ▢  ▢  ▢              │ 💧 12 water … ▸    │
│   …        [ HAB ]                       │ ⚠ 4 berms … ▸     │
│   legend: ▢ sunlit ▨ shaded ❄ ice        │ Planet facts ▸     │
│  ─ toast slot ─                          │                   │
│  [pieces … ⛰ berm][✕ remove]             │ [Lock in early] ★ │
│  Solar: +1.3 power by day · sunlit tiles │                   │
├──────────────────────────────────────────┴───────────────────┤
│ MISSION CONTROL  "Water’s short — this planet has ice…"       │
└──────────────────────────────────────────────────────────────┘
```
- **Top bar:** planet, ★ host name, Leave (left) · timer (center, largest; coral + blink under 0:30) · mass **bar + numbers** (right; coral + "over by N" when over; flashes on change).
- **Board:** A–H / 1–8 edge labels; tile types by pattern + legend (sunlit bright, shaded dark + striped, ice blue); habitat 2×2 as a 3D module; pieces as isometric 3D models sitting on the pad; live named cursors in crew colors (offline hidden).
- **Tool selected →** all valid tiles get a teal rim + dot; invalid tiles dim (no dot). Hover/focus puts the tile name and reason in the info line.
- **Palette:** 9 pieces + Remove (two rows of five on phones), all one click/tap (no press-and-hold anywhere). Disabled pieces say why ("over budget", "no ice here", "no night here", "not needed"). The **info line** under the palette says what the selected piece does *on this planet*.
- **Right rail:** 3 requirement lines stating the planet's **conditions** ("Power through 15-day nights"), never piece counts; **tap to expand** the rule in words + researched reason; Planet facts & sources; host **Lock in early** (in-HUD confirm, not a browser dialog); dev board read (dev only).
- **Mission Control bar:** typewriter caption; tap = mute this device; "tap to enable sound" (amber) when the browser blocked audio.

### Debrief
- Stinger first (~1 s, full width): **TIME** or **LOCKED IN**, then "Scoring…", then the verdict.
- **Crew** (left, as in the lobby). **Verdict** (right): **MISSION SUCCESS / FAILED**, three ✓/✗ rows with one reason each and the researched fact under it, the **answer key** (cheapest base here, with counts, next to the crew's mass), **Did you know?** headline + "Still unknown" fields, Sources link, host **Next planet**.

---

## Transitions

| From → to | Trigger | Screen | Player sees / does |
| --- | --- | --- | --- |
| Home → Lobby | Create / Join | HUD swaps; the canvas stays mounted | Code, crew, research streaming; sound enabled by the click |
| Lobby (researching) | Host wants to start | Start disabled "Researching…" | Log rows stream (fetch steps, then "exploring…" narration while the agent writes); the fallback chain caps research at ~20 s (typically ~3–6 s) |
| Lobby → Briefing | Host **Start** | Camera push-in (~2 s) inside a 12 s countdown | Planet + 3 lines; host may **Skip** |
| Briefing → Build | Countdown ends or Skip | Briefing card fades; HUD fades in (220 ms, opacity only) | 1:30 timer counts from the server's end time; welcome fact ~4 s later |
| Build → Debrief | 0:00 or host Lock in | Stinger **TIME** / **LOCKED IN** → "Scoring…" → verdict | Placing stops immediately |
| Debrief → Briefing | **Next planet** with one prepared | As Lobby → Briefing | Anyone who joined during the debrief is in the crew |
| Debrief → Lobby | **Next planet**, none prepared | Lobby with research streaming | Joins open |
| Any | Host leaves | Toast "Ana left · Ben is host" | Host controls appear on Ben's screen |
| Any | Refresh | Same member rejoins (session token); HUD first, 3D fills in | Bar may say "tap to enable sound" |
| Any | Join attempt mid-round | "Round in progress — join at the debrief" | — |

**Rule change (Plan.md):** players may join in the **lobby or the debrief**, so friends who arrive mid-round get in before the next planet.

---

## Phones (< 1024 px)

Board **flat (no tilt)**, full width (~40 px tiles at 360 px). Order: top bar → board → palette + info line → requirements as a **one-line chip row** (tap to expand) → Mission Control pinned at the bottom. Lobby/debrief halves stack (crew above intel/verdict). The 3D world shows behind at reduced detail.

---

## Implementation order

1. Tokens + crew colors; HUD primitives (top bar, requirement row with tap-to-expand, crew list).
2. Persistent `<World>` canvas in `App` with per-phase camera presets; WebGL fallback to the SVG backdrop.
3. Board: SVG piece icons, tile patterns + legend, valid-tile highlighting, tilt, one-click berms, keyboard tile navigation.
4. Top bar host name + mass bar; in-HUD lock-in confirm; debrief stinger; host-change toast; lobby sound toggle.
5. Module: allow joins during the debrief.
6. Check at 360×640, 1280×720, ultrawide; two-tab play; reduced motion.
