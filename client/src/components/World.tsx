// The persistent 3D world behind every screen (docs/design.md → Stack, docs/look.md for the look). Mounted
// once in App; only the camera shot and which group is visible change between phases. Decorative only: no
// pointer events. Rendered through StylePass ("pixel diorama"); `\` or ?look=raw shows the raw 3D.

import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import BaseScene from './BaseScene';
import StylePass from './StylePass';
import { useToonRamp } from './toon';

export type WorldPhase = 'home' | 'lobby' | 'briefing' | 'build' | 'debrief';

/** Six colors per planet; everything in the world draws from these (docs/look.md → Palette). */
type Palette = { ground: string; shadow: string; high: string; sky: string; sun: string; rim: string };

const PALETTES: Record<string, Palette> = {
  'theme-space': { ground: '#6b7a99', shadow: '#262d3f', high: '#a3b1cc', sky: '#070a12', sun: '#e8eeff', rim: '#5b7bd6' },
  'theme-airless': { ground: '#80838c', shadow: '#2b2d33', high: '#b4b8c2', sky: '#06070a', sun: '#fbfbf5', rim: '#8fa3c7' },
  'theme-dust': { ground: '#b45f3a', shadow: '#3f1a0e', high: '#e09468', sky: '#1c0c07', sun: '#ffd2a8', rim: '#ff8a4c' },
  'theme-ice': { ground: '#a08547', shadow: '#23323a', high: '#d2bb82', sky: '#081114', sun: '#ffe2b0', rim: '#4fd1c5' },
  'theme-exo': { ground: '#6e52a8', shadow: '#1d1533', high: '#9b80d6', sky: '#0a0716', sun: '#eadfff', rim: '#c084fc' },
};
const METAL = '#c9d2de';
const ACCENT = '#2dd4bf';

type Shot = { pos: [number, number, number]; look: [number, number, number] };

/** Camera shot per phase. Planet phases look at the globe; site phases at the base. */
const CAMERA: Record<WorldPhase, Shot> = {
  // Planet as a horizon along the bottom of the frame, so centered HUD cards never cover the hero shot.
  home: { pos: [0, 2.2, 5.4], look: [0, 4.4, -4] },
  lobby: { pos: [-1.6, 2.1, 5.2], look: [0.6, 4.2, -4] },
  // Base framed left of the centered briefing card.
  briefing: { pos: [5.6, 6.5, 12.5], look: [5.6, 0.4, 0] },
  build: { pos: [0, 15, 7], look: [0, 0, 0.5] },
  debrief: { pos: [7, 9, 15], look: [0, 0.4, 0] },
};
/** Where the camera starts when it drops from orbit to the landing site (briefing push-in). */
const ORBIT_START = new THREE.Vector3(0, 34, 30);
const MOVE_SECONDS = 2.2;
const PAD = 4.4; // half-size of the flat build pad (the HTML board sits over it in the build)

// ── Deterministic value noise (no dependencies) ─────────────────────────────────────────────────

function hash(x: number, y: number, z: number) {
  const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453;
  return s - Math.floor(s);
}
function noise3(x: number, y: number, z: number) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = (t: number) => t * t * (3 - 2 * t);
  let v = 0;
  for (let dx = 0; dx <= 1; dx++)
    for (let dy = 0; dy <= 1; dy++)
      for (let dz = 0; dz <= 1; dz++) {
        const w = (dx ? u(xf) : 1 - u(xf)) * (dy ? u(yf) : 1 - u(yf)) * (dz ? u(zf) : 1 - u(zf));
        v += w * hash(xi + dx, yi + dy, zi + dz);
      }
  return v;
}
const fbm = (x: number, y: number, z: number) => noise3(x, y, z) * 0.6 + noise3(x * 2.1, y * 2.1, z * 2.1) * 0.3 + noise3(x * 4.3, y * 4.3, z * 4.3) * 0.1;

/** Banded ground color: three flat tones from the palette, no gradients. */
function groundColor(n: number, p: Palette) {
  if (n > 0.62) return new THREE.Color(p.high);
  if (n > 0.4) return new THREE.Color(p.ground);
  return new THREE.Color(p.ground).lerp(new THREE.Color(p.shadow), 0.5);
}

