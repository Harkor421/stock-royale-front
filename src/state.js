// ============================================================================
// state.js — the world, as plain data. NO THREE import.
//
// Two halves:
//   · armies[]  — eight small objects, one per ticker. Everything the HUD and
//                 the terrain need to know about who is winning.
//   · pools     — Structure-of-Arrays for every moving thing, with a freelist
//                 (pop = spawn, push = despawn), so the per-frame loop never
//                 allocates and the GPU sync is a straight array copy.
//
// Soldiers live in POLAR coordinates (radius from the hill + angle), because
// the whole game is "how close to the centre is your army". Vehicles and planes
// are cartesian — they drive and fly in straight lines.
// ============================================================================

import { CAPS, ARMIES, ARENA, GRID, wedgeAngle, advanceToRadius, FALLBACK_ROSTER } from './config.js'

const GRID_CELLS = GRID.n * GRID.n

// A freelist is a stack of free indices: pop = spawn, push = despawn. When it
// runs dry, spawns are simply dropped — which is also what bounds the world if
// the tab is backgrounded (no requestAnimationFrame, so nothing is stepping or
// dying while prints keep arriving).
function makeFreelist(max) {
  const stack = new Int32Array(max)
  for (let i = 0; i < max; i++) stack[i] = max - 1 - i
  return { stack, top: max, max }
}
export function alloc(fl) {
  return fl.top > 0 ? fl.stack[--fl.top] : -1
}
export function free(fl, i) {
  if (fl.top < fl.max) fl.stack[fl.top++] = i
}
function resetFreelist(fl) {
  for (let i = 0; i < fl.max; i++) fl.stack[i] = fl.max - 1 - i
  fl.top = fl.max
}

const hexNum = (css) => parseInt(String(css).replace('#', ''), 16) || 0xffffff

function makeArmy(i, t) {
  return {
    index: i,
    symbol: t.symbol,
    name: t.name,
    colorCss: t.color,
    color: hexNum(t.color),
    angle: wedgeAngle(i),
    // live numbers from the tape
    price: 0,
    baseline: 0,
    pct: 0,
    rank: i + 1,
    advance: 0.5,
    pressure: 0,
    buyNotional: 0,
    sellNotional: 0,
    trades: 0,
    spark: [],
    // battlefield state
    front: advanceToRadius(0.5), // damped frontline radius
    impulse: 0, //                 decaying shove from a block print
    activity: 0, //                recent print intensity -> clash embers
    streak: 0, //                  consecutive seconds of net buying
    planeCooldown: 0,
    vehicleCooldown: 0, //         so one busy ticker can't drain the armour pool
    flowVeh: 0, //                 $ traded since this army last got armour
    flowPlane: 0, //               $ traded since it last got an air strike
    flash: 0, //                   seconds of highlight after a whale
    troops: 0, //                  live soldiers belonging to this army
    reinforce: 0, //               fractional carry of the reinforcement drip
  }
}

/** Reset everything that belongs to a single round. Called on `roundStart`. */
export function resetRound(state) {
  for (const key of ['soldiers', 'tanks', 'planes', 'fire', 'dust', 'tracers', 'shock', 'debris']) {
    const p = state[key]
    p.active.fill(0)
    if ('size' in p) p.size.fill(0)
    if ('foe' in p) p.foe.fill(-1)
    resetFreelist(p.fl)
    if ('count' in p) p.count = 0
  }
  state.soldiers.countBull = 0
  state.soldiers.countBear = 0
  for (const a of state.armies) {
    a.pct = 0
    a.advance = 0.5
    a.front = advanceToRadius(0.5)
    a.impulse = 0
    a.activity = 0
    a.streak = 0
    a.trades = 0
    a.buyNotional = 0
    a.sellNotional = 0
    a.flash = 0
    a.troops = 0
    a.reinforce = 0
    a.spark = []
  }
  const s = state.scalars
  s.aggPressure = 0
  s.shake = 0
  s.hitStop = 0
  s.lightning = 0
  s.celebrate = 0
  s.leader = -1
  s.prevLeader = -1
}

/** Rebuild the armies from a backend roster (symbols + colors). */
export function setRoster(state, roster) {
  const list = roster && roster.length === ARMIES ? roster : FALLBACK_ROSTER
  state.armies = list.map((t, i) => makeArmy(i, t))
  state.bySymbol = new Map(state.armies.map((a) => [a.symbol, a]))
  return state.armies
}

