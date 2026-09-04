// ============================================================================
// hud.js — the terminal overlay. It reads the same `state` the battlefield
// renders from, so the numbers and the war can never disagree.
//
// Laid out as a trading desk rather than a game HUD: a standings blotter with
// column headers and sparklines, a time & sales print log, a round clock on a
// rail, past winners, and a tape crawling along the bottom. Built once, then
// updated in place ~8×/s — rows are keyed by ticker and moved with a transform,
// so a rank change slides instead of repainting.
// ============================================================================

import { ARMIES, fmtUsd, fmtUsdExact, fmtPct, fmtPrice, fmtClock } from '../config.js'
import './hud.css'

/** Row pitch, owned by hud.css (--row-h) so the phone breakpoint can change it
 *  in one place without the JS that positions rows drifting out of agreement. */
const rowPitch = () =>
  parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--row-h')) || 27

const el = (tag, cls, html) => {
  const n = document.createElement(tag)
  if (cls) n.className = cls
  if (html != null) n.innerHTML = html
  return n
}

const ET_TIME = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
})

export function createHud(root) {
  root.innerHTML = ''

  // ---------------------------------------------------------------- top bar
  // One strip, cells divided by hairlines — a terminal's status bar, not a row
  // of floating boxes. Boxes wrap and reflow the moment the window narrows;
  // cells just drop by priority (data-p) and the bar stays one line.
  const top = el('div', 'panel bar')
  top.innerHTML = `
    <div class="cell brand"><b class="full">Stock<i>·</i>Royale</b><b class="short">S<i>·</i>R</b></div>
    <div class="cell kv" data-p="4"><span class="k">Format</span><span class="v dim">8 tickers · 5-min rounds</span></div>
    <div class="cell kv" data-p="2"><span class="k">Session</span><span class="v sess">CONNECTING…</span></div>
    <div class="cell kv round">
      <span class="k">Round ends in</span>
      <span class="v"><b class="clock-num">—</b><i class="clock-round"></i></span>
      <span class="rail"><i></i></span>
    </div>
    <div class="cell kv" data-p="3"><span class="k">New York</span><span class="v et">--:--:--</span></div>
    <div class="cell flag link"><span class="dot"></span><span class="lbl">Link down</span></div>
    <div class="cell flag sim"><span class="dot"></span><span class="full">Simulated tape · not real prices</span><span class="short">Sim</span></div>`
  const leadBtn = el('button', 'cell btn wide', 'Leaderboard')
  leadBtn.title = 'Who has been paid'
  const helpBtn = el('button', 'cell btn', '?')
  helpBtn.title = 'How this works'
  const soundBtn = el('button', 'cell btn', '×')
  soundBtn.title = 'Sound (M)'
  top.append(leadBtn, helpBtn, soundBtn)

  const sessionV = top.querySelector('.sess')
  const clockCell = top.querySelector('.cell.round')
  const clockNum = top.querySelector('.clock-num')
  const clockRound = top.querySelector('.clock-round')
  const rail = top.querySelector('.rail i')
  const timeV = top.querySelector('.et')
  const linkFlag = top.querySelector('.cell.flag.link')
  const linkLbl = linkFlag.querySelector('.lbl')
  const simFlag = top.querySelector('.cell.flag.sim')
  simFlag.hidden = true

  // ------------------------------------------------------------ standings
  const board = el('div', 'panel board')
  board.append(el('div', 'panel-title', '<span>Standings — round P&amp;L</span><b class="hud-round"></b>'))
  board.append(el('div', 'cols', '<span>#</span><span>Sym</span><span class="r">Last</span><span class="r">Chg%</span><span class="r">Trend</span>'))
  const lbRows = el('div', 'lb-rows')
  board.append(lbRows)
  const roundLabel = board.querySelector('.hud-round')

  let ROW_H = rowPitch()
  lbRows.style.height = ARMIES * ROW_H + 'px'
  const onResize = () => {
    ROW_H = rowPitch()
    lbRows.style.height = ARMIES * ROW_H + 'px'
  }
  window.addEventListener('resize', onResize)

  // -------------------------------------------------------- time & sales
  const blotter = el('div', 'panel blotter')
  blotter.append(el('div', 'panel-title', '<span>Time &amp; sales</span>'))
  blotter.append(el('div', 'cols', '<span>Time</span><span>Sym</span><span></span><span class="r">Size @ Px</span><span class="r">Value</span>'))
  const feedRows = el('div', 'feed-rows')
  blotter.append(feedRows)

  // ------------------------------------------------------- round winners
  const fame = el('div', 'panel fame')
  fame.append(el('div', 'panel-title', '<span>Round winners</span>'))
  fame.append(el('div', 'cols', '<span>Round</span><span>Sym</span><span class="r">Chg%</span>'))
  const fameRows = el('div', 'fame-rows')
  fameRows.append(el('div', 'fame-empty', 'No rounds decided yet.'))
  fame.append(fameRows)

  // ------------------------------------------------------------ the tape
  const tape = el('div', 'tape')
  const tapeTrack = el('div', 'tape-track')
  tape.append(tapeTrack)

  // ---------------------------------------------------------------- the pot
  // The number everyone actually wants: how much money is sitting in the pot,
  // and how much of it goes out at the next bell. Centre of the screen, big,
  // because it is the reason to care who wins.
  const bannerWrap = el('div', 'banner-wrap')
  const potBox = el('div', 'pot')
  potBox.innerHTML = `
    <div class="pot-k">The pot</div>
    <div class="pot-v">—</div>
    <div class="pot-sub">waiting for the backend</div>`
  bannerWrap.append(potBox)
  const potV = potBox.querySelector('.pot-v')
  const potSub = potBox.querySelector('.pot-sub')

  root.append(top, board, bannerWrap, blotter, fame, tape)

  // --------------------------------------------------------- full-screen
  const winner = el('div', 'winner')
  winner.innerHTML = `
    <div class="winner-card">
      <div class="winner-hd"><span>Round winner</span><span class="winner-round"></span></div>
      <div class="winner-body">
        <div class="winner-sym">—</div>
        <div class="winner-pct">—</div>
        <div class="winner-grid">
          <div><div class="winner-k">Last</div><div class="winner-v w-last">—</div></div>
          <div><div class="winner-k">Margin</div><div class="winner-v w-lead">—</div></div>
          <div><div class="winner-k">Prints</div><div class="winner-v w-trades">—</div></div>
          <div><div class="winner-k">Bought 30s</div><div class="winner-v w-buy">—</div></div>
        </div>
      </div>
      <div class="winner-podium"></div>
    </div>`
  document.body.append(winner)
  const wSym = winner.querySelector('.winner-sym')
  const wPct = winner.querySelector('.winner-pct')
  const wRound = winner.querySelector('.winner-round')
  const wLast = winner.querySelector('.w-last')
  const wLead = winner.querySelector('.w-lead')
  const wTrades = winner.querySelector('.w-trades')
  const wBuy = winner.querySelector('.w-buy')
  const wPodium = winner.querySelector('.winner-podium')

  // ------------------------------------------------------------- airdrop
  // The prize, full screen: the stock being bought, then every transfer landing
  // one by one in a live console, each line badged with the ticker's colours.
  // This is the moment the whole game exists for, so it gets the whole screen.
  const drop = el('div', 'drop')
  drop.innerHTML = `
    <div class="drop-card">
      <div class="drop-hd">
        <span class="drop-title">Airdrop</span>
        <span class="drop-flags"></span>
        <button class="drop-x" title="Close">✕</button>
      </div>

      <div class="drop-hero">
        <span class="tchip big"></span>
        <div class="drop-hero-txt">
          <div class="drop-hero-line"><b class="drop-sym">—</b><span class="drop-to"></span></div>
          <div class="drop-hero-sub drop-chain"></div>
        </div>
      </div>

      <div class="drop-stages">
        <div class="stage" data-s="buy"><i>1</i><span>Buying</span><em></em></div>
        <div class="stage" data-s="send"><i>2</i><span>Distributing</span><em></em></div>
        <div class="stage" data-s="done"><i>3</i><span>Done</span><em></em></div>
      </div>
      <div class="drop-bar"><i></i></div>

      <div class="drop-console-hd">
        <span>Live transfers</span><span class="drop-count"></span>
      </div>
      <div class="drop-rows"><div class="drop-empty">Waiting for the chain…</div></div>

      <div class="drop-ft">
        <span class="drop-total">—</span>
        <button class="drop-lead">See who has been paid →</button>
      </div>
    </div>`
  document.body.append(drop)
  const dTitle = drop.querySelector('.drop-title')
  const dFlags = drop.querySelector('.drop-flags')
  const dHeroChip = drop.querySelector('.tchip.big')
  const dSym = drop.querySelector('.drop-sym')
  const dTo = drop.querySelector('.drop-to')
  const dRows = drop.querySelector('.drop-rows')
  const dTotal = drop.querySelector('.drop-total')
  const dChain = drop.querySelector('.drop-chain')
  const dCount = drop.querySelector('.drop-count')
  const dBar = drop.querySelector('.drop-bar i')
  const dStage = (k) => drop.querySelector(`.stage[data-s="${k}"]`)

  let dropTimer = null
  let dropRows = 0
  let dropExpected = 0
  let dropTicker = '—'
  let dropColor = 'var(--amber)'
  const closeDrop = () => {
    clearTimeout(dropTimer)
    drop.classList.remove('show')
  }
  drop.querySelector('.drop-x').addEventListener('click', closeDrop)
  drop.addEventListener('click', (ev) => {
    if (ev.target === drop) closeDrop()
  })

  const shortAddr = (a) => (a && a.length > 14 ? a.slice(0, 8) + '…' + a.slice(-6) : a || '—')
  const txLink = (url, label) =>
    url && !url.includes('0xSIM')
      ? `<a href="${url}" target="_blank" rel="noopener">${label}</a>`
      : `<span style="color:var(--dimmer)">${label}</span>`
  /** The ticker's badge — a colour and a monogram is all the logo it needs. */
  const chip = (sym, color) => `<span class="tchip" style="--c:${color}">${sym}</span>`

  function setStage(k, state, detail) {
    const node = dStage(k)
    if (!node) return
    node.className = 'stage ' + state
    if (detail != null) node.querySelector('em').innerHTML = detail
  }

  function airdropStart(e, st) {
    clearTimeout(dropTimer)
    hideWinner()
    dropRows = 0
    dropExpected = e.holders || 0
    dropTicker = e.ticker
    dropColor = st.bySymbol.get(e.ticker)?.colorCss || 'var(--amber)'

    dTitle.textContent = `Airdrop · round ${e.round?.label ?? ''} ET`
    dFlags.innerHTML =
      (e.simulated ? '<span class="drop-tag demo">Simulation — nothing sent</span> ' : '') +
      (e.demo ? '<span class="drop-tag demo">Demo data</span> ' : '') +
      (e.dryRun ? '<span class="drop-tag">Dry run — no funds moved</span>' : '')

    dHeroChip.textContent = e.ticker
    dHeroChip.style.setProperty('--c', dropColor)
    dSym.textContent = e.ticker
    dSym.style.color = dropColor
    const budget = e.budgetUsd ?? st.scalars.pot?.nextDropUsd ?? null
    dTo.textContent =
      `→ ${(e.holders || 0).toLocaleString()} holders` + (budget != null ? ` · ${fmtUsdExact(budget)} of stock` : '')
    dChain.innerHTML = e.token
      ? `to holders of ${txLink(`${e.explorer}/token/${e.token}`, e.tokenSymbol ? '$' + e.tokenSymbol : shortAddr(e.token))}` +
        ' · each wallet gets its share of the supply · pools, curves and contracts excluded'
      : 'each wallet gets its share of the supply · pools, curves and contracts excluded'

    setStage('buy', 'active', 'on Robinhood Chain…')
    setStage('send', '', '')
    setStage('done', '', '')
    dBar.style.width = '0%'
    dCount.textContent = ''
    dRows.innerHTML = '<div class="drop-empty">Waiting for the chain…</div>'
    dTotal.textContent = '—'
    drop.classList.add('show')
  }

  function airdropBuy(e) {
    setStage('buy', 'done',
      `bought <b>${e.amount.toLocaleString(undefined, { maximumFractionDigits: 4 })} ${e.ticker}</b> ` +
      `for <b>${e.eth} ETH</b> ${txLink(e.txUrl, '↗')}`)
    setStage('send', 'active', '')
  }

  function airdropPayment(e) {
    if (!dropRows) dRows.innerHTML = ''
    dropRows++
    const row = el('div', 'drop-row')
    row.innerHTML =
      `<span class="drop-time">${ET_TIME.format(new Date())}</span>` +
      chip(e.ticker || dropTicker, dropColor) +
      `<span class="drop-addr">${txLink(e.addrUrl, shortAddr(e.to))}</span>` +
      `<span class="drop-pct">${e.pct.toFixed(2)}% held</span>` +
      `<span class="drop-amt">${e.amount.toLocaleString(undefined, { maximumFractionDigits: 6 })}</span>` +
      `<span class="drop-tx">${txLink(e.txUrl, '↗ tx')}</span>`
    dRows.append(row)
    dCount.textContent = dropExpected ? `${dropRows} / ${dropExpected} sent` : `${dropRows} sent`
    if (dropExpected) dBar.style.width = Math.min(100, (dropRows / dropExpected) * 100) + '%'
    // follow the stream unless the viewer has scrolled up to read
    if (dRows.scrollTop + dRows.clientHeight > dRows.scrollHeight - 80) {
      dRows.scrollTop = dRows.scrollHeight
    }
  }

  function airdropResult(e) {
    setStage('send', 'done', '')
    setStage('done', 'done',
      `<b>${e.count.toLocaleString()}</b> wallets paid`)
    dBar.style.width = '100%'
    dTotal.innerHTML =
      chip(e.ticker, dropColor) +
      ` <b>${e.totalSent.toLocaleString(undefined, { maximumFractionDigits: 6 })} ${e.ticker}</b> ` +
      `to <b>${e.count.toLocaleString()}</b> holders` +
      (e.totalUsd ? ` · <span class="drop-usd">${fmtUsdExact(e.totalUsd)}</span>` : '')
    if (!dropRows) dRows.innerHTML = '<div class="drop-empty">Nobody was eligible this round.</div>'
    clearTimeout(dropTimer)
    // long enough to actually read; the ✕ closes it sooner
    dropTimer = setTimeout(closeDrop, 60_000)
  }

  function airdropError(e) {
    setStage('buy', 'fail', `<span style="color:var(--down)">${e.message}</span>`)
    clearTimeout(dropTimer)
    dropTimer = setTimeout(closeDrop, 20_000)
  }

  // The explainer lives in onboarding.js; the "?" opens it.

  const closed = el('div', 'closed')
  closed.innerHTML = `
    <div class="closed-card">
      <div class="winner-hd"><span>Session</span><span>US equities</span></div>
      <div class="closed-body">
        <div class="closed-title">Market closed</div>
        <div class="closed-sub">The armies stand down until the tape reopens.</div>
        <div class="closed-count">—</div>
      </div>
    </div>`
  document.body.append(closed)
  const closedCount = closed.querySelector('.closed-count')
  const closedSub = closed.querySelector('.closed-sub')

  // ------------------------------------------------------------ row build
  const rows = new Map()
  const tapeItems = new Map()
  let rosterSig = ''

  function ensureRows(state) {
    const sig = state.armies.map((a) => a.symbol + a.colorCss).join(',')
    if (sig === rosterSig) return
    rosterSig = sig
    lbRows.innerHTML = ''
    tapeTrack.innerHTML = ''
    rows.clear()
    tapeItems.clear()

    for (const army of state.armies) {
      const row = el('div', 'lb-row')
      row.innerHTML = `
        <span class="lb-rank">—</span>
        <span class="lb-sym"></span>
        <span class="lb-last">—</span>
        <span class="lb-pct">0.00%</span>
        <canvas class="lb-spark" width="92" height="32"></canvas>
        <i class="lb-adv"></i>`
      const sym = row.querySelector('.lb-sym')
      sym.textContent = army.symbol
      sym.style.color = army.colorCss
      const adv = row.querySelector('.lb-adv')
      adv.style.background = army.colorCss
      lbRows.append(row)
      rows.set(army.symbol, {
        row,
        rank: row.querySelector('.lb-rank'),
        last: row.querySelector('.lb-last'),
        pct: row.querySelector('.lb-pct'),
        adv,
        spark: row.querySelector('.lb-spark'),
        sctx: row.querySelector('.lb-spark').getContext('2d'),
        sparkSig: '',
      })
    }

    // The tape needs its content twice: the crawl animation translates the
    // track by -50%, so the second copy is what's on screen when the first has
    // scrolled off. Both copies are updated in place — rebuilding the DOM would
    // restart the animation and make the tape stutter every tick.
    for (let copy = 0; copy < 2; copy++) {
      for (const army of state.armies) {
        const item = el('span', 'tape-item')
        item.innerHTML =
          `<span class="tape-sym" style="color:${army.colorCss}">${army.symbol}</span>` +
          '<span class="tape-last">—</span><span class="tape-chg">—</span>'
        tapeTrack.append(item)
        const list = tapeItems.get(army.symbol) || []
        list.push({ last: item.querySelector('.tape-last'), chg: item.querySelector('.tape-chg') })
        tapeItems.set(army.symbol, list)
      }
    }
  }

  /** A sparkline of the ticker's round P&L. Redrawn only when the series moves. */
  function drawSpark(r, army) {
    const s = army.spark
    const sig = s.length + ':' + (s.length ? s[s.length - 1] : '')
    if (sig === r.sparkSig) return
    r.sparkSig = sig
    const ctx = r.sctx
    const W = r.spark.width
    const H = r.spark.height
    ctx.clearRect(0, 0, W, H)
    if (s.length < 2) return

    let lo = Infinity
    let hi = -Infinity
    for (const v of s) {
      if (v < lo) lo = v
      if (v > hi) hi = v
    }
    // always keep the zero line inside the frame — a sparkline that hides
    // whether the ticker is up or down is decoration, not data
    lo = Math.min(lo, 0)
    hi = Math.max(hi, 0)
    const span = Math.max(hi - lo, 0.02)
    const y = (v) => H - 3 - ((v - lo) / span) * (H - 6)
    const x = (i) => (i / (s.length - 1)) * (W - 1)

    ctx.strokeStyle = 'rgba(255,255,255,0.10)'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, Math.round(y(0)) + 0.5)
    ctx.lineTo(W, Math.round(y(0)) + 0.5)
    ctx.stroke()

    ctx.strokeStyle = army.pct >= 0 ? '#00d68f' : '#ff4d55'
    ctx.lineWidth = 1.6
    ctx.lineJoin = 'round'
    ctx.beginPath()
    for (let i = 0; i < s.length; i++) {
      const px = x(i)
      const py = y(s[i])
      i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)
    }
    ctx.stroke()
  }

  // ---------------------------------------------------------------- update
  let lastFameSig = ''

  function update(state) {
    const s = state.scalars
    ensureRows(state)

    for (const army of state.armies) {
      const r = rows.get(army.symbol)
      if (!r) continue
      r.row.style.transform = `translateY(${(army.rank - 1) * ROW_H}px)`
      r.row.classList.toggle('leader', s.leader === army.index)
      r.rank.textContent = army.rank
      r.last.textContent = army.price > 0 ? army.price.toFixed(2) : '—'
      r.pct.textContent = fmtPct(army.pct)
      r.pct.className = 'lb-pct ' + (army.pct >= 0 ? 'up' : 'down')
      r.adv.style.width = Math.round(army.advance * 100) + '%'
      drawSpark(r, army)

      const t = tapeItems.get(army.symbol)
      if (t) {
        const last = army.price > 0 ? army.price.toFixed(2) : '—'
        const chg = fmtPct(army.pct)
        const cls = 'tape-chg ' + (army.pct >= 0 ? 'up' : 'down')
        for (const item of t) {
          if (item.last.textContent !== last) item.last.textContent = last
          if (item.chg.textContent !== chg) {
            item.chg.textContent = chg
            item.chg.className = cls
          }
        }
      }
    }

    // -- session + link
    const live = s.session?.live
    sessionV.textContent = s.session?.label || '—'
    sessionV.style.color = live ? 'var(--up)' : 'var(--down)'
    linkFlag.className = 'cell flag link ' + (s.connected ? 'on' : 'off')
    linkLbl.textContent = s.connected ? 'Feed live' : 'Link down'
    simFlag.hidden = !s.sim
    if (s.sim && !document.title.startsWith('[SIM]')) document.title = '[SIM] ' + document.title

    timeV.textContent = ET_TIME.format(new Date(Date.now() + s.serverSkewMs))

    // -- round clock
    if (s.round && live) {
      const now = Date.now() + s.serverSkewMs
      const left = Math.max(0, s.round.endsAt - now)
      clockNum.textContent = fmtClock(left)
      clockRound.textContent = s.round.label + ' ET'
      rail.style.width = (s.roundProgress * 100).toFixed(1) + '%'
      clockCell.classList.toggle('urgent', left <= 15000)
      roundLabel.textContent = s.round.label + ' ET'
    } else {
      clockNum.textContent = '—'
      clockRound.textContent = live ? 'awaiting tape' : 'stood down'
      rail.style.width = '0%'
      clockCell.classList.remove('urgent')
      roundLabel.textContent = ''
    }

    // -- closed-market overlay
    if (!live && s.session) {
      closed.classList.add('show')
      const left = Math.max(0, (s.session.nextChangeAt || 0) - (Date.now() + s.serverSkewMs))
      const h = Math.floor(left / 3600000)
      const m = Math.floor((left % 3600000) / 60000)
      const sec = Math.floor((left % 60000) / 1000)
      closedCount.textContent = h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}:${String(sec).padStart(2, '0')}`
      closedSub.textContent = `Next session: ${labelFor(s.session.nextState)}.`
    } else {
      closed.classList.remove('show')
    }

    // -- the pot
    const pot = s.pot
    if (pot?.ready) {
      potBox.classList.remove('idle')
      potV.textContent = pot.usd != null ? fmtUsdExact(pot.usd) : `${pot.eth.toFixed(4)} ETH`
      const drop = pot.nextDropUsd != null ? fmtUsdExact(pot.nextDropUsd) : `${pot.nextDropEth.toFixed(4)} ETH`
      potSub.innerHTML =
        `next drop <b>${drop}</b> of stock · ${pot.eth.toFixed(4)} ETH in the wallet` +
        (pot.dryRun ? ' <span class="pot-dry">dry run</span>' : '')
    } else {
      potBox.classList.add('idle')
      potV.textContent = '—'
      potSub.textContent = pot?.reason || 'the airdrop wallet is not set up yet'
    }

    // -- past winners
    const hist = s.history || []
    const sig = hist.map((h) => h.round?.id + ':' + (h.winner?.symbol || '-')).join('|')
    if (sig !== lastFameSig) {
      lastFameSig = sig
      fameRows.innerHTML = ''
      if (!hist.length) fameRows.append(el('div', 'fame-empty', 'No rounds decided yet.'))
      for (const h of hist.slice(0, 10)) {
        const col = state.bySymbol.get(h.winner?.symbol)?.colorCss || 'var(--dim)'
        fameRows.append(
          el('div', 'fame-row',
            `<span class="fame-time">${h.round?.label ?? '—'}</span>` +
            `<span class="fame-sym" style="color:${col}">${h.winner?.symbol ?? 'NO CONTEST'}</span>` +
            `<span class="fame-pct">${h.winner ? fmtPct(h.winner.pct) : ''}</span>`)
        )
      }
    }
  }

  const labelFor = (st) =>
    st === 'pre' ? 'pre-market, 04:00 ET' : st === 'regular' ? 'the opening bell, 09:30 ET'
      : st === 'post' ? 'after hours, 16:00 ET' : 'the next session'

  // ------------------------------------------------------- time & sales
  function pushFeed(e, state) {
    const army = state.bySymbol.get(e.symbol)
    const block = e.bucket === 'whale' || e.bucket === 'dolphin'
    const row = el('div', 'feed-row' + (block ? ' blk' : ''))
    row.innerHTML =
      `<span class="feed-time">${ET_TIME.format(new Date(e.ts))}</span>` +
      `<span class="feed-sym" style="color:${army?.colorCss || 'var(--dim)'}">${e.symbol}</span>` +
      `<span class="feed-side ${e.side}">${e.side === 'buy' ? 'B' : 'S'}</span>` +
      `<span class="feed-px">${e.size.toLocaleString()} @ ${e.price.toFixed(2)}</span>` +
      `<span class="feed-val ${e.side}">${fmtUsd(e.notional)}</span>`
    feedRows.prepend(row)
    while (feedRows.children.length > 11) feedRows.lastChild.remove()
  }

  // ---------------------------------------------------------------- shouts
  let bannerTimer = null
  function banner(text, color) {
    const b = el('div', 'banner', text)
    if (color) {
      b.style.color = color
      b.style.borderLeftColor = color
    }
    bannerWrap.querySelectorAll('.banner').forEach((n) => n.remove())
    bannerWrap.append(b)
    clearTimeout(bannerTimer)
    bannerTimer = setTimeout(() => {
      b.classList.add('out')
      setTimeout(() => b.remove(), 340)
    }, 2100)
  }

  // ---------------------------------------------------------------- winner
  function showWinner(payload, state) {
    const w = payload.winner
    wRound.textContent = payload.round?.label ? payload.round.label + ' ET' : ''
    if (!w) {
      wSym.textContent = 'NO CONTEST'
      wSym.style.color = 'var(--dim)'
      wPct.textContent = 'Not a single print all round'
      wPct.style.color = 'var(--dim)'
      wLast.textContent = wLead.textContent = wTrades.textContent = wBuy.textContent = '—'
      wPodium.innerHTML = ''
    } else {
      const col = state.bySymbol.get(w.symbol)?.colorCss || '#fff'
      wSym.textContent = w.symbol
      wSym.style.color = col
      wPct.textContent = fmtPct(w.pct)
      wPct.style.color = w.pct >= 0 ? 'var(--up)' : 'var(--down)'
      wLast.textContent = fmtPrice(w.price)
      wLead.textContent = '+' + w.lead.toFixed(2) + ' pts'
      wTrades.textContent = w.trades.toLocaleString()
      wBuy.textContent = fmtUsd(w.buyNotional)
      wPodium.innerHTML = ''
      payload.podium.slice(1, 3).forEach((p, i) => {
        const c = state.bySymbol.get(p.symbol)?.colorCss || '#fff'
        wPodium.append(el('div', '', `${i === 0 ? '2nd' : '3rd'} &nbsp;<b style="color:${c}">${p.symbol}</b> &nbsp;${fmtPct(p.pct)}`))
      })
    }
    winner.classList.add('show')
  }
  const hideWinner = () => winner.classList.remove('show')

  // ------------------------------------------------------------------ misc
  const onSoundToggle = (fn) => soundBtn.addEventListener('click', fn)
  const onHelp = (fn) => helpBtn.addEventListener('click', fn)
  const onLeaderboard = (fn) => {
    leadBtn.addEventListener('click', fn)
    drop.querySelector('.drop-lead').addEventListener('click', () => {
      closeDrop()
      fn()
    })
  }
  const setSoundIcon = (muted) => {
    soundBtn.textContent = muted ? '×' : '♪'
    soundBtn.style.color = muted ? '' : 'var(--amber)'
  }

  return {
    update,
    pushFeed,
    banner,
    showWinner,
    hideWinner,
    airdropStart,
    airdropBuy,
    airdropPayment,
    airdropResult,
    airdropError,
    onSoundToggle,
    onLeaderboard,
    onHelp,
    setSoundIcon,
    dispose() {
      window.removeEventListener('resize', onResize)
      root.innerHTML = ''
      winner.remove()
      closed.remove()
      drop.remove()
      clearTimeout(bannerTimer)
      clearTimeout(dropTimer)
    },
  }
}
