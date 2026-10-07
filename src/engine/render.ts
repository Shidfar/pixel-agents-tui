// render.ts — a Scene into pixels: half-block cells for a Raster, or RGBA for an Image.
// Pure and deterministic. The world is composed once per frame at native 352×208, lit, then
// sampled down to the view; buffers live in `scratch` and are reused, so a frame allocates
// no per pixel. Hot loops count in the fields of a const object, so nothing here is reassigned.
import { catSprite, charSprite, isOpaque, planeSprite, SKY_MASK, tileSprite, wallSprite } from './art'
import { GLYPH_H, GLYPH_W, glyphFor } from './font'
import { COLORS, framePalette, iota, isNight, LAMP_RADIUS, LAMP_STEPS, lightColor, quantizeHour, reducedPalette, skyColors, tintFor } from './palette'
import type { FramePalette, Tint } from './palette'
import { sanitizeText } from './snapshots'
import { TILE } from './types'
import type { Camera, CameraMode, CellFrame, CharacterView, MonitorView, Prefs, RgbaFrame, Scene, ThemeName, Tile, Tone, World } from './types'
import { tileCenter, wallMask } from './world'

export const MAX_PAIRS = 1000
const REDUCED_COLORS = 31   // 31² = 961 pairs, whatever the frame holds
const HALF_BLOCK = 0x2580
const SCALE_DELAY_SEC = 1.5
const MAX_IMAGE_SIDE = 2048
const MAX_IMAGE_PIXELS = (2 * 1024 * 1024) / 4   // an Image holds at most 2 MiB decoded
const NARROW_HD_PX = 128

// ── Static art facts, read once from the sprites ───────────────────

const spriteWhere = (name: 'tv' | 'gameConsole' | 'computer', keep: (px: number, x: number, y: number, sprite: Uint32Array) => boolean): Int32Array => {
  const sprite = tileSprite(name)
  return iota(256).filter(i => keep(sprite[i]!, i & 15, i >> 4, sprite))
}

// TV glass: rows 2–11, everything that isn't the frame. It scrolls inside its own column span.
const TV_SCREEN = spriteWhere('tv', (px, _x, y, s) => y >= 2 && y <= 11 && px !== s[0])
const TV_X0 = Math.min(...TV_SCREEN.map(o => o & 15))
const TV_W = Math.max(...TV_SCREEN.map(o => o & 15)) - TV_X0 + 1
const LED = [0x0044ff, 0x0066ff]
const CONSOLE_LED = spriteWhere('gameConsole', px => LED.includes(px))

// Monitor glass: the 2 most frequent colors in rows 1–8 of the computer sprite.
const MONITOR_COLORS = ((): number[] => {
  const s = tileSprite('computer')
  const counts = new Map<number, number>()
  for (const i of iota(128)) counts.set(s[16 + i]!, (counts.get(s[16 + i]!) ?? 0) + 1)
  return [...counts].sort((a, b) => b[1] - a[1] || a[0] - b[0]).slice(0, 2).map(([c]) => c)
})()
const MONITOR_SCREEN = spriteWhere('computer', (px, _x, y) => y >= 1 && y <= 8 && MONITOR_COLORS.includes(px))
const MONITOR_MASK = Uint8Array.from(iota(256), i => (MONITOR_SCREEN.includes(i) ? 1 : 0))

// ── Scratch ────────────────────────────────────────────────────────

const scratch = {
  compose: new Uint32Array(0),
  lit: new Uint32Array(0),
  levels: new Uint8Array(0),
  raw: new Uint32Array(0),
  xs: new Int32Array(0),
  xe: new Int32Array(0),
  placed: [] as number[],
  pairKeys: new Int32Array(8192),
  pairStamp: new Uint32Array(4096),
  pairGen: 0,
  cloudX: new Int32Array(4),
  acc: { r: 0, g: 0, b: 0, n: 0 },
  cur: { x: 0, y: 0 },
  memo: { c: -1, k: -1, out: 0 },
}

const grown = <T extends { length: number }>(have: T, n: number, make: (n: number) => T): T => (have.length >= n ? have : make(n))

// ── The static layer: floors, walls, furniture ─────────────────────

type Layer = { readonly w: number; readonly h: number; readonly px: Uint32Array; readonly sky: Int32Array }
const layers = new WeakMap<World, Layer>()

const blit = (dst: Uint32Array, dw: number, dh: number, src: Uint32Array, sw: number, sh: number, x: number, y: number, onSky?: (at: number) => void): void => {
  for (const i of iota(sw * sh)) {
    const v = src[i]!
    const px = x + (i % sw), py = y + ((i / sw) | 0)
    if (px < 0 || px >= dw || py < 0 || py >= dh) continue
    if (isOpaque(v)) dst[py * dw + px] = v
    else if (v === SKY_MASK && onSky) onSky(py * dw + px)
  }
}

