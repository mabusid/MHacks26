// One Grok Voice (realtime) session per room during the build. Text in, audio out (no microphones).
// Verified API details: wss://api.x.ai/v1/realtime, binary PCM16 24 kHz output, force_message for verbatim lines,
// response.output_audio_transcript.{delta,done} for captions (see docs/Implementation.md).

import WebSocket from 'ws';
import { config } from '../config';

const URL_ = `wss://api.x.ai/v1/realtime?model=${process.env.XAI_VOICE_MODEL ?? 'grok-voice-latest'}`;
const RATE = 24_000;

const INSTRUCTIONS =
  'You are Mission Control for a four-player base-building game on a real planet. Calm, warm, brief — at most two short sentences. ' +
  'Use ONLY the facts, numbers, piece names, and tile names given to you. Never invent numbers, tiles, or science.';

export interface Utterance {
  onTranscript: (text: string, done: boolean) => void;
  onAudio: (chunk: Buffer) => void;
}

export class GrokVoice {
  private ws?: WebSocket;
  private ready?: Promise<void>;
  private current?: Utterance & { resolve: () => void; reject: (e: Error) => void; text: string; bytes: number };

  /** Seconds of audio produced by the last utterance (for "skip if still talking"). */
  lastSeconds = 0;

  private connect(): Promise<void> {
    this.ready ??= new Promise((resolve, reject) => {
      const ws = new WebSocket(URL_, { headers: { Authorization: `Bearer ${config.xaiApiKey}` } });
      this.ws = ws;
      ws.on('open', () => {
        ws.send(
          JSON.stringify({
            type: 'session.update',
            session: {
              voice: process.env.XAI_VOICE ?? 'eve',
              instructions: INSTRUCTIONS,
              turn_detection: { type: null },
              reasoning: { effort: 'none' },
              audio: { output: { format: { type: 'audio/pcm', rate: RATE }, transport: 'binary' } },
            },
          })
        );
      });
      ws.on('message', (data, isBinary) => {
        if (isBinary) {
          const chunk = Buffer.from(data as Buffer);
          if (this.current) {
            this.current.bytes += chunk.length;
            this.current.onAudio(chunk);
          }
          return;
        }
        const ev = JSON.parse(data.toString());
        if (ev.type === 'session.updated') resolve();
        else if (ev.type === 'response.output_audio_transcript.delta' && this.current) {
          this.current.text += ev.delta ?? '';
          this.current.onTranscript(this.current.text, false);
        } else if (ev.type === 'response.output_audio_transcript.done' && this.current) {
          this.current.text = ev.transcript ?? this.current.text;
          this.current.onTranscript(this.current.text, true);
        } else if (ev.type === 'response.done' && this.current) {
          this.lastSeconds = this.current.bytes / 2 / RATE;
          this.current.resolve();
          this.current = undefined;
        } else if (ev.type === 'error') {
          const err = new Error(`Grok Voice: ${ev.error?.message ?? JSON.stringify(ev).slice(0, 200)}`);
          if (this.current) this.current.reject(err);
          else reject(err);
          this.current = undefined;
        }
      });
      ws.on('error', err => {
        this.current?.reject(err);
        this.current = undefined;
        reject(err);
      });
      ws.on('close', () => {
        this.current?.reject(new Error('Grok Voice closed'));
        this.current = undefined;
        this.ws = undefined;
        this.ready = undefined;
      });
    });
    return this.ready;
  }

  get busy(): boolean {
    return !!this.current;
  }

  private async run(u: Utterance, send: (ws: WebSocket) => void, timeoutMs = 15_000): Promise<string> {
    await this.connect();
    if (this.current) throw new Error('Grok Voice is already speaking');
    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.current = undefined;
        reject(new Error('Grok Voice timed out'));
      }, timeoutMs);
      this.current = {
        ...u,
        text: '',
        bytes: 0,
        resolve: () => {
          clearTimeout(timer);
          resolve(this.current?.text ?? '');
        },
        reject: e => {
          clearTimeout(timer);
          reject(e);
        },
      };
      send(this.ws!);
    });
  }

  /** Speak exactly this text (fun facts, template hints) — no model involvement. */
  sayVerbatim(text: string, u: Utterance): Promise<string> {
    return this.run(u, ws =>
      ws.send(
        JSON.stringify({
          type: 'conversation.item.create',
          item: { type: 'force_message', role: 'assistant', interruptible: false, content: [{ type: 'output_text', text }] },
        })
      )
    );
  }

  /** Let Grok phrase a hint from the board read; per-response instructions set how specific to be. */
  sayHint(context: string, instructions: string, u: Utterance): Promise<string> {
    return this.run(u, ws => {
      ws.send(JSON.stringify({ type: 'conversation.item.create', item: { type: 'message', role: 'user', content: [{ type: 'input_text', text: context }] } }));
      ws.send(JSON.stringify({ type: 'response.create', response: { instructions } }));
    });
  }

  close(): void {
    this.ws?.close(1000);
  }
}
