import { useMute } from '../useMute';
import { useTypewriter } from '../useTypewriter';

/**
 * Bottom bar during the build: Mission Control's line types out as it speaks (Phase 9 wires the voice).
 * Tap the bar to mute/unmute this device; text keeps typing either way.
 */
export default function MissionControlBar({ line }: { line: string }) {
  const [muted, toggle] = useMute();
  const typed = useTypewriter(line);
  return (
    <button className={muted ? 'mc-bar muted' : 'mc-bar'} onClick={toggle} title={muted ? 'Tap to unmute' : 'Tap to mute'}>
      <span className="mc-label">Mission Control</span>
      <span className="mc-text">
        {typed}
        <span className="caret" aria-hidden />
      </span>
      <span className="mc-state">{muted ? 'muted · tap to unmute' : 'tap to mute'}</span>
    </button>
  );
}