// Furniture sprites have see-through corners; they sit on a floor, not on the void.
const FURNITURE: ReadonlySet<Tile> = new Set<Tile>(['desk', 'computer', 'bookshelf', 'plant', 'chair', 'counter', 'appliance', 'door', 'couch', 'tv', 'coffeeTable', 'gameConsole'])
const GROUND: ReadonlySet<Tile> = new Set<Tile>(['floor1', 'floor2', 'floor3', 'floor4', 'floor5', 'floor6', 'floor7', 'rug'])
const NEIGHBORS = [{ col: 0, row: -1 }, { col: 0, row: 1 }, { col: -1, row: 0 }, { col: 1, row: 0 }]   // up, down, left, right

// The first neighbor that is floor or rug; floor1 when there is none.
const groundFor = (w: World, c: number, r: number): Tile =>
  NEIGHBORS.map(d => w.tiles[r + d.row]?.[c + d.col]).find(t => t !== undefined && GROUND.has(t)) ?? 'floor1'

const buildLayer = (w: World): Layer => {
  const W = w.cols * TILE, H = w.rows * TILE
  const px = new Uint32Array(W * H).fill(COLORS.void)
  const sky: number[] = []
  w.tiles.forEach((row, r) => row.forEach((t, c) => {
    if (FURNITURE.has(t)) blit(px, W, H, tileSprite(groundFor(w, c, r)), TILE, TILE, c * TILE, r * TILE)
    const board = w.whiteboard.findIndex(p => p.col === c && p.row === r)
    const sprite = t === 'wall' ? wallSprite(wallMask(w, c, r))
      : t === 'door' ? tileSprite('doorClosed')
      : t === 'whiteboard' ? tileSprite(board === 0 ? 'wbLeft' : board === w.whiteboard.length - 1 ? 'wbRight' : 'wbMid')
      : tileSprite(t)
    blit(px, W, H, sprite, TILE, TILE, c * TILE, r * TILE, at => sky.push(at))
  }))
  return { w: W, h: H, px, sky: Int32Array.from(sky) }
}

const layerFor = (w: World): Layer => {
  const hit = layers.get(w)
  if (hit) return hit
  const made = buildLayer(w)
  layers.set(w, made)
  return made
}

// ── Compose: the static layer plus everything that moves ───────────

// A copy of the characters, back to front for painting or front to back for placing text
// (a larger y is nearer). Equal depths keep their order.
const byDepth = (chars: readonly CharacterView[], dir: 'back' | 'front'): CharacterView[] =>
  [...chars].sort(dir === 'back' ? (a, b) => a.y - b.y : (a, b) => b.y - a.y)

// A cheap stable hash for stars: no random, no state.
const scatter = (x: number, y: number): number => (Math.imul(x, 73856093) ^ Math.imul(y, 19349663)) >>> 0

// How many clouds, and their color, for each weather.
const CLOUDS: Readonly<Record<string, readonly [number, number]>> = { clouds: [2, COLORS.cloudLight], rain: [3, COLORS.cloudGrey], storm: [4, COLORS.cloudDark], lightning: [4, COLORS.cloudDark] }

const inCloud = (x: number, y: number, n: number): boolean => {
  const k = scratch.cur
  k.x = 0
  while (k.x < n) {
    const cx = scratch.cloudX[k.x]!, cy = 4 + ((k.x * 2 + 1) % 7)
    if ((y === cy && x >= cx + 2 && x <= cx + 5) || (y === cy + 1 && x >= cx && x <= cx + 7)) return true
    k.x++
  }
  return false
}

// One pixel of window glass: sky, then stars at night, clouds, rain, and the lightning flash.
const skyPixel = (x: number, y: number, top: number, bottom: number, night: boolean, sky: Scene['sky'], time: number, clouds: number, cloudColor: number): number => {
  if (sky.flash) return COLORS.flash
  const wet = sky.weather === 'rain' || sky.weather === 'storm' || sky.weather === 'lightning'
  if (wet && (sky.weather !== 'rain' || x % 2 === 0) && (y + Math.floor(time * 14) + ((x * 5) % 8)) % 8 < 2) return COLORS.rain
  if (clouds > 0 && inCloud(x, y, clouds)) return cloudColor
  if (night && (sky.weather === 'clear' || sky.weather === 'clouds') && scatter(x, y) % 17 === 0 && (Math.floor(time * 2) + x) % 5 !== 0) return COLORS.star
  return y % TILE < 7 ? top : bottom
}

const paintMonitor = (compose: Uint32Array, W: number, m: MonitorView, time: number): void => {
  const origin = m.row * TILE * W + m.col * TILE
  const bg = m.mode === 'code' ? COLORS.codeBg : COLORS.termBg
  for (const o of MONITOR_SCREEN) compose[origin + (o >> 4) * W + (o & 15)] = bg
  const step = Math.floor(time * 4)
  for (const k of iota(3)) {
    const row = 1 + ((k * 3 + step) % 8)
    const len = 3 + ((k * 5 + step * 7) % 8)
    const color = m.mode === 'code' ? COLORS.codeLines[k]! : COLORS.termLine
    for (const dx of iota(len)) if (MONITOR_MASK[(row << 4) + 2 + dx]) compose[origin + row * W + 2 + dx] = color
  }
}

