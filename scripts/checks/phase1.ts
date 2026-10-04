// Checkpoint 1: rooms, joining, capacity, host migration, reconnect-as-same-member.
// Needs `pnpm dev` running. Run: pnpm check:phase1
import { DbConnection, tables } from '../../client/src/module_bindings/index.ts';

const URI = process.env.SPACETIME_URI ?? 'ws://localhost:3000';
const DB = process.env.SPACETIME_DB ?? 'mission-control';

type Player = { name: string; conn: DbConnection; hex: string; token: string };

function connect(name: string, token?: string): Promise<Player> {
  return new Promise((resolve, reject) => {
    DbConnection.builder()
      .withUri(URI)
      .withDatabaseName(DB)
      .withToken(token)
      .onConnect((conn, identity, tok) => {
        conn
          .subscriptionBuilder()
          .onApplied(() => resolve({ name, conn, hex: identity.toHexString(), token: tok }))
          .subscribe([tables.room, tables.member]);
      })
      .onConnectError((_ctx, err) => reject(err))
      .build();
  });
}

async function until(label: string, check: () => boolean, ms = 3000) {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > ms) throw new Error(`timed out waiting for: ${label}`);
    await new Promise(r => setTimeout(r, 25));
  }
}

async function rejects(label: string, call: Promise<void>, match: RegExp) {
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

const roomOf = (p: Player) => {
  const me = [...p.conn.db.member.iter()].find(m => m.identity.toHexString() === p.hex);
  return me ? [...p.conn.db.room.iter()].find(r => r.id === me.roomId) : undefined;
};
const membersOf = (p: Player, roomId: bigint) => [...p.conn.db.member.iter()].filter(m => m.roomId === roomId);
const memberRow = (p: Player, who: Player) => [...p.conn.db.member.iter()].find(m => m.identity.toHexString() === who.hex);
const hostHex = (p: Player) => roomOf(p)?.host.toHexString();

console.log(`Phase 1 checks against ${URI}/${DB}`);
const [a, b, c, d, e] = await Promise.all(['Ana', 'Ben', 'Cy', 'Dee', 'Eli'].map(n => connect(n)));
const players = [a, b, c, d, e];
let code = '';
let roomId = 0n;

await step('Ana creates a room with a 4-letter code', async () => {
  await a.conn.reducers.createRoom({ name: a.name });
  await until('room visible', () => !!roomOf(a));
  code = roomOf(a)!.code;
  roomId = roomOf(a)!.id;
  if (!/^[A-HJ-NP-Z]{4}$/.test(code)) throw new Error(`bad code ${code}`);
  if (hostHex(a) !== a.hex) throw new Error('creator is not host');
  return code;
});

await step('Ben and Cy join (lowercase code accepted); all see 3 members, Ana host', async () => {
  await b.conn.reducers.joinRoom({ code: code.toLowerCase(), name: b.name });
  await c.conn.reducers.joinRoom({ code, name: c.name });
  for (const p of [a, b, c]) await until(`${p.name} sees 3`, () => membersOf(p, roomId).length === 3 && hostHex(p) === a.hex);
});

await step('unknown code is rejected with a readable error', () =>
  rejects('bad code', d.conn.reducers.joinRoom({ code: 'QQQQ', name: d.name }), /No room/)
);

await step('blank name is rejected', () => rejects('blank name', d.conn.reducers.joinRoom({ code, name: '   ' }), /name/i));

await step('Dee joins (4/4); Eli is turned away', async () => {
  await d.conn.reducers.joinRoom({ code, name: d.name });
  await until('4 members', () => membersOf(a, roomId).length === 4);
  return rejects('full', e.conn.reducers.joinRoom({ code, name: e.name }), /full/);
});

await step('host Ana disconnects → Ana shown offline, Ben (longest-joined online) becomes host', async () => {
  a.conn.disconnect();
  await until('Ben host', () => hostHex(b) === b.hex && memberRow(b, a)?.online === false);
});

let a2: Player;
await step('Ana reconnects with her token → same member, online, keeps seat; Ben stays host', async () => {
  a2 = await connect('Ana', a.token);
  if (a2.hex !== a.hex) throw new Error('new identity on reconnect');
  await until('Ana online', () => memberRow(b, a)?.online === true);
  if (membersOf(b, roomId).length !== 4) throw new Error('seat lost');
  if (hostHex(b) !== b.hex) throw new Error('host changed back');
});

await step('host Ben leaves → Ana (longest-joined online) becomes host', async () => {
  await b.conn.reducers.leaveRoom({});
  await until('Ana host', () => hostHex(c) === a.hex && membersOf(c, roomId).length === 3);
});

await step('everyone leaves → room is deleted', async () => {
  for (const p of [a2!, c, d]) await p.conn.reducers.leaveRoom({});
  await until('room gone', () => ![...e.conn.db.room.iter()].some(r => r.id === roomId));
});

console.log(`\nAll ${passed} checks passed.`);
for (const p of [...players, a2!]) p.conn.disconnect();
process.exit(0);
