// The planet data — not one universal build — decides what wins (docs/Implementation.md → Balance).
import { describe, expect, it } from 'vitest';
import { FIXTURES } from './fixtures';
import { generateTiles, mulberry32 } from './grid';
import { deriveRules } from './rules';
import { solveRound, winningBuilds } from './winnability';

function solve(key: keyof typeof FIXTURES) {
  const { profile, twist } = FIXTURES[key];
  const tiles = generateTiles(mulberry32(42), { ice: profile.waterIce, polarIce: profile.polarIce });
  const result = solveRound(deriveRules(profile, twist), tiles);
  if (!result.ok) throw new Error(result.reason);
  return result;
}

describe('balance: the planet data decides the build', () => {
  it('Moon (radiation): bright sun but 15-day nights + polar ice → solar, batteries, ice drill — no reactor', () => {
    const { cheapest, budget } = solve('moon');
    expect(cheapest.counts).toMatchObject({ reactor: 0, ice_drill: 1, berm: 4 });
    expect(cheapest.counts.solar).toBeGreaterThan(0);
    expect(cheapest.counts.battery).toBeGreaterThanOrEqual(6);
    expect([cheapest.mass, budget]).toEqual([28, 33]);
  });

  it('Mars (dust): solar halved → reactor; CO₂ air → O₂ unit instead of O₂ tanks', () => {
    const { cheapest, budget } = solve('mars');
    expect(cheapest.counts).toMatchObject({ reactor: 1, o2_unit: 1, o2_tank: 0, water_tank: 2 });
    expect([cheapest.mass, budget]).toEqual([23, 27]);
  });

  it('Titan (thermal): ~1% sunlight and −179 °C → reactor + shipped supplies + 2 thermal units', () => {
    const { cheapest, budget } = solve('titan');
    expect(cheapest.counts).toMatchObject({ reactor: 1, solar: 0, water_tank: 2, o2_tank: 2, thermal_unit: 2 });
    expect([cheapest.mass, budget]).toEqual([32, 37]);
  });

  it('Bright exoplanet (radiation): 1.5× sunlight → solar + batteries, no reactor', () => {
    const { cheapest, budget } = solve('brightExoplanet');
    expect(cheapest.counts).toMatchObject({ reactor: 0, berm: 4, o2_unit: 1 });
    expect(cheapest.counts.solar).toBeGreaterThan(0);
    expect([cheapest.mass, budget]).toEqual([27, 32]);
  });

  it('no single build wins on every fixture (data-blind play fails)', () => {
    const keys = (Object.keys(FIXTURES) as (keyof typeof FIXTURES)[]).map(k => {
      const { profile, twist } = FIXTURES[k];
      const tiles = generateTiles(mulberry32(42), { ice: profile.waterIce, polarIce: profile.polarIce });
      const rules = deriveRules(profile, twist);
      const solved = solveRound(rules, tiles);
      if (!solved.ok) throw new Error(solved.reason);
      return new Set(winningBuilds(rules, tiles, solved.budget).map(b => JSON.stringify({ ...b.counts, berm: 0 })));
    });
    const everywhere = [...keys[0]].filter(k => keys.every(set => set.has(k)));
    expect(everywhere).toEqual([]);
  });

  it('rejects rules that no build can satisfy within the grid or the 38 CU cap', () => {
    const tiles = generateTiles(mulberry32(1), { ice: false, polarIce: false });
    const base = deriveRules(FIXTURES.titan.profile, 'thermal');
    // More berms than habitat-adjacent tiles: nothing fits the grid.
    expect(solveRound({ ...base, twist: 'radiation', bermsRequired: 9 }, tiles)).toMatchObject({ ok: false });
    // 3 thermal units push the load past one reactor, no usable sunlight: 2 reactors + tanks + units = 47 CU > 38.
    const heavy = { ...base, thermalLoad: 3 as unknown as 2 };
    expect(solveRound(heavy, tiles)).toMatchObject({ ok: false });
  });
});
