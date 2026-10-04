// Test fixtures matching the Plan.md balance table. Approximate values for tests and the Phase 3 fixture path —
// sourced, cited profiles come from the research pipeline (Phase 8).

import type { PlanetProfile, Twist } from './rules';

export interface Fixture {
  profile: PlanetProfile;
  twist: Twist;
}

export const FIXTURES = {
  moon: {
    twist: 'radiation',
    profile: {
      name: 'Moon (south pole)',
      insolation: 1.0,
      nightHours: 354,
      meanTempK: 200,
      surfacePressureBar: 0,
      co2Atmosphere: false,
      waterIce: true,
      polarIce: true,
      radiationDoseMSvPerDay: 1.37,
      dustStorms: false,
      gravity: 1.62,
    },
  },
  mars: {
    twist: 'dust',
    profile: {
      name: 'Mars',
      insolation: 0.43,
      nightHours: 12.3,
      meanTempK: 210,
      surfacePressureBar: 0.006,
      co2Atmosphere: true,
      waterIce: true,
      polarIce: false,
      radiationDoseMSvPerDay: 0.67,
      dustStorms: true,
      gravity: 3.71,
    },
  },
  titan: {
    twist: 'thermal',
    profile: {
      name: 'Titan',
      insolation: 0.011,
      nightHours: 191,
      meanTempK: 94,
      surfacePressureBar: 1.47,
      co2Atmosphere: false,
      waterIce: true,
      polarIce: false,
      radiationDoseMSvPerDay: null,
      dustStorms: false,
      gravity: 1.35,
    },
  },
  brightExoplanet: {
    twist: 'radiation',
    profile: {
      name: 'Bright exoplanet (test)',
      insolation: 1.5,
      nightHours: null,
      meanTempK: 300,
      surfacePressureBar: null,
      co2Atmosphere: false,
      waterIce: false,
      polarIce: false,
      radiationDoseMSvPerDay: null,
      dustStorms: false,
      gravity: 9.8,
    },
  },
} satisfies Record<string, Fixture>;
