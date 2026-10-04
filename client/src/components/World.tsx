// The persistent 3D world behind every screen (docs/design.md → Stack). Mounted once in App; only the
// camera target and which group is visible change between phases. Decorative only: no pointer events.

import { Component, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Stars } from '@react-three/drei';
import * as THREE from 'three';
import BaseScene from './BaseScene';

export type WorldPhase = 'home' | 'lobby' | 'briefing' | 'build' | 'debrief';

const PALETTES: Record<string, { g1: string; g2: string; hi: string; fog: string; light: string }> = {
  'theme-space': { g1: '#6b7a99', g2: '#2c3447', hi: '#9aa8c4', fog: '#06090f', light: '#e8eeff' },
  'theme-airless': { g1: '#7c7f88', g2: '#34363c', hi: '#a3a7b1', fog: '#07080b', light: '#f4f4f0' },
  'theme-dust': { g1: '#b45f3a', g2: '#4a2012', hi: '#d98a5f', fog: '#1a0b07', light: '#ffd9b8' },
  'theme-ice': { g1: '#a08547', g2: '#2b3a40', hi: '#c9b27a', fog: '#0a1114', light: '#ffe2b0' },
  'theme-exo': { g1: '#6e52a8', g2: '#211838', hi: '#8f74c8', fog: '#0a0716', light: '#e6dcff' },
};

/** Camera position + look-at per phase. Planet phases look at the globe; site phases at the base. */
const CAMERA: Record<WorldPhase, { pos: [number, number, number]; look: [number, number, number] }> = {
  home: { pos: [0, 0.6, 8.5], look: [0, 0, 0] },
  lobby: { pos: [2.8, 0.9, 7.2], look: [-1.2, 0, 0] },
  briefing: { pos: [0, 9, 15], look: [0, 0, 0] },
  build: { pos: [0, 15, 7], look: [0, 0, 0.5] },
  debrief: { pos: [7, 11, 17], look: [0, 0, 0] },
};
/** Where the camera starts when it drops from orbit to the site (briefing push-in). */
const ORBIT_START = new THREE.Vector3(0, 34, 30);

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

// ── Scene pieces ────────────────────────────────────────────────────────────────────────────────

function Planet({ palette }: { palette: (typeof PALETTES)[string] }) {
  const ref = useRef<THREE.Mesh>(null);
  const geometry = useMemo(() => {
    const geo = new THREE.IcosahedronGeometry(2.4, 5);
    const pos = geo.attributes.position;
    const colors: number[] = [];
    const c1 = new THREE.Color(palette.g1), c2 = new THREE.Color(palette.g2), c3 = new THREE.Color(palette.hi);
    const v = new THREE.Vector3();
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i);
      const n = fbm(v.x * 0.9 + 3, v.y * 0.9, v.z * 0.9);
      v.multiplyScalar(1 + (n - 0.5) * 0.08);
      pos.setXYZ(i, v.x, v.y, v.z);
      const c = n > 0.62 ? c3 : c1.clone().lerp(c2, Math.min(1, Math.max(0, (0.6 - n) * 2.2)));
      colors.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    return geo;
  }, [palette]);
  useFrame((_, dt) => {
    if (ref.current) ref.current.rotation.y += dt * 0.05;
  });
  return (
    <mesh ref={ref} geometry={geometry} rotation={[0.25, 0, 0.1]}>
      <meshStandardMaterial vertexColors flatShading roughness={0.95} />
    </mesh>
  );
}

const PAD = 4.4; // half-size of the flat build pad (the HTML board sits over it in the build)

