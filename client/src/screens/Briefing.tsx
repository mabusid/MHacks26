import { useReducer } from 'spacetimedb/react';
import RequirementList from '../components/RequirementList';
import { keyFacts } from '../format';
import { reducers } from '../module_bindings';
import type { RoomData } from '../useRoom';
import { useReducerCall } from '../useReducerCall';
import { useSecondsLeft } from '../useSecondsLeft';

/** Short automatic transition into the build; the server starts the build when the countdown ends. */
export default function Briefing({ data }: { data: RoomData }) {
  const { current, requirements, params, isHost } = data;
  const skip = useReducerCall(useReducer(reducers.beginBuild));
  const left = useSecondsLeft(current?.briefingEndsAt?.microsSinceUnixEpoch);
  if (!current) return null;

  return (
    <div className="card briefing">
      <p className="label">Mission briefing</p>
      <h1 className="planet-name">{current.planetName}</h1>
      <p className="muted">{keyFacts(params).slice(0, 2).join(' · ')}</p>
      <RequirementList requirements={requirements} />
      <p className="countdown">
        Build starts in <strong>{left ?? '…'}</strong>
      </p>
      {isHost && (
        <button className="secondary" disabled={skip.pending} onClick={() => skip.run()}>
          Skip
        </button>
      )}
      {skip.error && <p className="error">{skip.error}</p>}
    </div>
  );
}