/** One flat color per triangle (from its centroid), so bands have crisp faceted borders. */
function faceColors(geo: THREE.BufferGeometry, colorAt: (x: number, y: number, z: number) => THREE.Color) {
  const flat = geo.index ? geo.toNonIndexed() : geo;
  const pos = flat.attributes.position;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i += 3) {
    let x = 0, y = 0, z = 0;
    for (let k = 0; k < 3; k++) {
      x += pos.getX(i + k) / 3;
      y += pos.getY(i + k) / 3;
      z += pos.getZ(i + k) / 3;
    }
    const c = colorAt(x, y, z);
    for (let k = 0; k < 3; k++) colors.set([c.r, c.g, c.b], (i + k) * 3);
  }
  flat.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  flat.computeVertexNormals();
  return flat;
}

// ── Scene pieces ────────────────────────────────────────────────────────────────────────────────

function Planet({ palette, ramp }: { palette: Palette; ramp: THREE.Texture }) {
  const ref = useRef<THREE.Group>(null);
  const geometry = useMemo(() => {
    const geo = new THREE.IcosahedronGeometry(2.4, 4);
    const pos = geo.attributes.position;
    const v = new THREE.Vector3();
    const noise = (x: number, y: number, z: number) => fbm(x * 0.9 + 3, y * 0.9, z * 0.9);
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const n = noise(v.x, v.y, v.z);
      v.multiplyScalar(1 + (n - 0.5) * 0.12);
      pos.setXYZ(i, v.x, v.y, v.z);
    }
    return faceColors(geo, (x, y, z) => {
      const r = Math.hypot(x, y, z);
      return groundColor(noise((x / r) * 2.4, (y / r) * 2.4, (z / r) * 2.4), palette);
    });
  }, [palette]);
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * 0.05;
  });
  return (
    <group rotation={[0.25, 0, 0.1]}>
      <group ref={ref}>
        <mesh geometry={geometry}>
          <meshToonMaterial vertexColors gradientMap={ramp} />
        </mesh>
      </group>
      <Atmosphere color={palette.rim} radius={2.72} />
    </group>
  );
}

/** Back-face fresnel shell: the planet's glow in its rim color. Skips depth and the edge pass. */
function Atmosphere({ color, radius }: { color: string; radius: number }) {
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        uniforms: { color: { value: new THREE.Color(color) } },
        vertexShader: /* glsl */ `
          varying vec3 vNormal;
          varying vec3 vView;
          void main() {
            vec4 mv = modelViewMatrix * vec4(position, 1.0);
            vNormal = normalize(normalMatrix * normal);
            vView = normalize(-mv.xyz);
            gl_Position = projectionMatrix * mv;
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 color;
          varying vec3 vNormal;
          varying vec3 vView;
          void main() {
            // Back faces: brightest just outside the limb, fading to nothing at the shell's edge.
            float f = pow(smoothstep(0.0, 0.5, -dot(vNormal, vView)), 2.0) * 0.75;
            gl_FragColor = vec4(color * f, f);
          }
        `,
        side: THREE.BackSide,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    [color]
  );
  return (
    <mesh material={material} userData={{ noOutline: true }}>
      <sphereGeometry args={[radius, 48, 24]} />
    </mesh>
  );
}

/** Sparse stars, one low-res pixel each, slow twinkle. */
function Stars({ count, animate }: { count: number; animate: boolean }) {
  const { geometry, material } = useMemo(() => {
    const pos: number[] = [];
    const seed: number[] = [];
    for (let i = 0; i < count; i++) {
      const u = hash(i, 1, 2) * 2 - 1, t = hash(i, 3, 4) * Math.PI * 2, r = 70 + hash(i, 5, 6) * 30;
      const s = Math.sqrt(1 - u * u);
      pos.push(r * s * Math.cos(t), r * u, r * s * Math.sin(t));
      seed.push(hash(i, 7, 8));
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geo.setAttribute('seed', new THREE.Float32BufferAttribute(seed, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 } },
      vertexShader: /* glsl */ `
        attribute float seed;
        uniform float time;
        varying float vBright;
        void main() {
          vBright = 0.45 + 0.55 * (0.5 + 0.5 * sin(time * (0.6 + seed) + seed * 40.0)) * seed;
          gl_PointSize = seed > 0.92 ? 2.0 : 1.0;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        varying float vBright;
        void main() { gl_FragColor = vec4(vec3(vBright), 1.0); }
      `,
      depthWrite: false,
      fog: false,
    });
    return { geometry: geo, material: mat };
  }, [count]);
  useFrame(({ clock }) => {
    if (animate) material.uniforms.time.value = clock.elapsedTime;
  });
  return <points geometry={geometry} material={material} userData={{ noOutline: true }} frustumCulled={false} />;
}

