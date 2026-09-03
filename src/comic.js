// ============================================================================
// comic.js — the loud bits. Comic-book onomatopoeia that pops over the field
// when something big lands: BOOM on a block bid, CRASH on a dump, POW on the
// armour. Pooled CanvasTexture sprites, same as the price tags, so a burst
// costs one canvas redraw and nothing per frame.
//
// It exists to make a sparse tape feel alive: a print every couple of seconds
// is not much to watch, and a word that punches in and rocks back reads as an
// event from across the room in a way a small number never will.
// ============================================================================

import * as THREE from 'three'
import { ARENA, sampleHeight, polar } from './config.js'

const CW = 512
const CH = 200
const POOL = 14
const _p = { x: 0, z: 0 }

export const WORDS = Object.freeze({
  bigBuy: ['BOOM!', 'KA-CHING!', 'BAM!', 'YES!'],
  bigSell: ['CRASH!', 'DUMP!', 'SLAM!', 'OOF!'],
  armour: ['POW!', 'BLAM!', 'THUD!', 'KRAK!'],
  takeover: ['TAKEOVER!', 'THE HILL!', 'PUSH!'],
})
export const pick = (arr) => arr[(Math.random() * arr.length) | 0]

export function createComic(scene) {
  const slots = []
  for (let i = 0; i < POOL; i++) {
    const canvas = document.createElement('canvas')
    canvas.width = CW
    canvas.height = CH
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false })
    const sprite = new THREE.Sprite(mat)
    sprite.visible = false
    sprite.renderOrder = 7
    scene.add(sprite)
    slots.push({ canvas, ctx: canvas.getContext('2d'), tex, mat, sprite, active: false, life: 0, maxlife: 1, vy: 0, base: 1 })
  }

  function pickSlot() {
    let oldest = slots[0]
    for (const s of slots) {
      if (!s.active) return s
      if (s.life < oldest.life) oldest = s
    }
    return oldest
  }

  function draw(slot, word, fill) {
    const ctx = slot.ctx
    ctx.clearRect(0, 0, CW, CH)
    ctx.save()
    ctx.translate(CW / 2, CH / 2)
    ctx.rotate(-0.08)
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    // fit the word to the canvas so long ones don't get clipped
    let size = 108
    ctx.font = `900 ${size}px "Barlow Condensed", "JetBrains Mono", sans-serif`
    while (ctx.measureText(word).width > CW - 60 && size > 40) {
      size -= 6
      ctx.font = `900 ${size}px "Barlow Condensed", "JetBrains Mono", sans-serif`
    }

    // heavy outline first, then the fill: the classic comic read
    ctx.lineJoin = 'round'
    ctx.miterLimit = 2
    ctx.strokeStyle = '#05070b'
    ctx.lineWidth = size * 0.26
    ctx.strokeText(word, 0, 0)
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = size * 0.1
    ctx.strokeText(word, 0, 0)
    ctx.fillStyle = fill
    ctx.fillText(word, 0, 0)
    ctx.restore()
    slot.tex.needsUpdate = true
  }

  /** Pop a word above an army's frontline. */
  function burst(army, word, fill, scale = 1) {
    const a = army.angle + (Math.random() - 0.5) * ARENA.wedgeHalf
    polar(Math.max(ARENA.hillR + 4, army.front + (Math.random() - 0.5) * 10), a, _p)
    const y = sampleHeight(_p.x, _p.z) + 8 + Math.random() * 4

    const slot = pickSlot()
    draw(slot, word, fill)
    slot.sprite.position.set(_p.x, y, _p.z)
    slot.base = 15 * scale
    slot.active = true
    slot.maxlife = 1.5
    slot.life = slot.maxlife
    slot.vy = 4.2
    slot.sprite.visible = true
    slot.mat.opacity = 1
    slot.sprite.scale.set(slot.base * 0.3, slot.base * 0.3 * (CH / CW), 1)
  }

  function update(dt) {
    for (const s of slots) {
      if (!s.active) continue
      s.life -= dt
      if (s.life <= 0) {
        s.active = false
        s.sprite.visible = false
        continue
      }
      const t = 1 - s.life / s.maxlife // 0 -> 1
      s.sprite.position.y += s.vy * dt
      s.vy *= 1 - dt * 2.4
      // punch in past full size, settle back, then fall away
      const pop = t < 0.16 ? 0.3 + (t / 0.16) * 0.95 : 1.25 - Math.min(1, (t - 0.16) / 0.2) * 0.25
      const w = s.base * pop
      s.sprite.scale.set(w, w * (CH / CW), 1)
      s.mat.opacity = t > 0.62 ? Math.max(0, 1 - (t - 0.62) / 0.38) : 1
    }
  }

  return {
    burst,
    update,
    dispose() {
      for (const s of slots) {
        scene.remove(s.sprite)
        s.tex.dispose()
        s.mat.dispose()
      }
    },
  }
}
