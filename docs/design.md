# Overburden — UI design

Layout only. Rules and visibility: [Plan.md](./Plan.md). **Look:** mission control / space briefing — not Skribbl’s art style.

**Principle: less to read.** Short labels, numbers over sentences, one line per idea. Detail (sources, full facts) is one click away, never on the main screen.

## Screens at a glance

| Screen | Frame |
| --- | --- |
| **Home** | Base-scene backdrop + one clean menu card |
| **Lobby** | Base-scene backdrop + **split card** (team \| planet) |
| **Briefing** | Short automatic transition (~10 s countdown) between Start and the build |
| **Build** | Full game screen: grid left, requirements right, timer top center, Mission Control bottom |
| **Debrief** | Same **split card** as the lobby |

## Base-scene backdrop (Home, Lobby, Briefing, Debrief)

A large, dimmed illustration of a base on a planet surface: habitat in the middle with a few placed pieces around it (solar arrays, tanks, a drill, berms). **Not a grid** — no tile lines, nothing clickable. It sits behind every non-build screen so they feel like one place. Tinted per planet once one is chosen (airless grey, dusty rust, icy amber/teal, exoplanet purple).

## Home

Backdrop + a single centered card:

```
        ┌────────────────────┐
        │     OVERBURDEN     │
        │ name [__________]  │
        │ [  CREATE ROOM  ]  │
        │ code [____] [JOIN] │
        └────────────────────┘
```

Big, clearly labeled buttons; one short tagline at most.

## Split card (Lobby, Debrief)

One wide rectangle in the middle of the screen, **cut down the center** into two halves:

```
┌──────────────────┬──────────────────────┐
│  TEAM            │  PLANET              │
│  code  MHKT ⧉    │                      │
│  ● Ana   host    │  (lobby: research    │
│  ● Ben           │   log → planet       │
│  ● Cy            │   summary)           │
│  ○ open seat     │                      │
│                  │  [ host action ]     │
└──────────────────┴──────────────────────┘
```

- **Left — team:** room code (tap to copy), crew with colors (same colors as their cursors), host badge, open seats, Leave.
- **Right — planet:** changes by phase.
  - **Lobby:** research log while researching → then planet name, one headline fact, 2–3 key numbers (e.g. sunlight, night length, temperature). Host: **Start**.
  - **Debrief:** see below.

## Briefing — transition into the match

Shown **briefly and automatically** after the host presses Start, then the build begins on its own — no Begin build click.

```
┌─────────────────────────────────────────┐
│              MARS                       │
│   43% of Earth’s sunlight · −63 °C      │
│                                         │
│   ⚡ Power, day and night               │
│   💧 12 water + 12 O₂                    │
│   ⚠ Dust: solar output halved          │
│                                         │
│        Build starts in  7               │
└─────────────────────────────────────────┘
```

- Same backdrop, one centered card: planet name, 1–2 numbers, the **3 requirements as one line each**, a big countdown.
- **~10 s**, not counted against the 2:30 build timer. Host can **Skip** to start immediately.
- The same 3 one-liners stay on the right side of the build screen, so nothing here has to be memorized.

## Build

```
┌─────────────────────────────────────────────────────────────┐
│ planet          ⏱ 1:42 (big, top center)        12/20 CU   │
├──────────────────────────────────────┬──────────────────────┤
│                                      │  REQUIREMENTS        │
│   8×8 placement grid                 │  ⚡ Power  day+night  │
│   (A–H / 1–8 labels,                 │  💧 12 water + 12 O₂  │
│    live named cursors)               │  ⚠ 4 berms           │
│                                      │                      │
│   piece palette                      │  (tap for planet     │
│                                      │   facts + sources)   │
├──────────────────────────────────────┴──────────────────────┤
│ MISSION CONTROL ▸ "Water's short, and this planet has ice…" │
│ (text types out as it speaks · tap this bar to mute/unmute) │
└─────────────────────────────────────────────────────────────┘
```

- **No crew panel.** Crew presence = **live named cursors** on the grid in each player's color.
- **Timer:** top center, largest element; turns red under 0:30.
- **Grid left, requirements right.** Requirements are the 3 one-liners (no pass/fail, per Plan.md); tapping opens planet facts and sources.
- **Piece palette** directly under the grid; hover/long-press a piece for its stats on this planet.
- **Mission Control bar** along the bottom: the line **types out in sync with the voice** (typewriter). **Tap the bar to mute/unmute** this device — no separate speaker icon. Muted state is shown on the bar; text still types out.
- **Mass** (used / budget) top right — players need it for every placement decision.

## Debrief (split card)

- **Left:** team (same as lobby).
- **Right:** big **MISSION SUCCESS / FAILED**, then the 3 requirements each with ✓/✗ and **one short reason**, plus the single real fact behind the result (e.g. “Lunar night ≈ 14 Earth days”). Sources behind a “Sources” link. Host: **Next planet**.

## Phones (< 1024px)

Home / split card: halves stack (team above planet). Build: top bar → grid → palette → requirements (collapsible) → Mission Control bar pinned at the bottom.

## Build details (decided in Phase 5)

- **Leave room** during the build: small button next to the planet name (top left).
- **Remove mode**: last button in the palette (✕, full refund); keyboard **1–8** pick pieces, **R** remove.
- **Berm hold progress**: ring around the berm fills over the hold time; letting go cancels.
- **Placement preview**: hovered tile outlined teal (valid) or red (invalid, reason in the tooltip).
- **Placement errors**: brief toast between the grid and the palette.
- **Offline crew**: their cursors are hidden.
- **Dev planet loader**: lobby right half, dev builds only.

## Still to decide

- **Host-only controls** during the build (lock in early) — Phase 6.
