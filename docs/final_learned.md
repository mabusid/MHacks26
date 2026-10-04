## Inspiration

Space research produces a huge amount of public data (NASA fact sheets, mission papers, the Exoplanet Archive), but those findings rarely reach a general audience. Satellite imagery and dashboards exist, but planet simulations get complicated fast and can be hard to follow. We wanted something in between: a fun, shared way for friends to explore real planets for a few minutes, where research-backed details set the rules and decide whether your base survives.

## What it does

Mission Control is a 1–4 player co-op learning game. An agent researches a real planet from public NASA data, and that research sets the win criteria. The crew has two minutes on a shared grid to build a base that meets three requirements without going over the mass budget. Each requirement lights up green once it's met. Grok Voice plays the same audio on every device, helping the team through the problem: fun facts early, then hints based on what's on the grid.

## How we built it

| Layer | Role |
| --- | --- |
| **SpacetimeDB** | Authoritative multiplayer state: rooms, placements, timers, and scoring, all through server-side reducers |
| **Shared TypeScript** | Rules, scoring, winnability solver, hint templates. One copy for the database, client, and server |
| **Node service** | Research agent, Grok Voice, and audio broadcast over WebSocket |
| **React + Vite + R3F** | Persistent 3D world behind an HTML HUD; 3D build board drawn under an invisible HTML grid, so taps stay exact |

Research uses live NASA Exoplanet Archive queries and curated solar-system values, and doesn't rely on model memory. The server turns those values into thresholds. A solver then finds the cheapest winning build $m^*$ and sets the budget, so every round is solvable and tight:

$$
B = \operatorname{clamp}\!\left(\left\lceil 1.10\, m^{*} \right\rceil,\ 14,\ 40\right)
$$

At scheduled cues, Mission Control reads the board and fills in an accurate hint template. Grok Voice speaks it on every device, with captions synced to the audio.

## Challenges we ran into

- **One clock for everything:** the briefing, build end, voice cues, and cleanup all needed cancel guards, so a skipped timer could never fire late.
- **Voice on many devices:** browser autoplay rules, gapless PCM streaming, and captions locked to each device's audio clock.
- **Keeping help from solving the game:** exact move hints let a passive crew win, so we capped them to one late cue. The voice confirms reasoning instead of replacing it.
- **3D without losing precision:** we wanted real 3D pieces but also exact taps, A–H / 1–8 labels, keyboard play, and phone support. The HTML grid stays on top as an invisible input layer. A 3D canvas behind it copies the CSS tilt exactly, so every 3D tile sits under its button.
- **Clutter vs. learning:** we split every crowded screen into steps (create *or* join, a team-only lobby, the planet then the mission in the briefing, a paged debrief) while keeping each planet's one teaching moment.

## Accomplishments that we're proud of

- Every in-game number comes from a fetch or is labeled *estimated*. Numeric grounding ($\frac{|n-a|}{|a|} \le 0.03$), a second fact-checker, and a repair loop keep the AI from inventing facts.
- One shared Mission Control voice across devices, with captions tied to each device's audio clock.
- A pixel-art 3D world and board that still play like HTML: exact taps, A–H / 1–8 labels, and an SVG fallback when WebGL isn't available.

## What we learned

1. **AI writing needs layered checks.** Numeric grounding, a second fact-checker, and a bounded repair loop stopped confident but wrong science.
2. **Tool design with defined schemas beats prompt design.** Restructuring fetch outputs fixed field-name mistakes that prompting never did.
3. **Real data can make a game dull without good game design.** A planet-blind "always nuclear" build once won everywhere. Tuning piece costs and budget headroom made planet facts matter again.
4. **Balancing learning and fun.** Exact move hints solved the game for players, and stale budget cues gave wrong information. The voice should confirm reasoning, not replace it.
5. **Screenshots catch what tests can't.** Every check passed while the layout was broken: CSS rule order collapsed the phone board, an invisible canvas swallowed clicks, and our first pixel-art outline pass drew nothing because the example code assumed a different camera. Driving the real game in a headless browser and looking at each screen found all of them.

## What's next for Mission Control

- More curated solar-system bodies and tighter exoplanet filters, so every rematch still feels distinct.
- Classroom / async modes: longer rounds, no voice required, and a shareable debrief with sources for teachers.
- Deeper board reads for Mission Control, so it can acknowledge crew plans without ever handing them the answer.
- More advanced events (e.g. storms) with day cycles, instead of one-off base building.
