import { expect, test } from 'claude-code/testing'
import { MAX_FOREIGN_BYTES, MAX_FOREIGN_SESSIONS, accountOf, asForeign, forShare, foreignAccount, pickForeign, sharedDir, sharedFolderName } from '../src/engine/shared'
import { parseSnapshot } from '../src/engine/snapshots'
import type { Agent, Snapshot } from '../src/engine/types'

const agent = (over: Partial<Agent> = {}): Agent => ({ id: 'main', kind: 'main', label: 'repo', activity: 'idle', since: 0, turnActive: false, inFlight: {}, ...over })
const snap = (over: Partial<Snapshot> = {}): Snapshot => ({
  v: 1, sessionId: 's1', name: 'api', cwd: '/Users/shidfar.hodizoda/code/api', startedAt: 0, updatedAt: 1000,
  context: { percent: 12 }, agents: [agent(), agent({ id: 'a1', kind: 'sub', label: 'explorer', parent: 'main' })], effects: [], nextEffectId: 1,
  stats: { day: '2026-10-05', tools: 1, edits: 2, commits: 3, permits: 4, errors: 5 }, ...over,
})
const file = (name: string, over: Partial<{ mtimeMs: number; size: number }> = {}) => ({ name, mtimeMs: 10_000_000, size: 100, ...over })
const NOW = 10_000_000

test('accountOf takes the last path part when it is a plain account name', async () => {
  expect(accountOf('/Users/shidfar.hodizoda')).toBe('shidfar.hodizoda')
  expect(accountOf('/Users/kevin/')).toBe('kevin')
  expect(accountOf('/')).toBe(null)
  expect(accountOf('')).toBe(null)
  expect(accountOf('/Users/Bad Name')).toBe(null)
  expect(accountOf('/Users/Kevin')).toBe(null)
  expect(accountOf(`/Users/${'a'.repeat(33)}`)).toBe(null)
  expect(accountOf(`/Users/${'a'.repeat(32)}`)).toBe('a'.repeat(32))
})

test('the shared folder and session directory are named after the account', async () => {
  expect(sharedFolderName('kevin')).toBe('pixel-agents-kevin')
  expect(sharedDir('kevin')).toBe('/Users/Shared/pixel-agents-kevin/sessions')
})

test('foreignAccount accepts another account folder and rejects everything else', async () => {
  expect(foreignAccount('pixel-agents-farshid', 'kevin')).toBe('farshid')
  expect(foreignAccount('pixel-agents-farshid', null)).toBe('farshid')
  expect(foreignAccount('pixel-agents-kevin', 'kevin')).toBe(null)
  expect(foreignAccount('pixel-agents-', 'kevin')).toBe(null)
  expect(foreignAccount('pixel-agents-../x', 'kevin')).toBe(null)
  expect(foreignAccount('pr-pilot-x', 'kevin')).toBe(null)
  expect(foreignAccount('pixel-agents-Farshid', 'kevin')).toBe(null)
  expect(foreignAccount('xpixel-agents-farshid', 'kevin')).toBe(null)
  expect(foreignAccount('pixel-agents-farshid\n', 'kevin')).toBe(null)
  expect(foreignAccount(`pixel-agents-${'a'.repeat(33)}`, 'kevin')).toBe(null)
})

test('forShare blanks cwd and changes nothing else', async () => {
  const s = snap()
  const shared = forShare(s)
  expect(shared.cwd).toBe('')
  expect(shared).toEqual({ ...s, cwd: '' })
  expect(s.cwd).toBe('/Users/shidfar.hodizoda/code/api')
})

test('asForeign prefixes the session id with the account', async () => {
  expect(asForeign(snap(), 'shidfar.hodizoda').sessionId).toBe('shidfar.hodizoda:s1')
})

test('asForeign names the session and its main agent short:name', async () => {
  const out = asForeign(snap(), 'shidfar.hodizoda')
  expect(out.name).toBe('shidfar:api')
  expect(out.agents[0]?.label).toBe('shidfar:api')
  expect(asForeign(snap(), 'farshid').name).toBe('farshid:api')
})

test('asForeign cuts a long name to 16 with an ellipsis, and the label follows the name, not the old label', async () => {
  const out = asForeign(snap({ name: 'a-very-long-session-name', agents: [agent({ label: 'old-label' })] }), 'shidfar.hodizoda')
  expect(out.name).toBe('shidfar:a-very-…')
  expect([...out.name]).toHaveLength(16)
  expect(out.agents[0]?.label).toBe(out.name)
})

test('asForeign leaves sub-agents, other fields and its input alone', async () => {
  const s = snap({ agents: [agent(), agent({ id: 'a1', kind: 'sub', label: 'explorer', parent: 'main' }), agent({ id: 't1', kind: 'teammate', label: 'mate' })] })
  const before = JSON.stringify(s)
  const out = asForeign(s, 'shidfar.hodizoda')
  expect(out.agents.map(a => a.label)).toEqual(['shidfar:api', 'explorer', 'mate'])
  expect(out.agents.slice(1)).toEqual(s.agents.slice(1))
  expect({ ...out, sessionId: s.sessionId, name: s.name, agents: s.agents }).toEqual(s)
  expect(JSON.stringify(s)).toBe(before)
})

test('asForeign output still parses as a snapshot', async () => {
  const out = asForeign(forShare(snap()), 'shidfar.hodizoda')
  expect(parseSnapshot(JSON.stringify(out))).toEqual(out)
})

test('pickForeign drops a bad name, an oversize file and a file older than one hour', async () => {
  const good = file('s1.json')
  const kept = pickForeign([
    good,
    file('s2.txt'), file('../s3.json'), file('s 4.json'), file('s5.json.json.bak'), file('.json'),
    file('big.json', { size: MAX_FOREIGN_BYTES + 1 }),
    file('old.json', { mtimeMs: NOW - 3_600_001 }),
  ], NOW)
  expect(kept).toEqual([good])
})

test('pickForeign keeps a file exactly one hour old and exactly at the size limit', async () => {
  const edge = [file('hour.json', { mtimeMs: NOW - 3_600_000 }), file('size.json', { size: MAX_FOREIGN_BYTES })]
  expect(pickForeign(edge, NOW).map(f => f.name).sort()).toEqual(['hour.json', 'size.json'])
})

test('pickForeign keeps the newest 50 of 60, newest first', async () => {
  const sixty = Array.from({ length: 60 }, (_, i) => file(`s${i}.json`, { mtimeMs: NOW - 60_000 + i * 1000 }))
  const kept = pickForeign([...sixty].reverse().sort((a, b) => a.mtimeMs - b.mtimeMs), NOW)
  expect(kept).toHaveLength(MAX_FOREIGN_SESSIONS)
  expect(kept.map(f => f.name)).toEqual(Array.from({ length: 50 }, (_, i) => `s${59 - i}.json`))
})

test('pickForeign returns the caller objects, keeps their extra fields, and does not reorder the input', async () => {
  const a = { ...file('a.json', { mtimeMs: NOW - 2000 }), dir: 'pixel-agents-x' }
  const b = { ...file('b.json', { mtimeMs: NOW - 1000 }), dir: 'pixel-agents-y' }
  const input = [a, b]
  const kept = pickForeign(input, NOW)
  expect(kept[0]).toBe(b)
  expect(kept[1]).toBe(a)
  expect(kept[0]?.dir).toBe('pixel-agents-y')
  expect(input).toEqual([a, b])
})
