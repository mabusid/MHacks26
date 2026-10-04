import { useSpacetimeDB, useTable } from 'spacetimedb/react';
import { tables } from './module_bindings';
import Briefing from './screens/Briefing';
import Build from './screens/Build';
import Debrief from './screens/Debrief';
import Home from './screens/Home';
import Lobby from './screens/Lobby';

export default function App() {
  const { isActive, identity } = useSpacetimeDB();
  // Subscribes to everything for now; Phase 4 scopes subscriptions to the player's room.
  const [members, membersReady] = useTable(tables.member);
  const [rooms, roomsReady] = useTable(tables.room);
  const [rounds] = useTable(tables.round);
  const [requirements] = useTable(tables.requirement);
  const [params] = useTable(tables.planetParameter);
  const [log] = useTable(tables.researchLog);

  if (!isActive || !identity || !membersReady || !roomsReady) {
    return <main className="screen">Connecting…</main>;
  }

  const me = members.find(m => m.identity.isEqual(identity));
  const room = me && rooms.find(r => r.id === me.roomId);
  if (!me || !room) return <Home />;

  const roomMembers = members
    .filter(m => m.roomId === room.id)
    .sort((a, b) => (a.joinedAt.microsSinceUnixEpoch < b.joinedAt.microsSinceUnixEpoch ? -1 : 1));
  const isHost = room.host.isEqual(me.identity);
  const current = rounds.find(r => r.id === room.currentRoundId);
  const next = rounds.find(r => r.id === room.nextRoundId);

  switch (room.phase.tag) {
    case 'Lobby':
      return (
        <Lobby
          room={room}
          members={roomMembers}
          me={me}
          nextRound={next}
          log={log.filter(l => l.roomId === room.id).sort((a, b) => Number(a.id - b.id))}
        />
      );
    case 'Briefing':
      return current ? (
        <Briefing
          round={current}
          requirements={requirements.filter(r => r.roundId === current.id)}
          params={params.filter(p => p.roundId === current.id)}
          isHost={isHost}
        />
      ) : null;
    case 'Build':
      return current ? <Build round={current} /> : null;
    case 'Debrief':
      return current ? <Debrief round={current} /> : null;
  }
}
