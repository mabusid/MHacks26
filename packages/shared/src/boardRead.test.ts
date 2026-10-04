import { describe, expect, it } from 'vitest';
import { countBoard, type PlacedPiece } from './board';
import { boardRead } from './boardRead';
import { evaluate } from './evaluate';
import { FIXTURES } from './fixtures';
import { HABITAT_ADJACENT, generateTiles, mulberry32, tileName } from './grid';
import { deriveRules } from './rules';
import { solveRound, winningBuilds } from './winnability';

function setup(key: keyof typeof FIXTURES) {
  const { profile, twist } = FIXTURES[key];
  const tiles = generateTiles(mulberry32(42), { ice: profile.waterIce, polarIce: profile.polarIce });
  const rules = deriveRules(profile, twist);
  const solved = solveRound(rules, tiles);
  if (!solved.ok) throw new Error(solved.reason);
  return { tiles, rules, budget: solved.budget, winners: winningBuilds(rules, tiles, solved.budget) };
}

function apply(board: PlacedPiece[], actions: { op: string; kind: PlacedPiece['kind']; tile: string }[]): PlacedPiece[] {
  const next = [...board];
  for (const a of actions) {
    const x = 'ABCDEFGH'.indexOf(a.tile[0]);
    const y = Number(a.tile.slice(1)) - 1;
    if (a.op === 'remove') next.splice(next.findIndex(p => p.kind === a.kind && p.x === x && p.y === y), 1);
    else next.push({ kind: a.kind, x, y });
  }
  return next;
}

describe('boardRead', () => {
  for (const key of ['moon', 'mars', 'titan', 'brightExoplanet'] as const) {
    it(`${key}: following the suggestion from an empty board wins within budget`, () => {
      const { tiles, rules, budget, winners } = setup(key);
      const read = boardRead([], tiles, rules, budget, winners);
      expect(read.worst).not.toBeNull();
      expect(read.suggestion.length).toBeGreaterThan(0);
      const after = apply([], read.suggestion);
      expect(evaluate(countBoard(after), rules).allPass).toBe(true);
      expect(boardRead(after, tiles, rules, budget, winners).massLeft).toBeGreaterThanOrEqual(0);
    });
  }

  it('steers an empty board to the cheapest build, which on the Moon is solar + storage, not the reactor', () => {
    const { tiles, rules, budget, winners } = setup('moon');
    const read = boardRead([], tiles, rules, budget, winners);
    expect(read.overCommitted).toBe(false);
    expect(read.suggestion.some(a => a.kind === 'reactor')).toBe(false);
    expect(read.suggestion.some(a => a.kind === 'ice_drill')).toBe(true);
  });

  it('flags an over-committed board and swaps out the heaviest piece first', () => {
    const { tiles, rules, budget, winners } = setup('moon');
    // Reactor + shipped water: nothing can be added to win within the Moon budget.
    const board: PlacedPiece[] = [
      { kind: 'reactor', x: 0, y: 0 },
      { kind: 'water_tank', x: 1, y: 0 },
      { kind: 'water_tank', x: 2, y: 0 },
    ];
    const read = boardRead(board, tiles, rules, budget, winners);
    expect(read.overCommitted).toBe(true);
    expect(read.suggestion[0]).toMatchObject({ op: 'remove', kind: 'reactor' });
    const after = apply(board, read.suggestion);
    expect(evaluate(countBoard(after), rules).allPass).toBe(true);
    expect(boardRead(after, tiles, rules, budget, winners).massLeft).toBeGreaterThanOrEqual(0);
  });

  it('reports progress and whether the board changed since the last read', () => {
    const { tiles, rules, budget, winners } = setup('moon');
    const first = boardRead([], tiles, rules, budget, winners);
    const same = boardRead([], tiles, rules, budget, winners, first);
    expect(same.changes).toEqual({ newlyPassing: [], boardChanged: false });

    const berms = first.suggestion.filter(a => a.kind === 'berm');
    const shielded = apply([], berms);
    const next = boardRead(shielded, tiles, rules, budget, winners, first);
    expect(next.changes).toEqual({ newlyPassing: ['twist'], boardChanged: true });
    expect(berms.every(a => HABITAT_ADJACENT.map(tileName).includes(a.tile))).toBe(true);
    expect(next.summary).toContain(`Berm ${berms[0].tile}`);
  });
});
