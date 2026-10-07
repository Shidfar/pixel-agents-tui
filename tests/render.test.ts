import { expect, test } from 'claude-code/testing'
import { cellsToAnsi, encodeCells, MAX_PAIRS, toCells, toRgba, updateCamera } from '../src/engine/render'
import { defaultWorld, tileCenter } from '../src/engine/world'
import { TILE_PALETTE } from '../src/engine/art.gen'
import { catSprite, charSprite, planeSprite, SKY_MASK, tileSprite, wallSprite } from '../src/engine/art'
import { GLYPHS, glyphFor } from '../src/engine/font'
import { framePalette, reducedPalette } from '../src/engine/palette'
import { DEFAULT_PREFS, type CharacterView, type Scene } from '../src/engine/types'

const world = defaultWorld()
const stats = { day: '2026-10-02', tools: 312, edits: 41, commits: 3, permits: 5, errors: 1 }
const scene = (over: Partial<Scene> = {}): Scene => ({
  characters: [], particles: [], planes: [], cat: { x: 200, y: 120, dir: 'right', pose: 'sit', frame: 0 },
  monitors: [], doorOpen: false, tvOn: true, sky: { hour: 12, weather: 'clear', flash: false, phase: 0 },
  whiteboard: stats, focus: null, alerts: [], time: 0, ...over,
})
const person = (over: Partial<CharacterView> = {}): CharacterView => {
  const s = tileCenter(world.seats[0]!)
  return { key: 's1/main', x: s.x, y: s.y, dir: 'up', pose: 'type', frame: 0, palette: 0, label: 'Alpha', isSelf: false, bob: 0, ...over }
}
const ALLOWED = new Set([0x2580, 0x2026, 0x2713, 0x2717, 0x2605, ...Array.from({ length: 95 }, (_, i) => 0x20 + i)])
const rowsText = (f: ReturnType<typeof toCells>) => Array.from({ length: f.rows }, (_, r) => String.fromCodePoint(...Array.from({ length: f.cols }, (_, c) => f.cells[(r * f.cols + c) * 3]!)))
const frame = (sc: Scene, cols: number, rows: number, prefs = DEFAULT_PREFS, mode: 'fit' | 'auto' | 'x1' | 'x2' = 'fit') =>
  toCells(world, sc, prefs, updateCamera(null, world, sc, { cols, rows }, mode, 0), cols, rows)

test('cells are the right size, use allowed glyphs, and stay within 24-bit color', async () => {
  const f = frame(scene(), 89, 41)
  expect(f.cells.length).toBe(89 * 41 * 3)
  for (const i of Array.from({ length: f.cells.length / 3 }, (_, k) => k * 3)) {
    expect(ALLOWED.has(f.cells[i]!)).toBe(true)
    expect(f.cells[i + 1]! <= 0xffffff && f.cells[i + 2]! <= 0xffffff).toBe(true)
  }
})

test('busy fit frame stays under the color-pair limit', async () => {
  const crowd = Array.from({ length: 30 }, (_, i) => person({ key: 'k' + i, x: 24 + (i * 37) % 320, y: 40 + (i * 53) % 160, palette: i % 6, pose: (['walk', 'type', 'read', 'stand'] as const)[i % 4], bubble: { text: 'Editing x' + i, tone: (['alert', 'ask', 'info', 'ok', 'bad'] as const)[i % 5]! } }))
  const sparks = Array.from({ length: 200 }, (_, i) => ({ x: (i * 13) % 352, y: (i * 7) % 208, color: [0xff5e5e, 0xffd24a, 0x5ec8ff, 0x7cff6b, 0xd07cff][i % 5]!, size: ((i % 3) + 1) as 1 | 2 | 3 }))
  for (const hour of [3, 7, 12, 19]) for (const [cols, rows] of [[128, 42], [89, 41], [62, 31]] as const) {
    const f = frame(scene({ characters: crowd, particles: sparks, sky: { hour, weather: 'lightning', flash: hour === 3, phase: 1 } }), cols, rows)
    expect(f.pairs <= MAX_PAIRS).toBe(true)
  }
})

test('tiny pane renders without throwing', async () => {
  const f = frame(scene({ characters: [person()] }), 40, 10, DEFAULT_PREFS, 'auto')
  expect(f.cells.length).toBe(40 * 10 * 3)
})

