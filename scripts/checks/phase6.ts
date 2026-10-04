// Checkpoint 6: scoring (lock in / timer), debrief results, rematch, empty-room cleanup scheduling.
// Needs `pnpm dev` running. Run: pnpm check:phase6
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { DbConnection, tables } from '../../client/src/module_bindings/index.ts';

const URI = process.env.SPACETIME_URI ?? 'ws://localhost:3000';
const DB = process.env.SPACETIME_DB ?? 'overburden';
const SERVER = process.env.SERVER_URL ?? 'http://localhost:8787';
const RING = [19, 20, 26, 29, 34, 37, 43, 44]; // habitat-adjacent tiles

type Client = { conn: DbConnection; hex: string; token: string };

function connect(token?: string): Promise<Client> {
  return new Promise((resolve, reject) =>
    DbConnection.builder()
      .withUri(URI)
      .withDatabaseName(DB)
      .withToken(token)
      .onConnect((conn, identity, tok) => {
        conn
          .subscriptionBuilder()
          .onApplied(() => resolve({ conn, hex: identity.toHexString(), token: tok }))
          .subscribe([tables.room, tables.member, tables.round, tables.tile, tables.piece, tables.result]);
      })
      .onConnectError((_ctx, err) => reject(err))
      .build()
  );
}

/** Owner SQL via the CLI (private tables such as room_cleanup). */
function ownerSql(query: string): string {
  return execFileSync('spacetime', ['sql', '--server', 'local', DB, query], {
    cwd: '/tmp',
    encoding: 'utf8',
    env: { ...process.env, PATH: `${join(homedir(), '.local', 'bin')}:${process.env.PATH}` },
    stdio: ['ignore', 'pipe', 'ignore'],
  });
}

async function until(label: string, check: () => boolean, ms = 4000) {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > ms) throw new Error(`timed out waiting for: ${label}`);
    await new Promise(r => setTimeout(r, 25));
  }
}

async function rejects(label: string, call: Promise<unknown>, match: RegExp) {
  try {
    await call;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (!match.test(msg)) throw new Error(`${label}: wrong error "${msg}"`);
    return msg;
  }
  throw new Error(`${label}: expected rejection`);
}

let passed = 0;
async function step(label: string, fn: () => Promise<unknown>) {
  const out = await fn();
  passed++;
  console.log(`  ✓ ${label}${typeof out === 'string' ? ` — ${out}` : ''}`);
}

/** A room owned by `host`, with helpers scoped to it. */
function roomHelpers(host: Client) {
  const db = host.conn.db;
  const room = () => [...db.room.iter()].find(r => [...db.member.iter()].some(m => m.roomId === r.id && m.identity.toHexString() === host.hex))!;
  const rid = () => room().currentRoundId!;
  const tiles = () => [...db.tile.iter()].filter(t => t.roundId === rid());
  const pieces = () => [...db.piece.iter()].filter(p => p.roundId === rid());
  const results = (roundId = rid()) => [...db.result.iter()].filter(r => r.roundId === roundId);
  // Remember tiles handed out: the local cache may not have the last placement yet.
  const used = new Set<number>();
  const free = () => {
    const i = tiles().find(t => t.kind !== 'habitat' && !RING.includes(t.index) && !used.has(t.index) && !pieces().some(p => p.index === t.index))!.index;
    used.add(i);
    return i;
  };
  return { db, room, rid, tiles, pieces, results, free, used };
}

async function toBuild(host: Client, planet: string) {
  const h = roomHelpers(host);
  const res = await fetch(`${SERVER}/dev/commit-fixture?room=${h.room().code}&planet=${planet}`, { method: 'POST' });
  if (!res.ok) throw new Error(`commit-fixture ${planet}: ${res.status}`);
  await until('ready', () => h.room().nextRoundId !== undefined);
  await host.conn.reducers.startRound({});
  await until('briefing', () => h.room().phase.tag === 'Briefing');
  await host.conn.reducers.beginBuild({});
  await until('build', () => h.room().phase.tag === 'Build' && h.tiles().length === 64);
}

// These checks need rooms without a planet until they load one, so pause automatic research while they run.
await fetch(`${SERVER}/dev/auto-research?enabled=false`, { method: 'POST' });
// (The server resumes it automatically after 5 minutes if this script dies early.)
console.log(`Phase 6 checks against ${URI}/${DB}`);
const [host, guest] = await Promise.all([connect(), connect()]);
const A = roomHelpers(host);
await host.conn.reducers.createRoom({ name: 'Host' });
await until('room', () => !!A.room());
await guest.conn.reducers.joinRoom({ code: A.room().code, name: 'Guest' });
await toBuild(host, 'moon');

await step('only the host can lock in', () => rejects('guest lock', guest.conn.reducers.lockBuild({}), /Only the host/));

