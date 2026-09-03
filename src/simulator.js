// ============================================================================
// simulator.js — pure state -> state. No THREE objects are created here.
//
//   applyEvent(state, e)  folds one wire event into the world
//   step(state, dt)       integrates one frame of motion, combat and particles
//
// This is the ONLY place a print off the tape becomes soldiers, tanks, planes
// and explosions. Everything the camera, the HUD and the terrain read is a
// consequence of what happens in here, so they can never disagree.
// ============================================================================

import {
  ARENA, TAU, CAPS, COLORS, ARMIES, PLANE_USD,
  sampleHeight, advanceToRadius, polar,
} from './config.js'
import { alloc, free, resetRound, setRoster } from './state.js'

// sRGB hex -> linear RGB (three has ColorManagement on) so additive particle
// colors blend correctly. Done once at module load, never per frame.
function lin(hex) {
  const conv = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
  return [conv(((hex >> 16) & 255) / 255), conv(((hex >> 8) & 255) / 255), conv((hex & 255) / 255)]
}
const FIRE_STOPS = COLORS.fire.map(lin)
const EMBER = lin(COLORS.ember)
const MUZZLE = lin(COLORS.muzzle)
const DUSTC = lin(COLORS.dust)
const SMOKE = lin(0x3a3a3a)
const WHITE = lin(0xffffff)

const _p = { x: 0, z: 0 }

// Standing-army size: a floor so no wedge is ever empty, plus what a ticker
// earns by leading the round and by actually trading.
const TROOPS_BASE = 70
const TROOPS_RANK = 130
const TROOPS_FLOW = 60

// --- spawn helpers ---------------------------------------------------------

function spawnFire(s, x, y, z, vx, vy, vz, size, life, c) {
  const i = alloc(s.fire.fl)
  if (i < 0) return
  const f = s.fire
  const o = i * 3
  f.pos[o] = x; f.pos[o + 1] = y; f.pos[o + 2] = z
  f.vel[o] = vx; f.vel[o + 1] = vy; f.vel[o + 2] = vz
  f.color[o] = c[0]; f.color[o + 1] = c[1]; f.color[o + 2] = c[2]
  f.size[i] = size
  f.life[i] = life
  f.maxlife[i] = life
  f.active[i] = 1
}

function spawnDust(s, x, y, z, vx, vy, vz, size, life, grav, c) {
  const i = alloc(s.dust.fl)
  if (i < 0) return
  const d = s.dust
  const o = i * 3
  d.pos[o] = x; d.pos[o + 1] = y; d.pos[o + 2] = z
  d.vel[o] = vx; d.vel[o + 1] = vy; d.vel[o + 2] = vz
  d.color[o] = c[0]; d.color[o + 1] = c[1]; d.color[o + 2] = c[2]
  d.size[i] = size
  d.life[i] = life
  d.maxlife[i] = life
  d.grav[i] = grav
  d.active[i] = 1
}

function spawnDebris(s, x, y, z, vx, vy, vz, size, life) {
  const i = alloc(s.debris.fl)
  if (i < 0) return
  const d = s.debris
  const o = i * 3
  d.pos[o] = x; d.pos[o + 1] = y; d.pos[o + 2] = z
  d.vel[o] = vx; d.vel[o + 1] = vy; d.vel[o + 2] = vz
  d.rot[o] = Math.random() * 6.28; d.rot[o + 1] = Math.random() * 6.28; d.rot[o + 2] = Math.random() * 6.28
  d.spin[o] = (Math.random() - 0.5) * 14
  d.spin[o + 1] = (Math.random() - 0.5) * 14
  d.spin[o + 2] = (Math.random() - 0.5) * 14
  d.size[i] = size
  d.life[i] = life
  d.maxlife[i] = life
  d.active[i] = 1
}

/** Leave a crater for the terrain to burn in. */
function scorch(s, x, z, r) {
  const sc = s.scorch
  const i = sc.head % sc.x.length
  sc.x[i] = x
  sc.z[i] = z
  sc.r[i] = r
  sc.head++
}

function spawnTracer(s, x0, y0, z0, tx, ty, tz, radius) {
  const i = alloc(s.tracers.fl)
  if (i < 0) return
  const t = s.tracers
  t.x0[i] = x0; t.y0[i] = y0; t.z0[i] = z0
  t.hx[i] = x0; t.hy[i] = y0; t.hz[i] = z0
  t.tx[i] = tx; t.ty[i] = ty; t.tz[i] = tz
  t.speed[i] = 78
  t.radius[i] = radius
  t.active[i] = 1
}

