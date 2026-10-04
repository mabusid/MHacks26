import type { PieceKind, RoundRules } from '@overburden/shared';

/** Palette order; also the 1–9 keyboard shortcuts. Icons live in components/PieceIcon. */
export const PALETTE: PieceKind[] = ['solar', 'battery', 'reactor', 'water_tank', 'o2_tank', 'ice_drill', 'o2_unit', 'berm', 'thermal_unit'];

/** Pieces that can matter on this planet. The rest are left out of the palette entirely (less to read). */
export function usablePieces(rules: RoundRules): PieceKind[] {
  return PALETTE.filter(
    k =>
      !(k === 'ice_drill' && !rules.iceAvailable) &&
      !(k === 'thermal_unit' && rules.twist !== 'thermal') &&
      !(k === 'berm' && rules.twist !== 'radiation') &&
      !(k === 'battery' && rules.nightBand === 0)
  );
}
