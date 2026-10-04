import { useReducer } from 'spacetimedb/react';
import RequirementList from '../components/RequirementList';
import { reducers } from '../module_bindings';
import type { RoomData } from '../useRoom';
import { useReducerCall } from '../useReducerCall';
import { useSecondsLeft } from '../useSecondsLeft';

/**
 * Short automatic transition into the build; the server starts the build when the countdown ends.
 * Only what the crew needs before the clock starts: where, the one fact, the goal, the 3 conditions.
 */
export default function Briefing({ data }: { data: RoomData }) {
  const { current, requirements, isHost } = data;
  const skip = useReducerCall(useReducer(reducers.beginBuild));
  const left = useSecondsLeft(current?.briefingEndsAt?.microsSinceUnixEpoch);
  if (!current) return null;

  return (
    <div className="card briefing">
      <header className="brief-head">
        <h1 className="planet-name">{current.planetName}</h1>
        <p className="headline">{current.headline}</p>
      </header>

      <section className="brief-goal">
        <p className="muted">
          Meet all 3 · under <strong className="mono-accent">{current.massBudget} CU</strong>
        </p>
        <RequirementList requirements={requirements} plain />
      </section>

      <footer className="brief-foot">
        <p className="countdown">
          Build starts in <strong>{left ?? '…'}</strong>
        </p>
        {isHost && (
          <button className="secondary small-btn" disabled={skip.pending} onClick={() => skip.run()}>
            Skip
          </button>
        )}
      </footer>
      {skip.error && <p className="error">{skip.error}</p>}
    </div>
  );
}
