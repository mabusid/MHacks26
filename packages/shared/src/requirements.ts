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

const NIGHT_WORDS = {
  0: 'no night here — the base always faces its star, so no storage',
  1: 'short nights',
  2: 'long nights (×2 storage)',
  3: 'very long nights (×3 storage)',
} as const;
const NIGHT_SHORT = { 0: '', 1: '', 2: '×2 night storage', 3: '×3 night storage' } as const;

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

export function describeRequirements(r: RoundRules): RequirementSpec[] {
  const power: RequirementSpec = {
    kind: 'power',
    title: r.nightBand === 0 ? 'Power, endless day' : 'Power, day and night',
    summary: r.nightBand === 0 ? 'Power (no night)' : r.nightBand > 1 ? `Power day + night (${NIGHT_SHORT[r.nightBand]})` : 'Power day + night',
    threshold: `Cover the base load (${HABITAT_LOAD}) plus any machines; ${NIGHT_WORDS[r.nightBand]}`,
    derivedFrom: ['insolation', 'nightHours'],
  };
  const life: RequirementSpec = {
    kind: 'life_support',
    title: 'Life support',
    summary: `${WATER_NEED} water + ${O2_NEED} O₂`,
    threshold:
      `${WATER_NEED} water + ${O2_NEED} O₂ units for ${CREW} crew × ${MISSION_SOLS} sols ` +
      `(~${WATER_NEED * KG_PER_WATER_UNIT} kg water, ~${Math.round(O2_NEED * KG_PER_O2_UNIT)} kg O₂). ` +
      `${r.iceAvailable ? 'Ice drills work here.' : 'No ice: water must be shipped.'} ` +
      `${r.co2Atmosphere ? 'O₂ units can use the CO₂ air.' : 'O₂ units split water.'}`,
    derivedFrom: ['waterIce', 'co2Atmosphere'],
  };
  const twist: RequirementSpec =
    r.twist === 'radiation'
      ? { kind: 'twist', title: 'Radiation shielding', summary: `${r.bermsRequired} berms by the habitat`, threshold: `${r.bermsRequired} berms next to the habitat`, derivedFrom: ['radiationDoseMSvPerDay', 'surfacePressureBar'] }
      : r.twist === 'thermal'
        ? {
            kind: 'twist',
            title: 'Thermal control',
            summary: `${plural(r.thermalLoad, 'thermal unit')} by the habitat`,
            threshold: `${plural(r.thermalLoad, 'thermal unit')} next to the habitat (each draws ${PIECES.thermal_unit.draw} power)`,
            derivedFrom: ['meanTempK'],
          }
        : {
            kind: 'twist',
            title: 'Dust storms',
            summary: `Storm reserve (×${stormBand(r)} storage)`,
            threshold: `Solar output halved by dust; batteries for ×${stormBand(r)} storage (one more night than power needs) to ride out a storm`,
            derivedFrom: ['dustStorms'],
          };
  return [power, life, twist];
}
