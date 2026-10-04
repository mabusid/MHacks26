import { useState } from 'react';
import type { PlanetParameter, Requirement } from '../module_bindings/types';

const ICON: Record<string, string> = { power: '⚡', life_support: '💧', twist: '⚠' };

/**
 * The 3 requirements as one line each; tap a line for the threshold and the researched reason
 * (works on touch — no hover). Never shows pass/fail (Plan.md).
 */
export default function RequirementList({
  requirements,
  params = [],
  plain = false,
}: {
  requirements: readonly Requirement[];
  params?: readonly PlanetParameter[];
  /** Read-only rows (briefing): no tap-to-expand. */
  plain?: boolean;
}) {
  const [open, setOpen] = useState<string>();
  if (plain) {
    return (
      <ul className="req-list plain">
        {requirements.map(r => (
          <li key={String(r.id)}>
            <span className="req-icon" aria-hidden>
              {ICON[r.kind]}
            </span>
            <span className="req-summary">{r.summary}</span>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <ul className="req-list">
      {requirements.map(r => {
        const expanded = open === r.kind;
        const src = params.find(p => p.field === r.becauseField);
        return (
          <li key={String(r.id)}>
            <button className="req-row" aria-expanded={expanded} onClick={() => setOpen(expanded ? undefined : r.kind)}>
              <span className="req-icon" aria-hidden>
                {ICON[r.kind]}
              </span>
              <span className="req-summary">{r.summary}</span>
              <span className="req-caret" aria-hidden>
                {expanded ? '▾' : '▸'}
              </span>
            </button>
            {expanded && (
              <div className="req-detail">
                <p>{r.threshold}</p>
                <p className="because">
                  {r.because}
                  {src && <span className={src.status === 'estimated' ? 'tag estimated' : 'tag'}>{src.status === 'estimated' ? 'estimated' : src.sourceLabel}</span>}
                </p>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
