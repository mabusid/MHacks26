import { useCallback, useEffect, useRef, useState } from 'react';
import { useReducer } from 'spacetimedb/react';
import { PIECES, rulesFromRound, type PieceKind, type TileKind } from '@overburden/shared';
import BoardReadPanel from '../components/BoardReadPanel';
import Grid, { type Tool } from '../components/Grid';
import MissionControlBar from '../components/MissionControlBar';
import Palette from '../components/Palette';
import RequirementList from '../components/RequirementList';
import LeaveButton from '../LeaveButton';
import { reducers } from '../module_bindings';
import { usablePieces } from '../pieceArt';
import type { RoomData } from '../useRoom';
import { clock, useSecondsLeft } from '../useSecondsLeft';

/** Build screen (docs/design.md → Build): top bar · board + palette · requirements rail · Mission Control. */
export default function Build({ data }: { data: RoomData }) {
  const { current, requirements, params, tiles, pieces, cursors, members, me, isHost, room } = data;
  const left = useSecondsLeft(current?.buildEndsAt?.microsSinceUnixEpoch);
  const [confirmLock, setConfirmLock] = useState(false);
  const [tool, setTool] = useState<Tool>('solar');
  const [hoverInfo, setHoverInfo] = useState<string>();
  const [toast, setToast] = useState<string>();
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const place = useReducer(reducers.placePiece);
  const remove = useReducer(reducers.removePiece);
  const moveCursor = useReducer(reducers.moveCursor);
  const lock = useReducer(reducers.lockBuild);

  const showError = useCallback((e: unknown) => {
    setToast(e instanceof Error ? e.message : String(e));
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(undefined), 2500);
  }, []);

  // Keyboard: 1–9 pick a piece in palette order, R = remove (arrows/Enter on the board itself).
  const usable = current ? usablePieces(rulesFromRound(current)) : [];
  const usableKey = usable.join();
  useEffect(() => {
    const keys = usableKey.split(',') as PieceKind[];
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLInputElement) return;
      const n = Number(e.key);
      if (n >= 1 && n <= keys.length) setTool(keys[n - 1]);
      else if (e.key.toLowerCase() === 'r') setTool('remove');
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [usableKey]);

  // Mass flashes when it changes so the budget is noticed without reading.
  const massUsed = pieces.reduce((m, p) => m + PIECES[p.kind as PieceKind].mass, 0);
  const [massFlash, setMassFlash] = useState(false);
  const prevMass = useRef(massUsed);
  useEffect(() => {
    if (prevMass.current === massUsed) return;
    prevMass.current = massUsed;
    setMassFlash(true);
    const t = setTimeout(() => setMassFlash(false), 400);
    return () => clearTimeout(t);
  }, [massUsed]);

  if (!current || !me || !room) return null;
  const rules = rulesFromRound(current);
  const massLeft = current.massBudget - massUsed;
  const tileKinds = tiles.map(t => t.kind as TileKind);
  const urgent = left !== undefined && left <= 30;

  return (
    <div className="game">
      <header className="game-top">
        <div className="game-context">
          <span className="game-planet">{current.planetName}</span>
          <span className="game-leave">
            <LeaveButton />
          </span>
        </div>
        <span className={urgent ? 'game-timer urgent' : 'game-timer'} role="timer" aria-label={`${left ?? 0} seconds left`}>
          {clock(left ?? 0)}
        </span>
        <div className={`mass ${massLeft < 0 ? 'over' : ''} ${massFlash ? 'flash' : ''}`} aria-label={`Mass ${massUsed} of ${current.massBudget} cargo units`}>
          <div className="mass-bar">
            <div className="mass-fill" style={{ width: `${Math.min(100, (massUsed / current.massBudget) * 100)}%` }} />
          </div>
          <span className="mass-text">{massLeft < 0 ? `over by ${-massLeft} CU` : `${massUsed} / ${current.massBudget} CU`}</span>
        </div>
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
            onCursor={(x, y, visible) => moveCursor({ x, y, visible }).catch(() => undefined)}
            onInfo={setHoverInfo}
          />
        ) : (
          <p className="muted">Loading terrain…</p>
        )}
        <div className="toast-slot" role="status" aria-live="polite">
          {toast && <p className="toast">{toast}</p>}
        </div>
        <Palette tool={tool} onTool={setTool} rules={rules} massLeft={massLeft} hoverInfo={hoverInfo} />
      </main>

      <aside className="game-side">
        <p className="label">Requirements</p>
        <RequirementList requirements={requirements} params={params} />
        {import.meta.env.DEV && tileKinds.length === 64 && <BoardReadPanel rules={rules} tiles={tileKinds} pieces={pieces} budget={current.massBudget} />}
        {isHost &&
          (confirmLock ? (
            <div className="lock-confirm" role="group" aria-label="Confirm lock in">
              <p>Score the base now for everyone?</p>
              <div className="row">
                <button className="primary" onClick={() => lock().catch(showError)}>
                  Lock in
                </button>
                <button className="secondary" onClick={() => setConfirmLock(false)}>
                  Keep building
                </button>
              </div>
            </div>
          ) : (
            <button className="secondary lock-btn" onClick={() => setConfirmLock(true)}>
              ★ Lock in early
            </button>
          ))}
      </aside>

      <footer className="game-bottom">
        <MissionControlBar roomCode={room.code} hint={data.latestHint} standby={`Mission Control standing by on ${current.planetName}.`} />
      </footer>
    </div>
  );
}
