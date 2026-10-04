// Look lab (docs/look.md): the 3D world alone, with every phase and planet theme one click away.
// Dev only: open /lab.html on the Vite dev server. `\` toggles styled/raw.

import { StrictMode, useState } from 'react';
import { createRoot } from 'react-dom/client';
import World, { type WorldPhase } from './components/World';
import './index.css';

const PHASES: WorldPhase[] = ['home', 'lobby', 'briefing', 'build', 'debrief'];
const THEMES = ['theme-space', 'theme-airless', 'theme-dust', 'theme-ice', 'theme-exo'];

function Lab() {
  const params = new URLSearchParams(location.search);
  const [phase, setPhase] = useState<WorldPhase>((params.get('phase') as WorldPhase) ?? 'home');
  const [theme, setTheme] = useState(params.get('theme') ?? 'theme-dust');
  const bar = { position: 'fixed', left: 16, display: 'flex', gap: 6, flexWrap: 'wrap', zIndex: 2 } as const;
  return (
    <>
      <World phase={phase} theme={theme} />
      <div style={{ ...bar, top: 16 }}>
        {PHASES.map(p => (
          <button key={p} className={p === phase ? 'primary small-btn' : 'secondary small-btn'} onClick={() => setPhase(p)}>
            {p}
          </button>
        ))}
      </div>
      <div style={{ ...bar, top: 64 }}>
        {THEMES.map(t => (
          <button key={t} className={t === theme ? 'primary small-btn' : 'secondary small-btn'} onClick={() => setTheme(t)}>
            {t.replace('theme-', '')}
          </button>
        ))}
      </div>
      <p className="muted" style={{ position: 'fixed', left: 16, bottom: 8, zIndex: 2 }}>
        \ toggles styled / raw
      </p>
    </>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Lab />
  </StrictMode>
);
