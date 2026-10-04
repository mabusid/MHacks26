import { createServer } from 'node:http';
import { SHARED_VERSION } from '@overburden/shared';
import { config } from './config';

// Phase 0 stub. Research agent (Phase 7–8) and voice broadcast (Phase 9) attach here.
const server = createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, sharedVersion: SHARED_VERSION, voice: Boolean(config.xaiApiKey) }));
    return;
  }
  res.writeHead(404).end();
});

server.listen(config.port, () => {
  console.log(`[server] listening on :${config.port} (shared ${SHARED_VERSION}, xAI key ${config.xaiApiKey ? 'set' : 'missing — template hints only'})`);
});