/** Shockwave ring + white-hot core + fireball + smoke plume (+ mushroom, if big). */
export function explosion(s, x, y, z, radius, mag) {
  const si = alloc(s.shock.fl)
  if (si >= 0) {
    const sh = s.shock
    sh.x[si] = x; sh.y[si] = y + 0.2; sh.z[si] = z
    sh.r[si] = radius * 0.3
    sh.maxr[si] = radius * 1.45
    sh.life[si] = 0.42
    sh.maxlife[si] = 0.42
    sh.active[si] = 1
  }
  for (let k = 0; k < 5; k++) {
    spawnFire(s, x, y + 0.4, z, (Math.random() - 0.5) * 2, 1 + Math.random() * 2,
      (Math.random() - 0.5) * 2, radius * 0.32 + 0.6, 0.09 + Math.random() * 0.06, FIRE_STOPS[0])
  }
  const n = Math.min(260, 40 + (mag | 0))
  for (let k = 0; k < n; k++) {
    const th = Math.random() * Math.PI * 2
    const ph = Math.acos(Math.random()) // upper hemisphere -> it billows up
    const sp = radius * (1 + Math.random() * 2.2)
    spawnFire(s, x, y, z,
      Math.sin(ph) * Math.cos(th) * sp, Math.cos(ph) * sp * 1.15 + 1.6, Math.sin(ph) * Math.sin(th) * sp,
      0.45 + Math.random() * 1.1, 0.45 + Math.random() * 0.55, FIRE_STOPS[0])
  }
  const smoke = 8 + Math.min(24, (mag / 8) | 0)
  for (let k = 0; k < smoke; k++) {
    spawnDust(s, x + (Math.random() - 0.5) * radius, y + Math.random() * 2, z + (Math.random() - 0.5) * radius,
      (Math.random() - 0.5) * 1.2, 2.6 + Math.random() * 2.2, (Math.random() - 0.5) * 1.2,
      radius * 0.5 + 1.6, 1.5 + Math.random() * 1.1, -0.4, SMOKE)
  }
  // chunks of ground and armour, tumbling
  const chunks = Math.min(26, 4 + ((radius * 2.2) | 0))
  for (let k = 0; k < chunks; k++) {
    const th = Math.random() * Math.PI * 2
    const ph = Math.acos(Math.random())
    const sp = radius * (1.4 + Math.random() * 2.6)
    spawnDebris(s, x, y + 0.3, z,
      Math.sin(ph) * Math.cos(th) * sp, Math.cos(ph) * sp * 1.5 + 4, Math.sin(ph) * Math.sin(th) * sp,
      0.22 + Math.random() * 0.5 * Math.min(2, radius / 3), 1.5 + Math.random() * 1.6)
  }

  // fast bright sparks that outrun the fireball
  const sparks = Math.min(60, 12 + ((radius * 5) | 0))
  for (let k = 0; k < sparks; k++) {
    const th = Math.random() * Math.PI * 2
    const ph = Math.acos(Math.random())
    const sp = radius * (3 + Math.random() * 5)
    spawnFire(s, x, y + 0.3, z,
      Math.sin(ph) * Math.cos(th) * sp, Math.cos(ph) * sp + 3, Math.sin(ph) * Math.sin(th) * sp,
      0.18 + Math.random() * 0.16, 0.35 + Math.random() * 0.5, FIRE_STOPS[1])
  }

  scorch(s, x, z, radius * 1.25)

  if (radius >= 4) {
    const capY = y + radius * 1.7 + 3
    const capR = radius * 0.95
    for (let k = 0; k < 24; k++) {
      const ang = Math.random() * Math.PI * 2
      const rr = 1 + Math.random() * capR
      spawnDust(s, x + Math.cos(ang) * rr, capY + (Math.random() - 0.5) * 2, z + Math.sin(ang) * rr,
        Math.cos(ang) * (1.6 + Math.random() * 2.2), 0.4 + Math.random(), Math.sin(ang) * (1.6 + Math.random() * 2.2),
        radius * 0.7 + 1.8, 1.8 + Math.random() * 1.2, -0.3, SMOKE)
    }
    for (let k = 0; k < 12; k++) {
      spawnDust(s, x + (Math.random() - 0.5) * 1.6, y + Math.random() * capY * 0.7, z + (Math.random() - 0.5) * 1.6,
        (Math.random() - 0.5) * 0.6, 2.2 + Math.random() * 2, (Math.random() - 0.5) * 0.6,
        radius * 0.45 + 1.2, 1.6 + Math.random(), 0.1, SMOKE)
    }
  }
}

/**
 * Kill `n` of an army's soldiers near its frontline. This is what a sell print
 * looks like now: not an enemy faction spawning, but your own line thinning out
 * and getting shoved back. Every unit on the field belongs to a ticker, so the
 * fight the viewer sees is unambiguously stock against stock.
 */
function cullSoldiers(s, armyIdx, n) {
  const so = s.soldiers
  let killed = 0
  // walk from a random offset so the same ranks aren't always the ones to die
  const len = so.r.length
  const start = (Math.random() * len) | 0
  for (let k = 0; k < len && killed < n; k++) {
    const i = (start + k) % len
    if (!so.active[i] || so.army[i] !== armyIdx || so.st[i] === 2) continue
    so.st[i] = 2
    so.timer[i] = 0.35
    polar(so.r[i], so.a[i], _p)
    const hy = sampleHeight(_p.x, _p.z) + 0.5
    for (let q = 0; q < 4; q++) {
      spawnFire(s, _p.x, hy, _p.z, (Math.random() - 0.5) * 3, 1 + Math.random() * 2,
        (Math.random() - 0.5) * 3, 0.4 + Math.random() * 0.4, 0.28, FIRE_STOPS[1])
    }
    spawnDust(s, _p.x, hy, _p.z, 0, 0.7, 0, 1.3, 0.8, 1, DUSTC)
    killed++
  }
  return killed
}

