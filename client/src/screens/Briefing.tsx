import { useReducer } from 'spacetimedb/react';
import RequirementList from '../components/RequirementList';
import { factChips } from '../format';
import { reducers } from '../module_bindings';
import type { RoomData } from '../useRoom';
import { useReducerCall } from '../useReducerCall';
import { useSecondsLeft } from '../useSecondsLeft';

/**
 * Short automatic transition into the build; the server starts the build when the countdown ends.
 * One left-aligned column, read top to bottom: where → the fact → the numbers → the goal → the 3 conditions.
 */
export default function Briefing({ data }: { data: RoomData }) {
  const { current, requirements, params, isHost } = data;
  const skip = useReducerCall(useReducer(reducers.beginBuild));
  const left = useSecondsLeft(current?.briefingEndsAt?.microsSinceUnixEpoch);
  if (!current) return null;

  return (
    <div className="card briefing">
      <header className="brief-head">
        <p className="label">Mission briefing</p>
        <h1 className="planet-name">{current.planetName}</h1>
        <p className="headline">{current.headline}</p>
      </header>

      <ul className="chips" aria-label="Key facts">
        {factChips(params).map(c => (
          <li key={c.label} className="chip" title={`${c.text} ${c.label}`}>
            <span aria-hidden>{c.icon}</span>
            <strong>{c.text}</strong>
            <span className="chip-label">{c.label}</span>
          </li>
        ))}
      </ul>

      <section className="brief-goal">
        <p className="label">Your goal</p>
        <p>
          Meet all 3 before time runs out, under <strong className="mono-accent">{current.massBudget} CU</strong> of cargo.
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
