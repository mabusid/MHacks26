// Starts research automatically: a room in the lobby or debrief without a prepared planet gets one
// (new rooms, and the next planet during the debrief). One run per room at a time; 20 s budget.

import type { DbConnection } from '../module_bindings';
import { commitFixture } from '../fixtures';
import { onConnected } from '../spacetime';
import { runScripted, type ScriptedTarget } from './scripted';
import { ResearchSession, type Sink } from './session';

const BUDGET_MS = 20_000;
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

export function sinkFor(conn: DbConnection, roomId: bigint): Sink {
  return {
    log: text => conn.reducers.logResearch({ roomId, text }),
    commit: args =>
      conn.reducers.commitRound({
        roomId,
        planetName: args.planetName,
        params: args.params.map(p => ({ ...p, num: p.num ?? undefined, flag: p.flag ?? undefined })),
        twist: args.twist,
        headline: args.headline,
        scaleText: args.scaleText,
        because: args.because,
        funFacts: args.funFacts,
      }),
  };
}

/** Plan.md: 50% solar system / 50% exoplanet, no repeats in a session. */
function chooseTarget(history: string[]): ScriptedTarget {
  const curated = (['moon', 'mars'] as const).filter(k => !history.some(h => h.toLowerCase().startsWith(k)));
  if (curated.length && Math.random() < 0.5) return curated[Math.floor(Math.random() * curated.length)];
  return 'exoplanet';
}

export function isResearching(roomId: bigint): boolean {
  return inFlight.has(roomId);
}

export async function research(conn: DbConnection, roomId: bigint, target?: ScriptedTarget): Promise<void> {
  if (inFlight.has(roomId)) return;
  inFlight.add(roomId);
  const history = seen.get(roomId) ?? [];
  const chosen = target ?? chooseTarget(history);
  const session = new ResearchSession(sinkFor(conn, roomId));
  try {
    const name = await Promise.race([
      runScripted(session, chosen, history),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error(`research took over ${BUDGET_MS / 1000} s`)), BUDGET_MS)),
    ]);
    seen.set(roomId, [...history, name]);
    console.log(`[research] room ${roomId}: ${name}`);
  } catch (e) {
    console.warn(`[research] room ${roomId} failed (${e instanceof Error ? e.message : e}); using a backup planet`);
    try {
      await conn.reducers.logResearch({ roomId, text: 'Live research hit a snag — loading a backup destination' });
      await commitFixture(roomId, history.some(h => /moon/i.test(h)) ? 'mars' : 'moon');
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
    conn.db.room.onDelete((_ctx, r) => seen.delete(r.id));
    for (const r of conn.db.room.iter()) check(r);
  });
}
