// palette.ts — the fixed palette. Claude Code paints at most 1024 color pairs exactly, so every
// frame snaps to colors from one list. Room tint and theme are applied to the list itself, so a
// pixel that starts as a palette color ends as one, with no drift.
import { artColors } from './art'
import { TILE_PALETTE } from './art.gen'
import type { ThemeName, Weather } from './types'

export type FramePalette = { readonly colors: Uint32Array; readonly snap: (rgb: number) => number }
export type Tint = { readonly r: number; readonly g: number; readonly b: number }

// Scene colors the art doesn't hold. Everything here is "before light": the tint and theme
// are applied on top, to these and to the art alike.
export const COLORS = {
  void: 0x1a1a2e,
  tvOff: 0x1a1a2e,
  codeBg: 0x0f1f3a,
  codeLines: [0x7cff6b, 0xe8e8e8, 0x5ec8ff] as readonly number[],
  termBg: 0x000000,
  termLine: 0x33dd55,
  cloudLight: 0xf2f4f8,
  cloudGrey: 0xb8becc,
  cloudDark: 0x6a7080,
  rain: 0xa8c8f0,
  star: 0xfff4c0,
  flash: 0xf4f4ff,
  boardText: 0x222233,
  particles: [0x00ff88, 0xff4444, 0xff5e5e, 0xffd24a, 0x5ec8ff, 0x7cff6b, 0xd07cff, 0x8a8a9a, 0x00ccff, 0xcc66ff, 0xff8800, 0xffcc00, 0xffffff] as readonly number[],
}

// ── Hour, sky, light ───────────────────────────────────────────────

// Palettes are cached per quarter hour, so everything hour-dependent uses this.
// A non-finite hour reads as noon: a bad clock must not break a frame.
export const quantizeHour = (hour: number): number => (Number.isFinite(hour) ? Math.floor((((hour % 24) + 24) % 24) * 4) / 4 : 12)

export const isNight = (hour: number): boolean => hour >= 20 || hour < 6

const DAY: Tint = { r: 1, g: 1, b: 1 }
const DUSK: Tint = { r: 1, g: 0.92, b: 0.85 }
const NIGHT: Tint = { r: 0.55, g: 0.58, b: 0.75 }
const WARM: Tint = { r: 1, g: 0.9, b: 0.7 }

export const tintFor = (hour: number): Tint => {
  const h = quantizeHour(hour)
  return h >= 8 && h <= 17 ? DAY : h >= 6 && h < 20 ? DUSK : NIGHT
}

export const LAMP_STEPS = 3
export const LAMP_RADIUS = 28

const clamp8 = (v: number): number => (v < 0 ? 0 : v > 255 ? 255 : v)
const pack = (r: number, g: number, b: number): number => (r << 16) | (g << 8) | b

// Ported from the Go themes.
const THEME: Readonly<Record<ThemeName, (r: number, g: number, b: number) => number>> = {
  default: pack,
  warm: (r, g, b) => pack(clamp8(r + 20), clamp8(g + 5), clamp8(b - 15)),
  cool: (r, g, b) => pack(clamp8(r - 10), clamp8(g + 5), clamp8(b + 20)),
  dark: (r, g, b) => pack(Math.floor(r * 0.6), Math.floor(g * 0.6), Math.floor(b * 0.6)),
  light: (r, g, b) => pack(clamp8(Math.floor(r * 1.3)), clamp8(Math.floor(g * 1.3)), clamp8(Math.floor(b * 1.3))),
}

// Tint, then (lamp > 0) lerp toward the warm-lit original by lamp/LAMP_STEPS, then theme.
export function lightColor(rgb: number, tint: Tint, theme: ThemeName, lamp: number): number {
  const r = (rgb >> 16) & 255, g = (rgb >> 8) & 255, b = rgb & 255
  const tr = Math.round(r * tint.r), tg = Math.round(g * tint.g), tb = Math.round(b * tint.b)
  const t = lamp / LAMP_STEPS
  return lamp === 0
    ? THEME[theme](tr, tg, tb)
    : THEME[theme](Math.round(tr + (Math.round(r * WARM.r) - tr) * t), Math.round(tg + (Math.round(g * WARM.g) - tg) * t), Math.round(tb + (Math.round(b * WARM.b) - tb) * t))
}

const mix = (a: number, b: number, t: number): number =>
  pack(Math.round(((a >> 16) & 255) * (1 - t) + ((b >> 16) & 255) * t), Math.round(((a >> 8) & 255) * (1 - t) + ((b >> 8) & 255) * t), Math.round((a & 255) * (1 - t) + (b & 255) * t))

// hour, top, bottom
const SKY_KEYS: readonly (readonly [number, number, number])[] = [
  [0, 0x1c2a66, 0x2c3f8c], [5, 0x1c2a66, 0x2c3f8c], [6.5, 0x7a6aa8, 0xf0a878], [8, 0x4f9fe0, 0x9fd2f4],
  [17, 0x4f9fe0, 0x9fd2f4], [18.5, 0xe8803c, 0x9a5a9a], [20, 0x2a3a7a, 0x3c4f9a], [24, 0x1c2a66, 0x2c3f8c],
]
const OVERCAST: Readonly<Record<Weather, readonly [number, number]>> = {
  clear: [0, 1], clouds: [0.35, 1], rain: [0.6, 0.85], storm: [0.75, 0.7], lightning: [0.8, 0.65],
}
const grey = (c: number, k: number): number => {
  const y = Math.round((((c >> 16) & 255) * 0.3 + ((c >> 8) & 255) * 0.59 + (c & 255) * 0.11) * k)
  return pack(y, y, Math.min(255, y + 6))
}

