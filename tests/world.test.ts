import { expect, test } from 'claude-code/testing'
import { defaultWorld, findPath, isWalkable, posKey, tileCenter, wallMask } from '../src/engine/world'

test('default office is 22x13 with a walkable door on the bottom wall', async () => {
  const w = defaultWorld()
  expect([w.cols, w.rows, w.tiles.length]).toEqual([22, 13, 13])
  expect(w.tiles.every(r => r.length === 22)).toBe(true)
  expect(w.door).toEqual({ col: 5, row: 12 })
  expect(isWalkable(w.tiles[12]![5]!)).toBe(true)
})

test('every seat is walkable and reachable from the door', async () => {
  const w = defaultWorld()
  for (const s of w.seats) {
    expect(isWalkable(w.tiles[s.row]![s.col]!)).toBe(true)
    expect(findPath(w, w.door, s, new Set()).length > 0).toBe(true)
  }
})

test('seats fill compactly: top-row work desks first, kitchen last; the playroom has four couches', async () => {
  const w = defaultWorld()
  expect(w.seats.slice(0, 3).map(s => [s.col, s.row])).toEqual([[3, 3], [6, 3], [9, 3]])
  expect(w.seats.length).toBe(11)
  expect(w.couches.map(c => [c.col, c.row])).toEqual([[14, 9], [15, 9], [18, 9], [19, 9]])
  expect(w.couches.every(c => isWalkable(w.tiles[c.row]![c.col]!))).toBe(true)
  expect([w.tiles[6]![16], w.tiles[6]![17], w.tv]).toEqual(['tv', 'gameConsole', { col: 16, row: 6 }])
  expect(w.seats[0]!.monitor).toEqual({ col: 4, row: 2 })
  expect(w.tiles[2]![4]).toBe('computer')
})

test('findPath is 4-connected BFS: excludes start, includes end, routes around blocked tiles', async () => {
  const w = defaultWorld()
  const from = { col: 1, row: 4 }, to = { col: 4, row: 4 }
  expect(findPath(w, from, to, new Set())).toEqual([{ col: 2, row: 4 }, { col: 3, row: 4 }, { col: 4, row: 4 }])
  expect(findPath(w, from, from, new Set())).toEqual([])
  expect(findPath(w, from, { col: 0, row: 0 }, new Set())).toEqual([])
  const around = findPath(w, from, to, new Set([posKey({ col: 3, row: 4 })]))
  expect(around.length).toBe(5)
  expect(around.some(t => t.col === 3 && t.row === 4)).toBe(false)
})

test('windows and the whiteboard sit in walls and autotile as wall', async () => {
  const w = defaultWorld()
  expect(w.windows.map(p => p.col)).toEqual([3, 6, 9, 15, 18])
  expect(w.whiteboard.map(p => [p.col, p.row])).toEqual([[14, 5], [15, 5], [16, 5]])
  for (const p of [...w.windows, ...w.whiteboard]) expect(isWalkable(w.tiles[p.row]![p.col]!)).toBe(false)
  expect(wallMask(w, 0, 0)).toBe(2 | 4)
  expect(wallMask(w, 3, 0) & (2 | 8)).toBe(2 | 8)
  expect(w.lounge.some(p => p.col === 15 && p.row === 6)).toBe(false)
  expect(w.coffee.length > 0 && w.kitchen.length > 0 && w.bookshelfSpots.length > 0).toBe(true)
})

test('tileCenter is the pixel center of a 16 px tile', async () => {
  expect(tileCenter({ col: 2, row: 3 })).toEqual({ x: 40, y: 56 })
})

test('couches are reachable, and the TV, console and coffee tables are solid', async () => {
  const w = defaultWorld()
  for (const c of w.couches) expect(findPath(w, w.door, c, new Set()).length > 0).toBe(true)
  for (const t of ['tv', 'gameConsole', 'coffeeTable'] as const) expect(isWalkable(t)).toBe(false)
  expect(isWalkable('couch')).toBe(true)
  expect(w.seats.map(s => s.id)).toEqual(['w1', 'w2', 'w3', 'w4', 'w5', 'w6', 'w7', 'w8', 'w9', 'k1', 'k2'])
  expect(w.seats.slice(9).every(s => s.monitor === undefined)).toBe(true)
})

test('findPath returns nothing when the goal is blocked, solid or off the map', async () => {
  const w = defaultWorld()
  const from = { col: 1, row: 4 }
  expect(findPath(w, from, { col: 3, row: 4 }, new Set([posKey({ col: 3, row: 4 })]))).toEqual([])
  expect(findPath(w, from, { col: 3, row: 2 }, new Set())).toEqual([])
  expect(findPath(w, from, { col: 99, row: 99 }, new Set())).toEqual([])
})

test('lounge, coffee and bookshelf spots are walkable and sit where they should', async () => {
  const w = defaultWorld()
  const all = [...w.lounge, ...w.coffee, ...w.bookshelfSpots, ...w.kitchen]
  expect(all.every(p => isWalkable(w.tiles[p.row]![p.col]!))).toBe(true)
  expect(w.lounge.every(p => w.tiles[p.row]![p.col] === 'rug')).toBe(true)
  expect(w.lounge.some(p => w.couches.some(c => c.col === p.col && c.row === p.row))).toBe(false)
  expect(w.coffee.map(p => [p.col, p.row])).toEqual([[15, 2], [16, 1], [19, 2], [18, 1]])
})
