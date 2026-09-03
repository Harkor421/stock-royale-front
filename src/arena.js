// ============================================================================
// arena.js — the battlefield itself.
//
//  · A displaced ground disc whose colour is repainted every frame: inside an
//    army's frontline the ground is scorched (the sell horde holds it), outside
//    it is that army's own territory. So the map IS the leaderboard — you can
//    see who is winning from any angle without reading a number.
//  · The citadel: a walled mesa in the middle flying the current leader's
//    colours. Whoever is closest to it is winning the round.
//  · The closing ring: a glowing wall that contracts from the rim to the hill
//    over the five minutes of a round. It is the round clock, made physical.
//  · Lane walls, a rim parapet, bunkers and rocks for scale and silhouette.
// ============================================================================

import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { ARENA, ARMIES, COLORS, sampleHeight, wedgeAngle, polar } from './config.js'

const _o = new THREE.Object3D()
const _c = new THREE.Color()

const RING_VERT = /* glsl */ `
  varying vec2 vUv;
  varying float vY;
  void main() {
    vUv = uv;
    vY = position.y;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`
const RING_FRAG = /* glsl */ `
  precision mediump float;
  uniform vec3 uColor;
  uniform float uTime;
  uniform float uIntensity;
  varying vec2 vUv;
  void main() {
    float fade = pow(1.0 - vUv.y, 3.0);                 // hugs the ground, fades out fast
    float bands = 0.6 + 0.4 * sin(vUv.y * 30.0 - uTime * 3.0 + vUv.x * 46.0);
    float a = fade * bands * uIntensity;
    if (a < 0.006) discard;
    gl_FragColor = vec4(uColor * (0.8 + bands * 0.7), a);
  }
`

