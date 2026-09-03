// ============================================================================
// banners.js — one floating sign per army, standing over its rear lines:
// ticker, round performance, rank. Canvas sprites redrawn a few times a second
// (not every frame), so eight live scoreboards cost almost nothing.
//
// This is what makes the arena readable without the HUD: from any angle you can
// see which colour belongs to which ticker and how it's doing.
// ============================================================================

import * as THREE from 'three'
import { ARENA, ARMIES, sampleHeight, polar, fmtPct } from './config.js'

const CW = 384
const CH = 192
const _p = { x: 0, z: 0 }

export function createBanners(scene) {
  const _ptTmp = new THREE.Vector3()
  const slots = []
  for (let i = 0; i < ARMIES; i++) {
    const canvas = document.createElement('canvas')
    canvas.width = CW
    canvas.height = CH
    const tex = new THREE.CanvasTexture(canvas)
    tex.colorSpace = THREE.SRGBColorSpace
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false })
    const sprite = new THREE.Sprite(mat)
    sprite.renderOrder = 4
    sprite.scale.set(13, 6.5, 1)
    scene.add(sprite)
    slots.push({ canvas, ctx: canvas.getContext('2d'), tex, mat, sprite, sig: '' })
  }

  function draw(slot, army, leading) {
    const ctx = slot.ctx
    ctx.clearRect(0, 0, CW, CH)
    ctx.textAlign = 'center'

    // plate
    const r = 16
    ctx.beginPath()
    ctx.roundRect(10, 22, CW - 20, CH - 58, r)
    ctx.fillStyle = 'rgba(9,12,18,0.72)'
    ctx.fill()
    ctx.lineWidth = leading ? 6 : 3
    ctx.strokeStyle = army.colorCss
    ctx.stroke()

    ctx.shadowColor = 'rgba(0,0,0,0.9)'
    ctx.shadowBlur = 8

    ctx.font = '800 62px "Barlow Condensed", "JetBrains Mono", sans-serif'
    ctx.fillStyle = army.colorCss
    ctx.fillText(army.symbol, CW / 2, 92)

    ctx.font = '700 44px "JetBrains Mono", monospace'
    ctx.fillStyle = army.pct >= 0 ? '#4ade80' : '#ff6b6b'
    ctx.fillText(fmtPct(army.pct), CW / 2, 142)

    ctx.font = '700 26px "Barlow Condensed", sans-serif'
    ctx.fillStyle = leading ? '#ffd447' : 'rgba(190,200,214,0.85)'
    ctx.fillText(leading ? '★ HOLDING THE HILL' : `#${army.rank}`, CW / 2, 176)

    slot.tex.needsUpdate = true
  }

  /** Redraw only what changed; called at the HUD's cadence, not per frame. */
  function refresh(state) {
    for (let i = 0; i < ARMIES; i++) {
      const army = state.armies[i]
      const leading = state.scalars.leader === i
      const sig = `${army.symbol}|${army.pct.toFixed(2)}|${army.rank}|${leading}`
      if (slots[i].sig === sig) continue
      slots[i].sig = sig
      draw(slots[i], army, leading)
    }
  }

  /** Positions follow each army's frontline, so the signs advance with them. */
  function update(state, dt) {
    for (let i = 0; i < ARMIES; i++) {
      const army = state.armies[i]
      polar(Math.min(ARENA.rim - 3, army.front + 22), army.angle, _p)
      const y = sampleHeight(_p.x, _p.z) + 11
      const s = slots[i].sprite
      s.position.lerp(_ptTmp.set(_p.x, y, _p.z), 1 - Math.exp(-dt / 0.5))
      const leading = state.scalars.leader === i
      const scale = leading ? 1.16 : 1
      s.scale.set(13 * scale, 6.5 * scale, 1)
      slots[i].mat.opacity = leading ? 1 : 0.86
    }
  }

  return {
    refresh,
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
