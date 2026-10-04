import LeaveButton from '../LeaveButton';
import { useReducer } from 'spacetimedb/react';
import { reducers } from '../module_bindings';
import type { PlanetParameter, Requirement, Round } from '../module_bindings/types';
import { useReducerCall } from '../useReducerCall';

const ORDER = ['power', 'life_support', 'twist'];

interface Props {
  round: Round;
  requirements: Requirement[];
  params: PlanetParameter[];
  isHost: boolean;
}

// Phase 3 version: the data on screen. Phase 4 adds the full planet card and layout.
export default function Briefing({ round, requirements, params, isHost }: Props) {
  const begin = useReducerCall(useReducer(reducers.beginBuild));
  const source = (field: string) => params.find(p => p.field === field);
  const estimated = params.filter(p => p.status === 'estimated');

  return (
    <main className="screen">
      <p className="muted">Mission briefing</p>
      <h1>{round.planetName}</h1>
      <p>{round.headline}</p>
      <p className="muted">{round.scaleText}</p>

      <h2>Mission requirements</h2>
      <ul className="requirements">
        {[...requirements]
          .sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind))
          .map(r => {
            const p = source(r.becauseField);
            return (
              <li key={String(r.id)} className="panel">
                <strong>{r.title}</strong>
                <span>{r.threshold}</span>
                <span className="muted">
                  {r.because}
                  {p && <span className="tag">{p.status === 'estimated' ? 'estimated' : p.sourceLabel}</span>}
                </span>
              </li>
            );
          })}
      </ul>

      {estimated.length > 0 && (
        <p className="muted">
          Not yet measured: {estimated.map(p => p.field).join(', ')} — {estimated[0].note.toLowerCase()}.
        </p>
      )}
      <p className="muted">Mass budget: {round.massBudget} CU · Build time 2:30</p>

      {isHost ? (
        <button disabled={begin.pending} onClick={() => begin.run()}>
          Begin build
        </button>
      ) : (
        <p className="muted">Waiting for the host to begin…</p>
      )}
      {begin.error && <p className="error">{begin.error}</p>}
      <LeaveButton />
    </main>
  );
}