const drawParticle = (compose: Uint32Array, W: number, H: number, x: number, y: number, size: number, color: number): void => {
  const r = size >> 1, cx = Math.floor(x), cy = Math.floor(y)
  for (const i of iota((2 * r + 1) * (2 * r + 1))) {
    const dx = (i % (2 * r + 1)) - r, dy = ((i / (2 * r + 1)) | 0) - r
    const px = cx + dx, py = cy + dy
    if (dx * dx + dy * dy <= r * r + 1 && px >= 0 && px < W && py >= 0 && py < H) compose[py * W + px] = color
  }
}

const composeWorld = (w: World, scene: Scene, prefs: Prefs, layer: Layer): Uint32Array => {
  const { w: W, h: H } = layer
  scratch.compose = grown(scratch.compose, W * H, n => new Uint32Array(n))
  const out = scratch.compose
  out.set(layer.px)

  const hour = quantizeHour(scene.sky.hour)
  const [top, bottom] = skyColors(hour, scene.sky.weather)
  const night = isNight(hour)
  const [clouds, cloudColor] = CLOUDS[scene.sky.weather] ?? [0, 0]
  for (const k of iota(clouds)) scratch.cloudX[k] = (k * 83 + Math.floor(scene.time * (2 + k) * 0.75)) % (W + 16) - 8
  for (const at of layer.sky) out[at] = skyPixel(at % W, (at / W) | 0, top, bottom, night, scene.sky, scene.time, clouds, cloudColor)

  if (scene.doorOpen) blit(out, W, H, tileSprite('door'), TILE, TILE, w.door.col * TILE, w.door.row * TILE)

  // TV glass scrolls one pixel every 0.15 s; the console LED row flips between two blues.
  const tv = tileSprite('tv'), shift = Math.floor(scene.time / 0.15) % TV_W
  for (const o of TV_SCREEN) {
    const x = o & 15, y = o >> 4
    out[(w.tv.row * TILE + y) * W + w.tv.col * TILE + x] = scene.tvOn ? tv[(y << 4) + TV_X0 + ((x - TV_X0 + shift) % TV_W)]! : COLORS.tvOff
  }
  if (scene.tvOn) {
    const beat = Math.floor(scene.time * 2) & 1
    w.tiles.forEach((row, r) => row.forEach((t, c) => {
      if (t !== 'gameConsole') return
      for (const o of CONSOLE_LED) out[(r * TILE + (o >> 4)) * W + c * TILE + (o & 15)] = LED[(o + beat) & 1]!
    }))
  }

  for (const m of scene.monitors) if (m.mode !== 'off') paintMonitor(out, W, m, scene.time)

  for (const ch of byDepth(scene.characters, 'back')) {
    const s = charSprite(ch.palette, ch.pose, ch.dir, ch.frame)
    blit(out, W, H, s.px, s.w, s.h, Math.round(ch.x - 8), Math.round(ch.y - 24 + (ch.pose === 'type' ? 6 : 0) + ch.bob))
  }
  const cat = catSprite(scene.cat.pose, scene.cat.dir, scene.cat.frame)
  blit(out, W, H, cat.px, cat.w, cat.h, Math.round(scene.cat.x - cat.w / 2), Math.round(scene.cat.y - cat.h))
  for (const p of scene.planes) {
    const s = planeSprite(p.dir)
    blit(out, W, H, s.px, s.w, s.h, Math.round(p.x - 3), Math.round(p.y - 2))
  }
  if (prefs.effects) for (const p of scene.particles) drawParticle(out, W, H, p.x, p.y, p.size, p.color)
  return out
}

// ── Light ──────────────────────────────────────────────────────────

// Where a character sits, the desk lamp is its seat's monitor.
const lampOf = (w: World, ch: CharacterView) =>
  ch.pose === 'type' || ch.pose === 'read'
    ? w.seats.find(s => s.monitor !== undefined && Math.abs(tileCenter(s).x - ch.x) <= TILE / 2 && Math.abs(tileCenter(s).y - ch.y) <= TILE / 2)?.monitor
    : undefined

