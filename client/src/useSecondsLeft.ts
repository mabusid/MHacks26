import { useEffect, useState } from 'react';

/** Client-side countdown from the server's build_ends_at; the server is authoritative at 0:00. */
export function useSecondsLeft(endsAtMicros: bigint | undefined): number | undefined {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (endsAtMicros === undefined) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [endsAtMicros]);
  if (endsAtMicros === undefined) return undefined;
  return Math.max(0, Math.ceil((Number(endsAtMicros / 1000n) - now) / 1000));
}

export function clock(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
