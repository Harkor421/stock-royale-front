// ============================================================================
// materials.js — every unit built from code, merged into one flat-shaded
// geometry each. No external 3D assets, nothing to download.
//
// COLOR MODEL: all units share ONE MeshLambertMaterial with vertexColors +
// flatShading. Final color = vertexColor * instanceColor.
//   · Units bake GREY TONES as vertex colors (helmet darker, tracks darkest…)
//     so the per-instance army color tints the whole model while keeping its
//     internal contrast. A multi-tone tank is still ONE instanced draw call.
//   · Scenery bakes REAL colors and uses instanceColor only for variance.
// ============================================================================

import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { COLORS } from './config.js'

const _col = new THREE.Color()

/**
 * Part ids baked per vertex so the walk shader knows what to swing.
 * 0 = body (never moves) · 1/2 = legs · 3/4 = arms.
 * The pivots are constants both this file and armies.js agree on.
 */
export const PART = Object.freeze({ BODY: 0, LEG_L: 1, LEG_R: 2, ARM_L: 3, ARM_R: 4 })
/** Unit scale applied to the infantry geometries — pivots below are already
 *  multiplied by it, so the shader can use them straight. */
export const UNIT_SCALE = 1.9
export const RIG = Object.freeze({ hipY: 0.35 * UNIT_SCALE, shoulderY: 0.74 * UNIT_SCALE })

/** Tag every vertex of a sub-geometry with the limb it belongs to. */
function part(geo, id) {
  const n = geo.attributes.position.count
  const arr = new Float32Array(n)
  arr.fill(id)
  geo.setAttribute('part', new THREE.BufferAttribute(arr, 1))
  return geo
}

function grey(geo, v) {
  return paint(geo, _col.setRGB(v, v, v))
}
function tint(geo, hex) {
  return paint(geo, _col.set(hex))
}
function paint(geo, color) {
  const n = geo.attributes.position.count
  const arr = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    arr[i * 3] = color.r
    arr[i * 3 + 1] = color.g
    arr[i * 3 + 2] = color.b
  }
  geo.setAttribute('color', new THREE.BufferAttribute(arr, 3))
  return geo
}
function merge(parts) {
  const g = mergeGeometries(parts, false)
  if (!g) throw new Error('mergeGeometries returned null — mismatched attributes')
  return g
}

// --- units -----------------------------------------------------------------

/** Infantry. Faces +Z; the renderer rotates it into the march direction.
 *  Limbs carry a `part` id so the walk shader can swing them — this model is
 *  animated on the GPU, not by CPU matrices, so 2000 of them still cost one
 *  draw call. */
