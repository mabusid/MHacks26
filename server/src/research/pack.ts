// Cached planet pack (Plan.md → Research pipeline): pre-researched rounds saved as commit arguments.
// Last-resort fallback when live research fails (no network, archive down) — still real, sourced data.

import { readFileSync, readdirSync } from 'node:fs';
import type { CommitArgs, Sink } from './session';

const DIR = new URL('../../../data/cached_pack/', import.meta.url);

export function packEntries(): CommitArgs[] {
  try {
    return readdirSync(DIR)
      .filter(f => f.endsWith('.json'))
      .sort()
      .map(f => JSON.parse(readFileSync(new URL(f, DIR), 'utf8')) as CommitArgs);
  } catch {
    return [];
  }
}

/** Commits a pack planet this room hasn't played. Returns its name. */
export async function commitFromPack(sink: Sink, avoid: string[]): Promise<string> {
  const entries = packEntries();
  if (!entries.length) throw new Error('Cached pack is empty — run pnpm build:pack');
  const fresh = entries.filter(e => !avoid.includes(e.planetName));
  const pick = (fresh.length ? fresh : entries)[Math.floor(Math.random() * (fresh.length || entries.length))];
  await sink.commit(pick);
  return pick.planetName;
}
