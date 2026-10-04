# Overburden — look bible

The visual R&D track for the 3D world. Layout, HUD, and phase specs: [design.md](./design.md). This page only covers **what the world looks like and how the camera moves**.

## The one look: "pixel diorama"

A small, real 3D scene (Three.js) rendered at low resolution and scaled up crisp, so it reads like a hand-made 2D game. Chosen over an "orbital holotable" look: the two mixed muddy each other, and the pixel look gives the planet and site a strong identity for almost no assets.

What we want, in one line each:

- Chunky pixels from a low-res buffer, scaled up with nearest filtering (never blurry).
- Edge lines from depth + normals, **tinted darker than the surface** (never flat black). Creases get a light highlight.
- Banded shading: 3–4 tones per surface, no smooth gradients.
- No external models: primitives and noise only.
- Slow camera. Never static, never frantic.
- HTML is mission control on top; the world is the stage behind it.

## Camera

| | |
| --- | --- |
| Lens | Perspective, **FOV 40°**, no lens tricks; shapes stay flat and readable. |
| Home / lobby | **Planet horizon**: the globe curves across the bottom of the frame, so the centered card sits in open sky above it. Slow drift (±0.35 sway, ±0.25 bob). |
| Briefing | Drop from orbit to the landing site, ease-in-out over **2.2 s**, then a slow drift. The base is framed **left of the centered card** (wide screens). |
| Build | Fixed high angle over the site. **No drift**, and the 3D pad and habitat are hidden: the tilted HTML board is the pad (a 3D slab behind it never lines up across screen sizes). |
| Debrief | Pull back and around the site (2.2 s), then a slow orbit around the base. |
| Transitions | Cubic ease-in-out, 1.5–2.5 s. Nothing moves while the build timer runs. |
| Reduced motion | Cut straight to each shot, no drift, render on demand. |

## Palette

Each planet theme has **6 colors**, and every object in the world draws from them:

| Slot | Use |
| --- | --- |
| `ground` | Main terrain tone |
| `shadow` | Low/dark terrain, crater floors |
| `high` | Ridges, rims, top band of the lit tone |
| `sky` | Background + fog (the same color, so terrain melts into the sky) |
| `sun` | Key light tint |
| `rim` | Back light + atmosphere glow; the planet's signature color |

Shared across all planets: habitat metal `#c9d2de`, habitat accent teal `#2dd4bf` (the HUD accent, the only emissive thing in the world). No other saturated color in the world: HUD reserved colors (teal/coral/green/amber) and crew colors stay readable on top.

Themes (rule-driven as in design.md): space (neutral blue-grey), airless (grey + cold white), dust (rust + peach sun), ice (amber ground under teal rim), exo (purple + lilac rim).

## Silhouettes

- Low poly, thick forms, readable at 1/3 resolution. If a part disappears at 3× pixel size, cut it.
- One material type for everything (`MeshToonMaterial` with the shared 4-step ramp), so every object takes light the same way.
- Every object gets the same post edges (one edge width: 1 low-res pixel).
- Ground contact: a dark blob under anything that stands on the ground.

## Lighting & atmosphere

- One warm/neutral **key** light (the `sun` color) from high front-right.
- One **rim** light from behind in the `rim` color, so silhouettes separate from the sky.
- Low ambient (fill from `sky`), so the shadow band stays dark and readable.
- Fog in the `sky` color, starting just past the pad; the horizon dissolves.
- Planet gets a back-face fresnel shell in `rim` for the atmosphere glow.
- Stars: sparse, 1 low-res pixel each, slow twinkle.

## Post ("style pass")

1. Render the scene to a buffer at **1/3 of screen size** (1/4 on phones, which also cuts cost), with nearest filtering.
2. Edges: linearized depth discontinuities (relative, so they work at any distance) darken toward the `shadow` color; normal creases brighten slightly.
3. Shading is already banded by the toon ramp; post adds a mild color quantization so gradients from fog step instead of smoothing.
4. Integer nearest upscale in the shader: each low-res texel covers exactly N×N device pixels.
5. Debug toggle: **`\`** (backslash) or `?look=raw` switches between styled and raw 3D.

## HTML vs 3D

| 3D (styled) | HTML (crisp) |
| --- | --- |
| Planet, atmosphere, stars | Board grid, labels, taps, keyboard |
| Terrain, craters, landing pad | Pieces on the board (isometric CSS art) |
| Habitat (outside the build) | All text, timer, requirements, Mission Control |

The board is **3D in the same style** (`BoardCanvas.tsx`): tile slabs (shaded tiles sunken, ice tiles with crystals, so color is never the only cue), the habitat, and low-poly piece models (`PieceModel.tsx`) that drop onto the pad, drawn through the same toon ramp and style pass (finer pixels, lower edge threshold). Its camera reproduces the CSS transform of `.board-plane` (`perspective(--persp) rotateX(--tilt-x) rotateZ(--tilt-z)` around the transform-origin, measured from the DOM), so the transparent HTML grid on top still takes every tap, key, and aria label. Without WebGL the HTML/SVG board shows as before. Phones get a gentle 22° tilt in 3D mode (rows stay ≥ ~40 px).

## Performance & fallback

- Low-res buffer makes the scene cheap; DPR up to 2 only affects the final upscale.
- `frameloop="demand"` during the build (static camera) and under reduced motion; camera moves keep frames coming until they land.
- WebGL missing or context lost → the SVG backdrop (unchanged).
- Phones: bigger pixels (1/4), fewer stars, same silhouettes.

## Milestones

| Milestone | Done when | Status |
| --- | --- | --- |
| A. Look bible | This page | ✓ |
| B. Camera + lighting study | A 5 s loop in the look lab (`/lab.html`) feels like a demo with one planet and a light | ✓ (judged from stills; watch the loop in a browser) |
| C. Style pass | Still looks intentional at 1/3 resolution | ✓ |
| D. Phase cameras | Home → brief → build → debrief feel connected | ✓ |
| E. Content pass | Terrain, habitat, and pieces share the palette and edges | ✓ first pass |
| F. Playtest polish | The look never fights taps, timer, or voice | scripted solo run at 1280×720 and 390×844 is clean; still needs a real two-tab playtest |

## Look lab

`/lab.html` (dev server) renders the world alone with buttons for every phase and theme, plus the styled/raw toggle. Use it for look spikes; keep only what matches this page.
