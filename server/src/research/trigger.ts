// Starts research automatically: a room in the lobby or debrief without a prepared planet gets one
// (new rooms, and the next planet during the debrief). One run per room at a time.
// Prepare (pick + fetch + record, ~1 s, no model) → agent writes the card (~2–5 s) → commit.
// If the agent fails or runs long, the scripted card goes onto the same prepared planet.

import type { DbConnection } from '../module_bindings';
import { onConnected } from '../spacetime';
import { config } from '../config';
import { agentCard } from './agent';
import { commitFromPack } from './pack';
import { SCRIPTED_TARGETS, commitCard, exploringLines, narrate, prepare, runScripted, scriptedCard, type ScriptedTarget } from './scripted';
import { ResearchSession, type Sink } from './session';

/** Whole run, including the fallbacks; then the cached pack. */
const BUDGET_MS = 20_000;
/** The agent only writes the card (one call + a fact check). Past this, the scripted card is used. */
const AGENT_BUDGET_MS = 12_000;
/** Dev switch (POST /dev/auto-research): checks that need a planet-free room turn this off while they run. */
let autoResearch = true;
let resumeTimer: ReturnType<typeof setTimeout> | undefined;

/** Pausing expires after 5 minutes, so a check that crashes can't leave research off. */
export function setAutoResearch(on: boolean): void {
  autoResearch = on;
  clearTimeout(resumeTimer);
  if (!on) resumeTimer = setTimeout(() => (autoResearch = true), 5 * 60_000);
}
const inFlight = new Set<bigint>();
/** Planets each room has already seen (avoid repeats within a session). */
const seen = new Map<bigint, string[]>();
/** Each room's last twist, so the next planet can teach something different. */
const lastTwist = new Map<bigint, string>();

export function sinkFor(conn: DbConnection, roomId: bigint): Sink {
  return {
    log: text => conn.reducers.logResearch({ roomId, text }),
    commit: async args => {
      await conn.reducers.commitRound({
        roomId,
        planetName: args.planetName,
        params: args.params.map(p => ({ ...p, num: p.num ?? undefined, flag: p.flag ?? undefined })),
        twist: args.twist,
        headline: args.headline,
        scaleText: args.scaleText,
        because: args.because,
        funFacts: args.funFacts,
      });
      lastTwist.set(roomId, args.twist); // agent, scripted, and pack paths all commit here
    },
  };
}

/** Plan.md: 50% solar system / 50% exoplanet, no repeats in a session. */
function chooseTarget(history: string[]): ScriptedTarget {
  const curated = SCRIPTED_TARGETS.filter(k => k !== 'exoplanet' && !history.some(h => h.toLowerCase().startsWith(k)));
  if (curated.length && Math.random() < 0.5) return curated[Math.floor(Math.random() * curated.length)];
  return 'exoplanet';
}

export function isResearching(roomId: bigint): boolean {
  return inFlight.has(roomId);
}

/** 'fail' (dev only) simulates live research failing, to exercise the cached-pack fallback. */
export type ResearchMode = 'agent' | 'fail' | ScriptedTarget;

/** Prepare the planet, then the agent's card (if there's a key and no forced target), else the scripted card. */
async function attempt(conn: DbConnection, roomId: bigint, history: string[], target?: ResearchMode): Promise<string> {
  if (target === 'fail') throw new Error('simulated research failure (dev)');
  const last = lastTwist.get(roomId);
  const s = new ResearchSession(sinkFor(conn, roomId));
  const useAgent = (target === undefined || target === 'agent') && !!config.xaiApiKey;
  if (!useAgent) return runScripted(s, target && target !== 'agent' ? target : chooseTarget(history), history, last);

  const p = await prepare(s, chooseTarget(history), history);
  await s.log('Research officer analysing the data…');
  const stopNarration = narrate(s, exploringLines(p));
  try {
    const card = await agentCard(s, p, last, AbortSignal.timeout(AGENT_BUDGET_MS)).finally(stopNarration);
    await s.log(`Mission twist: ${s.chosenTwist}`);
    return await commitCard(s, card);
  } catch (e) {
    console.warn(`[research] agent failed for room ${roomId}: ${e instanceof Error ? e.message : e}`);
    if (target === 'agent') throw e;
    await s.log('Research officer offline — using the standard briefing');
    const card = scriptedCard(s, p, last);
    await s.log(`Mission twist: ${s.chosenTwist}`);
    return commitCard(s, card);
  }
}

export async function research(conn: DbConnection, roomId: bigint, target?: ResearchMode): Promise<void> {
  if (inFlight.has(roomId)) return;
  inFlight.add(roomId);
  const history = seen.get(roomId) ?? [];
  try {
    const name = await Promise.race([
      attempt(conn, roomId, history, target),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`research took over ${BUDGET_MS / 1000} s`)), BUDGET_MS)),
    ]);
    seen.set(roomId, [...history, name]);
    console.log(`[research] room ${roomId}: ${name}`);
  } catch (e) {
    console.warn(`[research] room ${roomId} failed (${e instanceof Error ? e.message : e}); using a backup planet`);
    try {
      await conn.reducers.logResearch({ roomId, text: 'Live research hit a snag — loading a destination from the archive' });
      const name = await commitFromPack(sinkFor(conn, roomId), history);
      seen.set(roomId, [...history, name]);
      await conn.reducers.logResearch({ roomId, text: `Destination locked: ${name}` });
    } catch (fallbackErr) {
      // Room probably closed mid-research.
      console.warn(`[research] room ${roomId} fallback failed: ${fallbackErr instanceof Error ? fallbackErr.message : fallbackErr}`);
    }
  } finally {
    inFlight.delete(roomId);
  }
}

type RoomRow = Parameters<Parameters<DbConnection['db']['room']['onInsert']>[0]>[1];

function needsPlanet(r: RoomRow): boolean {
  return (r.phase.tag === 'Lobby' || r.phase.tag === 'Debrief') && r.nextRoundId === undefined;
}

export function startResearchWatcher(): void {
  onConnected(conn => {
    const check = (r: RoomRow) => {
      if (autoResearch && needsPlanet(r)) void research(conn, r.id);
    };
    conn.db.room.onInsert((_ctx, r) => check(r));
    conn.db.room.onUpdate((_ctx, _old, r) => check(r));
    conn.db.room.onDelete((_ctx, r) => {
      seen.delete(r.id);
      lastTwist.delete(r.id);
    });
    for (const r of conn.db.room.iter()) check(r);
  });
}
