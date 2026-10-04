import { MAX_MEMBERS } from '@overburden/shared';
import { crewColor } from '../format';
import type { Member, Room } from '../module_bindings/types';
import LeaveButton from '../LeaveButton';

export default function CrewPanel({ room, members, me }: { room: Room; members: Member[]; me: Member }) {
  return (
    <section className="panel crew">
      <h3 className="label">
        Crew {members.length}/{MAX_MEMBERS}
      </h3>
      <ul className="members">
        {members.map(m => (
          <li key={m.identity.toHexString()} className={m.online ? '' : 'offline'}>
            <span className="swatch" style={{ background: crewColor(members, m) }} />
            <span className="member-name">
              {m.name}
              {m.identity.isEqual(me.identity) && <span className="muted"> (you)</span>}
            </span>
            {room.host.isEqual(m.identity) && <span className="badge">host</span>}
            {!m.online && <span className="muted small">offline</span>}
          </li>
        ))}
        {Array.from({ length: MAX_MEMBERS - members.length }, (_, i) => (
          <li key={`open-${i}`} className="open-seat">
            Open seat
          </li>
        ))}
      </ul>
      <LeaveButton />
    </section>
  );
}
