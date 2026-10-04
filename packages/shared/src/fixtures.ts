// Test fixtures matching the Plan.md balance table. Approximate values for tests and the Phase 3 fixture path —
// sourced, cited profiles come from the research pipeline (Phase 8).

import type { RequirementKind } from './evaluate';
import { PARAM_FIELDS, PARAM_SPECS, type ParamField, type ParamRow } from './params';
import type { PlanetProfile, Twist } from './rules';

export interface Card {
  headline: string;
  scaleText: string;
  because: Record<RequirementKind, { text: string; field: ParamField }>;
  funFacts: [string, string, string];
}

export interface Fixture {
  profile: PlanetProfile;
  twist: Twist;
  card: Card;
}

export const FIXTURES = {
  moon: {
    twist: 'radiation',
    card: {
      headline: 'A single lunar night lasts about 15 Earth days.',
      scaleText: '384,000 km away · ¼ of Earth’s width · same sunlight as Earth',
      because: {
        power: { text: 'A lunar night lasts ~15 Earth days, so solar alone can’t carry you.', field: 'nightHours' },
        life_support: { text: 'Water ice sits in permanently shadowed craters (LCROSS, 2009).', field: 'waterIce' },
        twist: { text: 'No atmosphere: surface dose is ~1.4 mSv/day (Chang’e 4).', field: 'radiationDoseMSvPerDay' },
      },
      funFacts: [
        'Welcome to the Moon’s south pole, where one night lasts about two Earth weeks.',
        'Some craters here haven’t seen sunlight in billions of years — and they hold ice.',
        'With no air to stop it, radiation reaches the surface at about 1.4 millisieverts a day.',
      ],
    },
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
    card: {
      headline: 'Global dust storms can blot out the Sun for weeks.',
      scaleText: '~225 million km away · about half Earth’s width · 43% of Earth’s sunlight',
      because: {
        power: { text: 'Mars gets about 43% of Earth’s sunlight.', field: 'insolation' },
        life_support: { text: 'The air is ~95% CO₂ — NASA’s MOXIE made oxygen from it on Mars.', field: 'co2Atmosphere' },
        twist: { text: 'A global dust storm in 2018 ended the Opportunity rover’s mission.', field: 'dustStorms' },
      },
      funFacts: [
        'Welcome to Mars. A day here is only about 40 minutes longer than on Earth.',
        'The air is mostly carbon dioxide — and in 2021 a toaster-sized experiment called MOXIE turned it into oxygen.',
        'In 2018 a planet-wide dust storm darkened the sky so much that the Opportunity rover never woke up.',
      ],
    },
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
    card: {
      headline: 'Titan gets about 1% of the sunlight Earth does.',
      scaleText: '~1.4 billion km away · bigger than Mercury · ~1% of Earth’s sunlight',
      because: {
        power: { text: 'At Saturn’s distance, sunlight is about 1% of Earth’s.', field: 'insolation' },
        life_support: { text: 'Titan’s crust is water ice, but the air has no CO₂ to make oxygen from.', field: 'co2Atmosphere' },
        twist: { text: 'The surface sits around 94 K (−179 °C).', field: 'meanTempK' },
      },
      funFacts: [
        'Welcome to Titan, Saturn’s largest moon — the only moon with a thick atmosphere.',
        'The air here is denser than Earth’s; the Huygens probe parachuted down through it in 2005.',
        'It’s about minus 179 degrees Celsius outside, so keeping warm will cost you power.',
      ],
    },
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
    card: {
      headline: 'Test planet: brighter than Earth, with nights nobody has measured.',
      scaleText: 'Test fixture · 1.5× Earth’s sunlight',
      because: {
        power: { text: 'It gets 1.5× Earth’s sunlight (test value).', field: 'insolation' },
        life_support: { text: 'No known ice: water has to be shipped (test value).', field: 'waterIce' },
        twist: { text: 'Its atmosphere is unknown, so plan for radiation (test value).', field: 'surfacePressureBar' },
      },
      funFacts: [
        'Welcome to a test world — a stand-in for a real exoplanet.',
        'Most rocky exoplanets have never had their atmospheres measured.',
        'This one gets one and a half times Earth’s sunlight.',
      ],
    },
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

/** Parameter rows for a fixture, labeled as approximate test values. */
export function fixtureParams(f: Fixture): ParamRow[] {
  return PARAM_FIELDS.map((field): ParamRow => {
    const value = f.profile[field];
    const flag = PARAM_SPECS[field].type === 'flag';
    const unknown = value === null;
    return {
      field,
      num: flag || unknown ? null : (value as number),
      flag: flag ? (value as boolean) : null,
      unit: UNITS[field],
      status: unknown ? 'estimated' : 'sourced',
      sourceLabel: unknown ? '' : 'Test fixture (approximate)',
      sourceUrl: '',
      note: unknown ? 'Not measured for this planet' : '',
    };
  });
}

const UNITS: Record<ParamField, string> = {
  insolation: '× Earth',
  nightHours: 'h',
  meanTempK: 'K',
  surfacePressureBar: 'bar',
  co2Atmosphere: '',
  waterIce: '',
  polarIce: '',
  radiationDoseMSvPerDay: 'mSv/day',
  dustStorms: '',
  gravity: 'm/s²',
};
