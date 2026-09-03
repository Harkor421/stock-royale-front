// ============================================================================
// logos.js — the winner's brand mark for the citadel flag.
//
// The SVGs in public/logos are the Simple Icons set (CC0), loaded from our own
// origin so drawing them to a canvas never taints it. Two of the eight aren't
// there: Amazon and Microsoft had their marks removed from that icon set at
// their own request, and sourcing them from somewhere else to redistribute
// would go around that on purpose. Those two fly a bold ticker wordmark
// instead, which reads just as clearly at flag size.
//
// Every mark is a single-colour silhouette, so it can be re-inked to whatever
// contrasts with the army colour flying it.
// ============================================================================

const WITH_LOGO = ['NVDA', 'TSLA', 'AAPL', 'META', 'GOOGL', 'AMD']

const images = new Map() // ticker -> HTMLImageElement (only once decoded)

const RASTER = 512
const pending = new Set()

/**
 * Kick off loading. Missing or slow marks simply never draw; nothing waits.
 *
 * These SVGs carry only a viewBox — no width/height — and an <img> built from
 * one of those reports naturalWidth 0, so drawImage would scale it to nothing.
 * So the file is fetched as text, given explicit pixel dimensions taken from
 * its viewBox aspect, and handed to the decoder as a data URI.
 */
export function preloadLogos(tickers) {
  for (const t of tickers) {
    if (!WITH_LOGO.includes(t) || images.has(t) || pending.has(t)) continue
    pending.add(t)
    fetch(`logos/${t}.svg`)
      .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
      .then((svg) => {
        const vb = /viewBox="([\d.\s-]+)"/.exec(svg)
        let w = RASTER
        let h = RASTER
        if (vb) {
          const [, , vw, vh] = vb[1].trim().split(/\s+/).map(Number)
          if (vw > 0 && vh > 0) {
            const k = RASTER / Math.max(vw, vh)
            w = Math.round(vw * k)
            h = Math.round(vh * k)
          }
        }
        const sized = svg.replace('<svg', `<svg width="${w}" height="${h}"`)
        const img = new Image()
        img.decoding = 'async'
        img.onload = () => images.set(t, img)
        img.onerror = () => {}
        img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(sized)
      })
      .catch(() => {})
      .finally(() => pending.delete(t))
  }
}

/** WCAG relative luminance — decides whether a colour wants black or white ink. */
export function luminance(hex) {
  const c = (v) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * c((hex >> 16) & 255) + 0.7152 * c((hex >> 8) & 255) + 0.0722 * c(hex & 255)
}

/** Ink that reads on the given background: near-black on light, white on dark. */
export const inkFor = (hex) => (luminance(hex) > 0.42 ? '#0a0d12' : '#ffffff')

const scratch = document.createElement('canvas')
const sctx = scratch.getContext('2d')

/**
 * Draw a ticker's mark into ctx, re-inked, fitted inside a box.
 * Returns false when there is no mark to draw (the caller falls back to text).
 */
export function drawLogo(ctx, ticker, ink, cx, cy, boxW, boxH) {
  const img = images.get(ticker)
  const iw = img?.naturalWidth || img?.width || 0
  const ih = img?.naturalHeight || img?.height || 0
  if (!iw || !ih) return false

  const scale = Math.min(boxW / iw, boxH / ih)
  const w = Math.max(1, Math.round(iw * scale))
  const h = Math.max(1, Math.round(ih * scale))

  // Re-ink on a scratch canvas: draw the silhouette, then flood it with the ink
  // through source-in so only the glyph is painted.
  scratch.width = w
  scratch.height = h
  sctx.clearRect(0, 0, w, h)
  sctx.drawImage(img, 0, 0, w, h)
  sctx.globalCompositeOperation = 'source-in'
  sctx.fillStyle = ink
  sctx.fillRect(0, 0, w, h)
  sctx.globalCompositeOperation = 'source-over'

  ctx.drawImage(scratch, Math.round(cx - w / 2), Math.round(cy - h / 2))
  return true
}

export const hasLogo = (ticker) => images.has(ticker)
