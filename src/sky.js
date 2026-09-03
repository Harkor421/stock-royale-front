// ============================================================================
// sky.js — a gradient sky dome with a sun disc, drawn in a shader on the inside
// of a big sphere. Cheaper and far better looking than a flat clear color, and
// atmosphere.js drives its three colors from the armies' aggregate pressure, so
// the whole sky darkens when the market is dumping.
// ============================================================================

import * as THREE from 'three'

const VERT = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`

const FRAG = /* glsl */ `
  precision highp float;
  uniform vec3 uZenith;
  uniform vec3 uHorizon;
  uniform vec3 uSun;
  uniform vec3 uSunDir;
  uniform float uSunI;
  varying vec3 vWorld;

  void main() {
    vec3 dir = normalize(vWorld);
    float h = clamp(dir.y * 1.15 + 0.06, -1.0, 1.0);
    // a soft, slightly compressed gradient so the horizon band stays wide
    float t = pow(clamp(h, 0.0, 1.0), 0.62);
    vec3 col = mix(uHorizon, uZenith, t);
    // below the horizon fades to a dark haze so the ground disc has something
    // to sit against when the camera drops low
    col = mix(col * 0.42, col, smoothstep(-0.25, 0.02, h));

    float d = max(dot(dir, normalize(uSunDir)), 0.0);
    col += uSun * pow(d, 220.0) * 2.6 * uSunI;        // the disc
    col += uSun * pow(d, 6.0) * 0.16 * uSunI;         // the glow around it
    gl_FragColor = vec4(col, 1.0);
  }
`

export function createSky(scene) {
  const geo = new THREE.SphereGeometry(600, 32, 20)
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uZenith: { value: new THREE.Color(0x18243b) },
      uHorizon: { value: new THREE.Color(0x40364a) },
      uSun: { value: new THREE.Color(0xffe6c4) },
      uSunDir: { value: new THREE.Vector3(0.45, 0.42, -0.78).normalize() },
      uSunI: { value: 1 },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    toneMapped: false,
  })
  const mesh = new THREE.Mesh(geo, mat)
  mesh.frustumCulled = false
  mesh.renderOrder = -1
  scene.add(mesh)

  return {
    uniforms: mat.uniforms,
    dispose() {
      scene.remove(mesh)
      geo.dispose()
      mat.dispose()
    },
  }
}