function spawnSoldier(s, army, side, r, a, flag) {
  const i = alloc(s.soldiers.fl)
  if (i < 0) return
  const so = s.soldiers
  so.r[i] = r
  so.a[i] = a
  so.vr[i] = 0
  so.weave[i] = (Math.random() - 0.5) * 1.5
  so.army[i] = army
  so.side[i] = side
  so.phase[i] = Math.random() * 6.28
  so.st[i] = 0
  so.flag[i] = flag ? 1 : 0
  so.timer[i] = 0
  so.active[i] = 1
  if (side === 0) so.countBull++
  else so.countBear++
}

function freeSoldier(s, i) {
  const so = s.soldiers
  if (!so.active[i]) return
  so.active[i] = 0
  if (so.side[i] === 0) so.countBull--
  else so.countBear--
  const army = s.armies[so.army[i]]
  if (army && army.troops > 0) army.troops--
  free(so.fl, i)
}

function spawnVehicle(s, armyIdx, side, kind) {
  const i = alloc(s.tanks.fl)
  if (i < 0) return
  const t = s.tanks
  const army = s.armies[armyIdx]
  const off = (Math.random() - 0.5) * ARENA.wedgeHalf * 1.4
  const a = army.angle + off
  // buys roll in from the rim, sells roll out from behind the hill
  const startR = side === 0 ? Math.min(ARENA.rim + 6, army.front + 40) : Math.max(ARENA.hillR + 2, army.front - 34)
  polar(startR, a, _p)
  t.x[i] = _p.x
  t.z[i] = _p.z
  polar(side === 0 ? army.front + 8 : army.front - 8, a, _p)
  t.tx[i] = _p.x
  t.tz[i] = _p.z
  t.army[i] = armyIdx
  t.side[i] = side
  t.kind[i] = kind
  t.yaw[i] = Math.atan2(t.tx[i] - t.x[i], t.tz[i] - t.z[i])
  t.timer[i] = 0.8
  t.life[i] = 9 + Math.random() * 5
  t.st[i] = 0
  t.active[i] = 1
  s.tanks.count++
}

function freeVehicle(s, i) {
  if (!s.tanks.active[i]) return
  s.tanks.active[i] = 0
  s.tanks.count--
  free(s.tanks.fl, i)
}

/** A strafing run along an army's frontline: a straight chord tangent to it. */
function spawnPlane(s, armyIdx, side, kind) {
  const i = alloc(s.planes.fl)
  if (i < 0) return
  const p = s.planes
  const army = s.armies[armyIdx]
  const a = army.angle + (Math.random() - 0.5) * 0.12
  const r = Math.max(ARENA.hillR + 8, army.front + (Math.random() - 0.5) * 8)
  polar(r, a, _p)
  const cx = _p.x
  const cz = _p.z
  const dx = -Math.sin(a) // tangent to the front circle
  const dz = Math.cos(a)
  const dir = Math.random() < 0.5 ? 1 : -1
  const L = 78
  p.x0[i] = cx - dx * L * dir
  p.z0[i] = cz - dz * L * dir
  p.x1[i] = cx + dx * L * dir
  p.z1[i] = cz + dz * L * dir
  p.y[i] = 15 + Math.random() * 4
  p.t[i] = 0
  p.speed[i] = kind === 0 ? 0.17 + Math.random() * 0.05 : 0.11
  p.army[i] = armyIdx
  p.side[i] = side
  p.kind[i] = kind
  p.active[i] = 1
  s.planes.count++
}

function freePlane(s, i) {
  if (!s.planes.active[i]) return
  s.planes.active[i] = 0
  s.planes.count--
  free(s.planes.fl, i)
}

/** Victory fireworks over the citadel, in the winner's colors. */
export function fireworks(s, colorHex, n = 5) {
  const c = lin(colorHex)
  for (let k = 0; k < n; k++) {
    const ang = Math.random() * Math.PI * 2
    const rr = Math.random() * ARENA.hillR * 1.4
    const x = Math.cos(ang) * rr
    const z = Math.sin(ang) * rr
    const y = ARENA.hillH + 16 + Math.random() * 22
    for (let j = 0; j < 90; j++) {
      const th = Math.random() * Math.PI * 2
      const ph = Math.acos(2 * Math.random() - 1)
      const sp = 9 + Math.random() * 12
      spawnFire(s, x, y, z,
        Math.sin(ph) * Math.cos(th) * sp, Math.cos(ph) * sp, Math.sin(ph) * Math.sin(th) * sp,
        0.7 + Math.random() * 0.7, 0.9 + Math.random() * 0.7, Math.random() < 0.35 ? WHITE : c)
    }
  }
}

export function confettiBurst(s, n, colorHex) {
  const c = lin(colorHex ?? 0xffffff)
  for (let k = 0; k < n; k++) {
    const ang = Math.random() * Math.PI * 2
    const rr = Math.random() * ARENA.rim * 0.7
    spawnDust(s, Math.cos(ang) * rr, 26 + Math.random() * 16, Math.sin(ang) * rr,
      (Math.random() - 0.5) * 7, -1 - Math.random() * 3, (Math.random() - 0.5) * 7,
      0.7 + Math.random() * 0.7, 2.4 + Math.random() * 1.6, -6,
      k % 3 === 0 ? WHITE : c)
  }
}

