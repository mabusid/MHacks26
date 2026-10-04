// Reproduces the Plan.md balance table: each planet's cheapest winning build differs.
import { describe, expect, it } from 'vitest';
import { FIXTURES } from './fixtures';
import { generateTiles, mulberry32 } from './grid';
import { deriveRules } from './rules';
import { solveRound } from './winnability';

function solve(key: keyof typeof FIXTURES) {
  const { profile, twist } = FIXTURES[key];
  const tiles = generateTiles(mulberry32(42), { ice: profile.waterIce, polarIce: profile.polarIce });
  const result = solveRound(deriveRules(profile, twist), tiles);
  if (!result.ok) throw new Error(result.reason);
  return result;
}

describe('balance table', () => {
  it('Moon (radiation): reactor + ice drill + 2 O₂ tanks + 4 berms = 16 CU', () => {
    const { cheapest, budget } = solve('moon');
    expect(cheapest.mass).toBe(16);
    expect(cheapest.counts).toMatchObject({ reactor: 1, ice_drill: 1, o2_tank: 2, berm: 4, solar: 0, battery: 0 });
    expect(budget).toBe(20);
  });

  it('Mars (dust): reactor + O₂ unit (CO₂ air) + 2 water tanks = 15 CU', () => {
    const { cheapest, budget } = solve('mars');
    expect(cheapest.mass).toBe(15);
    expect(cheapest.counts).toMatchObject({ reactor: 1, o2_unit: 1, water_tank: 2, o2_tank: 0 });
    expect(budget).toBe(19);
  });

  it('Titan (thermal): reactor + 2 water tanks + 2 O₂ tanks = 18 CU', () => {
    const { cheapest, budget } = solve('titan');
    expect(cheapest.mass).toBe(18);
    expect(cheapest.counts).toMatchObject({ reactor: 1, water_tank: 2, o2_tank: 2, ice_drill: 0, solar: 0 });
    expect(budget).toBe(23);
  });

  it('Bright exoplanet (radiation): solar + batteries + tanks + 4 berms = 17 CU', () => {
    const { cheapest, budget } = solve('brightExoplanet');
    expect(cheapest.mass).toBe(17);
    expect(cheapest.counts).toMatchObject({ reactor: 0, solar: 1, battery: 4, water_tank: 2, o2_tank: 2, berm: 4 });
    expect(budget).toBe(22);
  });

  it('rejects rules that no build can satisfy within the grid or the 24 CU cap', () => {
    const tiles = generateTiles(mulberry32(1), { ice: false, polarIce: false });
    const base = deriveRules(FIXTURES.titan.profile, 'thermal');
    // More berms than habitat-adjacent tiles: nothing fits the grid.
    expect(solveRound({ ...base, twist: 'radiation', bermsRequired: 9 }, tiles)).toMatchObject({ ok: false });
    // Synthetic load one reactor can't carry, no usable sunlight: 2 reactors + tanks = 28 CU > 24.
    const heavy = { ...base, thermalLoad: 3 as unknown as 2 };
    expect(solveRound(heavy, tiles)).toMatchObject({ ok: false });
  });
});
