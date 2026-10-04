// Audio fan-out: every device in a room gets the same Mission Control audio (Plan.md → Voice assistant).
// Clients connect to ws(s)://<server>/voice?room=CODE and only receive: binary PCM16 24 kHz frames plus
// small JSON control messages ({type:'start'|'end', key}).

import type { Server } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { roomByCode } from '../spacetime';

const listeners = new Map<bigint, Set<WebSocket>>();

export function attachVoiceSocket(server: Server): void {
  const wss = new WebSocketServer({ server, path: '/voice' });
  wss.on('connection', (ws, req) => {
    const code = new URL(req.url ?? '', 'http://localhost').searchParams.get('room') ?? '';
    let room;
    try {
      room = roomByCode(code);
    } catch {
      room = undefined;
    }
    if (!room) return ws.close(4004, 'No room with that code');
    const set = listeners.get(room.id) ?? new Set();
    set.add(ws);
    listeners.set(room.id, set);
    ws.on('close', () => set.delete(ws));
  });
}

export function listenerCount(roomId: bigint): number {
  return listeners.get(roomId)?.size ?? 0;
}

export function broadcastAudio(roomId: bigint, chunk: Buffer): void {
  for (const ws of listeners.get(roomId) ?? []) if (ws.readyState === ws.OPEN) ws.send(chunk, { binary: true });
}

export function broadcastControl(roomId: bigint, msg: { type: 'start' | 'end'; key: string }): void {
  const data = JSON.stringify(msg);
  for (const ws of listeners.get(roomId) ?? []) if (ws.readyState === ws.OPEN) ws.send(data);
}