/** Fireworks, confetti and the winner's troops taking the hill. */
function celebrateWinner(state, winner) {
  const army = state.bySymbol.get(winner.symbol)
  const col = army ? army.color : 0xffffff
  fireworks(state, col, 6)
  confettiBurst(state, 260, col)
  if (!army) return
  for (let k = 0; k < 90; k++) {
    spawnSoldier(state, army.index, Math.random() < 0.25 ? 1 : 0,
      ARENA.hillR + Math.random() * 16,
      army.angle + (Math.random() - 0.5) * ARENA.wedgeHalf * 2,
      Math.random() < 0.16)
  }
}

// --- event folding ---------------------------------------------------------

/** Copy one standings row onto its army. */
function applyRow(state, row) {
  const army = state.bySymbol.get(row.symbol)
  if (!army) return
  army.price = row.price
  army.baseline = row.baseline
  army.pct = row.pct
  army.rank = row.rank
  army.advance = row.advance
  army.pressure = row.pressure
  army.buyNotional = row.buyNotional
  army.sellNotional = row.sellNotional
  army.trades = row.trades
  if (row.spark && row.spark.length) army.spark = row.spark
}

export function applyEvent(state, e) {
  const s = state.scalars
  switch (e.type) {
    case 'hello': {
      setRoster(state, e.roster)
      s.session = e.session
      s.round = e.round
      s.history = e.history || []
      s.serverSkewMs = (e.serverNow || e.ts || Date.now()) - Date.now()
      s.sim = !!e.sim
      if (e.rows) e.rows.forEach((r) => applyRow(state, r))
      break
    }
    case 'session': {
      s.session = e
      break
    }
    case 'roundStart': {
      // The backend starts the next round the instant the last one ends, so the
      // reset lands in the middle of the victory cinematic. Wipe the field, then
      // put the celebration back on the clean arena — that's the shot: the
      // winner's troops alone on a fresh battlefield under their own fireworks.
      const stillCelebrating = s.winnerFx > 0 ? s.winner : null
      resetRound(state)
      s.round = e.round
      if (e.rows) e.rows.forEach((r) => applyRow(state, r))
      if (stillCelebrating) celebrateWinner(state, stillCelebrating)
      break
    }
    case 'roundEnd': {
      s.winner = e.winner
      s.winnerFx = 9
      s.celebrate = 9
      s.history = [{ round: e.round, winner: e.winner, podium: e.podium }, ...(s.history || [])].slice(0, 24)
      if (e.winner) celebrateWinner(state, e.winner)
      break
    }
    case 'standings': {
      s.round = e.round
      let agg = 0
      for (const row of e.rows) {
        applyRow(state, row)
        agg += row.pressure
      }
      s.aggPressure = agg / Math.max(1, e.rows.length)
      const lead = state.bySymbol.get(e.rows[0]?.symbol)
      const leaderIdx = lead ? lead.index : -1
      if (leaderIdx !== s.leader) {
        s.prevLeader = s.leader
        s.leader = leaderIdx
        s.leaderHoldSec = 0
        if (s.prevLeader >= 0) s.lightning = 0.12 // the hill changes hands
      }
      break
    }
    case 'trade': {
      const army = state.bySymbol.get(e.symbol)
      if (!army) break
      const buy = e.side === 'buy'
      const mag = Math.min(6, 1 + Math.log10(Math.max(10, e.notional)) - 3)
      army.activity = Math.min(
        3.5,
        army.activity + (e.bucket === 'whale' ? 1.3 : e.bucket === 'dolphin' ? 0.55 : 0.16)
      )
      army.price = e.price
      army.pct = e.pct

      let squad
      if (e.bucket === 'whale') squad = 18 + Math.min(34, (e.notional / 60_000) | 0)
      else if (e.bucket === 'dolphin') squad = 7 + ((Math.random() * 6) | 0)
      else if (e.bucket === 'fish') squad = 3 + ((Math.random() * 4) | 0)
      else squad = 1 + ((Math.random() * 2) | 0)

      if (buy) {
        // reinforcements march in from this army's own rear
        const heavy = e.bucket === 'whale' || e.bucket === 'dolphin'
        for (let c = 0; c < squad; c++) {
          const a = army.angle + (Math.random() - 0.5) * ARENA.wedgeHalf * 1.85
          const r = Math.min(ARENA.rim - 1, army.front + 7 + Math.random() * 34)
          // the big prints bring the heavier troopers, so a block reads on sight
          spawnSoldier(state, army.index, heavy && c % 3 === 0 ? 1 : 0, r, a, false)
        }
        army.impulse -= mag * (e.bucket === 'whale' ? 1.6 : e.bucket === 'dolphin' ? 0.5 : 0.12)
      } else {
        // a sell thins this army's ranks and shoves its line back off the hill
        cullSoldiers(state, army.index, Math.min(40, squad))
        army.impulse += mag * (e.bucket === 'whale' ? 1.6 : e.bucket === 'dolphin' ? 0.5 : 0.12)
      }

      if (e.notional >= PLANE_USD && army.planeCooldown <= 0) {
        // bombers fly for the buyer; sellers call the strike down on this army
        spawnPlane(state, army.index, buy ? 0 : 1, 1)
        army.planeCooldown = 1.1
      }

      if (e.bucket === 'whale') {
        spawnVehicle(state, army.index, buy ? 0 : 1, 0)
        if (buy) spawnPlane(state, army.index, 0, 0)
        army.flash = 1.2
        s.shake = Math.min(0.55, 0.16 + e.notional / 4_000_000)
        polar(army.front, army.angle, _p)
        s.shakeDirX = _p.x / ARENA.rim
        s.shakeDirZ = _p.z / ARENA.rim
        s.hitStop = Math.max(s.hitStop, 0.08)
        const a = army.angle + (Math.random() - 0.5) * ARENA.wedgeHalf
        polar(army.front, a, _p)
        explosion(state, _p.x, sampleHeight(_p.x, _p.z) + 1, _p.z,
          4 + Math.min(4, e.notional / 400_000), 60 + mag * 12)
        if (!buy) s.lightning = Math.max(s.lightning, 0.08)
      } else if (e.bucket === 'dolphin') {
        spawnVehicle(state, army.index, buy ? 0 : 1, 1)
      }
      break
    }
  }
}

