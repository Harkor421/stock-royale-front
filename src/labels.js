// ============================================================================
// labels.js — floating price tags in the scene. A notable print pops a
// billboard above that army's frontline showing the dollar size and the price
// it went off at, then rises and fades. Pooled CanvasTexture sprites: the
// canvas is only redrawn when a tag spawns.
// ============================================================================

import * as THREE from 'three'
import { CAPS, ARENA, COLORS, sampleHeight, polar, fmtUsd } from './config.js'

const CW = 340
const CH = 104
const _p = { x: 0, z: 0 }

const hexCss = (hex) => '#' + hex.toString(16).padStart(6, '0')

export function createLabels(scene) {
  const slots = []
  for (let i = 0; i < CAPS.LABELS; i++) {
    const canvas = document.createElement('canvas')
    canvas.width = CW
    canvas.height = CH
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false, depthWrite: false })
    const sprite = new THREE.Sprite(mat)
    sprite.visible = false
    sprite.renderOrder = 5
    sprite.scale.set(11, 3.4, 1)
    scene.add(sprite)
    slots.push({ canvas, ctx: canvas.getContext('2d'), tex, mat, sprite, active: false, life: 0, maxlife: 1, vy: 0 })
  }

  function pick() {
    let oldest = slots[0]
    for (const s of slots) {
      if (!s.active) return s
      if (s.life < oldest.life) oldest = s
    }
    return oldest
  }

  function draw(slot, big, small, color) {
    const ctx = slot.ctx
    ctx.clearRect(0, 0, CW, CH)
    const x = 6, y = 8, w = CW - 12, h = CH - 20
    ctx.fillStyle = 'rgba(6,9,13,0.86)'
    ctx.fillRect(x, y, w, h)
    ctx.lineWidth = 2
    ctx.strokeStyle = color
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2)

    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    ctx.font = '700 38px "JetBrains Mono", monospace'
    ctx.fillStyle = color
    ctx.fillText(big, x + 14, y + 40)
    ctx.font = '500 22px "JetBrains Mono", monospace'
    ctx.fillStyle = 'rgba(170,182,198,0.95)'
    ctx.fillText(small, x + 14, y + 70)
    slot.tex.needsUpdate = true
  }

  /** Pop a tag for one print, above the army it belongs to. */
  function spawn(e, state) {
    const army = state.bySymbol.get(e.symbol)
    if (!army) return
    const side = e.side === 'buy' ? 0 : 1
    const a = army.angle + (Math.random() - 0.5) * ARENA.wedgeHalf * 1.2
    const r = army.front + (side === 0 ? 8 + Math.random() * 8 : -8 - Math.random() * 6)
    polar(Math.max(ARENA.hillR + 2, r), a, _p)
    const y = sampleHeight(_p.x, _p.z) + 5 + Math.random() * 2.5

    const color = side === 0 ? army.colorCss : hexCss(0xff5a5a)
    const big = `${side === 0 ? '+' : '−'}${fmtUsd(e.notional)}`
    const small = `${e.symbol} @ $${e.price.toFixed(2)}`

    const slot = pick()
    draw(slot, big, small, color)
    slot.sprite.position.set(_p.x, y, _p.z)
    const scale = e.bucket === 'whale' ? 1.55 : e.bucket === 'dolphin' ? 1.22 : 1
    slot.sprite.scale.set(11 * scale, 3.4 * scale, 1)
    slot.active = true
    slot.maxlife = 1.9 + scale * 0.4
    slot.life = slot.maxlife
    slot.vy = 2.6
    slot.sprite.visible = true
    slot.mat.opacity = 0
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
      s.sprite.position.y += s.vy * dt
      s.vy *= 1 - dt * 1.5
      const t = s.life / s.maxlife
      s.mat.opacity = Math.min(Math.min(1, (1 - t) / 0.12), Math.min(1, t / 0.45))
    }
  }

  return {
    spawn,
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
