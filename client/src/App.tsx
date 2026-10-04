import { useSpacetimeDB, useTable } from 'spacetimedb/react';
import { tables } from './module_bindings';
import Home from './screens/Home';
import Lobby from './screens/Lobby';

export default function App() {
  const { isActive, identity } = useSpacetimeDB();
  // Phase 1: small tables, subscribe to everything. Phase 4 scopes subscriptions to the player's room.
  const [members, membersReady] = useTable(tables.member);
  const [rooms, roomsReady] = useTable(tables.room);

  if (!isActive || !identity || !membersReady || !roomsReady) {
    return <main className="screen">Connecting…</main>;
  }

  const me = members.find(m => m.identity.isEqual(identity));
  const room = me && rooms.find(r => r.id === me.roomId);
  if (!me || !room) return <Home />;

  const roomMembers = members
    .filter(m => m.roomId === room.id)
    .sort((a, b) => (a.joinedAt.microsSinceUnixEpoch < b.joinedAt.microsSinceUnixEpoch ? -1 : 1));
  return <Lobby room={room} members={roomMembers} me={me} />;
}