export function createArena(scene, assets) {
  // ---------------------------------------------------------------- ground
  const geo = new THREE.RingGeometry(0.02, ARENA.ground, ARENA.segTheta, ARENA.segR)
  geo.rotateX(-Math.PI / 2)
  const pos = geo.attributes.position
  const N = pos.count
  const vr = new Float32Array(N) //   radius of each vertex
  const vw = new Uint8Array(N) //     which wedge it belongs to
  const colors = new Float32Array(N * 3)
  for (let i = 0; i < N; i++) {
    const x = pos.getX(i)
    const z = pos.getZ(i)
    pos.setY(i, sampleHeight(x, z))
    vr[i] = Math.hypot(x, z)
    const a = Math.atan2(z, x) + Math.PI / 2
    const t = (((a / (Math.PI * 2)) % 1) + 1) % 1
    vw[i] = Math.min(ARMIES - 1, Math.floor(t * ARMIES))
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  geo.computeVertexNormals()
  const groundMat = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true })
  const ground = new THREE.Mesh(geo, groundMat)
  ground.receiveShadow = true
  scene.add(ground)

  // colour scratch pads, resolved once per frame
  const scorch = new THREE.Color(COLORS.scorched)
  const scorchHi = new THREE.Color(COLORS.scorchedHi)
  const neutral = new THREE.Color(COLORS.groundLo)
  const armyTint = []
  for (let i = 0; i < ARMIES; i++) armyTint.push(new THREE.Color(0xffffff))

  // ------------------------------------------------------------- citadel
  const citadel = new THREE.Group()
  scene.add(citadel)

  const capGeo = new THREE.CylinderGeometry(ARENA.hillR - 0.5, ARENA.hillR + 0.6, 1.2, 48)
  const capMat = new THREE.MeshLambertMaterial({ color: COLORS.citadelDark, flatShading: true })
  const cap = new THREE.Mesh(capGeo, capMat)
  cap.position.y = ARENA.hillH + 0.3
  cap.castShadow = true
  cap.receiveShadow = true
  citadel.add(cap)

  const MERLONS = 22
  const merlons = new THREE.InstancedMesh(assets.geos.merlon, assets.material, MERLONS)
  merlons.castShadow = true
  merlons.receiveShadow = true
  for (let i = 0; i < MERLONS; i++) {
    const a = (i / MERLONS) * Math.PI * 2
    _o.position.set(Math.cos(a) * (ARENA.hillR - 1.8), ARENA.hillH + 0.6, Math.sin(a) * (ARENA.hillR - 1.8))
    _o.rotation.set(0, -a, 0)
    _o.scale.setScalar(2.1)
    _o.updateMatrix()
    merlons.setMatrixAt(i, _o.matrix)
    merlons.setColorAt(i, _c.setHex(0xffffff))
  }
  citadel.add(merlons)

  // the leader's colours fly over the objective
  const poleGeo = new THREE.CylinderGeometry(0.4, 0.5, 26, 6)
  const pole = new THREE.Mesh(poleGeo, new THREE.MeshLambertMaterial({ color: 0x3a3630 }))
  pole.position.y = ARENA.hillH + 13
  pole.castShadow = true
  citadel.add(pole)

  const bannerGeo = new THREE.PlaneGeometry(13, 8, 14, 8)
  const bannerMat = new THREE.MeshLambertMaterial({
    color: 0xffffff,
    side: THREE.DoubleSide,
    emissive: 0x000000,
  })
  const banner = new THREE.Mesh(bannerGeo, bannerMat)
  banner.position.set(6.7, ARENA.hillH + 20, 0)
  banner.castShadow = true
  citadel.add(banner)
  const bannerBase = bannerGeo.attributes.position.array.slice()

  // a halo on the hill that takes the leader's colour
  const haloGeo = new THREE.RingGeometry(ARENA.hillR + 1.4, ARENA.hillR + 3.2, 64).rotateX(-Math.PI / 2)
  const haloMat = new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0.5,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false,
  })
  const halo = new THREE.Mesh(haloGeo, haloMat)
  halo.position.y = ARENA.hillH + 0.95
  citadel.add(halo)

  // ---------------------------------------------------- lane walls + rim
  const wallParts = []
  const wallStart = ARENA.hillR + ARENA.hillSlope - 2
  for (let i = 0; i < ARMIES; i++) {
    const a = wedgeAngle(i) + Math.PI / ARMIES // the boundary between lanes
    const steps = 26
    for (let k = 0; k < steps; k++) {
      const r = wallStart + ((ARENA.rim - wallStart) * k) / (steps - 1)
      const p = polar(r, a)
      const h = 1.1 + Math.sin(k * 1.7) * 0.28
      const box = new THREE.BoxGeometry(1.7, h, 2.6)
      box.translate(p.x, sampleHeight(p.x, p.z) + h / 2 - 0.2, p.z)
      box.rotateY(0) // boxes are axis-aligned; the jitter below hides it
      wallParts.push(box)
    }
  }
  const rimSteps = 200
  for (let k = 0; k < rimSteps; k++) {
    const a = (k / rimSteps) * Math.PI * 2
    const p = polar(ARENA.rim + 2.4, a)
    const h = 2.2 + Math.sin(k * 0.9) * 0.5
    const box = new THREE.BoxGeometry(3.4, h, 3.4)
    box.translate(p.x, sampleHeight(p.x, p.z) + h / 2 - 0.3, p.z)
    wallParts.push(box)
  }
  const wallGeo = mergeGeometries(wallParts, false)
  for (const p of wallParts) p.dispose()
  const walls = new THREE.Mesh(
    wallGeo,
    new THREE.MeshLambertMaterial({ color: COLORS.wall, flatShading: true })
  )
  walls.castShadow = true
  walls.receiveShadow = true
  scene.add(walls)

  // --------------------------------------------------- bunkers + scenery
  const bunkers = new THREE.InstancedMesh(assets.geos.bunker, assets.material, ARMIES)
  bunkers.castShadow = true
  bunkers.receiveShadow = true
  for (let i = 0; i < ARMIES; i++) {
    const a = wedgeAngle(i)
    const p = polar(ARENA.rim - 5, a)
    _o.position.set(p.x, sampleHeight(p.x, p.z), p.z)
    _o.rotation.set(0, -a + Math.PI / 2, 0)
    _o.scale.setScalar(1.5)
    _o.updateMatrix()
    bunkers.setMatrixAt(i, _o.matrix)
    bunkers.setColorAt(i, _c.setHex(0xffffff))
  }
  scene.add(bunkers)

  const ROCKS = 150
  const rocks = new THREE.InstancedMesh(assets.geos.rock, assets.material, ROCKS)
  rocks.castShadow = true
  rocks.receiveShadow = true
  let seed = 1337
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
  for (let i = 0; i < ROCKS; i++) {
    const a = rnd() * Math.PI * 2
    const r = i < 40 ? ARENA.hillR + 2 + rnd() * 8 : ARENA.rim + 8 + rnd() * 44
    const p = polar(r, a)
    _o.position.set(p.x, sampleHeight(p.x, p.z) - 0.2, p.z)
    _o.rotation.set(rnd() * 0.4, rnd() * 6.28, rnd() * 0.4)
    _o.scale.setScalar(0.8 + rnd() * 1.9)
    _o.updateMatrix()
    rocks.setMatrixAt(i, _o.matrix)
    rocks.setColorAt(i, _c.setRGB(0.85 + rnd() * 0.3, 0.85 + rnd() * 0.3, 0.85 + rnd() * 0.3))
  }
  scene.add(rocks)

  // ------------------------------------------------------- closing ring
  const ringGeo = new THREE.CylinderGeometry(1, 1, 15, 96, 1, true)
  ringGeo.translate(0, 7.5, 0)
  const ringMat = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(COLORS.storm) },
      uTime: { value: 0 },
      uIntensity: { value: 0.32 },
    },
    vertexShader: RING_VERT,
    fragmentShader: RING_FRAG,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    fog: false,
    toneMapped: false,
  })
  const stormWall = new THREE.Mesh(ringGeo, ringMat)
  stormWall.frustumCulled = false
  scene.add(stormWall)

  const footGeo = new THREE.RingGeometry(0.985, 1.015, 128).rotateX(-Math.PI / 2)
  const footMat = new THREE.MeshBasicMaterial({
    color: COLORS.storm, transparent: true, opacity: 0.85,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false,
  })
  const stormFoot = new THREE.Mesh(footGeo, footMat)
  scene.add(stormFoot)

  const CITADEL_STONE = new THREE.Color(COLORS.citadel)
  const WHITE = new THREE.Color(0xffffff)
  const stormHot = new THREE.Color(COLORS.stormHot)
  const stormCool = new THREE.Color(COLORS.storm)
  const scratch = new THREE.Color()

  // ------------------------------------------------------------- update
  let clock = 0
  let repaintPhase = 0

  function update(state, dt) {
    clock += dt
    const s = state.scalars

    // -- ground territory. Half the vertices per frame: the front moves slowly
    //    and 30 Hz of repaint is invisible, but it halves the CPU cost.
    for (let i = 0; i < ARMIES; i++) {
      const army = state.armies[i]
      armyTint[i].setHex(army.color).lerp(_c.setHex(COLORS.ground), 0.72)
    }
    repaintPhase ^= 1
    for (let i = repaintPhase; i < N; i += 2) {
      const r = vr[i]
      const o = i * 3
      let col
      if (r > ARENA.rim + 4) {
        col = neutral
      } else {
        const army = state.armies[vw[i]]
        const d = r - army.front
        if (d > 3) col = armyTint[vw[i]]
        else if (d < -3) col = r < ARENA.hillR + 2 ? scorchHi : scorch
        else col = scratch.copy(scorch).lerp(armyTint[vw[i]], (d + 3) / 6) // the churned seam
      }
      colors[o] = col.r
      colors[o + 1] = col.g
      colors[o + 2] = col.b
    }
    geo.attributes.color.needsUpdate = true

    // -- citadel flies the leader's colours
    const leader = s.leader >= 0 ? state.armies[s.leader] : null
    const lead = leader ? leader.color : 0x8a8a8a
    bannerMat.color.setHex(lead)
    haloMat.color.setHex(lead)
    haloMat.opacity = 0.35 + 0.2 * Math.sin(clock * 2.2)
    // stone tinted toward the leader's colour — the citadel visibly changes hands
    scratch.setHex(lead).lerp(CITADEL_STONE, 0.72)
    for (let i = 0; i < MERLONS; i++) merlons.setColorAt(i, scratch)
    if (merlons.instanceColor) merlons.instanceColor.needsUpdate = true
    for (let i = 0; i < ARMIES; i++) {
      scratch.setHex(state.armies[i].color).lerp(WHITE, 0.35)
      bunkers.setColorAt(i, scratch)
    }
    if (bunkers.instanceColor) bunkers.instanceColor.needsUpdate = true

    // the banner ripples
    const arr = bannerGeo.attributes.position.array
    for (let i = 0; i < arr.length; i += 3) {
      const bx = bannerBase[i]
      const by = bannerBase[i + 1]
      arr[i + 2] = Math.sin(bx * 0.8 + clock * 4.5) * 0.7 * ((bx + 6.5) / 13) + Math.sin(by + clock * 3) * 0.16
    }
    bannerGeo.attributes.position.needsUpdate = true
    bannerGeo.computeVertexNormals()

    // -- closing ring: the round clock made physical
    const r = Math.max(ARENA.hillR + 5, s.stormR)
    stormWall.scale.set(r, 1, r)
    stormFoot.scale.set(r, 1, r)
    stormFoot.position.y = sampleHeight(r, 0) + 0.25
    const heat = Math.max(0, (s.roundProgress - 0.82) / 0.18) // last ~55 seconds
    scratch.copy(stormCool).lerp(stormHot, heat)
    ringMat.uniforms.uColor.value.copy(scratch)
    footMat.color.copy(scratch)
    ringMat.uniforms.uTime.value = clock
    const pulse = heat > 0 ? 0.55 + 0.45 * Math.sin(clock * (6 + heat * 12)) : 0.55
    ringMat.uniforms.uIntensity.value = 0.22 + heat * 0.5 * pulse
    footMat.opacity = 0.6 + heat * 0.4 * pulse
  }

  return {
    update,
    dispose() {
      scene.remove(ground, walls, bunkers, rocks, stormWall, stormFoot, citadel)
      geo.dispose(); groundMat.dispose()
      wallGeo.dispose(); walls.material.dispose()
      bunkers.dispose(); rocks.dispose()
      capGeo.dispose(); capMat.dispose(); merlons.dispose()
      poleGeo.dispose(); pole.material.dispose()
      bannerGeo.dispose(); bannerMat.dispose()
      haloGeo.dispose(); haloMat.dispose()
      ringGeo.dispose(); ringMat.dispose()
      footGeo.dispose(); footMat.dispose()
    },
  }
}
