// Piece catalog and fixed mission constants (Plan.md → Piece library, Goals).
// Tuned with the solver over all real planets so the planet data — not one universal build — decides what wins
// (docs/Plan.md → Balance).

export const PIECE_KINDS = ['solar', 'battery', 'reactor', 'water_tank', 'o2_tank', 'ice_drill', 'o2_unit', 'berm', 'thermal_unit'] as const;
export type PieceKind = (typeof PIECE_KINDS)[number];
export type Counts = Record<PieceKind, number>;

export interface PieceDef {
  label: string;
  /** Cargo units (CU). */
  mass: number;
  /** Power draw added to the load (consumers only). */
  draw: number;
  placement: 'lit' | 'ice' | 'habitat_adjacent' | 'any';
}

export const PIECES: Record<PieceKind, PieceDef> = {
  solar: { label: 'Solar array', mass: 1, draw: 0, placement: 'lit' },
  battery: { label: 'Battery', mass: 2, draw: 0, placement: 'any' },
  reactor: { label: 'Reactor', mass: 18, draw: 0, placement: 'any' },
  water_tank: { label: 'Water tank', mass: 4, draw: 0, placement: 'any' },
  o2_tank: { label: 'O₂ tank', mass: 4, draw: 0, placement: 'any' },
  ice_drill: { label: 'Ice drill', mass: 2, draw: 2, placement: 'ice' },
  o2_unit: { label: 'O₂ unit', mass: 1, draw: 1, placement: 'any' },
  berm: { label: 'Berm', mass: 1, draw: 0, placement: 'habitat_adjacent' },
  thermal_unit: { label: 'Thermal unit', mass: 1, draw: 1, placement: 'habitat_adjacent' },
};

export const CREW = 4;
export const MISSION_SOLS = 30;
/** Habitat life-support draw for 4 crew. */
export const HABITAT_LOAD = 4;
export const SOLAR_OUTPUT = 3;
export const SOLAR_INSOLATION_CAP = 2;
export const REACTOR_OUTPUT = 6;
export const BATTERY_COVERS = 3;
export const WATER_NEED = 12;
export const O2_NEED = 12;
export const WATER_TANK_UNITS = 6;
export const O2_TANK_UNITS = 6;
export const DRILL_WATER_UNITS = 12;
export const O2_UNIT_O2 = 12;
/** Water an O₂ unit electrolyzes when there's no CO₂ atmosphere. */
export const O2_UNIT_WATER_USE = 6;
export const BUDGET_MIN = 14;
export const BUDGET_MAX = 40;
export const BUDGET_SLACK = 1.1;
/** Debrief copy (NASA BVAD): 1 water unit ≈ 30 kg, 1 O₂ unit ≈ 8.4 kg. */
export const KG_PER_WATER_UNIT = 30;
export const KG_PER_O2_UNIT = 8.4;

export function emptyCounts(): Counts {
  return { solar: 0, battery: 0, reactor: 0, water_tank: 0, o2_tank: 0, ice_drill: 0, o2_unit: 0, berm: 0, thermal_unit: 0 };
}

export function massOf(counts: Counts): number {
  return PIECE_KINDS.reduce((sum, k) => sum + counts[k] * PIECES[k].mass, 0);
}


/** Build phase length (Plan.md → Round structure). */
export const BUILD_SECONDS = 120;
/** Automatic briefing transition before the build (host can skip). */
export const BRIEFING_SECONDS = 12;
