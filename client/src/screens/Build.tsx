import { useState } from 'react';
import MissionControlBar from '../components/MissionControlBar';
import PlanetCard from '../components/PlanetCard';
import RequirementList from '../components/RequirementList';
import { planetTheme } from '../format';
import type { RoomData } from '../useRoom';
import { clock, useSecondsLeft } from '../useSecondsLeft';

/** Build layout (docs/design.md). The grid, palette, and cursors fill the left side in Phase 5. */
export default function Build({ data }: { data: RoomData }) {
  const { current, requirements, params } = data;
  const left = useSecondsLeft(current?.buildEndsAt?.microsSinceUnixEpoch);
  const [showFacts, setShowFacts] = useState(false);
  if (!current) return null;

  return (
    <div className={`game ${planetTheme(current)}`}>
      <header className="game-top">
        <span className="game-planet">{current.planetName}</span>
        <span className={left !== undefined && left <= 30 ? 'game-timer urgent' : 'game-timer'}>{clock(left ?? 0)}</span>
        <span className="game-mass">— / {current.massBudget} CU</span>
      </header>

      <main className="game-board">
        <div className="grid-placeholder">8×8 grid, palette, and live cursors — Phase 5</div>
      </main>

      <aside className="game-side">
        <p className="label">Requirements</p>
        <RequirementList requirements={requirements} />
        <button className="secondary small-btn" onClick={() => setShowFacts(s => !s)}>
          {showFacts ? 'Hide planet facts' : 'Planet facts & sources'}
        </button>
        {showFacts && <PlanetCard round={current} params={params} />}
      </aside>

      <footer className="game-bottom">
        <MissionControlBar line={`Welcome to ${current.planetName}. ${current.headline}`} />
      </footer>
    </div>
  );
}