// --- per-frame integration -------------------------------------------------

function rampFire(frac, out, o) {
  const pos = (1 - frac) * 4
  let i0 = pos | 0
  if (i0 > 3) i0 = 3
  const f = pos - i0
  const a = FIRE_STOPS[i0]
  const b = FIRE_STOPS[i0 + 1]
  out[o] = a[0] + (b[0] - a[0]) * f
  out[o + 1] = a[1] + (b[1] - a[1]) * f
  out[o + 2] = a[2] + (b[2] - a[2]) * f
}

function fireVehicle(state, i) {
  const t = state.tanks
  const army = state.armies[t.army[i]]
  const yaw = t.yaw[i]
  const gx = t.x[i]
  const gz = t.z[i]
  const tipx = gx + Math.sin(yaw) * 5
  const tipz = gz + Math.cos(yaw) * 5
  const tipy = sampleHeight(gx, gz) + 2.5
  const a = army.angle + (Math.random() - 0.5) * ARENA.wedgeHalf * 1.4
  const enemyR = t.side[i] === 0 ? army.front - 3 - Math.random() * 7 : army.front + 3 + Math.random() * 7
  polar(Math.max(ARENA.hillR, enemyR), a, _p)
  spawnTracer(state, tipx, tipy, tipz, _p.x, sampleHeight(_p.x, _p.z) + 0.6, _p.z, 2.1 + Math.random() * 1.1)
  for (let k = 0; k < 5; k++) {
    spawnFire(state, tipx, tipy, tipz,
      Math.sin(yaw) * 6 + (Math.random() - 0.5) * 2, (Math.random() - 0.3) * 2,
      Math.cos(yaw) * 6 + (Math.random() - 0.5) * 2, 0.5 + Math.random() * 0.5, 0.12, MUZZLE)
  }
}

