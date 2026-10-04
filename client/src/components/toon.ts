import { useMemo } from 'react';
import * as THREE from 'three';

/** The one shading ramp every 3D object uses (world and board): 4 flat light steps (docs/look.md). */
export function useToonRamp() {
  return useMemo(() => {
    const steps = new Uint8Array([80, 140, 205, 255]);
    const tex = new THREE.DataTexture(steps, steps.length, 1, THREE.RedFormat);
    tex.minFilter = tex.magFilter = THREE.NearestFilter;
    tex.needsUpdate = true;
    return tex;
  }, []);
}
