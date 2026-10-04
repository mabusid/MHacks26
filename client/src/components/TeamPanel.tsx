import { useState } from 'react';
import { unlockAudio } from '../audio';
import { MAX_MEMBERS } from '@overburden/shared';
import { crewColor } from '../format';
import LeaveButton from '../LeaveButton';
import { useMute } from '../useMute';
import type { RoomData } from '../useRoom';

/** The team: code to share, who's in, sound, leave. */
export default function TeamPanel({ data }: { data: RoomData }) {
  const { room, members, me } = data;
  const [copied, setCopied] = useState(false);
  const [muted, toggleMute] = useMute();
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
    <div className="team">
      <p className="label">Team code · share to invite</p>
      <button className="room-code" onClick={copy} title="Copy team code">
        {room.code}
        <span className="copy-hint">{copied ? 'copied' : 'copy'}</span>
      </button>

      <p className="label">
        Crew {members.length}/{MAX_MEMBERS}
      </p>
      <ul className="members">
        {members.map(m => (
          <li key={m.identity.toHexString()} className={m.online ? '' : 'offline'}>
            <span className="swatch" style={{ background: crewColor(members, m) }} />
            <span className="member-name">
              {m.name}
              {m.identity.isEqual(me.identity) && <span className="muted"> (you)</span>}
            </span>
            {room.host.isEqual(m.identity) && <span className="badge">★ host</span>}
          </li>
        ))}
      </ul>
      <div className="team-foot">
        <button
          className={muted ? 'secondary sound-btn off' : 'secondary sound-btn'}
          aria-pressed={!muted}
          onClick={() => {
            unlockAudio(); // a click: lets the browser play Mission Control later
            toggleMute();
          }}
        >
          {muted ? '🔇 Sound off' : '🔊 Sound on'}
        </button>
        <LeaveButton />
      </div>
    </div>
  );
}
