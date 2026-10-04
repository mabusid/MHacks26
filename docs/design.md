# Overburden — UI design

Layout, look, and **visual architecture** for every phase. Rules, copy, and visibility: [Plan.md](./Plan.md).

**Direction (target):** a **consistent 3D “planetary ops” look** — the crew is always looking at the same world (orbit → surface → build site), with **mission-control HUD** layered on top. Not Skribbl, not flat dashboard cards on a static SVG.

**Content principle (unchanged):** less to read. Short labels, numbers over sentences, one line per idea. Detail (sources, full facts) is one click away, never on the main HUD during build.

**Status:** this document describes the **target** UI. Implementation may still match the older 2D layout until the visual refactor lands; treat sections marked **(target)** as the source of truth for that work.

---

## Feasibility — React, React Three Fiber, Next.js

| Question | Answer |
| --- | --- |
| **Can we get a 3D look with React Three Fiber (R3F)?** | **Yes.** An 8×8 base, instanced pieces, planet ground, and a shared “hero” camera are well within what R3F + Three.js handle in the browser. Multiplayer cursors, berm hold progress, and placement preview map cleanly to 3D highlights and optional HTML labels. |
| **What should be 3D vs 2D?** | **3D:** planet surface, habitat, placed pieces, tile highlights, optional lobby/debrief “establishing” camera on the same scene. **2D (HTML/CSS):** menus, room code, requirements list, timer, mass budget, Mission Control bar, toasts, modals — fixed HUD overlays (industry standard: HTML for menus/HUD, 3D for the world). Use `@react-three/drei` `Html` only for labels tied to world positions (e.g. player nameplates above tiles); do **not** use `Html` for full-screen menus. |
| **Keep Vite or move to Next.js?** | **Keep Vite + React for the game client** unless you add a separate marketing site. The app is WebSocket/subscription-driven with no need for SSR of game state. Next.js adds routing/build complexity without helping SpacetimeDB or realtime play. **Optional:** a small Next.js (or static) landing page later; the playable client stays a Vite SPA importing `packages/shared` and generated bindings. |
| **Stack recommendation (target)** | **Vite + React + TypeScript + `@react-three/fiber` + `@react-three/drei`** for the 3D layer; existing CSS (or a thin design-token layer) for HUD. State and reducers unchanged — only presentation moves. |
| **Risks** | Mobile GPU/thermal (keep meshes simple, limit post-processing); text readability on 3D (rely on HUD); accessibility (keyboard focus must stay on HTML overlays). Mitigate with low-poly assets, consistent HUD chrome, and testing on a mid-range phone. |

---

## Game UI best practices (applied to Overburden)

