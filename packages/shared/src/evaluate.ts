// Deterministic evaluation (Plan.md → Evaluation & board read). Used at 0:00, by the board read, and by winnability.

import {
  BATTERY_COVERS, DRILL_WATER_UNITS, HABITAT_LOAD, O2_NEED, O2_TANK_UNITS, O2_UNIT_O2, O2_UNIT_WATER_USE,
  PIECES, REACTOR_OUTPUT, WATER_NEED, WATER_TANK_UNITS, type Counts,
} from './pieces';
import { stormBand, type PlanetProfile, type RoundRules } from './rules';

export type RequirementKind = 'power' | 'life_support' | 'twist';

export interface RequirementResult {
  kind: RequirementKind;
  pass: boolean;
  /** 0 = met, 1 = nothing in place. Used to pick the worst-failing requirement. */
  severity: number;
  reason: string;
  /** The same problem the way Mission Control says it: conversational, no parentheses or symbols. */
  spoken: string;
  /** Researched field most responsible for the shortfall (for hints and the debrief). */
  fact: keyof PlanetProfile | null;
}

export interface Evaluation {
  load: number;
  dayPower: number;
  /** Load the batteries must carry at night (the part the reactor doesn't cover). */
  nightLoad: number;
  batteriesNeeded: number;
  batteriesEffective: number;
  water: number;
  o2: number;
  requirements: Record<RequirementKind, RequirementResult>;
  allPass: boolean;
}

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));
/** Night lengths in words (debrief reasons). */
const NIGHT_WORDS = { 0: 'no night', 1: 'a short night', 2: 'a long night', 3: 'a very long night' } as const;

export function evaluate(c: Counts, r: RoundRules): Evaluation {
  const load =
    HABITAT_LOAD + c.ice_drill * PIECES.ice_drill.draw + c.o2_unit * PIECES.o2_unit.draw + c.thermal_unit * PIECES.thermal_unit.draw;
  const reactor = c.reactor * REACTOR_OUTPUT;
  const dayPower = reactor + c.solar * r.solarPerArray;
  // Whatever the reactor doesn't cover must come from batteries at night. One battery carries
  // BATTERY_COVERS power through a short night; a long night (band 2) uses twice the charge, very long ×3.
  const nightLoad = Math.max(0, load - reactor);
  const batteriesNeeded = Math.ceil((nightLoad * r.nightBand) / BATTERY_COVERS);
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
            : `Night storage short by ${nightShort} batter${nightShort === 1 ? 'y' : 'ies'}: ${fmt(nightLoad)} power through ${NIGHT_WORDS[r.nightBand]} needs ${batteriesNeeded}`
          : 'Power covered day and night',
    spoken:
      dayShort > 0
        ? dayPower === 0
          ? 'Right now nothing is powering the habitat.'
          : 'Even in daylight you’re not making enough power.'
        : nightShort > 0
          ? c.battery > 0 && c.solar === 0
            ? 'Those batteries have nothing to charge them.'
            : 'When night falls, your batteries won’t last until sunrise.'
          : 'Power looks good, day and night.',
    fact: dayShort > 0 ? 'insolation' : nightShort > 0 ? 'nightHours' : null,
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
    spoken:
      waterShort >= o2Short && waterShort > 0
        ? 'The crew will run out of water before the mission ends.'
        : o2Short > 0
          ? 'The crew will run out of air before the mission ends.'
          : 'Water and air will last the whole mission.',
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
      spoken: short ? 'The habitat walls aren’t shielded enough yet.' : 'The habitat is shielded.',
      fact: short ? 'radiationDoseMSvPerDay' : null,
    };
  } else if (r.twist === 'thermal') {
    const short = Math.max(0, r.thermalLoad - c.thermal_unit);
    twist = {
      kind: 'twist',
      pass: short === 0,
      severity: r.thermalLoad ? short / r.thermalLoad : 0,
      reason: short ? `Thermal control short by ${short} unit${short === 1 ? '' : 's'} next to the habitat` : 'Habitat temperature controlled',
      spoken: short ? 'The habitat can’t hold a livable temperature yet.' : 'The habitat temperature is under control.',
      fact: short ? 'meanTempK' : null,
    };
  } else {
    const needed = Math.ceil((nightLoad * stormBand(r)) / BATTERY_COVERS);
    const short = Math.max(0, needed - batteriesEffective);
    twist = {
      kind: 'twist',
      pass: short === 0,
      severity: needed ? short / needed : 0,
      reason: short
        ? `Storm reserve short by ${short} batter${short === 1 ? 'y' : 'ies'}: dust can hide the sun for days`
        : nightLoad === 0
          ? 'Storm-proof: the reactor never needs the sun'
          : 'Storm reserve covered',
      spoken: short ? 'A dust storm could hide the sun for days, and your reserve won’t last.' : 'You can ride out a dust storm.',
      fact: short ? 'dustStorms' : null,
    };
  }

  return {
    load,
    dayPower,
    nightLoad,
    batteriesNeeded,
    batteriesEffective,
    water,
    o2,
    requirements: { power, life_support: life, twist },
    allPass: power.pass && life.pass && twist.pass,
  };
}