const lightWorld = (w: World, scene: Scene, prefs: Prefs, compose: Uint32Array, W: number, H: number, tint: Tint, hour: number): Uint32Array => {
  if (tint.r === 1 && tint.g === 1 && tint.b === 1 && prefs.theme === 'default') return compose
  const n = W * H
  scratch.lit = grown(scratch.lit, n, m => new Uint32Array(m))
  scratch.levels = grown(scratch.levels, n, m => new Uint8Array(m))
  const { lit, levels, memo } = scratch
  levels.fill(0, 0, n)
  if (isNight(hour)) {
    for (const ch of scene.characters) {
      const m = lampOf(w, ch)
      if (!m) continue
      const c = tileCenter(m), side = 2 * LAMP_RADIUS + 1
      for (const i of iota(side * side)) {
        const x = Math.round(c.x) - LAMP_RADIUS + (i % side), y = Math.round(c.y) - LAMP_RADIUS + ((i / side) | 0)
        if (x < 0 || x >= W || y < 0 || y >= H) continue
        const level = Math.round((1 - Math.sqrt((x - c.x) ** 2 + (y - c.y) ** 2) / LAMP_RADIUS) * LAMP_STEPS)
        if (level > levels[y * W + x]!) levels[y * W + x] = level
      }
    }
  }
  memo.c = -1
  for (const i of iota(n)) {
    const c = compose[i]!, k = levels[i]!
    if (c !== memo.c || k !== memo.k) {
      memo.c = c
      memo.k = k
      memo.out = lightColor(c, tint, prefs.theme, k)
    }
    lit[i] = memo.out
  }
  return lit
}

type Lit = { readonly px: Uint32Array; readonly W: number; readonly H: number; readonly hour: number; readonly tint: Tint; readonly theme: ThemeName }

const prepare = (w: World, scene: Scene, prefs: Prefs): Lit => {
  const layer = layerFor(w)
  const hour = quantizeHour(scene.sky.hour)
  const tint = tintFor(hour)
  const compose = composeWorld(w, scene, prefs, layer)
  return { px: lightWorld(w, scene, prefs, compose, layer.w, layer.h, tint, hour), W: layer.w, H: layer.h, hour, tint, theme: prefs.theme }
}

// ── Camera ─────────────────────────────────────────────────────────

const SAME = 1e-9

// Keep the view inside the world; when it is bigger than the world, center the world.
const place = (pos: number, view: number, world: number): number => (view >= world ? (world - view) / 2 : Math.min(Math.max(pos, 0), world - view))
const keepInside = (pos: number, view: number, world: number): number => (view >= world ? pos : Math.min(Math.max(pos, 0), world - view))

type Box = { readonly x0: number; readonly y0: number; readonly x1: number; readonly y1: number }

const charBox = (cs: readonly CharacterView[]): Box | null =>
  cs.length === 0 ? null : {
    x0: Math.min(...cs.map(c => c.x)), y0: Math.min(...cs.map(c => c.y)),
    x1: Math.max(...cs.map(c => c.x)), y1: Math.max(...cs.map(c => c.y)),
  }

export function updateCamera(cam: Camera | null, w: World, scene: Scene, out: { cols: number; rows: number }, mode: CameraMode, dtSec: number): Camera {
  const W = w.cols * TILE, H = w.rows * TILE
  const vw = (s: number) => out.cols * s, vh = (s: number) => out.rows * 2 * s
  const fit = Math.max(W / out.cols, H / (out.rows * 2), 1)
  const chars = charBox(scene.characters)
  const focus = scene.focus
  const world: Box = { x0: 0, y0: 0, x1: W, y1: H }

  // the box the camera should hold
  const grownBox: Box | null = chars && { x0: chars.x0 - 16, y0: chars.y0 - 16, x1: chars.x1 + 16, y1: chars.y1 + 16 }
  const framed: Box = grownBox
    ? (focus ? { x0: Math.min(grownBox.x0, focus.x), y0: Math.min(grownBox.y0, focus.y), x1: Math.max(grownBox.x1, focus.x), y1: Math.max(grownBox.y1, focus.y) } : grownBox)
    : focus ? { x0: focus.x, y0: focus.y, x1: focus.x, y1: focus.y } : world
  const mid = (b: Box) => ({ x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 })

  const targetScale = mode === 'fit' ? fit
    : mode === 'x1' ? 1
    : mode === 'x2' ? 2
    : ([1, 2, 3].find(s => s < fit && vw(s) >= framed.x1 - framed.x0 && vh(s) >= framed.y1 - framed.y0) ?? fit)
  const center = mode === 'fit' ? mid(world)
    : mode === 'auto' ? mid(framed)
    : focus ?? (chars ? mid(chars) : mid(world))
  const aim = (s: number) => ({ x: place(center.x - vw(s) / 2, vw(s), W), y: place(center.y - vh(s) / 2, vh(s), H) })

  if (cam === null) return { ...aim(targetScale), scale: targetScale, pendingScale: targetScale, pendingSec: 0 }

  const hold = Math.abs(targetScale - cam.scale) < SAME
  const waiting = !hold && Math.abs(targetScale - cam.pendingScale) < SAME && Math.abs(cam.pendingScale - cam.scale) >= SAME
  const pendingSec = hold ? 0 : waiting ? cam.pendingSec + dtSec : dtSec
  // only auto waits; a chosen mode (or a pane resize in fit) takes its scale now, x and y still glide
  const switching = !hold && (mode !== 'auto' || pendingSec >= SCALE_DELAY_SEC)
  const scale = switching ? targetScale : cam.scale
  const to = aim(scale)
  const k = 1 - Math.exp(-4 * dtSec)
  return {
    x: keepInside(cam.x + (to.x - cam.x) * k, vw(scale), W),
    y: keepInside(cam.y + (to.y - cam.y) * k, vh(scale), H),
    scale,
    pendingScale: hold || switching ? scale : targetScale,
    pendingSec: hold || switching ? 0 : pendingSec,
  }
}

