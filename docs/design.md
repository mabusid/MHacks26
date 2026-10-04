# Overburden — UI design

Layout only. Rules and visibility: [Plan.md](./Plan.md). **Look:** mission control / space briefing — not Skribbl’s art style.

## Skribbl.io → Overburden (structure only)

| Skribbl | Overburden |
| --- | --- |
| Top bar — code, round | Code, planet, phase, build timer, mass (CU), mute |
| Center — canvas | **8×8 grid**, live cursors (A–H / 1–8 labels) |
| Right — players | **Crew** (4, colors, host); **Mission** tab = requirements card (no pass/fail) |
| Bottom — chat | **Mission Control captions** (read-only; v1 no player chat) |
| Tools by canvas | **Piece palette**, remove mode, berm hold progress |

Co-op, not a scoreboard. Palette under the grid on narrow screens; mission card in a drawer so the grid stays large.

## Top bar

Room code (copy), planet name (opens planet card), phase, timer during build only (`build_ends_at` on client), mass used/budget, mute (audio off, captions on). Host: start briefing, begin build, lock early, rematch.

## Phases

**Home** — create / join (code + name); no game shell.

**Lobby** — center: research log; right: crew; host starts briefing when round is ready.

**Briefing** — Mission Requirements Card + headline fact; host **Begin build** (no auto-advance).

**Build** — primary shell:

```
┌ top bar ─────────────────────────────────────────────────────────┐
├─────────────────────────────┬──────────────────────────────────┤
│  8×8 grid (habitat, tiles,  │  Crew + [Mission] drawer         │
│  cursors)                   │                                  │
│  piece palette              │                                  │
├─────────────────────────────┴──────────────────────────────────┤
│  Hint captions (voice transcript)                              │
└────────────────────────────────────────────────────────────────┘
```

Place / remove / berm hold; hover for planet-specific piece stats. Do not show live requirement pass/fail or resource totals (Plan.md).

**Debrief** — pass/fail per requirement, facts, sources; host rematch.

## Visual notes

Subtle planet background behind grid; clear lit / shaded / ice tiles; named cursors. Demo at **≥1024px** width; phones stack top → grid → palette → captions.
