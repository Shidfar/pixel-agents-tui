// world.ts — the one built-in office: layout, seats, zones, BFS paths.
// Const data plus pure functions; no state, no I/O.
import { TILE } from './types'
import type { Seat, Tile, TilePos, World } from './types'

type Tiles = readonly (readonly Tile[])[]

// 22x13: work area left, kitchen top-right, playroom bottom-right. The playroom branch's
// layout, plus windows in the top wall and a whiteboard in the kitchen/playroom wall.
const buildTiles = (): Tiles => {
  const W: Tile = 'wall', WN: Tile = 'window', WB: Tile = 'whiteboard'
  const a: Tile = 'floor1', b: Tile = 'floor2', c: Tile = 'floor3', d: Tile = 'floor4'
  const D: Tile = 'desk', C: Tile = 'computer', B: Tile = 'bookshelf', P: Tile = 'plant', H: Tile = 'chair'
  const R: Tile = 'rug', K: Tile = 'counter', A: Tile = 'appliance', G: Tile = 'door'
  const SC: Tile = 'couch', TV: Tile = 'tv', CT: Tile = 'coffeeTable', GC: Tile = 'gameConsole'
  return [
    //0  1  2  3   4  5  6   7  8  9   10 11 12 13 14  15  16  17 18  19 20 21
    [W, W, W, WN, W, W, WN, W, W, WN, W, W, W, W, W, WN, W, W, WN, W, W, W],
    [W, B, B, a, b, a, b, a, B, B, a, b, W, K, K, A, c, d, c, A, K, W],
    [W, P, a, D, C, b, D, C, a, D, C, b, W, c, d, c, d, c, d, c, d, W],
    [W, a, b, H, a, b, H, a, b, H, b, a, W, c, d, c, d, c, d, c, d, W],
    [W, b, a, b, a, b, a, b, a, b, a, b, a, c, d, c, d, c, d, c, d, W],
    [W, a, b, D, C, a, D, C, b, D, C, a, W, W, WB, WB, WB, W, a, W, W, W],
    [W, P, a, H, b, a, H, b, a, H, a, P, W, R, R, R, TV, GC, R, R, P, W],
    [W, a, b, a, b, a, a, b, a, b, a, b, a, R, R, R, R, R, R, R, R, W],
    [W, b, a, D, C, b, D, C, a, D, C, b, W, R, R, CT, R, R, CT, R, R, W],
    [W, a, b, H, a, b, H, a, b, H, b, a, W, R, SC, SC, R, R, SC, SC, R, W],
    [W, P, a, b, a, b, a, b, a, b, a, P, W, R, R, R, R, R, R, R, P, W],
    [W, B, B, a, b, a, b, a, B, B, a, b, W, B, B, R, R, R, R, B, B, W],
    [W, W, W, W, W, G, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W],
  ]
}

// Work seats first, nearest the top-left first; the kitchen standing spots last.
const SEATS: readonly Seat[] = [
  { id: 'w1', col: 3, row: 3, facing: 'up', zone: 'work', monitor: { col: 4, row: 2 } },
  { id: 'w2', col: 6, row: 3, facing: 'up', zone: 'work', monitor: { col: 7, row: 2 } },
  { id: 'w3', col: 9, row: 3, facing: 'up', zone: 'work', monitor: { col: 10, row: 2 } },
  { id: 'w4', col: 3, row: 6, facing: 'up', zone: 'work', monitor: { col: 4, row: 5 } },
  { id: 'w5', col: 6, row: 6, facing: 'up', zone: 'work', monitor: { col: 7, row: 5 } },
  { id: 'w6', col: 9, row: 6, facing: 'up', zone: 'work', monitor: { col: 10, row: 5 } },
  { id: 'w7', col: 3, row: 9, facing: 'up', zone: 'work', monitor: { col: 4, row: 8 } },
  { id: 'w8', col: 6, row: 9, facing: 'up', zone: 'work', monitor: { col: 7, row: 8 } },
  { id: 'w9', col: 9, row: 9, facing: 'up', zone: 'work', monitor: { col: 10, row: 8 } },
  { id: 'k1', col: 16, row: 3, facing: 'up', zone: 'kitchen' },
  { id: 'k2', col: 18, row: 3, facing: 'up', zone: 'kitchen' },
]

// Break spots, not work seats: idle agents sit here facing the TV.
const COUCHES: readonly Seat[] = [
  { id: 'p1', col: 14, row: 9, facing: 'up', zone: 'playroom' },
  { id: 'p2', col: 15, row: 9, facing: 'up', zone: 'playroom' },
  { id: 'p3', col: 18, row: 9, facing: 'up', zone: 'playroom' },
  { id: 'p4', col: 19, row: 9, facing: 'up', zone: 'playroom' },
]

const WHITEBOARD_SPOT: TilePos = { col: 15, row: 6 }