// ── Sampling ───────────────────────────────────────────────────────

const VOID = COLORS.void

// Mean of the integer pixels inside [x0,x1)×[y0,y1), clipped to the world; the void if none.
const meanOf = (px: Uint32Array, W: number, H: number, x0: number, x1: number, y0: number, y1: number): number => {
  const ax = Math.max(x0, 0), bx = Math.min(x1, W), ay = Math.max(y0, 0), by = Math.min(y1, H)
  if (bx <= ax || by <= ay) return VOID
  const a = scratch.acc, at = scratch.cur
  at.y = ay
  a.r = a.g = a.b = a.n = 0
  while (at.y < by) {
    at.x = ax
    while (at.x < bx) {
      const c = px[at.y * W + at.x]!
      a.r += (c >> 16) & 255
      a.g += (c >> 8) & 255
      a.b += c & 255
      a.n++
      at.x++
    }
    at.y++
  }
  return (Math.round(a.r / a.n) << 16) | (Math.round(a.g / a.n) << 8) | Math.round(a.b / a.n)
}

// Output pixel (i, j) covers world [cam.x + i·s, cam.x + (i+1)·s) × [cam.y + j·s, …). s ≤ 1
// takes the nearest pixel; s > 1 averages the integer pixels inside, at least one.
function sampleCells(lit: Lit, cam: Camera, cols: number, rows2: number, raw: Uint32Array): void {
  const s = cam.scale
  scratch.xs = grown(scratch.xs, cols, n => new Int32Array(n))
  scratch.xe = grown(scratch.xe, cols, n => new Int32Array(n))
  const { xs, xe } = scratch
  const colIdx = iota(cols)
  for (const i of colIdx) {
    xs[i] = s <= 1 ? Math.floor(cam.x + (i + 0.5) * s) : Math.ceil(cam.x + i * s)
    xe[i] = s <= 1 ? xs[i]! + 1 : Math.max(xs[i]! + 1, Math.ceil(cam.x + (i + 1) * s))
  }
  for (const j of iota(rows2)) {
    const y0 = s <= 1 ? Math.floor(cam.y + (j + 0.5) * s) : Math.ceil(cam.y + j * s)
    const y1 = s <= 1 ? y0 + 1 : Math.max(y0 + 1, Math.ceil(cam.y + (j + 1) * s))
    for (const i of colIdx) raw[j * cols + i] = meanOf(lit.px, lit.W, lit.H, xs[i]!, xe[i]!, y0, y1)
  }
}

// ── Text over cells ────────────────────────────────────────────────

const TONES: Readonly<Record<Tone, { readonly bg: number; readonly fg: number }>> = {
  alert: { bg: 0xc82828, fg: 0xffffff },
  ask: { bg: 0xb48c14, fg: 0x1e1e1e },
  info: { bg: 0x2a2a3e, fg: 0xddddee },
  ok: { bg: 0x1e7a3c, fg: 0xffffff },
  bad: { bg: 0x8c1e1e, fg: 0xffffff },
}
const LABEL = { bg: 0x222233, fg: 0xffffff }
const SELF_FG = 0xffd24a
const BOARD_TEXT = 0x222233
const BOARD_FACE = 0xe8ecf0
const DIM_Z = 0x8888aa
const LABEL_MAX = 16
const BUBBLE_MAX = 32

type Surface = { readonly cells: Uint32Array; readonly cols: number; readonly rows: number }

const putText = (f: Surface, row: number, col: number, text: string, fg: number, bg: number): void => {
  if (row < 0 || row >= f.rows) return
  for (const [i, ch] of [...text].entries()) {
    if (col + i < 0 || col + i >= f.cols) continue
    const o = (row * f.cols + col + i) * 3
    f.cells[o] = ch.codePointAt(0)!
    f.cells[o + 1] = fg
    f.cells[o + 2] = bg
  }
}

const boardLine = (s: Scene['whiteboard']): string => sanitizeText(`T${s.tools} E${s.edits} C${s.commits}`, 40)

// The whiteboard totals, the board's left and right edge, and the text's middle row; null with no board.
const boardFor = (w: World, scene: Scene) => {
  const b = w.whiteboard
  return b.length === 0 ? null : { text: boardLine(scene.whiteboard), x0: b[0]!.col * TILE, x1: (b[b.length - 1]!.col + 1) * TILE, y: b[0]!.row * TILE + 7 }
}

