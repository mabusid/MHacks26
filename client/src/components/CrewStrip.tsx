import { useState } from 'react';
import { crewColor } from '../format';
import LeaveButton from '../LeaveButton';
import type { RoomData } from '../useRoom';

/** One slim row for the debrief: who's here, the join code (friends can join now), leave. */
export default function CrewStrip({ data }: { data: RoomData }) {
  const { room, members, me } = data;
  const [copied, setCopied] = useState(false);
  if (!room || !me) return null;

  async function copy() {
    try {
      await navigator.clipboard.writeText(room!.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // Clipboard blocked; the code is on screen.
    }
  }

  return (
    <div className="crew-strip">
      <ul className="crew-dots" aria-label="Crew">
        {members.map(m => (
          <li key={m.identity.toHexString()} className={m.online ? '' : 'offline'} title={m.name}>
            <span className="swatch" style={{ background: crewColor(members, m) }} />
            {m.name}
            {room.host.isEqual(m.identity) && <span className="host-star" aria-label="host"> ★</span>}
          </li>
        ))}
      </ul>
      <button className="code-chip" onClick={copy} title="Copy room code — friends can join now">
        {copied ? 'copied' : room.code}
      </button>
      <LeaveButton />
    </div>
  );
}
