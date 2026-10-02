// art.ts — sprites as packed pixels. 0x00RRGGBB is opaque, CLEAR is transparent and
// SKY_MASK marks window glass the renderer fills with sky. Sprites are cached and shared:
// callers read them, never write.
import { CHAR_PALETTES, CHAR_TEMPLATES, TILE_PALETTE, TILE_SPRITES } from './art.gen'
import type { Dir, Pose, Tile } from './types'

export const CLEAR = 0xff000000
export const SKY_MASK = 0xfe000000
export const OUTLINE = 0x111122
export const isOpaque = (px: number): boolean => px <= 0xffffff

const hex = (h: string): number => parseInt(h.slice(1), 16)
const PALETTE: readonly number[] = TILE_PALETTE.map(hex)

const memo = <K, V>(cache: Map<K, V>, key: K, make: () => V): V => {
  const hit = cache.get(key)
  if (hit !== undefined) return hit
  const v = make()
  cache.set(key, v)
  return v
}

const mirror = (px: Uint32Array, w: number): Uint32Array => px.map((_, i) => px[(i - (i % w)) + (w - 1 - (i % w))]!)

// One char per pixel; '.' is transparent.
const fromGrid = (rows: readonly string[], key: Readonly<Record<string, number>>): Uint32Array =>
  Uint32Array.from(rows.join(''), ch => (ch === '.' ? CLEAR : key[ch]!))

// Converted tiles: two hex chars per pixel into TILE_PALETTE, '..' transparent.
const fromHex = (rows: readonly string[]): Uint32Array =>
  Uint32Array.from({ length: 256 }, (_, i) => {
    const p = rows[i >> 4]!.slice((i & 15) * 2, (i & 15) * 2 + 2)
    return p === '..' ? CLEAR : PALETTE[parseInt(p, 16)]!
  })

// ── New art (exact grids from the plan) ────────────────────────────

const DOOR_CLOSED = [
  'ffffffffffffffff', 'fppppppppppppppf', 'fpqqqqqppqqqqqpf', 'fpqqqqqppqqqqqpf',
  'fpqqqqqppqqqqqpf', 'fpqqqqqppqqqqqpf', 'fppppppppppppppf', 'fppppppppppkpppf',
  'fppppppppppppppf', 'fpqqqqqppqqqqqpf', 'fpqqqqqppqqqqqpf', 'fpqqqqqppqqqqqpf',
  'fpqqqqqppqqqqqpf', 'fppppppppppppppf', 'fppppppppppppppf', 'ffffffffffffffff',
]
const DOOR_KEY = { f: 0x4a3a2e, p: 0x7a5230, q: 0x5c3a1e, k: 0xe0c060 }

// Shared by the window and the whiteboard frame.
const FRAME_KEY = { H: 0x5a5a7e, C: 0x4e4e70, F: 0x3a3a5c, d: 0x4a3a2e, m: 0x6b5a48, l: 0x8b7355, B: 0x252540, D: 0x1c1c34 }

const WINDOW = [
  'HHHHHHHHHHHHHHHH', 'CCCCCCCCCCCCCCCC', 'FddddddddddddddF', 'FdSSSSSmmSSSSSdF',
  'FdSSSSSmmSSSSSdF', 'FdSSSSSmmSSSSSdF', 'FdSSSSSmmSSSSSdF', 'FdmmmmmmmmmmmmdF',
  'FdSSSSSmmSSSSSdF', 'FdSSSSSmmSSSSSdF', 'FdSSSSSmmSSSSSdF', 'FdSSSSSmmSSSSSdF',
  'FddddddddddddddF', 'FllllllllllllllF', 'BBBBBBBBBBBBBBBB', 'DDDDDDDDDDDDDDDD',
]

// Row 2 ends in 'g', not 'F' as the plan's grid has it: wbMid is wbLeft minus its two left
// columns, repeated, so a trailing 'F' would leave a stray frame pixel in every middle tile.
const WB_LEFT = [
  'HHHHHHHHHHHHHHHH', 'CCCCCCCCCCCCCCCC', 'Fggggggggggggggg',
  ...Array.from({ length: 9 }, () => 'FgWWWWWWWWWWWWWW'),
  'Fggggggggggggggg', 'FFFFFFFFFFFFFFFF', 'BBBBBBBBBBBBBBBB', 'DDDDDDDDDDDDDDDD',
]
const WB_KEY = { ...FRAME_KEY, g: 0x9a9aa8, W: 0xe8ecf0 }
const WB_MID = WB_LEFT.map(r => Array.from({ length: 16 }, (_, c) => r.slice(2)[c % 14]!).join(''))