// Where a text `width` wide starts to sit centered between x0 and x1; null when it does not fit.
const centered = (x0: number, x1: number, width: number): number | null => (width <= x1 - x0 ? x0 + Math.floor((x1 - x0 - width) / 2) : null)

// Where a sleeping cat's z floats; null when it is awake or labels are off.
const catZ = (scene: Scene, prefs: Prefs): { readonly x: number; readonly y: number } | null =>
  prefs.labels && scene.cat.pose === 'sleep' ? { x: scene.cat.x, y: scene.cat.y - 9 } : null

type Tag = { readonly text: string; readonly fg: number; readonly bg: number }
type Labeled = { readonly x: number; readonly y: number; readonly bubble?: Tag; readonly label?: Tag }

// Front to back, so the nearest claims its space first: each character's bubble and label, if
// shown. The text comes from other sessions' state files, so this is the one place it is
// sanitized, before either backend draws it. (x, y) is the world point the label stands on.
const labelsFor = (scene: Scene, prefs: Prefs): readonly Labeled[] =>
  byDepth(scene.characters, 'front').map(ch => ({
    x: ch.x,
    y: ch.y - 26 + ch.bob,
    bubble: ch.bubble && (ch.bubble.tone !== 'info' || prefs.labels) ? { ...TONES[ch.bubble.tone], text: sanitizeText(ch.bubble.text, BUBBLE_MAX) } : undefined,
    label: prefs.labels && ch.label.length > 0 ? { text: `${ch.isSelf ? '★' : ''}${sanitizeText(ch.label, LABEL_MAX)}`, fg: ch.isSelf ? SELF_FG : LABEL.fg, bg: LABEL.bg } : undefined,
  }))

const overlaps = (placed: readonly number[], row: number, a: number, b: number): boolean =>
  placed.some((_, i) => i % 3 === 0 && placed[i] === row && a < placed[i + 2]! && b > placed[i + 1]!)

// A text shifts up at most 2 rows to clear what is already placed; if none is free, it stays.
const shiftFor = (placed: readonly number[], row: number, a: number, b: number): number =>
  [0, 1, 2].find(k => !overlaps(placed, row - k, a, b)) ?? 0

function overlayCells(f: Surface, w: World, scene: Scene, prefs: Prefs, cam: Camera, lit: Lit, snap: (rgb: number) => number): void {
  const s = cam.scale
  const colOf = (x: number) => Math.floor((x - cam.x) / s)
  const rowOf = (y: number) => Math.floor((y - cam.y) / s / 2)

  // whiteboard totals, when they fit across the board
  const board = boardFor(w, scene)
  if (board) {
    const start = centered(Math.ceil((board.x0 - cam.x) / s), Math.floor((board.x1 - cam.x) / s), board.text.length)
    if (start !== null) putText(f, rowOf(board.y), start, board.text, snap(lightColor(BOARD_TEXT, lit.tint, lit.theme, 0)), snap(lightColor(BOARD_FACE, lit.tint, lit.theme, 0)))
  }

  // a sleeping cat's z, over whatever is already behind it
  const z = catZ(scene, prefs)
  if (z) {
    const row = rowOf(z.y) - 1, col = colOf(z.x)
    if (row >= 0 && row < f.rows && col >= 0 && col < f.cols) putText(f, row, col, 'z', DIM_Z, f.cells[(row * f.cols + col) * 3 + 2]!)
  }

  const placed = scratch.placed
  placed.length = 0

  const place = (row: number, text: string, centerCol: number, fg: number, bg: number): void => {
    const a = centerCol - Math.floor(text.length / 2)
    if (row < 0 || row >= f.rows) return
    putText(f, row, a, text, fg, bg)
    placed.push(row, a, a + text.length)
  }

  for (const { x, y, bubble, label } of labelsFor(scene, prefs)) {
    const col = colOf(x), labelRow = rowOf(y)
    const bubbleText = bubble ? ` ${bubble.text} ` : ''

    // the bubble goes first; the label rides up with it, then clears anything left
    const bubbleRow = label ? labelRow - 1 : labelRow
    const bubbleStart = col - Math.floor(bubbleText.length / 2)
    const lift = bubble ? shiftFor(placed, bubbleRow, bubbleStart, bubbleStart + bubbleText.length) : 0
    if (bubble) place(bubbleRow - lift, bubbleText, col, bubble.fg, bubble.bg)
    if (label) {
      const labelText = ` ${label.text} `
      const start = col - Math.floor(labelText.length / 2)
      const own = shiftFor(placed, labelRow - lift, start, start + labelText.length)
      place(labelRow - lift - own, labelText, col, label.fg, label.bg)
    }
  }
}

// ── Cells ──────────────────────────────────────────────────────────

