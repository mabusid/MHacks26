import { useState } from 'react';
import { useReducer } from 'spacetimedb/react';
import RequirementList from '../components/RequirementList';
import { factChips } from '../format';
import { reducers } from '../module_bindings';
import type { RoomData } from '../useRoom';
import { useReducerCall } from '../useReducerCall';
import { useSecondsLeft } from '../useSecondsLeft';

/** Seconds left in the countdown when the card turns from the planet to the mission. */
const MISSION_AT = 7;

/**
 * Two beats while the camera lands: the planet you're on (one line + three numbers), then the mission
 * (three conditions + the budget). The server starts the build when the countdown ends.
 */
export default function Briefing({ data }: { data: RoomData }) {
  const { current, requirements, params, isHost } = data;
  const skip = useReducerCall(useReducer(reducers.beginBuild));
  const left = useSecondsLeft(current?.briefingEndsAt?.microsSinceUnixEpoch);
  const [ahead, setAhead] = useState(false);
  if (!current) return null;
  const mission = ahead || (left !== undefined && left <= MISSION_AT);

  return (
    <div className="card briefing" key={mission ? 'mission' : 'planet'}>
      {!mission ? (
        <>
          <p className="label">Landing on</p>
          <h1 className="planet-name">{current.planetName}</h1>
          <p className="headline">{current.headline}</p>
          <ul className="stat-tiles" aria-label="Key facts">
            {factChips(params).map(c => (
              <li key={c.label}>
                <span className="stat-icon" aria-hidden>
                  {c.icon}
                </span>
                <strong>{c.text}</strong>
                <span className="stat-label">{c.label}</span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <>
          <p className="label">Your mission</p>
          <RequirementList requirements={requirements} plain />
          <p className="budget-line">
            Stay under <strong className="mono-accent">{current.massBudget} CU</strong>
          </p>
        </>
      )}

      <footer className="brief-foot">
        <p className="countdown">
          Build in <strong>{left ?? '…'}</strong>
        </p>
        {!mission ? (
          <button className="secondary small-btn" onClick={() => setAhead(true)}>
            Mission ›
          </button>
        ) : (
          isHost && (
            <button className="secondary small-btn" disabled={skip.pending} onClick={() => skip.run()}>
              Start now
            </button>
          )
        )}
      </footer>
      {skip.error && <p className="error">{skip.error}</p>}
    </div>
  );
}
