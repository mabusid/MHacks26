import { useEffect, useRef, useState } from 'react';
import { GRID_SIZE, PIECES, isHabitat, placementError, tileName, xy, type PieceKind, type TileKind } from '@overburden/shared';
import { crewColor } from '../format';
import type { Cursor, Member, Piece } from '../module_bindings/types';
import { PIECE_ICON } from '../pieceArt';

export type Tool = PieceKind | 'remove';

interface Props {
  tiles: readonly TileKind[];
  pieces: readonly Piece[];
  cursors: readonly Cursor[];
  members: readonly Member[];
  me: Member;
  tool: Tool;
  massLeft: number;
  onPlace: (index: number) => void;
  onRemove: (index: number) => void;
  onDigStart: (index: number) => void;
  onDigEnd: (index: number) => void;
  onCursor: (x: number, y: number, visible: boolean) => void;
}

const LETTERS = 'ABCDEFGH';
const CURSOR_INTERVAL_MS = 66; // ~15 updates/s

function nowMs() {
  return Date.now();
}

export default function Grid(props: Props) {
  const { tiles, pieces, cursors, members, me, tool, massLeft } = props;
  const boardRef = useRef<HTMLDivElement>(null);
  const lastSent = useRef(0);
  const digging = useRef<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [, tick] = useState(0);

  // Re-render while any berm is being dug so its progress ring advances.
  const anyPending = pieces.some(p => p.pending);
  useEffect(() => {
    if (!anyPending) return;
    const id = setInterval(() => tick(n => n + 1), 100);
    return () => clearInterval(id);
  }, [anyPending]);

  const byIndex = new Map(pieces.map(p => [p.index, p]));
  const taken = new Set(pieces.map(p => p.index));

  function previewError(i: number): string | null {
    if (tool === 'remove') return byIndex.get(i) ? null : 'Nothing to remove';
    const { x, y } = xy(i);
    const err = placementError(tool, x, y, tiles, taken);
    if (err) return err;
    return PIECES[tool].mass > massLeft ? 'Over budget' : null;
  }

  function pointerToGrid(e: React.PointerEvent) {
    const rect = boardRef.current!.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * GRID_SIZE, y: ((e.clientY - rect.top) / rect.height) * GRID_SIZE };
  }

  function onMove(e: React.PointerEvent) {
    const t = nowMs();
    if (t - lastSent.current < CURSOR_INTERVAL_MS) return;
    lastSent.current = t;
    const { x, y } = pointerToGrid(e);
    props.onCursor(x, y, true);
  }

  function endDig() {
    if (digging.current !== null) {
      props.onDigEnd(digging.current);
      digging.current = null;
    }
  }

  function onTileDown(i: number, e: React.PointerEvent) {
    if (tool !== 'berm') return;
    e.preventDefault();
    if (previewError(i)) return;
    digging.current = i;
    props.onDigStart(i);
  }

  function onTileClick(i: number) {
    if (tool === 'berm') return;
    if (tool === 'remove') props.onRemove(i);
    else props.onPlace(i);
  }

  const others = cursors.filter(c => {
    if (!c.visible || c.identity.isEqual(me.identity)) return false;
    return members.some(m => m.identity.isEqual(c.identity) && m.online);
  });

  return (
    <div className="grid-wrap">
      <div className="grid-cols" aria-hidden>
        {LETTERS.split('').map(l => (
          <span key={l}>{l}</span>
        ))}
      </div>
      <div className="grid-rows" aria-hidden>
        {Array.from({ length: GRID_SIZE }, (_, i) => (
          <span key={i}>{i + 1}</span>
        ))}
      </div>
      <div
        ref={boardRef}
        className="board"
        onPointerMove={onMove}
        onPointerLeave={() => {
          props.onCursor(0, 0, false);
          setHover(null);
          endDig();
        }}
        onPointerUp={endDig}
        onPointerCancel={endDig}
      >
        {tiles.map((kind, i) => {
          if (isHabitat(xy(i).x, xy(i).y)) return <div key={i} className="tile tile-habitat-cell" />;
          const p = byIndex.get(i);
          const err = hover === i ? previewError(i) : undefined;
          const cls = ['tile', `tile-${kind}`, hover === i ? (err ? 'preview-bad' : 'preview-ok') : ''].join(' ');
          return (
            <button
              key={i}
              className={cls}
              title={err ?? tileName(i)}
              aria-label={`${tileName(i)} ${kind}${p ? `, ${PIECES[p.kind as PieceKind].label}` : ''}`}
              onPointerEnter={() => setHover(i)}
              onPointerDown={e => onTileDown(i, e)}
              onClick={() => onTileClick(i)}
            >
              {p && <PieceGlyph piece={p} />}
            </button>
          );
        })}
        <div className="habitat" aria-label="Habitat">
          <span>HAB</span>
        </div>
        {others.map(c => {
          const m = members.find(x => x.identity.isEqual(c.identity))!;
          return (
            <div
              key={c.identity.toHexString()}
              className="cursor"
              style={{ left: `${(c.x / GRID_SIZE) * 100}%`, top: `${(c.y / GRID_SIZE) * 100}%`, color: crewColor(members, m) }}
            >
              <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
                <path d="M1 1 L1 15 L5 11 L8 17 L10.5 16 L7.5 10 L13 10 Z" fill="currentColor" stroke="#000" strokeWidth="1" />
              </svg>
              <span className="cursor-name" style={{ background: crewColor(members, m) }}>
                {m.name}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PieceGlyph({ piece }: { piece: Piece }) {
  const kind = piece.kind as PieceKind;
  if (piece.pending && piece.completesAt) {
    const left = Math.max(0, Number(piece.completesAt.microsSinceUnixEpoch / 1000n) - Date.now());
    return (
      <span className="piece digging">
        <span className="dig-ring" style={{ ['--left' as string]: `${left}ms` }} />
        {PIECE_ICON[kind]}
      </span>
    );
  }
  return <span className="piece">{PIECE_ICON[kind]}</span>;
}
