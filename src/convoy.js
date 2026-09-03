// ============================================================================
// convoy.js — one banner truck per army, patrolling behind its own line with
// its colours and brand mark flying off the mast.
//
// It's the map's key: eight moving labels that say which colour belongs to
// which company, without a legend and without painting the terrain. The trucks
// follow their army's frontline, so watching them is also watching the round.
// ============================================================================

import * as THREE from 'three'
import { ARMIES, ARENA, sampleHeight, polar } from './config.js'
import { createFlagTexture } from './flag.js'

const _o = new THREE.Object3D()
const _c = new THREE.Color()
const _p = { x: 0, z: 0 }

const FLAG_W = 5.2
const FLAG_H = 3.2

export function createConvoy(scene, assets) {
  const trucks = new THREE.InstancedMesh(assets.geos.truck, assets.material, ARMIES)
  trucks.frustumCulled = false
  trucks.castShadow = true
  trucks.count = ARMIES
  trucks.setColorAt(0, _c.setHex(0xffffff))
  scene.add(trucks)

  // Each flag needs its own texture, so these are individual meshes rather than
  // instances — eight extra draw calls buys eight readable brand marks.
  const flags = []
  for (let i = 0; i < ARMIES; i++) {
    const tex = createFlagTexture(320, 200)
    const geo = new THREE.PlaneGeometry(FLAG_W, FLAG_H, 10, 6)
    const mat = new THREE.MeshLambertMaterial({ map: tex.texture, side: THREE.DoubleSide })
    const mesh = new THREE.Mesh(geo, mat)
    mesh.castShadow = true
    scene.add(mesh)
    flags.push({ tex, geo, mat, mesh, base: geo.attributes.position.array.slice() })
  }

  let clock = 0
  const phase = []
  for (let i = 0; i < ARMIES; i++) phase.push(Math.random() * Math.PI * 2)

  function update(state, dt) {
    clock += dt
    for (let i = 0; i < ARMIES; i++) {
      const army = state.armies[i]
      if (!army) continue

      // patrol an arc behind the army's own line, sweeping side to side
      const sweep = Math.sin(clock * 0.28 + phase[i]) * ARENA.wedgeHalf * 1.15
      const a = army.angle + sweep
      const r = Math.min(ARENA.rim - 4, Math.max(ARENA.assaultR + 14, army.front + 20))
      polar(r, a, _p)
      const y = sampleHeight(_p.x, _p.z)
      // face along the sweep, which is the direction it is actually driving
      const heading = Math.cos(clock * 0.28 + phase[i]) >= 0 ? 1 : -1
      const yaw = Math.atan2(-Math.sin(a) * heading, Math.cos(a) * heading)

      _o.position.set(_p.x, y, _p.z)
      _o.rotation.set(0, yaw, 0)
      _o.scale.setScalar(1)
      _o.updateMatrix()
      trucks.setMatrixAt(i, _o.matrix)
      trucks.setColorAt(i, _c.setHex(army.color))

      // the flag rides on the mast, hoisted and rippling
      const f = flags[i]
      f.tex.paint(army, { compact: true })
      const mx = _p.x - Math.sin(yaw) * 1.2
      const mz = _p.z - Math.cos(yaw) * 1.2
      f.mesh.position.set(mx + Math.sin(yaw + Math.PI / 2) * (FLAG_W / 2), y + 6.4, mz + Math.cos(yaw + Math.PI / 2) * (FLAG_W / 2))
      f.mesh.rotation.set(0, yaw + Math.PI / 2, 0)

      const arr = f.geo.attributes.position.array
      for (let k = 0; k < arr.length; k += 3) {
        const bx = f.base[k]
        arr[k + 2] = Math.sin(bx * 1.6 + clock * 6) * 0.28 * ((bx + FLAG_W / 2) / FLAG_W)
      }
      f.geo.attributes.position.needsUpdate = true
      f.geo.computeVertexNormals()
    }
    trucks.instanceMatrix.needsUpdate = true
    if (trucks.instanceColor) trucks.instanceColor.needsUpdate = true
  }

  return {
    update,
    dispose() {
      scene.remove(trucks)
      trucks.dispose()
      for (const f of flags) {
        scene.remove(f.mesh)
        f.geo.dispose()
        f.mat.dispose()
        f.tex.dispose()
      }
    },
  }
}
