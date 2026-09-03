// ============================================================================
// planes.js — jets and bombers running along an army's frontline. Position is
// lerped along the straight path the simulator laid down; the bank comes from
// how far into the pass they are.
// ============================================================================

import * as THREE from 'three'
import { CAPS, COLORS } from './config.js'

const _o = new THREE.Object3D()
const _c = new THREE.Color()

export function createPlanes(scene, assets) {
  const jets = new THREE.InstancedMesh(assets.geos.jet, assets.material, CAPS.PLANES)
  const bombers = new THREE.InstancedMesh(assets.geos.bomber, assets.material, CAPS.PLANES)
  for (const m of [jets, bombers]) {
    m.frustumCulled = false
    m.count = 0
    m.castShadow = true
    m.setColorAt(0, _c.setHex(0xffffff))
    scene.add(m)
  }

  const white = new THREE.Color(0xffffff)
  const bear = new THREE.Color(COLORS.bear).lerp(white, 0.3)
  const armyCols = []

  function sync(state) {
    for (let i = 0; i < state.armies.length; i++) {
      armyCols[i] = armyCols[i] || new THREE.Color()
      armyCols[i].setHex(state.armies[i].color).lerp(white, 0.32)
    }

    const p = state.planes
    let ji = 0
    let bi = 0
    for (let i = 0; i < p.x0.length; i++) {
      if (!p.active[i]) continue
      const t = p.t[i]
      const x = p.x0[i] + (p.x1[i] - p.x0[i]) * t
      const z = p.z0[i] + (p.z1[i] - p.z0[i]) * t
      _o.position.set(x, p.y[i], z)
      _o.rotation.set(0, Math.atan2(p.x1[i] - p.x0[i], p.z1[i] - p.z0[i]), 0)
      _o.rotation.z = Math.sin(t * Math.PI) * 0.38
      _o.scale.setScalar(1)
      _o.updateMatrix()
      const col = p.side[i] === 0 ? armyCols[p.army[i]] : bear
      if (p.kind[i] === 0) {
        jets.setMatrixAt(ji, _o.matrix)
        jets.setColorAt(ji, col)
        ji++
      } else {
        bombers.setMatrixAt(bi, _o.matrix)
        bombers.setColorAt(bi, col)
        bi++
      }
    }
    jets.count = ji
    bombers.count = bi
    for (const m of [jets, bombers]) {
      m.instanceMatrix.needsUpdate = true
      if (m.instanceColor) m.instanceColor.needsUpdate = true
    }
  }

  return {
    sync,
    dispose() {
      scene.remove(jets, bombers)
      jets.dispose()
      bombers.dispose()
    },
  }
}
