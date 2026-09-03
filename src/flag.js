// ============================================================================
// flag.js — a team's colours and brand mark painted onto a canvas texture.
//
// Used twice: by the citadel's big banner for whoever holds the hill, and by
// each army's banner truck. Sharing it means the mark, the ink contrast and the
// fallback for the two companies with no icon behave identically everywhere.
// ============================================================================

import * as THREE from 'three'
import { drawLogo, inkFor, hasLogo } from './logos.js'

export function createFlagTexture(w = 512, h = 320) {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  const texture = new THREE.CanvasTexture(canvas)
  texture.colorSpace = THREE.SRGBColorSpace
  texture.anisotropy = 8
  let sig = ''

  /** Repaint for an army. Returns true if anything actually changed. */
  function paint(army, opts = {}) {
    const key = army ? `${army.symbol}|${hasLogo(army.symbol) ? 1 : 0}|${opts.compact ? 1 : 0}` : '-'
    if (key === sig) return false
    sig = key

    const colorCss = army ? army.colorCss : '#8a8a8a'
    const hex = army ? army.color : 0x8a8a8a
    const ink = inkFor(hex)

    ctx.clearRect(0, 0, w, h)
    ctx.fillStyle = colorCss
    ctx.fillRect(0, 0, w, h)

    // hoist band + border, so it reads as cloth rather than a coloured rectangle
    ctx.fillStyle = ink
    ctx.globalAlpha = 0.16
    ctx.fillRect(0, 0, Math.round(w * 0.04), h)
    ctx.globalAlpha = 0.35
    ctx.strokeStyle = ink
    ctx.lineWidth = Math.round(h * 0.018)
    ctx.strokeRect(3, 3, w - 6, h - 6)
    ctx.globalAlpha = 1

    if (!army) {
      texture.needsUpdate = true
      return true
    }

    const cx = w / 2 + w * 0.02
    ctx.fillStyle = ink
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'

    if (opts.compact) {
      // truck-sized: the mark alone if there is one, otherwise the ticker
      if (!drawLogo(ctx, army.symbol, ink, cx, h * 0.44, w * 0.5, h * 0.56)) {
        ctx.font = `800 ${Math.round(h * 0.42)}px "JetBrains Mono", monospace`
        ctx.fillText(army.symbol, cx, h * 0.46)
      } else {
        ctx.font = `800 ${Math.round(h * 0.19)}px "JetBrains Mono", monospace`
        ctx.fillText(army.symbol, cx, h * 0.87)
      }
    } else if (drawLogo(ctx, army.symbol, ink, cx, h * 0.4, w * 0.5, h * 0.46)) {
      ctx.font = `800 ${Math.round(h * 0.185)}px "JetBrains Mono", monospace`
      ctx.fillText(army.symbol, cx, h * 0.83)
    } else {
      // Amazon and Microsoft: no mark in the icon set, so a wordmark instead
      ctx.font = `800 ${Math.round(h * 0.32)}px "JetBrains Mono", monospace`
      ctx.fillText(army.symbol, cx, h * 0.44)
      ctx.font = `600 ${Math.round(h * 0.1)}px "JetBrains Mono", monospace`
      ctx.globalAlpha = 0.75
      ctx.fillText(army.name.toUpperCase(), cx, h * 0.68)
      ctx.globalAlpha = 1
    }
    texture.needsUpdate = true
    return true
  }

  return { canvas, ctx, texture, paint, dispose: () => texture.dispose() }
}
