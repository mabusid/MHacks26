// 8×8 grid, habitat 2×2 at center (Plan.md → Grid). Index = y * GRID_SIZE + x; names are A–H × 1–8.

export const GRID_SIZE = 8;
export const SHADED_TILES = 12;
export const ICE_TILES = 4;

export type TileKind = 'lit' | 'shaded' | 'ice' | 'habitat';
export type Tiles = readonly TileKind[];
/** Returns a float in [0, 1). The module passes ctx.random; tests pass a seeded PRNG. */
export type Rand = () => number;

const HABITAT = new Set([idx(3, 3), idx(4, 3), idx(3, 4), idx(4, 4)]);

export function idx(x: number, y: number): number {
  return y * GRID_SIZE + x;
}

export function xy(i: number): { x: number; y: number } {
  return { x: i % GRID_SIZE, y: Math.floor(i / GRID_SIZE) };
}

export function inBounds(x: number, y: number): boolean {
  return x >= 0 && y >= 0 && x < GRID_SIZE && y < GRID_SIZE;
}

export function isHabitat(x: number, y: number): boolean {
  return HABITAT.has(idx(x, y));
}

/** Orthogonally adjacent to the habitat (8 tiles) — where berms go. */
export function isHabitatAdjacent(x: number, y: number): boolean {
  if (!inBounds(x, y) || isHabitat(x, y)) return false;
  return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => inBounds(x + dx, y + dy) && isHabitat(x + dx, y + dy));
}

export const HABITAT_ADJACENT: readonly number[] = Array.from({ length: GRID_SIZE * GRID_SIZE }, (_, i) => i).filter(i => {
  const { x, y } = xy(i);
  return isHabitatAdjacent(x, y);
});

/** Distance from the habitat center; used to pick "nearest" tiles in hints. */
export function distanceToHabitat(i: number): number {
  const { x, y } = xy(i);
  return Math.abs(x - 3.5) + Math.abs(y - 3.5);
}

export function tileName(i: number): string {
  const { x, y } = xy(i);
  return `${'ABCDEFGH'[x]}${y + 1}`;
}

function pick<T>(rand: Rand, pool: T[], n: number): T[] {
  const copy = [...pool];
  const out: T[] = [];
  while (out.length < n && copy.length) out.push(copy.splice(Math.floor(rand() * copy.length), 1)[0]);
  return out;
}

/** 12 shaded tiles; 4 ice tiles if the planet has ice — inside shade on polar bodies (permanently shadowed craters). */
export function generateTiles(rand: Rand, opts: { ice: boolean; polarIce: boolean }): TileKind[] {
  const tiles: TileKind[] = Array.from({ length: GRID_SIZE * GRID_SIZE }, (_, i) => (HABITAT.has(i) ? 'habitat' : 'lit'));
  const open = tiles.map((_, i) => i).filter(i => !HABITAT.has(i));
  const shaded = pick(rand, open, SHADED_TILES);
  for (const i of shaded) tiles[i] = 'shaded';
  if (opts.ice) {
    const pool = opts.polarIce ? shaded : open.filter(i => tiles[i] === 'lit');
    for (const i of pick(rand, pool, ICE_TILES)) tiles[i] = 'ice';
  }
  return tiles;
}

/** Small seeded PRNG for tests and fixtures (the module uses ctx.random instead). */
export function mulberry32(seed: number): Rand {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
