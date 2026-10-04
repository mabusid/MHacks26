import { schema, table, t, SenderError, type InferSchema, type ReducerCtx } from 'spacetimedb/server';
import type { Identity } from 'spacetimedb';
import { MAX_MEMBERS, ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, normalizeRoomCode, validateName } from '@overburden/shared';

const Phase = t.enum('Phase', ['lobby', 'briefing', 'build', 'debrief']);
const RoundStatus = t.enum('RoundStatus', ['researching', 'ready', 'active', 'done']);

// Private: publisher identity (set in init) and the Node service identity (set once by the owner).
const serverConfig = table(
  { name: 'server_config' },
  {
    id: t.u32().primaryKey(),
    owner: t.identity(),
    server: t.option(t.identity()),
  }
);

// Private: one row per live connection. An identity can hold several (tabs, reconnect races),
// so a member is online while any session exists.
const session = table(
  { name: 'session' },
  {
    connectionId: t.connectionId().primaryKey(),
    identity: t.identity().index('btree'),
  }
);

const room = table(
  { name: 'room', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    code: t.string().unique(),
    host: t.identity(),
    phase: Phase,
    currentRoundId: t.option(t.u64()),
    nextRoundId: t.option(t.u64()),
    createdAt: t.timestamp(),
  }
);

// One room per identity; the row persists while offline so a player keeps their seat.
const member = table(
  { name: 'member', public: true },
  {
    identity: t.identity().primaryKey(),
    roomId: t.u64().index('btree'),
    name: t.string(),
    joinedAt: t.timestamp(),
    online: t.bool(),
  }
);

const round = table(
  { name: 'round', public: true },
  {
    id: t.u64().primaryKey().autoInc(),
    roomId: t.u64().index('btree'),
    status: RoundStatus,
    planetName: t.string(),
    massBudget: t.u32(),
    buildEndsAt: t.option(t.timestamp()),
  }
);

const spacetimedb = schema({ serverConfig, session, room, member, round });
export default spacetimedb;

type Ctx = ReducerCtx<InferSchema<typeof spacetimedb>>;
type RoomRow = NonNullable<ReturnType<Ctx['db']['room']['id']['find']>>;

function cleanName(input: string): string {
  const result = validateName(input);
  if (!result.ok) throw new SenderError(result.error);
  return result.name;
}

function generateCode(ctx: Ctx): string {
  for (let attempt = 0; attempt < 50; attempt++) {
    let code = '';
    for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
      code += ROOM_CODE_ALPHABET[ctx.random.integerInRange(0, ROOM_CODE_ALPHABET.length - 1)];
    }
    if (!ctx.db.room.code.find(code)) return code;
  }
  throw new SenderError('Could not allocate a room code, try again');
}

function membersOf(ctx: Ctx, roomId: bigint) {
  return [...ctx.db.member.roomId.filter(roomId)].sort((a, b) =>
    a.joinedAt.microsSinceUnixEpoch < b.joinedAt.microsSinceUnixEpoch ? -1 : 1
  );
}

/** Keep an online host when possible: longest-joined online member wins (Plan.md → Host migration). */
function ensureOnlineHost(ctx: Ctx, r: RoomRow) {
  const members = membersOf(ctx, r.id);
  const current = members.find(m => m.identity.equals(r.host));
  if (current?.online) return;
  const next = members.find(m => m.online) ?? (current ? undefined : members[0]);
  if (next && !next.identity.equals(r.host)) ctx.db.room.id.update({ ...r, host: next.identity });
}

function deleteRoom(ctx: Ctx, roomId: bigint) {
  for (const rd of [...ctx.db.round.roomId.filter(roomId)]) ctx.db.round.id.delete(rd.id);
  ctx.db.room.id.delete(roomId);
}

function leaveCurrentRoom(ctx: Ctx, identity: Identity) {
  const me = ctx.db.member.identity.find(identity);
  if (!me) return;
  ctx.db.member.identity.delete(identity);
  const r = ctx.db.room.id.find(me.roomId);
  if (!r) return;
  if (membersOf(ctx, r.id).length === 0) deleteRoom(ctx, r.id);
  else ensureOnlineHost(ctx, r);
}

function isOnline(ctx: Ctx, identity: Identity): boolean {
  for (const _ of ctx.db.session.identity.filter(identity)) return true;
  return false;
}

function setOnline(ctx: Ctx, identity: Identity) {
  const me = ctx.db.member.identity.find(identity);
  if (!me) return;
  const online = isOnline(ctx, identity);
  if (me.online !== online) ctx.db.member.identity.update({ ...me, online });
  const r = ctx.db.room.id.find(me.roomId);
  if (r) ensureOnlineHost(ctx, r);
}

export const init = spacetimedb.init(ctx => {
  ctx.db.serverConfig.insert({ id: 0, owner: ctx.sender, server: undefined });
});

export const onConnect = spacetimedb.clientConnected(ctx => {
  if (ctx.connectionId) ctx.db.session.insert({ connectionId: ctx.connectionId, identity: ctx.sender });
  setOnline(ctx, ctx.sender);
});

export const onDisconnect = spacetimedb.clientDisconnected(ctx => {
  if (ctx.connectionId) ctx.db.session.connectionId.delete(ctx.connectionId);
  setOnline(ctx, ctx.sender);
});

/** Owner-only, run once via `spacetime call`: registers the Node service identity. */
export const setServerIdentity = spacetimedb.reducer({ identity: t.identity() }, (ctx, { identity }) => {
  const cfg = ctx.db.serverConfig.id.find(0);
  if (!cfg || !cfg.owner.equals(ctx.sender)) throw new SenderError('Owner only');
  ctx.db.serverConfig.id.update({ ...cfg, server: identity });
});

export const createRoom = spacetimedb.reducer({ name: t.string() }, (ctx, { name }) => {
  const clean = cleanName(name);
  leaveCurrentRoom(ctx, ctx.sender);
  const r = ctx.db.room.insert({
    id: 0n,
    code: generateCode(ctx),
    host: ctx.sender,
    phase: { tag: 'lobby' },
    currentRoundId: undefined,
    nextRoundId: undefined,
    createdAt: ctx.timestamp,
  });
  ctx.db.member.insert({ identity: ctx.sender, roomId: r.id, name: clean, joinedAt: ctx.timestamp, online: true });
});

export const joinRoom = spacetimedb.reducer({ code: t.string(), name: t.string() }, (ctx, { code, name }) => {
  const clean = cleanName(name);
  const r = ctx.db.room.code.find(normalizeRoomCode(code));
  if (!r) throw new SenderError('No room with that code');

  const existing = ctx.db.member.identity.find(ctx.sender);
  if (existing?.roomId === r.id) {
    if (existing.name !== clean) ctx.db.member.identity.update({ ...existing, name: clean });
    return;
  }
  if (r.phase.tag !== 'lobby') throw new SenderError('That game has already started');
  if (membersOf(ctx, r.id).length >= MAX_MEMBERS) throw new SenderError(`Room is full (${MAX_MEMBERS} players)`);

  leaveCurrentRoom(ctx, ctx.sender);
  ctx.db.member.insert({ identity: ctx.sender, roomId: r.id, name: clean, joinedAt: ctx.timestamp, online: true });
});

export const leaveRoom = spacetimedb.reducer(ctx => {
  leaveCurrentRoom(ctx, ctx.sender);
});
