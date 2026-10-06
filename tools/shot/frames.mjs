// Renders the README screenshots straight from the engine: demo crew -> sim -> camera -> cells (or RGBA) -> PNG.
// Run from the repo root under bun, which resolves the engine's extensionless imports: `bun tools/shot/frames.mjs`
import { mkdirSync, writeFileSync } from 'node:fs'
import { GIFEncoder } from 'gifenc'
import { PNG } from 'pngjs'
import { demoSnapshots } from '../../src/engine/demo'
import { asForeign } from '../../src/engine/shared'
import { createSim } from '../../src/engine/sim'
import { toCells, toRgba, updateCamera } from '../../src/engine/render'
import { defaultWorld } from '../../src/engine/world'
import { DEFAULT_PREFS, TILE } from '../../src/engine/types'

const OUT = 'docs/screenshots'
const DAY = '2026-10-02'
const T0 = Date.UTC(2026, 9, 2, 12)
const SELF = 'demo-1'
const SEED = 7
const WARMUP_STEPS = 30 // 3 s at 0.1 s, so walkers are caught mid-stride

const range = n => Array.from({ length: n }, (_, i) => i)
const world = defaultWorld()

// ── Cells to PNG: 8x16 px per cell. Half-block cells are fg over bg; text cells get a 5x7 glyph. ──
const CW = 8, CH = 16, HALF_BLOCK = 0x2580
// 7 row bytes per glyph, low 5 bits are the pixels. Uppercase only: lowercase draws as uppercase.
const GLYPHS = Object.fromEntries(`A:0e11111f111111 B:1e11111e11111e C:0e11101010110e D:1e11111111111e E:1f10101e10101f F:1f10101e101010 G:0e11101713110f H:1111111f111111 I:0e04040404040e J:0702020202120c K:11121418141211 L:1010101010101f M:111b1515111111 N:11111915131111 O:0e11111111110e P:1e11111e101010 Q:0e11111115120d R:1e11111e141211 S:0f10100e01011e T:1f040404040404 U:1111111111110e V:11111111110a04 W:11111115151b11 X:11110a040a1111 Y:11110a04040404 Z:1f01020408101f 0:0e13151911110e 1:040c040404040e 2:0e11010204081f 3:0e11010601110e 4:02060a121f0202 5:1f1e010101110e 6:0608101e11110e 7:1f010204080808 8:0e11110e11110e 9:0e11110f01020c .:0000000000000c ,:00000000000c04 -:0000001f000000 _:0000000000001f /:01010204081010 =:00001f001f0000 ::000c0c000c0c00 (:02040808080402 ):08040202020408 [:0e08080808080e ]:0e02020202020e !:04040404000004 ?:0e110102040004 +:0004041f040400 *:00150e1f0e1500 #:0a0a1f0a1f0a0a >:08040201020408 <:02040810080402 |:04040404040404 @:0e11171517100e %:18190204081303 &:0c12140815120d ★:04041f0e0e1b11 …:00000000000015 ✓:00010214080000 ✗:00110a040a1100`
  .split(' ')
  .map(g => [g[0], range(7).map(i => parseInt(g.slice(-14).slice(i * 2, i * 2 + 2), 16))]))

// A glyph the font lacks paints as a small box, so a missing character shows up instead of vanishing.
const textPixel = (ch, x, y) => {
  const rows = GLYPHS[ch.toUpperCase()]
  const gx = x - 1, gy = y - 4
  if (rows) return gy >= 0 && gy < 7 && gx >= 0 && gx < 5 && ((rows[gy] >> (4 - gx)) & 1) === 1
  return x > 1 && x < 6 && y > 5 && y < 12
}

const cellColor = (cp, fg, bg, x, y) =>
  cp === HALF_BLOCK ? (y < CH / 2 ? fg : bg)
    : cp !== 0x20 && textPixel(String.fromCodePoint(cp), x, y) ? fg : bg

