// Low-poly 3D piece models for the board (docs/look.md → Silhouettes). Authored in cell units: 1 = one tile,
// y up, standing on y = 0, footprint inside ~0.85. Colors follow the palette icons (PieceIcon) so a piece looks
// the same in the palette and on the board. Chunky parts only: anything thinner than ~0.06 vanishes in the pixel pass.

import type { ReactNode } from 'react';
import type { PieceKind } from '@mission-control/shared';
import type * as THREE from 'three';

type M = { ramp: THREE.Texture };

function Toon({ color, ramp }: { color: string } & M) {
  return <meshToonMaterial color={color} gradientMap={ramp} />;
}
function Glow({ color }: { color: string }) {
  return <meshBasicMaterial color={color} toneMapped={false} />;
}

const MODELS: Record<PieceKind, (p: M) => ReactNode> = {
  solar: ({ ramp }) => (
    <>
      <mesh position={[0, 0.04, 0]}>
        <boxGeometry args={[0.5, 0.08, 0.5]} />
        <Toon color="#5b6472" ramp={ramp} />
      </mesh>
      <mesh position={[0, 0.26, 0]}>
        <boxGeometry args={[0.1, 0.4, 0.1]} />
        <Toon color="#94a3b8" ramp={ramp} />
      </mesh>
      <group position={[0, 0.5, 0]} rotation={[-0.5, 0, 0]}>
        <mesh>
          <boxGeometry args={[0.94, 0.08, 0.76]} />
          <Toon color="#2f5fc4" ramp={ramp} />
        </mesh>
        {/* Cell seams as raised strips so they survive the pixel pass. */}
        {[-0.21, 0, 0.21].map(x => (
          <mesh key={x} position={[x, 0.04, 0]}>
            <boxGeometry args={[0.03, 0.02, 0.74]} />
            <Toon color="#93c5fd" ramp={ramp} />
          </mesh>
        ))}
      </group>
    </>
  ),
  battery: ({ ramp }) => (
    <>
      <mesh position={[0, 0.3, 0]}>
        <boxGeometry args={[0.46, 0.6, 0.46]} />
        <Toon color="#334155" ramp={ramp} />
      </mesh>
      <mesh position={[0, 0.62, 0]}>
        <boxGeometry args={[0.5, 0.06, 0.5]} />
        <Toon color="#94a3b8" ramp={ramp} />
      </mesh>
      <mesh position={[0, 0.36, 0.235]}>
        <boxGeometry args={[0.14, 0.26, 0.02]} />
        <Glow color="#facc15" />
      </mesh>
      {[-0.11, 0.11].map(x => (
        <mesh key={x} position={[x, 0.7, 0]}>
          <boxGeometry args={[0.08, 0.08, 0.08]} />
          <Toon color="#cbd5e1" ramp={ramp} />
        </mesh>
      ))}
    </>
  ),
  reactor: ({ ramp }) => (
    <>
      <mesh position={[0, 0.24, 0]}>
        <cylinderGeometry args={[0.4, 0.42, 0.48, 6]} />
        <Toon color="#ca8a04" ramp={ramp} />
      </mesh>
      <mesh position={[0, 0.5, 0]}>
        <cylinderGeometry args={[0.3, 0.38, 0.08, 6]} />
        <Toon color="#fde68a" ramp={ramp} />
      </mesh>
      <mesh position={[0, 0.56, 0]}>
        <cylinderGeometry args={[0.16, 0.16, 0.06, 6]} />
        <Toon color="#1c1917" ramp={ramp} />
      </mesh>
      <mesh position={[0, 0.6, 0]}>
        <sphereGeometry args={[0.09, 8, 6]} />
        <Glow color="#fbbf24" />
      </mesh>
    </>
  ),
  water_tank: ({ ramp }) => (
    <>
      <mesh position={[0, 0.3, 0]}>
        <cylinderGeometry args={[0.32, 0.32, 0.56, 12]} />
        <Toon color="#0284c7" ramp={ramp} />
      </mesh>
      <mesh position={[0, 0.6, 0]}>
        <cylinderGeometry args={[0.24, 0.32, 0.08, 12]} />
        <Toon color="#7dd3fc" ramp={ramp} />
      </mesh>
      <mesh position={[0, 0.3, 0]}>
        <cylinderGeometry args={[0.335, 0.335, 0.06, 12]} />
        <Toon color="#0c4a6e" ramp={ramp} />
      </mesh>
    </>
  ),
  o2_tank: ({ ramp }) => (
    <>
      {[-0.13, 0.13].map(x => (
        <group key={x} position={[x, 0, 0]}>
          <mesh position={[0, 0.34, 0]}>
            <cylinderGeometry args={[0.13, 0.13, 0.62, 10]} />
            <Toon color="#cbd5e1" ramp={ramp} />
          </mesh>
          <mesh position={[0, 0.68, 0]}>
            <sphereGeometry args={[0.13, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2]} />
            <Toon color="#e2e8f0" ramp={ramp} />
          </mesh>
          <mesh position={[0, 0.82, 0]}>
            <boxGeometry args={[0.07, 0.08, 0.07]} />
            <Toon color="#64748b" ramp={ramp} />
          </mesh>
        </group>
      ))}
      <mesh position={[0, 0.38, 0]}>
        <boxGeometry args={[0.5, 0.06, 0.3]} />
        <Toon color="#475569" ramp={ramp} />
      </mesh>
    </>
  ),
  ice_drill: ({ ramp }) => (
    <>
      <mesh position={[0, 0.03, 0]}>
        <cylinderGeometry args={[0.36, 0.38, 0.06, 8]} />
        <Toon color="#7dd3fc" ramp={ramp} />
      </mesh>
      {/* Derrick: three legs to a head block, with the bit going down the middle. */}
      {[0, (Math.PI * 2) / 3, (Math.PI * 4) / 3].map(a => (
        <mesh key={a} position={[Math.sin(a) * 0.16, 0.42, Math.cos(a) * 0.16]} rotation={[Math.cos(a) * 0.38, 0, -Math.sin(a) * 0.38]}>
          <boxGeometry args={[0.06, 0.82, 0.06]} />
          <Toon color="#94a3b8" ramp={ramp} />
        </mesh>
      ))}
      <mesh position={[0, 0.84, 0]}>
        <boxGeometry args={[0.24, 0.16, 0.24]} />
        <Toon color="#e2e8f0" ramp={ramp} />
      </mesh>
      <mesh position={[0, 0.36, 0]}>
        <cylinderGeometry args={[0.05, 0.05, 0.6, 6]} />
        <Toon color="#cbd5e1" ramp={ramp} />
      </mesh>
    </>
  ),
  o2_unit: ({ ramp }) => (
    <>
      <mesh position={[0, 0.18, 0]}>
        <boxGeometry args={[0.66, 0.36, 0.5]} />
        <Toon color="#0f766e" ramp={ramp} />
      </mesh>
      <mesh position={[0, 0.39, 0]}>
        <boxGeometry args={[0.7, 0.06, 0.54]} />
        <Toon color="#14b8a6" ramp={ramp} />
      </mesh>
      {[-0.17, 0.17].map(x => (
        <mesh key={x} position={[x, 0.52, 0]}>
          <cylinderGeometry args={[0.09, 0.11, 0.2, 8]} />
          <Toon color="#99f6e4" ramp={ramp} />
        </mesh>
      ))}
    </>
  ),
  berm: ({ ramp }) => (
    <>
      {/* A long faceted mound of regolith. */}
      <mesh position={[0, 0.17, 0]} scale={[1, 0.62, 0.7]}>
        <dodecahedronGeometry args={[0.42, 0]} />
        <Toon color="#d6a35c" ramp={ramp} />
      </mesh>
      <mesh position={[0.22, 0.1, 0.1]} scale={[0.6, 0.45, 0.6]}>
        <dodecahedronGeometry args={[0.3, 0]} />
        <Toon color="#b8853f" ramp={ramp} />
      </mesh>
    </>
  ),
  thermal_unit: ({ ramp }) => (
    <>
      <mesh position={[-0.12, 0.22, 0]}>
        <boxGeometry args={[0.4, 0.44, 0.44]} />
        <Toon color="#64748b" ramp={ramp} />
      </mesh>
      {/* Radiator fins */}
      {[-0.26, -0.12, 0.02].map(x => (
        <mesh key={x} position={[x, 0.5, 0]}>
          <boxGeometry args={[0.05, 0.2, 0.5]} />
          <Toon color="#cbd5e1" ramp={ramp} />
        </mesh>
      ))}
      <mesh position={[0.24, 0.14, 0.04]}>
        <cylinderGeometry args={[0.15, 0.17, 0.28, 10]} />
        <Toon color="#c2410c" ramp={ramp} />
      </mesh>
      <mesh position={[0.24, 0.3, 0.04]}>
        <sphereGeometry args={[0.15, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2]} />
        <Glow color="#fb923c" />
      </mesh>
    </>
  ),
};

export default function PieceModel({ kind, ramp }: { kind: PieceKind; ramp: THREE.Texture }) {
  return <>{MODELS[kind]({ ramp })}</>;
}
