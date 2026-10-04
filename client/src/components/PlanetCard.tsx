import { FACT_ORDER, paramLabel, paramValue } from '../format';
import type { PlanetParameter, Round } from '../module_bindings/types';

/** Full facts + sources, behind a toggle on the build screen (kept off the main screens to limit reading). */
export default function PlanetCard({ round, params }: { round: Round; params: readonly PlanetParameter[] }) {
  const facts = FACT_ORDER.map(f => params.find(p => p.field === f)).filter((p): p is PlanetParameter => !!p);
  const sources = [...new Set(params.filter(p => p.sourceLabel).map(p => p.sourceLabel))];
  return (
    <div className="facts-card">
      <p className="muted small">{round.scaleText}</p>
      <dl className="facts">
        {facts.map(p => (
          <div key={p.field} className={p.status === 'estimated' ? 'estimated' : ''}>
            <dt>{paramLabel(p.field)}</dt>
            <dd>{paramValue(p)}</dd>
          </div>
        ))}
      </dl>
      {sources.length > 0 && <p className="muted small">Sources: {sources.join(' · ')}</p>}
    </div>
  );
}