test('labels and info bubbles follow the labels pref; alerts always show; self gets a star', async () => {
  const on = rowsText(frame(scene({ characters: [person({ bubble: { text: 'Editing a.ts', tone: 'info' } })] }), 120, 40, DEFAULT_PREFS, 'x1')).join('\n')
  expect(on.includes('Alpha') && on.includes('Editing a.ts')).toBe(true)
  const off = rowsText(frame(scene({ characters: [person({ bubble: { text: 'Editing a.ts', tone: 'info' } })] }), 120, 40, { ...DEFAULT_PREFS, labels: false }, 'x1')).join('\n')
  expect(off.includes('Alpha') || off.includes('Editing')).toBe(false)
  const alert = rowsText(frame(scene({ characters: [person({ bubble: { text: '! Bash: x', tone: 'alert' } })] }), 120, 40, { ...DEFAULT_PREFS, labels: false }, 'x1')).join('\n')
  expect(alert.includes('! Bash: x')).toBe(true)
  const self = rowsText(frame(scene({ characters: [person({ isSelf: true })] }), 120, 40, DEFAULT_PREFS, 'x1')).join('\n')
  expect(self.includes('★Alpha') || self.includes('★ Alpha')).toBe(true)
})

test('noon default theme paints floors in exact art colors', async () => {
  const f = frame(scene(), 352, 104, DEFAULT_PREFS, 'x1')
  const art = new Set(TILE_PALETTE.map(h => parseInt(h.slice(1), 16)))
  const floor = tileCenter({ col: 2, row: 4 })
  const cell = (Math.floor(floor.y / 2) * f.cols + Math.floor(floor.x)) * 3
  expect(art.has(f.cells[cell + 1]!)).toBe(true)
})

test('night is darker than noon', async () => {
  const lum = (hour: number) => { const f = frame(scene({ sky: { hour, weather: 'clear', flash: false, phase: 0 } }), 89, 41); return Array.from({ length: f.cols * f.rows }, (_, i) => f.cells[i * 3 + 1]!).reduce((a, c) => a + ((c >> 16) & 255) + ((c >> 8) & 255) + (c & 255), 0) }
  expect(lum(23) < lum(12) * 0.8).toBe(true)
})

test('camera: fit scale, x2 clamps inside the world, auto frames one person at 1x, scale changes wait 1.5 s', async () => {
  const fit = updateCamera(null, world, scene(), { cols: 89, rows: 41 }, 'fit', 0)
  expect(Math.abs(fit.scale - Math.max(352 / 89, 208 / 82)) < 0.01).toBe(true)
  const x2 = updateCamera(null, world, scene({ characters: [person()] }), { cols: 89, rows: 41 }, 'x2', 0)
  expect(x2.scale === 2 && x2.x >= 0 && x2.y >= 0 && x2.x + 178 <= 352 && x2.y + 164 <= 208).toBe(true)
  const one = updateCamera(null, world, scene({ characters: [person()] }), { cols: 89, rows: 41 }, 'auto', 0)
  expect(one.scale).toBe(1)
  const crowd = scene({ characters: [person(), person({ key: 'b', x: 330, y: 190 })] })
  const held = updateCamera(one, world, crowd, { cols: 89, rows: 41 }, 'auto', 1.0)
  expect(held.scale).toBe(1)
  const moved = updateCamera(held, world, crowd, { cols: 89, rows: 41 }, 'auto', 0.6)
  expect(moved.scale > 1).toBe(true)
})

test('encodeCells is base64 of the whole buffer; ANSI diffs only what changed', async () => {
  const f = frame(scene(), 20, 6)
  expect(encodeCells(f).length).toBe(Math.ceil(f.cells.byteLength / 3) * 4)
  const first = cellsToAnsi(f, null)
  expect(first.startsWith('\x1b[1;1H')).toBe(true)
  expect(cellsToAnsi(f, f)).toBe('')
  const cells = f.cells.slice(); cells[(2 * 20 + 5) * 3 + 1] = 0xff0000
  const diff = cellsToAnsi({ ...f, cells }, f)
  expect(diff.includes('\x1b[3;6H') && !diff.includes('\x1b[1;1H')).toBe(true)
})

test('deterministic', async () => {
  const sc = scene({ characters: [person()] })
  expect(encodeCells(frame(sc, 89, 41))).toBe(encodeCells(frame(sc, 89, 41)))
})

