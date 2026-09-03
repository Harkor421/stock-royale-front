// ============================================================================
// backendSource.js — the only data source: a WebSocket to stock-royale-back.
// It reconnects on its own with backoff, keeps the connection warm with pings,
// and forwards every message straight onto the bus. No API key is ever present
// in the frontend; the backend holds it.
// ============================================================================

const DEFAULT_URL = import.meta.env.VITE_BACKEND_URL || 'ws://localhost:8080'

export class BackendSource {
  constructor(bus, url = DEFAULT_URL) {
    this.bus = bus
    this.url = url
    this.ws = null
    this.backoff = 800
    this.stopped = false
    this.pingTimer = null
    this._status = () => {}
  }

  onStatus(fn) {
    this._status = fn
  }

  start() {
    this.stopped = false
    this._connect()
  }

  stop() {
    this.stopped = true
    clearInterval(this.pingTimer)
    try { this.ws?.close() } catch {}
  }

  _connect() {
    if (this.stopped) return
    let ws
    try {
      ws = new WebSocket(this.url)
    } catch {
      this._retry()
      return
    }
    this.ws = ws

    ws.onopen = () => {
      this.backoff = 800
      this._status(true)
      clearInterval(this.pingTimer)
      this.pingTimer = setInterval(() => {
        if (ws.readyState === 1) ws.send(JSON.stringify({ op: 'ping' }))
      }, 25_000)
    }

    ws.onmessage = (ev) => {
      let msg
      try {
        msg = JSON.parse(ev.data)
      } catch {
        return
      }
      if (msg.type === 'pong') return
      this.bus.emit(msg)
    }

    ws.onclose = () => {
      this._status(false)
      clearInterval(this.pingTimer)
      this._retry()
    }
    ws.onerror = () => {
      try { ws.close() } catch {}
    }
  }

  _retry() {
    if (this.stopped) return
    const wait = this.backoff
    this.backoff = Math.min(this.backoff * 1.7, 15_000)
    setTimeout(() => this._connect(), wait)
  }
}
