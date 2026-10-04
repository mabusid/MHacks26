import LeaveButton from '../LeaveButton';
import type { Round } from '../module_bindings/types';

// Phase 3 placeholder: results and rematch arrive in Phase 6.
export default function Debrief({ round }: { round: Round }) {
  return (
    <main className="screen">
      <p className="muted">Debrief</p>
      <h1>Time’s up on {round.planetName}</h1>
      <p className="muted">Scoring and rematch arrive in Phase 6.</p>
      <LeaveButton />
    </main>
  );
}
