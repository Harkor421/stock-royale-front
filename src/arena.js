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
//  · Bunkers and rocks for scale and silhouette. No lane walls: the eight
//    armies have to be able to reach each other.
// ============================================================================

import * as THREE from 'three'
import { ARENA, ARMIES, COLORS, sampleHeight, wedgeAngle, polar } from './config.js'
import { preloadLogos, drawLogo, inkFor, hasLogo } from './logos.js'

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
  const vx = new Float32Array(N) //   cached x/z: the crater loop is hot enough
  const vz = new Float32Array(N) //   that BufferAttribute.getX() shows up in it
  const vw = new Uint8Array(N) //     which wedge it belongs to
  const colors = new Float32Array(N * 3)
  const burn = new Float32Array(N) // 0..1 how scorched each vertex is
  for (let i = 0; i < N; i++) {
    const x = pos.getX(i)
    const z = pos.getZ(i)
    pos.setY(i, sampleHeight(x, z))
    vx[i] = x
    vz[i] = z
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
  const poleGeo = new THREE.CylinderGeometry(0.5, 0.62, 38, 6)
  const pole = new THREE.Mesh(poleGeo, new THREE.MeshLambertMaterial({ color: 0x3a3630 }))
  pole.position.y = ARENA.hillH + 19
  pole.castShadow = true
  citadel.add(pole)

  // The flag: big enough to read the winner's mark from the orbit camera.
  const BANNER_W = 26
  const BANNER_H = 16
  const bannerCanvas = document.createElement('canvas')
  bannerCanvas.width = 640
  bannerCanvas.height = 400
  const bctx = bannerCanvas.getContext('2d')
  const bannerTex = new THREE.CanvasTexture(bannerCanvas)
  bannerTex.colorSpace = THREE.SRGBColorSpace
  bannerTex.anisotropy = 8
  const bannerGeo = new THREE.PlaneGeometry(BANNER_W, BANNER_H, 18, 10)
  const bannerMat = new THREE.MeshLambertMaterial({
    map: bannerTex,
    side: THREE.DoubleSide,
    emissive: 0x000000,
  })
  const banner = new THREE.Mesh(bannerGeo, bannerMat)
  banner.position.set(BANNER_W / 2 + 0.4, ARENA.hillH + 29, 0)
  banner.castShadow = true
  citadel.add(banner)
  const bannerBase = bannerGeo.attributes.position.array.slice()

  let bannerSig = ''

  /** Repaint the flag for whoever holds the hill. Only when it changes hands. */
  function paintBanner(army) {
    const W = bannerCanvas.width
    const H = bannerCanvas.height
    const colorCss = army ? army.colorCss : '#8a8a8a'
    const hex = army ? army.color : 0x8a8a8a
    const ink = inkFor(hex)

    bctx.clearRect(0, 0, W, H)
    bctx.fillStyle = colorCss
    bctx.fillRect(0, 0, W, H)
    // a hoist band and a hairline border so it reads as cloth, not a sticker
    bctx.fillStyle = ink
    bctx.globalAlpha = 0.16
    bctx.fillRect(0, 0, 26, H)
    bctx.globalAlpha = 1
    bctx.strokeStyle = ink
    bctx.globalAlpha = 0.35
    bctx.lineWidth = 6
    bctx.strokeRect(3, 3, W - 6, H - 6)
    bctx.globalAlpha = 1

    if (!army) {
      bctx.fillStyle = ink
      bctx.font = '700 64px "JetBrains Mono", monospace'
      bctx.textAlign = 'center'
      bctx.textBaseline = 'middle'
      bctx.fillText('—', W / 2 + 13, H / 2)
      bannerTex.needsUpdate = true
      return
    }

    const drewLogo = drawLogo(bctx, army.symbol, ink, W / 2 + 13, H / 2 - 34, W * 0.5, H * 0.46)
    bctx.fillStyle = ink
    bctx.textAlign = 'center'
    bctx.textBaseline = 'middle'
    if (drewLogo) {
      bctx.font = '800 74px "JetBrains Mono", monospace'
      bctx.fillText(army.symbol, W / 2 + 13, H - 78)
    } else {
      // Amazon and Microsoft fly a wordmark: their marks aren't in the icon set
      bctx.font = '800 128px "JetBrains Mono", monospace'
      bctx.fillText(army.symbol, W / 2 + 13, H / 2 - 12)
      bctx.font = '600 40px "JetBrains Mono", monospace'
      bctx.globalAlpha = 0.75
      bctx.fillText(army.name.toUpperCase(), W / 2 + 13, H / 2 + 78)
      bctx.globalAlpha = 1
    }
    bannerTex.needsUpdate = true
  }

  // a halo on the hill that takes the leader's colour
  const haloGeo = new THREE.RingGeometry(ARENA.hillR + 1.4, ARENA.hillR + 3.2, 64).rotateX(-Math.PI / 2)
  const haloMat = new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0.5,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false,
  })
  const halo = new THREE.Mesh(haloGeo, haloMat)
  halo.position.y = ARENA.hillH + 0.95
  citadel.add(halo)

  // ---------------------------------------------------------- no walls
  // There used to be lane walls between the wedges and a parapet around the rim.
  // They made the map legible and made the game boring: eight armies each
  // fought inside its own corridor and never touched. The ground's colour still
  // says whose territory is whose, and now the columns can actually collide.

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
  let rosterLoaded = ''
  let scorchCursor = 0
  const BURNT = new THREE.Color(0x241713)

  function update(state, dt) {
    clock += dt
    const s = state.scalars

    // -- craters: drain whatever the simulator left in the ring and burn it in.
    //    The ground remembers where it has been hit, and heals slowly, so a
    //    contested lane looks fought over instead of freshly mown.
    const sc = state.scorch
    const cap = sc.x.length
    if (sc.head - scorchCursor > cap) scorchCursor = sc.head - cap // we fell behind
    // Bound the work: a heavy barrage can queue dozens of craters in one frame,
    // and each one sweeps every ground vertex. The rest wait for the next frame.
    let budget = 4
    while (scorchCursor < sc.head && budget-- > 0) {
      const k = scorchCursor % cap
      const cx = sc.x[k]
      const cz = sc.z[k]
      const cr = sc.r[k]
      const r2 = cr * cr
      for (let i = 0; i < N; i++) {
        const dx = vx[i] - cx
        const dz = vz[i] - cz
        const d2 = dx * dx + dz * dz
        if (d2 > r2) continue
        const f = 1 - Math.sqrt(d2) / cr
        burn[i] = Math.min(0.72, burn[i] + f * 0.2)
      }
      scorchCursor++
    }
    const heal = Math.exp(-dt / 15)

    // brand marks load once the roster is known; a late decode repaints the flag
    const rosterKey = state.armies.map((a) => a.symbol).join(',')
    if (rosterKey !== rosterLoaded) {
      rosterLoaded = rosterKey
      preloadLogos(state.armies.map((a) => a.symbol))
    }

    // -- ground territory. Half the vertices per frame: the front moves slowly
    //    and 30 Hz of repaint is invisible, but it halves the CPU cost.
    for (let i = 0; i < ARMIES; i++) {
      const army = state.armies[i]
      armyTint[i].setHex(army.color).lerp(_c.setHex(COLORS.ground), 0.62)
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
      const b = (burn[i] *= heal)
      if (b > 0.004) {
        colors[o] = col.r + (BURNT.r - col.r) * b
        colors[o + 1] = col.g + (BURNT.g - col.g) * b
        colors[o + 2] = col.b + (BURNT.b - col.b) * b
        continue
      }
      colors[o] = col.r
      colors[o + 1] = col.g
      colors[o + 2] = col.b
    }
    geo.attributes.color.needsUpdate = true

    // -- citadel flies the leader's colours and brand mark
    const leader = s.leader >= 0 ? state.armies[s.leader] : null
    const lead = leader ? leader.color : 0x8a8a8a
    // the mark decodes asynchronously, so the signature includes whether it has
    // arrived — the flag repaints itself the moment the logo is ready
    const sig = (leader ? leader.symbol : '-') + (leader && hasLogo(leader.symbol) ? '1' : '0')
    if (sig !== bannerSig) {
      bannerSig = sig
      paintBanner(leader)
    }
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
      arr[i + 2] =
        Math.sin(bx * 0.42 + clock * 3.6) * 1.25 * ((bx + BANNER_W / 2) / BANNER_W) +
        Math.sin(by * 0.6 + clock * 2.4) * 0.3
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
      scene.remove(ground, bunkers, rocks, stormWall, stormFoot, citadel)
      geo.dispose(); groundMat.dispose()
      bunkers.dispose(); rocks.dispose()
      capGeo.dispose(); capMat.dispose(); merlons.dispose()
      poleGeo.dispose(); pole.material.dispose()
      bannerGeo.dispose(); bannerMat.dispose(); bannerTex.dispose()
      haloGeo.dispose(); haloMat.dispose()
      ringGeo.dispose(); ringMat.dispose()
      footGeo.dispose(); footMat.dispose()
    },
  }
}
