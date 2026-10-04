import { useEffect, useMemo, useState } from 'react';
import { useReducer } from 'spacetimedb/react';
import { PIECES, PIECE_KINDS, rulesFromRound, solveRound, type Counts, type PieceKind, type TileKind } from '@overburden/shared';
import CrewStrip from '../components/CrewStrip';
import StepDots from '../components/StepDots';
import PieceIcon from '../components/PieceIcon';
import { reducers } from '../module_bindings';
import type { RoomData } from '../useRoom';
import { useReducerCall } from '../useReducerCall';

const ICON: Record<string, string> = { power: '⚡', life_support: '💧', twist: '⚠' };
/** Row names short enough for the name column (the twist by its kind). */
const SHORT: Record<string, string> = { power: 'Power', life_support: 'Life support', radiation: 'Shielding', thermal: 'Thermal', dust: 'Dust storms' };
const STINGER_MS = 1200;

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

/**
 * Stinger (TIME / LOCKED IN) → pages, one idea each: the verdict, why it failed (skipped on a success), and the
 * best build here with the host's Next planet. Each player pages at their own pace.
 */
export default function Debrief({ data }: { data: RoomData }) {
  const { current, results, requirements, pieces, tiles, isHost } = data;
  const nextPlanet = useReducerCall(useReducer(reducers.rematch));
  const [stinger, setStinger] = useState(true);
  const [page, setPage] = useState(0);
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
  const name = (kind: string) => SHORT[kind === 'twist' ? current.twist : kind] ?? 'Twist';

  if (!scored) {
    return (
      <div className="card debrief">
        <p className="label">{current.planetName}</p>
        <p className="muted blink">Scoring…</p>
      </div>
    );
  }

  const failed = results.filter(r => !r.pass);
  const pages = ['verdict', ...(failed.length ? ['why'] : []), 'best'] as const;
  const at = pages[Math.min(page, pages.length - 1)];

  return (
    <div className="card debrief" key={at}>
      {at === 'verdict' && (
        <>
          <p className="label">{current.planetName}</p>
          <h2 className={success ? 'verdict ok' : 'verdict bad'}>{success ? 'Mission success' : 'Mission failed'}</h2>
          <ul className="verdict-rows">
            {results.map(r => (
              <li key={String(r.id)} className={r.pass ? 'pass' : 'fail'}>
                <span className="result-mark" aria-label={r.pass ? 'passed' : 'failed'}>
                  {r.pass ? '✓' : '✗'}
                </span>
                <span aria-hidden>{ICON[r.kind]}</span> {name(r.kind)}
              </li>
            ))}
          </ul>
        </>
      )}

      {at === 'why' && (
        <>
          <p className="label">What went wrong</p>
          {/* Only the failures, each with the planet fact behind it — that's the lesson. */}
          <ul className="why-list">
            {failed.map(r => (
              <li key={String(r.id)}>
                <p className="why-head">
                  <span aria-hidden>{ICON[r.kind]}</span> {r.reason}
                </p>
                {because(r.kind) && <p className="why-fact">{because(r.kind)}</p>}
              </li>
            ))}
          </ul>
        </>
      )}

      {at === 'best' && (
        <>
          <p className="label">{success && cheapest && massUsed <= cheapest.mass ? 'Perfect build' : 'Cheapest base that works here'}</p>
          {cheapest ? (
            <>
              <ul className="answer-pieces big" aria-label={buildText(cheapest.counts)}>
                {PIECE_KINDS.filter(k => cheapest.counts[k] > 0).map(k => (
                  <li key={k} title={PIECES[k].label}>
                    <PieceIcon kind={k} size={34} />
                    <span>×{cheapest.counts[k]}</span>
                  </li>
                ))}
              </ul>
              <p className="answer-mass">
                <strong>{cheapest.mass} CU</strong> <span className="muted">· yours {massUsed} CU</span>
              </p>
            </>
          ) : (
            <p className="muted">Working it out…</p>
          )}
          <div className="debrief-foot">
            {isHost ? (
              <button className="primary big" disabled={nextPlanet.pending} onClick={() => nextPlanet.run()}>
                Next planet
              </button>
            ) : (
              <p className="muted">Waiting for the host…</p>
            )}
            {nextPlanet.error && <p className="error">{nextPlanet.error}</p>}
            <CrewStrip data={data} />
          </div>
        </>
      )}

      <StepDots step={pages.indexOf(at)} count={pages.length} onStep={setPage} />
    </div>
  );
}
