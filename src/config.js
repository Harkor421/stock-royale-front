// ============================================================================
// config.js — every tunable of the battlefield, frozen in one place.
//
// THE ARENA IS RADIAL. Eight armies hold eight wedges of a circle and all march
// on the same objective: the citadel hill at the centre. An army's frontline
// radius is its performance this round — the leader is closest to the hill, the
// laggard is pinned against the rim. So "who's winning" is legible from any
// camera angle without reading a single number.
// ============================================================================

/** How many armies share the ring. Must match the backend roster length. */
export const ARMIES = 8

/** Fallback roster — the real one (with colors) arrives in the backend `hello`. */
export const FALLBACK_ROSTER = Object.freeze([
  { symbol: 'NVDA', name: 'Nvidia', color: '#76b900' },
  { symbol: 'TSLA', name: 'Tesla', color: '#ff6b3d' },
  { symbol: 'AAPL', name: 'Apple', color: '#d8dbe2' },
  { symbol: 'AMZN', name: 'Amazon', color: '#ff9f1c' },
  { symbol: 'META', name: 'Meta', color: '#2f7bff' },
  { symbol: 'MSFT', name: 'Microsoft', color: '#00d4c8' },
  { symbol: 'GOOGL', name: 'Alphabet', color: '#ffd447' },
  { symbol: 'AMD', name: 'AMD', color: '#c46bff' },
])

export const ARENA = Object.freeze({
  rim: 96, //         outer edge of the playable ring
  ground: 150, //     the ground disc extends past the rim into the fog
  hillR: 13, //       flat top of the citadel
  hillSlope: 11, //   the mesa's skirt: flat top ends at hillR, ground at hillR+hillSlope
  hillH: 7.5, //      how high the objective stands
  frontNear: 17, //   frontline radius of the round's leader (troops onto the slope)
  frontFar: 84, //    frontline radius of the round's laggard (backed onto the rim)
  wedgeHalf: 0.36, // half-width of an army's lane in radians, where it still holds
  clashBand: 3.2, //  radial distance from the front where soldiers stop and fight
  /**
   * The siege. Whoever leads the round GARRISONS the citadel — its troops ring
   * the hill at garrisonR and face outward. Everyone else is a besieger: they
   * close to assaultR and fight the garrison from every direction at once.
   * An attacking army only gets there if its frontline has advanced that far,
   * so a ticker having a bad round is still stuck out in the open.
   */
  garrisonR: 16,
  assaultR: 23,
  meleeR: 46,
  amp: 1.5, //        terrain noise amplitude
  segTheta: 144, //   ground disc resolution
  segR: 52,
})

/** Angle of army i's lane centre. Army 0 sits at the top of the screen. */
export function wedgeAngle(i) {
  return -Math.PI / 2 + (i * Math.PI * 2) / ARMIES
}

/** Polar -> world. Every unit position in the arena goes through this. */
export function polar(r, a, out = { x: 0, z: 0 }) {
  out.x = Math.cos(a) * r
  out.z = Math.sin(a) * r
  return out
}

/** Which wedge does this world point belong to? (used by terrain tinting) */
export function wedgeOf(x, z) {
  const a = Math.atan2(z, x) + Math.PI / 2 // rotate so army 0 starts at 0
  const t = ((a / (Math.PI * 2)) % 1 + 1) % 1
  return Math.min(ARMIES - 1, Math.floor(t * ARMIES))
}

/**
 * Terrain height. A mesa in the middle (the objective) plus low rolling noise.
 * Shared by the ground mesh, unit placement and every effect, so nothing ever
 * floats or sinks.
 */
export function sampleHeight(x, z) {
  const r = Math.hypot(x, z)
  let hill = 0
  if (r <= ARENA.hillR) hill = ARENA.hillH
  else if (r < ARENA.hillR + ARENA.hillSlope) {
    const t = 1 - (r - ARENA.hillR) / ARENA.hillSlope
    hill = ARENA.hillH * t * t * (3 - 2 * t) // smoothstep skirt
  }
  const n =
    Math.sin(x * 0.085) * Math.cos(z * 0.105) * 0.6 +
    Math.sin(x * 0.19 + 1.7) * Math.cos(z * 0.23 + 0.6) * 0.3 +
    Math.sin((x * 0.5 - z * 0.3) * 0.08) * 0.5
  // flatten the noise on top of the mesa so the citadel reads as built, not grown
  const flat = r < ARENA.hillR ? 0.25 : 1
  return hill + n * (ARENA.amp / 1.4) * flat
}

/** Frontline radius for a normalized advance (1 = leader, 0 = last place). */
export function advanceToRadius(advance) {
  const a = Math.max(0, Math.min(1, advance))
  return ARENA.frontFar + (ARENA.frontNear - ARENA.frontFar) * a
}

