import { useEffect, useState } from 'react';

/** Reveals text character by character — roughly speaking pace (~15 chars/s). */
export function useTypewriter(text: string, charsPerSecond = 15): string {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    setShown(0);
    if (!text) return;
    const id = setInterval(() => setShown(n => (n >= text.length ? n : n + 1)), 1000 / charsPerSecond);
    return () => clearInterval(id);
  }, [text, charsPerSecond]);
  return text.slice(0, shown);
}
