// Mission Requirements Card thresholds, computed from the rules (never sent by the agent).

import type { RequirementKind } from './evaluate';
import { HABITAT_LOAD, KG_PER_O2_UNIT, KG_PER_WATER_UNIT, MISSION_SOLS, CREW, O2_NEED, WATER_NEED } from './pieces';
import type { PlanetProfile, RoundRules } from './rules';

export interface RequirementSpec {
  kind: RequirementKind;
  title: string;
  threshold: string;
  /** Profile fields this threshold was derived from; a because-line must reference one of them. */
  derivedFrom: (keyof PlanetProfile)[];
}

const NIGHT_WORDS = { 1: 'short nights', 2: 'long nights (×2 storage)', 3: 'very long nights (×3 storage)' } as const;

export function describeRequirements(r: RoundRules): RequirementSpec[] {
  const heating = r.thermalLoad ? ` + ${r.thermalLoad} heating` : '';
  const power: RequirementSpec = {
    kind: 'power',
    title: 'Power, day and night',
    threshold: `Cover the base load (${HABITAT_LOAD}${heating}) plus any machines; ${NIGHT_WORDS[r.nightBand]}`,
    derivedFrom: ['insolation', 'nightHours'],
  };
  const life: RequirementSpec = {
    kind: 'life_support',
    title: 'Life support',
    threshold:
      `${WATER_NEED} water + ${O2_NEED} O₂ units for ${CREW} crew × ${MISSION_SOLS} sols ` +
      `(~${WATER_NEED * KG_PER_WATER_UNIT} kg water, ~${Math.round(O2_NEED * KG_PER_O2_UNIT)} kg O₂). ` +
      `${r.iceAvailable ? 'Ice drills work here.' : 'No ice: water must be shipped.'} ` +
      `${r.co2Atmosphere ? 'O₂ units can use the CO₂ air.' : 'O₂ units split water.'}`,
    derivedFrom: ['waterIce', 'co2Atmosphere'],
  };
  const twist: RequirementSpec =
    r.twist === 'radiation'
      ? { kind: 'twist', title: 'Radiation shielding', threshold: `${r.bermsRequired} berms next to the habitat`, derivedFrom: ['radiationDoseMSvPerDay', 'surfacePressureBar'] }
      : r.twist === 'thermal'
        ? { kind: 'twist', title: 'Thermal control', threshold: `+${r.thermalLoad} power for heating or cooling`, derivedFrom: ['meanTempK'] }
        : { kind: 'twist', title: 'Dust storms', threshold: 'Solar output halved; night storage one band higher', derivedFrom: ['dustStorms'] };
  return [power, life, twist];
}
