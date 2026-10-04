// The build board drawn in 3D (docs/look.md → Board), in the same pixel-diorama style as the world. Purely
// visual: the HTML grid in Grid.tsx stays on top as the (transparent) input layer, so taps, keyboard play and
// aria labels are unchanged. The grid has a slight forward tilt (CSS perspective(d) rotateX); the camera here
// reproduces it exactly (eye at distance d in front of the tilt's pivot, 1 unit = 1 CSS px), so every 3D tile
// sits under its button and the pieces show their fronts.

import { Component, useEffect, useMemo, useRef, type ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import type { PieceKind, TileKind } from '@mission-control/shared';
import PieceModel from './PieceModel';
import StylePass from './StylePass';
import { useToonRamp } from './toon';

/** Everything in CSS px, relative to the tilt's pivot (the plane's transform-origin), y down (measured from the DOM). */
export interface BoardLayout {
  width: number; // canvas size; the canvas is centered on the pivot
  height: number;
  perspective: number;
  tilt: number; // radians, CSS rotateX
  cell: number;
  tiles: { cx: number; cy: number; w: number; h: number }[];
  board: { cx: number; cy: number; w: number; h: number };
  habitat: { cx: number; cy: number };
}

export interface BoardState {
  tiles: readonly TileKind[];
  pieces: ReadonlyMap<number, PieceKind>;
  /** Per tile: the selected tool can act here (place, or remove). */
  valid: readonly boolean[];
  /** Mark the valid tiles (any piece selected; not in remove mode). */
  marked: boolean;
  habitatCells: ReadonlySet<number>;
  hover: number | null;
  removing: boolean;
}

const TILE_TOP: Record<string, number> = { lit: 0, ice: 0, shaded: -4 }; // shaded tiles sit lower: a cue besides color
const TILE_THICK = 10;
/** 3D tiles are drawn this much smaller than their buttons, so every gap is wider than a pixel of the style pass
 *  (a 2px gap drew as broken dashes). Hit areas are the HTML buttons, so taps are unaffected. */
const TILE_INSET = 3;
const ICE = '#9fd3ea';
const ACCENT = '#2dd4bf';
const BAD = '#f87171';

/**
 * Tiles in the planet's colors. Sunlit ground is just ground (it only lights up when a solar array is selected);
 * shade and ice are always visible: shaded tiles are darker and sit lower, ice tiles are icy with crystals.
 */
function useTileMaterials(ramp: THREE.Texture, ground: string, ink: string) {
  return useMemo(() => {
    const make = (color: THREE.Color) => new THREE.MeshToonMaterial({ color, gradientMap: ramp });
    const g = new THREE.Color(ground);
    return {
      lit: make(g.clone().lerp(new THREE.Color('#ffffff'), 0.12)),
      shaded: make(g.clone().lerp(new THREE.Color(ink), 0.7)),
      ice: make(new THREE.Color(ICE)),
    } as Record<string, THREE.Material>;
  }, [ramp, ground, ink]);
}

/** A flat square ring (tile rim), shared by every tile. */
function useRimGeometry(w: number, h: number, t: number) {
  return useMemo(() => {
    const s = new THREE.Shape();
    s.moveTo(-w / 2, -h / 2).lineTo(w / 2, -h / 2).lineTo(w / 2, h / 2).lineTo(-w / 2, h / 2).closePath();
    const hole = new THREE.Path();
    hole.moveTo(-w / 2 + t, -h / 2 + t).lineTo(-w / 2 + t, h / 2 - t).lineTo(w / 2 - t, h / 2 - t).lineTo(w / 2 - t, -h / 2 + t).closePath();
    s.holes.push(hole);
    return new THREE.ShapeGeometry(s);
  }, [w, h, t]);
}

function Tile({ kind, crystals, pos, w, h, raised, mats, ramp }: { kind: string; crystals: boolean; pos: [number, number]; w: number; h: number; raised: boolean; mats: ReturnType<typeof useTileMaterials>; ramp: THREE.Texture }) {
  const top = (TILE_TOP[kind] ?? 0) + (raised ? 3 : 0);
  const m = mats[kind] ?? mats.lit;
  return (
    <group position={[pos[0], pos[1], 0]}>
      <mesh position={[0, 0, top - TILE_THICK / 2]} material={m}>
        <boxGeometry args={[w - TILE_INSET, h - TILE_INSET, TILE_THICK]} />
      </mesh>
      {kind === 'ice' && crystals && (
        // Ice crystals: a shape cue for ice, not only a color.
        <group position={[0, 0, top]}>
          {[
            [-0.22, 0.18, 0.11],
            [0.2, -0.16, 0.08],
            [0.18, 0.24, 0.06],
          ].map(([x, y, s], i) => (
            <mesh key={i} position={[x * w, y * h, s * w * 0.6]} scale={[1, 1, 1.6]}>
              <octahedronGeometry args={[s * w, 0]} />
              <meshToonMaterial color="#e0f4fc" gradientMap={ramp} />
            </mesh>
          ))}
        </group>
      )}
    </group>
  );
}

/** Pieces drop onto the pad when placed (skipped with reduced motion). */
function Placed({ kind, cell, ramp, reducedMotion }: { kind: PieceKind; cell: number; ramp: THREE.Texture; reducedMotion: boolean }) {
  const ref = useRef<THREE.Group>(null);
  const born = useRef<number | null>(null);
  useFrame(({ invalidate }) => {
    const g = ref.current;
    if (!g) return;
    if (born.current === null) born.current = performance.now();
    const t = reducedMotion ? 1 : Math.min(1, (performance.now() - born.current) / 260);
    const e = 1 - (1 - t) ** 3;
    g.position.z = (1 - e) * cell * 0.9;
    g.scale.setScalar(cell * (0.75 + 0.25 * e));
    if (t < 1) invalidate();
  });
  return (
    <group ref={ref} rotation={[Math.PI / 2, 0, 0]} scale={cell}>
      <PieceModel kind={kind} ramp={ramp} />
    </group>
  );
}

function Habitat({ cell, ramp }: { cell: number; ramp: THREE.Texture }) {
  // Same parts as the habitat in the world (World.tsx → Site), sized for the 2×2 block.
  return (
    <group rotation={[Math.PI / 2, 0, 0]} scale={cell}>
      <mesh position={[0, 0.04, 0]}>
        <boxGeometry args={[1.9, 0.08, 1.9]} />
        <meshToonMaterial color="#475569" gradientMap={ramp} />
      </mesh>
      <mesh position={[0, 0.36, 0]}>
        <boxGeometry args={[1.4, 0.56, 1.4]} />
        <meshToonMaterial color="#c9d2de" gradientMap={ramp} />
      </mesh>
      <mesh position={[0, 0.64, 0]}>
        <sphereGeometry args={[0.52, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <meshToonMaterial color="#9fb0c4" gradientMap={ramp} />
      </mesh>
      <mesh position={[0, 0.28, 0.82]}>
        <boxGeometry args={[0.46, 0.4, 0.36]} />
        <meshToonMaterial color="#c9d2de" gradientMap={ramp} />
      </mesh>
      <mesh position={[0.5, 0.95, -0.4]}>
        <boxGeometry args={[0.08, 0.7, 0.08]} />
        <meshToonMaterial color="#c9d2de" gradientMap={ramp} />
      </mesh>
      <mesh position={[0, 1.22, 0]}>
        <sphereGeometry args={[0.1, 10, 6]} />
        <meshBasicMaterial color={ACCENT} />
      </mesh>
    </group>
  );
}

/** Camera = the CSS perspective: eye at distance d in front of the pivot, 1 world unit = 1 CSS px. */
function CssCamera({ layout }: { layout: BoardLayout }) {
  const { camera, invalidate } = useThree();
  useEffect(() => {
    const cam = camera as THREE.PerspectiveCamera;
    cam.position.set(0, 0, layout.perspective);
    cam.lookAt(0, 0, 0);
    cam.fov = THREE.MathUtils.radToDeg(2 * Math.atan(layout.height / 2 / layout.perspective));
    cam.aspect = layout.width / layout.height;
    cam.near = layout.perspective * 0.2;
    cam.far = layout.perspective * 3;
    cam.updateProjectionMatrix();
    invalidate();
  }, [camera, invalidate, layout]);
  return null;
}

function Board({ layout, state, ink, ground, reducedMotion }: { layout: BoardLayout; state: BoardState; ink: string; ground: string; reducedMotion: boolean }) {
  const ramp = useToonRamp();
  const mats = useTileMaterials(ramp, ground, ink);
  const t0 = layout.tiles[0];
  const rim = useRimGeometry(t0.w - TILE_INSET, t0.h - TILE_INSET, Math.max(1.5, t0.w * 0.05));
  const dotGeo = useMemo(() => new THREE.CylinderGeometry(t0.w * 0.08, t0.w * 0.08, 3, 8), [t0.w]);

  return (
    <>
      <CssCamera layout={layout} />
      <ambientLight intensity={0.9} />
      <directionalLight position={[-300, 500, 700]} intensity={2.2} color="#fff6e8" />
      <directionalLight position={[400, -200, 300]} intensity={0.6} color="#9fb4ff" />
      {/* CSS rotateX(a) with y down == three.js rotation.x = -a with y up. */}
      <group rotation={[-layout.tilt, 0, 0]}>
        {/* The pad the tiles sit in (the dark gaps between tiles). */}
        <mesh position={[layout.board.cx, -layout.board.cy, -TILE_THICK - 4]}>
          <boxGeometry args={[layout.board.w + 8, layout.board.h + 8, 12]} />
          <meshToonMaterial color={ink} gradientMap={ramp} />
        </mesh>
        {layout.tiles.map((t, i) => {
          if (state.habitatCells.has(i)) return null;
          const kind = state.tiles[i];
          const piece = state.pieces.get(i);
          const ok = state.valid[i];
          const hovered = state.hover === i;
          const top = (TILE_TOP[kind] ?? 0) + (hovered && ok ? 3 : 0);
          const rimColor = hovered ? (ok ? (state.removing ? BAD : '#ccfbf1') : BAD) : state.removing ? BAD : ACCENT;
          const showRim = hovered || (ok && state.marked);
          return (
            <group key={i}>
              <Tile kind={kind} crystals={!piece} pos={[t.cx, -t.cy]} w={t.w} h={t.h} raised={hovered && ok} mats={mats} ramp={ramp} />
              {showRim && (
                <mesh geometry={rim} position={[t.cx, -t.cy, top + 0.6]}>
                  <meshBasicMaterial color={rimColor} />
                </mesh>
              )}
              {ok && state.marked && !piece && (
                <mesh geometry={dotGeo} position={[t.cx, -t.cy, top + 1.5]} rotation={[Math.PI / 2, 0, 0]}>
                  <meshBasicMaterial color={ACCENT} />
                </mesh>
              )}
              {piece && (
                <group position={[t.cx, -t.cy, top]}>
                  <Placed kind={piece} cell={t.w} ramp={ramp} reducedMotion={reducedMotion} />
                </group>
              )}
            </group>
          );
        })}
        <group position={[layout.habitat.cx, -layout.habitat.cy, 0]}>
          <Habitat cell={layout.cell} ramp={ramp} />
        </group>
      </group>
      <StylePass enabled pixel={2} ink={ink} edge={0.006} />
    </>
  );
}

class Boundary extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export default function BoardCanvas({ layout, state, ink, ground, onReady, onFail }: { layout: BoardLayout; state: BoardState; ink: string; ground: string; onReady: () => void; onFail: () => void }) {
  const reducedMotion = useMemo(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false, []);
  return (
    <Boundary onError={onFail}>
      <Canvas
        flat
        frameloop="demand"
        dpr={[1, 2]}
        gl={{ antialias: false, alpha: true, powerPreference: 'low-power' }}
        style={{ width: layout.width, height: layout.height, pointerEvents: 'none' }}
        onCreated={({ gl }) => {
          gl.setClearColor(0x000000, 0);
          gl.domElement.addEventListener('webglcontextlost', e => {
            e.preventDefault();
            onFail();
          });
          onReady();
        }}
      >
        <Board layout={layout} state={state} ink={ink} ground={ground} reducedMotion={reducedMotion} />
      </Canvas>
    </Boundary>
  );
}