// ── beyond the plan ────────────────────────────────────────────────

test('the font covers the plan: every glyph is 15 bits, lowercase and unknowns resolve', async () => {
  const keys = Object.keys(GLYPHS)
  expect(keys.length).toBe(26 + 10 + 18)
  expect(keys.every(k => /^[01]{15}$/.test(GLYPHS[k]!))).toBe(true)
  expect(glyphFor('a')).toBe(GLYPHS.A!)
  expect(glyphFor('é')).toBe(GLYPHS['?']!)
  expect(glyphFor('★')).toBe(GLYPHS['★']!)
})

test('art sizes: tiles and walls are 16×16, characters 16×24, cat 12×9, plane 7×5; window glass is the sky mask', async () => {
  expect(tileSprite('computer').length).toBe(256)
  expect(Array.from({ length: 16 }, (_, m) => wallSprite(m).length).every(n => n === 256)).toBe(true)
  const c = charSprite(2, 'walk', 'left', 1)
  expect([c.w, c.h, c.px.length]).toEqual([16, 24, 384])
  expect(catSprite('walk', 'left', 1).px.length).toBe(12 * 9)
  expect(planeSprite('left').px.length).toBe(7 * 5)
  expect(tileSprite('window').filter(p => p === SKY_MASK).length).toBe(80)
  expect(tileSprite('doorClosed')[0]).toBe(0x4a3a2e)
  // left is the mirror of right
  const r = charSprite(0, 'stand', 'right', 0).px, l = charSprite(0, 'stand', 'left', 0).px
  expect(Array.from({ length: 384 }, (_, i) => l[i] === r[(i - (i % 16)) + 15 - (i % 16)]).every(Boolean)).toBe(true)
})

test('between 8 and 17 on the default theme every art color is its own palette color', async () => {
  const art = TILE_PALETTE.map(h => parseInt(h.slice(1), 16))
  for (const hour of [8, 12, 16.75]) {
    const p = framePalette('default', hour)
    expect(art.every(c => p.snap(c) === c)).toBe(true)
  }
})

test('a reduced palette is a deterministic subset of 31 and snaps into itself', async () => {
  const p = framePalette('default', 12)
  const a = reducedPalette(p, 31), b = reducedPalette(p, 31)
  expect(a.colors.length).toBe(31)
  expect(a).toBe(b)
  const all = new Set(p.colors)
  expect(Array.from(a.colors).every(c => all.has(c))).toBe(true)
  expect(Array.from({ length: 500 }, (_, i) => (i * 7919) & 0xffffff).every(c => new Set(a.colors).has(a.snap(c)))).toBe(true)
})

test('ANSI: neighbors share one cursor move and one color change', async () => {
  const f = frame(scene(), 20, 6)
  const cells = f.cells.slice()
  for (const c of [4, 5, 6]) { cells[(1 * 20 + c) * 3 + 1] = 0x112233; cells[(1 * 20 + c) * 3 + 2] = 0x445566 }
  const diff = cellsToAnsi({ ...f, cells }, f)
  expect(diff.split('\x1b[').length - 1).toBe(3)
  expect(diff.startsWith('\x1b[2;5H\x1b[38;2;17;34;51m\x1b[48;2;68;85;102m▀▀▀')).toBe(true)
})

test('effects off hides particles; effects on draws them', async () => {
  const sparks = [{ x: 100, y: 100, color: 0xff0000, size: 3 as const }]
  const withFx = encodeCells(frame(scene({ particles: sparks }), 352, 104, DEFAULT_PREFS, 'x1'))
  const without = encodeCells(frame(scene({ particles: sparks }), 352, 104, { ...DEFAULT_PREFS, effects: false }, 'x1'))
  expect(withFx === without).toBe(false)
  expect(without).toBe(encodeCells(frame(scene(), 352, 104, DEFAULT_PREFS, 'x1')))
})

test('whiteboard totals show on the board when it is wide enough', async () => {
  const text = rowsText(frame(scene(), 128, 42)).join('\n')
  expect(text.includes('T312 E41 C3')).toBe(true)
})

