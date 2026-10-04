// Checkpoint 5: authoritative placement, budget, removal, berms, live cursors.
// Needs `pnpm dev` running. Run: pnpm check:phase5
import { DbConnection, tables } from '../../client/src/module_bindings/index.ts';

const URI = process.env.SPACETIME_URI ?? 'ws://localhost:3000';
const DB = process.env.SPACETIME_DB ?? 'overburden';
const SERVER = process.env.SERVER_URL ?? 'http://localhost:8787';
const HABITAT_ADJACENT = [19, 20, 26, 29, 34, 37, 43, 44]; // D3 E3 C4 F4 C5 F5 D6 E6

type Client = { conn: DbConnection; hex: string };

function connect(): Promise<Client> {
  return new Promise((resolve, reject) =>
    DbConnection.builder()
      .withUri(URI)
      .withDatabaseName(DB)
      .onConnect((conn, identity) => {
        conn
          .subscriptionBuilder()
          .onApplied(() => resolve({ conn, hex: identity.toHexString() }))
          .subscribe([tables.room, tables.member, tables.round, tables.tile, tables.piece, tables.cursor]);
      })
      .onConnectError((_ctx, err) => reject(err))
      .build()
  );
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

// These checks need rooms without a planet until they load one, so pause automatic research while they run.
await fetch(`${SERVER}/dev/auto-research?enabled=false`, { method: 'POST' });
// (The server resumes it automatically after 5 minutes if this script dies early.)
console.log(`Phase 5 checks against ${URI}/${DB}`);
const [host, guest] = await Promise.all([connect(), connect()]);
const db = host.conn.db;
const room = () => [...db.room.iter()].find(r => [...db.member.iter()].some(m => m.roomId === r.id && m.identity.toHexString() === host.hex))!;
const roundId = () => room().currentRoundId!;
const tiles = () => [...db.tile.iter()].filter(t => t.roundId === roundId()).sort((a, b) => a.index - b.index);
const pieces = (c: Client = host) => [...c.conn.db.piece.iter()].filter(p => p.roundId === roundId());
/** A free tile (any kind except habitat), away from the habitat ring so berm tests keep their tiles. */
// Remember tiles handed out: the local cache may not have the last placement yet.
const handedOut = new Set<number>();
const freeTile = (skip: number[] = []) => {
  const i = tiles().find(
    t => t.kind !== 'habitat' && !HABITAT_ADJACENT.includes(t.index) && !skip.includes(t.index) && !handedOut.has(t.index) && !pieces().some(p => p.index === t.index)
  )!.index;
  handedOut.add(i);
  return i;
};
const tileOf = (kind: string, skip: number[] = []) => tiles().find(t => t.kind === kind && !skip.includes(t.index) && !HABITAT_ADJACENT.includes(t.index))!.index;

await host.conn.reducers.createRoom({ name: 'Host' });
await until('room', () => !!room());
await guest.conn.reducers.joinRoom({ code: room().code, name: 'Guest' });

await step('placing outside the build phase is refused', () => rejects('lobby place', host.conn.reducers.placePiece({ kind: 'solar', index: 0 }), /Not in the build phase/));

const res = await fetch(`${SERVER}/dev/commit-fixture?room=${room().code}&planet=moon`, { method: 'POST' });
if (!res.ok) throw new Error(`commit-fixture ${res.status}`);
await until('ready', () => room().nextRoundId !== undefined);
await host.conn.reducers.startRound({});
await until('briefing', () => room().phase.tag === 'Briefing');
await host.conn.reducers.beginBuild({});
await until('build', () => room().phase.tag === 'Build' && tiles().length === 64);

const lit = tileOf('lit');
await step('solar on a sunlit tile appears for everyone, credited to the placer', async () => {
  await host.conn.reducers.placePiece({ kind: 'solar', index: lit });
  await until('guest sees solar', () => pieces(guest).some(p => p.index === lit && p.kind === 'solar'));
  if (pieces()[0].placedBy.toHexString() !== host.hex) throw new Error('placedBy');
});

await step('tile rules are enforced server-side', async () => {
  await rejects('solar on shade', guest.conn.reducers.placePiece({ kind: 'solar', index: tileOf('shaded') }), /sunlit/);
  await rejects('drill off ice', guest.conn.reducers.placePiece({ kind: 'ice_drill', index: tileOf('lit', [lit]) }), /ice tile/);
  await rejects('habitat', guest.conn.reducers.placePiece({ kind: 'battery', index: 27 }), /habitat/);
  await rejects('occupied', guest.conn.reducers.placePiece({ kind: 'battery', index: lit }), /occupied/);
  return rejects('unknown', guest.conn.reducers.placePiece({ kind: 'warp_drive', index: 0 }), /Unknown piece/);
});

await step('ice drill goes on ice; the budget caps total mass (Moon: 33 CU)', async () => {
  const ice = tileOf('ice');
  handedOut.add(ice);
  await guest.conn.reducers.placePiece({ kind: 'ice_drill', index: ice }); // 2
  await host.conn.reducers.placePiece({ kind: 'reactor', index: freeTile() }); // + 14 = 16
  await host.conn.reducers.placePiece({ kind: 'reactor', index: freeTile() }); // + 14 = 30, + the solar (1) = 31
  return rejects('over budget', host.conn.reducers.placePiece({ kind: 'reactor', index: freeTile() }), /Over budget: 45\/33/);
});

await step('anyone can remove any piece (refund); removing empty ground is refused', async () => {
  await guest.conn.reducers.removePiece({ index: lit });
  await until('solar gone', () => !pieces().some(p => p.index === lit));
  return rejects('empty', guest.conn.reducers.removePiece({ index: lit }), /Nothing to remove/);
});

await step('berms place with a single click (1 CU) and must touch the habitat', async () => {
  await rejects('far berm', host.conn.reducers.placePiece({ kind: 'berm', index: freeTile() }), /touch the habitat/);
  await host.conn.reducers.placePiece({ kind: 'berm', index: HABITAT_ADJACENT[0] });
  await until('berm placed', () => pieces().some(p => p.index === HABITAT_ADJACENT[0] && p.kind === 'berm'));
  return rejects('berm tile occupied', guest.conn.reducers.placePiece({ kind: 'battery', index: HABITAT_ADJACENT[0] }), /occupied/);
});

await step('live cursors: movement and hiding sync to the other player', async () => {
  await host.conn.reducers.moveCursor({ x: 2.5, y: 6.25, visible: true });
  const mine = () => [...guest.conn.db.cursor.iter()].find(c => c.identity.toHexString() === host.hex);
  await until('cursor visible', () => mine()?.visible === true && Math.abs(mine()!.x - 2.5) < 0.01 && Math.abs(mine()!.y - 6.25) < 0.01);
  await host.conn.reducers.moveCursor({ x: 99, y: -5, visible: true });
  await until('clamped', () => mine()!.x === 8 && mine()!.y === 0);
  await host.conn.reducers.moveCursor({ x: 0, y: 0, visible: false });
  await until('hidden', () => mine()?.visible === false);
});

await step('leaving removes your cursor; an emptied room takes its pieces with it', async () => {
  const rid = roundId();
  await guest.conn.reducers.moveCursor({ x: 1, y: 1, visible: true });
  await until('guest cursor', () => [...db.cursor.iter()].some(c => c.identity.toHexString() === guest.hex));
  await guest.conn.reducers.leaveRoom({});
  await until('guest cursor gone', () => ![...db.cursor.iter()].some(c => c.identity.toHexString() === guest.hex));
  await host.conn.reducers.leaveRoom({});
  await until('pieces gone', () => ![...guest.conn.db.piece.iter()].some(p => p.roundId === rid));
});

await fetch(`${SERVER}/dev/auto-research?enabled=true`, { method: 'POST' });
console.log(`\nAll ${passed} checks passed.`);
for (const c of [host, guest]) c.conn.disconnect();
process.exit(0);
