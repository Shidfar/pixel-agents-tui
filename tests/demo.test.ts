import { expect, test } from 'claude-code/testing'
import { demoSnapshots } from '../src/engine/demo'
import { parseSnapshot } from '../src/engine/snapshots'
import { activityOf } from '../src/engine/truth'

const at = (sec: number) => demoSnapshots(1_000_000 + sec * 1000, 1_000_000, '2026-10-02')

test('four named demo sessions that survive a JSON round trip', async () => {
  const snaps = at(0)
  expect(snaps.map(s => s.name)).toEqual(['api-service', 'web-app', 'infra', 'docs'])
  for (const s of snaps) expect(parseSnapshot(JSON.stringify(s))?.sessionId).toBe(s.sessionId)
})

test('the script shows a permission wait, interns coming and going, and celebrations', async () => {
  const frames = Array.from({ length: 60 }, (_, i) => at(i))
  const all = frames.flat()
  expect(all.some(s => s.agents.some(a => a.activity === 'permission'))).toBe(true)
  expect(frames[12]!.find(s => s.name === 'web-app')!.agents.filter(a => a.kind === 'sub').length).toBe(2)
  expect(frames[50]!.find(s => s.name === 'web-app')!.agents.filter(a => a.kind === 'sub' && a.doneAt != null).length).toBe(2)
  const kindsSeen = new Set(all.flatMap(s => s.effects.map(e => e.kind)))
  for (const k of ['commit', 'testPass', 'testFail', 'spawn', 'message']) expect(kindsSeen.has(k as never)).toBe(true)
})

test('deterministic, live, and effect ids keep increasing across cycles', async () => {
  expect(JSON.stringify(at(17))).toBe(JSON.stringify(at(17)))
  expect(at(17)[0]!.updatedAt).toBe(1_000_000 + 17_000)
  const lastId = (sec: number) => Math.max(0, ...at(sec)[0]!.effects.map(e => e.id))
  expect(lastId(119) > lastId(59)).toBe(true)
})

// ── Beyond the plan ────────────────────────────────────────────────

test('docs plans first, then writes, and its context climbs from 10 to 95', async () => {
  const docs = (sec: number) => at(sec).find(s => s.name === 'docs')!
  expect([docs(0).agents[0]!.activity, docs(31).agents[0]!.activity, docs(42).agents[0]!.activity, docs(55).agents[0]!.activity]).toEqual(['idle', 'planning', 'typing', 'idle'])
  const pct = Array.from({ length: 60 }, (_, i) => docs(i).context.percent!)
  expect([pct[0], pct[59]]).toEqual([10, 95])
  expect(pct.every((p, i) => i === 0 || p >= pct[i - 1]!)).toBe(true)
})

test('every second of the cycle is internally consistent', async () => {
  const frames = Array.from({ length: 125 }, (_, i) => at(i))
  const ok = frames.every(snaps => snaps.every(s => s.agents.every(a => a.activity === activityOf(a)) && s.effects.every((e, i) => i === 0 || e.id > s.effects[i - 1]!.id)))
  expect(ok).toBe(true)
  expect(frames.flat().every(s => s.v === 1 && s.endedAt === undefined && s.stats.day === '2026-10-02')).toBe(true)
})

test('a new cycle starts every session fresh', async () => {
  const start = at(60)
  expect(start.every(s => s.effects.length === 0 && s.agents.length === 1)).toBe(true)
  expect(start.map(s => s.startedAt)).toEqual([1_060_000, 1_060_000, 1_060_000, 1_060_000])
})
