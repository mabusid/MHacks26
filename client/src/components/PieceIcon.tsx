import type { ReactNode } from 'react';
import type { PieceKind } from '@mission-control/shared';

/**
 * Isometric 3D piece models — same art in the palette and on the board (design.md → Board).
 * Top / left / right faces so they read as objects sitting on the pad, not flat glyphs.
 */
const ICONS: Record<PieceKind, { viewBox: string; body: ReactNode }> = {
  solar: {
    viewBox: '0 0 40 36',
    body: (
      <>
        <polygon points="8,26 20,32 32,26 20,20" fill="#5b6472" />
        <polygon points="8,26 20,32 20,34 8,28" fill="#3f4652" />
        <polygon points="20,32 32,26 32,28 20,34" fill="#2d333c" />
        <rect x="18.4" y="14" width="3.2" height="8" rx="0.6" fill="#94a3b8" />
        <polygon points="7,16 23,8 31,12 15,20" fill="#60a5fa" />
        <polygon points="7,16 15,20 15,24 7,20" fill="#1d4ed8" />
        <polygon points="15,20 31,12 31,16 15,24" fill="#1e3a8a" />
        <path d="M11 14.2l4 2M15 12.2l4 2M19 10.2l4 2M12.6 17.4l4 2M16.6 15.4l4 2" stroke="#93c5fd" strokeWidth="0.7" />
      </>
    ),
  },
  battery: {
    viewBox: '0 0 40 36',
    body: (
      <>
        <polygon points="12,10 28,10 28,12 20,16 12,12" fill="#94a3b8" />
        <polygon points="12,12 20,16 20,32 12,28" fill="#475569" />
        <polygon points="20,16 28,12 28,28 20,32" fill="#1e293b" />
        <polygon points="12,12 20,8 28,12 20,16" fill="#64748b" />
        <path d="M21 13l-3.2 5h2.6l-1.2 5 4-6h-2.6z" fill="#facc15" />
      </>
    ),
  },
  reactor: {
    viewBox: '0 0 40 36',
    body: (
      <>
        <polygon points="20,6 32,12 32,24 20,30 8,24 8,12" fill="#ca8a04" />
        <polygon points="8,12 20,18 20,30 8,24" fill="#a16207" />
        <polygon points="20,18 32,12 32,24 20,30" fill="#713f12" />
        <polygon points="8,12 20,6 32,12 20,18" fill="#fde68a" />
        <polygon points="16,14 24,14 26,18 24,22 16,22 14,18" fill="#1c1917" />
        <circle cx="20" cy="18" r="2.2" fill="#fbbf24" />
      </>
    ),
  },
  water_tank: {
    viewBox: '0 0 40 36',
    body: (
      <>
        <ellipse cx="20" cy="28" rx="11" ry="4.2" fill="#0369a1" />
        <path d="M9 12v16c0 2.4 4.9 4.2 11 4.2s11-1.8 11-4.2V12" fill="#0284c7" />
        <path d="M9 12v16c0 2.4 4.9 4.2 11 4.2V12z" fill="#0ea5e9" />
        <ellipse cx="20" cy="12" rx="11" ry="4.2" fill="#7dd3fc" />
        <path d="M20 16c1.6 2.2 2.4 3.6 2.4 4.6a2.4 2.4 0 1 1-4.8 0c0-1 .8-2.4 2.4-4.6z" fill="#e0f2fe" />
      </>
    ),
  },
  o2_tank: {
    viewBox: '0 0 40 36',
    body: (
      <>
        <ellipse cx="20" cy="30" rx="7" ry="2.8" fill="#475569" />
        <path d="M13 10v20c0 1.6 3.1 2.8 7 2.8s7-1.2 7-2.8V10" fill="#94a3b8" />
        <path d="M13 10v20c0 1.6 3.1 2.8 7 2.8V10z" fill="#cbd5e1" />
        <ellipse cx="20" cy="10" rx="7" ry="2.8" fill="#e2e8f0" />
        <rect x="17" y="5" width="6" height="4" rx="1" fill="#64748b" />
        <text x="20" y="22" textAnchor="middle" fontSize="6.5" fontWeight="800" fill="#0f172a" fontFamily="system-ui, sans-serif">
          O₂
        </text>
      </>
    ),
  },
  ice_drill: {
    viewBox: '0 0 40 36',
    body: (
      <>
        <polygon points="8,30 20,34 32,30 20,24" fill="#7dd3fc" opacity="0.7" />
        <polygon points="8,30 20,34 20,32 8,28" fill="#38bdf8" />
        <rect x="17.2" y="6" width="5.6" height="8" rx="1" fill="#94a3b8" />
        <polygon points="17.2,6 22.8,6 22.8,8 17.2,10" fill="#cbd5e1" />
        <rect x="18.6" y="13" width="2.8" height="12" fill="#e2e8f0" />
        <path d="M16 17h8M16 21h8" stroke="#475569" strokeWidth="1.1" />
        <polygon points="17,25 23,25 20,33" fill="#cbd5e1" />
      </>
    ),
  },
  o2_unit: {
    viewBox: '0 0 40 36',
    body: (
      <>
        <polygon points="8,18 20,24 32,18 20,12" fill="#14b8a6" />
        <polygon points="8,18 20,24 20,32 8,26" fill="#0f766e" />
        <polygon points="20,24 32,18 32,26 20,32" fill="#115e59" />
        <circle cx="14" cy="10" r="2.4" fill="none" stroke="#99f6e4" strokeWidth="1.2" />
        <circle cx="22" cy="8" r="1.8" fill="none" stroke="#99f6e4" strokeWidth="1.1" />
        <path d="M12 22h10M12 26h7" stroke="#99f6e4" strokeWidth="1.2" strokeLinecap="round" />
      </>
    ),
  },
  berm: {
    viewBox: '0 0 40 36',
    body: (
      <>
        <polygon points="6,28 20,34 34,28 20,14" fill="#d6a35c" />
        <polygon points="6,28 20,34 20,30 6,26" fill="#a16207" />
        <polygon points="20,34 34,28 34,26 20,30" fill="#854d0e" />
        <path d="M12 26c3-5 6-8 8-8" stroke="#fde68a" strokeWidth="1.1" fill="none" opacity="0.7" />
      </>
    ),
  },
  thermal_unit: {
    viewBox: '0 0 40 36',
    body: (
      <>
        <polygon points="6,16 18,22 18,30 6,24" fill="#64748b" />
        <polygon points="18,22 26,18 26,26 18,30" fill="#334155" />
        <polygon points="6,16 18,12 26,18 18,22" fill="#94a3b8" />
        <path d="M9 18v8M12.5 19.4v8M16 20.8v8" stroke="#cbd5e1" strokeWidth="1.1" strokeLinecap="round" />
        <ellipse cx="30" cy="26" rx="5" ry="3.2" fill="#c2410c" />
        <path d="M25 26c0-6 10-6 10 0" fill="#f97316" />
        <ellipse cx="30" cy="20" rx="5" ry="3.2" fill="#fdba74" />
        <path d="M30 10v8" stroke="#f97316" strokeWidth="1.8" strokeLinecap="round" />
      </>
    ),
  },
};

export default function PieceIcon({ kind, size = 24 }: { kind: PieceKind; size?: number }) {
  const art = ICONS[kind];
  return (
    <svg className="piece-svg" width={size} height={size} viewBox={art.viewBox} aria-hidden>
      <g transform="translate(20 20) scale(1.28) translate(-20 -18)">{art.body}</g>
    </svg>
  );
}
