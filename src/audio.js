// ============================================================================
// audio.js — procedural sound effects via the Web Audio API. No sound files:
// every effect is synthesized (oscillators + filtered noise), so it stays in
// the "everything generated in code" spirit and adds zero assets.
//
// The AudioContext starts suspended (browser autoplay policy) and is resumed on
// the first user gesture. All effects are rate-limited so a busy feed never
// turns into noise.
// ============================================================================

export function createAudio() {
  let ctx = null
  let master = null
  let noise = null
  let muted = false
  let lastBlip = 0
  let lastBoom = 0

  function ensure() {
    if (ctx) return ctx
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return null
    ctx = new AC()
    master = ctx.createGain()
    master.gain.value = 0.5
    master.connect(ctx.destination)
    // one reusable 1s white-noise buffer
    const len = ctx.sampleRate
    noise = ctx.createBuffer(1, len, ctx.sampleRate)
    const d = noise.getChannelData(0)
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1
    return ctx
  }

  function resume() {
    const c = ensure()
    if (c && c.state === 'suspended') c.resume()
  }
  function setMuted(m) {
    muted = m
    if (master) master.gain.value = m ? 0 : 0.5
  }
  const on = () => ensure() && !muted && ctx.state === 'running'
  const t0 = () => ctx.currentTime

  function tone(freq, freqEnd, dur, type, gain, delay = 0) {
    const t = t0() + delay
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    o.type = type
    o.frequency.setValueAtTime(freq, t)
    o.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t + dur)
    g.gain.setValueAtTime(0.0001, t)
    g.gain.exponentialRampToValueAtTime(gain, t + dur * 0.06)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    o.connect(g).connect(master)
    o.start(t)
    o.stop(t + dur + 0.02)
  }

  function noiseBurst(dur, filterType, freq, freqEnd, gain, delay = 0) {
    const t = t0() + delay
    const src = ctx.createBufferSource()
    src.buffer = noise
    const f = ctx.createBiquadFilter()
    f.type = filterType
    f.frequency.setValueAtTime(freq, t)
    f.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t + dur)
    const g = ctx.createGain()
    g.gain.setValueAtTime(gain, t)
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur)
    src.connect(f).connect(g).connect(master)
    src.start(t)
    src.stop(t + dur + 0.02)
  }

  return {
    resume,
    setMuted,
    isMuted: () => muted,

    /** small trade: soft pluck, up for buy / down for sell */
    blip(side) {
      if (!on()) return
      const now = ctx.currentTime
      if (now - lastBlip < 0.06) return
      lastBlip = now
      const buy = side === 'buy'
      tone(buy ? 430 : 400, buy ? 680 : 250, 0.12, 'triangle', 0.12)
    },

    /** whale / explosion boom */
    boom(mag = 1) {
      if (!on()) return
      const now = ctx.currentTime
      if (now - lastBoom < 0.08) return
      lastBoom = now
      tone(150 * mag, 40, 0.5, 'sine', 0.5)
      noiseBurst(0.35, 'lowpass', 900, 120, 0.4 * mag)
    },

    /** dev / rug alarm wail */
    siren() {
      if (!on()) return
      tone(720, 520, 0.28, 'sawtooth', 0.18)
      tone(520, 760, 0.28, 'sawtooth', 0.16, 0.28)
    },

    /** King of the Hill fanfare */
    koth() {
      if (!on()) return
      ;[523, 659, 784].forEach((f, i) => tone(f, f, 0.18, 'square', 0.14, i * 0.09))
    },

    /** graduation — rising arpeggio */
    grad() {
      if (!on()) return
      ;[392, 523, 659, 784, 1046].forEach((f, i) => tone(f, f, 0.22, 'triangle', 0.16, i * 0.11))
    },

    /** the nuke — huge sub + long roaring noise tail */
    nuke() {
      if (!on()) return
      tone(90, 18, 1.4, 'sine', 0.8)
      tone(140, 30, 0.9, 'sawtooth', 0.4)
      noiseBurst(1.2, 'lowpass', 1400, 60, 0.7)
      noiseBurst(0.9, 'lowpass', 400, 40, 0.5, 0.15)
    },

    /** one tick of the last-ten-seconds countdown */
    tick(last = false) {
      if (!on()) return
      tone(last ? 1200 : 880, last ? 1200 : 880, 0.07, 'square', last ? 0.16 : 0.09)
    },

    /** the winner is crowned — fanfare over a boom */
    victory() {
      if (!on()) return
      ;[523, 659, 784, 1046].forEach((f, i) => tone(f, f, 0.26, 'square', 0.15, i * 0.12))
      tone(160, 60, 0.7, 'sine', 0.45, 0.02)
      noiseBurst(0.6, 'lowpass', 1800, 200, 0.3, 0.02)
    },

    /** the hill changes hands */
    takeover() {
      if (!on()) return
      ;[392, 587, 784].forEach((f, i) => tone(f, f * 1.02, 0.16, 'triangle', 0.13, i * 0.07))
    },
  }
}
