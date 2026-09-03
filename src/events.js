// ============================================================================
// events.js — the normalized event contract + a tiny synchronous bus.
//
// This is the ONLY thing the visualization knows about the outside world. The
// backend (stock-royale-back) emits exactly these shapes; a replay file or a
// synthetic feed can emit the same shapes and nothing in the render layer
// changes. All money is pre-scaled to USD — the render layer does no unit math.
// ============================================================================

/**
 * @typedef {'shrimp'|'fish'|'dolphin'|'whale'} Bucket
 *
 * @typedef {Object} TradeEvent          one print off the tape
 * @property {'trade'} type
 * @property {number} ts @property {string} id
 * @property {string} symbol
 * @property {'buy'|'sell'} side         from the tick rule — buy = GREEN advance
 * @property {number} price @property {number} size
 * @property {number} notional           price * size, USD
 * @property {Bucket} bucket
 * @property {number} pct                the ticker's round performance right now
 *
 * @typedef {Object} StandingsRow
 * @property {string} symbol @property {string} name @property {string} color
 * @property {number} price @property {number} baseline @property {number} pct
 * @property {number} rank               1 = leading the round
 * @property {number} advance            0..1, 1 = closest to the hill
 * @property {number} buyNotional @property {number} sellNotional
 * @property {number} pressure           -1..+1
 * @property {number} trades @property {number[]} spark
 *
 * @typedef {Object} StandingsEvent
 * @property {'standings'} type @property {number} ts
 * @property {{id:number,seq:number,startedAt:number,endsAt:number,lengthMs:number,label:string}} round
 * @property {StandingsRow[]} rows       sorted best -> worst
 *
 * @typedef {Object} RoundEndEvent
 * @property {'roundEnd'} type
 * @property {{symbol:string,color:string,pct:number,price:number,lead:number}|null} winner
 * @property {{symbol:string,color:string,pct:number}[]} podium
 * @property {StandingsRow[]} rows
 *
 * @typedef {Object} SessionEvent
 * @property {'session'} type
 * @property {'pre'|'regular'|'post'|'closed'} state
 * @property {string} label @property {boolean} live @property {number} nextChangeAt
 */

/** Minimal synchronous fan-out bus. Zero deps, no allocation on emit. */
export function createBus() {
  const handlers = new Set()
  return {
    subscribe(fn) {
      handlers.add(fn)
      return () => handlers.delete(fn)
    },
    emit(e) {
      for (const fn of handlers) fn(e)
    },
    clear() {
      handlers.clear()
    },
  }
}
