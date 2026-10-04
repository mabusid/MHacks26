// Builds data/cached_pack/: every curated solar-system body + a few live exoplanets, through the same
// provenance-checked session as live research. Run: pnpm build:pack (needs network for exoplanets).

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { runScripted } from './scripted';
import { ResearchSession, type CommitArgs } from './session';
import { solarSystemKeys } from './sources';

const EXOPLANETS = 4;
const out = new URL('../../../data/cached_pack/', import.meta.url);
rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function record(target: string, avoid: string[]): Promise<CommitArgs> {
  let committed: CommitArgs | undefined;
  const session = new ResearchSession({ log: async () => undefined, commit: async args => void (committed = args) });
  await runScripted(session, target, avoid);
  if (!committed) throw new Error(`${target}: nothing committed`);
  return committed;
}

const names: string[] = [];
for (const key of solarSystemKeys()) names.push((await save(await record(key, names))).planetName);
for (let i = 0; i < EXOPLANETS; i++) names.push((await save(await record('exoplanet', names))).planetName);

async function save(args: CommitArgs) {
  writeFileSync(new URL(`${slug(args.planetName)}.json`, out), JSON.stringify(args, null, 2) + '\n');
  console.log(`  ✓ ${args.planetName} (${args.twist})`);
  return args;
}
console.log(`Cached pack: ${names.length} planets in data/cached_pack/`);
