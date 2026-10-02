// Renders the README screenshots straight from the engine: demo crew -> sim -> camera -> cells (or RGBA) -> PNG.
// Run from the repo root under bun, which resolves the engine's extensionless imports: `bun tools/shot/frames.mjs`
import { mkdirSync, writeFileSync } from 'node:fs'
import { PNG } from 'pngjs'
import { demoSnapshots } from '../../src/engine/demo'
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
const GLYPHS = Object.fromEntries(`A:0e11111f111111 B:1e11111e11111e C:0e11101010110e D:1e11111111111e E:1f10101e10101f F:1f10101e101010 G:0e11101713110f H:1111111f111111 I:0e04040404040e J:0702020202120c K:11121418141211 L:1010101010101f M:111b1515111111 N:11111915131111 O:0e11111111110e P:1e11111e101010 Q:0e11111115120d R:1e11111e141211 S:0f10100e01011e T:1f040404040404 U:1111111111110e V:11111111110a04 W:11111115151b11 X:11110a040a1111 Y:11110a04040404 Z:1f01020408101f 0:0e13151911110e 1:040c040404040e 2:0e11010204081f 3:0e11010601110e 4:02060a121f0202 5:1f1e010101110e 6:0608101e11110e 7:1f010204080808 8:0e11110e11110e 9:0e11110f01020c .:0000000000000c ,:00000000000c04 -:0000001f000000 _:0000000000001f /:01010204081010 =:00001f001f0000 ::000c0c000c0c00 (:02040808080402 ):08040202020408 [:0e08080808080e ]:0e02020202020e !:04040404000004 ?:0e110102040004 +:0004041f040400 *:00150e1f0e1500 #:0a0a1f0a1f0a0a >:08040201020408 <:02040810080402 |:04040404040404 @:0e11171517100e %:18190204081303 &:0c12140815120d`
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

// ── The office at `sec` seconds into the demo, after a 3 s run-up. `percent` overrides the viewer's context fill. ──
const scene = ({ sec, hour, cols, rows, mode, percent }) => {
  const sim = createSim(world, SEED)
  const snapshots = now => demoSnapshots(now, T0, DAY)
    .map(s => (percent !== undefined && s.sessionId === SELF ? { ...s, context: { percent } } : s))
  const camera = range(WARMUP_STEPS).reduce((cam, i) => {
    const now = T0 + sec * 1000 - (WARMUP_STEPS - 1 - i) * 100
    sim.sync({ snapshots: snapshots(now), selfSessionId: SELF, now, localHour: hour, day: DAY })
    sim.step(0.1)
    return updateCamera(cam, world, sim.scene(), { cols, rows }, mode, 0.1)
  }, null)
  return { scene: sim.scene(), camera }
}

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

// HD at native scale: one output px per world px, sized so the whole office is in view (352x208 px).
const hd = { sec: 12, hour: 12, cols: world.cols * TILE, rows: (world.rows * TILE) / 2, mode: 'x1' }
const hdView = scene(hd)
save('hd.png', paintRgba(toRgba(world, hdView.scene, DEFAULT_PREFS, hdView.camera, hd.cols, hd.rows)), `${hdView.scene.characters.length} characters`)
