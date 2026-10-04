import LeaveButton from '../LeaveButton';
import { useEffect, useState } from 'react';
import type { Round } from '../module_bindings/types';

function useSecondsLeft(endsAtMicros: bigint | undefined): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, []);
  if (endsAtMicros === undefined) return 0;
  return Math.max(0, Math.ceil((Number(endsAtMicros / 1000n) - now) / 1000));
}

// Phase 3 placeholder: the countdown proves the scheduled build end. The grid arrives in Phase 5.
export default function Build({ round }: { round: Round }) {
  const left = useSecondsLeft(round.buildEndsAt?.microsSinceUnixEpoch);
  return (
    <main className="screen">
      <p className="muted">Building on {round.planetName}</p>
      <p className="room-code">
        {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
      </p>
      <p className="muted">The grid arrives in Phase 5. When the timer hits 0:00 the server ends the round.</p>
      <LeaveButton />
    </main>
  );
}
