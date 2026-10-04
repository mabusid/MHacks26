import { describe, expect, it } from 'vitest';
import { HABITAT_ADJACENT, generateTiles, mulberry32, tileName } from './grid';
import { placementError } from './board';

describe('grid', () => {
  it('has 8 habitat-adjacent tiles and A–H × 1–8 names', () => {
    expect(HABITAT_ADJACENT.map(tileName).sort()).toEqual(['C4', 'C5', 'D3', 'D6', 'E3', 'E6', 'F4', 'F5']);
    expect(tileName(0)).toBe('A1');
    expect(tileName(63)).toBe('H8');
  });

  it('generates 12 shaded + 4 ice; polar ice sits inside the shade', () => {
    const count = (t: string[], k: string) => t.filter(x => x === k).length;
    const open = generateTiles(mulberry32(7), { ice: true, polarIce: false });
    expect([count(open, 'habitat'), count(open, 'shaded'), count(open, 'ice')]).toEqual([4, 12, 4]);
    const polar = generateTiles(mulberry32(7), { ice: true, polarIce: true });
    expect([count(polar, 'shaded'), count(polar, 'ice')]).toEqual([8, 4]);
    const dry = generateTiles(mulberry32(7), { ice: false, polarIce: false });
    expect(count(dry, 'ice')).toBe(0);
  });

  it('is deterministic for a seed', () => {
    expect(generateTiles(mulberry32(3), { ice: true, polarIce: true })).toEqual(generateTiles(mulberry32(3), { ice: true, polarIce: true }));
  });
});

describe('placementError', () => {
  const tiles = generateTiles(mulberry32(7), { ice: true, polarIce: false });
  const at = (k: string) => tiles.indexOf(k as never);
  const pos = (i: number) => ({ x: i % 8, y: Math.floor(i / 8) });

  it('enforces tile rules', () => {
    const ice = pos(at('ice'));
    const shaded = pos(at('shaded'));
    expect(placementError('ice_drill', ice.x, ice.y, tiles, new Set())).toBeNull();
    expect(placementError('ice_drill', shaded.x, shaded.y, tiles, new Set())).toMatch(/ice tile/);
    expect(placementError('solar', shaded.x, shaded.y, tiles, new Set())).toMatch(/sunlit/);
    expect(placementError('berm', 0, 0, tiles, new Set())).toMatch(/touch the habitat/);
    expect(placementError('battery', 3, 3, tiles, new Set())).toMatch(/habitat/);
    expect(placementError('battery', 0, 0, tiles, new Set([0]))).toMatch(/occupied/);
  });
});
