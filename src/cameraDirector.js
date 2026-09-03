// ============================================================================
// cameraDirector.js — this is a broadcast, not a flight sim. Left alone the
// camera slowly orbits the whole arena; when something worth seeing happens it
// cuts in on that army's frontline; when the round ends it circles the citadel
// with the winner's flag. The moment the viewer drags, it backs off completely
// for a while and lets them look wherever they want.
// ============================================================================

import * as THREE from 'three'
import { ARENA, CAMERA, TAU, sampleHeight } from './config.js'

export function createCameraDirector(camera, controls, state) {
  const target = new THREE.Vector3(0, ARENA.hillH, 0)
  const desiredTarget = new THREE.Vector3(0, ARENA.hillH, 0)
  const desiredPos = new THREE.Vector3(0, 96, CAMERA.radius)

  let theta = Math.PI / 2 //   orbit angle
  let mode = 'orbit'
  let focusArmy = -1
  let focusUntil = 0
  let manualUntil = 0

  controls.addEventListener('start', () => {
    manualUntil = performance.now() + CAMERA.manualHoldSec * 1000
    mode = 'manual'
  })

  /** Cut to an army's frontline for a few seconds (a whale, a lead change). */
  function focus(armyIndex, seconds = 3.6) {
    if (performance.now() < manualUntil) return
    const now = performance.now()
    if (mode === 'focus' && now < focusUntil - 400) return // don't interrupt a cut
    focusArmy = armyIndex
    focusUntil = now + seconds * 1000
    mode = 'focus'
  }

  function update(dt) {
    const now = performance.now()
    const s = state.scalars

    if (now < manualUntil) {
      controls.update()
      return
    }
    if (mode === 'manual') mode = 'orbit'
    if (mode === 'focus' && now > focusUntil) mode = 'orbit'

    if (s.winnerFx > 0) {
      // victory lap: tight, low and slow around the citadel
      theta += dt * 0.32
      const r = 62
      desiredTarget.set(0, ARENA.hillH + 6, 0)
      desiredPos.set(Math.cos(theta) * r, ARENA.hillH + 30, Math.sin(theta) * r)
    } else if (mode === 'focus' && focusArmy >= 0) {
      const army = state.armies[focusArmy]
      const a = army.angle
      const fx = Math.cos(a) * army.front
      const fz = Math.sin(a) * army.front
      desiredTarget.set(fx * 0.72, sampleHeight(fx, fz) + 5, fz * 0.72)
      const camR = army.front + 40
      desiredPos.set(Math.cos(a) * camR, 32, Math.sin(a) * camR)
      theta = a // so the orbit resumes from where the cut left off
    } else {
      theta += dt * CAMERA.orbitSpeed
      // breathe the orbit in and out so a long quiet stretch never looks static
      const r = CAMERA.radius + Math.sin(now / 9000) * 14
      const h = 74 + Math.sin(now / 13000) * 12
      desiredTarget.set(0, ARENA.hillH + 2, 0)
      desiredPos.set(Math.cos(theta) * r, h, Math.sin(theta) * r)
    }

    const k = 1 - Math.exp(-dt / TAU.camera)
    target.lerp(desiredTarget, k)
    camera.position.lerp(desiredPos, k)
    controls.target.copy(target)
    controls.update()
  }

  return {
    focus,
    update,
    get mode() {
      return performance.now() < manualUntil ? 'manual' : mode
    },
  }
}
