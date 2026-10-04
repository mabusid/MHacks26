import { useState } from 'react';
import { useReducer } from 'spacetimedb/react';
import { MAX_MEMBERS } from '@overburden/shared';
import { reducers } from '../module_bindings';
import type { Member, ResearchLog, Room, Round } from '../module_bindings/types';
import LeaveButton from '../LeaveButton';
import { useReducerCall } from '../useReducerCall';

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:8787';
const TEST_PLANETS = [
  ['moon', 'Moon'],
  ['mars', 'Mars'],
  ['titan', 'Titan'],
  ['brightExoplanet', 'Exoplanet (test)'],
] as const;

interface Props {
  room: Room;
  members: Member[];
  me: Member;
  nextRound: Round | undefined;
  log: ResearchLog[];
}

export default function Lobby({ room, members, me, nextRound, log }: Props) {
  const start = useReducerCall(useReducer(reducers.startRound));
  const [devError, setDevError] = useState<string>();
  const iAmHost = room.host.isEqual(me.identity);
  const ready = nextRound?.status.tag === 'Ready';

  async function loadTestPlanet(planet: string) {
    setDevError(undefined);
    try {
      const res = await fetch(`${SERVER_URL}/dev/commit-fixture?room=${room.code}&planet=${planet}`, { method: 'POST' });
      if (!res.ok) setDevError((await res.json()).error ?? `HTTP ${res.status}`);
    } catch {
      setDevError(`Can't reach the server at ${SERVER_URL}`);
    }
  }

  return (
    <main className="screen">
      <p className="muted">Room code</p>
      <p className="room-code">{room.code}</p>

      <h2>
        Crew {members.length}/{MAX_MEMBERS}
      </h2>
      <ul className="members">
        {members.map(m => (
          <li key={m.identity.toHexString()}>
            <span className={m.online ? 'dot online' : 'dot'} title={m.online ? 'online' : 'offline'} />
            {m.name}
            {m.identity.isEqual(me.identity) && <span className="muted"> (you)</span>}
            {room.host.isEqual(m.identity) && <span className="badge">host</span>}
          </li>
        ))}
      </ul>

      <section className="panel">
        <h3>Mission research</h3>
        {log.length === 0 ? (
          <p className="muted">Waiting for research…</p>
        ) : (
          <ul className="log">
            {log.slice(-6).map(l => (
              <li key={String(l.id)}>{l.text}</li>
            ))}
          </ul>
        )}
        {ready && <p className="ok">Planet ready: {nextRound.planetName}</p>}
      </section>

      {iAmHost ? (
        <button disabled={!ready || start.pending} onClick={() => start.run()}>
          {ready ? 'Start' : 'Start (waiting for a planet)'}
        </button>
      ) : (
        <p className="muted">Waiting for the host to start…</p>
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

      <LeaveButton />
    </main>
  );
}
