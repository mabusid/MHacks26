import { unlockAudio } from '../audio';
import type { Hint } from '../module_bindings/types';
import { useMute } from '../useMute';
import { useTypewriter } from '../useTypewriter';
import { useVoice } from '../useVoice';

/**
 * Bottom bar during the build: Mission Control's line types out as it speaks.
 * Tap to mute/unmute this device (first tap enables sound if the browser blocked it). Captions always show.
 */
export default function MissionControlBar({ roomCode, hint, standby }: { roomCode: string; hint: Hint | undefined; standby: string }) {
  const [muted, toggle] = useMute();
  const { locked } = useVoice(roomCode, true, hint, muted);
  const typed = useTypewriter(hint?.text ?? standby);

  const state = locked && !muted ? 'tap to enable sound' : muted ? 'muted · tap to unmute' : 'tap to mute';
  return (
    <button
      className={muted ? 'mc-bar muted' : locked ? 'mc-bar locked' : 'mc-bar'}
      onClick={() => {
        if (locked && !muted) unlockAudio();
        else {
          unlockAudio();
          toggle();
        }
      }}
      title={state}
    >
      <span className="mc-label">Mission Control</span>
      <span className="mc-text">
        {typed}
        <span className="caret" aria-hidden />
      </span>
      <span className="mc-state">{state}</span>
    </button>
  );
}
