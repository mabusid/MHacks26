import type { RoomData } from '../useRoom';

// Placeholder until Phase 6 (results, sources, rematch).
export default function Debrief({ data }: { data: RoomData }) {
  return (
    <section className="panel">
      <p className="label">Debrief</p>
      <h2>Time’s up on {data.current?.planetName}</h2>
      <p className="muted">Scoring and rematch arrive in Phase 6.</p>
    </section>
  );
}
