import { useEffect, useMemo, useState } from 'react';
import { useReducer } from 'spacetimedb/react';
import { PIECES, PIECE_KINDS, rulesFromRound, solveRound, type Counts, type PieceKind, type TileKind } from '@overburden/shared';
import CrewStrip from '../components/CrewStrip';
import PieceIcon from '../components/PieceIcon';
import { paramLabel } from '../format';
import { reducers } from '../module_bindings';
import type { RoomData } from '../useRoom';
import { useReducerCall } from '../useReducerCall';

const ICON: Record<string, string> = { power: '⚡', life_support: '💧', twist: '⚠' };
const SHORT: Record<string, string> = { power: 'Power', life_support: 'Life support' };
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

/** Stinger (TIME / LOCKED IN) → verdict. One compact card beside the base (docs/design.md → Debrief). */
export default function Debrief({ data }: { data: RoomData }) {
  const { current, results, requirements, params, pieces, tiles, isHost, next } = data;
  const nextPlanet = useReducerCall(useReducer(reducers.rematch));
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

  const failed = results.filter(r => !r.pass).length;
  const name = (kind: string) => (kind === 'twist' ? (requirements.find(r => r.kind === kind)?.title ?? 'Twist') : SHORT[kind]);

  return (
    <div className="card debrief">
      <header className="debrief-head">
        <p className="label">{current.planetName}</p>
        {!scored ? (
          <p className="muted blink">Scoring…</p>
        ) : (
          <>
            <h2 className={success ? 'verdict ok' : 'verdict bad'}>{success ? 'Mission success' : 'Mission failed'}</h2>
            <p className="muted">{success ? 'Every system held.' : `${results.length - failed} of ${results.length} systems held.`}</p>
          </>
        )}
      </header>

      {scored && (
        <>
          {/* One row per requirement; the planet fact only where it failed — that's the lesson. */}
          <ul className="results">
            {results.map(r => (
              <li key={String(r.id)} className={r.pass ? 'pass' : 'fail'}>
                <span className="result-mark" aria-label={r.pass ? 'passed' : 'failed'}>
                  {r.pass ? '✓' : '✗'}
                </span>
                <span className="result-name">
                  <span aria-hidden>{ICON[r.kind]}</span> {name(r.kind)}
                </span>
                <span className="result-text">
                  {r.reason}
                  {!r.pass && because(r.kind) && <span className="result-why">{because(r.kind)}</span>}
                </span>
              </li>
            ))}
          </ul>

          {cheapest && (
            <section className="answer-key">
              <div className="answer-head">
                <p className="label">{success && massUsed <= cheapest.mass ? 'Perfect build' : 'Cheapest base here'}</p>
                <p className="answer-mass">
                  <strong>{cheapest.mass} CU</strong> <span className="muted">· yours {massUsed}</span>
                </p>
              </div>
              <ul className="answer-pieces" aria-label={buildText(cheapest.counts)}>
                {PIECE_KINDS.filter(k => cheapest.counts[k] > 0).map(k => (
                  <li key={k} title={PIECES[k].label}>
                    <PieceIcon kind={k} size={26} />
                    <span>×{cheapest.counts[k]}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="key-fact">
            <p className="label">Did you know?</p>
            <p>{current.headline}</p>
          </section>

          {(sources.length > 0 || unknown.length > 0) && (
            <details className="more">
              <summary>Sources & what we don’t know yet</summary>
              {unknown.length > 0 && <p className="muted small">Not yet measured: {unknown.join(' · ')}</p>}
              {sources.length > 0 && <p className="muted small">Sources: {sources.join(' · ')}</p>}
            </details>
          )}
        </>
      )}

      <footer className="debrief-foot">
        {isHost ? (
          <button className="primary big" disabled={!scored || nextPlanet.pending} onClick={() => nextPlanet.run()}>
            {next?.status.tag === 'Ready' ? `Next planet: ${next.planetName}` : 'Next planet'}
          </button>
        ) : (
          <p className="muted">Waiting for the host to pick the next planet…</p>
        )}
        {nextPlanet.error && <p className="error">{nextPlanet.error}</p>}
        <CrewStrip data={data} />
      </footer>
    </div>
  );
}
