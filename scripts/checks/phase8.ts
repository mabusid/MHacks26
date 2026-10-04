// Checkpoint 8: research agent (live xAI), all curated bodies, cached pack validity, pack fallback.
// Needs `pnpm dev`, network, and XAI_API_KEY in server/.env. Run: pnpm check:phase8
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { DbConnection, tables } from '../../client/src/module_bindings/index.ts';

const URI = process.env.SPACETIME_URI ?? 'ws://localhost:3000';
const DB = process.env.SPACETIME_DB ?? 'mission-control';
const SERVER = process.env.SERVER_URL ?? 'http://localhost:8787';
const CURATED = ['moon', 'mars', 'mercury', 'ceres', 'titan', 'europa'];

type Client = { conn: DbConnection; hex: string };

function connect(token?: string): Promise<Client> {
  return new Promise((resolve, reject) =>
    DbConnection.builder()
      .withUri(URI)
      .withDatabaseName(DB)
      .withToken(token)
      .onConnect((conn, identity) => {
        conn
          .subscriptionBuilder()
          .onApplied(() => resolve({ conn, hex: identity.toHexString() }))
          .subscribe([tables.room, tables.member, tables.round, tables.planetParameter, tables.researchLog]);
      })
      .onConnectError((_ctx, err) => reject(err))
      .build()
  );
}

function ownerToken(): string {
  const out = execFileSync('spacetime', ['login', 'show', '--token'], {
    encoding: 'utf8',
    env: { ...process.env, PATH: `${join(homedir(), '.local', 'bin')}:${process.env.PATH}` },
  });
  return out.match(/token[^\n]*?\bis\s+(\S+)/i)![1];
}

async function until(label: string, check: () => boolean, ms = 4000) {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > ms) throw new Error(`timed out waiting for: ${label}`);
    await new Promise(r => setTimeout(r, 50));
  }
}

let passed = 0;
async function step(label: string, fn: () => Promise<unknown>) {
  const out = await fn();
  passed++;
  console.log(`  ✓ ${label}${typeof out === 'string' ? ` — ${out}` : ''}`);
}

await fetch(`${SERVER}/dev/auto-research?enabled=false`, { method: 'POST' });
const health = (await (await fetch(`${SERVER}/health`)).json()) as { voice: boolean };
console.log(`Phase 8 checks against ${URI}/${DB} and ${SERVER}`);
const [host, owner] = await Promise.all([connect(), connect(ownerToken())]);
const db = host.conn.db;
const room = () => [...db.room.iter()].find(r => [...db.member.iter()].some(m => m.roomId === r.id && m.identity.toHexString() === host.hex))!;
const next = () => (room().nextRoundId !== undefined ? db.round.id.find(room().nextRoundId!) : undefined);
const logSince = (n: number) => [...db.researchLog.iter()].filter(l => l.roomId === room().id).sort((a, b) => Number(a.id - b.id)).slice(n).map(l => l.text);

function provenanceOk(roundId: bigint): string | null {
  const ps = [...db.planetParameter.iter()].filter(p => p.roundId === roundId);
  if (ps.length !== 10) return `expected 10 params, got ${ps.length}`;
  for (const p of ps) {
    if (p.status === 'sourced' && (!p.sourceLabel || !p.sourceUrl.startsWith('https://'))) return `${p.field} sourced without label/URL`;
    if (p.status === 'estimated' && !p.note) return `${p.field} estimated without a note`;
  }
  return null;
}

async function research(target: string, ms = 30_000) {
  const before = room().nextRoundId;
  const logStart = logSince(0).length;
  const res = await fetch(`${SERVER}/dev/research?room=${room().code}&target=${target}`, { method: 'POST' });
  if (!res.ok) throw new Error(`dev/research ${target}: ${res.status}`);
  await until(`${target} committed`, () => room().nextRoundId !== undefined && room().nextRoundId !== before, ms);
  return { round: next()!, log: logSince(logStart) };
}

await host.conn.reducers.createRoom({ name: 'Host' });
await until('room', () => !!room());

await step('research agent (Grok) prepares a planet: sourced, fact-checked, committed', async () => {
  if (!health.voice) throw new Error('XAI_API_KEY not configured on the server');
  const t0 = Date.now();
  const { round, log } = await research('agent');
  const err = provenanceOk(round.id);
  if (err) throw new Error(err);
  const checked = log.some(l => /fact-checked|Fact check: replaced/.test(l));
  if (!checked) throw new Error(`no fact-check line in log: ${log.join(' | ')}`);
  return `${round.planetName} in ${((Date.now() - t0) / 1000).toFixed(1)} s — "${round.headline}"`;
});

await step('all six curated bodies commit through the module with their twists', async () => {
  const twists: string[] = [];
  for (const key of CURATED) {
    const { round } = await research(key);
    const err = provenanceOk(round.id);
    if (err) throw new Error(`${key}: ${err}`);
    twists.push(`${round.planetName}: ${round.twist}`);
  }
  return twists.join(' · ');
});

await step('every cached-pack planet is accepted by the module (valid + winnable)', async () => {
  const dir = new URL('../../data/cached_pack/', import.meta.url);
  const files = readdirSync(dir).filter(f => f.endsWith('.json'));
  if (files.length < 10) throw new Error(`only ${files.length} pack planets`);
  for (const f of files) {
    const args = JSON.parse(readFileSync(new URL(f, dir), 'utf8'));
    await owner.conn.reducers.commitRound({
      roomId: room().id,
      ...args,
      params: args.params.map((p: { num: number | null; flag: boolean | null }) => ({ ...p, num: p.num ?? undefined, flag: p.flag ?? undefined })),
    });
  }
  return `${files.length} planets`;
});

await step('when live research fails, the room still gets a planet from the cached pack', async () => {
  const { round, log } = await research('fail');
  const err = provenanceOk(round.id);
  if (err) throw new Error(err);
  if (!log.some(l => /from the archive/.test(l))) throw new Error(log.join(' | '));
  return round.planetName;
});

await host.conn.reducers.leaveRoom({});
await fetch(`${SERVER}/dev/auto-research?enabled=true`, { method: 'POST' });
console.log(`\nAll ${passed} checks passed.`);
for (const c of [host, owner]) c.conn.disconnect();
process.exit(0);