// Distinct (fg, bg) pairs, counting no further than one past the limit.
function countPairs(cells: Uint32Array, n: number): number {
  const { pairKeys, pairStamp } = scratch
  const gen = ++scratch.pairGen
  const found = { n: 0 }
  for (const i of iota(n)) {
    const fg = cells[i * 3 + 1]!, bg = cells[i * 3 + 2]!
    const at = scratch.cur
    at.x = (Math.imul(fg, 0x9e3779b1) ^ Math.imul(bg, 0x85ebca6b)) >>> 20
    while (pairStamp[at.x] === gen && (pairKeys[at.x * 2] !== fg || pairKeys[at.x * 2 + 1] !== bg)) at.x = (at.x + 1) & 4095
    if (pairStamp[at.x] === gen) continue
    pairStamp[at.x] = gen
    pairKeys[at.x * 2] = fg
    pairKeys[at.x * 2 + 1] = bg
    if (++found.n > MAX_PAIRS) break
  }
  return found.n
}

export function toCells(w: World, scene: Scene, prefs: Prefs, cam: Camera, cols: number, rows: number): CellFrame {
  const lit = prepare(w, scene, prefs)
  scratch.raw = grown(scratch.raw, cols * rows * 2, n => new Uint32Array(n))
  const raw = scratch.raw
  sampleCells(lit, cam, cols, rows * 2, raw)

  const cells = new Uint32Array(cols * rows * 3)
  const surface: Surface = { cells, cols, rows }
  const paint = (p: FramePalette): number => {
    for (const i of iota(cols * rows)) {
      const r = (i / cols) | 0, c = i - r * cols
      cells[i * 3] = HALF_BLOCK
      cells[i * 3 + 1] = p.snap(raw[2 * r * cols + c]!)
      cells[i * 3 + 2] = p.snap(raw[(2 * r + 1) * cols + c]!)
    }
    overlayCells(surface, w, scene, prefs, cam, lit, p.snap)
    return countPairs(cells, cols * rows)
  }
  const full = framePalette(prefs.theme, lit.hour)
  const pairs = paint(full)
  return { cols, rows, cells, pairs: pairs <= MAX_PAIRS ? pairs : paint(reducedPalette(full, REDUCED_COLORS)) }
}

// base64 of the little-endian u32 buffer (every platform this runs on is little-endian)
export function encodeCells(f: CellFrame): string {
  return new Uint8Array(f.cells.buffer, f.cells.byteOffset, f.cells.byteLength).toBase64()
}

// ── ANSI diff, a port of the Go framebuffer's Flush ────────────────

const sgr = (kind: 38 | 48, rgb: number): string => `\x1b[${kind};2;${(rgb >> 16) & 255};${(rgb >> 8) & 255};${rgb & 255}m`

// Truecolor, changed cells only. A cursor move starts each run; cells that follow one
// another share it. '' when nothing changed.
export function cellsToAnsi(f: CellFrame, prev: CellFrame | null): string {
  const old = prev && prev.cols === f.cols && prev.rows === f.rows ? prev.cells : null
  const out = { text: '', fg: -1, bg: -1, last: -2 }
  for (const i of iota(f.cols * f.rows)) {
    const o = i * 3, r = (i / f.cols) | 0, c = i - r * f.cols
    if (c === 0) out.last = -2
    if (old && old[o] === f.cells[o] && old[o + 1] === f.cells[o + 1] && old[o + 2] === f.cells[o + 2]) continue
    if (c !== out.last + 1) out.text += `\x1b[${r + 1};${c + 1}H`
    if (f.cells[o + 1] !== out.fg) { out.text += sgr(38, f.cells[o + 1]!); out.fg = f.cells[o + 1]! }
    if (f.cells[o + 2] !== out.bg) { out.text += sgr(48, f.cells[o + 2]!); out.bg = f.cells[o + 2]! }
    out.text += String.fromCodePoint(f.cells[o]!)
    out.last = c
  }
  return out.text
}

// ── HD ─────────────────────────────────────────────────────────────

type Pixels = { readonly rgba: Uint8Array; readonly width: number; readonly height: number }

const fillRect = (img: Pixels, x: number, y: number, w: number, h: number, rgb: number): void => {
  const x0 = Math.max(0, x), x1 = Math.min(img.width, x + w), y0 = Math.max(0, y), y1 = Math.min(img.height, y + h)
  const at = scratch.cur
  at.y = y0
  while (at.y < y1) {
    at.x = x0
    while (at.x < x1) {
      const o = (at.y * img.width + at.x) * 4
      img.rgba[o] = (rgb >> 16) & 255
      img.rgba[o + 1] = (rgb >> 8) & 255
      img.rgba[o + 2] = rgb & 255
      at.x++
    }
    at.y++
  }
}

// 3×5 glyphs, 1 px apart, each pixel g×g.
const drawText = (img: Pixels, x: number, y: number, text: string, rgb: number, g: number): void => {
  for (const [k, ch] of [...text].entries()) {
    const bits = glyphFor(ch)
    for (const i of iota(GLYPH_W * GLYPH_H)) {
      if (bits[i] === '1') fillRect(img, x + (k * (GLYPH_W + 1) + (i % GLYPH_W)) * g, y + ((i / GLYPH_W) | 0) * g, g, g, rgb)
    }
  }
}

