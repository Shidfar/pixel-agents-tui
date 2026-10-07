import { expect, test } from 'claude-code/testing'
import { createRng, hashString } from '../src/engine/rng'
import { asForeign } from '../src/engine/shared'
import { aggregateStats, alertsFor, isForeign, isStale, isStateFile, parseSnapshot, parseStateFile, sanitizeText, sessionName } from '../src/engine/snapshots'
import type { Agent, Snapshot } from '../src/engine/types'
import { agent } from './fixtures'

const snap = (over: Partial<Snapshot> = {}): Snapshot => ({
  v: 1, sessionId: 's1', name: 'repo', cwd: '/w/repo', startedAt: 0, updatedAt: 1000,
  context: { percent: null }, agents: [agent()], effects: [], nextEffectId: 1,
  stats: { day: '2026-10-02', tools: 1, edits: 2, commits: 3, permits: 4, errors: 5 }, ...over,
})

test('rng is deterministic per seed and stays in range', async () => {
  const a = createRng(7), b = createRng(7)
  const xs = Array.from({ length: 50 }, () => a.next())
  expect(xs).toEqual(Array.from({ length: 50 }, () => b.next()))
  expect(xs.every(x => x >= 0 && x < 1)).toBe(true)
  const r = createRng(1)
  expect(Array.from({ length: 200 }, () => r.int(2, 4)).every(n => n >= 2 && n <= 4)).toBe(true)
  expect(hashString('abc')).toBe(0x1a47e90b)
})

test('parseSnapshot accepts a v1 snapshot and rejects garbage, other versions and torn JSON', async () => {
  const text = JSON.stringify(snap())
  expect(parseSnapshot(text)?.sessionId).toBe('s1')
  expect(parseSnapshot('not json')).toBe(null)
  expect(parseSnapshot(JSON.stringify({ ...snap(), v: 2 }))).toBe(null)
  expect(parseSnapshot(text.slice(0, text.length - 5))).toBe(null)
  expect(parseSnapshot(JSON.stringify({ ...snap(), agents: 'nope' }))).toBe(null)
})

test('a session is stale when it ended or went quiet for 20 s', async () => {
  expect(isStale(snap({ updatedAt: 1000 }), 20_999)).toBe(false)
  expect(isStale(snap({ updatedAt: 1000 }), 21_001)).toBe(true)
  expect(isStale(snap({ endedAt: 900 }), 1000)).toBe(true)
})

test('alerts list other live sessions waiting on the user, never your own', async () => {
  const waiting = agent({ activity: 'permission', waiting: { kind: 'permission', tool: 'Bash', detail: 'Bash: npm publish', at: 500 } })
  const other = snap({ sessionId: 's2', name: 'api', agents: [waiting] })
  const mine = snap({ sessionId: 's1', agents: [waiting] })
  const dead = snap({ sessionId: 's3', agents: [waiting], endedAt: 10 })
  expect(alertsFor([other, mine, dead], 's1', 2000)).toEqual([{ sessionId: 's2', name: 'api', kind: 'permission', detail: 'Bash: npm publish', at: 500 }])
})

test('another account\'s wait never alerts, in any call', async () => {
  const waiting = agent({ activity: 'permission', waiting: { kind: 'permission', tool: 'Bash', detail: 'Bash: npm publish', at: 500 } })
  const theirs = asForeign(snap({ sessionId: 's2', agents: [waiting] }), 'alex')
  const mine = snap({ sessionId: 's3', agents: [waiting] })
  expect([isForeign(theirs), isForeign(mine)]).toEqual([true, false])
  expect(alertsFor([theirs], null, 2000)).toEqual([])
  expect(alertsFor([theirs, mine], 's1', 2000).map(a => a.sessionId)).toEqual(['s3'])
})

test('aggregateStats sums only the given day', async () => {
  const today = aggregateStats([snap(), snap({ sessionId: 's2' }), snap({ stats: { day: '2026-10-01', tools: 99, edits: 0, commits: 0, permits: 0, errors: 0 } })], '2026-10-02')
  expect(today).toEqual({ day: '2026-10-02', tools: 2, edits: 4, commits: 6, permits: 8, errors: 10 })
})

test('sessionName prefers the repo root and numbers duplicates', async () => {
  expect(sessionName('/a/b/repo/src', '/a/b/repo', [])).toBe('repo')
  expect(sessionName('/a/b/plain', null, [])).toBe('plain')
  expect(sessionName('/a/b/repo', null, ['repo'])).toBe('repo-2')
  expect(sessionName('/a/b/repo', null, ['repo', 'repo-2'])).toBe('repo-3')
  expect(sessionName('/', null, [])).toBe('session')
})

test('sanitizeText keeps width-1 cell characters only and truncates with an ellipsis', async () => {
  expect(sanitizeText('héllo ✓ wörld', 40)).toBe('h?llo ✓ w?rld')
  expect(sanitizeText('abcdefghij', 5)).toBe('abcd…')
  expect(sanitizeText('tab\there', 20)).toBe('tab?here')
})

test('parseSnapshot rejects an agent without an inFlight object, and null or array stats', async () => {
  expect(parseSnapshot(JSON.stringify(snap({ agents: [{ id: 'main', activity: 'idle' } as unknown as Agent] })))).toBe(null)
  expect(parseSnapshot(JSON.stringify({ ...snap(), stats: null }))).toBe(null)
  expect(parseSnapshot(JSON.stringify({ ...snap(), stats: [] }))).toBe(null)
  expect(parseSnapshot('null')).toBe(null)
})

test('sanitizeText counts an emoji as one cell and handles tiny limits', async () => {
  expect(sanitizeText('a😀b', 10)).toBe('a?b')
  expect(sanitizeText('abc', 1)).toBe('…')
  expect(sanitizeText('abc', 0)).toBe('')
  expect(sanitizeText('abc', 3)).toBe('abc')
})

test('parseSnapshot rejects a missing, null or non-object context', async () => {
  const { context: _dropped, ...noContext } = snap()
  expect(parseSnapshot(JSON.stringify(noContext))).toBe(null)
  expect(parseSnapshot(JSON.stringify({ ...snap(), context: null }))).toBe(null)
  expect(parseSnapshot(JSON.stringify({ ...snap(), context: 42 }))).toBe(null)
})

test('parseSnapshot rejects an agent whose label is missing or not a string', async () => {
  const { label: _dropped, ...noLabel } = agent()
  expect(parseSnapshot(JSON.stringify(snap({ agents: [noLabel as unknown as Agent] })))).toBe(null)
  expect(parseSnapshot(JSON.stringify(snap({ agents: [agent({ label: 7 as unknown as string })] })))).toBe(null)
})

test('isStateFile takes a plain session id plus .json and nothing looser', async () => {
  expect(['s1.json', 'A-b-9.json'].every(isStateFile)).toBe(true)
  expect(['.json', 's1.txt', 's 1.json', '../s1.json', 's1.json.bak', 's1.json\n', 'a:b.json'].some(isStateFile)).toBe(false)
})

test('parseStateFile keeps a file only when the session id inside is the file name', async () => {
  const text = JSON.stringify(snap())
  expect(parseStateFile('s1.json', text)?.sessionId).toBe('s1')
  expect(parseStateFile('s2.json', text)).toBe(null)
  expect(parseStateFile('s1.json', 'not json')).toBe(null)
  expect(parseStateFile('s1.txt', text)).toBe(null)
  expect(parseStateFile('a b.json', JSON.stringify(snap({ sessionId: 'a b' })))).toBe(null)
})
