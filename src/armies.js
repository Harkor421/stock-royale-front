// ============================================================================
// armies.js — the swarms. Two InstancedMeshes, one per unit type (riflemen and
// the heavier troopers a block print brings), plus a small one for flag
// bearers. Both wear their ARMY's colour: every unit on the field belongs to a
// ticker, because the fight is stock against stock. sync(state) rewrites the active instances
// compacted to 0..count-1 each frame; nothing is allocated.
//
// Soldiers are stored in polar coordinates, so this is also where the arena's
// polar world becomes cartesian for the GPU.
// ============================================================================

import * as THREE from 'three'
import { CAPS, COLORS, sampleHeight } from './config.js'
import { createWalkMaterials, addRigAttributes } from './walkRig.js'

const _o = new THREE.Object3D()
const _c = new THREE.Color()

export function createArmies(scene, assets) {
  // Infantry gets its own material: the walk rig is injected there, and the
  // vehicles and scenery that share assets.material must not carry it.
  const walk = createWalkMaterials()
  const riflemen = new THREE.InstancedMesh(assets.geos.soldier, walk.material, CAPS.SOLDIERS)
  const heavies = new THREE.InstancedMesh(assets.geos.bear, walk.material, CAPS.SOLDIERS)
  const flags = new THREE.InstancedMesh(assets.geos.flag, assets.material, CAPS.FLAGS)
  const bullRig = addRigAttributes(assets.geos.soldier, CAPS.SOLDIERS)
  const bearRig = addRigAttributes(assets.geos.bear, CAPS.SOLDIERS)
  for (const m of [riflemen, heavies, flags]) {
    m.frustumCulled = false
    m.count = 0
    m.castShadow = true
    m.setColorAt(0, _c.setHex(0xffffff))
    scene.add(m)
  }
  // shadows have to run the same rig, or they cast a pose the mesh isn't in
  riflemen.customDepthMaterial = walk.depth
  heavies.customDepthMaterial = walk.depth

  const white = new THREE.Color(0xffffff)
  const dark = new THREE.Color(0x1a1a1a)
  const armyCols = []
  const heavyCols = []

  function sync(state) {
    // per-army colors resolved once per frame, not per instance
    for (let i = 0; i < state.armies.length; i++) {
      armyCols[i] = armyCols[i] || new THREE.Color()
      armyCols[i].setHex(state.armies[i].color)
      heavyCols[i] = heavyCols[i] || new THREE.Color()
      heavyCols[i].setHex(state.armies[i].color).lerp(dark, 0.34) // armoured, same colours
    }

    const s = state.soldiers
    const n = s.r.length
    let bu = 0
    let be = 0
    let fi = 0
    const bullPhase = bullRig.phase.array
    const bullAnim = bullRig.anim.array
    const bearPhase = bearRig.phase.array
    const bearAnim = bearRig.anim.array
    for (let i = 0; i < n; i++) {
      if (!s.active[i]) continue
      const a = s.a[i]
      const r = s.r[i]
      const ca = Math.cos(a)
      const sa = Math.sin(a)
      const x = ca * r
      const z = sa * r
      const dying = s.st[i] === 2
      const bob = s.st[i] === 0 ? Math.abs(Math.sin(s.phase[i] * 2)) * 0.05 : 0
      _o.position.set(x, sampleHeight(x, z) + bob, z)
      // everyone faces the citadel they are marching on
      _o.rotation.set(0, Math.atan2(-ca, -sa), 0)
      _o.scale.setScalar(dying ? 0.9 + s.timer[i] * 0.3 : 1)
      _o.updateMatrix()

      if (s.side[i] === 0) {
        riflemen.setMatrixAt(bu, _o.matrix)
        riflemen.setColorAt(bu, dying ? white : armyCols[s.army[i]])
        bullPhase[bu] = s.phase[i]
        bullAnim[bu] = s.st[i]
        bu++
        if (s.flag[i] && !dying && fi < CAPS.FLAGS) {
          _o.scale.setScalar(1)
          _o.updateMatrix()
          flags.setMatrixAt(fi, _o.matrix)
          flags.setColorAt(fi, armyCols[s.army[i]])
          fi++
        }
      } else {
        heavies.setMatrixAt(be, _o.matrix)
        heavies.setColorAt(be, dying ? white : heavyCols[s.army[i]])
        bearPhase[be] = s.phase[i]
        bearAnim[be] = s.st[i]
        be++
      }
    }
    riflemen.count = bu
    heavies.count = be
    flags.count = fi
    bullRig.phase.needsUpdate = true
    bullRig.anim.needsUpdate = true
    bearRig.phase.needsUpdate = true
    bearRig.anim.needsUpdate = true
    for (const m of [riflemen, heavies, flags]) {
      m.instanceMatrix.needsUpdate = true
      if (m.instanceColor) m.instanceColor.needsUpdate = true
    }
  }

  return {
    sync,
    dispose() {
      scene.remove(riflemen, heavies, flags)
      riflemen.dispose()
      heavies.dispose()
      flags.dispose()
      walk.material.dispose()
      walk.depth.dispose()
    },
  }
}
