// Checkpoint 9: Mission Control — automatic cues, captions, audio broadcast, template hints that track the grid.
// Needs `pnpm dev`. With XAI_API_KEY in server/.env it also checks Grok audio. Run: pnpm check:phase9
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
          .subscribe([tables.room, tables.member, tables.round, tables.tile, tables.piece, tables.hint]);
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

await fetch(`${SERVER}/dev/auto-research?enabled=false`, { method: 'POST' });
const health = (await (await fetch(`${SERVER}/health`)).json()) as { voice: boolean };
console.log(`Phase 9 checks against ${URI}/${DB} and ${SERVER} (Grok voice: ${health.voice ? 'on' : 'off'})`);
const host = await connect();
const db = host.conn.db;
const room = () => [...db.room.iter()].find(r => [...db.member.iter()].some(m => m.roomId === r.id && m.identity.toHexString() === host.hex))!;
const round = () => db.round.id.find(room().currentRoundId!)!;
const hint = (cue: number) => [...db.hint.iter()].find(h => h.roundId === room().currentRoundId && h.cue === cue);

await host.conn.reducers.createRoom({ name: 'Host' });
await until('room', () => !!room());
const code = room().code;
const res = await fetch(`${SERVER}/dev/commit-fixture?room=${code}&planet=moon`, { method: 'POST' });
if (!res.ok) throw new Error(`commit-fixture ${res.status}`);
await until('ready', () => room().nextRoundId !== undefined);

// Listen like a device would.
let audioBytes = 0;
const controls: string[] = [];
const ws = new WebSocket(`${SERVER.replace(/^http/, 'ws')}/voice?room=${code}`); // Node 22 built-in WebSocket
ws.binaryType = 'arraybuffer';
ws.addEventListener('message', e => (e.data instanceof ArrayBuffer ? (audioBytes += e.data.byteLength) : controls.push(JSON.parse(String(e.data)).type)));
await new Promise(r => ws.addEventListener('open', r));

await host.conn.reducers.startRound({});
await until('briefing', () => room().phase.tag === 'Briefing');
await host.conn.reducers.beginBuild({});
await until('build', () => room().phase.tag === 'Build');

await step('the first cue fires on its own ~4 s into the build: a welcome fun fact, captioned for everyone', async () => {
  await until('cue 0', () => !!hint(0), 12_000);
  const h = hint(0)!;
  if (h.mode !== 'fact' || !round().funFacts.some(f => f.slice(0, 20) === h.text.slice(0, 20))) throw new Error(`${h.mode}: ${h.text}`);
  if (health.voice) {
    await until('audio for cue 0', () => audioBytes > 24_000 && controls.includes('end'), 15_000);
    return `"${h.text}" · ${(audioBytes / 48_000).toFixed(1)} s of audio broadcast`;
  }
  return `"${h.text}" (template, spoken by the browser)`;
});

await fetch(`${SERVER}/dev/pause-cues?room=${code}`, { method: 'POST' }); // manual cues from here on
const cue = async (n: number, voice = 'template') => {
  const r = await fetch(`${SERVER}/dev/cue?room=${code}&cue=${n}&voice=${voice}`, { method: 'POST' });
  const body = (await r.json()) as { mode: string; text: string; voiced: boolean; error?: string };
  if (!r.ok) throw new Error(body.error);
  return body;
};

await step('template hints read the grid: empty board → nudge names the weak system (no numbers)', async () => {
  const out = await cue(2);
  if (out.mode !== 'nudge' || /\d/.test(out.text) || out.voiced) throw new Error(JSON.stringify(out));
  await until('caption', () => hint(2)?.text === out.text);
  return out.text;
});

await step('next cue gives the reason plus the researched fact (direction)', async () => {
  const out = await cue(3);
  if (out.mode !== 'direction' || !/short by/.test(out.text)) throw new Error(JSON.stringify(out));
  return out.text;
});

await step('help is capped: an unchanged board does NOT escalate to an exact move before the final cue', async () => {
  const out = await cue(4); // scheduled "direction"; old rules would have escalated to exact
  if (out.mode !== 'direction' || /Try (a|an) /.test(out.text)) throw new Error(JSON.stringify(out));
  return out.text;
});

await step('the crew acts → the final cue acknowledges progress and names exactly one move', async () => {
  const tiles = [...db.tile.iter()].filter(t => t.roundId === room().currentRoundId).sort((a, b) => a.index - b.index);
  const free = tiles.find(t => t.kind === 'shaded' && ![19, 20, 26, 29, 34, 37, 43, 44].includes(t.index))!.index;
  await host.conn.reducers.placePiece({ kind: 'reactor', index: free });
  for (const i of [19, 20, 26, 29]) await host.conn.reducers.placePiece({ kind: 'berm', index: i });
  await until('pieces placed', () => [...db.piece.iter()].filter(p => p.roundId === room().currentRoundId).length === 5);
  const out = await cue(5);
  if (out.mode !== 'exact' || !/^Nice — /.test(out.text) || (out.text.match(/ on [A-H][1-8]/g) ?? []).length !== 1) throw new Error(JSON.stringify(out));
  return out.text;
});

if (health.voice) {
  await step('Grok speaks a fun fact verbatim: audio to every listener, caption = the researched text', async () => {
    const before = audioBytes;
    const out = await cue(1, 'grok');
    if (!out.voiced || audioBytes - before < 24_000) throw new Error(`${JSON.stringify(out)} · ${audioBytes - before} bytes`);
    await until('voiced caption', () => hint(1)?.voiced === true);
    return `"${hint(1)!.text}" · ${((audioBytes - before) / 48_000).toFixed(1)} s`;
  });

  await step('Grok phrases a grid hint: audio + transcript caption', async () => {
    const before = audioBytes;
    const out = await cue(3, 'grok');
    if (!out.voiced || audioBytes - before < 24_000 || !out.text) throw new Error(`${JSON.stringify(out)} · ${audioBytes - before} bytes`);
    return `"${out.text}" · ${((audioBytes - before) / 48_000).toFixed(1)} s`;
  });
}

ws.close();
await host.conn.reducers.leaveRoom({});
await fetch(`${SERVER}/dev/auto-research?enabled=true`, { method: 'POST' });
console.log(`\nAll ${passed} checks passed.`);
host.conn.disconnect();
process.exit(0);
