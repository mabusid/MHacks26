// Deterministic evaluation (Plan.md → Evaluation & board read). Used at 0:00, by the board read, and by winnability.

import {
  BATTERY_COVERS, DRILL_WATER_UNITS, HABITAT_LOAD, O2_NEED, O2_TANK_UNITS, O2_UNIT_O2, O2_UNIT_WATER_USE,
  PIECES, REACTOR_OUTPUT, WATER_NEED, WATER_TANK_UNITS, type Counts,
} from './pieces';
import type { PlanetProfile, RoundRules } from './rules';

export type RequirementKind = 'power' | 'life_support' | 'twist';

export interface RequirementResult {
  kind: RequirementKind;
  pass: boolean;
  /** 0 = met, 1 = nothing in place. Used to pick the worst-failing requirement. */
  severity: number;
  reason: string;
  /** Researched field most responsible for the shortfall (for hints and the debrief). */
  fact: keyof PlanetProfile | null;
}

export interface Evaluation {
  load: number;
  dayPower: number;
  batteriesNeeded: number;
  batteriesEffective: number;
  water: number;
  o2: number;
  requirements: Record<RequirementKind, RequirementResult>;
  allPass: boolean;
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

export function evaluate(c: Counts, r: RoundRules): Evaluation {
  const load = HABITAT_LOAD + c.ice_drill * PIECES.ice_drill.draw + c.o2_unit * PIECES.o2_unit.draw + r.thermalLoad;
  const reactor = c.reactor * REACTOR_OUTPUT;
  const dayPower = reactor + c.solar * r.solarPerArray;
  const batteriesNeeded = Math.ceil(Math.max(0, load - reactor) / BATTERY_COVERS) * r.nightBand;
  // Batteries only help if something can charge them.
  const batteriesEffective = c.solar > 0 ? c.battery : 0;

  const dayShort = Math.max(0, load - dayPower);
  const nightShort = Math.max(0, batteriesNeeded - batteriesEffective);
  const power: RequirementResult = {
    kind: 'power',
    pass: dayShort === 0 && nightShort === 0,
    severity: Math.max(dayShort / load, batteriesNeeded ? nightShort / batteriesNeeded : 0),
    reason:
      dayShort > 0
        ? `Daytime power short by ${fmt(dayShort)} (making ${fmt(dayPower)}, need ${fmt(load)})`
        : nightShort > 0
          ? c.battery > 0 && c.solar === 0
            ? 'Batteries have nothing to charge them'
            : `Night storage short by ${nightShort} batter${nightShort === 1 ? 'y' : 'ies'} (night band ${r.nightBand})`
          : 'Power covered day and night',
    fact: dayShort > 0 ? (r.thermalLoad ? 'meanTempK' : 'insolation') : nightShort > 0 ? 'nightHours' : null,
  };

  const water =
    c.water_tank * WATER_TANK_UNITS + c.ice_drill * DRILL_WATER_UNITS - (r.co2Atmosphere ? 0 : c.o2_unit * O2_UNIT_WATER_USE);
  const o2 = c.o2_tank * O2_TANK_UNITS + c.o2_unit * O2_UNIT_O2;
  const waterShort = Math.max(0, WATER_NEED - water);
  const o2Short = Math.max(0, O2_NEED - o2);
  const life: RequirementResult = {
    kind: 'life_support',
    pass: waterShort === 0 && o2Short === 0,
    severity: Math.max(Math.min(1, waterShort / WATER_NEED), o2Short / O2_NEED),
    reason:
      waterShort >= o2Short && waterShort > 0
        ? `Water short by ${waterShort} units`
        : o2Short > 0
          ? `Oxygen short by ${o2Short} units`
          : 'Water and oxygen last the mission',
    fact: waterShort >= o2Short && waterShort > 0 ? 'waterIce' : o2Short > 0 ? 'surfacePressureBar' : null,
  };

  let twist: RequirementResult;
  if (r.twist === 'radiation') {
    const short = Math.max(0, r.bermsRequired - c.berm);
    twist = {
      kind: 'twist',
      pass: short === 0,
      severity: short / r.bermsRequired,
      reason: short ? `Shielding short by ${short} berm${short === 1 ? '' : 's'} next to the habitat` : 'Habitat shielded',
      fact: short ? 'radiationDoseMSvPerDay' : null,
    };
  } else {
    // Thermal and dust raise the power bar; the twist is met when power is.
    const label = r.twist === 'thermal' ? 'Heating' : 'Dust-storm power';
    twist = {
      kind: 'twist',
      pass: power.pass,
      severity: power.severity,
      reason: power.pass ? `${label} covered` : `${label}: ${power.reason.charAt(0).toLowerCase()}${power.reason.slice(1)}`,
      fact: power.pass ? null : r.twist === 'thermal' ? 'meanTempK' : 'dustStorms',
    };
  }

  return {
    load,
    dayPower,
    batteriesNeeded,
    batteriesEffective,
    water,
    o2,
    requirements: { power, life_support: life, twist },
    allPass: power.pass && life.pass && twist.pass,
  };
}