const paintCells = f => {
  const png = new PNG({ width: f.cols * CW, height: f.rows * CH })
  for (const r of range(f.rows)) for (const c of range(f.cols)) {
    const o = (r * f.cols + c) * 3
    const cp = f.cells[o], fg = f.cells[o + 1], bg = f.cells[o + 2]
    for (const y of range(CH)) for (const x of range(CW)) {
      const rgb = cellColor(cp, fg, bg, x, y)
      const i = ((r * CH + y) * png.width + c * CW + x) * 4
      png.data[i] = (rgb >> 16) & 255
      png.data[i + 1] = (rgb >> 8) & 255
      png.data[i + 2] = rgb & 255
      png.data[i + 3] = 255
    }
  }
  return png
}

const paintRgba = f => {
  const png = new PNG({ width: f.width, height: f.height })
  png.data.set(f.rgba)
  return png
}

// Nearest neighbour, so the HD pixels stay sharp when GitHub shows the image larger than its own size.
const upscale = (src, k) => {
  const png = new PNG({ width: src.width * k, height: src.height * k })
  for (const y of range(png.height)) for (const x of range(png.width)) {
    const s = (Math.floor(y / k) * src.width + Math.floor(x / k)) * 4
    png.data.set(src.data.subarray(s, s + 4), (y * png.width + x) * 4)
  }
  return png
}

// The demo crew at `now`. `percent` overrides the viewer's context fill; `foreign` shows those sessions as
// another account's, the way the shared office does.
const crew = (now, { percent, foreign = {} } = {}) => demoSnapshots(now, T0, DAY)
  .map(s => (percent !== undefined && s.sessionId === SELF ? { ...s, context: { percent } } : s))
  .map(s => (foreign[s.name] ? asForeign(s, foreign[s.name]) : s))

// One sim stepped at 10 Hz. `at(sec)` moves it to `sec` seconds into the demo (forward only) and returns the view.
const film = ({ hour, cols, rows, mode, ...who }) => {
  const sim = createSim(world, SEED)
  const state = { t: null, camera: null }
  const tick = now => {
    sim.sync({ snapshots: crew(now, who), selfSessionId: SELF, now, localHour: hour, day: DAY })
    sim.step(0.1)
    state.camera = updateCamera(state.camera, world, sim.scene(), { cols, rows }, mode, 0.1)
    state.t = now
  }
  return sec => {
    const end = T0 + sec * 1000
    const from = state.t === null ? end - (WARMUP_STEPS - 1) * 100 : state.t + 100
    range(Math.max(0, Math.round((end - from) / 100) + 1)).forEach(i => tick(from + i * 100))
    return { scene: sim.scene(), camera: state.camera }
  }
}

// ── The office at `sec` seconds into the demo, after a 3 s run-up. ──
const scene = ({ sec, ...shot }) => film(shot)(sec)

const save = (name, png, note) => {
  writeFileSync(`${OUT}/${name}`, PNG.sync.write(png))
  console.log(`${name} ${png.width}x${png.height} ${note}`)
}

mkdirSync(OUT, { recursive: true })

const fit = { sec: 12, hour: 12, cols: 128, rows: 42, mode: 'fit' }
const fitView = scene(fit)
const fitCells = toCells(world, fitView.scene, DEFAULT_PREFS, fitView.camera, fit.cols, fit.rows)
save('fit-noon.png', paintCells(fitCells), `${fitView.scene.characters.length} characters, ${fitView.scene.sky.weather}, ${fitCells.pairs} color pairs`)

// The demo's context only reaches 56% by 33 s, so the storm needs the viewer's fill set to 80%.
const x2 = { sec: 33, hour: 23, cols: 89, rows: 41, mode: 'x2', percent: 80 }
const x2View = scene(x2)
const x2Cells = toCells(world, x2View.scene, DEFAULT_PREFS, x2View.camera, x2.cols, x2.rows)
save('x2-night-storm.png', paintCells(x2Cells), `${x2View.scene.characters.length} characters, ${x2View.scene.sky.weather}, ${x2Cells.pairs} color pairs`)

