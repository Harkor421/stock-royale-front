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
  void main() {
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * (420.0 / max(1.0, -mv.z));
    gl_Position = projectionMatrix * mv;
  }
`
const POINT_FRAG = /* glsl */ `
  precision mediump float;
  uniform float uOpacity;
  varying vec3 vColor;
  void main() {
    vec2 uv = gl_PointCoord - 0.5;
    float a = smoothstep(0.5, 0.0, length(uv));
    if (a <= 0.001) discard;
    gl_FragColor = vec4(vColor, a * uOpacity);
  }
`

function pointsSystem(pool, count, blending, opacity) {
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pool.pos, 3).setUsage(THREE.DynamicDrawUsage))
  geo.setAttribute('aColor', new THREE.BufferAttribute(pool.color, 3).setUsage(THREE.DynamicDrawUsage))
  geo.setAttribute('aSize', new THREE.BufferAttribute(pool.size, 1).setUsage(THREE.DynamicDrawUsage))
  geo.setDrawRange(0, count)
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 500)
  const mat = new THREE.ShaderMaterial({
    uniforms: { uOpacity: { value: opacity } },
    vertexShader: POINT_VERT,
    fragmentShader: POINT_FRAG,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending,
  })
  const pts = new THREE.Points(geo, mat)
  pts.frustumCulled = false
  return { pts, geo, mat }
}

export function createEffects(scene, state) {
  const fire = pointsSystem(state.fire, CAPS.FIRE, THREE.AdditiveBlending, 1.0)
  const dust = pointsSystem(state.dust, CAPS.DUST, THREE.NormalBlending, 0.7)
  scene.add(fire.pts, dust.pts)

  // tracers
  const traGeo = new THREE.BufferGeometry()
  const traPos = new Float32Array(CAPS.TRACERS * 2 * 3)
  traGeo.setAttribute('position', new THREE.BufferAttribute(traPos, 3).setUsage(THREE.DynamicDrawUsage))
  traGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 500)
  const traMat = new THREE.LineBasicMaterial({
    color: COLORS.tracer,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  })
  const tracers = new THREE.LineSegments(traGeo, traMat)
  tracers.frustumCulled = false
  scene.add(tracers)

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
      // streak tail: 18% back toward origin
      const bx = hx + (t.x0[i] - hx) * 0.18
      const by = hy + (t.y0[i] - hy) * 0.18
      const bz = hz + (t.z0[i] - hz) * 0.18
      const o = k * 6
      traPos[o] = bx
      traPos[o + 1] = by
      traPos[o + 2] = bz
      traPos[o + 3] = hx
      traPos[o + 4] = hy
      traPos[o + 5] = hz
      k++
    }
    traGeo.setDrawRange(0, k * 2)
    traGeo.attributes.position.needsUpdate = true

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
      scene.remove(fire.pts, dust.pts, tracers)
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