export function createState() {
  const S = CAPS.SOLDIERS
  const T = CAPS.TANKS
  const P = CAPS.PLANES
  const F = CAPS.FIRE
  const D = CAPS.DUST
  const R = CAPS.TRACERS
  const W = CAPS.SHOCKWAVES

  const state = {
    armies: [],
    bySymbol: new Map(),

    scalars: {
      // round + session, mirrored straight off the wire
      round: null, //        {id, seq, startedAt, endsAt, lengthMs, label}
      session: { state: 'closed', label: 'CONNECTING…', live: false, nextChangeAt: 0 },
      serverSkewMs: 0, //    serverNow - clientNow, so the countdown is honest
      connected: false,
      sim: false, //         the backend is running a SYNTHETIC tape, not the market

      history: [], //        past winners, newest first

      leader: -1,
      prevLeader: -1,
      leaderHoldSec: 0,

      aggPressure: 0, //     mean pressure across all armies, -1..+1
      skyPressure: 0, //     EMA of the above -> atmosphere
      stormR: ARENA.rim, //  the closing ring's radius (round progress made visible)
      roundProgress: 0, //   0..1

      shake: 0,
      shakeDirX: 0,
      shakeDirZ: 0,
      hitStop: 0,
      lightning: 0,
      flashWhite: 0,
      celebrate: 0, //       seconds of confetti mood
      winnerFx: 0, //        seconds of the victory cinematic
      winner: null, //       the round's winner payload while winnerFx runs
    },

    // --- soldiers: polar. side 0 = the army's own troops (a buy), 1 = bears ---
    soldiers: {
      r: new Float32Array(S),
      a: new Float32Array(S),
      vr: new Float32Array(S),
      weave: new Float32Array(S),
      army: new Uint8Array(S),
      side: new Uint8Array(S),
      phase: new Float32Array(S),
      st: new Uint8Array(S), // 0 march / 1 fight / 2 dying
      flag: new Uint8Array(S),
      timer: new Float32Array(S),
      active: new Uint8Array(S),
      // --- melee: who this soldier is actually fighting ---
      foe: new Int32Array(S), //      index of its current enemy, -1 for none
      foeTimer: new Float32Array(S), // seconds until it looks for a better one
      face: new Float32Array(S), //   heading, written by the simulator
      // A uniform grid over the arena, rebuilt every frame, so a soldier can
      // find the nearest enemy by looking in nine cells instead of scanning all
      // two thousand of them. head/next are a linked list per cell — no
      // allocation, no sorting.
      gridHead: new Int32Array(GRID_CELLS),
      gridNext: new Int32Array(S),
      countBull: 0,
      countBear: 0,
      fl: makeFreelist(S),
    },

    tanks: {
      x: new Float32Array(T),
      z: new Float32Array(T),
      yaw: new Float32Array(T),
      tx: new Float32Array(T),
      tz: new Float32Array(T),
      army: new Uint8Array(T),
      target: new Uint8Array(T), // the army it is driving at
      side: new Uint8Array(T),
      kind: new Uint8Array(T), // 0 tank / 1 apc
      hill: new Uint8Array(T), // 1 => it is striking the citadel itself
      timer: new Float32Array(T),
      life: new Float32Array(T),
      st: new Uint8Array(T), // 0 driving / 1 firing / 2 leaving
      active: new Uint8Array(T),
      count: 0,
      fl: makeFreelist(T),
    },

    planes: {
      x0: new Float32Array(P),
      z0: new Float32Array(P),
      x1: new Float32Array(P),
      z1: new Float32Array(P),
      y: new Float32Array(P),
      t: new Float32Array(P),
      speed: new Float32Array(P),
      army: new Uint8Array(P),
      target: new Uint8Array(P), // whose lines it is strafing
      side: new Uint8Array(P),
      kind: new Uint8Array(P), // 0 jet / 1 bomber
      active: new Uint8Array(P),
      count: 0,
      fl: makeFreelist(P),
    },

    fire: {
      pos: new Float32Array(F * 3),
      vel: new Float32Array(F * 3),
      color: new Float32Array(F * 3),
      size: new Float32Array(F),
      life: new Float32Array(F),
      maxlife: new Float32Array(F),
      active: new Uint8Array(F),
      count: 0,
      fl: makeFreelist(F),
    },

    dust: {
      pos: new Float32Array(D * 3),
      vel: new Float32Array(D * 3),
      color: new Float32Array(D * 3),
      size: new Float32Array(D),
      life: new Float32Array(D),
      maxlife: new Float32Array(D),
      grav: new Float32Array(D),
      active: new Uint8Array(D),
      count: 0,
      fl: makeFreelist(D),
    },

    tracers: {
      x0: new Float32Array(R), y0: new Float32Array(R), z0: new Float32Array(R),
      hx: new Float32Array(R), hy: new Float32Array(R), hz: new Float32Array(R),
      tx: new Float32Array(R), ty: new Float32Array(R), tz: new Float32Array(R),
      speed: new Float32Array(R),
      radius: new Float32Array(R),
      active: new Uint8Array(R),
      count: 0,
      fl: makeFreelist(R),
    },

    // tumbling chunks thrown by a blast — the thing that sells an explosion as
    // an impact on the ground rather than a puff of light
    debris: {
      pos: new Float32Array(CAPS.DEBRIS * 3),
      vel: new Float32Array(CAPS.DEBRIS * 3),
      rot: new Float32Array(CAPS.DEBRIS * 3),
      spin: new Float32Array(CAPS.DEBRIS * 3),
      size: new Float32Array(CAPS.DEBRIS),
      life: new Float32Array(CAPS.DEBRIS),
      maxlife: new Float32Array(CAPS.DEBRIS),
      active: new Uint8Array(CAPS.DEBRIS),
      count: 0,
      fl: makeFreelist(CAPS.DEBRIS),
    },

    // Craters, as a ring buffer the terrain drains each frame. The simulator
    // can't reach into the ground mesh (it owns no THREE objects), so it leaves
    // marks here and arena.js burns them in.
    scorch: {
      x: new Float32Array(CAPS.SCORCH),
      z: new Float32Array(CAPS.SCORCH),
      r: new Float32Array(CAPS.SCORCH),
      head: 0,
    },

    shock: {
      x: new Float32Array(W), y: new Float32Array(W), z: new Float32Array(W),
      r: new Float32Array(W), maxr: new Float32Array(W),
      life: new Float32Array(W), maxlife: new Float32Array(W),
      active: new Uint8Array(W),
      count: 0,
      fl: makeFreelist(W),
    },
  }

  setRoster(state, FALLBACK_ROSTER)
  return state
}