// HD at native scale: one output px per world px, sized so the whole office is in view (352x208 px), saved at 2x.
const hd = { sec: 12, hour: 12, cols: world.cols * TILE, rows: (world.rows * TILE) / 2, mode: 'x1' }
const hdView = scene(hd)
const hdPng = prefs => upscale(paintRgba(toRgba(world, hdView.scene, prefs, hdView.camera, hd.cols, hd.rows)), 2)
save('hd.png', hdPng(DEFAULT_PREFS), `${hdView.scene.characters.length} characters`)

// The five themes on one sheet, in the order `t` cycles them: three on top, two centered below.
const THEMES = ['default', 'warm', 'cool', 'dark', 'light']
const GAP = 16
const tiles = THEMES.map(theme => paintRgba(toRgba(world, hdView.scene, { ...DEFAULT_PREFS, theme }, hdView.camera, hd.cols, hd.rows)))
const step = tiles[0].width + GAP
const sheet = new PNG({ width: 3 * step - GAP, height: 2 * tiles[0].height + GAP })
tiles.forEach((tile, i) => PNG.bitblt(tile, sheet, 0, 0, tile.width, tile.height, (i % 3) * step + (i < 3 ? 0 : step / 2), Math.floor(i / 3) * (tile.height + GAP)))
save('themes.png', sheet, THEMES.join(', '))

// The shared office: two of the crew belong to other accounts on the Mac, so they wear the account's short name.
const shared = { sec: 12, hour: 12, cols: 128, rows: 42, mode: 'fit', foreign: { 'web-app': 'alex', docs: 'jane.doe' } }
const sharedView = scene(shared)
save('shared.png', paintCells(toCells(world, sharedView.scene, DEFAULT_PREFS, sharedView.camera, shared.cols, shared.rows)), 'alex:web-app, jane:docs')

// The hero: 12 s of HD frames at 10 fps, from 8 s in (subagents walk in, a paper plane, a permission bubble).
// The engine draws from one fixed palette, so every frame fits a GIF's 256 colors exactly, with no dithering.
const GIF_FROM = 8, GIF_SECONDS = 12, FPS = 10
const roll = film(hd)
const frames = range(GIF_SECONDS * FPS).map(i => {
  const v = roll(GIF_FROM + i / FPS)
  return upscale(paintRgba(toRgba(world, v.scene, DEFAULT_PREFS, v.camera, hd.cols, hd.rows)), 2)
})
const rgbOf = (d, i) => (d[i] << 16) | (d[i + 1] << 8) | d[i + 2]
const colors = [...frames.reduce((seen, f) => {
  range(f.width * f.height).forEach(p => seen.add(rgbOf(f.data, p * 4)))
  return seen
}, new Set())]
// One slot past the colors is the transparent index: after the first frame only the pixels that changed are
// written, and the rest show through from the frame before (dispose 1), which keeps the file small.
if (colors.length > 255) throw new Error(`office.gif needs ${colors.length} colors and a clear one, a GIF holds 256`)
const CLEAR = colors.length
const index = new Map(colors.map((c, i) => [c, i]))
const palette = [...colors, 0].map(c => [(c >> 16) & 255, (c >> 8) & 255, c & 255])
const indexed = frames.map(f => Uint8Array.from(range(f.width * f.height), p => index.get(rgbOf(f.data, p * 4))))
const gif = GIFEncoder()
indexed.forEach((px, i) => {
  const delta = i === 0 ? px : px.map((c, p) => (c === indexed[i - 1][p] ? CLEAR : c))
  gif.writeFrame(delta, frames[i].width, frames[i].height, { palette, delay: 1000 / FPS, transparent: i > 0, transparentIndex: CLEAR, dispose: 1 })
})
gif.finish()
writeFileSync(`${OUT}/office.gif`, gif.bytes())
console.log(`office.gif ${frames[0].width}x${frames[0].height} ${frames.length} frames, ${colors.length} colors, ${Math.round(gif.bytes().length / 1024)} KiB`)
