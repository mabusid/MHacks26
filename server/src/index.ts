import { createServer, type ServerResponse } from 'node:http';
import { SHARED_VERSION } from '@overburden/shared';
import { config } from './config';
import { FIXTURE_KEYS, commitFixture, type FixtureKey } from './fixtures';
import { isConnected, roomByCode, startSpacetime } from './spacetime';

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, {
    'content-type': 'application/json',
    // Dev only: the Vite client calls the dev endpoints cross-origin.
    ...(config.dev ? { 'access-control-allow-origin': '*' } : {}),
  });
  res.end(JSON.stringify(body));
}

// Research agent (Phase 7–8) and voice broadcast (Phase 9) attach here.
const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  if (url.pathname === '/health') {
    return send(res, 200, { ok: true, sharedVersion: SHARED_VERSION, spacetime: isConnected(), voice: Boolean(config.xaiApiKey) });
  }
  if (!isConnected()) return send(res, 503, { error: 'Server is still connecting to SpacetimeDB' });

  if (config.dev && req.method === 'POST' && url.pathname === '/dev/commit-fixture') {
    const room = roomByCode(url.searchParams.get('room') ?? '');
    const planet = (url.searchParams.get('planet') ?? 'moon') as FixtureKey;
    if (!room) return send(res, 404, { error: 'No room with that code' });
    if (!FIXTURE_KEYS.includes(planet)) return send(res, 400, { error: `planet must be one of ${FIXTURE_KEYS.join(', ')}` });
    try {
      await commitFixture(room.id, planet);
      return send(res, 200, { ok: true });
    } catch (e) {
      return send(res, 422, { error: e instanceof Error ? e.message : String(e) });
    }
  }
  send(res, 404, { error: 'Not found' });
});

startSpacetime();
server.listen(config.port, () => {
  console.log(`[server] listening on :${config.port} (shared ${SHARED_VERSION}, xAI key ${config.xaiApiKey ? 'set' : 'missing — template hints only'})`);
});