const textWidth = (n: number, g: number): number => (n * (GLYPH_W + 1) - 1) * g

const rectsHit = (placed: readonly number[], x0: number, y0: number, x1: number, y1: number): boolean =>
  placed.some((_, i) => i % 4 === 0 && x0 < placed[i + 2]! && x1 > placed[i]! && y0 < placed[i + 3]! && y1 > placed[i + 1]!)

function overlayRgba(img: Pixels, w: World, scene: Scene, prefs: Prefs, cam: Camera, sx: number, sy: number, g: number, lit: Lit): void {
  const px = (x: number) => Math.round((x - cam.x) * sx), py = (y: number) => Math.round((y - cam.y) * sy)
  const pad = g, bh = (GLYPH_H + 2) * g

  const board = boardFor(w, scene)
  if (board) {
    const start = centered(px(board.x0), px(board.x1), textWidth(board.text.length, g))
    if (start !== null) drawText(img, start, py(board.y) - Math.floor((GLYPH_H * g) / 2), board.text, lightColor(BOARD_TEXT, lit.tint, lit.theme, 0), g)
  }

  const z = catZ(scene, prefs)
  if (z) drawText(img, px(z.x) - Math.floor((GLYPH_W * g) / 2), py(z.y) - (GLYPH_H + 2) * g, 'z', DIM_Z, g)

  const placed = scratch.placed
  placed.length = 0

  const boxW = (tag: Tag): number => textWidth(tag.text.length, g) + 2 * pad
  // a box shifts up by its own height, at most twice, to clear what is placed
  const lift = (cx: number, bottom: number, tag: Tag): number => {
    const x0 = cx - Math.floor(boxW(tag) / 2)
    return [0, 1, 2].find(k => !rectsHit(placed, x0, bottom - bh - k * bh, x0 + boxW(tag), bottom - k * bh)) ?? 0
  }
  const box = (cx: number, bottom: number, tag: Tag, up: number): void => {
    const bw = boxW(tag)
    const x0 = cx - Math.floor(bw / 2), y0 = bottom - bh - up * bh
    fillRect(img, x0, y0, bw, bh, tag.bg)
    drawText(img, x0 + pad, y0 + pad, tag.text, tag.fg, g)
    placed.push(x0, y0, x0 + bw, y0 + bh)
  }

  for (const { x, y, bubble, label } of labelsFor(scene, prefs)) {
    const cx = px(x), labelBottom = py(y)
    // the bubble goes first; the label rides up with it, then clears anything left
    const bubbleBottom = label ? labelBottom - bh - g : labelBottom
    const up = bubble ? lift(cx, bubbleBottom, bubble) : 0
    if (bubble) box(cx, bubbleBottom, bubble, up)
    if (label) {
      const base = labelBottom - up * bh
      box(cx, base, label, lift(cx, base, label))
    }
  }
}

export function toRgba(w: World, scene: Scene, prefs: Prefs, cam: Camera, cols: number, rows: number): RgbaFrame {
  const lit = prepare(w, scene, prefs)
  const s = cam.scale
  // the view's world rectangle, drawn 1:1 (2× when narrow), and never past the Image limits
  const rw = cols * s, rh = rows * 2 * s
  const want = { w: Math.max(1, Math.round(rw)) * (rw < NARROW_HD_PX ? 2 : 1), h: Math.max(1, Math.round(rh)) * (rw < NARROW_HD_PX ? 2 : 1) }
  const shrink = Math.min(1, MAX_IMAGE_SIDE / want.w, MAX_IMAGE_SIDE / want.h, Math.sqrt(MAX_IMAGE_PIXELS / (want.w * want.h)))
  const width = Math.max(1, Math.floor(want.w * shrink)), height = Math.max(1, Math.floor(want.h * shrink))
  const sx = width / rw, sy = height / rh

  scratch.xs = grown(scratch.xs, width, n => new Int32Array(n))
  const xs = scratch.xs
  const cols1 = iota(width)
  for (const i of cols1) xs[i] = Math.floor(cam.x + (i + 0.5) / sx)
  const rgba = new Uint8Array(width * height * 4)
  for (const j of iota(height)) {
    const y = Math.floor(cam.y + (j + 0.5) / sy)
    for (const i of cols1) {
      const x = xs[i]!
      const c = x < 0 || x >= lit.W || y < 0 || y >= lit.H ? VOID : lit.px[y * lit.W + x]!
      const o = (j * width + i) * 4
      rgba[o] = (c >> 16) & 255
      rgba[o + 1] = (c >> 8) & 255
      rgba[o + 2] = c & 255
      rgba[o + 3] = 255
    }
  }
  overlayRgba({ rgba, width, height }, w, scene, prefs, cam, sx, sy, Math.max(1, Math.round(sx)), lit)
  return { width, height, rgba }
}
