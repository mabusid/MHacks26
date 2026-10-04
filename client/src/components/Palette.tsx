import { PIECES, pieceEffect, type PieceKind, type RoundRules } from '@overburden/shared';
import { PALETTE, PIECE_ICON } from '../pieceArt';
import type { Tool } from './Grid';

interface Props {
  tool: Tool;
  onTool: (t: Tool) => void;
  rules: RoundRules;
  gravity: number;
  massLeft: number;
}

export default function Palette({ tool, onTool, rules, gravity, massLeft }: Props) {
  const unavailable = (k: PieceKind) => (k === 'ice_drill' && !rules.iceAvailable) || PIECES[k].mass > massLeft;
  return (
    <div className="palette-wrap">
      <div className="palette" role="toolbar" aria-label="Pieces">
        {PALETTE.map((k, i) => (
          <button
            key={k}
            className={tool === k ? 'piece-btn selected' : 'piece-btn'}
            onClick={() => onTool(k)}
            disabled={unavailable(k)}
            title={`${PIECES[k].label} (${i + 1})`}
          >
            <span className="piece-icon">{PIECE_ICON[k]}</span>
            <span className="piece-label">{PIECES[k].label}</span>
            <span className="piece-mass">{PIECES[k].mass} CU</span>
          </button>
        ))}
        <button className={tool === 'remove' ? 'piece-btn remove selected' : 'piece-btn remove'} onClick={() => onTool('remove')} title="Remove (R)">
          <span className="piece-icon">✕</span>
          <span className="piece-label">Remove</span>
          <span className="piece-mass">refund</span>
        </button>
      </div>
      <p className="piece-info">
        {tool === 'remove' ? 'Tap a piece to remove it (full refund).' : `${PIECES[tool].label}: ${pieceEffect(tool, rules, gravity)}`}
      </p>
    </div>
  );
}
