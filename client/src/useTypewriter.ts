import { useEffect, useRef, useState } from 'react';
import { lineProgress } from './audio';

/** Fallback typing speed, roughly speaking pace. */
const CHARS_PER_SECOND = 15;
/** How long a voiced caption waits for its audio before typing on its own (sound blocked, audio lost). */
const AUDIO_WAIT_MS = 2500;

/**
 * Reveals a caption in step with the voice. For a line Grok is speaking on this device, the share of
 * text shown is the share of audio heard (audio clock), so typing never runs ahead of or behind the
 * words: it waits if the caption arrives first and catches up if it arrives late. Anything not playing
 * here (browser speech, sound blocked) types at a steady speaking pace.
 */
export function useTypewriter(text: string, key = '', voiced = false): string {
  const [shown, setShown] = useState(0);
  const since = useRef(0);

  useEffect(() => {
    setShown(0);
    since.current = performance.now();
    if (!text) return;
    const estimateS = text.length / CHARS_PER_SECOND;
    let raf = 0;
    let shownNow = 0;
    const tick = () => {
      const heard = voiced ? lineProgress(key, estimateS) : undefined;
      const waited = performance.now() - since.current;
      let n: number;
      if (heard !== undefined) n = Math.round(heard * text.length);
      else if (voiced && waited < AUDIO_WAIT_MS) n = 0; // audio is on its way
      else n = Math.floor(((waited - (voiced ? AUDIO_WAIT_MS : 0)) / 1000) * CHARS_PER_SECOND);
      n = Math.min(text.length, Math.max(0, n));
      shownNow = Math.max(shownNow, n); // never un-type (fallback may start before late audio arrives)
      setShown(shownNow);
      if (shownNow < text.length) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [text, key, voiced]);

  return text.slice(0, shown);
}
