// ============================================================================
// effects.js — GPU side of the particle systems. Owns no physics: it wraps the
// SoA arrays from state.js directly as dynamic BufferAttributes and just uploads
// them each frame (simulator.js integrates position/size/color/life). Dead
// particles carry size 0 so the point shader discards them — no compaction.
//
//  - fire:   additive Points (explosions, muzzle, embers, clash sparks)
//  - dust:   normal-blend Points (dust, smoke, confetti)
//  - tracers: additive LineSegments (shell tracers)
//  - shock:  pooled expanding rings (whale shockwaves)
// ============================================================================

import * as THREE from 'three'
import { CAPS, COLORS } from './config.js'

const POINT_VERT = /* glsl */ `
  attribute float aSize;
  attribute vec3 aColor;
  varying vec3 vColor;
  varying float vSeed;
  void main() {
    vColor = aColor;
    // a stable per-particle seed straight out of its slot position
    vSeed = fract(sin(dot(position.xz, vec2(12.9898, 78.233))) * 43758.5453);
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * (420.0 / max(1.0, -mv.z));
    gl_Position = projectionMatrix * mv;
  }
`
// Fire: a white-hot core with a wide falloff glow. A flat disc reads as a
// sticker; the core is what makes a spark look like it is emitting light.
const FIRE_FRAG = /* glsl */ `
  precision mediump float;
  uniform float uOpacity;
  varying vec3 vColor;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    if (d > 1.0) discard;
    float k = 1.0 - d;
    float core = pow(k, 4.0);
    float glow = pow(k, 1.3) * 0.42;
    gl_FragColor = vec4(vColor * (1.0 + core * 1.8), (core + glow) * uOpacity);
  }
`

// Smoke/dust: soft-edged and slightly broken up, so a plume looks like volume
// instead of a stack of identical circles.
const DUST_FRAG = /* glsl */ `
  precision mediump float;
  uniform float uOpacity;
  varying vec3 vColor;
  varying float vSeed;
  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv) * 2.0;
    if (d > 1.0) discard;
    float ang = atan(uv.y, uv.x);
    // a lobed edge, different per particle, so plumes don't tile
    float wob = 0.86 + 0.14 * sin(ang * 3.0 + vSeed * 6.283) * sin(ang * 5.0 - vSeed * 3.1);
    float a = smoothstep(1.0, 0.05, d / wob);
    gl_FragColor = vec4(vColor, a * a * uOpacity);
  }
`

function pointsSystem(pool, count, blending, opacity, frag) {
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pool.pos, 3).setUsage(THREE.DynamicDrawUsage))
  geo.setAttribute('aColor', new THREE.BufferAttribute(pool.color, 3).setUsage(THREE.DynamicDrawUsage))
  geo.setAttribute('aSize', new THREE.BufferAttribute(pool.size, 1).setUsage(THREE.DynamicDrawUsage))
  geo.setDrawRange(0, count)
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 500)
  const mat = new THREE.ShaderMaterial({
    uniforms: { uOpacity: { value: opacity } },
    vertexShader: POINT_VERT,
    fragmentShader: frag,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending,
  })
  const pts = new THREE.Points(geo, mat)
  pts.frustumCulled = false
  return { pts, geo, mat }
}

