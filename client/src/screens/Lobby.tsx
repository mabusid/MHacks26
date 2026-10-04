import { useState } from 'react';
import { useReducer } from 'spacetimedb/react';
import TeamPanel from '../components/TeamPanel';
import { factChips } from '../format';
import { reducers } from '../module_bindings';
import type { RoomData } from '../useRoom';
import { useReducerCall } from '../useReducerCall';

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:8787';
const TEST_PLANETS = [
  ['moon', 'Moon'],
  ['mars', 'Mars'],
  ['titan', 'Titan'],
  ['brightExoplanet', 'Exoplanet'],
] as const;

export default function Lobby({ data }: { data: RoomData }) {
  const { room, next, log, isHost, params } = data;
  const start = useReducerCall(useReducer(reducers.startRound));
  const [devError, setDevError] = useState<string>();
  if (!room) return null;
  const ready = next?.status.tag === 'Ready';

  async function loadTestPlanet(planet: string) {
    setDevError(undefined);
    try {
      const res = await fetch(`${SERVER_URL}/dev/commit-fixture?room=${room!.code}&planet=${planet}`, { method: 'POST' });
      if (!res.ok) setDevError((await res.json()).error ?? `HTTP ${res.status}`);
    } catch {
      setDevError(`Can't reach the server at ${SERVER_URL}`);
    }
  }

  return (
    <div className="card split">
      <TeamPanel data={data} />
      <div className="half planet">
        {ready ? (
          <>
            <p className="label">Destination</p>
            <h2 className="planet-name">{next.planetName}</h2>
            <p className="headline">{next.headline}</p>
            <ul className="chips" aria-label="Key facts">
              {factChips(params).map(c => (
                <li key={c.label} className="chip">
                  <span aria-hidden>{c.icon}</span>
                  <strong>{c.text}</strong>
                  <span className="chip-label">{c.label}</span>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <>
            <p className="label">Researching destination</p>
            <ul className="log">
              {log.length === 0 && <li className="blink">› awaiting research…</li>}
              {log.slice(-5).map(l => (
                <li key={String(l.id)}>› {l.text}</li>
              ))}
            </ul>
          </>
        )}

        <div className="planet-foot">
          {isHost ? (
            <button className="primary big" disabled={!ready || start.pending} onClick={() => start.run()}>
              {ready ? 'Start mission' : 'Researching…'}
            </button>
          ) : (
            <p className="muted">{ready ? 'Waiting for the host…' : 'Waiting for research…'}</p>
          )}
          {start.error && <p className="error">{start.error}</p>}

          {import.meta.env.DEV && (
            <details className="dev">
              <summary>dev: test planet</summary>
              <div className="row wrap">
                {TEST_PLANETS.map(([key, label]) => (
                  <button key={key} className="secondary small-btn" onClick={() => loadTestPlanet(key)}>
                    {label}
                  </button>
                ))}
              </div>
              {devError && <p className="error">{devError}</p>}
            </details>
          )}
        </div>
      </div>
    </div>
  );
}