const CAT_KEY = { k: 0x3a3a44, w: 0xe8e8e8, e: 0x9be564, p: 0xf2a0b0, g: 0x6e6e7a }
const CAT_WALK1 = [
  '............', '.........k.k', 'k........kkk', 'k........kek', '.kkkkkkkkkkp',
  '..kkkkkkkkk.', '..kwkkkkwk..', '..k.k..k.k..', '..w.w..w.w..',
]
const CAT_WALK2 = [
  '............', '.........k.k', 'k........kkk', 'k........kek', '.kkkkkkkkkkp',
  '..kkkkkkkkk.', '..kwkkkkwk..', '...k.k.k.k..', '...w.w.w.w..',
]
const CAT_SIT = [
  '............', '......k.k...', '......kkk...', '......kek...', '......kkkp..',
  '....kkkkk...', '...kkkkkk...', '..kkwkkwk...', '..kkkkkkk...',
]
const CAT_SLEEP = [
  '............', '............', '............', '............', '....kkkkk...',
  '..kkkkkkkkk.', '.kkkkkkkgkk.', '.kwwkkkkkkk.', '..kkkkkkkk..',
]

const PLANE_KEY = { w: 0xf4f4f8, g: 0xa8a8b8 }
const PLANE = ['ww.....', '.wwww..', '..wwwww', '.gggg..', 'gg.....']

// ── Tiles ──────────────────────────────────────────────────────────

const tiles = new Map<string, Uint32Array>()

export function tileSprite(name: Tile | 'doorClosed' | 'wbLeft' | 'wbMid' | 'wbRight'): Uint32Array {
  return memo(tiles, name, () => {
    switch (name) {
      case 'doorClosed': return fromGrid(DOOR_CLOSED, DOOR_KEY)
      case 'window': return fromGrid(WINDOW, { ...FRAME_KEY, S: SKY_MASK })
      case 'wbLeft': return fromGrid(WB_LEFT, WB_KEY)
      case 'wbRight': return mirror(tileSprite('wbLeft'), 16)
      case 'wbMid':
      case 'whiteboard': return fromGrid(WB_MID, WB_KEY)
      default: return fromHex(TILE_SPRITES[name]!)
    }
  })
}

// ── Walls, ported from the Go buildAutoWall ────────────────────────

const WALL = { hl: 0x5a5a7e, cap: 0x4e4e70, face: 0x3a3a5c, mort: 0x444466, dark: 0x2e2e48, base: 0x252540, deep: 0x1c1c34, edge: 0x2a2a44 }
const walls = new Map<number, Uint32Array>()

// mask: N=1 E=2 S=4 W=8, set bit = that neighbor is wall. Exposed sides get a lit cap,
// a base shadow or an inset edge, so the room reads as having depth.
export function wallSprite(mask: number): Uint32Array {
  const m = mask & 15
  return memo(walls, m, () => {
    const noN = (m & 1) === 0, noE = (m & 2) === 0, noS = (m & 4) === 0, noW = (m & 8) === 0
    return Uint32Array.from({ length: 256 }, (_, i) => {
      const r = i >> 4, c = i & 15
      if (noN && r === 0 && c === 0 && noW) return WALL.deep
      if (noN && r === 0 && c === 15 && noE) return WALL.deep
      if (noS && r === 15 && c === 0 && noW) return WALL.deep
      if (noS && r === 15 && c === 15 && noE) return WALL.deep
      if (noW && c === 0) return WALL.edge
      if (noE && c === 15) return WALL.edge
      if (noN && r === 0) return WALL.hl
      if (noN && (r === 1 || r === 2)) return WALL.cap
      if (noS && r === 13) return WALL.dark
      if (noS && r === 14) return WALL.base
      if (noS && r === 15) return WALL.deep
      const brick = r === 5 || r === 11 || (c === 7 && r > 0 && r < 5) || (c === 3 && r > 5 && r < 11) || (c === 11 && r > 11 && r < 15)
      return brick ? WALL.mort : WALL.face
    })
  })
}

// ── Characters ─────────────────────────────────────────────────────

const CHAR_W = 16
const CHAR_H = 24
const DIR_NAME = { down: 'Down', up: 'Up', left: 'Right', right: 'Right' } as const
// walk1, walk2, walk3, walk2: the Go init's frame order
const WALK_ORDER = [1, 2, 3, 2] as const

const KEY_SLOT = { H: 'hair', K: 'skin', S: 'shirt', P: 'pants', O: 'shoes' } as const

const resolve = (rows: readonly string[], pal: (typeof CHAR_PALETTES)[number]): Uint32Array =>
  Uint32Array.from(rows.join(''), ch => (ch === '.' ? CLEAR : ch === 'E' ? 0xffffff : hex(pal[KEY_SLOT[ch as keyof typeof KEY_SLOT]])))

