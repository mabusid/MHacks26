import { useState } from 'react';
import { useReducer } from 'spacetimedb/react';
import { reducers } from '../module_bindings';
import type { RoomData } from '../useRoom';
import { useReducerCall } from '../useReducerCall';

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:8787';
const TEST_PLANETS = [
  ['moon', 'Moon'],
  ['mars', 'Mars'],
  ['titan', 'Titan'],
  ['brightExoplanet', 'Exoplanet (test)'],
] as const;

export default function Lobby({ data }: { data: RoomData }) {
  const { room, next, log, isHost, members } = data;
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
    <div className="stack">
      <section className="panel">
        <p className="label">Share this code</p>
        <p className="room-code">{room.code}</p>
        <p className="muted">
          {members.length < 4 ? `Waiting for crew — ${4 - members.length} seat${4 - members.length === 1 ? '' : 's'} open.` : 'Full crew aboard.'}
        </p>
      </section>

      <section className="panel terminal">
        <p className="label">Mission research</p>
        {log.length === 0 ? (
          <p className="muted blink">Awaiting research…</p>
        ) : (
          <ul className="log">
            {log.slice(-8).map(l => (
              <li key={String(l.id)}>
                <span className="prompt">›</span> {l.text}
              </li>
            ))}
          </ul>
        )}
      </section>

      {ready && (
        <section className="panel ready-card">
          <p className="label">Destination locked</p>
          <h2>{next.planetName}</h2>
          <p>{next.headline}</p>
          <p className="muted small">{next.scaleText}</p>
        </section>
      )}

      {isHost ? (
        <button className="primary" disabled={!ready || start.pending} onClick={() => start.run()}>
          {ready ? 'Start briefing' : 'Waiting for a planet…'}
        </button>
      ) : (
        <p className="muted">{ready ? 'Waiting for the host to start the briefing…' : 'Waiting for research…'}</p>
      )}
      {start.error && <p className="error">{start.error}</p>}

      {import.meta.env.DEV && (
        <details className="dev">
          <summary>Dev: load a test planet</summary>
          <div className="row wrap">
            {TEST_PLANETS.map(([key, label]) => (
              <button key={key} className="secondary" onClick={() => loadTestPlanet(key)}>
                {label}
              </button>
            ))}
          </div>
          {devError && <p className="error">{devError}</p>}
        </details>
      )}
    </div>
  );
}
