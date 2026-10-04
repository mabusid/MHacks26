// Placed pieces and placement rules, shared by the module (enforcement) and the board read (suggestions).

import { idx, isHabitatAdjacent, type Tiles } from './grid';
import { PIECES, emptyCounts, type Counts, type PieceKind } from './pieces';

export interface PlacedPiece {
  kind: PieceKind;
  x: number;
  y: number;
}

export function occupied(board: readonly PlacedPiece[]): Set<number> {
  return new Set(board.map(p => idx(p.x, p.y)));
}

/** Why a piece can't go here, or null if it can. Ignores mass (checked separately). */
export function placementError(kind: PieceKind, x: number, y: number, tiles: Tiles, taken: Set<number>): string | null {
  const i = idx(x, y);
  const tile = tiles[i];
  if (tile === undefined) return 'Off the grid';
  if (tile === 'habitat') return 'That is the habitat';
  if (taken.has(i)) return 'Tile is occupied';
  switch (PIECES[kind].placement) {
    case 'lit':
      return tile === 'lit' ? null : 'Solar arrays need a sunlit tile';
    case 'ice':
      return tile === 'ice' ? null : 'Ice drills need an ice tile';
    case 'habitat_adjacent':
      return isHabitatAdjacent(x, y) ? null : 'Berms must touch the habitat';
    case 'any':
      return null;
  }
}

export function countBoard(board: readonly PlacedPiece[]): Counts {
  const c = emptyCounts();
  for (const p of board) c[p.kind]++;
  return c;
}

export function pieceIndex(p: PlacedPiece): number {
  return idx(p.x, p.y);
}