// Grow the silhouette by one pixel inside the canvas, twice: a 1 px ring is sampled only now
// and then at fit scale, 2 px always shows.
const outline1 = (px: Uint32Array): Uint32Array =>
  px.map((p, i) => {
    if (isOpaque(p)) return p
    const x = i % CHAR_W, y = (i / CHAR_W) | 0
    const near = (x > 0 && isOpaque(px[i - 1]!)) || (x < CHAR_W - 1 && isOpaque(px[i + 1]!)) || (y > 0 && isOpaque(px[i - CHAR_W]!)) || (y < CHAR_H - 1 && isOpaque(px[i + CHAR_W]!))
    return near ? OUTLINE : CLEAR
  })

type CharSprite = { readonly w: 16; readonly h: 24; readonly px: Uint32Array }
const chars = new Map<string, CharSprite>()
const POSES: readonly Pose[] = ['stand', 'walk', 'type', 'read']
const DIRS: readonly Dir[] = ['down', 'left', 'right', 'up']

// 'stand' is the first walk frame, as in the Go version.
const templateName = (pose: Pose, dir: Dir, frame: number): string => {
  const d = DIR_NAME[dir]
  const n = (k: number) => Math.abs(Math.trunc(frame)) % k
  switch (pose) {
    case 'walk': return `walk${d}${WALK_ORDER[n(4)]}`
    case 'type': return `${d[0]!.toLowerCase()}${d.slice(1)}Type${n(2) + 1}`
    case 'read': return `${d[0]!.toLowerCase()}${d.slice(1)}Read${n(2) + 1}`
    default: return `walk${d}1`
  }
}

export function charSprite(palette: number, pose: Pose, dir: Dir, frame: number): CharSprite {
  const pal = ((Math.trunc(palette) % CHAR_PALETTES.length) + CHAR_PALETTES.length) % CHAR_PALETTES.length
  const name = templateName(pose, dir, frame)
  return memo(chars, `${pal}/${name}/${dir === 'left' ? 'l' : 'r'}`, () => {
    const raw = resolve(CHAR_TEMPLATES[name]!, CHAR_PALETTES[pal]!)
    const px = outline1(outline1(dir === 'left' ? mirror(raw, CHAR_W) : raw))
    return { w: CHAR_W, h: CHAR_H, px }
  })
}

// ── Cat and planes ─────────────────────────────────────────────────

type Sprite<W extends number, H extends number> = { readonly w: W; readonly h: H; readonly px: Uint32Array }
const small = new Map<string, Uint32Array>()

const CAT_ROWS = { walk: [CAT_WALK1, CAT_WALK2], sit: [CAT_SIT], sleep: [CAT_SLEEP] } as const

// Left is the mirror of right. Up and down reuse the right-facing art: the sprite sizes are fixed.
export function catSprite(pose: 'walk' | 'sit' | 'sleep', dir: Dir, frame: number): Sprite<12, 9> {
  const f = pose === 'walk' ? Math.abs(Math.trunc(frame)) % 2 : 0
  const px = memo(small, `cat/${pose}/${f}/${dir === 'left' ? 'l' : 'r'}`, () => {
    const right = fromGrid(CAT_ROWS[pose][f]!, CAT_KEY)
    return dir === 'left' ? mirror(right, 12) : right
  })
  return { w: 12, h: 9, px }
}

export function planeSprite(dir: Dir): Sprite<7, 5> {
  const px = memo(small, `plane/${dir === 'left' ? 'l' : 'r'}`, () => {
    const right = fromGrid(PLANE, PLANE_KEY)
    return dir === 'left' ? mirror(right, 7) : right
  })
  return { w: 7, h: 5, px }
}

// ── Every color the art can paint, for the palette ─────────────────

const TILE_NAMES: readonly (Tile | 'doorClosed' | 'wbLeft' | 'wbMid' | 'wbRight')[] = [
  ...(Object.keys(TILE_SPRITES) as Tile[]), 'window', 'whiteboard', 'doorClosed', 'wbLeft', 'wbMid', 'wbRight',
]

const colorCache: { all: readonly number[] | null } = { all: null }

export function artColors(): readonly number[] {
  if (colorCache.all) return colorCache.all
  const all = [
    ...TILE_NAMES.flatMap(n => [...tileSprite(n)]),
    ...Array.from({ length: 16 }, (_, m) => [...wallSprite(m)]).flat(),
    ...CHAR_PALETTES.flatMap((_, p) => POSES.flatMap(pose => DIRS.flatMap(dir => Array.from({ length: 4 }, (_, f) => [...charSprite(p, pose, dir, f).px]).flat()))),
    ...(['walk', 'sit', 'sleep'] as const).flatMap(pose => [0, 1].flatMap(f => [...catSprite(pose, 'right', f).px])),
    ...planeSprite('right').px,
  ]
  colorCache.all = [...new Set(all.filter(isOpaque))].sort((a, b) => a - b)
  return colorCache.all
}