function buildSoldier() {
  const legL = part(grey(new THREE.BoxGeometry(0.085, 0.36, 0.09).translate(-0.065, 0.18, 0), 0.46), PART.LEG_L)
  const bootL = part(grey(new THREE.BoxGeometry(0.1, 0.07, 0.15).translate(-0.065, 0.035, 0.02), 0.24), PART.LEG_L)
  const legR = part(grey(new THREE.BoxGeometry(0.085, 0.36, 0.09).translate(0.065, 0.18, 0), 0.46), PART.LEG_R)
  const bootR = part(grey(new THREE.BoxGeometry(0.1, 0.07, 0.15).translate(0.065, 0.035, 0.02), 0.24), PART.LEG_R)

  const hips = part(grey(new THREE.BoxGeometry(0.24, 0.12, 0.15).translate(0, 0.4, 0), 0.7), PART.BODY)
  const torso = part(grey(new THREE.BoxGeometry(0.27, 0.34, 0.17).translate(0, 0.63, 0), 1.0), PART.BODY)
  const chest = part(grey(new THREE.BoxGeometry(0.3, 0.14, 0.19).translate(0, 0.72, 0), 0.86), PART.BODY)
  const pack = part(grey(new THREE.BoxGeometry(0.21, 0.26, 0.11).translate(0, 0.64, -0.14), 0.55), PART.BODY)
  const roll = part(grey(new THREE.CylinderGeometry(0.05, 0.05, 0.22, 6).rotateZ(Math.PI / 2).translate(0, 0.79, -0.14), 0.66), PART.BODY)
  const neck = part(grey(new THREE.BoxGeometry(0.09, 0.06, 0.09).translate(0, 0.83, 0), 0.6), PART.BODY)
  const head = part(grey(new THREE.BoxGeometry(0.155, 0.16, 0.16).translate(0, 0.92, 0), 0.82), PART.BODY)
  const helmet = part(grey(new THREE.SphereGeometry(0.115, 8, 5, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.9, 1.05).translate(0, 0.98, 0), 0.38), PART.BODY)
  const brim = part(grey(new THREE.BoxGeometry(0.2, 0.025, 0.1).translate(0, 0.985, 0.09), 0.3), PART.BODY)

  const armL = part(grey(new THREE.BoxGeometry(0.075, 0.3, 0.085).translate(-0.18, 0.6, 0), 0.9), PART.ARM_L)
  const armR = part(grey(new THREE.BoxGeometry(0.075, 0.24, 0.085).translate(0.18, 0.63, 0.03), 0.9), PART.ARM_R)
  // the rifle rides with the right arm so it swings up as the soldier moves
  const stock = part(grey(new THREE.BoxGeometry(0.05, 0.06, 0.2).translate(0.17, 0.55, 0.06), 0.2), PART.ARM_R)
  const barrel = part(grey(new THREE.BoxGeometry(0.028, 0.028, 0.34).translate(0.17, 0.56, 0.3), 0.14), PART.ARM_R)
  const mag = part(grey(new THREE.BoxGeometry(0.035, 0.1, 0.05).translate(0.17, 0.49, 0.12), 0.16), PART.ARM_R)

  const g = merge([legL, bootL, legR, bootR, hips, torso, chest, pack, roll, neck, head, helmet, brim, armL, armR, stock, barrel, mag])
  g.scale(1.9, 1.9, 1.9) // the arena is 190 units across; infantry has to read from the orbit camera
  return g
}

/**
 * The sell horde. Same silhouette family so the two read as one battle, but
 * hunched, hooded and heavier — recognisable as the enemy at a glance even
 * before you register the crimson.
 */
function buildBear() {
  const legL = part(grey(new THREE.BoxGeometry(0.095, 0.32, 0.1).translate(-0.075, 0.16, 0), 0.38), PART.LEG_L)
  const legR = part(grey(new THREE.BoxGeometry(0.095, 0.32, 0.1).translate(0.075, 0.16, 0), 0.38), PART.LEG_R)
  const bootL = part(grey(new THREE.BoxGeometry(0.11, 0.07, 0.16).translate(-0.075, 0.035, 0.02), 0.2), PART.LEG_L)
  const bootR = part(grey(new THREE.BoxGeometry(0.11, 0.07, 0.16).translate(0.075, 0.035, 0.02), 0.2), PART.LEG_R)
  const body = part(grey(new THREE.BoxGeometry(0.32, 0.4, 0.22).translate(0, 0.55, -0.02), 1.0), PART.BODY)
  const shoulders = part(grey(new THREE.BoxGeometry(0.4, 0.11, 0.24).translate(0, 0.72, -0.02), 0.72), PART.BODY)
  const hood = part(grey(new THREE.ConeGeometry(0.19, 0.3, 6).translate(0, 0.9, -0.03), 0.46), PART.BODY)
  const head = part(grey(new THREE.BoxGeometry(0.14, 0.13, 0.14).translate(0, 0.83, 0.04), 0.22), PART.BODY)
  const armL = part(grey(new THREE.BoxGeometry(0.08, 0.28, 0.09).translate(-0.21, 0.58, 0), 0.85), PART.ARM_L)
  const armR = part(grey(new THREE.BoxGeometry(0.08, 0.26, 0.09).translate(0.21, 0.6, 0.02), 0.85), PART.ARM_R)
  const haft = part(grey(new THREE.BoxGeometry(0.035, 0.035, 0.44).translate(0.2, 0.52, 0.2), 0.18), PART.ARM_R)
  const blade = part(grey(new THREE.BoxGeometry(0.02, 0.15, 0.16).translate(0.2, 0.56, 0.44), 0.95), PART.ARM_R)
  const g = merge([legL, legR, bootL, bootR, body, shoulders, hood, head, armL, armR, haft, blade])
  g.scale(1.9, 1.9, 1.9)
  return g
}

