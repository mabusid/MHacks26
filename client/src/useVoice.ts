import { useEffect, useRef, useState } from 'react';
import { audioLocked, beginLine, endLine, onAudioStateChange, playPcm, setAudioMuted, speak } from './audio';
import type { Hint } from './module_bindings/types';

const SERVER_URL = import.meta.env.VITE_SERVER_URL ?? 'http://localhost:8787';
const VOICE_URL = (import.meta.env.VITE_VOICE_WS_URL ?? SERVER_URL.replace(/^http/, 'ws')).replace(/\/$/, '');

/**
 * Mission Control audio for this device: streams the room's Grok audio while `active`, and speaks
 * un-voiced hints with speechSynthesis. Mute is per device; captions are unaffected.
 */
export function useVoice(roomCode: string | undefined, active: boolean, latest: Hint | undefined, muted: boolean) {
  const [locked, setLocked] = useState(audioLocked());
  const spoken = useRef<string>('');

  useEffect(() => onAudioStateChange(() => setLocked(audioLocked())), []);
  useEffect(() => setAudioMuted(muted), [muted]);

  useEffect(() => {
    if (!active || !roomCode) return;
    let ws: WebSocket | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let closed = false;
    const open = () => {
      ws = new WebSocket(`${VOICE_URL}/voice?room=${roomCode}`);
      ws.binaryType = 'arraybuffer';
      ws.onmessage = e => {
        if (e.data instanceof ArrayBuffer) return playPcm(e.data);
        // {type:'start'|'end', key}: brackets each spoken line so its caption can follow the audio clock.
        try {
          const msg = JSON.parse(String(e.data)) as { type?: string; key?: string };
          if (msg.key && msg.type === 'start') beginLine(msg.key);
          else if (msg.key && msg.type === 'end') endLine(msg.key);
        } catch {
          // Not a control message.
        }
      };
      ws.onclose = () => {
        if (!closed) retry = setTimeout(open, 2000);
      };
    };
    open();
    return () => {
      closed = true;
      clearTimeout(retry);
      ws?.close();
    };
  }, [active, roomCode]);

  // Speak each un-voiced hint once, when it first appears.
  useEffect(() => {
    if (!latest || latest.voiced || spoken.current === latest.key) return;
    spoken.current = latest.key;
    speak(latest.text);
  }, [latest]);

  return { locked };
}
