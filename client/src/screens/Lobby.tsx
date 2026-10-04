import { useReducer } from 'spacetimedb/react';
import { MAX_MEMBERS } from '@overburden/shared';
import { reducers } from '../module_bindings';
import type { Member, Room } from '../module_bindings/types';
import { useReducerCall } from '../useReducerCall';

export default function Lobby({ room, members, me }: { room: Room; members: Member[]; me: Member }) {
  const leave = useReducerCall(useReducer(reducers.leaveRoom));
  const iAmHost = room.host.isEqual(me.identity);

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

      {iAmHost ? (
        <button disabled title="Available once a planet is researched (Phase 3)">
          Start
        </button>
      ) : (
        <p className="muted">Waiting for the host to start…</p>
      )}

      <button className="secondary" onClick={() => leave.run()} disabled={leave.pending}>
        Leave room
      </button>
      {leave.error && <p className="error">{leave.error}</p>}
    </main>
  );
}
