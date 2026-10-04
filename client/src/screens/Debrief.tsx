import TeamPanel from '../components/TeamPanel';
import type { RoomData } from '../useRoom';

// Frame only: results (✓/✗, one reason each, the fact behind it) and Next planet arrive in Phase 6.
export default function Debrief({ data }: { data: RoomData }) {
  return (
    <div className="card split">
      <TeamPanel data={data} />
      <div className="half planet">
        <p className="label">Debrief</p>
        <h2 className="planet-name">{data.current?.planetName}</h2>
        <p className="muted">Results arrive in Phase 6.</p>
      </div>
    </div>
  );
}