These follow common HUD/menu guidance (readable at a glance, fixed “homes” for critical info, thematic consistency, minimal occlusion) and align with platform accessibility guidance on predictable layout and not relying on color alone ([HUD readability & hierarchy](https://pageflows.com/resources/game-hud/), [UI consistency](https://github.com/Roblox/creator-docs/blob/main/content/en-us/production/game-design/ui-ux-design.md), [XAG 112 navigation consistency](https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/112), [overlay vs in-scene UI](https://threejsresources.com/guides/ui-hud)).

| Practice | How Overburden uses it |
| --- | --- |
| **Critical info only on the HUD** | Build: timer, mass budget, three requirement one-liners (+ expand for facts). No live pass/fail meters (per Plan). Everything else in collapsible panels or post-match debrief. |
| **Fixed slots across phases** | Same **chrome positions** everywhere: top = mission title / planet / phase; center = **3D viewport**; bottom = primary voice line (Mission Control) when relevant; host primary action **bottom-right of the HUD panel**, not floating in the world. |
| **Visual hierarchy** | Timer = largest type during build; planet name = secondary; tertiary = CU and requirement icons. Urgent (&lt; 0:30) = motion + color, not only color. |
| **Consistency** | One **theme token set** (color, type, radius, panel material) for all HTML HUD. Crew colors match cursor/nameplate in 3D. Requirement icons (⚡ 💧 ⚠) same in briefing, build, debrief. |
| **Don’t block the playfield** | HUD panels sit on **edges**; 3D board stays centered with safe padding. On narrow screens, stack HUD below the viewport — never cover the tile you’re placing on. |
| **Diegetic vs non-diegetic** | **Diegetic:** base pieces, ground, dust/ice materials, habitat. **Non-diegetic:** room code, research log, timer, Mission Control — styled as **glass command UI**, not floating in-world billboards (except short player nameplates). |
| **Accessibility** | Keyboard: 1–8, R, tab order through HUD only. Tooltips/errors as text, not color alone (valid = teal outline **and** cursor change; invalid = red **and** toast message). Respect `prefers-reduced-motion` for camera drift and urgent blink. Target WCAG-minded contrast on HUD text (4.5:1 body, 3:1 large timer). |
| **Test & iterate** | Check layout at 360×640, 1280×720, ultrawide; two-tab multiplayer; worst case = full palette + all nameplates visible. |

---

## Visual theme — “Orbital Command”

One art direction for every phase so screens feel like one product.

### Mood

- **Genre:** co-op space engineering briefing, not arcade sci-fi neon.
- **Camera language:** slow, authoritative moves (lobby orbit → briefing push-in → build isometric/top-down tactical → debrief pull-back). Same planet mesh; only camera and lighting emphasis change.
- **Materials:** matte regolith, brushed metal habitat, emissive accents only for **interactive** and **selected** states (teal), warnings (amber/red).

### Design tokens (HUD — implement as CSS variables)

| Token | Role | Target value (starting point) |
| --- | --- | --- |
| `--hud-bg` | Panel fill | Near-black blue `rgba(8, 12, 20, 0.88)` |
| `--hud-border` | Panel edge | Cool grey 16% alpha |
| `--hud-accent` | Primary actions, valid placement | Teal `#2dd4bf` |
| `--hud-warn` | Host actions, estimated data | Amber `#fbbf24` |
| `--hud-danger` | Urgent timer, fail, invalid | Coral `#f87171` |
| `--hud-ok` | Success, pass | Green `#4ade80` |
| `--hud-text` / `--hud-muted` | Body / secondary | `#e2e8f0` / `#8e9ab0` |
| `--hud-mono` | Numbers, codes, research log | System monospace stack |
| `--hud-radius` | Panels, buttons | `14px` |
| `--hud-blur` | Glass panels | `12px` backdrop blur |

### Planet palettes (3D ground + fog + light tint)

Same **rule-driven** mapping as today (dust twist → rust, low solar → ice, berms+ice → airless grey, default exo → purple). Apply to:

- Terrain albedo / fog color
- Ambient + key light color
- Subtle HUD accent tint (5–10% mix into `--hud-border`, not full recolor)

**Do not** ship a different layout per planet — only materials and lighting.

### Typography

- **Display:** planet name, OVERBURDEN logotype — heavy, wide tracking.
- **HUD:** UI sans (system stack).
- **Data:** monospace for codes, timer, mass, research log, Mission Control line.

### Motion

- Camera: ease-in-out, 0.8–2.5 s between phase defaults; no handheld shake.
- UI: 150–250 ms fades/slides on panel open; line-in for research log rows.
- Reduced motion: disable camera drift, urgent blink, and nonessential transitions.

---

## Shell layout — all phases **(target)**

Every screen uses the same **three-layer stack**:

```
┌─────────────────────────────────────────────────────────────┐
│  TOP BAR (phase label · planet name · optional leave)         │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│              FULL-VIEWPORT 3D SCENE (R3F Canvas)            │
│         (planet / base site — interactive only in Build)    │
│                                                             │
├─────────────────────────────────────────────────────────────┤
│  BOTTOM DOCK — Mission Control line (when voice is active)  │
└─────────────────────────────────────────────────────────────┘
        ┌──────────────────────┐
        │  SIDE / CENTER HUD   │  ← HTML panels; position per phase
        └──────────────────────┘
```

- **3D layer:** always mounted once per session where possible (avoid remounting WebGL on every route change) to prevent flicker and reload cost.
- **HUD layer:** React HTML on top of the canvas (`position: absolute` inset 0, pointer-events none on wrapper, `auto` on controls) — not drei `Html` for full panels.

---

## Screens at a glance **(target)**

| Phase | 3D scene | HUD organization |
| --- | --- | --- |
| **Home** | Distant planet / station exterior (non-interactive) | Center **one** login card: title, name, Create, Join |
| **Lobby** | Slow orbit of target planet (or generic rock before research) | **Two-column HUD** over lower third: **Crew** (left) · **Mission intel** (right) |
| **Briefing** | Push-in to landing zone; habitat visible, no grid lines | **Center card:** planet, 2 key numbers, 3 requirement lines, countdown; **Skip** host-only |
| **Build** | Isometric/tactical view of **8×8 build pad** + habitat; pieces are 3D meshes | **Top:** timer (center), mass (right), planet + leave (left). **Right rail:** requirements + facts drawer. **Bottom:** piece palette. **Bottom dock:** Mission Control |
| **Debrief** | Same site as build, time-frozen; optional success/fail lighting | Same **two-column HUD** as lobby: Crew · **Verdict + results** |

---

## 3D world rules

### Shared “site” model

- One logical **outpost pad** (8×8 cells) embedded in terrain; habitat fixed center 2×2.
- **Lobby / Briefing / Debrief:** show pad with **preview pieces** or empty pad + habitat only — **no placement**, no grid emphasis (no glowing cell lines).
- **Build:** faint cell grid on pad only; hover preview as **raised outline** or emissive rim on the tile mesh.

### Pieces **(target)**

Replace emoji on the board with **simple low-poly meshes** (consistent scale, readable silhouette from isometric angle). Palette buttons show **the same icon/thumbnail** as the 3D mesh (render thumbnail or shared SVG ortho).

### Multiplayer presence

- **3D:** colored marker on pad + optional `Html` nameplate above (crew color = token list).
- **Hide** offline players’ markers (unchanged rule).

### Placement feedback **(target)**

| Feedback | Treatment |
| --- | --- |
| Valid hover | Teal emissive edge + HUD tooltip with tile name |
| Invalid hover | Red edge + toast between palette and pad |
| Berm hold | Circular progress on pad (mesh or screen-space ring aligned to tile) |
| Errors | Toast + short shake on pad (reduced-motion: toast only) |

---

## Phase specs

### Home

- **3D:** hero planet or orbital shot; subtle auto-rotate.
- **HUD:** single centered card (not split). Primary CTA = Create (accent fill); Join = secondary row with code field.
- **Consistency:** card uses `--hud-*` tokens; no one-off colors.

### Lobby — HUD columns (replaces “split card on SVG”)

```
┌─────────────────────────────────────────────────────────────┐
│  [ 3D: planet orbit ]                                        │
│                                                              │
│  ┌─────────────────┐  ┌──────────────────────────────┐  │
│  │ CREW            │  │ MISSION INTEL                 │  │
│  │ MHKT  copy      │  │ (research log streaming…)     │  │
│  │ ● Ana    host   │  │ → then planet + headline      │  │
│  │ ○ open seat     │  │    + 2–3 key numbers          │  │
│  │ Leave           │  │              [ START ] host   │  │
│  └─────────────────┘  └──────────────────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

- **Left — Crew:** room code (tap copy), swatches, host badge, open seats, Leave.
- **Right — Intel:** streaming log (mono) → summary card; host **Start** aligned bottom-right inside panel.
- **Dev:** test-planet loader lives inside Intel panel (dev only).

### Briefing

- **3D:** camera finishes push-in; pad visible.
- **HUD:** centered translucent card (same width as today ~460px): planet name, 1–2 key numbers, **same 3 requirement rows** as build rail (icons + one line each), large countdown.
- **~10 s**, not counted in build timer; host **Skip**.
- Requirement copy **must match** build right-rail verbatim.

### Build

```
┌─────────────────────────────────────────────────────────────┐
│ Mars · Leave          ⏱ 1:42                    12 / 20 CU │
├───────────────────────────────────────┬─────────────────────┤
│                                       │ REQUIREMENTS        │
│         [ 3D build pad ]              │ ⚡ …                │
│                                       │ 💧 …                │
│         [ piece palette ]             │ ⚠ …                 │
│                                       │ Planet facts ▸      │
│                                       │ [ Lock in early ]   │
├───────────────────────────────────────┴─────────────────────┤
│ MISSION CONTROL  "…"  (typewriter · tap bar mute)          │
└─────────────────────────────────────────────────────────────┘
```

- **No crew column** — presence = 3D cursors/nameplates only.
- **Timer:** top center, largest HUD element; urgent styling &lt; 0:30.
- **Palette:** directly under 3D viewport (HTML), not inside the canvas.
- **Requirements:** right rail; tap opens facts/sources drawer (same content as today).
- **Mission Control:** full-width bottom dock; typewriter; tap to mute; muted state on bar.
- **Interaction:** pointer raycast to tile index; keyboard 1–8, R unchanged.

### Debrief

- **3D:** frozen build state or cleared pad with habitat; lighting reflects pass/fail.
- **HUD:** same two-column shell as lobby.
  - **Left:** Crew (unchanged).
  - **Right:** **MISSION SUCCESS / FAILED** (display size), three results with ✓/✗ + one reason each, key fact callout, Sources link, host **Next planet**.

---

## Phones (&lt; 1024px) **(target)**

- **3D viewport:** fixed aspect (e.g. 1:1 or 4:3) at top of stack; pinch optional later — v1 **no orbit** during build.
- **HUD order:** top bar → 3D pad → palette → requirements (collapsible) → Mission Control dock **sticky** bottom.
- **Lobby / debrief:** stack Crew above Intel; 3D height ~40vh max so panels remain reachable.

---

## Build details (behavior unchanged; visual mapping)

| Feature | Visual **(target)** |
| --- | --- |
| Leave room | Top-left text button in top bar |
| Remove mode | Palette ✕; selected state = danger border |
| Berm hold | Progress ring on tile |
| Placement preview | Teal/red tile rim |
| Placement errors | Toast under viewport |
| Offline crew | Hide 3D cursor/nameplate |
| Host lock-in | Bottom of requirements rail (warn styling) |
| Dev board read | Collapsed section in requirements rail (dev only) |

---

## Implementation notes (for developers; no code in this doc)

1. **Introduce R3F in `client/`** behind a single `GameViewport` component; keep phase routing in React as today.
2. **Single Canvas** per room session; swap camera presets and `interactive` flag by phase.
3. **HUD:** extract shared primitives (`HudPanel`, `HudButton`, `RequirementRow`, `CrewList`) used on Home, Lobby, Briefing, Build, Debrief.
4. **Deprecate** the full-screen SVG `BaseScene` for phase backdrops once 3D establishing shots ship; until then, 2D fallback is acceptable.
5. **Performance budget:** &lt; 100 draw calls for pad + pieces; instancing for repeated piece types; no heavy post-processing on mobile.
6. **Do not** put game logic in the render loop; grid index from raycast → existing reducers only.

---

## Reference links

- [Three.js / R3F: HTML HUD overlay vs in-scene UI](https://threejsresources.com/guides/ui-hud)
- [drei `Html` (world-attached labels only)](https://drei.docs.pmnd.rs/misc/html)
- [Game HUD readability & hierarchy (2024 overview)](https://pageflows.com/resources/game-hud/)
- [UI consistency in games (Roblox creator docs)](https://github.com/Roblox/creator-docs/blob/main/content/en-us/production/game-design/ui-ux-design.md)
- [Xbox Accessibility Guideline 112 — consistent navigation](https://learn.microsoft.com/en-us/gaming/accessibility/xbox-accessibility-guidelines/112)