test('every painted color comes from the frame palette, in every theme and light', async () => {
  const sc = (hour: number) => scene({ characters: [person(), person({ key: 'b', x: 100, y: 100, pose: 'read' })], monitors: [{ col: 4, row: 2, mode: 'code', phase: 1 }], sky: { hour, weather: 'storm', flash: false, phase: 2 } })
  for (const theme of ['default', 'warm', 'cool', 'dark', 'light'] as const) for (const hour of [2, 7, 12, 19]) {
    const f = frame(sc(hour), 89, 41, { ...DEFAULT_PREFS, theme })
    const colors = new Set(framePalette(theme, hour).colors)
    const painted = Array.from({ length: f.cols * f.rows }, (_, i) => i).filter(i => f.cells[i * 3] === 0x2580)
    expect(painted.every(i => colors.has(f.cells[i * 3 + 1]!) && colors.has(f.cells[i * 3 + 2]!))).toBe(true)
  }
})

test('odd pane sizes render without throwing and keep the pair limit', async () => {
  for (const [cols, rows] of [[1, 1], [1, 2], [3, 1], [7, 3], [255, 255]] as const) {
    for (const mode of ['fit', 'auto', 'x1', 'x2'] as const) {
      const f = frame(scene({ characters: [person(), person({ key: 'b', x: 330, y: 190 })] }), cols, rows, DEFAULT_PREFS, mode)
      expect(f.cells.length === cols * rows * 3 && f.pairs <= MAX_PAIRS).toBe(true)
    }
  }
})

test('a scale change that is dropped before 1.5 s starts over', async () => {
  const one = updateCamera(null, world, scene({ characters: [person()] }), { cols: 89, rows: 41 }, 'auto', 0)
  const wide = scene({ characters: [person(), person({ key: 'b', x: 330, y: 190 })] })
  const waiting = updateCamera(one, world, wide, { cols: 89, rows: 41 }, 'auto', 1.0)
  const back = updateCamera(waiting, world, scene({ characters: [person()] }), { cols: 89, rows: 41 }, 'auto', 0.1)
  expect([back.scale, back.pendingSec]).toEqual([1, 0])
  const again = updateCamera(back, world, wide, { cols: 89, rows: 41 }, 'auto', 1.0)
  expect(again.scale).toBe(1)
})

test('furniture sits on a floor tile: a see-through chair pixel shows the ground beside it', async () => {
  const seat = world.seats[0]!
  expect(world.tiles[seat.row]![seat.col]).toBe('chair')
  // up is the desk, so the first floor neighbour is the tile below
  const ground = world.tiles[seat.row + 1]![seat.col]!
  expect(ground).toBe('floor2')
  expect(tileSprite('chair')[0]! > 0xffffff).toBe(true)
  const f = frame(scene(), 352, 104, DEFAULT_PREFS, 'x1')
  const x = seat.col * 16, y = seat.row * 16
  expect(f.cells[((y / 2) * f.cols + x) * 3 + 1]).toBe(tileSprite(ground)[0]!)
})

test('auto never zooms out past fit', async () => {
  // 332 px wide: too wide for 2x (256), so 3x would be next, but fit is 2.75 and shows more
  const far = scene({ characters: [person({ x: 30, y: 100 }), person({ key: 'b', x: 330, y: 100 })] })
  const cam = updateCamera(null, world, far, { cols: 128, rows: 42 }, 'auto', 0)
  expect(Math.abs(cam.scale - Math.max(352 / 128, 208 / 84)) < 1e-9).toBe(true)
})

test('fit, x1 and x2 take their scale at once while x and y still glide; only auto waits', async () => {
  const out = { cols: 89, rows: 41 }
  const sc = scene({ characters: [person()] })
  const one = updateCamera(null, world, sc, out, 'auto', 0)
  const target = updateCamera(null, world, sc, out, 'fit', 0)
  const fit = updateCamera(one, world, sc, out, 'fit', 0.1)
  expect([Math.abs(fit.scale - target.scale) < 1e-9, fit.pendingSec]).toEqual([true, 0])
  expect(fit.y < one.y && fit.y > target.y).toBe(true)
  expect(updateCamera(one, world, sc, out, 'x2', 0.1).scale).toBe(2)
  expect(updateCamera(fit, world, sc, out, 'x1', 0.1).scale).toBe(1)
})

