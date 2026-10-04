// Checkpoint 7: research plumbing — automatic research per room, scripted Moon/Mars/exoplanet runs,
// provenance on every committed value, next planet prepared during the debrief.
// Needs `pnpm dev` running and network access (NASA Exoplanet Archive). Run: pnpm check:phase7
import { DbConnection, tables } from '../../client/src/module_bindings/index.ts';

const URI = process.env.SPACETIME_URI ?? 'ws://localhost:3000';
const DB = process.env.SPACETIME_DB ?? 'overburden';
const SERVER = process.env.SERVER_URL ?? 'http://localhost:8787';

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
          .subscribe([tables.room, tables.member, tables.round, tables.requirement, tables.planetParameter, tables.researchLog, tables.result]);
      })
      .onConnectError((_ctx, err) => reject(err))
      .build()
  );
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

await fetch(`${SERVER}/dev/auto-research?enabled=true`, { method: 'POST' });
console.log(`Phase 7 checks against ${URI}/${DB} and ${SERVER}`);
const host = await connect();
const db = host.conn.db;
const room = () => [...db.room.iter()].find(r => [...db.member.iter()].some(m => m.roomId === r.id && m.identity.toHexString() === host.hex))!;
const next = () => (room().nextRoundId !== undefined ? db.round.id.find(room().nextRoundId!) : undefined);
const paramsOf = (roundId: bigint) => [...db.planetParameter.iter()].filter(p => p.roundId === roundId);
const reqsOf = (roundId: bigint) => [...db.requirement.iter()].filter(r => r.roundId === roundId);
const logLines = () => [...db.researchLog.iter()].filter(l => l.roomId === room().id).map(l => l.text);

/** Every value is sourced (label + https URL) or estimated with a reason. */
function provenanceOk(roundId: bigint): string | null {
  for (const p of paramsOf(roundId)) {
    if (p.status === 'sourced' && (!p.sourceLabel || !p.sourceUrl.startsWith('https://'))) return `${p.field} sourced without label/URL`;
    if (p.status === 'estimated' && !p.note) return `${p.field} estimated without a note`;
  }
  return paramsOf(roundId).length === 10 ? null : `expected 10 params, got ${paramsOf(roundId).length}`;
}

async function forceResearch(target: string) {
  const before = room().nextRoundId;
  const res = await fetch(`${SERVER}/dev/research?room=${room().code}&target=${target}`, { method: 'POST' });
  if (!res.ok) throw new Error(`dev/research ${target}: ${res.status}`);
  await until(`${target} committed`, () => room().nextRoundId !== undefined && room().nextRoundId !== before, 20_000);
  return next()!;
}

await step('a new room is researched automatically: log lines stream, then a planet is ready (≤ 30 s)', async () => {
  await host.conn.reducers.createRoom({ name: 'Host' });
  await until('room', () => !!room());
  await until('research done', () => next()?.status.tag === 'Ready', 30_000);
  const err = provenanceOk(next()!.id);
  if (err) throw new Error(err);
  return `${next()!.planetName} · ${logLines().length} log lines`;
});

await step('scripted Moon: every value cited to NASA or a paper; radiation twist, 4 berms', async () => {
  const rd = await forceResearch('moon');
  const err = provenanceOk(rd.id);
  if (err) throw new Error(err);
  const twist = reqsOf(rd.id).find(r => r.kind === 'twist')!;
  if (rd.twist !== 'radiation' || twist.threshold !== '4 berms next to the habitat') throw new Error(`${rd.twist}: ${twist.threshold}`);
  const dose = paramsOf(rd.id).find(p => p.field === 'radiationDoseMSvPerDay')!;
  return `dose ${dose.num} mSv/day (${dose.sourceLabel})`;
});

await step('scripted Mars: different twist and thresholds (dust storms → ×2 storm reserve on its own line)', async () => {
  const rd = await forceResearch('mars');
  if (rd.twist !== 'dust' || rd.nightBand !== 1) throw new Error(`${rd.twist}, band ${rd.nightBand}`);
  const twist = reqsOf(rd.id).find(r => r.kind === 'twist')!;
  if (twist.summary !== 'Storm reserve (×2 storage)') throw new Error(twist.summary);
  return twist.summary;
});

await step('live exoplanet: archive values cite the paper; unknowns are estimated with reasons', async () => {
  const rd = await forceResearch('exoplanet');
  const err = provenanceOk(rd.id);
  if (err) throw new Error(err);
  const ps = paramsOf(rd.id);
  const sun = ps.find(p => p.field === 'insolation')!;
  if (!/NASA Exoplanet Archive/.test(sun.sourceLabel)) throw new Error(`insolation source: ${sun.sourceLabel}`);
  const unknown = ps.filter(p => p.status === 'estimated').map(p => p.field);
  if (!unknown.includes('nightHours') || !unknown.includes('surfacePressureBar')) throw new Error(`estimated: ${unknown}`);
  const night = ps.find(p => p.field === 'nightHours')!;
  if (night.num === 0 ? !/tidally locked/.test(night.note) || rd.nightBand !== 0 : rd.nightBand !== 2) throw new Error(`night ${night.num}: ${night.note}, band ${rd.nightBand}`);
  return `${rd.planetName}: sunlight ${sun.num}× (${sun.sourceLabel}); unknown: ${unknown.join(', ')}`;
});

await step('the debrief prepares the next planet automatically; Next planet goes straight to its briefing', async () => {
  await host.conn.reducers.startRound({});
  await until('briefing', () => room().phase.tag === 'Briefing');
  await host.conn.reducers.beginBuild({});
  await until('build', () => room().phase.tag === 'Build');
  await host.conn.reducers.lockBuild({});
  await until('debrief', () => room().phase.tag === 'Debrief');
  await until('next planet prepared', () => next()?.status.tag === 'Ready', 30_000);
  const name = next()!.planetName;
  await host.conn.reducers.rematch({});
  await until('briefing again', () => room().phase.tag === 'Briefing');
  return name;
});

await host.conn.reducers.leaveRoom({});
console.log(`\nAll ${passed} checks passed.`);
host.conn.disconnect();
process.exit(0);
