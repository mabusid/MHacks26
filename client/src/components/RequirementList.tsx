import type { Requirement } from '../module_bindings/types';

const ICON: Record<string, string> = { power: '⚡', life_support: '💧', twist: '⚠' };

/** The 3 requirements as one line each. Never shows pass/fail (Plan.md). */
export default function RequirementList({ requirements }: { requirements: readonly Requirement[] }) {
  return (
    <ul className="req-list">
      {requirements.map(r => (
        <li key={String(r.id)} title={`${r.threshold}\n${r.because}`}>
          <span className="req-icon" aria-hidden>
            {ICON[r.kind]}
          </span>
          {r.summary}
        </li>
      ))}
    </ul>
  );
}
