import { useCallback, useEffect, useRef, useState } from 'react';
import { useReducer } from 'spacetimedb/react';
import { PIECES, rulesFromRound, type PieceKind, type TileKind } from '@overburden/shared';
import BoardReadPanel from '../components/BoardReadPanel';
import Grid, { type Tool } from '../components/Grid';
import MissionControlBar from '../components/MissionControlBar';
import Palette from '../components/Palette';
import PlanetCard from '../components/PlanetCard';
import RequirementList from '../components/RequirementList';
import { planetTheme } from '../format';
import LeaveButton from '../LeaveButton';
import { reducers } from '../module_bindings';
import { PALETTE } from '../pieceArt';
import type { RoomData } from '../useRoom';
import { clock, useSecondsLeft } from '../useSecondsLeft';

/** Build screen (docs/design.md): timer top center, grid + palette left, requirements right, Mission Control bottom. */
export default function Build({ data }: { data: RoomData }) {
  const { current, requirements, params, tiles, pieces, cursors, members, me, isHost } = data;
  const left = useSecondsLeft(current?.buildEndsAt?.microsSinceUnixEpoch);
  const [showFacts, setShowFacts] = useState(false);
  const [tool, setTool] = useState<Tool>('solar');
  const [toast, setToast] = useState<string>();
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const place = useReducer(reducers.placePiece);
  const remove = useReducer(reducers.removePiece);
  const startBerm = useReducer(reducers.startBerm);
  const cancelBerm = useReducer(reducers.cancelBerm);
  const moveCursor = useReducer(reducers.moveCursor);
  const lock = useReducer(reducers.lockBuild);

  const showError = useCallback((e: unknown) => {
    setToast(e instanceof Error ? e.message : String(e));
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(undefined), 2500);
  }, []);

  // Keyboard: 1–8 pick a piece, R = remove.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement) return;
      const n = Number(e.key);
      if (n >= 1 && n <= PALETTE.length) setTool(PALETTE[n - 1]);
      else if (e.key.toLowerCase() === 'r') setTool('remove');
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  if (!current || !me) return null;
  const rules = rulesFromRound(current);
  const massUsed = pieces.reduce((m, p) => m + PIECES[p.kind as PieceKind].mass, 0);
  const massLeft = current.massBudget - massUsed;
  const tileKinds = tiles.map(t => t.kind as TileKind);

  return (
    <div className={`game ${planetTheme(current)}`}>
      <header className="game-top">
        <span className="game-planet">
          {current.planetName}
          <span className="game-leave">
            <LeaveButton />
          </span>
        </span>
        <span className={left !== undefined && left <= 30 ? 'game-timer urgent' : 'game-timer'}>{clock(left ?? 0)}</span>
        <span className={massLeft < 0 ? 'game-mass over' : 'game-mass'}>
          {massUsed} / {current.massBudget} CU
        </span>
      </header>

      <main className="game-board">
        {tileKinds.length === 64 ? (
          <Grid
            tiles={tileKinds}
            pieces={pieces}
            cursors={cursors}
            members={members}
            me={me}
            tool={tool}
            massLeft={massLeft}
            onPlace={i => place({ kind: tool, index: i }).catch(showError)}
            onRemove={i => remove({ index: i }).catch(showError)}
            onDigStart={i => startBerm({ index: i }).catch(showError)}
            onDigEnd={i => cancelBerm({ index: i }).catch(() => undefined)}
            onCursor={(x, y, visible) => moveCursor({ x, y, visible }).catch(() => undefined)}
          />
        ) : (
          <p className="muted">Loading terrain…</p>
        )}
        <div className="toast-slot" role="status" aria-live="polite">
          {toast && <p className="toast">{toast}</p>}
        </div>
        <Palette tool={tool} onTool={setTool} rules={rules} gravity={current.gravity} massLeft={massLeft} />
      </main>

      <aside className="game-side">
        <p className="label">Requirements</p>
        <RequirementList requirements={requirements} />
        <button className="secondary small-btn" onClick={() => setShowFacts(s => !s)}>
          {showFacts ? 'Hide planet facts' : 'Planet facts & sources'}
        </button>
        {showFacts && <PlanetCard round={current} params={params} />}
        {import.meta.env.DEV && tileKinds.length === 64 && (
          <BoardReadPanel rules={rules} tiles={tileKinds} pieces={pieces} budget={current.massBudget} />
        )}
        {isHost && (
          <button
            className="secondary lock-btn"
            onClick={() => {
              if (window.confirm('Lock in now? The base is scored immediately.')) lock().catch(showError);
            }}
          >
            Lock in early
          </button>
        )}
      </aside>

      <footer className="game-bottom">
        <MissionControlBar line={`Welcome to ${current.planetName}. ${current.headline}`} />
      </footer>
    </div>
  );
}