export function step(state, dt) {
  const s = state.scalars

  // ---- round clock + the closing ring ----
  if (s.round) {
    const now = Date.now() + s.serverSkewMs
    const span = Math.max(1, s.round.endsAt - s.round.startedAt)
    s.roundProgress = Math.max(0, Math.min(1, (now - s.round.startedAt) / span))
  }
  // the ring squeezes from the rim toward the hill as the round runs out
  s.stormR = ARENA.rim + 6 - (ARENA.rim + 6 - (ARENA.hillR + 6)) * s.roundProgress

  // ---- reinforcements ----
  // A real tape prints a handful of times a second per name, and the melee eats
  // soldiers far faster than that, so an event-only population starves: eight
  // empty wedges and nothing to watch. Each army instead keeps a standing force
  // sized by how it is doing and how much of it is trading, topped up from its
  // own rear. Individual prints still spawn their own visible squads on top —
  // those are the drama; this is the war.
  for (const army of state.armies) {
    const flow = Math.min(1, (army.buyNotional + army.sellNotional) / 3_000_000)
    const target = TROOPS_BASE + TROOPS_RANK * army.advance + TROOPS_FLOW * flow
    const deficit = target - army.troops
    if (deficit > 0) {
      army.reinforce += deficit * 0.7 * dt
      let n = army.reinforce | 0
      if (n > 0) {
        army.reinforce -= n
        if (n > 24) n = 24 // never dump a wall of men in a single frame
        for (let k = 0; k < n; k++) {
          const a = army.angle + (Math.random() - 0.5) * ARENA.wedgeHalf * 1.9
          const r = Math.min(ARENA.rim - 1, army.front + 10 + Math.random() * 40)
          spawnSoldier(state, army.index, Math.random() < 0.12 ? 1 : 0, r, a, false)
        }
      }
    } else {
      army.reinforce = 0
    }
  }

  // ---- per-army frontlines ----
  let leaderHold = true
  for (const army of state.armies) {
    const target = advanceToRadius(army.advance) - army.impulse
    army.front += (target - army.front) * (1 - Math.exp(-dt / TAU.front))
    army.front = Math.max(ARENA.hillR + 4, Math.min(ARENA.rim - 4, army.front))
    army.impulse *= Math.exp(-dt / TAU.impulse)
    army.activity *= Math.exp(-dt / 2.2)
    if (army.planeCooldown > 0) army.planeCooldown = Math.max(0, army.planeCooldown - dt)
    if (army.flash > 0) army.flash = Math.max(0, army.flash - dt)
    if (army.pressure > 0.15) army.streak += dt
    else if (army.pressure < -0.05) army.streak = 0
  }
  if (leaderHold && s.leader >= 0) s.leaderHoldSec += dt

  s.shake *= Math.exp(-dt / TAU.shake)
  s.skyPressure += (s.aggPressure - s.skyPressure) * (1 - Math.exp(-dt / TAU.sky))
  if (s.lightning > 0) s.lightning = Math.max(0, s.lightning - dt)
  if (s.flashWhite > 0) s.flashWhite = Math.max(0, s.flashWhite - dt)
  if (s.celebrate > 0) s.celebrate = Math.max(0, s.celebrate - dt)
  if (s.winnerFx > 0) {
    s.winnerFx = Math.max(0, s.winnerFx - dt)
    // keep the sky lit up for the winner while the cinematic runs
    if (s.winner && Math.random() < dt * 1.6) {
      const army = state.bySymbol.get(s.winner.symbol)
      fireworks(state, army ? army.color : 0xffffff, 1)
    }
  }

  // ---- soldiers ----
  const so = state.soldiers
  for (let i = 0; i < so.r.length; i++) {
    if (!so.active[i]) continue
    const army = state.armies[so.army[i]]
    const front = army.front
    const st = so.st[i]
    const inMelee = so.r[i] < ARENA.meleeR

    if (st === 0) {
      so.phase[i] += dt * 12
      // heavies march a little slower than riflemen, so a block print's squad
      // arrives as a second wave behind its own skirmishers
      const speed = (so.side[i] === 1 ? 2.5 : 3.3) + (i % 5) * 0.16
      so.r[i] -= speed * dt
      so.a[i] += (so.weave[i] * Math.sin(so.phase[i] * 0.5) * dt) / Math.max(6, so.r[i])

      // Lane discipline dissolves as they close on the hill. Far out a soldier
      // is pulled back toward his army's heading; near the citadel there is no
      // heading left to keep and the eight columns fold into one mass.
      const grip = Math.max(0, (so.r[i] - ARENA.meleeR) / (ARENA.rim - ARENA.meleeR))
      if (grip > 0) {
        let off = so.a[i] - army.angle
        while (off > Math.PI) off -= Math.PI * 2
        while (off < -Math.PI) off += Math.PI * 2
        const slack = ARENA.wedgeHalf * (1 + (1 - grip) * 2.2)
        if (off > slack) so.a[i] -= (off - slack) * grip * 3 * dt
        else if (off < -slack) so.a[i] -= (off + slack) * grip * 3 * dt
      }

      if (so.r[i] < ARENA.hillR - 3) so.r[i] = ARENA.hillR - 3
      else if (so.r[i] > ARENA.rim) so.r[i] = ARENA.rim
      // engage: at your army's own frontline, or the moment you reach the brawl
      // hold at your army's own line, or pile into the brawl once you reach it
      if (so.r[i] <= front + ARENA.clashBand || so.r[i] < ARENA.meleeR) {
        so.st[i] = 1
        so.timer[i] = 0
      }
    } else if (st === 1) {
      so.phase[i] += dt * 7
      if (inMelee) {
        // in the brawl everyone grinds toward the citadel and jostles sideways
        // everyone grinds toward the citadel; how far you get is your army's line
        so.r[i] += (so.r[i] > front ? -0.9 : 0.35) * dt
        so.a[i] += ((Math.random() - 0.5) * 2.2 * dt) / Math.max(6, so.r[i])
        if (so.r[i] < ARENA.hillR - 3) so.r[i] = ARENA.hillR - 3
      } else {
        so.r[i] += (Math.random() - 0.5) * 0.6 * dt
        so.a[i] += ((Math.random() - 0.5) * 0.5 * dt) / Math.max(6, so.r[i])
      }
      so.timer[i] += dt

      if (Math.random() < dt * (inMelee ? 5.5 : 3.6)) {
        polar(so.r[i], so.a[i], _p)
        // fire inward, at whoever is between you and the hill
        const dx = -Math.cos(so.a[i])
        const dz = -Math.sin(so.a[i])
        const my = sampleHeight(_p.x, _p.z) + 0.58
        spawnFire(state, _p.x + dx * 0.35, my, _p.z + dz * 0.35,
          dx * 2, 0.6 + Math.random(), dz * 2, 0.32, 0.08, MUZZLE)
        spawnFire(state, _p.x + dx * 0.35, my, _p.z + dz * 0.35,
          dx * (20 + Math.random() * 8) + (Math.random() - 0.5) * 3,
          (Math.random() - 0.5) * 1.5,
          dz * (20 + Math.random() * 8) + (Math.random() - 0.5) * 3,
          0.16, 0.16 + Math.random() * 0.08, MUZZLE)
      }

      // Who dies. In the brawl you are fighting the other seven armies, so what
      // kills you is belonging to the one that is losing the round — the last
      // place bleeds out at the centre while the leader walks onto the hill.
      // Out on the open field it is your own ticker being sold that kills you.
      let deathP
      if (inMelee) {
        deathP = 0.16 + (1 - army.advance) * 0.85 + Math.max(0, -army.pressure) * 0.3
      } else {
        const overrun = so.r[i] < front - 5 ? 0.5 : 0
        deathP = 0.1 + Math.max(0, -army.pressure) * 0.6 + army.activity * 0.04 + overrun
      }
      if (so.side[i] === 1) deathP *= 0.55 // heavies take more killing
      if (Math.random() < deathP * dt) {
        so.st[i] = 2
        so.timer[i] = 0.35
        polar(so.r[i], so.a[i], _p)
        const hy = sampleHeight(_p.x, _p.z) + 0.5
        for (let k = 0; k < 5; k++) {
          spawnFire(state, _p.x, hy, _p.z, (Math.random() - 0.5) * 3, 1 + Math.random() * 2,
            (Math.random() - 0.5) * 3, 0.4 + Math.random() * 0.4, 0.3, FIRE_STOPS[1])
        }
        spawnDust(state, _p.x, hy, _p.z, 0, 0.6, 0, 1.2, 0.7, 1, DUSTC)
      }
    } else {
      so.timer[i] -= dt
      if (so.timer[i] <= 0) freeSoldier(state, i)
    }
  }

  // ---- vehicles ----
  const t = state.tanks
  for (let i = 0; i < t.x.length; i++) {
    if (!t.active[i]) continue
    const army = state.armies[t.army[i]]
    const st = t.st[i]
    const gx = t.x[i]
    const gz = t.z[i]
    if (st === 0) {
      const dxx = t.tx[i] - gx
      const dzz = t.tz[i] - gz
      const d = Math.hypot(dxx, dzz)
      t.yaw[i] = Math.atan2(dxx, dzz)
      t.life[i] -= dt
      if (d > 2) {
        const sp = 6.5
        t.x[i] += (dxx / d) * sp * dt
        t.z[i] += (dzz / d) * sp * dt
        if (Math.random() < dt * 8) {
          spawnDust(state, gx - Math.sin(t.yaw[i]) * 2, sampleHeight(gx, gz) + 0.2, gz - Math.cos(t.yaw[i]) * 2,
            (Math.random() - 0.5) * 0.8, 0.4, (Math.random() - 0.5) * 0.8, 1 + Math.random(), 0.9, 0.5, DUSTC)
        }
      } else {
        t.st[i] = 1
        t.timer[i] = 0.4
      }
    } else if (st === 1) {
      t.timer[i] -= dt
      t.life[i] -= dt
      // face the enemy: buys look inward at the bears, sells look outward
      const facing = t.side[i] === 0 ? -1 : 1
      t.yaw[i] = Math.atan2(Math.cos(army.angle) * facing, Math.sin(army.angle) * facing)
      if (t.timer[i] <= 0) {
        fireVehicle(state, i)
        t.timer[i] = 0.9 + Math.random() * 0.8
      }
      if (t.life[i] <= 0) t.st[i] = 2
    } else {
      const away = t.side[i] === 0 ? 1 : -1
      const ang = Math.atan2(gz, gx)
      t.yaw[i] = Math.atan2(Math.cos(ang) * away, Math.sin(ang) * away)
      t.x[i] += Math.cos(ang) * away * 8 * dt
      t.z[i] += Math.sin(ang) * away * 8 * dt
      const rr = Math.hypot(t.x[i], t.z[i])
      if (rr > ARENA.rim + 14 || rr < ARENA.hillR - 4) freeVehicle(state, i)
    }
  }

  // ---- planes ----
  const p = state.planes
  for (let i = 0; i < p.x0.length; i++) {
    if (!p.active[i]) continue
    const prev = p.t[i]
    p.t[i] += p.speed[i] * dt
    const tt = p.t[i]
    const px = p.x0[i] + (p.x1[i] - p.x0[i]) * tt
    const pz = p.z0[i] + (p.z1[i] - p.z0[i]) * tt
    if (Math.random() < dt * 22) {
      spawnDust(state, px, p.y[i] - 0.3, pz, 0, 0.1, 0, 0.6, 0.8, 0.2, WHITE)
    }
    if (p.kind[i] === 1) {
      const DROPS = [0.36, 0.45, 0.54, 0.63]
      for (let b = 0; b < DROPS.length; b++) {
        const th = DROPS[b]
        if (prev < th && tt >= th) {
          const bx = p.x0[i] + (p.x1[i] - p.x0[i]) * th
          const bz = p.z0[i] + (p.z1[i] - p.z0[i]) * th
          explosion(state, bx, sampleHeight(bx, bz) + 1, bz, 5, 85)
        }
      }
    } else if (tt > 0.3 && tt < 0.72 && Math.random() < dt * 4.5) {
      const army = state.armies[p.army[i]]
      const a = army.angle + (Math.random() - 0.5) * ARENA.wedgeHalf * 1.5
      polar(army.front + (Math.random() - 0.5) * 6, a, _p)
      spawnTracer(state, px, p.y[i], pz, _p.x, sampleHeight(_p.x, _p.z) + 0.5, _p.z, 3)
    }
    if (tt >= 1) freePlane(state, i)
  }

  // ---- particles ----
  const f = state.fire
  for (let i = 0; i < f.size.length; i++) {
    if (!f.active[i]) continue
    const o = i * 3
    f.pos[o] += f.vel[o] * dt
    f.pos[o + 1] += f.vel[o + 1] * dt
    f.pos[o + 2] += f.vel[o + 2] * dt
    f.vel[o + 1] -= 9.8 * dt
    f.life[i] -= dt
    if (f.life[i] <= 0) {
      f.active[i] = 0
      f.size[i] = 0
      free(f.fl, i)
      continue
    }
    rampFire(f.life[i] / f.maxlife[i], f.color, o)
  }

  const d = state.dust
  for (let i = 0; i < d.size.length; i++) {
    if (!d.active[i]) continue
    const o = i * 3
    d.pos[o] += d.vel[o] * dt
    d.pos[o + 1] += d.vel[o + 1] * dt
    d.pos[o + 2] += d.vel[o + 2] * dt
    d.vel[o + 1] += d.grav[i] * dt
    d.life[i] -= dt
    if (d.life[i] <= 0) {
      d.active[i] = 0
      d.size[i] = 0
      free(d.fl, i)
      continue
    }
    if (d.life[i] / d.maxlife[i] < 0.4) d.size[i] *= 1 - dt * 2.2
  }

  const tr = state.tracers
  for (let i = 0; i < tr.x0.length; i++) {
    if (!tr.active[i]) continue
    const dx = tr.tx[i] - tr.hx[i]
    const dy = tr.ty[i] - tr.hy[i]
    const dz = tr.tz[i] - tr.hz[i]
    const dd = Math.hypot(dx, dy, dz)
    const stepLen = tr.speed[i] * dt
    if (dd <= stepLen || dd < 1) {
      explosion(state, tr.tx[i], tr.ty[i], tr.tz[i], tr.radius[i], 26)
      tr.active[i] = 0
      free(tr.fl, i)
    } else {
      tr.hx[i] += (dx / dd) * stepLen
      tr.hy[i] += (dy / dd) * stepLen
      tr.hz[i] += (dz / dd) * stepLen
    }
  }

  const sh = state.shock
  for (let i = 0; i < sh.x.length; i++) {
    if (!sh.active[i]) continue
    sh.life[i] -= dt
    sh.r[i] += (sh.maxr[i] - sh.r[i]) * (1 - Math.exp(-dt / 0.12))
    if (sh.life[i] <= 0) {
      sh.active[i] = 0
      free(sh.fl, i)
    }
  }

  // ---- debris: gravity, tumble, one bounce, then settle and fade ----
  const db = state.debris
  for (let i = 0; i < db.size.length; i++) {
    if (!db.active[i]) continue
    const o = i * 3
    db.pos[o] += db.vel[o] * dt
    db.pos[o + 1] += db.vel[o + 1] * dt
    db.pos[o + 2] += db.vel[o + 2] * dt
    db.vel[o + 1] -= 26 * dt
    db.rot[o] += db.spin[o] * dt
    db.rot[o + 1] += db.spin[o + 1] * dt
    db.rot[o + 2] += db.spin[o + 2] * dt
    const gy = sampleHeight(db.pos[o], db.pos[o + 2])
    if (db.pos[o + 1] < gy + 0.1) {
      db.pos[o + 1] = gy + 0.1
      if (db.vel[o + 1] < -3) {
        db.vel[o + 1] *= -0.32 // one bounce, then it's dead weight
        db.vel[o] *= 0.55
        db.vel[o + 2] *= 0.55
        db.spin[o] *= 0.5; db.spin[o + 1] *= 0.5; db.spin[o + 2] *= 0.5
      } else {
        db.vel[o] *= 0.82; db.vel[o + 1] = 0; db.vel[o + 2] *= 0.82
        db.spin[o] *= 0.8; db.spin[o + 1] *= 0.8; db.spin[o + 2] *= 0.8
      }
    }
    db.life[i] -= dt
    if (db.life[i] <= 0) {
      db.active[i] = 0
      free(db.fl, i)
    }
  }

  // ---- clash ambience: embers along every army's contested line ----
  for (let ai = 0; ai < ARMIES; ai++) {
    const army = state.armies[ai]
    const emit = army.activity * 5 * dt + Math.random() * 0.16
    const count = emit | 0
    for (let c = 0; c < count; c++) {
      const brawling = army.front <= ARENA.meleeR
      const a = brawling
        ? Math.random() * Math.PI * 2
        : army.angle + (Math.random() - 0.5) * ARENA.wedgeHalf * 1.9
      const er = brawling ? ARENA.hillR + Math.random() * (ARENA.meleeR - ARENA.hillR) : army.front
      polar(er + (Math.random() - 0.5) * 4, a, _p)
      const hy = sampleHeight(_p.x, _p.z)
      spawnFire(state, _p.x, hy + 0.3 + Math.random() * 0.7, _p.z,
        (Math.random() - 0.5) * 1.2, 1.2 + Math.random() * 1.6, (Math.random() - 0.5) * 1.2,
        0.4 + Math.random() * 0.5, 0.45 + Math.random() * 0.4, EMBER)
      if (Math.random() < 0.4) {
        spawnDust(state, _p.x, hy + 0.4, _p.z, 0, 0.7, 0, 1 + Math.random(), 0.9, 1, SMOKE)
      }
    }
  }
}