export function createEffects(scene, state, assets) {
  const fire = pointsSystem(state.fire, CAPS.FIRE, THREE.AdditiveBlending, 1.0, FIRE_FRAG)
  const dust = pointsSystem(state.dust, CAPS.DUST, THREE.NormalBlending, 0.78, DUST_FRAG)
  scene.add(fire.pts, dust.pts)

  // tracers
  const traGeo = new THREE.BufferGeometry()
  const traPos = new Float32Array(CAPS.TRACERS * 2 * 3)
  // the tail end is dark and the head is white-hot, so a round in flight reads
  // as a direction rather than a glowing stick
  const traCol = new Float32Array(CAPS.TRACERS * 2 * 3)
  traGeo.setAttribute('position', new THREE.BufferAttribute(traPos, 3).setUsage(THREE.DynamicDrawUsage))
  traGeo.setAttribute('color', new THREE.BufferAttribute(traCol, 3).setUsage(THREE.DynamicDrawUsage))
  traGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 500)
  const traMat = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  })
  const TRACER_TAIL = new THREE.Color(COLORS.tracer).multiplyScalar(0.12)
  const TRACER_HEAD = new THREE.Color(0xfff6d8)
  const tracers = new THREE.LineSegments(traGeo, traMat)
  tracers.frustumCulled = false
  scene.add(tracers)

  // debris: one instanced mesh of tumbling chunks, lit and shadow-casting like
  // the rest of the field so a blast throws real geometry, not just light
  const _o = new THREE.Object3D()
  const debris = new THREE.InstancedMesh(assets.geos.debris, assets.material, CAPS.DEBRIS)
  debris.frustumCulled = false
  debris.count = 0
  debris.castShadow = true
  debris.receiveShadow = true
  scene.add(debris)

  // shockwave ring pool (individual meshes so each can fade independently)
  const ringGeo = new THREE.RingGeometry(0.9, 1.0, 32).rotateX(-Math.PI / 2)
  const rings = []
  for (let i = 0; i < CAPS.SHOCKWAVES; i++) {
    const mat = new THREE.MeshBasicMaterial({
      color: COLORS.ember,
      transparent: true,
      opacity: 0,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    })
    const m = new THREE.Mesh(ringGeo, mat)
    m.visible = false
    m.frustumCulled = false
    scene.add(m)
    rings.push(m)
  }

  function sync(state) {
    fire.geo.attributes.position.needsUpdate = true
    fire.geo.attributes.aColor.needsUpdate = true
    fire.geo.attributes.aSize.needsUpdate = true
    dust.geo.attributes.position.needsUpdate = true
    dust.geo.attributes.aColor.needsUpdate = true
    dust.geo.attributes.aSize.needsUpdate = true

    // tracers: short bright streak from head backwards toward source
    const t = state.tracers
    let k = 0
    for (let i = 0; i < t.x0.length; i++) {
      if (!t.active[i]) continue
      const hx = t.hx[i]
      const hy = t.hy[i]
      const hz = t.hz[i]
      // streak tail: 30% back toward origin — a longer trail at this arena scale
      const bx = hx + (t.x0[i] - hx) * 0.3
      const by = hy + (t.y0[i] - hy) * 0.3
      const bz = hz + (t.z0[i] - hz) * 0.3
      const o = k * 6
      traPos[o] = bx
      traPos[o + 1] = by
      traPos[o + 2] = bz
      traPos[o + 3] = hx
      traPos[o + 4] = hy
      traPos[o + 5] = hz
      traCol[o] = TRACER_TAIL.r; traCol[o + 1] = TRACER_TAIL.g; traCol[o + 2] = TRACER_TAIL.b
      traCol[o + 3] = TRACER_HEAD.r; traCol[o + 4] = TRACER_HEAD.g; traCol[o + 5] = TRACER_HEAD.b
      k++
    }
    traGeo.setDrawRange(0, k * 2)
    traGeo.attributes.position.needsUpdate = true
    traGeo.attributes.color.needsUpdate = true

    // debris
    const db = state.debris
    let di = 0
    for (let i = 0; i < db.size.length; i++) {
      if (!db.active[i]) continue
      const o = i * 3
      _o.position.set(db.pos[o], db.pos[o + 1], db.pos[o + 2])
      _o.rotation.set(db.rot[o], db.rot[o + 1], db.rot[o + 2])
      // shrink away in the last fifth of its life instead of vanishing
      const t = db.life[i] / db.maxlife[i]
      _o.scale.setScalar(db.size[i] * Math.min(1, t * 5))
      _o.updateMatrix()
      debris.setMatrixAt(di, _o.matrix)
      di++
    }
    debris.count = di
    debris.instanceMatrix.needsUpdate = true

    // shockwaves
    const sh = state.shock
    let ri = 0
    for (let i = 0; i < sh.x.length && ri < rings.length; i++) {
      if (!sh.active[i]) continue
      const m = rings[ri++]
      m.visible = true
      m.position.set(sh.x[i], sh.y[i], sh.z[i])
      m.scale.setScalar(sh.r[i])
      m.material.opacity = Math.max(0, sh.life[i] / sh.maxlife[i]) * 0.32
    }
    for (let i = ri; i < rings.length; i++) rings[i].visible = false
  }

  return {
    sync,
    dispose() {
      scene.remove(fire.pts, dust.pts, tracers, debris)
      debris.dispose()
      fire.geo.dispose()
      fire.mat.dispose()
      dust.geo.dispose()
      dust.mat.dispose()
      traGeo.dispose()
      traMat.dispose()
      ringGeo.dispose()
      for (const m of rings) {
        scene.remove(m)
        m.material.dispose()
      }
    },
  }
}