// Neighbor order matters: it fixes which of several equal-length paths BFS returns.
export const DIRS: readonly TilePos[] = [{ col: 0, row: -1 }, { col: 0, row: 1 }, { col: -1, row: 0 }, { col: 1, row: 0 }]

const WALKABLE = new Set<Tile>(['floor1', 'floor2', 'floor3', 'floor4', 'floor5', 'floor6', 'floor7', 'chair', 'rug', 'door', 'couch'])
const WALL_LIKE = new Set<Tile>(['wall', 'window', 'whiteboard'])

export function posKey(p: TilePos): string {
  return `${p.col},${p.row}`
}

export function isWalkable(t: Tile): boolean {
  return WALKABLE.has(t)
}

const at = (tiles: Tiles, p: TilePos): Tile | undefined => tiles[p.row]?.[p.col]

const NOT_BLOCKED: ReadonlySet<string> = new Set()

export const open = (tiles: Tiles, p: TilePos, blocked: ReadonlySet<string>): boolean => {
  const t = at(tiles, p)
  return t !== undefined && isWalkable(t) && !blocked.has(posKey(p))
}

// Every tile for which `is` holds, row by row, left to right.
export const where = (tiles: Tiles, is: (t: Tile) => boolean): TilePos[] =>
  tiles.flatMap((r, row) => r.flatMap((t, col) => (is(t) ? [{ col, row }] : [])))

// Walkable tiles next to a tile of the wanted kind, each listed once.
const beside = (tiles: Tiles, is: (t: Tile) => boolean): TilePos[] =>
  where(tiles, is)
    .flatMap(p => DIRS.map(d => ({ col: p.col + d.col, row: p.row + d.row })))
    .filter(n => open(tiles, n, NOT_BLOCKED))
    .filter((n, i, all) => all.findIndex(m => posKey(m) === posKey(n)) === i)

export function defaultWorld(): World {
  const tiles = buildTiles()
  const taken = new Set([...SEATS, ...COUCHES, WHITEBOARD_SPOT].map(posKey))
  return {
    cols: tiles[0]!.length,
    rows: tiles.length,
    tiles,
    seats: SEATS,
    couches: COUCHES,
    tv: where(tiles, t => t === 'tv')[0]!,
    door: where(tiles, t => t === 'door')[0]!,
    kitchen: where(tiles, t => t === 'floor3' || t === 'floor4'),
    lounge: where(tiles, t => t === 'rug').filter(p => !taken.has(posKey(p))),
    bookshelfSpots: beside(tiles, t => t === 'bookshelf'),
    coffee: beside(tiles, t => t === 'appliance'),
    windows: where(tiles, t => t === 'window'),
    whiteboard: where(tiles, t => t === 'whiteboard'),
    whiteboardSpot: WHITEBOARD_SPOT,
  }
}

export function tileAt(w: World, p: TilePos): Tile | undefined {
  return at(w.tiles, p)
}

// 4-connected BFS, level by level so the visit order matches a FIFO queue.
// Excludes `from`, includes `to`; [] when there is no way or nothing to do.
export function findPath(w: World, from: TilePos, to: TilePos, blocked: ReadonlySet<string>): TilePos[] {
  const start = posKey(from), goal = posKey(to)
  if (start === goal || !open(w.tiles, to, blocked)) return []
  const seen = new Set([start])
  const parent = new Map<string, TilePos>()
  const back = (p: TilePos): TilePos[] => (posKey(p) === start ? [] : [...back(parent.get(posKey(p))!), p])
  const sweep = (frontier: readonly TilePos[]): TilePos[] => {
    if (frontier.length === 0) return []
    const next: TilePos[] = []
    for (const cur of frontier) {
      for (const d of DIRS) {
        const n = { col: cur.col + d.col, row: cur.row + d.row }
        const k = posKey(n)
        if (seen.has(k) || !open(w.tiles, n, blocked)) continue
        seen.add(k)
        parent.set(k, cur)
        if (k === goal) return back(n)
        next.push(n)
      }
    }
    return sweep(next)
  }
  return sweep([from])
}

// Which of the four neighbors is wall-like: N=1 E=2 S=4 W=8. Off the map counts as open.
export function wallMask(w: World, col: number, row: number): number {
  const wall = (c: number, r: number) => {
    const t = w.tiles[r]?.[c]
    return t !== undefined && WALL_LIKE.has(t)
  }
  return (wall(col, row - 1) ? 1 : 0) | (wall(col + 1, row) ? 2 : 0) | (wall(col, row + 1) ? 4 : 0) | (wall(col - 1, row) ? 8 : 0)
}

export function tileCenter(p: TilePos): { readonly x: number; readonly y: number } {
  return { x: p.col * TILE + TILE / 2, y: p.row * TILE + TILE / 2 }
}
