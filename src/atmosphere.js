// ============================================================================
// atmosphere.js — the sky reacts to the tape. Fog, sun and the sky dome's two
// gradient colors lerp between STORM (everything dumping) -> DUSK (neutral) ->
// DAWN (everything bidding), driven by the smoothed aggregate pressure of all
// eight armies. Lightning kicks the key light when the hill changes hands.
// ============================================================================

import * as THREE from 'three'
import { ATMO } from './config.js'

export function createAtmosphere(scene, sun, hemi, fog, sky) {
  const K = {
    fog: [new THREE.Color(ATMO.storm.fog), new THREE.Color(ATMO.dusk.fog), new THREE.Color(ATMO.dawn.fog)],
    sun: [new THREE.Color(ATMO.storm.sun), new THREE.Color(ATMO.dusk.sun), new THREE.Color(ATMO.dawn.sun)],
    zen: [new THREE.Color(ATMO.storm.zenith), new THREE.Color(ATMO.dusk.zenith), new THREE.Color(ATMO.dawn.zenith)],
    hor: [new THREE.Color(ATMO.storm.horizon), new THREE.Color(ATMO.dusk.horizon), new THREE.Color(ATMO.dawn.horizon)],
  }
  const mix = new THREE.Color()

  // keep the sky's sun disc exactly where the shadow-casting light is
  sky.uniforms.uSunDir.value.copy(sun.position).normalize()

  function lerpKey(arr, t) {
    // t in [-1,1]: -1 = storm, 0 = dusk, +1 = dawn
    return t >= 0 ? mix.copy(arr[1]).lerp(arr[2], t) : mix.copy(arr[1]).lerp(arr[0], -t)
  }
  const num = (a, b, c, t) => (t >= 0 ? b + (c - b) * t : b + (a - b) * -t)

  function update(dt, state) {
    const s = state.scalars
    const t = Math.max(-1, Math.min(1, s.skyPressure * 1.8))

    fog.color.copy(lerpKey(K.fog, t))
    fog.near = num(ATMO.storm.near, ATMO.dusk.near, ATMO.dawn.near, t)
    fog.far = num(ATMO.storm.far, ATMO.dusk.far, ATMO.dawn.far, t)

    sun.color.copy(lerpKey(K.sun, t))
    let sunI = num(ATMO.storm.sunI, ATMO.dusk.sunI, ATMO.dawn.sunI, t)
    if (s.lightning > 0) sunI += 2.6
    sun.intensity = sunI
    hemi.intensity = 1.05 + Math.max(0, t) * 0.35

    sky.uniforms.uZenith.value.copy(lerpKey(K.zen, t))
    sky.uniforms.uHorizon.value.copy(lerpKey(K.hor, t))
    sky.uniforms.uSun.value.copy(sun.color)
    sky.uniforms.uSunI.value = Math.min(2.4, sunI)
  }

  return { update }
}
