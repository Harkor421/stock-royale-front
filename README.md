# ⚔️ Stock Royale

**Eight US mega-caps fight a live five-minute battle royale on a 3D arena.** Every soldier on the field is a real print off the tape: buys charge in as that ticker's colours, sells come back as the crimson horde, blocks roll in as armour, and whales bring a tank, a jet and a crater. Whoever is closest to the citadel when the clock runs out wins the round — and a winner is crowned **every five minutes**, on the wall clock, for everyone watching at once.

Built with **Vite + Three.js**. The data is real: [**stock-royale-back**](https://github.com/Harkor421/stock-royale-back) reads the live tape through Finnhub and streams normalized battle events over WebSocket. The API key lives **only in the backend** — never in this bundle.

## The idea

The arena is a circle cut into eight wedges, one per ticker, all facing the same objective: **the citadel on the hill in the middle**.

> **An army's distance from the hill is its performance this round.** The leader's frontline is right up against the mesa. The laggard is pinned against the rim. So "who's winning" is legible from any camera angle, at a glance, without reading a single number.

Everyone starts each round at **0.00%** — score is the % change from the price a ticker held when the round's clock started, so a $150 stock and a $600 stock fight on even ground.

## Run it

```bash
npm install
npm run dev
```

Then open the URL Vite prints (default http://localhost:5174).

It expects the backend on `ws://localhost:8080`. Point it elsewhere with a `.env`:

```
VITE_BACKEND_URL=wss://your-backend.up.railway.app
```

Start [stock-royale-back](https://github.com/Harkor421/stock-royale-back) in `npm run sim` mode to develop the battlefield at 3am with no key and no open market.

`npm run build` produces a static bundle in `dist/` — it's a plain static site, deployable anywhere.

## Controls

- **Drag** — take the camera. The director keeps its hands off for 14 seconds after you touch it.
- **Scroll** — zoom.
- **🔊 / M** — procedural sound effects (off by default; browsers block audio until you interact).

Left alone, the camera is a broadcast director: it orbits the arena, cuts in on a block print or a change of leader, and circles the citadel for the victory lap.

## What maps to what

| On the tape | On the battlefield |
| --- | --- |
| An uptick (aggressor bought) | Troops in the ticker's colours charge inward |
| A downtick (aggressor sold) | The crimson horde pushes back out from the hill |
| Print ≥ $25K (`fish`) | A squad, plus a floating price tag |
| Print ≥ $150K (`dolphin`) | An APC rolls in and shoves the frontline |
| Print ≥ $500K (`whale`) | A tank + a jet, an explosion, a camera shake, a cut to that wedge |
| Print ≥ $100K | A bomber runs the length of that army's frontline |
| Net buying vs selling | The frontline slides toward or away from the hill |
| Aggregate pressure of all eight | The sky: dawn when everything is bid, storm when everything dumps |
| A new leader | The citadel changes hands — its stone, banner and halo take the new colours |
| Round clock | The **closing ring** contracts from the rim to the hill, and turns red in the last minute |
| The bell | Fireworks in the winner's colours, their troops storm the hill, and the card goes up |

Exchanges don't publish which side was the aggressor, so buy/sell comes from the **tick rule** — see the backend's README. It's an approximation, and it's the one that makes the green-vs-red armies mean something rather than being decoration.

## Architecture

One normalized event stream and one shared state object, so the HUD and the 3D scene can never disagree.

```
backend ──ws──▶ bus ──▶ director ──▶ simulator.applyEvent(state)
                                        │
render loop ──▶ simulator.step(state) ──▶ armies / vehicles / planes / effects .sync(state)
                                      └─▶ arena · atmosphere · camera · juice · HUD  (all read state)
```

| Module | Responsibility |
| --- | --- |
| `src/events.js` | The wire contract + a tiny synchronous event bus |
| `src/state.js` | Structure-of-Arrays world state — soldiers in **polar** coordinates, no per-frame allocation |
| `src/config.js` | Every tunable: arena geometry, palette, thresholds, pool caps, camera, cadence |
| `src/simulator.js` | Pure `applyEvent` + `step` — the only place a print becomes a soldier |
| `src/scene.js` · `sky.js` | Renderer, shadow-casting sun, bloom chain, gradient sky dome |
| `src/materials.js` | Every unit built in code and merged flat-shaded — no 3D assets |
| `src/arena.js` | Ground, territory repaint, citadel, closing ring, walls, scenery |
| `src/armies.js` · `vehicles.js` · `planes.js` · `effects.js` | GPU sync of instanced meshes + particles |
| `src/banners.js` · `labels.js` | The 3D signs over each army (ticker, **live price**, round %) and the floating print tags |
| `src/atmosphere.js` · `juice.js` | Pressure-driven sky, and game feel (shake, hit-stop, screen FX) |
| `src/cameraDirector.js` | The broadcast camera: orbit, cut, victory lap, hands off when you drag |
| `src/hud/` | The DOM overlay: standings with live prices, round clock, tape, past winners, the winner card |
| `src/sources/backendSource.js` | The only data source — the backend's WebSocket |

### Inherited from The Trenches

The engine is a descendant of [PumpBattlefield / The Trenches](https://github.com/Harkor421/PumpBattlefield), which fought one pump.fun coin's buys against its sells on a linear front. The event-bus → state → simulator → instanced-renderer spine, the particle pools and the procedural audio came from there. What's new here: a **radial eight-army arena** instead of one frontline, a **round engine** with wall-clock winners, real **shadow mapping** and a **bloom** chain, a **sky dome**, a **broadcast camera director**, and the closing ring.

## Making it look right

Two rules kept the frame readable, and they're easy to break by accident:

- **Bloom threshold sits above the lit ground.** Drop it and every sunlit vertex glows, which fogs the whole arena into milk. Only fire, tracers, fireworks and the ring should bloom.
- **Full-screen washes are punches, not moods.** The victory flash is gone inside a second; the celebration then lives in the vignette and the fireworks. A 20%-alpha overlay held for nine seconds reads as a broken renderer, not as drama.

## Two clocks

The 3D runs on `requestAnimationFrame`; the HUD runs on a `setInterval`. That's deliberate. Browsers pause rAF whenever the tab is hidden or occluded — a scoreboard parked on a second monitor would freeze mid-round and quietly lie about the countdown. The DOM overlay is cheap, so it keeps its own timer and stays truthful; the battlefield picks up where it left off when the tab comes back.

In dev, `window.__royale.tick(frames)` advances the world by hand — the only way to inspect the 3D from a headless or occluded tab, where rAF never fires.
