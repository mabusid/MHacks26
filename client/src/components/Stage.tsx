import type { ReactNode } from 'react';

/** Centers a HUD card over the persistent 3D world (the world itself lives in App). */
export default function Stage({ children }: { children: ReactNode }) {
  return <div className="stage">{children}</div>;
}