/** Dark blob under anything standing on the ground. */
function Contact({ radius, color, y = 0.02 }: { radius: number; color: string; y?: number }) {
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, y, 0]} userData={{ noOutline: true }}>
      <circleGeometry args={[radius, 20]} />
      <meshBasicMaterial color={color} transparent opacity={0.35} depthWrite={false} />
    </mesh>
  );
}

const CRATERS: [number, number, number][] = [[14, -9, 4], [-16, 6, 6], [10, 18, 5], [-8, -20, 7], [-22, -8, 3.5]];

/** 0 on the level pad, rising to 1 a few units out. */
const padFalloff = (x: number, z: number) => THREE.MathUtils.smoothstep(Math.max(Math.abs(x), Math.abs(z)), PAD + 0.5, PAD + 5);
/** Rolling ground height (craters excluded). */
const heightAt = (x: number, z: number) => (fbm(x * 0.1 + 7, 0, z * 0.1) - 0.5) * 2.6 * padFalloff(x, z);

function Site({ palette, ramp, showBase }: { palette: Palette; ramp: THREE.Texture; showBase: boolean }) {
  const terrain = useMemo(() => {
    const geo = new THREE.PlaneGeometry(80, 80, 72, 72);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const craterAt = (x: number, z: number) => {
      // Craters with a raised rim, so they read as silhouettes through the edge pass.
      let c = 0;
      for (const [cx, cz, r] of CRATERS) {
        const t = Math.hypot(x - cx, z - cz) / r;
        if (t < 1) c += -(1 - t * t) * 1.6;
        else if (t < 1.4) c += Math.sin(((t - 1) / 0.4) * Math.PI) * 0.5;
      }
      return c;
    };
    const cell = 80 / 72;
    for (let i = 0; i < pos.count; i++) {
      // Jitter the grid so band borders read as hand-cut facets, not a sawtooth.
      const gx = pos.getX(i), gz = pos.getZ(i);
      const edge = Math.abs(gx) >= 39.9 || Math.abs(gz) >= 39.9;
      const x = edge ? gx : gx + (hash(gx, 1, gz) - 0.5) * cell * 0.7;
      const z = edge ? gz : gz + (hash(gx, 2, gz) - 0.5) * cell * 0.7;
      pos.setXYZ(i, x, heightAt(x, z) + craterAt(x, z) * padFalloff(x, z), z);
    }
    return faceColors(geo, (x, _y, z) => groundColor(fbm(x * 0.1 + 7, 0, z * 0.1) - Math.min(0, craterAt(x, z)) * 0.15, palette));
  }, [palette]);

  // Boulders scattered outside the pad: cheap shapes that give the edge pass something to draw.
  const rocks = useMemo(() => {
    const out: { p: [number, number, number]; s: number; r: number }[] = [];
    for (let i = 0; out.length < 26 && i < 200; i++) {
      const x = (hash(i, 11, 3) - 0.5) * 44, z = (hash(i, 13, 5) - 0.5) * 44;
      if (Math.max(Math.abs(x), Math.abs(z)) < PAD + 2.5) continue;
      out.push({ p: [x, 0, z], s: 0.25 + hash(i, 17, 7) ** 2 * 0.9, r: hash(i, 19, 9) * Math.PI });
    }
    return out;
  }, []);

  return (
    <group>
      <mesh geometry={terrain}>
        <meshToonMaterial vertexColors gradientMap={ramp} />
      </mesh>
      {/* Landing pad: a crisp slab, so it reads as built, not terrain. Hidden in the build: the tilted HTML board
          is the pad then, and a 3D slab behind it never lines up across screen sizes. */}
      <mesh position={[0, 0.06, 0]} visible={showBase}>
        <boxGeometry args={[PAD * 2, 0.24, PAD * 2]} />
        <meshToonMaterial color={new THREE.Color(palette.ground).lerp(new THREE.Color(palette.high), 0.3)} gradientMap={ramp} />
      </mesh>
      {rocks.map(({ p, s, r }, i) => (
        <mesh key={i} position={[p[0], heightAt(p[0], p[2]) + s * 0.35, p[2]]} rotation={[r, r * 2, 0]} scale={[s, s * 0.7, s]}>
          <dodecahedronGeometry args={[1, 0]} />
          <meshToonMaterial color={palette.high} gradientMap={ramp} />
        </mesh>
      ))}
      {/* Habitat at the pad center. Hidden during the build: the HTML board draws its own habitat. */}
      <group visible={showBase}>
        <Contact radius={1.6} color={palette.shadow} y={0.2} />
        <mesh position={[0, 0.53, 0]}>
          <boxGeometry args={[2, 0.7, 2]} />
          <meshToonMaterial color={METAL} gradientMap={ramp} />
        </mesh>
        <mesh position={[0, 0.88, 0]}>
          <sphereGeometry args={[0.7, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshToonMaterial color="#9fb0c4" gradientMap={ramp} />
        </mesh>
        {/* Airlock + antenna: chunky parts that survive the low-res buffer. */}
        <mesh position={[0, 0.43, 1.2]}>
          <boxGeometry args={[0.6, 0.5, 0.5]} />
          <meshToonMaterial color={METAL} gradientMap={ramp} />
        </mesh>
        <mesh position={[0.7, 1.33, -0.6]}>
          <boxGeometry args={[0.12, 0.9, 0.12]} />
          <meshToonMaterial color={METAL} gradientMap={ramp} />
        </mesh>
        <mesh position={[0, 1.73, 0]}>
          <sphereGeometry args={[0.13, 10, 6]} />
          <meshBasicMaterial color={ACCENT} />
        </mesh>
        <SolarArray position={[2.6, 0, -0.4]} ramp={ramp} shadow={palette.shadow} />
        <SolarArray position={[-2.6, 0, 0.4]} ramp={ramp} shadow={palette.shadow} />
      </group>
    </group>
  );
}

function SolarArray({ position, ramp, shadow }: { position: [number, number, number]; ramp: THREE.Texture; shadow: string }) {
  return (
    <group position={position}>
      <Contact radius={0.75} color={shadow} y={0.2} />
      <mesh position={[0, 0.48, 0]}>
        <boxGeometry args={[0.16, 0.6, 0.16]} />
        <meshToonMaterial color={METAL} gradientMap={ramp} />
      </mesh>
      <mesh position={[0, 0.88, 0]} rotation={[-0.6, 0, 0]}>
        <boxGeometry args={[1.4, 0.14, 1]} />
        <meshToonMaterial color="#3a6aa8" gradientMap={ramp} />
      </mesh>
    </group>
  );
}

// ── Camera ──────────────────────────────────────────────────────────────────────────────────────

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

/** Slow idle motion per phase, as an offset from the shot (docs/look.md → Camera). Build never drifts. */
function drift(phase: WorldPhase, t: number, pos: THREE.Vector3, look: THREE.Vector3) {
  if (phase === 'build') return;
  if (phase === 'debrief') {
    // Slow orbit around the base.
    const a = t * 0.05;
    const dx = pos.x - look.x, dz = pos.z - look.z;
    pos.x = look.x + dx * Math.cos(a) - dz * Math.sin(a);
    pos.z = look.z + dx * Math.sin(a) + dz * Math.cos(a);
    return;
  }
  pos.x += Math.sin(t * 0.21) * 0.35;
  pos.y += Math.sin(t * 0.33 + 1) * 0.25;
}

function CameraRig({ phase, reducedMotion }: { phase: WorldPhase; reducedMotion: boolean }) {
  const { camera, invalidate } = useThree();
  const move = useRef({
    from: new THREE.Vector3(...CAMERA[phase].pos),
    fromLook: new THREE.Vector3(...CAMERA[phase].look),
    start: -Infinity,
    phase,
    phaseStart: -1, // set on the first frame
  });
  const look = useRef(new THREE.Vector3(...CAMERA[phase].look));
  const tmp = useRef({ pos: new THREE.Vector3(), look: new THREE.Vector3() });

  useEffect(() => {
    const m = move.current;
    if (m.phase === phase) return;
    const fromPlanet = m.phase === 'home' || m.phase === 'lobby';
    const toPlanet = phase === 'home' || phase === 'lobby';
    // Start each move from where the camera is now (including drift), or from orbit when dropping to the site.
    m.from.copy(fromPlanet && !toPlanet ? ORBIT_START : camera.position);
    m.fromLook.copy(fromPlanet && !toPlanet ? new THREE.Vector3(...CAMERA[phase].look) : look.current);
    m.start = reducedMotion ? -Infinity : performance.now() / 1000;
    m.phase = phase;
    m.phaseStart = performance.now() / 1000;
    invalidate();
  }, [phase, reducedMotion, camera, invalidate]);

  useFrame(({ invalidate: redraw }) => {
    const m = move.current;
    const shot = CAMERA[phase];
    const now = performance.now() / 1000;
    if (m.phaseStart < 0) m.phaseStart = now;
    const k = ease(Math.min(1, (now - m.start) / MOVE_SECONDS));
    const { pos, look: target } = tmp.current;
    pos.set(...shot.pos);
    target.set(...shot.look);
    if (!reducedMotion) {
      drift(phase, now - m.phaseStart, pos, target);
    }
    camera.position.lerpVectors(m.from, pos, k);
    look.current.lerpVectors(m.fromLook, target, k);
    camera.lookAt(look.current);
    if (k < 1) redraw(); // keep frames coming through a move even when the canvas renders on demand
  });
  return null;
}

// ── Scene ───────────────────────────────────────────────────────────────────────────────────────

function Scene({ phase, theme, reducedMotion, styled, small }: { phase: WorldPhase; theme: string; reducedMotion: boolean; styled: boolean; small: boolean }) {
  const palette = PALETTES[theme] ?? PALETTES['theme-space'];
  const ramp = useToonRamp();
  const atSite = phase !== 'home' && phase !== 'lobby';
  return (
    <>
      <color attach="background" args={[palette.sky]} />
      <fog attach="fog" args={[palette.sky, atSite ? 20 : 30, atSite ? 52 : 80]} />
      <ambientLight color={palette.rim} intensity={0.35} />
      {/* Key light: high over the site; from the side in orbit so the planet shows a stepped terminator. */}
      <directionalLight position={atSite ? [8, 12, 6] : [10, 3, 1]} intensity={2.4} color={palette.sun} />
      <directionalLight position={[-6, 4, -10]} intensity={1.6} color={palette.rim} />
      <Stars count={small ? 500 : 1100} animate={!reducedMotion} />
      {atSite ? <Site palette={palette} ramp={ramp} showBase={phase !== 'build'} /> : <Planet palette={palette} ramp={ramp} />}
      <CameraRig phase={phase} reducedMotion={reducedMotion} />
      <StylePass enabled={styled} pixel={small ? 4 : 3} ink={palette.shadow} />
    </>
  );
}

function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas');
    return !!(c.getContext('webgl2') || c.getContext('webgl'));
  } catch {
    return false;
  }
}

