import { useState } from 'react';
import { PHASE_LABEL } from '../format';
import type { Room, Round } from '../module_bindings/types';
import { useMute } from '../useMute';
import { clock, useSecondsLeft } from '../useSecondsLeft';

export default function TopBar({ room, round }: { room: Room; round: Round | undefined }) {
  const [copied, setCopied] = useState(false);
  const [muted, toggleMute] = useMute();
  const building = room.phase.tag === 'Build';
  const left = useSecondsLeft(building ? round?.buildEndsAt?.microsSinceUnixEpoch : undefined);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(room.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      // Clipboard blocked; the code is on screen anyway.
    }
  }

  return (
    <header className="topbar">
      <button className="code-chip" onClick={copyCode} title="Copy room code">
        <span className="label">Room</span> {room.code}
        <span className="muted small">{copied ? 'copied' : 'copy'}</span>
      </button>
      <span className="topbar-planet">{round?.planetName ?? 'No planet yet'}</span>
      <span className="phase-chip">{PHASE_LABEL[room.phase.tag]}</span>
      <span className="spacer" />
      {left !== undefined && <span className={left <= 30 ? 'timer urgent' : 'timer'}>{clock(left)}</span>}
      {building && round && <span className="mass">— / {round.massBudget} CU</span>}
      <button className="icon-btn" onClick={toggleMute} aria-pressed={muted} title={muted ? 'Unmute Mission Control' : 'Mute Mission Control'}>
        {muted ? '🔇' : '🔊'}
      </button>
    </header>
  );
}
