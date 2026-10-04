import type { PlanetParameter, Requirement } from '../module_bindings/types';

const ICON: Record<string, string> = { power: '⚡', life_support: '💧', twist: '⚠' };

/** Mission Requirements Card: threshold + because-line + source. Never shows pass/fail (Plan.md). */
export default function MissionCard({ requirements, params }: { requirements: readonly Requirement[]; params: readonly PlanetParameter[] }) {
  return (
    <ol className="mission-card">
      {requirements.map(r => {
        const p = params.find(x => x.field === r.becauseField);
        return (
          <li key={String(r.id)}>
            <span className="req-icon" aria-hidden>
              {ICON[r.kind]}
            </span>
            <div>
              <strong>{r.title}</strong>
              <p>{r.threshold}</p>
              <p className="because">
                {r.because}
                {p && (
                  <span className={p.status === 'estimated' ? 'tag estimated' : 'tag'}>
                    {p.status === 'estimated' ? 'estimated' : p.sourceUrl ? <a href={p.sourceUrl} target="_blank" rel="noreferrer">{p.sourceLabel}</a> : p.sourceLabel}
                  </span>
                )}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
