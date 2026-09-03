// ============================================================================
// scene.js — renderer, camera, controls, lights, shadows and the post chain.
//
// Two upgrades over the old trench renderer, and they carry most of the visual
// difference: a real shadow-casting sun (everything on the field is grounded
// instead of floating), and a bloom pass (tracers, muzzle flashes, fireworks
// and the closing ring actually glow instead of being merely bright pixels).
// ============================================================================

import * as THREE from 'three'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { CAMERA, COLORS, ATMO, ARENA } from './config.js'
import { createSky } from './sky.js'

export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: 'high-performance',
    preserveDrawingBuffer: true, // lets us snapshot the winner frame
  })
  const dpr = () => Math.min(window.devicePixelRatio, 1.75)
  renderer.setPixelRatio(dpr())
  renderer.setSize(window.innerWidth, window.innerHeight, false)
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.15
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = THREE.PCFSoftShadowMap

  const scene = new THREE.Scene()
  const fog = new THREE.Fog(ATMO.dusk.fog, ATMO.dusk.near, ATMO.dusk.far)
  scene.fog = fog

  const sky = createSky(scene)

  const camera = new THREE.PerspectiveCamera(
    CAMERA.fov,
    window.innerWidth / window.innerHeight,
    CAMERA.near,
    CAMERA.far
  )
  camera.position.set(0, 84, CAMERA.radius)

  const controls = new OrbitControls(camera, canvas)
  controls.target.set(0, ARENA.hillH, 0)
  controls.enableDamping = true
  controls.dampingFactor = CAMERA.dampingFactor
  controls.minDistance = CAMERA.minDistance
  controls.maxDistance = CAMERA.maxDistance
  controls.maxPolarAngle = CAMERA.maxPolarAngle
  controls.enablePan = false
  controls.update()

  const hemi = new THREE.HemisphereLight(COLORS.hemiSky, COLORS.hemiGround, 1.15)
  scene.add(hemi)

  // The key light casts the arena's shadows. Its ortho frustum is fitted to the
  // ring exactly — any bigger and the 2048 map turns to mush.
  const sun = new THREE.DirectionalLight(ATMO.dusk.sun, ATMO.dusk.sunI)
  sun.position.set(90, 120, -160)
  sun.castShadow = true
  sun.shadow.mapSize.set(2048, 2048)
  sun.shadow.camera.left = -ARENA.rim * 1.25
  sun.shadow.camera.right = ARENA.rim * 1.25
  sun.shadow.camera.top = ARENA.rim * 1.25
  sun.shadow.camera.bottom = -ARENA.rim * 1.25
  sun.shadow.camera.near = 40
  sun.shadow.camera.far = 420
  sun.shadow.bias = -0.0006
  sun.shadow.normalBias = 0.55
  sun.shadow.intensity = 0.72 // let some bounce light into the shadowed side
  scene.add(sun)
  scene.add(sun.target)

  // a cool fill from the opposite side so the shadowed faces aren't dead black
  const fill = new THREE.DirectionalLight(0x9dc0ea, 0.7)
  fill.position.set(-110, 70, 120)
  scene.add(fill)

  // --- post chain: render -> bloom -> tone map/sRGB out ---
  const composer = new EffectComposer(renderer)
  composer.setPixelRatio(dpr())
  composer.setSize(window.innerWidth, window.innerHeight)
  composer.addPass(new RenderPass(scene, camera))
  const bloom = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    0.42, // strength
    0.45, // radius
    1.25 //  threshold — ONLY fire, tracers and the ring bloom; lit ground must not.
    //        Raise this whenever the scene gets brighter, or the frame fogs to milk.
  )
  composer.addPass(bloom)
  composer.addPass(new OutputPass())

  function resize() {
    const w = window.innerWidth
    const h = window.innerHeight
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    renderer.setPixelRatio(dpr())
    renderer.setSize(w, h, false)
    composer.setPixelRatio(dpr())
    composer.setSize(w, h)
    bloom.resolution.set(w, h)
  }
  window.addEventListener('resize', resize)

  return {
    renderer,
    scene,
    camera,
    controls,
    fog,
    sun,
    fill,
    hemi,
    sky,
    bloom,
    render: () => composer.render(),
    resize,
    dispose() {
      window.removeEventListener('resize', resize)
      sky.dispose()
      composer.dispose()
      controls.dispose()
      renderer.dispose()
    },
  }
}
