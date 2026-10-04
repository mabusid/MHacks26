import { Suspense, lazy, useCallback, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { GRID_SIZE, PIECES, isHabitat, placementError, tileName, xy, type PieceKind, type TileKind } from '@overburden/shared';
import { crewColor } from '../format';
import type { Cursor, Member, Piece } from '../module_bindings/types';
import type { BoardLayout, BoardState } from './BoardCanvas';
import PieceIcon from './PieceIcon';

// three.js stays out of the main bundle; until it loads (or if WebGL is missing) the HTML/SVG board shows.
const BoardCanvas = lazy(() => import('./BoardCanvas'));

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
  onCursor: (x: number, y: number, visible: boolean) => void;
  /** Hovered/focused tile status for the info line (undefined = nothing hovered). */
  onInfo: (text: string | undefined) => void;
}

const LETTERS = 'ABCDEFGH';
const CURSOR_INTERVAL_MS = 66; // ~15 updates/s
const TILE_WORD: Record<string, string> = { lit: 'sunlit', shaded: 'shaded', ice: 'ice' };
const HABITAT_CELLS = new Set(Array.from({ length: GRID_SIZE * GRID_SIZE }, (_, i) => i).filter(i => isHabitat(xy(i).x, xy(i).y)));

function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

/**
 * The 2.5D build board (docs/design.md → Build). HTML buttons, so taps are exact and keyboard play works.
 * Selecting a tool marks every valid tile (teal rim + dot) and dims/hatches invalid ones — no hover needed.
 */