class Fallback extends Component<{ children: ReactNode; onError: () => void }, { failed: boolean }> {
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

/** Styled ("pixel diorama") by default; `\` toggles raw 3D for debugging, as does ?look=raw. */
function useStyled() {
  const [styled, setStyled] = useState(() => new URLSearchParams(location.search).get('look') !== 'raw');
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '\\' || (e.target as HTMLElement)?.closest?.('input, textarea')) return;
      setStyled(s => !s);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  return styled;
}

export default function World({ phase, theme }: { phase: WorldPhase; theme: string }) {
  const [ok, setOk] = useState(webglAvailable);
  const reducedMotion = useMemo(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false, []);
  const small = useMemo(() => window.innerWidth < 1024, []);
  const styled = useStyled();

  return (
    <div className={`world ${theme}`} aria-hidden>
      {ok ? (
        <Fallback onError={() => setOk(false)}>
          <Canvas
            flat
            dpr={[1, 2]}
            // On demand while nothing moves: the whole build (static camera) and reduced motion.
            frameloop={reducedMotion || phase === 'build' ? 'demand' : 'always'}
            camera={{ fov: 40, near: 0.1, far: 200, position: CAMERA[phase].pos }}
            gl={{ antialias: false, powerPreference: 'low-power' }}
            onCreated={({ gl }) => {
              gl.domElement.addEventListener('webglcontextlost', e => {
                e.preventDefault();
                setOk(false);
              });
            }}
          >
            <Scene phase={phase} theme={theme} reducedMotion={reducedMotion} styled={styled} small={small} />
          </Canvas>
        </Fallback>
      ) : (
        <BaseScene />
      )}
    </div>
  );
}
