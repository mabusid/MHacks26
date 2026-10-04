import { execFileSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join } from 'node:path';

const dev = process.env.NODE_ENV !== 'production';

/**
 * Spacetime auth for the server identity. In dev, fall back to the local CLI login — the publisher
 * of the local database, which the module accepts for server-only reducers.
 */
function resolveSpacetimeToken(): string | undefined {
  if (process.env.SPACETIME_TOKEN) return process.env.SPACETIME_TOKEN;
  if (!dev) return undefined;
  try {
    const out = execFileSync('spacetime', ['login', 'show', '--token'], {
      encoding: 'utf8',
      env: { ...process.env, PATH: `${join(homedir(), '.local', 'bin')}:${process.env.PATH}` },
    });
    return out.match(/token[^\n]*?\bis\s+(\S+)/i)?.[1];
  } catch {
    return undefined;
  }
}

export const config = {
  dev,
  port: Number(process.env.PORT ?? 8787),
  xaiApiKey: process.env.XAI_API_KEY || undefined,
  spacetimeUri: process.env.SPACETIME_URI ?? 'ws://localhost:3000',
  spacetimeDb: process.env.SPACETIME_DB ?? 'overburden',
  spacetimeToken: resolveSpacetimeToken(),
};
