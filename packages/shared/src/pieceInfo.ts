// What a piece does on *this* planet — palette tooltips (Plan.md: "per-piece stats on this planet").

import {
  BATTERY_COVERS, DRILL_WATER_UNITS, O2_NEED, O2_TANK_UNITS, O2_UNIT_O2, O2_UNIT_WATER_USE, PIECES, REACTOR_OUTPUT,
  WATER_NEED, WATER_TANK_UNITS, type PieceKind,
} from './pieces';
import type { RoundRules } from './rules';

const fmt = (n: number) => (n >= 10 || Number.isInteger(n) ? String(Math.round(n * 10) / 10) : n.toFixed(2));
/** "half" / "all" of the mission's supply — easier to reason with than unit counts. */
const share = (units: number, need: number) => (units >= need ? 'all' : units * 2 === need ? 'half' : `${units}/${need}`);

/** What one piece does here, in the terms the requirement card uses (power, a night, the mission's supply). */
export function pieceEffect(kind: PieceKind, r: RoundRules): string {
  switch (kind) {
    case 'solar':
      return `+${fmt(r.solarPerArray)} power by day · charges batteries · sunlit tiles`;
    case 'battery': {
      if (r.nightBand === 0) return 'No night here — nothing to store for';
      const carries = BATTERY_COVERS / r.nightBand;
      return `Carries ${fmt(carries)} power through ${r.nightBand === 1 ? 'a night' : 'one of these long nights'} · needs solar to charge`;
    }
    case 'reactor':
      return `+${REACTOR_OUTPUT} power, day and night · no sun needed`;
    case 'water_tank':
      return `Ships ${share(WATER_TANK_UNITS, WATER_NEED)} the mission’s water`;
    case 'o2_tank':
      return `Ships ${share(O2_TANK_UNITS, O2_NEED)} the mission’s O₂`;
    case 'ice_drill':
      return r.iceAvailable
        ? `Mines ${share(DRILL_WATER_UNITS, WATER_NEED)} the mission’s water · −${PIECES.ice_drill.draw} power · ice tiles`
        : 'No ice on this planet';
    case 'o2_unit':
      return r.co2Atmosphere
        ? `Makes ${share(O2_UNIT_O2, O2_NEED)} the mission’s O₂ from the CO₂ air · −${PIECES.o2_unit.draw} power`
        : `Makes ${share(O2_UNIT_O2, O2_NEED)} the mission’s O₂ by splitting ${share(O2_UNIT_WATER_USE, WATER_NEED)} the water · −${PIECES.o2_unit.draw} power`;
    case 'berm':
      return r.twist === 'radiation' ? 'Shields one habitat wall tile from radiation' : 'Not needed on this mission';
    case 'thermal_unit':
      return r.twist === 'thermal' ? `Heats or cools the habitat · −${PIECES.thermal_unit.draw} power · on a habitat wall` : 'Not needed on this mission';
  }
}
