import { useCallback, useState } from 'react';

/** Wraps a reducer call with pending + error state so screens can show server rejections. */
export function useReducerCall<A extends unknown[]>(call: (...args: A) => Promise<void>) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string>();
  const run = useCallback(
    async (...args: A) => {
      setPending(true);
      setError(undefined);
      try {
        await call(...args);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setPending(false);
      }
    },
    [call]
  );
  return { run, pending, error };
}
