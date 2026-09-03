// ============================================================================
// juice.js — the game-feel layer: time dilation on a whale hit, camera shake,
// and the full-screen DOM effects (whiteouts, lightning, the winner's colour
// wash, the pressure vignette). It only reads state scalars, so the drama is
// data-driven and can never stall the render loop.
// ============================================================================

export function createJuice(camera) {
  const flash = document.createElement('div')
  flash.className = 'fx-flash'
  const vignette = document.createElement('div')
  vignette.className = 'fx-vignette'
  document.body.appendChild(vignette)
  document.body.appendChild(flash)

  let clock = 0

  /** Dilate simulation dt during hit-stop; the hit-stop itself burns REAL time. */
  function getDt(rawDt, state) {
    const s = state.scalars
    if (s.hitStop > 0) {
      s.hitStop = Math.max(0, s.hitStop - rawDt)
      return rawDt * 0.16
    }
    return rawDt
  }

  /** Called after the camera has been positioned, before render. */
  function update(rawDt, state) {
    clock += rawDt
    const s = state.scalars

    if (s.shake > 0.001) {
      const m = s.shake
      camera.position.x += (Math.random() - 0.5) * m * 2 + s.shakeDirX * m * 0.4
      camera.position.y += (Math.random() - 0.5) * m * 2
      camera.position.z += (Math.random() - 0.5) * m * 2 + s.shakeDirZ * m * 0.4
    }

    if (s.flashWhite > 0) {
      flash.style.background = '#ffffff'
      flash.style.opacity = Math.min(1, s.flashWhite * 3.2)
    } else if (s.lightning > 0) {
      flash.style.background = '#ffffff'
      flash.style.opacity = Math.min(0.8, s.lightning * 8)
    } else if (s.winnerFx > 0 && s.winner) {
      // a punch, not a haze: the colour wash is gone inside a second, and the
      // celebration then lives in the vignette and the fireworks instead
      const c = state.bySymbol.get(s.winner.symbol)?.colorCss || '#ffffff'
      const since = 9 - s.winnerFx
      flash.style.background = `radial-gradient(circle at 50% 55%, ${c}55, transparent 52%)`
      flash.style.opacity = Math.max(0, 0.45 - since * 0.6)
    } else {
      flash.style.opacity = 0
    }

    // the closing ring's last seconds tint the frame red; otherwise the vignette
    // just carries the market's mood
    const closing = s.roundProgress > 0.9 && s.winnerFx <= 0
    if (s.winnerFx > 0 && s.winner) {
      const c = state.bySymbol.get(s.winner.symbol)?.colorCss || '#ffffff'
      vignette.style.boxShadow = `inset 0 0 190px 12px ${c}30`
    } else if (closing) {
      const strobe = 0.3 + 0.3 * Math.sin(clock * 14)
      vignette.style.boxShadow = `inset 0 0 ${170 + strobe * 90}px ${34 + strobe * 40}px rgba(255,70,90,${0.32 + strobe * 0.28})`
    } else {
      const p = s.aggPressure
      const col =
        p > 0.08
          ? `rgba(40,220,120,${Math.min(0.2, p * 0.6)})`
          : p < -0.08
          ? `rgba(255,60,60,${Math.min(0.26, -p * 0.7)})`
          : 'rgba(0,0,0,0)'
      vignette.style.boxShadow = `inset 0 0 220px 60px ${col}`
    }
  }

  return {
    getDt,
    update,
    dispose() {
      flash.remove()
      vignette.remove()
    },
  }
}