function Site({ palette, showBase }: { palette: (typeof PALETTES)[string]; showBase: boolean }) {
  const terrain = useMemo(() => {
    const geo = new THREE.PlaneGeometry(80, 80, 120, 120);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors: number[] = [];
    const c1 = new THREE.Color(palette.g1), c2 = new THREE.Color(palette.g2), c3 = new THREE.Color(palette.hi);
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const d = Math.max(Math.abs(x), Math.abs(z));
      const flat = THREE.MathUtils.smoothstep(d, PAD, PAD + 4); // pad stays level
      const n = fbm(x * 0.12 + 7, 0, z * 0.12);
      // A few craters for texture away from the pad.
      const crater = Math.min(
        ...[[14, -9, 4], [-16, 6, 6], [10, 18, 5], [-8, -20, 7]].map(([cx, cz, r]) => {
          const dist = Math.hypot(x - cx, z - cz) / r;
          return dist < 1 ? -(1 - dist * dist) * 1.2 : 0;
        })
      );
      pos.setY(i, ((n - 0.5) * 3 + crater) * flat);
      const c = n > 0.66 ? c3 : c1.clone().lerp(c2, Math.min(1, Math.max(0, (0.62 - n) * 2)));
      colors.push(c.r, c.g, c.b);
    }
    geo.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    return geo;
  }, [palette]);

  return (
    <group>
      <mesh geometry={terrain} receiveShadow>
        <meshStandardMaterial vertexColors flatShading roughness={1} />
      </mesh>
      {/* Habitat at the pad center. Hidden during the build: the HTML board draws its own habitat. */}
      <group position={[0, 0.35, 0]} visible={showBase}>
        <mesh castShadow>
          <boxGeometry args={[2, 0.7, 2]} />
          <meshStandardMaterial color="#c9d2de" metalness={0.4} roughness={0.5} />
        </mesh>
        <mesh position={[0, 0.45, 0]} castShadow>
          <sphereGeometry args={[0.7, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color="#9fb0c4" metalness={0.5} roughness={0.35} />
        </mesh>
        <mesh position={[0, 0.95, 0]}>
          <sphereGeometry args={[0.12, 12, 8]} />
          <meshStandardMaterial color="#2dd4bf" emissive="#2dd4bf" emissiveIntensity={1.4} />
        </mesh>
      </group>
    </group>
  );
}

function CameraRig({ phase, reducedMotion }: { phase: WorldPhase; reducedMotion: boolean }) {
  const { camera, invalidate } = useThree();
  const look = useRef(new THREE.Vector3(...CAMERA[phase].look));
  const last = useRef<WorldPhase>(phase);

  useEffect(() => {
    const target = CAMERA[phase];
    const enteringSite = (last.current === 'home' || last.current === 'lobby') && phase !== 'home' && phase !== 'lobby';
    if (reducedMotion) {
      camera.position.set(...target.pos);
      look.current.set(...target.look);
    } else if (enteringSite) {
      camera.position.copy(ORBIT_START); // drop from orbit to the landing site
    }
    last.current = phase;
    invalidate();
  }, [phase, reducedMotion, camera, invalidate]);

  useFrame((_, dt) => {
    const target = CAMERA[phase];
    const k = reducedMotion ? 1 : 1 - Math.exp(-dt * 1.6);
    camera.position.lerp(new THREE.Vector3(...target.pos), k);
    look.current.lerp(new THREE.Vector3(...target.look), k);
    camera.lookAt(look.current);
  });
  return null;
}

function Scene({ phase, theme, reducedMotion }: { phase: WorldPhase; theme: string; reducedMotion: boolean }) {
  const palette = PALETTES[theme] ?? PALETTES['theme-space'];
  const atSite = phase !== 'home' && phase !== 'lobby';
  return (
    <>
      <color attach="background" args={[palette.fog]} />
      <fog attach="fog" args={[palette.fog, atSite ? 22 : 30, atSite ? 60 : 80]} />
      <ambientLight intensity={0.55} />
      <directionalLight position={[8, 12, 6]} intensity={2.2} color={palette.light} />
      <Stars radius={90} depth={40} count={2500} factor={3} fade speed={reducedMotion ? 0 : 0.3} />
      {atSite ? <Site palette={palette} showBase={phase !== 'build'} /> : <Planet palette={palette} />}
      <CameraRig phase={phase} reducedMotion={reducedMotion} />
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

export default function World({ phase, theme }: { phase: WorldPhase; theme: string }) {
  const [ok, setOk] = useState(webglAvailable);
  const reducedMotion = useMemo(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false, []);

  return (
    <div className={`world ${theme}`} aria-hidden>
      {ok ? (
        <Fallback onError={() => setOk(false)}>
          <Canvas
            dpr={[1, 1.5]}
            camera={{ fov: 40, near: 0.1, far: 200, position: CAMERA[phase].pos }}
            gl={{ antialias: true, powerPreference: 'low-power' }}
            onCreated={({ gl }) => {
              gl.domElement.addEventListener('webglcontextlost', e => {
                e.preventDefault();
                setOk(false);
              });
            }}
          >
            <Scene phase={phase} theme={theme} reducedMotion={reducedMotion} />
          </Canvas>
        </Fallback>
      ) : (
        <BaseScene />
      )}
    </div>
  );
}
