import type { PieceKind } from '@overburden/shared';

export const PIECE_ICON: Record<PieceKind, string> = {
  solar: '🔆',
  battery: '🔋',
  reactor: '☢️',
  water_tank: '💧',
  o2_tank: '🫧',
  ice_drill: '⛏️',
  o2_unit: '🌬️',
  berm: '⛰️',
};

/** Palette order; also the 1–8 keyboard shortcuts. */
export const PALETTE: PieceKind[] = ['solar', 'battery', 'reactor', 'water_tank', 'o2_tank', 'ice_drill', 'o2_unit', 'berm'];
