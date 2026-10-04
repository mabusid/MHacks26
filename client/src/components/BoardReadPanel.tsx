import { useMemo } from 'react';
import { boardRead, winningBuilds, xy, type PieceKind, type RoundRules, type TileKind } from '@mission-control/shared';
import type { Piece } from '../module_bindings/types';

/** Dev builds only: what Mission Control will see at a cue (Phase 9) — worst failing requirement + suggestion. */
export default function BoardReadPanel(props: { rules: RoundRules; tiles: TileKind[]; pieces: readonly Piece[]; budget: number }) {
  const { rules, tiles, pieces, budget } = props;
  const rulesKey = JSON.stringify(rules);
  // ~35 ms; recompute only when the round changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const winners = useMemo(() => winningBuilds(rules, tiles, budget), [rulesKey, tiles.join(), budget]);
  const board = pieces.map(p => ({ kind: p.kind as PieceKind, ...xy(p.index) }));
  const read = boardRead(board, tiles, rules, budget, winners);

  return (
    <details className="dev board-read">
      <summary>dev: board read</summary>
      <p>
        <strong>{read.worst ? read.worst.reason : 'All requirements met'}</strong>
        {read.worst?.fact && <span className="muted"> · fact: {read.worst.fact}</span>}
      </p>
      {read.suggestion.length > 0 && (
        <ol>
          {read.suggestion.map((a, i) => (
            <li key={i}>
              {a.op} {a.kind} @ {a.tile}
            </li>
          ))}
        </ol>
      )}
      <p className="muted small">
        {winners.length} winning builds ≤ {budget} CU · {read.massLeft} CU left
      </p>
    </details>
  );
}
