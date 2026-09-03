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
const CH = 232
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
    // depthTest off: a sign that the terrain, the closing ring or a smoke plume
    // can hide is a sign nobody reads. These are labels, not scenery.
    const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false })
    const sprite = new THREE.Sprite(mat)
    sprite.renderOrder = 6
    sprite.scale.set(11.5, 7, 1)
    scene.add(sprite)
    slots.push({ canvas, ctx: canvas.getContext('2d'), tex, mat, sprite, sig: '' })
  }

  function draw(slot, army, leading) {
    const ctx = slot.ctx
    ctx.clearRect(0, 0, CW, CH)

    // A terminal chip, not a game plaque: square corners, hairline border, a
    // colour bar down the left edge that ties the sign to its wedge.
    const x = 8, y = 16, w = CW - 16, h = CH - 44
    ctx.fillStyle = 'rgba(6,9,13,0.90)'
    ctx.fillRect(x, y, w, h)
    ctx.lineWidth = 2
    ctx.strokeStyle = leading ? '#ffb020' : 'rgba(255,255,255,0.22)'
    ctx.strokeRect(x + 1, y + 1, w - 2, h - 2)
    ctx.fillStyle = army.colorCss
    ctx.fillRect(x, y, 7, h)

    const L = x + 22
    ctx.textBaseline = 'alphabetic'

    ctx.textAlign = 'left'
    ctx.font = '700 46px "JetBrains Mono", monospace'
    ctx.fillStyle = army.colorCss
    ctx.fillText(army.symbol, L, y + 50)

    ctx.textAlign = 'right'
    ctx.font = '700 26px "JetBrains Mono", monospace'
    ctx.fillStyle = leading ? '#ffb020' : 'rgba(150,163,180,0.9)'
    ctx.fillText(leading ? 'LEAD' : '#' + army.rank, x + w - 16, y + 48)

    // the live price is the headline number on the field
    ctx.textAlign = 'left'
    ctx.font = '700 44px "JetBrains Mono", monospace'
    ctx.fillStyle = '#e7eef7'
    ctx.fillText(army.price > 0 ? army.price.toFixed(2) : '--.--', L, y + 100)

    ctx.font = '700 34px "JetBrains Mono", monospace'
    ctx.fillStyle = army.pct >= 0 ? '#00d68f' : '#ff4d55'
    ctx.fillText(fmtPct(army.pct), L, y + 142)

    slot.tex.needsUpdate = true
  }

  /** Redraw only what changed; called at the HUD's cadence, not per frame. */
  function refresh(state) {
    for (let i = 0; i < ARMIES; i++) {
      const army = state.armies[i]
      const leading = state.scalars.leader === i
      const sig = `${army.symbol}|${army.price.toFixed(2)}|${army.pct.toFixed(2)}|${army.rank}|${leading}`
      if (slots[i].sig === sig) continue
      slots[i].sig = sig
      draw(slots[i], army, leading)
    }
  }

  /** Positions follow each army's frontline, so the signs advance with them. */
  function update(state, dt) {
    for (let i = 0; i < ARMIES; i++) {
      const army = state.armies[i]
      // ride just behind the army's own frontline, but never so far out that the
      // sign leaves frame when a ticker is getting hammered
      const r = Math.max(ARENA.hillR + 24, Math.min(ARENA.rim - 12, army.front + 16))
      polar(r, army.angle, _p)
      const y = sampleHeight(_p.x, _p.z) + 16
      const s = slots[i].sprite
      s.position.lerp(_ptTmp.set(_p.x, y, _p.z), 1 - Math.exp(-dt / 0.5))
      const leading = state.scalars.leader === i
      const scale = leading ? 1.16 : 1
      s.scale.set(11.5 * scale, 7 * scale, 1)
      slots[i].mat.opacity = leading ? 1 : 0.94
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
