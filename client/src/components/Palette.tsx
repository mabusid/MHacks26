import { PIECES, pieceEffect, type PieceKind, type RoundRules } from '@overburden/shared';
import { PALETTE } from '../pieceArt';
import type { Tool } from './Grid';
import PieceIcon from './PieceIcon';

interface Props {
  tool: Tool;
  onTool: (t: Tool) => void;
  rules: RoundRules;
  massLeft: number;
  /** Hovered tile status; when absent the line explains the selected piece. */
  hoverInfo?: string;
}

/** Why a piece can't be used right now — shown on the button, not hidden in a tooltip. */
function unavailable(k: PieceKind, rules: RoundRules, massLeft: number): string | null {
  if (k === 'ice_drill' && !rules.iceAvailable) return 'no ice here';
  if (PIECES[k].mass > massLeft) return 'over budget';
  return null;
}

export default function Palette({ tool, onTool, rules, massLeft, hoverInfo }: Props) {
  const line =
    hoverInfo ?? (tool === 'remove' ? 'Remove: tap a piece to take it back (full refund).' : `${PIECES[tool].label}: ${pieceEffect(tool, rules)}`);
  return (
    <div className="palette-wrap">
      <div className="palette" role="toolbar" aria-label="Pieces">
        {PALETTE.map((k, i) => {
          const why = unavailable(k, rules, massLeft);
          return (
            <button
              key={k}
              className={tool === k ? 'piece-btn selected' : 'piece-btn'}
              onClick={() => onTool(k)}
              disabled={!!why}
              aria-label={`${PIECES[k].label}, ${PIECES[k].mass} cargo units${why ? `, ${why}` : ''} (key ${i + 1})`}
            >
              <PieceIcon kind={k} size={26} />
              <span className="piece-label">{PIECES[k].label}</span>
              <span className={why ? 'piece-mass why' : 'piece-mass'}>{why ?? `${PIECES[k].mass} CU`}</span>
            </button>
          );
        })}
        <button className={tool === 'remove' ? 'piece-btn remove selected' : 'piece-btn remove'} onClick={() => onTool('remove')} aria-label="Remove (key R)">
          <span className="remove-glyph" aria-hidden>
            ✕
          </span>
          <span className="piece-label">Remove</span>
          <span className="piece-mass">refund</span>
        </button>
      </div>
      <p className="piece-info" aria-live="polite">
        {line}
      </p>
    </div>
  );
}
