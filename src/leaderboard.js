// ============================================================================
// leaderboard.js — the public record, at /leaderboard.
//
// Who has been paid, how much, and in which stocks. Reads the backend's Mongo
// aggregate rather than replaying the event stream, so it survives restarts and
// works on a cold page load.
//
// Totals are in USD at the price the winning ticker held when its round ended.
// Shares of NVDA and shares of AAPL can't be ranked against each other; dollars
// can, and a leaderboard has to rank.
// ============================================================================

import { fmtUsd } from './config.js'

/** The backend speaks ws:// for the game and http:// for these reads. */
export function httpBase() {
  const ws = import.meta.env.VITE_BACKEND_URL || 'ws://localhost:8080'
  return ws.replace(/^wss:/, 'https:').replace(/^ws:/, 'http:').replace(/\/$/, '')
}

const el = (tag, cls, html) => {
  const n = document.createElement(tag)
  if (cls) n.className = cls
  if (html != null) n.innerHTML = html
  return n
}
const short = (a) => (a && a.length > 16 ? a.slice(0, 10) + '…' + a.slice(-8) : a || '—')

export function createLeaderboard({ onClose, explorer = 'https://robinhoodchain.blockscout.com' }) {
  const root = el('div', 'lead')
  root.innerHTML = `
    <div class="lead-card">
      <div class="lead-hd">
        <span>Leaderboard — who has been paid</span>
        <button class="lead-back">← Back to the battle</button>
      </div>
      <div class="lead-explain">
        Every <b>5 minutes</b> the stock that gained the most is <b>bought on Robinhood Chain</b>
        and <b>airdropped to everyone holding <span class="sr-tag">$SR</span></b>, split by how much
        of the supply each wallet holds. <b>Hold 2% of $SR, get 2% of the drop.</b>
        Pools, curves and contracts are excluded — only real wallets are paid.
        This is every payout so far.
      </div>
      <div class="lead-totals"></div>
      <div class="cols lead-cols">
        <span>#</span><span>Wallet</span><span class="r">Total received</span>
        <span class="r">Payouts</span><span>Stocks received</span>
      </div>
      <div class="lead-rows"><div class="lead-note">Loading…</div></div>
      <div class="lead-ft"></div>
    </div>`
  document.body.append(root)

  const rowsEl = root.querySelector('.lead-rows')
  const totalsEl = root.querySelector('.lead-totals')
  const ftEl = root.querySelector('.lead-ft')
  root.querySelector('.lead-back').addEventListener('click', onClose)

  let loading = false

  async function load() {
    if (loading) return
    loading = true
    try {
      // The rounds are fetched alongside, so an empty leaderboard can say WHY
      // it is empty. "Nobody has been paid yet" and "every round has failed for
      // the same reason for an hour" look identical otherwise.
      const [r, rr] = await Promise.all([
        fetch(`${httpBase()}/leaderboard?limit=200`, { signal: AbortSignal.timeout(12_000) }),
        fetch(`${httpBase()}/rounds?limit=25`, { signal: AbortSignal.timeout(12_000) }).catch(() => null),
      ])
      const data = await r.json()
      let rounds = []
      try {
        rounds = rr ? (await rr.json()).rows || [] : []
      } catch {}
      render(data, rounds)
    } catch (e) {
      rowsEl.innerHTML = `<div class="lead-note">Couldn't reach the backend: ${e.message}</div>`
    } finally {
      loading = false
    }
  }

  /** Why has nothing been paid? The rounds know. */
  function unpaidNote(rounds) {
    const unpaid = rounds.filter((r) => r.paid === false)
    if (!unpaid.length) return ''
    const reason = unpaid[0].reason || 'unknown'
    const same = unpaid.filter((r) => r.reason === unpaid[0].reason).length
    return (
      `<div class="lead-why"><b>${unpaid.length} round${unpaid.length === 1 ? '' : 's'} ` +
      `did not pay out.</b> ${same > 1 ? `The last ${same} all failed the same way: ` : 'Most recent: '}` +
      `<code>${reason}</code></div>`
    )
  }

  function render(data, rounds = []) {
    if (!data.ready) {
      totalsEl.innerHTML = ''
      rowsEl.innerHTML =
        unpaidNote(rounds) +
        '<div class="lead-note">No payout history yet — the database is not connected, ' +
        'or no round has been distributed so far.</div>'
      ftEl.textContent = ''
      return
    }
    const t = data.totals || { usd: 0, wallets: 0, payouts: 0 }
    totalsEl.innerHTML =
      `<div><span class="k">Paid out</span><span class="v">${fmtUsd(t.usd)}</span></div>` +
      `<div><span class="k">Wallets paid</span><span class="v">${t.wallets.toLocaleString()}</span></div>` +
      `<div><span class="k">Transfers</span><span class="v">${t.payouts.toLocaleString()}</span></div>`

    if (!data.rows.length) {
      rowsEl.innerHTML =
        unpaidNote(rounds) +
        '<div class="lead-note">Nobody has been paid yet. Come back after the next bell.</div>'
      return
    }
    rowsEl.innerHTML = ''
    for (const row of data.rows) {
      const stocks = Object.entries(row.byTicker || {})
        .sort((a, b) => (b[1].usd || 0) - (a[1].usd || 0))
        .map(
          ([tk, v]) =>
            `<span class="chip"><b>${tk}</b> ${(v.amount || 0).toLocaleString(undefined, {
              maximumFractionDigits: 4,
            })}</span>`
        )
        .join('')
      rowsEl.append(
        el('div', 'lead-row',
          `<span class="lead-rank">${row.rank}</span>` +
          `<a class="lead-addr" href="${explorer}/address/${row.address}" target="_blank" rel="noopener">${short(row.address)}</a>` +
          `<span class="lead-usd">${fmtUsd(row.totalUsd)}</span>` +
          `<span class="lead-n">${row.payouts}</span>` +
          `<span class="lead-stocks">${stocks || '—'}</span>`)
      )
    }
    ftEl.innerHTML =
      `Ranked by value at the price each stock held when its round ended. ` +
      `Wallet addresses link to Robinhood Chain's explorer.`
  }

  return {
    show() {
      root.classList.add('show')
      load()
    },
    hide() {
      root.classList.remove('show')
    },
    refresh: load,
    dispose() {
      root.remove()
    },
  }
}
