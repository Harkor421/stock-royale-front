// ============================================================================
// main.js — boot + the single animation loop.
//
//   wire:    backend --emit--> bus --> director --> simulator.applyEvent(state)
//   render:  loop -> simulator.step(state) -> every renderer .sync(state)
//                 -> arena/atmosphere/camera/juice -> composer.render()
//
// The HUD and the battlefield both read `state`, so they can never disagree.
// Swapping the data source is one line; nothing in the render layer changes.
// ============================================================================

import * as THREE from 'three'
import { CADENCE } from './config.js'
import { createBus } from './events.js'
import { createState } from './state.js'
import { createScene } from './scene.js'
import { createUnitAssets } from './materials.js'
import { createArena } from './arena.js'
import { createArmies } from './armies.js'
import { createVehicles } from './vehicles.js'
import { createPlanes } from './planes.js'
import { createEffects } from './effects.js'
import { createLabels } from './labels.js'
import { createBanners } from './banners.js'
import { createComic } from './comic.js'
import { createConvoy } from './convoy.js'
import { createAtmosphere } from './atmosphere.js'
import { createJuice } from './juice.js'
import { createAudio } from './audio.js'
import { createCameraDirector } from './cameraDirector.js'
import { createDirector } from './director.js'
import { createHud } from './hud/hud.js'
import { step } from './simulator.js'
import { BackendSource } from './sources/backendSource.js'
import * as logosModule from './logos.js'

const canvas = document.getElementById('scene')
const bus = createBus()
const state = createState()

const view = createScene(canvas)
const assets = createUnitAssets()
const arena = createArena(view.scene, assets)
const armies = createArmies(view.scene, assets)
const vehicles = createVehicles(view.scene, assets)
const planes = createPlanes(view.scene, assets)
const effects = createEffects(view.scene, state, assets)
const labels = createLabels(view.scene)
const banners = createBanners(view.scene)
const comic = createComic(view.scene)
const convoy = createConvoy(view.scene, assets)
const atmosphere = createAtmosphere(view.scene, view.sun, view.hemi, view.fog, view.sky)
const juice = createJuice(view.camera)
const audio = createAudio()
const hud = createHud(document.getElementById('hud'))
const cameraDirector = createCameraDirector(view.camera, view.controls, state)
const director = createDirector(state, hud, labels, audio, cameraDirector, comic)

// Sound is off until the viewer asks for it — browsers block audio before a
// gesture, and an unmuted broadcast that autoplays is nobody's friend.
let muted = true
audio.setMuted(true)
hud.setSoundIcon(true)
function toggleSound() {
  muted = !muted
  audio.setMuted(muted)
  if (!muted) audio.resume()
  hud.setSoundIcon(muted)
}
hud.onSoundToggle(toggleSound)
window.addEventListener('keydown', (e) => {
  if (e.key === 'm' || e.key === 'M') toggleSound()
})

bus.subscribe((e) => director.handle(e))

const source = new BackendSource(bus)
source.onStatus((ok) => {
  state.scalars.connected = ok
})
source.start()

// --- the loops -------------------------------------------------------------
// TWO clocks on purpose. The 3D runs on requestAnimationFrame, which the
// browser pauses whenever the tab is hidden or occluded. The HUD runs on a
// timer instead, so a scoreboard left up on a second monitor — or in a
// background tab — keeps showing live prices and a truthful round countdown
// even while the battlefield is parked.
const clock = new THREE.Clock()
let bannerAccum = 0
let lastCountdownSec = -1
let winnerShown = false

function frame() {
  const rawDt = Math.min(clock.getDelta(), 1 / 30)
  const dt = juice.getDt(rawDt, state)

  step(state, dt)

  armies.sync(state)
  vehicles.sync(state)
  planes.sync(state)
  effects.sync(state)
  labels.update(rawDt)
  comic.update(rawDt)
  banners.update(state, rawDt)
  convoy.update(state, rawDt)
  arena.update(state, rawDt)
  atmosphere.update(rawDt, state)
  cameraDirector.update(rawDt)
  juice.update(rawDt, state)

  view.render()

  bannerAccum += rawDt
  if (bannerAccum >= CADENCE.bannerMs / 1000) {
    bannerAccum = 0
    banners.refresh(state)
  }

  raf = requestAnimationFrame(frame)
}
let raf = requestAnimationFrame(frame)

function hudTick() {
  const s = state.scalars
  hud.update(state)

  // the last ten seconds tick down audibly
  if (s.round && s.session?.live && s.winnerFx <= 0) {
    const left = Math.max(0, s.round.endsAt - (Date.now() + s.serverSkewMs))
    const sec = Math.ceil(left / 1000)
    if (sec !== lastCountdownSec) {
      if (sec <= 10 && sec > 0) audio.tick(sec <= 3)
      lastCountdownSec = sec
    }
  }

  // the victory card lives exactly as long as the cinematic
  if (s.winnerFx > 0) winnerShown = true
  else if (winnerShown) {
    winnerShown = false
    hud.hideWinner()
  }
}
const hudTimer = setInterval(hudTick, CADENCE.hudMs)

// A dev-only handle for poking at the world from the console (draw calls,
// forcing a camera cut, inspecting state). Stripped from production builds.
if (import.meta.env.DEV) {
  window.__royale = {
    view, state, hud, cameraDirector, bus, logos: logosModule,
    /** Advance the world by hand — the only way to inspect the 3D from a
     *  headless/occluded tab, where requestAnimationFrame never fires. */
    tick(frames = 1, dt = 1 / 60) {
      for (let i = 0; i < frames; i++) {
        step(state, dt)
        armies.sync(state); vehicles.sync(state); planes.sync(state); effects.sync(state)
        labels.update(dt); comic.update(dt); banners.update(state, dt); banners.refresh(state); convoy.update(state, dt)
        arena.update(state, dt); atmosphere.update(dt, state)
        cameraDirector.update(dt); juice.update(dt, state)
      }
      view.render()
      hudTick()
      return 'ticked ' + frames
    },
  }
}

// --- HMR cleanup (dev) so hot reload doesn't leak GPU resources ---
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    cancelAnimationFrame(raf)
    clearInterval(hudTimer)
    source.stop()
    bus.clear()
    hud.dispose()
    juice.dispose()
    arena.dispose()
    armies.dispose()
    vehicles.dispose()
    planes.dispose()
    effects.dispose()
    labels.dispose()
    comic.dispose()
    convoy.dispose()
    banners.dispose()
    assets.dispose()
    view.dispose()
  })
}
