import { useEffect, useState } from 'react';
import { useReducer } from 'spacetimedb/react';
import TeamPanel from '../components/TeamPanel';
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

/**
 * Team only: who's in and the code to share. The planet stays a surprise until the briefing; research runs in
 * the background, and if the host launches before it's done, the launch waits for it.
 */
export default function Lobby({ data }: { data: RoomData }) {
  const { room, next, log, isHost } = data;
  const start = useReducerCall(useReducer(reducers.startRound));
  const [launching, setLaunching] = useState(false);
  const [devError, setDevError] = useState<string>();
  const ready = next?.status.tag === 'Ready';

  useEffect(() => {
    if (launching && ready && !start.pending) {
      setLaunching(false);
      start.run();
    }
  }, [launching, ready, start]);

  if (!room) return null;

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
    <div className="card lobby">
      <TeamPanel data={data} />
      <div className="lobby-foot">
        {isHost ? (
          launching ? (
            <p className="launching">
              <span className="blink">●</span> Locating landing site…
              {log.length > 0 && <span className="launch-log">{log[log.length - 1].text}</span>}
            </p>
          ) : (
            <button className="primary big" disabled={start.pending} onClick={() => (ready ? start.run() : setLaunching(true))}>
              Launch
            </button>
          )
        ) : (
          <p className="muted">Waiting for the host to launch…</p>
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
  );
}
