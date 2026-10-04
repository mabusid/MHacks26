import { useSpacetimeDB, useTable } from 'spacetimedb/react';
import { tables } from './module_bindings';

const NONE = 0n; // ids start at 1; used while a scope is unknown (subscription disabled)

/**
 * Room-scoped subscriptions: my member row → my room's rows → the focused round's rows.
 * Each query re-subscribes when the id it depends on changes.
 */
export function useRoom() {
  const { isActive, identity } = useSpacetimeDB();

  const [mine, mineReady] = useTable(
    identity ? tables.member.where(m => m.identity.eq(identity)) : tables.member.where(m => m.roomId.eq(NONE)),
    { enabled: !!identity }
  );
  const me = mine[0];
  const roomId = me?.roomId ?? NONE;
  const inRoom = !!me;

  const [rooms, roomReady] = useTable(tables.room.where(r => r.id.eq(roomId)), { enabled: inRoom });
  const [members] = useTable(tables.member.where(m => m.roomId.eq(roomId)), { enabled: inRoom });
  const [rounds] = useTable(tables.round.where(r => r.roomId.eq(roomId)), { enabled: inRoom });
  const [log] = useTable(tables.researchLog.where(l => l.roomId.eq(roomId)), { enabled: inRoom });
  const [cursors] = useTable(tables.cursor.where(c => c.roomId.eq(roomId)), { enabled: inRoom });
  const [hints] = useTable(tables.hint.where(h => h.roomId.eq(roomId)), { enabled: inRoom });

  const room = rooms[0];
  // The round on screen: the one being played, or (in the lobby) the one being prepared.
  const focusId = room?.currentRoundId ?? room?.nextRoundId;
  const roundId = focusId ?? NONE;
  const hasRound = focusId !== undefined;
  const [requirements] = useTable(tables.requirement.where(r => r.roundId.eq(roundId)), { enabled: hasRound });
  const [params] = useTable(tables.planetParameter.where(p => p.roundId.eq(roundId)), { enabled: hasRound });
  const [tiles] = useTable(tables.tile.where(t => t.roundId.eq(roundId)), { enabled: hasRound });
  const [pieces] = useTable(tables.piece.where(p => p.roundId.eq(roundId)), { enabled: hasRound });
  const [results] = useTable(tables.result.where(r => r.roundId.eq(roundId)), { enabled: hasRound });

  const sortedMembers = [...members].sort((a, b) =>
    a.joinedAt.microsSinceUnixEpoch < b.joinedAt.microsSinceUnixEpoch ? -1 : 1
  );

  return {
    connected: isActive && !!identity && mineReady && (!inRoom || roomReady),
    me,
    room,
    members: sortedMembers,
    isHost: !!(room && me && room.host.isEqual(me.identity)),
    current: rounds.find(r => r.id === room?.currentRoundId),
    next: rounds.find(r => r.id === room?.nextRoundId),
    log: [...log].sort((a, b) => (a.id < b.id ? -1 : 1)),
    requirements: [...requirements].sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind)),
    params,
    tiles: [...tiles].sort((a, b) => a.index - b.index),
    pieces,
    cursors,
    /** Mission Control's latest line for the round on screen. */
    latestHint: [...hints].filter(h => h.roundId === focusId).sort((a, b) => b.cue - a.cue)[0],
    results: [...results].sort((a, b) => KIND_ORDER.indexOf(a.kind) - KIND_ORDER.indexOf(b.kind)),
  };
}

const KIND_ORDER = ['power', 'life_support', 'twist'];

export type RoomData = ReturnType<typeof useRoom>;
