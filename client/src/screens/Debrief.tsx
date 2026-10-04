import { useEffect, useMemo, useState } from 'react';
import { useReducer } from 'spacetimedb/react';
import { PIECES, PIECE_KINDS, rulesFromRound, solveRound, type Counts, type PieceKind, type TileKind } from '@overburden/shared';
import TeamPanel from '../components/TeamPanel';
import { paramLabel } from '../format';
import { reducers } from '../module_bindings';
import type { RoomData } from '../useRoom';
import { useReducerCall } from '../useReducerCall';

const ICON: Record<string, string> = { power: '⚡', life_support: '💧', twist: '⚠' };
const STINGER_MS = 1200;
/** Follow from other unknowns (no water → no polar ice; no atmosphere → no weather), so not listed twice. */
const UNKNOWN_SKIP = new Set(['polarIce', 'dustStorms']);

/** "2 solar arrays · 6 batteries · 1 ice drill" */
function buildText(c: Counts): string {
  return PIECE_KINDS.filter(k => c[k] > 0)
    .map(k => {
      const label = PIECES[k].label.replace(/^[A-Z](?=[a-z])/, m => m.toLowerCase()); // keep "O₂"
      const name = c[k] === 1 ? label : k === 'battery' ? 'batteries' : `${label}s`;
      return `${c[k]} ${name}`;
    })
    .join(' · ');
}

/** Stinger (TIME / LOCKED IN) → verdict. Split card: crew | outcome (docs/design.md → Debrief). */
export default function Debrief({ data }: { data: RoomData }) {
  const { current, results, requirements, params, pieces, tiles, isHost, next } = data;
  const nextPlanet = useReducerCall(useReducer(reducers.rematch));
  const [showSources, setShowSources] = useState(false);
  const [stinger, setStinger] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setStinger(false), STINGER_MS);
    return () => clearTimeout(t);
  }, []);
  // The answer key: counts were never shown during the build, so this is where the crew sees what worked.
  // Solved once per round (~0.1 s): `current` and `tiles` are new objects on every update, so key on the round.
  const roundKey = current && tiles.length === 64 ? String(current.id) : undefined;
  const cheapest = useMemo(() => {
    if (!current || !roundKey) return undefined;
    const solved = solveRound(rulesFromRound(current), tiles.map(t => t.kind as TileKind));
    return solved.ok ? solved.cheapest : undefined;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundKey]);
  if (!current) return null;

  // The timer ran out if we're past (about) the scheduled end; otherwise the host locked in.
  const endsAt = current.buildEndsAt ? Number(current.buildEndsAt.microsSinceUnixEpoch / 1000n) : 0;
  const timeUp = Date.now() >= endsAt - 1500;
  if (stinger) {
    return (
      <div className="stinger" role="status">
        {timeUp ? 'TIME' : 'LOCKED IN'}
      </div>
    );
  }

  const scored = results.length > 0;
  const success = current.success === true;
  const because = (kind: string) => requirements.find(r => r.kind === kind)?.because;
  const massUsed = pieces.reduce((m, p) => m + PIECES[p.kind as PieceKind].mass, 0);
  // "What we don't know yet" (Plan.md → Debrief): fields nobody has measured (estimated with no value).
  const unknown = params
    .filter(p => p.status === 'estimated' && p.num === undefined && !UNKNOWN_SKIP.has(p.field))
    .map(p => paramLabel(p.field));
  const sources = [...new Set(params.filter(p => p.sourceLabel).map(p => p.sourceLabel))];

  return (
    <div className="card split">
      <TeamPanel data={data} />
      <div className="half planet">
        <p className="label">{current.planetName}</p>
        {!scored ? (
          <p className="muted blink">Scoring…</p>
        ) : (
          <>
            <h2 className={success ? 'verdict ok' : 'verdict bad'}>{success ? 'Mission success' : 'Mission failed'}</h2>
            <ul className="results">
              {results.map(r => (
                <li key={String(r.id)} className={r.pass ? 'pass' : 'fail'}>
                  <span className="result-mark" aria-label={r.pass ? 'passed' : 'failed'}>
                    {r.pass ? '✓' : '✗'}
                  </span>
                  <span className="req-icon" aria-hidden>
                    {ICON[r.kind]}
                  </span>
                  <span className="result-text">
                    {r.reason}
                    {because(r.kind) && <span className="result-why">{because(r.kind)}</span>}
                  </span>
                </li>
              ))}
            </ul>
            {cheapest && (
              <div className="answer-key">
                <p className="label">{success && massUsed <= cheapest.mass ? 'Perfect build — the cheapest base here' : 'Cheapest base that works here'}</p>
                <p>
                  {buildText(cheapest.counts)} · <strong>{cheapest.mass} CU</strong>
                </p>
                <p className="muted small">Yours: {massUsed} CU</p>
              </div>
            )}
            <div className="key-fact">
              <p className="label">Did you know?</p>
              <p>{current.headline}</p>
              {unknown.length > 0 && <p className="muted small">Still unknown: {unknown.join(' · ')}</p>}
            </div>
            {sources.length > 0 && (
              <button className="link-btn" onClick={() => setShowSources(s => !s)}>
                {showSources ? sources.join(' · ') : 'Sources'}
              </button>
            )}
          </>
        )}

        <div className="planet-foot">
          {isHost ? (
            <button className="primary big" disabled={!scored || nextPlanet.pending} onClick={() => nextPlanet.run()}>
              {next?.status.tag === 'Ready' ? `Next planet: ${next.planetName}` : 'Next planet'}
            </button>
          ) : (
            <p className="muted">Waiting for the host… · friends can join now with the code</p>
          )}
          {nextPlanet.error && <p className="error">{nextPlanet.error}</p>}
        </div>
      </div>
    </div>
  );
}
