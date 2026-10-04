// The planet data — not one universal build — decides what wins (docs/Implementation.md → Balance).
import { describe, expect, it } from 'vitest';
import { FIXTURES } from './fixtures';
import { generateTiles, mulberry32 } from './grid';
import { emptyCounts, massOf } from './pieces';
import { deriveRules } from './rules';
import { solveRound, winningBuilds } from './winnability';

/** The memorised "always nuclear" rule: reactor, drill if there's ice else 2 water tanks, 2 O₂ tanks, twist pieces. */
function reactorShortcut(key: keyof typeof FIXTURES) {
  const { profile, twist } = FIXTURES[key];
  const r = deriveRules(profile, twist);
  return { ...emptyCounts(), reactor: 1, o2_tank: 2, berm: r.bermsRequired, thermal_unit: r.thermalLoad, ...(r.iceAvailable ? { ice_drill: 1 } : { water_tank: 2 }) };
}

function solve(key: keyof typeof FIXTURES) {
  const { profile, twist } = FIXTURES[key];
  const tiles = generateTiles(mulberry32(42), { ice: profile.waterIce, polarIce: profile.polarIce });
  const result = solveRound(deriveRules(profile, twist), tiles);
  if (!result.ok) throw new Error(result.reason);
  return result;
}

describe('balance: the planet data decides the build', () => {
  it('Moon (radiation): 15-day nights + crater ice → solar, storage, ice drill; the reactor no longer fits', () => {
    const { cheapest, budget } = solve('moon');
    expect(cheapest.counts).toMatchObject({ reactor: 0, ice_drill: 1, battery: 6, berm: 4 });
    expect(cheapest.counts.solar).toBeGreaterThan(0);
    expect([cheapest.mass, budget]).toEqual([28, 31]);
    expect(massOf(reactorShortcut('moon'))).toBeGreaterThan(budget);
  });

  it('Mars (dust): halved sunlight still works with enough solar + storm batteries, mining ice and CO₂ air', () => {
    const { cheapest, budget } = solve('mars');
    expect(cheapest.counts).toMatchObject({ reactor: 0, ice_drill: 1, o2_unit: 1, o2_tank: 0, water_tank: 0 });
    expect([cheapest.mass, budget]).toEqual([24, 27]);
    // The shipped-supplies reactor shortcut fails; nuclear + MOXIE still fits (Curiosity's answer).
    expect(massOf(reactorShortcut('mars'))).toBeGreaterThan(budget);
  });

  it('Titan (thermal): ~1% sunlight and −179 °C → reactor + shipped supplies + 2 thermal units', () => {
    const { cheapest, budget } = solve('titan');
    expect(cheapest.counts).toMatchObject({ reactor: 1, solar: 0, water_tank: 2, o2_tank: 2, thermal_unit: 2 });
    expect([cheapest.mass, budget]).toEqual([36, 40]);
  });

  it('Bright exoplanet (radiation): 1.5× sunlight → solar + batteries, no reactor', () => {
    const { cheapest, budget } = solve('brightExoplanet');
    expect(cheapest.counts).toMatchObject({ reactor: 0, berm: 4 });
    expect(cheapest.counts.solar).toBeGreaterThan(0);
    expect([cheapest.mass, budget]).toEqual([27, 30]);
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

  it('rejects rules that no build can satisfy within the grid or the 40 CU cap', () => {
    const tiles = generateTiles(mulberry32(1), { ice: false, polarIce: false });
    const base = deriveRules(FIXTURES.titan.profile, 'thermal');
    // More berms than habitat-adjacent tiles: nothing fits the grid.
    expect(solveRound({ ...base, twist: 'radiation', bermsRequired: 9 }, tiles)).toMatchObject({ ok: false });
    // 3 thermal units push the load past one reactor, no usable sunlight: 2 reactors + tanks + units > the 40 CU cap.
    const heavy = { ...base, thermalLoad: 3 as unknown as 2 };
    expect(solveRound(heavy, tiles)).toMatchObject({ ok: false });
  });
});
