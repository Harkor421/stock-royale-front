// ============================================================================
// onboarding.js — what someone who has never seen this needs, in five screens.
//
// The battlefield is legible only once you know that distance to the castle IS
// the scoreboard, and the whole point — that holding $SR pays you real stock
// every five minutes — is invisible until a round ends. Both have to be said
// out loud, before the first bell rather than after it.
//
// Shown once, remembered in localStorage, and reopened any time from the "?".
// ============================================================================

const SEEN_KEY = 'sr.onboarded.v1'

const steps = (SR) => [
  {
    tag: 'The game',
    title: 'Eight stocks. Five minutes. One hill.',
    body: `
      <p>Eight of the biggest US stocks — <b>NVDA, TSLA, AAPL, AMZN, META, MSFT, GOOGL, AMD</b> —
      fight a five-minute round, over and over, all day.</p>
      <p>Nothing here is scripted. Every soldier, tank and explosion comes from a
      <b>real trade printing on the US market right now</b>.</p>`,
  },
  {
    tag: 'The map',
    title: 'Distance to the castle is the scoreboard.',
    body: `
      <p>Each stock is an army in its own colour. Everyone starts each round at
      <span class="key">0.00%</span> — your score is how far the price has moved
      <b>since this round's clock started</b>, so a $150 stock and a $600 stock
      compete on even terms.</p>
      <p><b>The closer an army is to the castle, the better its stock is doing.</b>
      Whoever leads <b>stands on the hill</b> and defends it. The other seven climb up
      and try to take it.</p>`,
  },
  {
    tag: 'The fighting',
    title: 'Every trade is troops.',
    body: `
      <p>A <b class="up">buy</b> marches reinforcements in. A <b class="down">sell</b> kills
      that army's own soldiers. Big block trades roll in <b>tanks</b> and scramble
      <b>bombers</b> at a rival.</p>
      <p>The men fight each other one on one, and the army whose stock is doing better
      wins more of those duels. The scoreboard is settled one soldier at a time.</p>`,
  },
  {
    tag: 'The prize',
    title: `Hold <span class="sr">$${SR}</span>, get paid in stock.`,
    body: `
      <p>At the bell, the stock that gained the most <b>wins the round</b>. Stock Royale
      then <b>buys that stock on Robinhood Chain</b> and <b>airdrops it to everyone holding
      <span class="sr">$${SR}</span></b>, the Stock Royale token.</p>
      <p class="big">Your cut is your share of the $${SR} supply.<br>
      Hold <b>2%</b> of $${SR} → you get <b>2%</b> of the drop.</p>
      <p>Every five minutes, for as long as the market is open. You do nothing but hold.</p>`,
  },
  {
    tag: 'The fine print',
    title: 'Only real wallets get paid.',
    body: `
      <p>Before every drop, the holder list is read straight off the chain and cleaned:
      <b>liquidity pools, bonding curves, burn addresses and contracts are excluded</b>.
      Each remaining address has <code>eth_getCode</code> run on it, so a router or a vault
      can never collect a cut meant for a person.</p>
      <p>The <b>pot</b> in the middle of the screen is what is waiting to go out. When a
      round ends the airdrop opens full screen and every transfer lands live, with a link
      to it on the chain. The <b>leaderboard</b> keeps every payout ever made.</p>`,
  },
]

const el = (tag, cls, html) => {
  const n = document.createElement(tag)
  if (cls) n.className = cls
  if (html != null) n.innerHTML = html
  return n
}

export function createOnboarding({ getSymbol } = {}) {
  // The coin's ticker comes off its contract, so this copy can't outlive a
  // change of token. $SR until the backend says otherwise.
  let SR = 'SR'
  let STEPS = steps(SR)
  const root = el('div', 'onb')
  root.innerHTML = `
    <div class="onb-card">
      <div class="onb-hd">
        <span class="onb-brand">Stock<i>·</i>Royale</span>
        <span class="onb-tag"></span>
        <button class="onb-skip">Skip</button>
      </div>
      <div class="onb-body">
        <h2 class="onb-title"></h2>
        <div class="onb-text"></div>
      </div>
      <div class="onb-ft">
        <div class="onb-dots"></div>
        <div class="onb-nav">
          <button class="onb-back">← Back</button>
          <button class="onb-next">Next →</button>
        </div>
      </div>
    </div>`
  document.body.append(root)

  const tagEl = root.querySelector('.onb-tag')
  const titleEl = root.querySelector('.onb-title')
  const textEl = root.querySelector('.onb-text')
  const dotsEl = root.querySelector('.onb-dots')
  const backBtn = root.querySelector('.onb-back')
  const nextBtn = root.querySelector('.onb-next')

  let i = 0
  const dots = STEPS.map((_, k) => {
    const d = el('button', 'onb-dot')
    d.addEventListener('click', () => go(k))
    dotsEl.append(d)
    return d
  })

  function go(k) {
    i = Math.max(0, Math.min(STEPS.length - 1, k))
    const s = STEPS[i]
    tagEl.textContent = s.tag
    titleEl.innerHTML = s.title
    textEl.innerHTML = s.body
    dots.forEach((d, k2) => d.classList.toggle('on', k2 === i))
    backBtn.disabled = i === 0
    nextBtn.textContent = i === STEPS.length - 1 ? 'Watch the battle' : 'Next →'
    root.querySelector('.onb-body').scrollTop = 0
  }

  function close() {
    root.classList.remove('show')
    try {
      localStorage.setItem(SEEN_KEY, '1')
    } catch {
      /* a private window just sees it again next time; not worth failing over */
    }
  }

  backBtn.addEventListener('click', () => go(i - 1))
  nextBtn.addEventListener('click', () => (i === STEPS.length - 1 ? close() : go(i + 1)))
  root.querySelector('.onb-skip').addEventListener('click', close)
  root.addEventListener('click', (ev) => {
    if (ev.target === root) close()
  })
  window.addEventListener('keydown', (ev) => {
    if (!root.classList.contains('show')) return
    if (ev.key === 'Escape') close()
    else if (ev.key === 'ArrowRight') go(i + 1)
    else if (ev.key === 'ArrowLeft') go(i - 1)
  })

  go(0)

  return {
    open() {
      const live = getSymbol?.()
      if (live && live !== SR) {
        SR = live
        STEPS = steps(SR)
      }
      go(0)
      root.classList.add('show')
    },
    /** First visit only — after that the "?" is how you get back to it. */
    openIfFirstVisit() {
      let seen = false
      try {
        seen = localStorage.getItem(SEEN_KEY) === '1'
      } catch {}
      if (!seen) this.open()
    },
    dispose() {
      root.remove()
    },
  }
}
