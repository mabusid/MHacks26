import type { Identity } from 'spacetimedb';
import { DbConnection, tables } from './module_bindings';
import { config } from './config';

const RETRY_MS = 2000;
let conn: DbConnection | undefined;
const connectedHooks: ((c: DbConnection) => void)[] = [];

/** Runs on every (re)connect, after the initial subscription is applied. */
export function onConnected(hook: (c: DbConnection) => void): void {
  connectedHooks.push(hook);
  if (conn) hook(conn);
}

function attempt(): void {
  DbConnection.builder()
    .withUri(config.spacetimeUri)
    .withDatabaseName(config.spacetimeDb)
    .withToken(config.spacetimeToken)
    .onConnect((c, identity: Identity) => {
      c.subscriptionBuilder()
        .onApplied(() => {
          conn = c;
          console.log(`[server] spacetime connected as ${identity.toHexString().slice(0, 12)}…`);
          for (const hook of connectedHooks) hook(c);
        })
        .subscribe([tables.room, tables.round, tables.tile, tables.piece, tables.requirement]);
    })
    .onDisconnect(() => {
      // Also fires when `spacetime dev` republishes a breaking schema change.
      conn = undefined;
      console.warn('[server] spacetime disconnected, reconnecting…');
      setTimeout(attempt, RETRY_MS);
    })
    .onConnectError(() => {
      // Database not published yet (startup race with `spacetime dev`) or server down.
      setTimeout(attempt, RETRY_MS);
    })
    .build();
}

/** Connects with the server identity and keeps a live cache; retries until the database exists. */
export function startSpacetime(): void {
  console.log(`[server] connecting to ${config.spacetimeUri}/${config.spacetimeDb}…`);
  attempt();
}

export function isConnected(): boolean {
  return conn !== undefined;
}

export function db(): DbConnection {
  if (!conn) throw new Error('Spacetime not connected');
  return conn;
}

export function roomByCode(code: string) {
  return [...db().db.room.iter()].find(r => r.code === code.toUpperCase());
}