test('walk frames are the cycle slots 0..3 (walk1, walk2, walk3, walk2); type and read wrap at 2', async () => {
  const same = (a: Uint32Array, b: Uint32Array) => a.length === b.length && a.every((v, i) => v === b[i])
  const walk = (f: number) => charSprite(1, 'walk', 'down', f).px
  expect(same(walk(1), walk(3))).toBe(true)
  expect(same(walk(0), walk(1))).toBe(false)
  expect(same(walk(1), walk(2))).toBe(false)
  expect([4, 5, 7, -1].map(f => same(walk(f), walk(f === -1 ? 3 : f - 4)))).toEqual([true, true, true, true])
  const type = (f: number) => charSprite(1, 'type', 'up', f).px
  expect(same(type(0), type(1))).toBe(false)
  expect([2, 3, -1].map(f => same(type(f), type(f - 2 < 0 ? 1 : f - 2)))).toEqual([true, true, true])
  expect(same(catSprite('walk', 'right', 0).px, catSprite('walk', 'right', 1).px)).toBe(false)
  expect(same(catSprite('walk', 'right', 2).px, catSprite('walk', 'right', 0).px)).toBe(true)
  expect(charSprite(NaN, 'walk', 'down', NaN).px.length).toBe(384)
})

test('the camera never leaves the world when the view is smaller, and centers it when larger', async () => {
  const sc = scene({ characters: [person({ x: 340, y: 200 })] })
  const small = updateCamera(null, world, sc, { cols: 60, rows: 20 }, 'x1', 0)
  expect(small.x + 60 <= 352 && small.y + 40 <= 208 && small.x >= 0 && small.y >= 0).toBe(true)
  const big = updateCamera(null, world, sc, { cols: 400, rows: 200 }, 'x1', 0)
  expect(big.x).toBe((352 - 400) / 2)
  expect(big.y).toBe((208 - 400) / 2)
})

test('HD frames cover the camera view as opaque RGBA within limits', async () => {
  const sc = scene({ characters: [person()] })
  const cam = updateCamera(null, world, sc, { cols: 89, rows: 41 }, 'x1', 0)
  const f = toRgba(world, sc, DEFAULT_PREFS, cam, 89, 41)
  expect([f.width, f.height]).toEqual([178, 164])
  expect(f.rgba.length).toBe(f.width * f.height * 4)
  expect(Array.from({ length: f.width * f.height }, (_, i) => f.rgba[i * 4 + 3]).every(a => a === 255)).toBe(true)
  const big = toRgba(world, sc, DEFAULT_PREFS, updateCamera(null, world, sc, { cols: 255, rows: 255 }, 'fit', 0), 255, 255)
  expect(big.width <= 2048 && big.height <= 2048).toBe(true)
})

test('HD shows the same world as the cells: a floor pixel keeps its art color, outside is void', async () => {
  const sc = scene()
  const cam = updateCamera(null, world, sc, { cols: 352, rows: 104 }, 'x1', 0)
  const f = toRgba(world, sc, DEFAULT_PREFS, cam, 352, 104)
  expect([f.width, f.height]).toEqual([352, 208])
  const floor = tileCenter({ col: 2, row: 4 }), o = (floor.y * f.width + floor.x) * 4
  const cells = frame(sc, 352, 104, DEFAULT_PREFS, 'x1')
  const cell = (Math.floor(floor.y / 2) * cells.cols + floor.x) * 3 + 1
  expect((f.rgba[o]! << 16) | (f.rgba[o + 1]! << 8) | f.rgba[o + 2]!).toBe(cells.cells[cell]!)
  const wide = toRgba(world, sc, DEFAULT_PREFS, updateCamera(null, world, sc, { cols: 400, rows: 200 }, 'x1', 0), 400, 200)
  expect([wide.rgba[0], wide.rgba[1], wide.rgba[2]]).toEqual([0x1a, 0x1a, 0x2e])
})

test('HD labels follow the labels pref', async () => {
  const sc = scene({ characters: [person({ bubble: { text: 'hi', tone: 'alert' } })] })
  const cam = updateCamera(null, world, sc, { cols: 120, rows: 40 }, 'x1', 0)
  const a = toRgba(world, sc, DEFAULT_PREFS, cam, 120, 40).rgba
  const b = toRgba(world, sc, { ...DEFAULT_PREFS, labels: false }, cam, 120, 40).rgba
  expect(a.some((v, i) => v !== b[i])).toBe(true)
})
