// Mission Requirements Card thresholds, computed from the rules (never sent by the agent).

import type { RequirementKind } from './evaluate';
import { HABITAT_LOAD, KG_PER_O2_UNIT, KG_PER_WATER_UNIT, MISSION_SOLS, CREW, O2_NEED, PIECES, WATER_NEED } from './pieces';
import { stormBand, type PlanetProfile, type RoundRules } from './rules';

export interface RequirementSpec {
  kind: RequirementKind;
  title: string;
  /** One line for the briefing and the build screen. */
  summary: string;
  threshold: string;
  /** Profile fields this threshold was derived from; a because-line must reference one of them. */
  derivedFrom: (keyof PlanetProfile)[];
}

const NIGHT_LINE = {
  0: 'Power under endless daylight',
  1: 'Power through short nights',
  2: 'Power through long nights',
  3: 'Power through very long nights',
} as const;

const round1 = (n: number) => Math.round(n * 10) / 10;

/** "Power through 15-day nights" — the planet's condition, not the answer (players work out the build). */
function powerLine(r: RoundRules, p?: PlanetProfile): string {
  if (!p || r.nightBand === 0) return NIGHT_LINE[r.nightBand];
  if (p.nightHours === null) return 'Power through nights nobody has measured';
  return p.nightHours > 48 ? `Power through ${Math.round(p.nightHours / 24)}-day nights` : `Power through ${Math.round(p.nightHours)}-hour nights`;
}

function celsius(k: number): string {
  return `${Math.round(k - 273.15)} °C`.replace('-', '−'); // typographic minus, as in the curated text
}

/**
 * The Mission Requirements Card states the planet's CONDITIONS — night length, crew needs, radiation,
 * temperature — never the piece counts. The pieces' stats on this planet (pieceInfo.ts) carry the numbers,
 * so working out the build from the facts is the puzzle. Exact shortfalls appear only in the debrief.
 */
export function describeRequirements(r: RoundRules, p?: PlanetProfile): RequirementSpec[] {
  const power: RequirementSpec = {
    kind: 'power',
    title: r.nightBand === 0 ? 'Power, endless day' : 'Power, day and night',
    summary: powerLine(r, p),
    threshold:
      `The habitat draws ${HABITAT_LOAD} power; every ice drill, O₂ unit, and thermal unit adds its own draw. ` +
      (r.nightBand === 0
        ? 'The sun never sets here, so whatever makes power by day keeps running.'
        : 'Solar only works by day. At night the load runs on a reactor, or on batteries that solar charged.'),
    derivedFrom: ['insolation', 'nightHours'],
  };
  const life: RequirementSpec = {
    kind: 'life_support',
    title: 'Life support',
    summary: `Water and air for ${CREW} crew, ${MISSION_SOLS} sols`,
    threshold:
      `About ${WATER_NEED * KG_PER_WATER_UNIT} kg of water and ${Math.round(O2_NEED * KG_PER_O2_UNIT)} kg of oxygen. ` +
      'Ship it in heavy tanks, or make it on site if the planet gives you the raw materials.',
    derivedFrom: ['waterIce', 'co2Atmosphere'],
  };
  const dose = p?.radiationDoseMSvPerDay;
  const twist: RequirementSpec =
    r.twist === 'radiation'
      ? {
          kind: 'twist',
          title: 'Radiation shielding',
          summary: dose != null ? `Shield from ${round1(dose)} mSv a day` : 'Shield from radiation, no air above',
          threshold:
            `Without a thick atmosphere, radiation reaches the surface. Berms of piled soil on the habitat’s walls block it; ` +
            `${r.bermsRequired >= 6 ? 'a dose this fierce means covering three-quarters' : 'plan on covering half'} of its 8 wall tiles.`,
          derivedFrom: ['radiationDoseMSvPerDay', 'surfacePressureBar'],
        }
      : r.twist === 'thermal'
        ? {
            kind: 'twist',
            title: 'Thermal control',
            summary: p ? `Keep the habitat livable at ${celsius(p.meanTempK)}` : 'Keep the habitat livable',
            threshold:
              `Thermal units on the habitat’s walls heat or cool it, drawing ${PIECES.thermal_unit.draw} power each. ` +
              'One handles −73 °C to −23 °C or 57 °C to 127 °C; anything more extreme needs two.',
            derivedFrom: ['meanTempK'],
          }
        : {
            kind: 'twist',
            title: 'Dust storms',
            summary: 'Ride out planet-wide dust storms',
            threshold:
              `Dust halves what solar arrays make, and a storm can hide the sun for days: batteries must last ${stormBand(r) === 2 ? 'two nights' : 'one more night than usual'}. A reactor doesn’t care.`,
            derivedFrom: ['dustStorms'],
          };
  return [power, life, twist];
}
