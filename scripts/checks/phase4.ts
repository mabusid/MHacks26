// Checkpoint 4 (data side): the room-scoped queries useRoom() issues are valid and scope correctly.
// Needs `pnpm dev` running. Run: pnpm check:phase4. The UI itself is checked by hand (see README).
import { DbConnection, tables } from '../../client/src/module_bindings/index.ts';
import type { Member } from '../../client/src/module_bindings/types.ts';

const URI = process.env.SPACETIME_URI ?? 'ws://localhost:3000';
const DB = process.env.SPACETIME_DB ?? 'mission-control';
const SERVER = process.env.SERVER_URL ?? 'http://localhost:8787';

type Client = { conn: DbConnection; identity: Member['identity'] };
type Query = Parameters<ReturnType<DbConnection['subscriptionBuilder']>['subscribe']>[0];

function connect(): Promise<Client> {
  return new Promise((resolve, reject) =>
    DbConnection.builder()
      .withUri(URI)
      .withDatabaseName(DB)
      .onConnect((conn, identity) => resolve({ conn, identity }))
      .onConnectError((_ctx, err) => reject(err))
      .build()
  );
}

/** Subscribe with exactly the query shape useRoom() uses; reject if the server refuses it. */
function sub(c: Client, label: string, query: Query): Promise<void> {
  return new Promise((resolve, reject) =>
    c.conn
      .subscriptionBuilder()
      .onApplied(() => resolve())
      .onError((ctx: { event?: Error }) => reject(new Error(`${label}: ${ctx.event?.message ?? 'subscription error'}`)))
      .subscribe(query)
  );
}

async function until(label: string, check: () => boolean, ms = 4000) {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > ms) throw new Error(`timed out waiting for: ${label}`);
    await new Promise(r => setTimeout(r, 25));
  }
}

let passed = 0;
async function step(label: string, fn: () => Promise<unknown>) {
  const out = await fn();
  passed++;
  console.log(`  ✓ ${label}${typeof out === 'string' ? ` — ${out}` : ''}`);
}

// These checks need rooms without a planet until they load one, so pause automatic research while they run.
await fetch(`${SERVER}/dev/auto-research?enabled=false`, { method: 'POST' });
// (The server resumes it automatically after 5 minutes if this script dies early.)
console.log(`Phase 4 checks against ${URI}/${DB}`);
const [a, b, outsider] = await Promise.all([connect(), connect(), connect()]);

// Two rooms, so scoping has something to exclude.
await a.conn.reducers.createRoom({ name: 'A' });
await outsider.conn.reducers.createRoom({ name: 'Other' });

await step("my-member query (identity literal) is accepted and finds only my row", async () => {
  await sub(a, 'member by identity', tables.member.where(m => m.identity.eq(a.identity)));
  await until('my row', () => [...a.conn.db.member.iter()].some(m => m.identity.isEqual(a.identity)));
  const rows = [...a.conn.db.member.iter()];
  if (rows.length !== 1) throw new Error(`expected 1 row, got ${rows.length}`);
});

const roomId = () => [...a.conn.db.member.iter()].find(m => m.identity.isEqual(a.identity))!.roomId;
await step('room-scoped queries are accepted and exclude the other room', async () => {
  const id = roomId();
  await sub(a, 'room', tables.room.where(r => r.id.eq(id)));
  await sub(a, 'members', tables.member.where(m => m.roomId.eq(id)));
  await sub(a, 'rounds', tables.round.where(r => r.roomId.eq(id)));
  await sub(a, 'log', tables.researchLog.where(l => l.roomId.eq(id)));
  const rooms = [...a.conn.db.room.iter()];
  if (rooms.length !== 1 || rooms[0].id !== id) throw new Error(`saw ${rooms.length} rooms`);
  return `room ${rooms[0].code}`;
});

await step('a joining player appears in the scoped member list', async () => {
  const code = [...a.conn.db.room.iter()][0].code;
  await b.conn.reducers.joinRoom({ code, name: 'B' });
  await until('B visible', () => [...a.conn.db.member.iter()].filter(m => m.roomId === roomId()).length === 2);
});

await step("lobby sees the next round's params; round-scoped queries are accepted after Start", async () => {
  const code = [...a.conn.db.room.iter()][0].code;
  const res = await fetch(`${SERVER}/dev/commit-fixture?room=${code}&planet=mars`, { method: 'POST' });
  if (!res.ok) throw new Error(`commit-fixture: ${res.status}`);
  await until('next round', () => [...a.conn.db.room.iter()][0].nextRoundId !== undefined);
  // Lobby: useRoom focuses the prepared (next) round so the destination card can show key numbers.
  const nextId = [...a.conn.db.room.iter()][0].nextRoundId!;
  await sub(a, 'next-round params', tables.planetParameter.where(p => p.roundId.eq(nextId)));
  if ([...a.conn.db.planetParameter.iter()].filter(p => p.roundId === nextId).length !== 10) throw new Error('next-round params missing');
  await a.conn.reducers.startRound({});
  await until('briefing', () => [...a.conn.db.room.iter()][0].currentRoundId !== undefined);
  const rid = [...a.conn.db.room.iter()][0].currentRoundId!;
  await sub(a, 'requirements', tables.requirement.where(r => r.roundId.eq(rid)));
  await sub(a, 'params', tables.planetParameter.where(p => p.roundId.eq(rid)));
  await sub(a, 'tiles', tables.tile.where(t => t.roundId.eq(rid)));
  const counts = [[...a.conn.db.requirement.iter()].length, [...a.conn.db.planetParameter.iter()].length, [...a.conn.db.tile.iter()].length];
  if (counts.join() !== '3,10,64') throw new Error(`counts ${counts}`);
  return 'Mars: 3 requirements, 10 params, 64 tiles';
});

for (const c of [a, b, outsider]) await c.conn.reducers.leaveRoom({});
await fetch(`${SERVER}/dev/auto-research?enabled=true`, { method: 'POST' });
console.log(`\nAll ${passed} checks passed.`);
for (const c of [a, b, outsider]) c.conn.disconnect();
process.exit(0);