function buildFlag() {
  const pole = part(grey(new THREE.BoxGeometry(0.035, 0.95, 0.035).translate(-0.15, 0.48, 0), 0.32), PART.BODY)
  const cloth = part(grey(new THREE.BoxGeometry(0.02, 0.26, 0.4).translate(-0.15, 0.8, 0.22), 1.0), PART.BODY)
  const g = merge([pole, cloth])
  g.scale(1.9, 1.9, 1.9)
  return g
}

function buildTank() {
  const tracksL = grey(new THREE.BoxGeometry(0.35, 0.4, 2.7).translate(-0.8, 0.2, 0), 0.24)
  const tracksR = grey(new THREE.BoxGeometry(0.35, 0.4, 2.7).translate(0.8, 0.2, 0), 0.24)
  const skirtL = grey(new THREE.BoxGeometry(0.1, 0.26, 2.5).translate(-0.92, 0.5, 0), 0.5)
  const skirtR = grey(new THREE.BoxGeometry(0.1, 0.26, 2.5).translate(0.92, 0.5, 0), 0.5)
  const hull = grey(new THREE.BoxGeometry(1.6, 0.5, 2.6).translate(0, 0.4, 0), 1.0)
  const glacis = grey(new THREE.BoxGeometry(1.5, 0.28, 0.8).translate(0, 0.6, 1.2), 0.92)
  const upper = grey(new THREE.BoxGeometry(1.2, 0.35, 2.0).translate(0, 0.72, 0), 0.88)
  const turret = grey(new THREE.CylinderGeometry(0.55, 0.62, 0.42, 8).translate(0, 1.1, -0.1), 0.84)
  const hatch = grey(new THREE.CylinderGeometry(0.2, 0.2, 0.1, 8).translate(0, 1.33, -0.2), 0.6)
  const barrel = grey(
    new THREE.CylinderGeometry(0.09, 0.1, 1.7, 6).rotateX(Math.PI / 2).translate(0, 1.1, 1.1), 0.62)
  const brake = grey(new THREE.CylinderGeometry(0.14, 0.14, 0.24, 6).rotateX(Math.PI / 2).translate(0, 1.1, 1.88), 0.4)
  const g = merge([tracksL, tracksR, skirtL, skirtR, hull, glacis, upper, turret, hatch, barrel, brake])
  g.scale(2.5, 2.5, 2.5)
  return g
}

function buildApc() {
  const tracksL = grey(new THREE.BoxGeometry(0.3, 0.36, 2.2).translate(-0.62, 0.18, 0), 0.24)
  const tracksR = grey(new THREE.BoxGeometry(0.3, 0.36, 2.2).translate(0.62, 0.18, 0), 0.24)
  const hull = grey(new THREE.BoxGeometry(1.3, 0.55, 2.2).translate(0, 0.42, 0), 0.95)
  const slope = grey(new THREE.BoxGeometry(1.1, 0.3, 0.7).translate(0, 0.75, 0.8), 0.88)
  const cupola = grey(new THREE.BoxGeometry(0.4, 0.3, 0.4).translate(0, 0.9, -0.2), 0.75)
  const gun = grey(new THREE.BoxGeometry(0.07, 0.07, 0.7).translate(0, 0.98, 0.25), 0.3)
  const g = merge([tracksL, tracksR, hull, slope, cupola, gun])
  g.scale(2, 2, 2)
  return g
}

