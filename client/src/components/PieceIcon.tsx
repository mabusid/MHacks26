import type { ReactElement } from 'react';
import type { PieceKind } from '@overburden/shared';

// One SVG per piece, shared by the palette and the board so they always match (design.md → Board).
// Simple silhouettes that stay readable at ~24 px on a tilted board.

const ICONS: Record<PieceKind, ReactElement> = {
  solar: (
    <>
      <rect x="3" y="5" width="18" height="12" rx="1.5" fill="#1d4ed8" stroke="#93c5fd" strokeWidth="1.2" />
      <path d="M9 5v12M15 5v12M3 11h18" stroke="#93c5fd" strokeWidth="0.9" />
      <path d="M12 17v3M8 21h8" stroke="#cbd5e1" strokeWidth="1.4" strokeLinecap="round" />
    </>
  ),
  battery: (
    <>
      <rect x="5" y="5" width="14" height="16" rx="2.5" fill="#334155" stroke="#94a3b8" strokeWidth="1.2" />
      <rect x="9" y="3" width="6" height="2.5" rx="0.8" fill="#94a3b8" />
      <path d="M13 8l-3.5 5h3l-1 5 4-6h-3l1-4z" fill="#facc15" />
    </>
  ),
  reactor: (
    <>
      <path d="M12 2.5l8.2 4.75v9.5L12 21.5l-8.2-4.75v-9.5z" fill="#a16207" stroke="#fde68a" strokeWidth="1.2" />
      <circle cx="12" cy="12" r="2" fill="#1c1917" />
      <path d="M12 9.2a2.8 2.8 0 0 1 2.4 1.4l2.3-1.3A5.4 5.4 0 0 0 12 6.6zM9.6 10.6a2.8 2.8 0 0 0 0 2.8l-2.3 1.3a5.4 5.4 0 0 1 0-5.4zM14.4 13.4a2.8 2.8 0 0 1-2.4 1.4v2.6a5.4 5.4 0 0 0 4.7-2.7z" fill="#1c1917" />
    </>
  ),
  water_tank: (
    <>
      <ellipse cx="12" cy="6" rx="7" ry="2.5" fill="#bae6fd" />
      <path d="M5 6v11c0 1.4 3.1 2.5 7 2.5s7-1.1 7-2.5V6" fill="#0ea5e9" stroke="#bae6fd" strokeWidth="1.1" />
      <path d="M12 9.5c1.6 2 2.4 3.3 2.4 4.3a2.4 2.4 0 0 1-4.8 0c0-1 .8-2.3 2.4-4.3z" fill="#e0f2fe" />
    </>
  ),
  o2_tank: (
    <>
      <rect x="7" y="4" width="10" height="17" rx="5" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="1.1" />
      <rect x="10" y="2" width="4" height="3" rx="1" fill="#64748b" />
      <text x="12" y="15.5" textAnchor="middle" fontSize="6" fontWeight="800" fill="#0f172a" fontFamily="system-ui, sans-serif">
        O₂
      </text>
    </>
  ),
  ice_drill: (
    <>
      <path d="M4 20l4-8h8l4 8z" fill="#7dd3fc" opacity="0.55" />
      <rect x="9" y="3" width="6" height="6" rx="1" fill="#64748b" stroke="#cbd5e1" strokeWidth="1" />
      <path d="M12 9v9" stroke="#cbd5e1" strokeWidth="2.4" />
      <path d="M10 12h4M10 15h4" stroke="#475569" strokeWidth="1.2" />
      <path d="M12 18l-1.5 3h3z" fill="#cbd5e1" />
    </>
  ),
  o2_unit: (
    <>
      <rect x="4" y="8" width="16" height="12" rx="2" fill="#0f766e" stroke="#5eead4" strokeWidth="1.1" />
      <circle cx="9" cy="5.5" r="1.8" fill="none" stroke="#99f6e4" strokeWidth="1.1" />
      <circle cx="14.5" cy="4" r="1.3" fill="none" stroke="#99f6e4" strokeWidth="1.1" />
      <path d="M7 14h10M7 17h6" stroke="#99f6e4" strokeWidth="1.2" strokeLinecap="round" />
    </>
  ),
  berm: (
    <>
      <path d="M2 19c3-8 6-11 10-11s7 3 10 11z" fill="#a16207" stroke="#d6a35c" strokeWidth="1.1" />
      <path d="M6 16c2-3 4-4.5 6-4.5" stroke="#d6a35c" strokeWidth="1" fill="none" opacity="0.8" />
    </>
  ),
  thermal_unit: (
    <>
      <rect x="3" y="6" width="12" height="14" rx="1.5" fill="#475569" stroke="#cbd5e1" strokeWidth="1.1" />
      <path d="M6 8.5v9M9 8.5v9M12 8.5v9" stroke="#cbd5e1" strokeWidth="1.2" strokeLinecap="round" />
      <rect x="17" y="3" width="4" height="13" rx="2" fill="#e2e8f0" stroke="#94a3b8" strokeWidth="0.9" />
      <circle cx="19" cy="18" r="3" fill="#f97316" stroke="#fed7aa" strokeWidth="0.9" />
      <path d="M19 9v8" stroke="#f97316" strokeWidth="1.6" strokeLinecap="round" />
    </>
  ),
};

export default function PieceIcon({ kind, size = 24 }: { kind: PieceKind; size?: number }) {
  return (
    <svg className="piece-svg" width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      {ICONS[kind]}
    </svg>
  );
}
