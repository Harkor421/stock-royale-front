// ============================================================================
// armies.js — the swarms. Two InstancedMeshes (own troops / the sell horde)
// plus a small one for flag bearers. sync(state) rewrites the active instances
// compacted to 0..count-1 each frame; nothing is allocated.
//
// Soldiers are stored in polar coordinates, so this is also where the arena's
// polar world becomes cartesian for the GPU.
// ============================================================================

import * as THREE from 'three'
import { CAPS, COLORS, sampleHeight } from './config.js'

const _o = new THREE.Object3D()
const _c = new THREE.Color()

export function createArmies(scene, assets) {
  const bulls = new THREE.InstancedMesh(assets.geos.soldier, assets.material, CAPS.SOLDIERS)
  const bears = new THREE.InstancedMesh(assets.geos.bear, assets.material, CAPS.SOLDIERS)
  const flags = new THREE.InstancedMesh(assets.geos.flag, assets.material, CAPS.FLAGS)
  for (const m of [bulls, bears, flags]) {
    m.frustumCulled = false
    m.count = 0
    m.castShadow = true
    m.setColorAt(0, _c.setHex(0xffffff))
    scene.add(m)
  }

  const bearCol = new THREE.Color(COLORS.bear)
  const white = new THREE.Color(0xffffff)
  const armyCols = []

  function sync(state) {
    // per-army colors resolved once per frame, not per instance
    for (let i = 0; i < state.armies.length; i++) {
      armyCols[i] = armyCols[i] || new THREE.Color()
      armyCols[i].setHex(state.armies[i].color)
    }

    const s = state.soldiers
    const n = s.r.length
    let bu = 0
    let be = 0
    let fi = 0
    for (let i = 0; i < n; i++) {
      if (!s.active[i]) continue
      const a = s.a[i]
      const r = s.r[i]
      const ca = Math.cos(a)
      const sa = Math.sin(a)
      const x = ca * r
      const z = sa * r
      const dying = s.st[i] === 2
      const bob = s.st[i] === 0 ? Math.abs(Math.sin(s.phase[i])) * 0.07 : 0
      _o.position.set(x, sampleHeight(x, z) + bob, z)
      // own troops march inward at the hill; the sell horde pushes outward
      const face = s.side[i] === 0 ? -1 : 1
      _o.rotation.set(0, Math.atan2(ca * face, sa * face), 0)
      _o.scale.setScalar(dying ? 0.9 + s.timer[i] * 0.3 : 1)
      _o.updateMatrix()

      if (s.side[i] === 0) {
        bulls.setMatrixAt(bu, _o.matrix)
        bulls.setColorAt(bu, dying ? white : armyCols[s.army[i]])
        bu++
        if (s.flag[i] && !dying && fi < CAPS.FLAGS) {
          _o.scale.setScalar(1)
          _o.updateMatrix()
          flags.setMatrixAt(fi, _o.matrix)
          flags.setColorAt(fi, armyCols[s.army[i]])
          fi++
        }
      } else {
        bears.setMatrixAt(be, _o.matrix)
        bears.setColorAt(be, dying ? white : bearCol)
        be++
      }
    }
    bulls.count = bu
    bears.count = be
    flags.count = fi
    for (const m of [bulls, bears, flags]) {
      m.instanceMatrix.needsUpdate = true
      if (m.instanceColor) m.instanceColor.needsUpdate = true
    }
  }

  return {
    sync,
    dispose() {
      scene.remove(bulls, bears, flags)
      bulls.dispose()
      bears.dispose()
      flags.dispose()
    },
  }
}
