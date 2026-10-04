import { useCallback, useState } from 'react';

const KEY = 'overburden/muted';

/** Per-device mute for Mission Control audio (Phase 9). Captions stay on either way. */
export function useMute(): [boolean, () => void] {
  const [muted, setMuted] = useState(() => {
    try {
      return localStorage.getItem(KEY) === '1';
    } catch {
      return false;
    }
  });
  const toggle = useCallback(() => {
    setMuted(m => {
      try {
        localStorage.setItem(KEY, m ? '0' : '1');
      } catch {
        // Not remembered.
      }
      return !m;
    });
  }, []);
  return [muted, toggle];
}
