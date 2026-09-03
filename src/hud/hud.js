// ============================================================================
// hud.js — the DOM overlay. It reads the same `state` the battlefield renders
// from, so the numbers and the war can never disagree.
//
// Built once, then updated in place at ~8 Hz: rows are keyed by ticker and
// moved with a transform, so a rank change slides instead of repainting.
// ============================================================================

import { ARMIES, fmtUsd, fmtPct, fmtPrice, fmtClock } from '../config.js'
import './hud.css'

const ROW_H = 46
const el = (tag, cls, html) => {
  const n = document.createElement(tag)
  if (cls) n.className = cls
  if (html != null) n.innerHTML = html
  return n
}

export function createHud(root) {
  root.innerHTML = ''

  // ---------------------------------------------------------------- top bar
  const top = el('div', 'top')
  const brand = el('div', 'brand')
  brand.append(
    el('div', '', `<div class="brand-mark">Stock Royale</div><div class="brand-sub">8 tickers enter · one flag stands</div>`)
  )
  const sessionPill = el('div', 'pill', '<span class="dot"></span><span>CONNECTING…</span>')
  const simPill = el('div', 'pill sim', '<span class="dot"></span><span>SIMULATED TAPE · PRICES ARE NOT REAL</span>')
  simPill.hidden = true
  brand.append(sessionPill, simPill)

  const clock = el('div', 'panel clock')
  clock.innerHTML = `
    <div class="clock-ring">
      <svg width="54" height="54"><circle class="bg" cx="27" cy="27" r="23"></circle><circle class="fg" cx="27" cy="27" r="23"></circle></svg>
      <div class="clock-num">5:00</div>
    </div>
    <div class="clock-meta">
      <div class="clock-label">Round ends in</div>
      <div class="clock-round">—</div>
    </div>`
  const ring = clock.querySelector('.fg')
  const clockNum = clock.querySelector('.clock-num')
  const clockRound = clock.querySelector('.clock-round')
  const CIRC = 2 * Math.PI * 23
  ring.style.strokeDasharray = `${CIRC}`

  const topRight = el('div', 'top-right')
  const soundBtn = el('button', 'btn', '🔇')
  soundBtn.title = 'Sound (M)'
  const linkPill = el('div', 'pill', '<span class="dot"></span><span>OFFLINE</span>')
  topRight.append(linkPill, soundBtn)

  top.append(brand, clock, topRight)

  // ------------------------------------------------------------ leaderboard
  const board = el('div', 'panel board')
  board.append(el('div', 'panel-title', '<span>Standings</span><span id="hud-round-label"></span>'))
  const lbRows = el('div', 'lb-rows')
  lbRows.style.height = ARMIES * ROW_H + 6 + 'px'
  board.append(lbRows)
  const roundLabel = board.querySelector('#hud-round-label')

  // -------------------------------------------------------------- the feed
  const feed = el('div', 'panel feed')
  feed.append(el('div', 'panel-title', '<span>Tape</span>'))
  const feedRows = el('div', 'feed-rows')
  feed.append(feedRows)

  // ------------------------------------------------------------ hall of fame
  const fame = el('div', 'panel fame')
  fame.append(el('div', 'panel-title', '<span>Past winners</span>'))
  const fameRows = el('div', 'fame-rows')
  fameRows.append(el('div', 'fame-empty', 'No rounds decided yet.'))
  fame.append(fameRows)

  // ------------------------------------------------------------ banner slot
  const bannerWrap = el('div', 'banner-wrap')

  root.append(top, board, bannerWrap, feed, fame)

  // --------------------------------------------------------- full-screen UI
  const winner = el('div', 'winner')
  winner.innerHTML = `
    <div class="winner-card">
      <div class="winner-kicker">Round winner</div>
      <div class="winner-sym">—</div>
      <div class="winner-pct">—</div>
      <div class="winner-meta"></div>
      <div class="winner-podium"></div>
    </div>`
  document.body.append(winner)
  const wSym = winner.querySelector('.winner-sym')
  const wPct = winner.querySelector('.winner-pct')
  const wMeta = winner.querySelector('.winner-meta')
  const wPodium = winner.querySelector('.winner-podium')

  const closed = el('div', 'closed')
  closed.innerHTML = `
    <div class="closed-card">
      <div class="closed-title">Market closed</div>
      <div class="closed-sub">The armies stand down until the tape reopens.</div>
      <div class="closed-count">—</div>
    </div>`
  document.body.append(closed)
  const closedCount = closed.querySelector('.closed-count')
  const closedSub = closed.querySelector('.closed-sub')

  // ------------------------------------------------------------------ rows
  /** @type {Map<string, {row:HTMLElement, sym:HTMLElement, ...}>} */
  const rows = new Map()

  let rosterSig = ''
  function ensureRows(state) {
    const sig = state.armies.map((a) => a.symbol + a.colorCss).join(',')
    if (sig === rosterSig) return
    rosterSig = sig
    lbRows.innerHTML = ''
    rows.clear()
    for (const army of state.armies) {
      const row = el('div', 'lb-row')
      row.innerHTML = `
        <div class="lb-rank">—</div>
        <div class="lb-mid">
          <div class="lb-line"><span class="lb-sym"></span><span class="lb-price">—</span></div>
          <div class="lb-bar"><i></i></div>
        </div>
        <div class="lb-right">
          <div class="lb-pct">0.00%</div>
          <div class="lb-press"><i></i></div>
        </div>`
      const sym = row.querySelector('.lb-sym')
      sym.textContent = army.symbol
      sym.style.color = army.colorCss
      row.querySelector('.lb-bar i').style.background = army.colorCss
      lbRows.append(row)
      rows.set(army.symbol, {
        row,
        rank: row.querySelector('.lb-rank'),
        price: row.querySelector('.lb-price'),
        bar: row.querySelector('.lb-bar i'),
        pct: row.querySelector('.lb-pct'),
        press: row.querySelector('.lb-press i'),
      })
    }
  }

  // ---------------------------------------------------------------- update
  let lastFameSig = ''

  function update(state) {
    const s = state.scalars
    ensureRows(state)

    // -- standings
    for (const army of state.armies) {
      const r = rows.get(army.symbol)
      if (!r) continue
      r.row.style.transform = `translateY(${(army.rank - 1) * ROW_H}px)`
      r.row.classList.toggle('leader', s.leader === army.index)
      r.rank.textContent = army.rank
      r.price.textContent = fmtPrice(army.price)
      r.pct.textContent = fmtPct(army.pct)
      r.pct.className = 'lb-pct ' + (army.pct >= 0 ? 'up' : 'down')
      r.bar.style.width = Math.round(6 + army.advance * 94) + '%'
      // pressure: a bar growing left (selling) or right (buying) from centre
      const p = Math.max(-1, Math.min(1, army.pressure))
      const w = Math.abs(p) * 50
      r.press.style.width = w + '%'
      r.press.style.left = p >= 0 ? '50%' : 50 - w + '%'
      r.press.style.background = p >= 0 ? 'var(--up)' : 'var(--down)'
    }

    // -- session
    simPill.hidden = !s.sim
    if (s.sim && !document.title.startsWith('[SIM]')) document.title = '[SIM] ' + document.title
    const live = s.session?.live
    sessionPill.className = 'pill ' + (live ? 'live' : 'closed')
    sessionPill.lastChild.textContent = s.session?.label || '—'
    linkPill.className = 'pill ' + (s.connected ? 'live' : 'closed')
    linkPill.lastChild.textContent = s.connected ? 'BACKEND LIVE' : 'OFFLINE'

    // -- round clock
    if (s.round && live) {
      const now = Date.now() + s.serverSkewMs
      const left = Math.max(0, s.round.endsAt - now)
      clockNum.textContent = fmtClock(left)
      clockRound.textContent = `Round ${s.round.label} ET`
      ring.style.strokeDashoffset = String(CIRC * s.roundProgress)
      clock.classList.toggle('urgent', left <= 15000)
      roundLabel.textContent = s.round.label + ' ET'
    } else {
      clockNum.textContent = '—'
      clockRound.textContent = live ? 'Waiting for the tape' : 'Standing down'
      ring.style.strokeDashoffset = String(CIRC)
      clock.classList.remove('urgent')
    }

    // -- closed-market overlay
    if (!live && s.session) {
      closed.classList.add('show')
      const left = Math.max(0, (s.session.nextChangeAt || 0) - (Date.now() + s.serverSkewMs))
      const h = Math.floor(left / 3600000)
      const m = Math.floor((left % 3600000) / 60000)
      const sec = Math.floor((left % 60000) / 1000)
      closedCount.textContent = h > 0 ? `${h}h ${m}m` : `${m}:${String(sec).padStart(2, '0')}`
      closedSub.textContent = `The armies stand down until ${labelFor(s.session.nextState)}.`
    } else {
      closed.classList.remove('show')
    }

    // -- hall of fame
    const hist = s.history || []
    const sig = hist.map((h) => h.round?.id + ':' + (h.winner?.symbol || '-')).join('|')
    if (sig !== lastFameSig) {
      lastFameSig = sig
      fameRows.innerHTML = ''
      if (!hist.length) fameRows.append(el('div', 'fame-empty', 'No rounds decided yet.'))
      for (const h of hist.slice(0, 8)) {
        const row = el('div', 'fame-row')
        const col = state.bySymbol.get(h.winner?.symbol)?.colorCss || 'var(--dim)'
        row.innerHTML = `
          <span class="fame-time">${h.round?.label ?? '—'}</span>
          <span class="fame-sym" style="color:${col}">${h.winner?.symbol ?? 'NO CONTEST'}</span>
          <span class="fame-pct">${h.winner ? fmtPct(h.winner.pct) : ''}</span>`
        fameRows.append(row)
      }
    }
  }

  const labelFor = (st) =>
    st === 'pre' ? 'the pre-market open' : st === 'regular' ? 'the opening bell' : st === 'post' ? 'after hours' : 'the next session'

  // ------------------------------------------------------------------ feed
  function pushFeed(e, state) {
    const army = state.bySymbol.get(e.symbol)
    const row = el('div', 'feed-row' + (e.bucket === 'whale' || e.bucket === 'dolphin' ? ' big' : ''))
    const verb =
      e.bucket === 'whale' ? (e.side === 'buy' ? 'block bid' : 'block dumped') :
      e.bucket === 'dolphin' ? (e.side === 'buy' ? 'bought' : 'sold') :
      e.side === 'buy' ? 'lifted' : 'hit'
    row.innerHTML = `
      <span class="feed-sym" style="color:${army?.colorCss || 'var(--dim)'}">${e.symbol}</span>
      <span class="feed-txt">${verb} ${e.size.toLocaleString()} @ $${e.price.toFixed(2)}</span>
      <span class="feed-amt ${e.side}">${e.side === 'buy' ? '+' : '−'}${fmtUsd(e.notional)}</span>`
    feedRows.prepend(row)
    while (feedRows.children.length > 12) feedRows.lastChild.remove()
  }

  // ---------------------------------------------------------------- banner
  let bannerTimer = null
  function banner(text, color) {
    const b = el('div', 'banner', text)
    if (color) {
      b.style.color = color
      b.style.borderColor = color + '66'
    }
    bannerWrap.innerHTML = ''
    bannerWrap.append(b)
    clearTimeout(bannerTimer)
    bannerTimer = setTimeout(() => {
      b.classList.add('out')
      setTimeout(() => b.remove(), 420)
    }, 2100)
  }

  // ---------------------------------------------------------------- winner
  function showWinner(payload, state) {
    const w = payload.winner
    if (!w) {
      wSym.textContent = 'NO CONTEST'
      wSym.style.color = 'var(--dim)'
      wPct.textContent = 'Not a single print all round'
      wMeta.textContent = ''
      wPodium.innerHTML = ''
    } else {
      const col = state.bySymbol.get(w.symbol)?.colorCss || '#fff'
      wSym.textContent = w.symbol
      wSym.style.color = col
      wPct.textContent = fmtPct(w.pct)
      wPct.style.color = w.pct >= 0 ? 'var(--up)' : 'var(--down)'
      wMeta.textContent = `${fmtPrice(w.price)} · won by ${w.lead.toFixed(2)} pts · ${w.trades.toLocaleString()} prints · ${fmtUsd(w.buyNotional)} bought in the last 30s`
      wPodium.innerHTML = ''
      payload.podium.slice(1, 3).forEach((p, i) => {
        const d = el('div', '', `<b style="color:${state.bySymbol.get(p.symbol)?.colorCss || '#fff'}">${p.symbol}</b>${i === 0 ? '2nd' : '3rd'} · ${fmtPct(p.pct)}`)
        wPodium.append(d)
      })
    }
    winner.classList.add('show')
  }
  const hideWinner = () => winner.classList.remove('show')

  // ----------------------------------------------------------------- misc
  function onSoundToggle(fn) {
    soundBtn.addEventListener('click', fn)
  }
  const setSoundIcon = (muted) => {
    soundBtn.textContent = muted ? '🔇' : '🔊'
  }

  return {
    update,
    pushFeed,
    banner,
    showWinner,
    hideWinner,
    onSoundToggle,
    setSoundIcon,
    dispose() {
      root.innerHTML = ''
      winner.remove()
      closed.remove()
      clearTimeout(bannerTimer)
    },
  }
}
