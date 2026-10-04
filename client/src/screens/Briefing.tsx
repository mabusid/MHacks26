import { BUILD_SECONDS } from '@overburden/shared';
import { useReducer } from 'spacetimedb/react';
import MissionCard from '../components/MissionCard';
import PlanetCard from '../components/PlanetCard';
import { reducers } from '../module_bindings';
import type { RoomData } from '../useRoom';
import { useReducerCall } from '../useReducerCall';
import { clock } from '../useSecondsLeft';

export default function Briefing({ data }: { data: RoomData }) {
  const { current, requirements, params, isHost } = data;
  const begin = useReducerCall(useReducer(reducers.beginBuild));
  if (!current) return null;

  return (
    <div className="briefing">
      <PlanetCard round={current} params={params} />
      <section className="panel">
        <p className="label">Mission requirements</p>
        <MissionCard requirements={requirements} params={params} />
        <p className="muted small">
          Mass budget <strong>{current.massBudget} CU</strong> · Build time <strong>{clock(BUILD_SECONDS)}</strong> · Mission Control
          will chime in with facts, then hints.
        </p>
        {isHost ? (
          <button className="primary" disabled={begin.pending} onClick={() => begin.run()}>
            Begin build
          </button>
        ) : (
          <p className="muted">Waiting for the host to begin the build…</p>
        )}
        {begin.error && <p className="error">{begin.error}</p>}
      </section>
    </div>
  );
}
