// What a piece does on *this* planet — palette tooltips (Plan.md: "per-piece stats on this planet").

import {
  BATTERY_COVERS, DRILL_WATER_UNITS, O2_TANK_UNITS, O2_UNIT_O2, O2_UNIT_WATER_USE, PIECES, REACTOR_OUTPUT,
  WATER_TANK_UNITS, type PieceKind,
} from './pieces';
import type { RoundRules } from './rules';

const fmt = (n: number) => (n >= 10 || Number.isInteger(n) ? String(Math.round(n * 10) / 10) : n.toFixed(2));

export function pieceEffect(kind: PieceKind, r: RoundRules): string {
  switch (kind) {
    case 'solar':
      return `+${fmt(r.solarPerArray)} power by day · sunlit tiles`;
    case 'battery':
      return `Stores ${BATTERY_COVERS} power for the night (×${r.nightBand} nights here)`;
    case 'reactor':
      return `+${REACTOR_OUTPUT} power, day and night`;
    case 'water_tank':
      return `+${WATER_TANK_UNITS} water`;
    case 'o2_tank':
      return `+${O2_TANK_UNITS} O₂`;
    case 'ice_drill':
      return r.iceAvailable ? `+${DRILL_WATER_UNITS} water · −${PIECES.ice_drill.draw} power · ice tiles` : 'No ice on this planet';
    case 'o2_unit':
      return r.co2Atmosphere
        ? `+${O2_UNIT_O2} O₂ from the CO₂ air · −${PIECES.o2_unit.draw} power`
        : `+${O2_UNIT_O2} O₂ · uses ${O2_UNIT_WATER_USE} water · −${PIECES.o2_unit.draw} power`;
    case 'berm':
      return 'Radiation shielding · next to the habitat';
  }
}