export default function Grid(props: Props) {
  const { tiles, pieces, cursors, members, me, tool, massLeft } = props;
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const lastSent = useRef(0);
  const [hover, setHover] = useState<number | null>(null);
  const sceneRef = useRef<HTMLDivElement>(null);
  const planeRef = useRef<HTMLDivElement>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const cellRefs = useRef<(HTMLElement | null)[]>([]);
  const [layout, setLayout] = useState<{ layout: BoardLayout; left: number; top: number; ink: string }>();
  const [use3d, setUse3d] = useState(webglAvailable);
  const [ready3d, setReady3d] = useState(false);

  const byIndex = useMemo(() => new Map(pieces.map(p => [p.index, p])), [pieces]);
  const taken = useMemo(() => new Set(pieces.map(p => p.index)), [pieces]);

  const errorAt = (i: number): string | null => {
    if (tool === 'remove') return byIndex.has(i) ? null : 'Nothing to remove here';
    const { x, y } = xy(i);
    const err = placementError(tool, x, y, tiles, taken);
    if (err) return err;
    return PIECES[tool].mass > massLeft ? `Over budget — needs ${PIECES[tool].mass} CU, ${massLeft} left` : null;
  };

  const info = (i: number) => {
    const p = byIndex.get(i);
    const what = p ? PIECES[p.kind as PieceKind].label : TILE_WORD[tiles[i]] ?? tiles[i];
    const err = errorAt(i);
    return `${tileName(i)} · ${what} · ${err ?? (tool === 'remove' ? 'tap to remove' : `tap to place ${PIECES[tool].label.toLowerCase()}`)}`;
  };

  function sendCursor(i: number, e: React.PointerEvent<HTMLElement>) {
    const now = Date.now();
    if (now - lastSent.current < CURSOR_INTERVAL_MS) return;
    lastSent.current = now;
    // Position inside the hovered tile → grid units (each tile's own rect).
    const r = e.currentTarget.getBoundingClientRect();
    const { x, y } = xy(i);
    props.onCursor(x + (e.clientX - r.left) / r.width, y + (e.clientY - r.top) / r.height, true);
  }

  function focusTile(i: number) {
    refs.current[i]?.focus();
  }

  function onKey(i: number, e: React.KeyboardEvent) {
    const { x, y } = xy(i);
    const step: Record<string, [number, number]> = { ArrowRight: [1, 0], ArrowLeft: [-1, 0], ArrowDown: [0, 1], ArrowUp: [0, -1] };
    const d = step[e.key];
    if (!d) return;
    e.preventDefault();
    let nx = x + d[0];
    let ny = y + d[1];
    // Skip over the habitat block.
    while (nx >= 0 && ny >= 0 && nx < GRID_SIZE && ny < GRID_SIZE && isHabitat(nx, ny)) {
      nx += d[0];
      ny += d[1];
    }
    if (nx >= 0 && ny >= 0 && nx < GRID_SIZE && ny < GRID_SIZE) focusTile(ny * GRID_SIZE + nx);
  }

  // Measure the live DOM so the 3D board matches the HTML one exactly, at any size and tilt. Coordinates are
  // relative to the plane's transform-origin (the pivot of the CSS tilt).
  const measure = useCallback(() => {
    const scene = sceneRef.current, plane = planeRef.current, board = boardRef.current;
    if (!scene || !plane || !board) return;
    const css = getComputedStyle(scene);
    const [ox, oy] = getComputedStyle(plane).transformOrigin.split(' ').map(parseFloat);
    const bw = board.offsetWidth, bh = board.offsetHeight;
    const tiles = Array.from({ length: GRID_SIZE * GRID_SIZE }, (_, i) => {
      const el = cellRefs.current[i];
      const w = el?.offsetWidth ?? 0, h = el?.offsetHeight ?? 0;
      return { cx: board.offsetLeft + (el?.offsetLeft ?? 0) + w / 2 - ox, cy: board.offsetTop + (el?.offsetTop ?? 0) + h / 2 - oy, w, h };
    });
    const hab = tiles.filter((_, i) => isHabitat(xy(i).x, xy(i).y));
    const cell = tiles[0].w;
    // Canvas centered on the pivot, with room above the board for the back row's pieces.
    const halfW = Math.ceil(Math.max(ox - board.offsetLeft, board.offsetLeft + bw - ox) + cell);
    const halfH = Math.ceil(Math.max(oy - board.offsetTop, board.offsetTop + bh - oy) + cell * 1.5);
    setLayout({
      left: plane.offsetLeft + ox - halfW,
      top: plane.offsetTop + oy - halfH,
      ink: css.getPropertyValue('--ink').trim() || '#262d3f',
      layout: {
        width: halfW * 2,
        height: halfH * 2,
        perspective: parseFloat(css.getPropertyValue('--persp')) || 1100,
        tilt: ((parseFloat(css.getPropertyValue('--tilt')) || 0) * Math.PI) / 180,
        cell,
        tiles,
        board: { cx: board.offsetLeft + bw / 2 - ox, cy: board.offsetTop + bh / 2 - oy, w: bw, h: bh },
        habitat: { cx: hab.reduce((a, t) => a + t.cx, 0) / hab.length, cy: hab.reduce((a, t) => a + t.cy, 0) / hab.length },
      },
    });
  }, []);

  useLayoutEffect(() => {
    measure();
    const ro = new ResizeObserver(measure);
    if (planeRef.current) ro.observe(planeRef.current);
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [measure]);

  const valid = tiles.map((_, i) => errorAt(i) === null);
  const boardState: BoardState = {
    tiles,
    pieces: new Map(pieces.map(p => [p.index, p.kind as PieceKind])),
    valid,
    habitatCells: HABITAT_CELLS,
    hover,
    removing: tool === 'remove',
  };

  const others = cursors.filter(c => c.visible && !c.identity.isEqual(me.identity) && members.some(m => m.identity.isEqual(c.identity) && m.online));

  return (
    <div ref={sceneRef} className={`board-scene${use3d && ready3d ? ' is-3d' : ''}`}>
      {use3d && layout && (
        <div className="board-3d" style={{ left: layout.left, top: layout.top }} aria-hidden>
          <Suspense fallback={null}>
            <BoardCanvas layout={layout.layout} state={boardState} ink={layout.ink} onReady={() => setReady3d(true)} onFail={() => setUse3d(false)} />
          </Suspense>
        </div>
      )}
      <div ref={planeRef} className="board-plane">
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
          role="grid"
          aria-label="Build grid"
          onPointerLeave={() => {
            props.onCursor(0, 0, false);
            setHover(null);
            props.onInfo(undefined);
          }}
          onContextMenu={e => e.preventDefault()}
        >
          {tiles.map((kind, i) => {
            const { x, y } = xy(i);
            if (isHabitat(x, y))
              return (
                <div
                  key={i}
                  ref={el => {
                    cellRefs.current[i] = el;
                  }}
                  className="tile tile-habitat-cell"
                  aria-hidden
                />
              );
            const p = byIndex.get(i);
            const ok = errorAt(i) === null;
            const cls = ['tile', `tile-${kind}`, ok ? 'valid' : 'invalid', hover === i ? 'hovered' : '', p ? 'has-piece' : ''].join(' ');
            return (
              <button
                key={i}
                ref={el => {
                  refs.current[i] = el;
                  cellRefs.current[i] = el;
                }}
                className={cls}
                aria-label={info(i)}
                onPointerEnter={() => {
                  setHover(i);
                  props.onInfo(info(i));
                }}
                onPointerMove={e => sendCursor(i, e)}
                onFocus={() => {
                  setHover(i);
                  props.onInfo(info(i));
                }}
                onKeyDown={e => onKey(i, e)}
                onClick={() => (tool === 'remove' ? props.onRemove(i) : props.onPlace(i))}
              >
                {p ? <PieceIcon kind={p.kind as PieceKind} size={48} /> : ok && <span className="valid-dot" aria-hidden />}
              </button>
            );
          })}
          <div className="habitat" aria-label="Habitat">
            <svg className="habitat-svg" viewBox="0 0 80 64" aria-hidden>
              <polygon points="10,46 40,58 70,46 40,34" fill="#475569" />
              <polygon points="22,28 40,36 58,28 40,18" fill="#e2e8f0" />
              <polygon points="22,28 40,36 40,52 22,42" fill="#94a3b8" />
              <polygon points="40,36 58,28 58,42 40,52" fill="#64748b" />
              <path d="M28 20c0-8 24-8 24 0v10H28z" fill="#cbd5e1" />
              <ellipse cx="40" cy="20" rx="12" ry="7" fill="#f8fafc" />
              <circle cx="40" cy="12" r="2.6" fill="#2dd4bf" />
              <path d="M26 32h6M48 30h6" stroke="#1e293b" strokeWidth="1.4" opacity="0.35" />
            </svg>
          </div>
          {others.map(c => {
            const m = members.find(x => x.identity.isEqual(c.identity))!;
            const color = crewColor(members, m);
            return (
              <div key={c.identity.toHexString()} className="cursor" style={{ left: `${(c.x / GRID_SIZE) * 100}%`, top: `${(c.y / GRID_SIZE) * 100}%`, color }}>
                <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden>
                  <path d="M1 1 L1 15 L5 11 L8 17 L10.5 16 L7.5 10 L13 10 Z" fill="currentColor" stroke="#000" strokeWidth="1" />
                </svg>
                <span className="cursor-name" style={{ background: color }}>
                  {m.name}
                </span>
              </div>
            );
          })}
        </div>
      </div>
      <ul className="legend" aria-label="Tile types">
        <li>
          <span className="swatch-tile tile-lit" /> sunlit
        </li>
        <li>
          <span className="swatch-tile tile-shaded" /> shaded
        </li>
        <li>
          <span className="swatch-tile tile-ice" /> ice
        </li>
        <li>
          <span className="swatch-tile valid-sample">
            <span className="valid-dot" />
          </span>{' '}
          can place
        </li>
      </ul>
    </div>
  );
}
