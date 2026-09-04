// ============================================================================
// director.js — the one bridge between the wire and the world. For every event
// it (1) folds it into state via the simulator and (2) fires the side effects
// that aren't state: feed rows, floating tags, shouted banners, sound, and the
// camera cuts. Atmosphere and juice read state directly, so they aren't here.
// ============================================================================

import { applyEvent } from './simulator.js'
import { LABEL_USD, fmtUsd, fmtPct } from './config.js'

export function createDirector(state, hud, labels, audio, cameraDirector) {
  function handle(e) {
    applyEvent(state, e)

    switch (e.type) {
      case 'trade': {
        hud.pushFeed(e, state)
        if (e.notional >= LABEL_USD) labels.spawn(e, state)
        const army = state.bySymbol.get(e.symbol)
        if (e.bucket === 'whale') {
          audio.boom(e.notional >= 2_000_000 ? 1.5 : 1.2)
          hud.banner(
            `${e.symbol} ${e.side === 'buy' ? 'BLOCK BID' : 'BLOCK DUMP'} · ${fmtUsd(e.notional)}`,
            army?.colorCss
          )
          if (army) cameraDirector.focus(army.index, 3.4)
        } else if (e.bucket === 'dolphin') {
          audio.blip(e.side)
        }
        break
      }

      case 'roundStart': {
        // NOTE: the winner card is NOT dismissed here. roundStart lands within
        // milliseconds of roundEnd, so hiding it here would flash the result and
        // throw it away. main.js retires it when the cinematic timer runs out.
        if (state.scalars.winnerFx <= 0) hud.banner('ROUND LIVE · EVERYONE BACK TO 0.00%', '#ffd447')
        break
      }

      case 'roundEnd': {
        audio.victory()
        hud.showWinner(e, state)
        if (e.winner) {
          const army = state.bySymbol.get(e.winner.symbol)
          hud.banner(`${e.winner.symbol} TAKES THE ROUND · ${fmtPct(e.winner.pct)}`, army?.colorCss)
        } else {
          hud.banner('NO CONTEST — THE TAPE WAS SILENT', '#8b97a8')
        }
        break
      }

      case 'standings': {
        // a change of hands on the hill is worth both a sound and a camera cut
        const s = state.scalars
        if (s.leader >= 0 && s.prevLeader >= 0 && s.leaderHoldSec < 0.001) {
          const army = state.armies[s.leader]
          audio.takeover()
          hud.banner(`${army.symbol} TAKES THE HILL`, army.colorCss)
          cameraDirector.focus(army.index, 3)
        }
        break
      }

      case 'airdropStart':
        hud.airdropStart(e, state)
        audio.koth()
        break
      case 'airdropBuy':
        hud.airdropBuy(e)
        break
      case 'airdropPayment':
        hud.airdropPayment(e)
        break
      case 'airdropResult':
        hud.airdropResult(e)
        audio.grad()
        break
      case 'airdropError':
        hud.airdropError(e, state)
        break

      case 'session': {
        hud.banner(e.label, e.live ? '#4ade80' : '#ff6b6b')
        break
      }
    }
  }

  return { handle }
}
