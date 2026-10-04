import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import type { Identity } from 'spacetimedb';
import { SpacetimeDBProvider } from 'spacetimedb/react';
import { DbConnection } from './module_bindings';
import App from './App';
import './index.css';

const URI = import.meta.env.VITE_SPACETIME_URI ?? 'ws://localhost:3000';
const DB = import.meta.env.VITE_SPACETIME_DB ?? 'overburden';
// Persisted so a refresh reconnects as the same identity (same member).
const TOKEN_KEY = `${URI}/${DB}/auth_token`;

function readToken(): string | undefined {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

const connectionBuilder = DbConnection.builder()
  .withUri(URI)
  .withDatabaseName(DB)
  .withToken(readToken())
  .onConnect((_conn: DbConnection, identity: Identity, token: string) => {
    try {
      localStorage.setItem(TOKEN_KEY, token);
    } catch {
      // Private mode: reconnect gets a fresh identity.
    }
    console.log('[spacetime] connected as', identity.toHexString());
  })
  .onConnectError((_ctx, err: Error) => console.error('[spacetime] connect error', err));

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SpacetimeDBProvider connectionBuilder={connectionBuilder}>
      <App />
    </SpacetimeDBProvider>
  </StrictMode>
);
