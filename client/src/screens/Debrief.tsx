import { useEffect, useState } from 'react';
import { useReducer } from 'spacetimedb/react';
import TeamPanel from '../components/TeamPanel';
import { reducers } from '../module_bindings';
import type { RoomData } from '../useRoom';
import { useReducerCall } from '../useReducerCall';

const ICON: Record<string, string> = { power: '⚡', life_support: '💧', twist: '⚠' };
const STINGER_MS = 1200;

/** Stinger (TIME / LOCKED IN) → verdict. Split card: crew | outcome (docs/design.md → Debrief). */
export default function Debrief({ data }: { data: RoomData }) {
  const { current, results, requirements, params, isHost, next } = data;
  const nextPlanet = useReducerCall(useReducer(reducers.rematch));
  const [showSources, setShowSources] = useState(false);
  const [stinger, setStinger] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setStinger(false), STINGER_MS);
    return () => clearTimeout(t);
  }, []);
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
  const firstFail = results.find(r => !r.pass);
  const keyFact = firstFail ? requirements.find(r => r.kind === firstFail.kind)?.because : current.headline;
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
                  <span>{r.reason}</span>
                </li>
              ))}
            </ul>
            {keyFact && <p className="key-fact">{keyFact}</p>}
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
