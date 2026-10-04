// Mission Control audio playback. Browsers only allow audio after a user gesture, so the context is
// created/resumed from clicks (Create, Join, the Mission Control bar). PCM16 24 kHz chunks are queued gaplessly.
import { speakable } from '@overburden/shared';

const RATE = 24_000;
const JITTER_S = 0.1;

let ctx: AudioContext | undefined;
let gain: GainNode | undefined;
let playhead = 0;
let muted = false;
const listeners = new Set<() => void>();

function ensure(): AudioContext | undefined {
  if (ctx) return ctx;
  try {
    ctx = new AudioContext({ sampleRate: RATE });
  } catch {
    ctx = new AudioContext();
  }
  gain = ctx.createGain();
  gain.gain.value = muted ? 0 : 1;
  gain.connect(ctx.destination);
  ctx.onstatechange = () => listeners.forEach(l => l());
  return ctx;
}

/** Call from a click handler. */
export function unlockAudio(): void {
  void ensure()?.resume();
}

export function audioLocked(): boolean {
  return !ctx || ctx.state !== 'running';
}

export function onAudioStateChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function setAudioMuted(m: boolean): void {
  muted = m;
  if (gain && ctx) gain.gain.setTargetAtTime(m ? 0 : 1, ctx.currentTime, 0.02);
  if (m && 'speechSynthesis' in window) window.speechSynthesis.cancel();
}

/** Queue one PCM16 little-endian mono chunk. */
export function playPcm(buf: ArrayBuffer): void {
  const c = ctx;
  if (!c || !gain || c.state !== 'running' || buf.byteLength < 2) return;
  const pcm = new Int16Array(buf, 0, Math.floor(buf.byteLength / 2));
  const audio = c.createBuffer(1, pcm.length, RATE);
  const ch = audio.getChannelData(0);
  for (let i = 0; i < pcm.length; i++) ch[i] = pcm[i] / 32768;
  const src = c.createBufferSource();
  src.buffer = audio;
  src.connect(gain);
  playhead = Math.max(playhead, c.currentTime + JITTER_S);
  src.start(playhead);
  playhead += audio.duration;
}

/** Common standard male English voices across macOS, Windows, Chrome, and Android (same feel as Grok's Rex). */
const MALE = /\b(Daniel|Alex|Fred|Aaron|Arthur|Gordon|Rishi|David|Mark|Guy|George|Google UK English Male|Male)\b/i;

/** A male English voice if the device has one; otherwise the browser default. */
function maleVoice(): SpeechSynthesisVoice | undefined {
  const english = window.speechSynthesis.getVoices().filter(v => v.lang.startsWith('en'));
  return english.find(v => MALE.test(v.name) && v.lang === 'en-US') ?? english.find(v => MALE.test(v.name));
}

/** Fallback when the server has no voice: the browser reads the caption (same text on every device). */
export function speak(text: string): void {
  if (muted || !('speechSynthesis' in window) || !text) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(speakable(text));
  const voice = maleVoice();
  if (voice) u.voice = voice;
  u.rate = 1.05;
  window.speechSynthesis.speak(u);
}