function buildJet() {
  const fuselage = grey(new THREE.CylinderGeometry(0.05, 0.18, 2.4, 6).rotateX(-Math.PI / 2), 0.85)
  const wings = grey(new THREE.BoxGeometry(2.4, 0.06, 0.6).translate(0, 0, -0.1), 1.0)
  const canopy = grey(new THREE.SphereGeometry(0.16, 8, 6).scale(1, 0.7, 1.9).translate(0, 0.13, 0.42), 0.35)
  const tailfin = grey(new THREE.BoxGeometry(0.06, 0.52, 0.4).translate(0, 0.26, -1.0), 0.68)
  const tailplane = grey(new THREE.BoxGeometry(0.9, 0.05, 0.3).translate(0, 0, -1.0), 0.85)
  const g = merge([fuselage, wings, canopy, tailfin, tailplane])
  g.scale(1.9, 1.9, 1.9)
  return g
}

function buildBomber() {
  const fuselage = grey(new THREE.CylinderGeometry(0.12, 0.28, 3.2, 6).rotateX(-Math.PI / 2), 0.8)
  const wings = grey(new THREE.BoxGeometry(3.6, 0.09, 0.95).translate(0, 0, -0.1), 0.95)
  const engL = grey(new THREE.CylinderGeometry(0.13, 0.13, 0.6, 6).rotateX(Math.PI / 2).translate(-1.1, -0.09, 0.1), 0.5)
  const engR = grey(new THREE.CylinderGeometry(0.13, 0.13, 0.6, 6).rotateX(Math.PI / 2).translate(1.1, -0.09, 0.1), 0.5)
  const tailfin = grey(new THREE.BoxGeometry(0.08, 0.62, 0.5).translate(0, 0.31, -1.4), 0.68)
  const tailplane = grey(new THREE.BoxGeometry(1.4, 0.06, 0.4).translate(0, 0, -1.4), 0.85)
  const g = merge([fuselage, wings, engL, engR, tailfin, tailplane])
  g.scale(2.1, 2.1, 2.1)
  return g
}

// --- scenery ---------------------------------------------------------------

function buildRock() {
  const a = tint(new THREE.DodecahedronGeometry(0.9, 0).scale(1, 0.7, 1.1), COLORS.rock)
  const b = tint(new THREE.DodecahedronGeometry(0.55, 0).translate(0.8, -0.2, 0.35), COLORS.rockDark)
  return merge([a, b])
}

/** A sandbagged strongpoint that sits in each army's rear as a home marker. */
function buildBunker() {
  const base = tint(new THREE.BoxGeometry(3.2, 0.9, 2.0).translate(0, 0.45, 0), COLORS.wall)
  const top = tint(new THREE.BoxGeometry(3.6, 0.35, 2.4).translate(0, 1.05, 0), COLORS.rockDark)
  const slitL = tint(new THREE.BoxGeometry(0.9, 0.3, 0.2).translate(-0.9, 0.7, 1.05), 0x14100e)
  const slitR = tint(new THREE.BoxGeometry(0.9, 0.3, 0.2).translate(0.9, 0.7, 1.05), 0x14100e)
  return merge([base, top, slitL, slitR])
}

/** A stone merlon — many of these ring the citadel on top of the hill. */
function buildMerlon() {
  return tint(new THREE.BoxGeometry(1.5, 2.1, 1.1).translate(0, 1.05, 0), COLORS.citadel)
}

/** A chunk of blasted ground/armour. Instanced, tumbling, lit like everything else. */
function buildDebris() {
  return tint(new THREE.TetrahedronGeometry(0.5, 0), COLORS.rockDark)
}

export function createUnitAssets() {
  const geos = {
    soldier: buildSoldier(),
    bear: buildBear(),
    flag: buildFlag(),
    tank: buildTank(),
    apc: buildApc(),
    jet: buildJet(),
    bomber: buildBomber(),
    rock: buildRock(),
    bunker: buildBunker(),
    merlon: buildMerlon(),
    debris: buildDebris(),
  }
  const material = new THREE.MeshLambertMaterial({
    color: 0xffffff,
    vertexColors: true,
    flatShading: true,
  })
  return {
    geos,
    material,
    dispose() {
      for (const k in geos) geos[k].dispose()
      material.dispose()
    },
  }
}
