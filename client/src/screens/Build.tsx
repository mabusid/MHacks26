import type { RoomData } from '../useRoom';

// Placeholder until Phase 5 (grid, palette, cursors). The timer is in the top bar.
export default function Build({ data }: { data: RoomData }) {
  return (
    <section className="panel">
      <p className="label">Build phase</p>
      <h2>Building on {data.current?.planetName}</h2>
      <p className="muted">The grid arrives in Phase 5. When the timer hits 0:00 the server ends the round.</p>
    </section>
  );
}
