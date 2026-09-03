// ============================================================================
// vehicles.js — block-print armour. Tanks (whales) and APCs (blocks), instanced
// by kind, each with a flat blob shadow so it reads as planted on the ground
// even where the real shadow map is soft.
// ============================================================================

import * as THREE from 'three'
import { CAPS, COLORS, sampleHeight } from './config.js'

const _o = new THREE.Object3D()
const _c = new THREE.Color()

export function createVehicles(scene, assets) {
  const tanks = new THREE.InstancedMesh(assets.geos.tank, assets.material, CAPS.TANKS)
  const apcs = new THREE.InstancedMesh(assets.geos.apc, assets.material, CAPS.TANKS)
  for (const m of [tanks, apcs]) {
    m.frustumCulled = false
    m.count = 0
    m.castShadow = true
    m.setColorAt(0, _c.setHex(0xffffff))
    scene.add(m)
  }

  const shadowGeo = new THREE.CircleGeometry(2.6, 16).rotateX(-Math.PI / 2)
  const shadowMat = new THREE.MeshBasicMaterial({
    color: 0x000000, transparent: true, opacity: 0.22, depthWrite: false,
    polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1,
  })
  const shadows = new THREE.InstancedMesh(shadowGeo, shadowMat, CAPS.TANKS)
  shadows.frustumCulled = false
  shadows.count = 0
  scene.add(shadows)

  const bearTank = new THREE.Color(COLORS.bearTank)
  const dark = new THREE.Color(0x2a2a2a)
  const armyCols = []

  function sync(state) {
    for (let i = 0; i < state.armies.length; i++) {
      armyCols[i] = armyCols[i] || new THREE.Color()
      // armour reads a shade heavier than the infantry of the same army
      armyCols[i].setHex(state.armies[i].color).lerp(dark, 0.35)
    }

    const t = state.tanks
    let ti = 0
    let ai = 0
    let si = 0
    for (let i = 0; i < t.x.length; i++) {
      if (!t.active[i]) continue
      const x = t.x[i]
      const z = t.z[i]
      const y = sampleHeight(x, z)
      const recoil = t.st[i] === 1 ? Math.max(0, Math.sin(t.timer[i] * 30)) * 0.08 : 0
      _o.position.set(x, y + recoil, z)
      _o.rotation.set(0, t.yaw[i], 0)
      _o.scale.setScalar(1)
      _o.updateMatrix()
      const col = t.side[i] === 0 ? armyCols[t.army[i]] : bearTank
      if (t.kind[i] === 0) {
        tanks.setMatrixAt(ti, _o.matrix)
        tanks.setColorAt(ti, col)
        ti++
      } else {
        apcs.setMatrixAt(ai, _o.matrix)
        apcs.setColorAt(ai, col)
        ai++
      }
      _o.position.set(x, y + 0.06, z)
      _o.scale.set(t.kind[i] === 0 ? 1 : 0.72, 1, t.kind[i] === 0 ? 1 : 0.72)
      _o.updateMatrix()
      shadows.setMatrixAt(si, _o.matrix)
      si++
    }
    tanks.count = ti
    apcs.count = ai
    shadows.count = si
    for (const m of [tanks, apcs, shadows]) {
      m.instanceMatrix.needsUpdate = true
      if (m.instanceColor) m.instanceColor.needsUpdate = true
    }
  }

  return {
    sync,
    dispose() {
      scene.remove(tanks, apcs, shadows)
      tanks.dispose(); apcs.dispose(); shadows.dispose()
      shadowGeo.dispose(); shadowMat.dispose()
    },
  }
}
