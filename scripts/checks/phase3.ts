// Checkpoint 3: commit_round (fixture path), validation, start → auto briefing → build transitions.
// Needs `pnpm dev` running. Run: pnpm check:phase3   (add --wait-end to also wait out the 1:30 build timer)
import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { DbConnection, tables } from '../../client/src/module_bindings/index.ts';

const URI = process.env.SPACETIME_URI ?? 'ws://localhost:3000';
const DB = process.env.SPACETIME_DB ?? 'overburden';
const SERVER = process.env.SERVER_URL ?? 'http://localhost:8787';
const WAIT_END = process.argv.includes('--wait-end');

type Client = { conn: DbConnection; hex: string };

function connect(token?: string): Promise<Client> {
  return new Promise((resolve, reject) => {
    DbConnection.builder()
      .withUri(URI)
      .withDatabaseName(DB)
      .withToken(token)
      .onConnect((conn, identity) => {
        conn
          .subscriptionBuilder()
          .onApplied(() => resolve({ conn, hex: identity.toHexString() }))
          .subscribe([tables.room, tables.member, tables.round, tables.requirement, tables.planetParameter, tables.tile, tables.researchLog]);
      })
      .onConnectError((_ctx, err) => reject(err))
      .build();
  });
}

function ownerToken(): string {
  const out = execFileSync('spacetime', ['login', 'show', '--token'], {
    encoding: 'utf8',
    env: { ...process.env, PATH: `${join(homedir(), '.local', 'bin')}:${process.env.PATH}` },
  });
  const token = out.match(/token[^\n]*?\bis\s+(\S+)/i)?.[1];
  if (!token) throw new Error('Could not read the local spacetime login token');
  return token;
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

async function commitFixture(code: string, planet: string) {
  const res = await fetch(`${SERVER}/dev/commit-fixture?room=${code}&planet=${planet}`, { method: 'POST' });
  if (!res.ok) throw new Error(`commit-fixture ${planet}: ${res.status} ${JSON.stringify(await res.json())}`);
}

// These checks need rooms without a planet until they load one, so pause automatic research while they run.
await fetch(`${SERVER}/dev/auto-research?enabled=false`, { method: 'POST' });
// (The server resumes it automatically after 5 minutes if this script dies early.)
console.log(`Phase 3 checks against ${URI}/${DB} and ${SERVER}`);
const [host, guest, owner] = await Promise.all([connect(), connect(), connect(ownerToken())]);
const db = host.conn.db;
const room = () => [...db.room.iter()].find(r => [...db.member.iter()].some(m => m.roomId === r.id && m.identity.toHexString() === host.hex));
const roundRows = (id: bigint) => ({
  params: [...db.planetParameter.iter()].filter(p => p.roundId === id),
  reqs: [...db.requirement.iter()].filter(r => r.roundId === id),
  tiles: [...db.tile.iter()].filter(t => t.roundId === id),
});

await host.conn.reducers.createRoom({ name: 'Host' });
await until('room', () => !!room());
const code = room()!.code;
await guest.conn.reducers.joinRoom({ code, name: 'Guest' });

await step('Start is refused before a planet exists, and for non-hosts', async () => {
  await rejects('no planet', host.conn.reducers.startRound({}), /No planet is ready/);
  return rejects('guest start', guest.conn.reducers.startRound({}), /Only the host/);
});

await step('players cannot call commit_round', () =>
  rejects(
    'player commit',
    host.conn.reducers.commitRound({ roomId: room()!.id, planetName: 'x', params: [], twist: 'radiation', headline: '', scaleText: '', because: [], funFacts: [] }),
    /Server only/
  )
);

let moonId = 0n;
await step('dev endpoint commits the Moon: ready round, budget 33, 10 params, 3 requirements, 64 tiles', async () => {
  await commitFixture(code, 'moon');
  await until('moon ready', () => room()?.nextRoundId !== undefined);
  moonId = room()!.nextRoundId!;
  const rd = db.round.id.find(moonId)!;
  const { params, reqs, tiles } = roundRows(moonId);
  if (rd.status.tag !== 'Ready' || rd.massBudget !== 33 || rd.cheapestMass !== 28) throw new Error(`round ${JSON.stringify({ status: rd.status, budget: rd.massBudget, cheapest: rd.cheapestMass })}`);
  if (params.length !== 10 || reqs.length !== 3 || tiles.length !== 64) throw new Error(`rows ${params.length}/${reqs.length}/${tiles.length}`);
  const count = (k: string) => tiles.filter(t => t.kind === k).length;
  if (count('habitat') !== 4 || count('ice') !== 4) throw new Error('tile mix');
  const twist = reqs.find(r => r.kind === 'twist')!;
  if (twist.threshold !== '4 berms next to the habitat') throw new Error(twist.threshold);
  return `${rd.planetName}: "${rd.headline}"`;
});

await step('guest sees the same requirement card', async () => {
  await until('guest sync', () => [...guest.conn.db.requirement.iter()].filter(r => r.roundId === moonId).length === 3);
});

await step('research log lines stream to players', async () => {
  const lines = [...db.researchLog.iter()].filter(l => l.roomId === room()!.id).map(l => l.text);
  if (!lines.some(l => /Moon/.test(l))) throw new Error(JSON.stringify(lines));
  return lines.join(' → ');
});

const base = {
  roomId: 0n,
  planetName: 'Titan',
  params: [] as never[],
  twist: 'thermal',
  headline: 'h',
  scaleText: 's',
  because: [
    { kind: 'power', text: 't', field: 'insolation' },
    { kind: 'life_support', text: 't', field: 'waterIce' },
    { kind: 'twist', text: 't', field: 'meanTempK' },
  ],
  funFacts: ['a', 'b', 'c'],
};
const titanParams = [
  ['insolation', 0.011], ['nightHours', 191], ['meanTempK', 94], ['surfacePressureBar', 1.47],
  ['radiationDoseMSvPerDay', null], ['gravity', 1.35],
].map(([field, num]) => ({ field: field as string, num: (num ?? undefined) as number | undefined, flag: undefined, unit: '', status: num === null ? 'estimated' : 'sourced', sourceLabel: num === null ? '' : 'test', sourceUrl: '', note: num === null ? 'unmeasured' : '' }))
  .concat([['co2Atmosphere', false], ['waterIce', true], ['polarIce', false], ['dustStorms', false]].map(([field, flag]) => ({ field: field as string, num: undefined, flag: flag as boolean, unit: '', status: 'sourced', sourceLabel: 'test', sourceUrl: '', note: '' })));

await step('server validation rejects bad research (untriggered twist, missing source, bad citation, wrong fun-fact count)', async () => {
  const c = (patch: object) => owner.conn.reducers.commitRound({ ...base, roomId: room()!.id, params: titanParams, ...patch } as never);
  await rejects('twist', c({ twist: 'radiation' }), /not supported/);
  await rejects('source', c({ params: titanParams.map(p => (p.field === 'gravity' ? { ...p, sourceLabel: '' } : p)) }), /no source/);
  await rejects('citation', c({ because: [base.because[0], base.because[1], { kind: 'twist', text: 't', field: 'vibes' }] }), /unknown field/);
  return rejects('facts', c({ funFacts: ['only one'] }), /3 fun facts/);
});

await step('a valid owner commit replaces the unused Moon round (old rows deleted)', async () => {
  await owner.conn.reducers.commitRound({ ...base, roomId: room()!.id, params: titanParams } as never);
  await until('replaced', () => room()!.nextRoundId !== moonId);
  await until('moon rows gone', () => !db.round.id.find(moonId) && roundRows(moonId).tiles.length === 0);
  return `Titan budget ${db.round.id.find(room()!.nextRoundId!)!.massBudget} CU`;
});

await step('host Start → Briefing for everyone with a ~10 s countdown; guest cannot skip', async () => {
  await host.conn.reducers.startRound({});
  await until('briefing', () => room()!.phase.tag === 'Briefing' && room()!.currentRoundId !== undefined && room()!.nextRoundId === undefined);
  await until('guest briefing', () => [...guest.conn.db.room.iter()].some(r => r.code === code && r.phase.tag === 'Briefing'));
  const rd = db.round.id.find(room()!.currentRoundId!)!;
  const secs = (Number(rd.briefingEndsAt!.microsSinceUnixEpoch / 1000n) - Date.now()) / 1000;
  if (secs < 8 || secs > 11) throw new Error(`briefing ends in ${secs.toFixed(1)} s`);
  await rejects('guest skip', guest.conn.reducers.beginBuild({}), /Only the host/);
  return `${secs.toFixed(0)} s countdown`;
});

await step('build starts automatically when the countdown ends: Build phase, ~90 s timer, round active', async () => {
  await until('auto build', () => room()!.phase.tag === 'Build', 13_000);
  const rd = db.round.id.find(room()!.currentRoundId!)!;
  const secs = (Number(rd.buildEndsAt!.microsSinceUnixEpoch / 1000n) - Date.now()) / 1000;
  if (rd.status.tag !== 'Active' || rd.briefingEndsAt !== undefined || secs < 85 || secs > 91) {
    throw new Error(`status ${rd.status.tag}, ${secs.toFixed(1)} s left`);
  }
  return `${secs.toFixed(0)} s left`;
});

await step('host Skip starts the build at once, and the cancelled auto-start never fires', async () => {
  const [h2] = await Promise.all([connect()]);
  await h2.conn.reducers.createRoom({ name: 'Skipper' });
  const r2 = () => [...h2.conn.db.room.iter()].find(r => [...h2.conn.db.member.iter()].some(m => m.roomId === r.id && m.identity.toHexString() === h2.hex));
  await until('room 2', () => !!r2());
  await commitFixture(r2()!.code, 'titan');
  await until('ready 2', () => r2()!.nextRoundId !== undefined);
  await h2.conn.reducers.startRound({});
  await until('briefing 2', () => r2()!.phase.tag === 'Briefing');
  await h2.conn.reducers.beginBuild({});
  await until('build 2', () => r2()!.phase.tag === 'Build', 1500);
  const endsAt = h2.conn.db.round.id.find(r2()!.currentRoundId!)!.buildEndsAt!.microsSinceUnixEpoch;
  await new Promise(r => setTimeout(r, 11_000));
  const after = h2.conn.db.round.id.find(r2()!.currentRoundId!)!.buildEndsAt!.microsSinceUnixEpoch;
  if (after !== endsAt || r2()!.phase.tag !== 'Build') throw new Error('auto-start fired after skip');
  await h2.conn.reducers.leaveRoom({});
  h2.conn.disconnect();
});

if (WAIT_END) {
  await step('scheduled build end fires → Debrief, round done and scored', async () => {
    const rd = db.round.id.find(room()!.currentRoundId!)!;
    const ms = Number(rd.buildEndsAt!.microsSinceUnixEpoch / 1000n) - Date.now() + 3000;
    await until('debrief', () => room()!.phase.tag === 'Debrief' && db.round.id.find(rd.id)!.status.tag === 'Done', ms);
    if (db.round.id.find(rd.id)!.success === undefined) throw new Error('timer end did not score the round');
  });
}

await host.conn.reducers.leaveRoom({});
await guest.conn.reducers.leaveRoom({});
await fetch(`${SERVER}/dev/auto-research?enabled=true`, { method: 'POST' });
console.log(`\nAll ${passed} checks passed.`);
for (const c of [host, guest, owner]) c.conn.disconnect();
process.exit(0);
