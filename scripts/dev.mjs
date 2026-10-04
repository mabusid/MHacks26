// `pnpm dev`: local SpacetimeDB + module auto-publish/bindings + client + server, one terminal.
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, utimesSync, watch } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const PING = 'http://127.0.0.1:3000/v1/ping';

// The installer puts the CLI in ~/.local/bin, which is often not on PATH yet.
const localBin = join(homedir(), '.local', 'bin');
const env = { ...process.env, PATH: `${localBin}:${process.env.PATH}` };
if (spawnSync('spacetime', ['--version'], { env }).error) {
  console.error('spacetime CLI not found. Install: curl -sSf https://install.spacetimedb.com | sh');
  process.exit(1);
}

const colors = { db: 90, module: 35, client: 36, server: 33 };
const children = [];

function run(name, cmd, args, keep = () => true) {
  // detached: own process group, so shutdown can kill pnpm *and* the vite/tsx it spawns.
  const child = spawn(cmd, args, { env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  const tag = `\x1b[${colors[name]}m[${name}]\x1b[0m `;
  const pipe = stream => out => {
    for (const line of out.toString().split('\n')) if (line.trim() && keep(line)) stream.write(tag + line + '\n');
  };
  child.stdout.on('data', pipe(process.stdout));
  child.stderr.on('data', pipe(process.stderr));
  child.on('exit', code => {
    console.log(`${tag}exited (${code})`);
    if (name !== 'db') shutdown(code ?? 1);
  });
  children.push(child);
  return child;
}

async function pingOk() {
  try {
    return (await fetch(PING)).ok;
  } catch {
    return false;
  }
}

let shuttingDown = false;
function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  for (const c of children) {
    if (c.exitCode !== null) continue;
    try {
      process.kill(-c.pid, 'SIGTERM');
    } catch {
      c.kill('SIGTERM');
    }
  }
  setTimeout(() => process.exit(code), 300);
}
process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

if (await pingOk()) {
  console.log('[db] using SpacetimeDB already running on :3000');
} else {
  // The standalone server logs every transaction at INFO/DEBUG; only surface problems.
  run('db', 'spacetime', ['start'], line => !/\b(INFO|DEBUG|TRACE)\b/.test(line));
  for (let i = 0; i < 60 && !(await pingOk()); i++) await new Promise(r => setTimeout(r, 500));
  if (!(await pingOk())) {
    console.error('[db] SpacetimeDB did not start on :3000');
    shutdown(1);
  }
}

if (!existsSync('node_modules')) console.warn('node_modules missing — run `pnpm install` first');

// Database name, module path, and bindings target live in spacetime.json.
// --server-only: otherwise `spacetime dev` runs the root `dev` script again as its "client".
// --delete-data=on-conflict: local data is disposable; wipe it when a schema change can't migrate.
run('module', 'spacetime', ['dev', '--server-only', '--server', 'local', '--yes', '--delete-data=on-conflict']);
// `spacetime dev` only watches spacetimedb/, but the module bundles packages/shared — touch the module entry
// when shared code changes so it rebuilds and republishes too.
let bumpTimer;
watch('packages/shared/src', { recursive: true }, (_event, file) => {
  if (!file || file.endsWith('.test.ts')) return;
  clearTimeout(bumpTimer);
  bumpTimer = setTimeout(() => {
    const now = new Date();
    utimesSync('spacetimedb/src/index.ts', now, now);
    console.log(`\x1b[${colors.module}m[module]\x1b[0m shared/${file} changed → rebuilding module`);
  }, 300);
});

run('client', 'pnpm', ['--filter', '@mission-control/client', 'dev']);
run('server', 'pnpm', ['--filter', '@mission-control/server', 'dev']);