let moonRound = 0n;
await step('winning Moon base (solar + batteries + ice drill), locked in early → MISSION SUCCESS, every requirement ✓', async () => {
  moonRound = A.rid();
  const ice = A.tiles().find(t => t.kind === 'ice' && !RING.includes(t.index))!.index;
  A.used.add(ice);
  const lit = () => {
    const i = A.tiles().find(t => t.kind === 'lit' && !RING.includes(t.index) && !A.used.has(t.index) && !A.pieces().some(p => p.index === t.index))!.index;
    A.used.add(i);
    return i;
  };
  await host.conn.reducers.placePiece({ kind: 'ice_drill', index: ice });
  for (let n = 0; n < 2; n++) await host.conn.reducers.placePiece({ kind: 'solar', index: lit() });
  for (let n = 0; n < 6; n++) await guest.conn.reducers.placePiece({ kind: 'battery', index: A.free() });
  for (let n = 0; n < 2; n++) await guest.conn.reducers.placePiece({ kind: 'o2_tank', index: A.free() });
  for (const i of RING.slice(0, 4)) await host.conn.reducers.placePiece({ kind: 'berm', index: i });
  await host.conn.reducers.lockBuild({});
  await until('debrief', () => A.room().phase.tag === 'Debrief' && A.results(moonRound).length === 3);
  const rd = A.db.round.id.find(moonRound)!;
  if (rd.success !== true || A.results(moonRound).some(r => !r.pass)) throw new Error(JSON.stringify(A.results(moonRound)));
  return A.results(moonRound).map(r => r.reason).join(' · ');
});

await step('placing after the build ended is refused; only the host can rematch', async () => {
  await rejects('late place', guest.conn.reducers.placePiece({ kind: 'battery', index: A.free() }), /Not in the build phase/);
  return rejects('guest rematch', guest.conn.reducers.rematch({}), /Only the host/);
});

await step('Next planet with nothing prepared → lobby; the finished round is cleared', async () => {
  await host.conn.reducers.rematch({});
  await until('lobby', () => A.room().phase.tag === 'Lobby' && A.room().currentRoundId === undefined);
  await until('round cleared', () => !A.db.round.id.find(moonRound) && ![...A.db.piece.iter()].some(p => p.roundId === moonRound));
  if ([...A.db.result.iter()].some(r => r.roundId === moonRound)) throw new Error('results left behind');
});

let titanRound = 0n;
await step('empty Titan base → MISSION FAILED, each ✗ with a reason and the responsible fact', async () => {
  await toBuild(host, 'titan');
  titanRound = A.rid();
  await host.conn.reducers.lockBuild({});
  await until('debrief', () => A.room().phase.tag === 'Debrief' && A.results(titanRound).length === 3);
  const res = A.results(titanRound);
  if (A.db.round.id.find(titanRound)!.success !== false || res.some(r => r.pass)) throw new Error(JSON.stringify(res));
  const twist = res.find(r => r.kind === 'twist')!;
  if (!/^Heating:/.test(twist.reason) || twist.fact !== 'meanTempK') throw new Error(JSON.stringify(twist));
  return res.map(r => `${r.reason} [${r.fact}]`).join(' · ');
});

await step('a planet prepared during the debrief → Next planet goes straight to its briefing', async () => {
  const res = await fetch(`${SERVER}/dev/commit-fixture?room=${A.room().code}&planet=mars`, { method: 'POST' });
  if (!res.ok) throw new Error(`commit-fixture mars: ${res.status}`);
  await until('next ready', () => A.room().nextRoundId !== undefined && A.room().phase.tag === 'Debrief');
  await host.conn.reducers.rematch({});
  await until('briefing', () => A.room().phase.tag === 'Briefing');
  return A.db.round.id.find(A.rid())!.planetName;
});

await step('an empty room schedules its cleanup; it is cancelled when someone comes back', async () => {
  const roomId = A.room().id;
  await guest.conn.reducers.leaveRoom({});
  host.conn.disconnect();
  await new Promise(r => setTimeout(r, 500));
  if (!ownerSql(`SELECT * FROM room_cleanup WHERE room_id = ${roomId}`).includes(String(roomId))) throw new Error('no cleanup scheduled');
  const back = await connect(host.token);
  await until('host back online', () => [...back.conn.db.member.iter()].some(m => m.identity.toHexString() === host.hex && m.online));
  await new Promise(r => setTimeout(r, 300));
  if (ownerSql(`SELECT * FROM room_cleanup WHERE room_id = ${roomId}`).includes(String(roomId))) throw new Error('cleanup not cancelled');
  await back.conn.reducers.leaveRoom({});
  back.conn.disconnect();
});

await fetch(`${SERVER}/dev/auto-research?enabled=true`, { method: 'POST' });
console.log(`\nAll ${passed} checks passed.`);
guest.conn.disconnect();
process.exit(0);
