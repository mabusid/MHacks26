import { FACT_ORDER, paramLabel, paramValue } from '../format';
import type { PlanetParameter, Round } from '../module_bindings/types';

export default function PlanetCard({ round, params }: { round: Round; params: readonly PlanetParameter[] }) {
  const facts = FACT_ORDER.map(f => params.find(p => p.field === f)).filter((p): p is PlanetParameter => !!p);
  const unknown = params.filter(p => p.status === 'estimated');
  return (
    <section className="panel planet-card">
      <p className="label">Destination</p>
      <h1>{round.planetName}</h1>
      <p className="headline">{round.headline}</p>
      <p className="muted">{round.scaleText}</p>
      <dl className="facts">
        {facts.map(p => (
          <div key={p.field} className={p.status === 'estimated' ? 'estimated' : ''}>
            <dt>{paramLabel(p.field)}</dt>
            <dd>
              {paramValue(p)}
              {p.status === 'estimated' && <span className="tag estimated">estimated</span>}
            </dd>
          </div>
        ))}
      </dl>
      {unknown.length > 0 && (
        <p className="muted small">
          What we don’t know yet: {unknown.map(p => `${paramLabel(p.field).toLowerCase()} (${p.note.toLowerCase()})`).join('; ')}.
        </p>
      )}
      <p className="muted small">Sources: {[...new Set(params.filter(p => p.sourceLabel).map(p => p.sourceLabel))].join(' · ') || '—'}</p>
    </section>
  );
}