// The window's top and bottom sky for an hour and weather; the palette holds all five weathers.
export function skyColors(hour: number, weather: Weather): readonly [number, number] {
  const h = quantizeHour(hour)
  const hi = SKY_KEYS.findIndex(k => k[0] > h)
  const [h0, t0, b0] = SKY_KEYS[hi - 1]!
  const [h1, t1, b1] = SKY_KEYS[hi]!
  const f = (h - h0) / (h1 - h0)
  const [amount, dim] = OVERCAST[weather]
  return [mix(mix(t0, t1, f), grey(mix(t0, t1, f), dim), amount), mix(mix(b0, b1, f), grey(mix(b0, b1, f), dim), amount)]
}

// ── Palette ────────────────────────────────────────────────────────

const d2 = (a: number, b: number): number => {
  const r = ((a >> 16) & 255) - ((b >> 16) & 255), g = ((a >> 8) & 255) - ((b >> 8) & 255), bl = (a & 255) - (b & 255)
  return r * r + g * g + bl * bl
}

const iotaCache: { arr: Int32Array } = { arr: new Int32Array(0) }
export const iota = (n: number): Int32Array => {
  if (n > iotaCache.arr.length) iotaCache.arr = Int32Array.from({ length: Math.max(n, 4096) }, (_, i) => i)
  return iotaCache.arr.subarray(0, n)
}

// Index of the nearest color; ties go to the lower index. Packed as dist*4096+i so one reduce finds both.
const nearest = (colors: Uint32Array, rgb: number): number => colors.reduce((best, c, i) => Math.min(best, d2(c, rgb) * 4096 + i), Infinity) % 4096

// An exact-hit table first, so a palette color always maps to itself. For anything else, a
// 32×32×32 lookup (5 bits a channel) of the nearest color, filled on first use: a frame
// touches a few thousand of the 32768 cells.
function makeSnap(colors: Uint32Array): (rgb: number) => number {
  const bits = Math.max(4, Math.ceil(Math.log2(colors.length * 2)))
  const mask = (1 << bits) - 1
  const table = new Int32Array(1 << bits).fill(-1)
  const probe = (key: number, i: number): number => (table[i] === -1 || table[i] === key ? i : probe(key, (i + 1) & mask))
  const home = (key: number): number => Math.imul(key, 0x9e3779b1) >>> (32 - bits)
  for (const c of colors) table[probe(c, home(c))] = c
  const lut = new Int32Array(32768).fill(-1)
  return rgb => {
    const key = rgb & 0xffffff
    if (table[probe(key, home(key))] === key) return key
    const cell = ((key >> 19) << 10) | (((key >> 11) & 31) << 5) | ((key >> 3) & 31)
    const hit = lut[cell]!
    if (hit >= 0) return colors[hit]!
    const i = nearest(colors, pack(((cell >> 10) << 3) | 4, (((cell >> 5) & 31) << 3) | 4, ((cell & 31) << 3) | 4))
    lut[cell] = i
    return colors[i]!
  }
}

const fromColors = (list: readonly number[]): FramePalette => {
  const colors = Uint32Array.from([...new Set(list)].sort((a, b) => a - b))
  return { colors, snap: makeSnap(colors) }
}

const CACHE_MAX = 16
const palettes = new Map<string, FramePalette>()

export function framePalette(theme: ThemeName, hour: number): FramePalette {
  const q = quantizeHour(hour)
  const key = `${theme}/${q}`
  const hit = palettes.get(key)
  if (hit) return hit
  const tint = tintFor(q)
  const base = [
    ...artColors(),
    ...TILE_PALETTE.map(h => parseInt(h.slice(1), 16)),
    ...[COLORS.void, COLORS.tvOff, COLORS.codeBg, ...COLORS.codeLines, COLORS.termBg, COLORS.termLine, COLORS.cloudLight, COLORS.cloudGrey, COLORS.cloudDark, COLORS.rain, COLORS.star, COLORS.flash, ...COLORS.particles],
    ...(['clear', 'clouds', 'rain', 'storm', 'lightning'] as const).flatMap(w => skyColors(q, w)),
  ]
  const lamps = isNight(q) ? Array.from({ length: LAMP_STEPS + 1 }, (_, k) => k) : [0]
  const p = fromColors(base.flatMap(c => lamps.map(k => lightColor(c, tint, theme, k))))
  if (palettes.size >= CACHE_MAX) palettes.delete(palettes.keys().next().value!)
  palettes.set(key, p)
  return p
}

const reduced = new WeakMap<FramePalette, Map<number, FramePalette>>()

// Farthest-point subset: start at the color nearest the mean, then keep adding the color
// farthest from everything chosen. Deterministic, and snapping to it can use at most n² pairs.
export function reducedPalette(p: FramePalette, n: number): FramePalette {
  if (n >= p.colors.length) return p
  const byN = reduced.get(p) ?? new Map<number, FramePalette>()
  reduced.set(p, byN)
  const hit = byN.get(n)
  if (hit) return hit
  const mean = pack(...([16, 8, 0] as const).map(s => Math.round(p.colors.reduce((a, c) => a + ((c >> s) & 255), 0) / p.colors.length)) as [number, number, number])
  const first = nearest(p.colors, mean)
  const chosen = [first]
  const minD = new Float64Array(p.colors.length).fill(Infinity)
  for (const _ of iota(n - 1)) {
    const last = p.colors[chosen[chosen.length - 1]!]!
    for (const i of iota(p.colors.length)) minD[i] = Math.min(minD[i]!, d2(p.colors[i]!, last))
    // farthest wins; the lower index wins a tie
    chosen.push(minD.reduce((best, d, i) => (d > minD[best]! ? i : best), 0))
  }
  const out = fromColors(chosen.map(i => p.colors[i]!))
  byN.set(n, out)
  return out
}
