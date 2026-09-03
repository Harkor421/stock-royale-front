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

/** Infantry. Faces +Z; the renderer rotates it into the march direction. */
function buildSoldier() {
  const legL = grey(new THREE.BoxGeometry(0.08, 0.35, 0.08).translate(-0.06, 0.175, 0), 0.5)
  const legR = grey(new THREE.BoxGeometry(0.08, 0.35, 0.08).translate(0.06, 0.175, 0), 0.5)
  const body = grey(new THREE.BoxGeometry(0.25, 0.42, 0.16).translate(0, 0.56, 0), 1.0)
  const pack = grey(new THREE.BoxGeometry(0.2, 0.24, 0.1).translate(0, 0.6, -0.12), 0.62)
  const head = grey(new THREE.BoxGeometry(0.16, 0.16, 0.16).translate(0, 0.85, 0), 0.82)
  const helmet = grey(new THREE.ConeGeometry(0.14, 0.15, 6).translate(0, 0.99, 0), 0.42)
  const rifle = grey(new THREE.BoxGeometry(0.04, 0.04, 0.44).translate(0.1, 0.55, 0.22), 0.18)
  const g = merge([legL, legR, body, pack, head, helmet, rifle])
  g.scale(1.9, 1.9, 1.9) // the arena is 190 units across; infantry has to read from the orbit camera
  return g
}

/**
 * The sell horde. Same silhouette family so the two read as one battle, but
 * hunched, hooded and heavier — recognisable as the enemy at a glance even
 * before you register the crimson.
 */
function buildBear() {
  const legL = grey(new THREE.BoxGeometry(0.09, 0.3, 0.09).translate(-0.07, 0.15, 0), 0.42)
  const legR = grey(new THREE.BoxGeometry(0.09, 0.3, 0.09).translate(0.07, 0.15, 0), 0.42)
  const body = grey(new THREE.BoxGeometry(0.3, 0.4, 0.2).translate(0, 0.5, -0.02), 1.0)
  const hood = grey(new THREE.ConeGeometry(0.2, 0.3, 5).translate(0, 0.86, -0.02), 0.55)
  const head = grey(new THREE.BoxGeometry(0.15, 0.14, 0.15).translate(0, 0.78, 0.03), 0.3)
  const blade = grey(new THREE.BoxGeometry(0.05, 0.05, 0.5).translate(0.13, 0.5, 0.22), 0.22)
  const g = merge([legL, legR, body, hood, head, blade])
  g.scale(1.9, 1.9, 1.9)
  return g
}

function buildFlag() {
  const pole = grey(new THREE.BoxGeometry(0.035, 0.95, 0.035).translate(-0.15, 0.48, 0), 0.32)
  const cloth = grey(new THREE.BoxGeometry(0.02, 0.26, 0.4).translate(-0.15, 0.8, 0.22), 1.0)
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
