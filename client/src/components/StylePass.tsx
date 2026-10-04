// The "pixel diorama" post pass (docs/look.md → Post). Renders the scene into a low-res buffer, draws
// edges from depth + normals tinted toward the palette's shadow color, steps the tones, and upscales with
// exact integer nearest sampling. Objects with `userData.noOutline` (stars, glow) skip the normal pass.

import { useEffect, useMemo } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

const vertexShader = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = vec4(position.xy, 0.0, 1.0);
  }
`;

const fragmentShader = /* glsl */ `
  #include <packing>
  uniform sampler2D tColor;
  uniform sampler2D tDepth;
  uniform sampler2D tNormal;
  uniform vec2 lowRes;
  uniform float pixel;
  uniform float near;
  uniform float far;
  uniform bool ortho;
  uniform vec3 ink;
  uniform float levels;
  uniform float edge;

  float viewZ(vec2 uv) {
    float d = texture2D(tDepth, uv).r;
    return ortho ? -orthographicDepthToViewZ(d, near, far) : -perspectiveDepthToViewZ(d, near, far);
  }
  vec3 normalAt(vec2 uv) {
    return texture2D(tNormal, uv).rgb * 2.0 - 1.0;
  }

  void main() {
    // Integer nearest upscale: every low-res texel covers exactly pixel x pixel screen pixels.
    vec2 cell = floor(gl_FragCoord.xy / pixel);
    vec2 uv = (cell + 0.5) / lowRes;
    vec2 px = 1.0 / lowRes;

    vec4 color = texture2D(tColor, uv);
    float z = viewZ(uv);
    vec3 n = normalAt(uv);

    // Depth edge: this texel is in front of a neighbor by a relative margin (works at any distance).
    float dz = 0.0;
    dz += max(viewZ(uv + vec2(px.x, 0.0)) - z, 0.0);
    dz += max(viewZ(uv - vec2(px.x, 0.0)) - z, 0.0);
    dz += max(viewZ(uv + vec2(0.0, px.y)) - z, 0.0);
    dz += max(viewZ(uv - vec2(0.0, px.y)) - z, 0.0);
    float depthEdge = step(edge, dz / z);

    // Normal crease: only the nearer side of a sharp fold lights up.
    float crease = 0.0;
    vec2 offs[4];
    offs[0] = vec2(px.x, 0.0); offs[1] = vec2(-px.x, 0.0); offs[2] = vec2(0.0, px.y); offs[3] = vec2(0.0, -px.y);
    for (int i = 0; i < 4; i++) {
      vec3 nn = normalAt(uv + offs[i]);
      float nearer = step(-0.01 * z, viewZ(uv + offs[i]) - z);
      float bias = step(0.0, dot(n - nn, vec3(1.0)));
      crease += (1.0 - dot(n, nn)) * nearer * bias;
    }
    crease = step(0.15, crease);

    vec3 c = color.rgb;
    if (depthEdge > 0.0) c = mix(c * 0.45, ink, 0.35);   // tinted outline, never flat black
    else if (crease > 0.0) c = c * 1.3 + 0.02;           // light crease highlight

    gl_FragColor = vec4(c, color.a); // alpha kept, so a canvas without a sky stays see-through
    #include <colorspace_fragment>
    // Step the tones in display space so fog and glow band instead of smoothing.
    gl_FragColor.rgb = floor(gl_FragColor.rgb * levels + 0.5) / levels;
  }
`;

/** `edge`: relative depth jump that draws an outline. Big scenes want ~0.08; a small diorama seen from far away needs less. */
export default function StylePass({ enabled, pixel, ink, edge = 0.08 }: { enabled: boolean; pixel: number; ink: string; edge?: number }) {
  const { gl, size, viewport, invalidate } = useThree();

  useEffect(() => invalidate(), [enabled, invalidate]);

  const res = useMemo(() => {
    const target = (depth: boolean) => {
      const t = new THREE.WebGLRenderTarget(1, 1, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter, type: THREE.HalfFloatType });
      if (depth) t.depthTexture = new THREE.DepthTexture(1, 1);
      return t;
    };
    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        tColor: { value: null },
        tDepth: { value: null },
        tNormal: { value: null },
        lowRes: { value: new THREE.Vector2(1, 1) },
        pixel: { value: 3 },
        near: { value: 0.1 },
        far: { value: 200 },
        ortho: { value: false },
        ink: { value: new THREE.Color() },
        levels: { value: 20 },
        edge: { value: 0.08 },
      },
      depthTest: false,
      depthWrite: false,
    });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    quad.frustumCulled = false;
    const quadScene = new THREE.Scene();
    quadScene.add(quad);
    return {
      beauty: target(true),
      normals: target(true),
      normalMaterial: new THREE.MeshNormalMaterial(),
      material,
      quadScene,
      quadCamera: new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1),
      hidden: [] as THREE.Object3D[],
    };
  }, []);

  useEffect(
    () => () => {
      res.beauty.dispose();
      res.normals.dispose();
      res.normalMaterial.dispose();
      res.material.dispose();
    },
    [res]
  );

  // Low-res buffer size: whole device pixels per texel so the upscale is exact.
  const devicePixel = Math.max(1, Math.round(pixel * viewport.dpr));
  useEffect(() => {
    const w = Math.ceil((size.width * viewport.dpr) / devicePixel);
    const h = Math.ceil((size.height * viewport.dpr) / devicePixel);
    res.beauty.setSize(w, h);
    res.normals.setSize(w, h);
    res.material.uniforms.lowRes.value.set(w, h);
    res.material.uniforms.pixel.value = devicePixel;
  }, [res, size, viewport.dpr, devicePixel]);

  useEffect(() => {
    res.material.uniforms.ink.value.set(ink);
    res.material.uniforms.edge.value = edge;
  }, [res, ink, edge]);

  // Priority 1: we own rendering for this canvas.
  useFrame(({ scene, camera }) => {
    if (!enabled) {
      gl.setRenderTarget(null);
      gl.render(scene, camera);
      return;
    }
    const cam = camera as THREE.PerspectiveCamera | THREE.OrthographicCamera;
    const u = res.material.uniforms;
    u.near.value = cam.near;
    u.far.value = cam.far;
    u.ortho.value = (cam as THREE.OrthographicCamera).isOrthographicCamera === true;

    const clearColor = gl.getClearColor(new THREE.Color());
    const clearAlpha = gl.getClearAlpha();
    gl.setRenderTarget(res.beauty);
    gl.render(scene, camera);

    // Normal pass: solids only, no sky.
    const background = scene.background;
    scene.background = null;
    res.hidden.length = 0;
    scene.traverse(o => {
      if (o.userData.noOutline && o.visible) {
        o.visible = false;
        res.hidden.push(o);
      }
    });
    scene.overrideMaterial = res.normalMaterial;
    gl.setRenderTarget(res.normals);
    gl.setClearColor(0x7f7fff, 1);
    gl.clear();
    gl.render(scene, camera);
    scene.overrideMaterial = null;
    for (const o of res.hidden) o.visible = true;
    scene.background = background;
    gl.setClearColor(clearColor, clearAlpha);

    u.tColor.value = res.beauty.texture;
    u.tDepth.value = res.beauty.depthTexture;
    u.tNormal.value = res.normals.texture;
    gl.setRenderTarget(null);
    gl.render(res.quadScene, res.quadCamera);
  }, 1);

  return null;
}
