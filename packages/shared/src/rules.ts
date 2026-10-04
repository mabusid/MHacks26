// Research → criteria (Plan.md → Mission requirements). The server derives every threshold from these
// researched values; the agent only chooses which triggered twist to use.

import { SOLAR_INSOLATION_CAP, SOLAR_OUTPUT } from './pieces';

export const TWISTS = ['radiation', 'thermal', 'dust'] as const;
export type Twist = (typeof TWISTS)[number];

export interface PlanetProfile {
  name: string;
  /** Sunlight relative to Earth (1.0 = 1361 W/m²). */
  insolation: number;
  /** Length of one night in hours; null = unknown (estimated band 2). */
  nightHours: number | null;
  /** Mean surface temperature (or exoplanet equilibrium temperature), kelvin. */
  meanTempK: number;
  /** null = unknown atmosphere. */
  surfacePressureBar: number | null;
  co2Atmosphere: boolean;
  waterIce: boolean;
  /** Ice sits in permanently shadowed craters (Moon, Mercury). */
  polarIce: boolean;
  /** null = unmeasured. */
  radiationDoseMSvPerDay: number | null;
  dustStorms: boolean;
  /** m/s². */
  gravity: number;
}

export type NightBand = 1 | 2 | 3;

/** Night storage multiplier: ≤ 24 h → 1, ≤ 10 Earth days → 2, longer → 3; +1 for dust storms, max 3. */
export function nightBand(nightHours: number | null, dust: boolean): NightBand {
  const base = nightHours === null ? 2 : nightHours <= 24 ? 1 : nightHours <= 240 ? 2 : 3;
  return Math.min(3, base + (dust ? 1 : 0)) as NightBand;
}

export function thermalLoadFor(tempK: number): 0 | 1 | 2 {
  if (tempK < 200 || tempK > 400) return 2;
  if (tempK < 250 || tempK > 330) return 1;
  return 0;
}

export function bermsRequiredFor(doseMSvPerDay: number | null): 4 | 6 {
  return doseMSvPerDay !== null && doseMSvPerDay > 10 ? 6 : 4;
}

/** Twists the research supports. Radiation is the fallback when nothing triggers. */
export function triggeredTwists(p: PlanetProfile): Twist[] {
  const out: Twist[] = [];
  if (p.surfacePressureBar === null || p.surfacePressureBar < 0.01) out.push('radiation');
  if (thermalLoadFor(p.meanTempK) > 0) out.push('thermal');
  if (p.dustStorms) out.push('dust');
  return out.length ? out : ['radiation'];
}

/** Everything evaluation needs, derived from research. A twist's effect applies only when it is the chosen twist. */
export interface RoundRules {
  twist: Twist;
  solarPerArray: number;
  nightBand: NightBand;
  thermalLoad: 0 | 1 | 2;
  co2Atmosphere: boolean;
  iceAvailable: boolean;
  bermsRequired: number;
}

export function deriveRules(p: PlanetProfile, twist: Twist): RoundRules {
  if (!triggeredTwists(p).includes(twist)) throw new Error(`Twist "${twist}" is not supported by ${p.name}'s data`);
  const dust = twist === 'dust';
  return {
    twist,
    solarPerArray: SOLAR_OUTPUT * Math.min(p.insolation, SOLAR_INSOLATION_CAP) * (dust ? 0.5 : 1),
    nightBand: nightBand(p.nightHours, dust),
    thermalLoad: twist === 'thermal' ? thermalLoadFor(p.meanTempK) : 0,
    co2Atmosphere: p.co2Atmosphere,
    iceAvailable: p.waterIce,
    bermsRequired: twist === 'radiation' ? bermsRequiredFor(p.radiationDoseMSvPerDay) : 0,
  };
}