// --- print sizes -----------------------------------------------------------
// These mirror the backend's THRESH so the client can classify locally too.
// Calibrated against the real tape: a typical mega-cap print is $13K-$40K.
export const THRESH = Object.freeze({ fish: 10_000, dolphin: 50_000, whale: 150_000 })
/** A print this big earns a floating price tag above the line (blocks only —
 *  tagging every round lot buries the battlefield in numbers). */
export const LABEL_USD = 30_000
/** A print this big scrambles a bomber. */
export const PLANE_USD = 30_000

/** Pool caps — preallocation sizes. Nothing ever spawns past these. */
export const CAPS = Object.freeze({
  SOLDIERS: 2000,
  FLAGS: 64,
  TANKS: 110,
  PLANES: 40,
  FIRE: 4200,
  DUST: 2600,
  TRACERS: 192,
  SHOCKWAVES: 32,
  DEBRIS: 520,
  SCORCH: 96,
  FEED: 26,
  LABELS: 24,
})

export const CAMERA = Object.freeze({
  fov: 45,
  near: 1,
  far: 900,
  radius: 138, //   default orbit distance
  phi: 0.86, //     polar angle (0 = straight down)
  minDistance: 46,
  maxDistance: 300,
  maxPolarAngle: 1.44,
  dampingFactor: 0.07,
  orbitSpeed: 0.028, // rad/s of the idle drift around the arena
  /** After the viewer drags, the director keeps its hands off for this long. */
  manualHoldSec: 14,
})

/** Time constants (seconds) for framerate-independent damping. */
export const TAU = Object.freeze({
  front: 0.55,
  impulse: 0.7,
  shake: 0.15,
  sky: 1.6,
  camera: 0.9,
})

export const CADENCE = Object.freeze({
  hudMs: 120,
  bannerMs: 260, // 3D ticker banner redraw
})

// ---------------------------------------------------------------------------
// PALETTE — 0x numbers for three. HUD colors live in hud.css.
// Army colors are NOT here: they arrive from the backend roster.
// ---------------------------------------------------------------------------
export const COLORS = Object.freeze({
  bear: 0x8b0e18, //      the sell horde — deliberately darker than every army color
  bearTank: 0x5e0910,
  gold: 0xffc53d,
  ground: 0x4a5c42,
  groundLo: 0x33402f,
  groundHi: 0x627750,
  scorched: 0x5a3a30, //  ground the bears have taken back
  scorchedHi: 0x6d4a3c,
  rock: 0x8a8172,
  rockDark: 0x5b564a,
  citadel: 0xb0a893,
  citadelDark: 0x6d6653,
  wall: 0x6d6553,
  ember: 0xff6a2c,
  fire: [0xfff4c2, 0xffc53d, 0xff6a2a, 0xc4321c, 0x3a3a3a],
  muzzle: 0xffe9a8,
  tracer: 0xffd36b,
  dust: 0x6b5e48,
  storm: 0x6ad2ff, //     the closing ring
  stormHot: 0xff4d6d, //  the closing ring in the last 30 seconds
  hemiSky: 0x8fb0d8,
  hemiGround: 0x574434,
})

/** Sky keyframes selected by the smoothed aggregate pressure of all 8 armies. */
export const ATMO = Object.freeze({
  storm: { zenith: 0x1b2836, horizon: 0x4a3b2c, fog: 0x2c2a30, near: 150, far: 520, sun: 0x93a4bd, sunI: 1.25 },
  dusk:  { zenith: 0x2c4468, horizon: 0x7a6a70, fog: 0x4a4a58, near: 210, far: 700, sun: 0xffe9cc, sunI: 1.85 },
  dawn:  { zenith: 0x3d78b4, horizon: 0xf0b478, fog: 0x8e8271, near: 270, far: 860, sun: 0xfff0c8, sunI: 2.2 },
})

// --- formatting helpers shared by HUD + 3D labels --------------------------
export function fmtUsd(v) {
  if (!(v > 0)) return '$0'
  if (v >= 1e9) return '$' + (v / 1e9).toFixed(2) + 'B'
  if (v >= 1e6) return '$' + (v / 1e6).toFixed(2) + 'M'
  if (v >= 1e3) return '$' + (v / 1e3).toFixed(1) + 'K'
  return '$' + v.toFixed(0)
}
export function fmtPrice(v) {
  if (!(v > 0)) return '—'
  return '$' + v.toFixed(2)
}
export function fmtPct(v) {
  const s = v >= 0 ? '+' : ''
  return s + v.toFixed(2) + '%'
}
export function fmtClock(ms) {
  const t = Math.max(0, Math.round(ms / 1000))
  return `${(t / 60) | 0}:${String(t % 60).padStart(2, '0')}`
}
