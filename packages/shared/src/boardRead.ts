// The board read Mission Control speaks from (Plan.md → Evaluation & board read, Voice assistant).
// Computed by the Node service at each cue from public tables.

import { countBoard, occupied, pieceIndex, placementError, type PlacedPiece } from './board';
import { evaluate, type Evaluation, type RequirementKind, type RequirementResult } from './evaluate';
import { HABITAT_ADJACENT, distanceToHabitat, tileName, xy, type Tiles } from './grid';
import { PIECES, PIECE_KINDS, massOf, type Counts, type PieceKind } from './pieces';
import type { RoundRules } from './rules';
import type { Build } from './winnability';

export type Action = { op: 'add' | 'remove'; kind: PieceKind; tile: string };

export interface BoardRead {
  evaluation: Evaluation;
  worst: RequirementResult | null;
  /** Steps from the current board to the target winning build. Empty when already winning. */
  suggestion: Action[];
  /** Failing, and nothing can be ADDED to win within the budget: the crew must swap something heavy out. */
  overCommitted: boolean;
  massUsed: number;
  massLeft: number;
  summary: string;
  changes: { newlyPassing: RequirementKind[]; boardChanged: boolean };
  /** Stable fingerprint of the board, so the next read can tell whether anything changed. */
  signature: string;
}

const REQUIREMENT_PIECES: Record<RequirementKind, PieceKind[]> = {
  power: ['reactor', 'solar', 'battery'],
  life_support: ['ice_drill', 'o2_unit', 'water_tank', 'o2_tank'],
  twist: ['berm', 'thermal_unit', 'battery', 'reactor', 'solar'],
};

function signatureOf(board: readonly PlacedPiece[]): string {
  return board
    .map(p => `${p.kind}@${tileName(pieceIndex(p))}`)
    .sort()
    .join(',');
}

/**
 * The build Mission Control steers toward. If the crew's pieces can still grow into a winning build, the
 * cheapest such build (it respects their choices and teaches the planet's cheap answer). Otherwise the
 * fewest-changes build, so the advice is a swap, not a teardown.
 */
function targetBuild(builds: readonly Build[], current: Counts): { build: Build | undefined; overCommitted: boolean } {
  let cheapest: Build | undefined;
  for (const b of builds) {
    if (PIECE_KINDS.every(k => b.counts[k] >= current[k]) && (!cheapest || b.mass < cheapest.mass)) cheapest = b;
  }
  if (cheapest) return { build: cheapest, overCommitted: false };
  let best: Build | undefined;
  let bestDist = Infinity;
  for (const b of builds) {
    const dist = PIECE_KINDS.reduce((d, k) => d + Math.abs(b.counts[k] - current[k]), 0);
    if (dist < bestDist || (dist === bestDist && best && b.mass < best.mass)) {
      best = b;
      bestDist = dist;
    }
  }
  return { build: best, overCommitted: true };
}

function planActions(board: readonly PlacedPiece[], tiles: Tiles, target: Counts, current: Counts, order: PieceKind[]): Action[] {
  const actions: Action[] = [];
  const remaining = [...board];
  // Heaviest kinds first (that's what frees the budget), farthest from the habitat first within a kind.
  for (const kind of [...PIECE_KINDS].sort((a, b) => PIECES[b].mass - PIECES[a].mass)) {
    const extra = current[kind] - target[kind];
    if (extra <= 0) continue;
    const victims = remaining.filter(p => p.kind === kind).sort((a, b) => distanceToHabitat(pieceIndex(b)) - distanceToHabitat(pieceIndex(a)));
    for (const v of victims.slice(0, extra)) {
      actions.push({ op: 'remove', kind, tile: tileName(pieceIndex(v)) });
      remaining.splice(remaining.indexOf(v), 1);
    }
  }
  const taken = occupied(remaining);
  // Nearest the habitat first, but keep the habitat-adjacent ring for berms.
  const ring = new Set(HABITAT_ADJACENT);
  const candidates = tiles
    .map((_, i) => i)
    .sort((a, b) => Number(ring.has(a)) - Number(ring.has(b)) || distanceToHabitat(a) - distanceToHabitat(b));
  for (const kind of order) {
    const missing = target[kind] - current[kind];
    for (let n = 0; n < missing; n++) {
      const pool = PIECES[kind].placement === 'habitat_adjacent' ? HABITAT_ADJACENT : candidates;
      const i = pool.find(t => {
        const { x, y } = xy(t);
        return placementError(kind, x, y, tiles, taken) === null;
      });
      if (i === undefined) break;
      taken.add(i);
      actions.push({ op: 'add', kind, tile: tileName(i) });
    }
  }
  return actions;
}

function summarize(board: readonly PlacedPiece[], tiles: Tiles, massUsed: number, budget: number): string {
  const taken = occupied(board);
  const free = (pred: (i: number) => boolean) =>
    tiles
      .map((_, i) => i)
      .filter(i => !taken.has(i) && pred(i))
      .map(tileName);
  const pieces = board.map(p => `${PIECES[p.kind].label} ${tileName(pieceIndex(p))}`);
  return [
    `Pieces: ${pieces.join(', ') || 'none'}`,
    `Mass: ${massUsed}/${budget} CU`,
    `Free ice tiles: ${free(i => tiles[i] === 'ice').join(', ') || 'none'}`,
    `Free habitat-adjacent tiles: ${free(i => HABITAT_ADJACENT.includes(i)).join(', ') || 'none'}`,
    `Free sunlit tiles: ${free(i => tiles[i] === 'lit').length}`,
  ].join('\n');
}

export function boardRead(
  board: readonly PlacedPiece[],
  tiles: Tiles,
  rules: RoundRules,
  budget: number,
  winners: readonly Build[],
  prev?: Pick<BoardRead, 'evaluation' | 'signature'>
): BoardRead {
  const current = countBoard(board);
  const evaluation = evaluate(current, rules);
  const failing = Object.values(evaluation.requirements).filter(r => !r.pass);
  const worst = failing.length ? failing.reduce((a, b) => (b.severity > a.severity ? b : a)) : null;

  let suggestion: Action[] = [];
  let overCommitted = false;
  if (worst) {
    const found = targetBuild(
      winners.filter(b => b.mass <= budget),
      current
    );
    const target = found.build;
    overCommitted = found.overCommitted;
    if (target) {
      const first = REQUIREMENT_PIECES[worst.kind];
      const order = [...first, ...PIECE_KINDS.filter(k => !first.includes(k))];
      suggestion = planActions(board, tiles, target.counts, current, order);
    }
  }

  const massUsed = massOf(current);
  const signature = signatureOf(board);
  const newlyPassing = prev
    ? (Object.keys(evaluation.requirements) as RequirementKind[]).filter(
        k => evaluation.requirements[k].pass && !prev.evaluation.requirements[k].pass
      )
    : [];

  return {
    evaluation,
    worst,
    suggestion,
    overCommitted,
    massUsed,
    massLeft: budget - massUsed,
    summary: summarize(board, tiles, massUsed, budget),
    changes: { newlyPassing, boardChanged: prev ? prev.signature !== signature : true },
    signature,
  };
}
