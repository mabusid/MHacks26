// Brute-force winnability (Plan.md → Evaluation & board read). ~90k count vectors — cheap enough for a reducer.

import { HABITAT_ADJACENT, type Tiles } from './grid';
import { evaluate } from './evaluate';
import { BUDGET_MAX, BUDGET_MIN, BUDGET_SLACK, emptyCounts, massOf, type Counts } from './pieces';
import type { RoundRules } from './rules';

export interface Build {
  counts: Counts;
  mass: number;
}

const RANGES = { solar: 12, battery: 9, reactor: 2, water_tank: 4, o2_tank: 4, ice_drill: 2, o2_unit: 2 } as const;
const OPEN_TILES = 60;

export interface TileCapacity {
  lit: number;
  ice: number;
  adjacent: number;
  adjacentNotLit: number;
}

export function tileCapacity(tiles: Tiles): TileCapacity {
  const adjacentNotLit = HABITAT_ADJACENT.filter(i => tiles[i] !== 'lit').length;
  return {
    lit: tiles.filter(t => t === 'lit').length,
    ice: tiles.filter(t => t === 'ice').length,
    adjacent: HABITAT_ADJACENT.length,
    adjacentNotLit,
  };
}

/** Can these counts physically fit? Berms prefer non-lit adjacent tiles so solar keeps the lit ones. */
export function fits(c: Counts, cap: TileCapacity): boolean {
  const total = Object.values(c).reduce((a, b) => a + b, 0);
  if (total > OPEN_TILES) return false;
  if (c.ice_drill > cap.ice) return false;
  if (c.berm > cap.adjacent) return false;
  const bermsOnLit = Math.max(0, c.berm - cap.adjacentNotLit);
  return c.solar <= cap.lit - bermsOnLit;
}

/** Every winning build that fits the grid, with mass ≤ maxMass. */
export function winningBuilds(rules: RoundRules, tiles: Tiles, maxMass = Infinity): Build[] {
  const cap = tileCapacity(tiles);
  const maxDrills = rules.iceAvailable ? Math.min(RANGES.ice_drill, cap.ice) : 0;
  const out: Build[] = [];
  const c = emptyCounts();
  c.berm = rules.bermsRequired;
  for (c.reactor = 0; c.reactor <= RANGES.reactor; c.reactor++)
    for (c.solar = 0; c.solar <= RANGES.solar; c.solar++)
      for (c.battery = 0; c.battery <= RANGES.battery; c.battery++)
        for (c.water_tank = 0; c.water_tank <= RANGES.water_tank; c.water_tank++)
          for (c.o2_tank = 0; c.o2_tank <= RANGES.o2_tank; c.o2_tank++)
            for (c.ice_drill = 0; c.ice_drill <= maxDrills; c.ice_drill++)
              for (c.o2_unit = 0; c.o2_unit <= RANGES.o2_unit; c.o2_unit++) {
                const mass = massOf(c);
                if (mass > maxMass || !fits(c, cap)) continue;
                if (evaluate(c, rules).allPass) out.push({ counts: { ...c }, mass });
              }
  return out;
}

export type Solve = { ok: true; cheapest: Build; budget: number } | { ok: false; reason: string };

/** Cheapest winning build → mass budget = ceil(cheapest × 1.25), clamped 14–24; reject if nothing fits under 24. */
export function solveRound(rules: RoundRules, tiles: Tiles): Solve {
  const builds = winningBuilds(rules, tiles, BUDGET_MAX);
  if (!builds.length) return { ok: false, reason: `No winning build fits under ${BUDGET_MAX} CU` };
  const cheapest = builds.reduce((best, b) => (b.mass < best.mass ? b : best));
  const budget = Math.min(BUDGET_MAX, Math.max(BUDGET_MIN, Math.ceil(cheapest.mass * BUDGET_SLACK)));
  return { ok: true, cheapest, budget };
}
