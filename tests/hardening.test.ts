// A bad state file must never crash a viewer: parseSnapshot returns null, or what it returns is safe
// to hand to the sim, the camera, the renderer and the alert/stat helpers.
import { expect, test } from 'claude-code/testing'
import { demoSnapshots } from '../src/engine/demo'
import { toCells, updateCamera } from '../src/engine/render'
import { createRng, type Rng } from '../src/engine/rng'
import { createSim } from '../src/engine/sim'
import { aggregateStats, alertsFor, parseSnapshot } from '../src/engine/snapshots'
import { initialSnapshot, reduce } from '../src/engine/truth'
import { DEFAULT_PREFS, type Activity, type AgentKind, type EffectKind, type Snapshot, type TruthEvent } from '../src/engine/types'
import { defaultWorld } from '../src/engine/world'

type Bare = TruthEvent extends infer E ? (E extends { readonly now: number } ? Omit<E, 'now'> : never) : never

const world = defaultWorld()
const DAY = '2026-10-02'
const T0 = 1_000_000
const at = (sec: number): Snapshot[] => demoSnapshots(T0 + sec * 1000, T0, DAY)
// Chosen to straddle the demo's spawns, messages, commits, failures and departures, so a mutated
// snapshot meets a sim that has already seen the one before it (effects only play on a later sync).
const SECONDS = [0, 5, 11, 16, 24, 36, 41, 45, 50, 56]
const FRAMES = SECONDS.map(at)

// ── The viewer paths a snapshot has to survive ─────────────────────

const view = (prior: readonly Snapshot[], next: readonly Snapshot[], self: string | null, nowSec: number): void => {
  const input = (snapshots: readonly Snapshot[], sec: number) => ({ snapshots, selfSessionId: self, now: T0 + sec * 1000, localHour: 12, day: DAY })
  const sim = createSim(world, 1)
  const run = (): void => Array.from({ length: 3 }).forEach(() => sim.step(0.1))
  sim.sync(input(prior, nowSec - 5))
  run()
  sim.sync(input(next, nowSec))
  run()
  const scene = sim.scene()
  for (const mode of ['fit', 'auto'] as const) {
    const cam = updateCamera(null, world, scene, { cols: 89, rows: 41 }, mode, 0)
    toCells(world, scene, DEFAULT_PREFS, updateCamera(cam, world, scene, { cols: 89, rows: 41 }, mode, 0.1), 89, 41)
  }
  alertsFor(next, self, T0 + nowSec * 1000)
  aggregateStats(next, DAY)
}

// ── Random structural mutations ────────────────────────────────────

type Key = string | number
type Doc = Record<Key, unknown>
const KINDS = ['null', 'number', 'nan', 'string', 'array', 'object', 'enum', 'delete'] as const
type Kind = (typeof KINDS)[number]

// Every nested value below the root, as a key path.
const pathsOf = (x: unknown, here: readonly Key[] = []): (readonly Key[])[] => {
  const kids = typeof x === 'object' && x !== null
    ? Object.entries(x).flatMap(([k, v]) => pathsOf(v, [...here, Array.isArray(x) ? Number(k) : k]))
    : []
  return here.length > 0 ? [here, ...kids] : kids
}

const replacement = (kind: Exclude<Kind, 'delete'>, rng: Rng): unknown => {
  switch (kind) {
    case 'null': return null
    case 'number': return rng.pick([0, -1, 7, 1.5, 1e12])
    case 'nan': return 'NaN'
    case 'string': return rng.pick(['x', '3', ''])
    case 'array': return []
    case 'object': return {}
    case 'enum': return 'dancing'
  }
}

const mutate = (root: Doc, path: readonly Key[], kind: Kind, rng: Rng): void => {
  const parent = path.slice(0, -1).reduce<Doc>((o, k) => o[k] as Doc, root)
  const key = path[path.length - 1]!
  if (kind !== 'delete') parent[key] = replacement(kind, rng)
  else if (Array.isArray(parent)) parent.splice(Number(key), 1)
  else delete parent[key]
}

test('fuzz: a mutated state file is rejected, or every viewer path runs without throwing', async () => {
  const rng = createRng(20261002)
  const CASES = 4000
  const outcomes = Array.from({ length: CASES }, () => {
    const j = rng.int(1, FRAMES.length - 1)
    const n = rng.int(0, 3)
    const doc = JSON.parse(JSON.stringify(FRAMES[j]![n])) as Doc
    mutate(doc, rng.pick(pathsOf(doc)), rng.pick(KINDS), rng)
    const text = JSON.stringify(doc)
    const parsed = parseSnapshot(text)
    if (parsed === null) return { text, rejected: true, crash: null }
    const next = FRAMES[j]!.map((s, k) => (k === n ? parsed : s))
    try {
      view(FRAMES[j - 1]!, next, rng.next() < 0.5 ? parsed.sessionId : next[(n + 1) % 4]!.sessionId, SECONDS[j]!)
      return { text, rejected: false, crash: null }
    } catch (e) {
      return { text, rejected: false, crash: e instanceof Error ? e.message : String(e) }
    }
  })
  const crashed = outcomes.filter(o => o.crash !== null)
  // The fuzz must exercise both outcomes, or it proves nothing.
  expect(outcomes.filter(o => o.rejected).length > 300).toBe(true)
  expect(outcomes.filter(o => !o.rejected).length > 300).toBe(true)
  expect({ crashed: crashed.length, of: CASES, first: crashed.slice(0, 3) }).toEqual({ crashed: 0, of: CASES, first: [] })
})

// ── Named regressions ──────────────────────────────────────────────

const base = initialSnapshot({ sessionId: 's1', name: 'repo', cwd: '/w/repo', now: 1000, day: DAY })
const main = base.agents[0]!
const parseWith = (over: Record<string, unknown>) => parseSnapshot(JSON.stringify({ ...base, ...over }))
const parseAgent = (over: Record<string, unknown>) => parseWith({ agents: [{ ...main, ...over }] })

test('named bad files give null, and the untouched base parses', async () => {
  expect(parseWith({})).toEqual(base)
  expect(parseWith({ effects: [null] })).toBe(null)
  expect(parseAgent({ inFlight: { x: null } })).toBe(null)
  expect(parseAgent({ waiting: 'yes' })).toBe(null)
  expect(parseAgent({ activity: 'dancing' })).toBe(null)
  expect(parseWith({ stats: { ...base.stats, tools: '3' } })).toBe(null)
})

test('required fields, optional fields and every nested type are checked', async () => {
  const eff = { id: 1, kind: 'done', agent: 'main', at: 5 }
  const bad: readonly (readonly [string, unknown])[] = [
    ['sessionId', 7], ['name', null], ['cwd', {}], ['startedAt', '0'], ['updatedAt', null], ['nextEffectId', 'x'], ['endedAt', '5'],
    ['context', { percent: '10' }], ['context', {}], ['context', null], ['agents', {}], ['effects', {}], ['stats', []],
    ['effects', [{ ...eff, kind: 'dancing' }]], ['effects', [{ ...eff, id: null }]], ['effects', [{ ...eff, agent: 1 }]], ['effects', [{ ...eff, to: 1 }]], ['effects', [{ ...eff, at: 'x' }]],
    ['stats', { ...base.stats, day: 20261002 }], ['stats', { ...base.stats, errors: null }],
  ]
  for (const [key, value] of bad) expect([key, parseWith({ [key]: value })]).toEqual([key, null])
  const badAgent: readonly (readonly [string, unknown])[] = [
    ['id', 1], ['kind', 'boss'], ['label', null], ['parent', 3], ['detail', 3], ['since', 'x'], ['turnActive', 'yes'], ['inFlight', []], ['inFlight', null],
    ['inFlight', { a: { tool: 'Bash', detail: 'x' } }], ['inFlight', { a: { tool: 'Bash', detail: 'x', startedAt: 'now' } }],
    ['waiting', { kind: 'nap', tool: 'Bash', detail: 'x', at: 1 }], ['waiting', { kind: 'permission', tool: 'Bash', detail: 'x' }],
    ['mode', 'dancing'], ['mode', 3], ['doneAt', '5'],
  ]
  for (const [key, value] of badAgent) expect([key, parseAgent({ [key]: value })]).toEqual([key, null])
  expect(parseWith({ agents: [main, 'main'] })).toBe(null)
  expect(parseWith({ v: 2 })).toBe(null)
})

test('numbers must be finite, even when the JSON text overflows to Infinity', async () => {
  const text = JSON.stringify(base)
  expect(parseSnapshot(text.replace('"updatedAt":1000', '"updatedAt":1e999'))).toBe(null)
  expect(parseSnapshot(text.replace('"tools":0', '"tools":-1e999'))).toBe(null)
})

test('unknown extra fields are allowed within v1', async () => {
  const extended = { ...base, future: { a: 1 }, agents: [{ ...main, shiny: true }] }
  expect(parseSnapshot(JSON.stringify(extended))).toEqual(extended)
})

test('every enum member is accepted', async () => {
  const activities: readonly Activity[] = ['idle', 'thinking', 'typing', 'running', 'reading', 'permission', 'question', 'planning', 'compacting', 'delegating']
  const kinds: readonly AgentKind[] = ['main', 'sub', 'teammate']
  const effects: readonly EffectKind[] = ['spawn', 'done', 'error', 'commit', 'push', 'testPass', 'testFail', 'message', 'compact']
  const wait = (kind: 'permission' | 'question') => ({ kind, tool: 'Bash', detail: 'x', at: 1 })
  for (const activity of activities) expect(parseAgent({ activity })?.agents[0]?.activity).toBe(activity)
  for (const kind of kinds) expect(parseAgent({ kind })?.agents[0]?.kind).toBe(kind)
  for (const kind of effects) expect(parseWith({ effects: [{ id: 1, kind, agent: 'main', at: 5 }] })?.effects[0]?.kind).toBe(kind)
  for (const kind of ['permission', 'question'] as const) expect(parseAgent({ waiting: wait(kind) })?.agents[0]?.waiting?.kind).toBe(kind)
  for (const mode of ['planning', 'compacting'] as const) expect(parseAgent({ mode })?.agents[0]?.mode).toBe(mode)
})

test('inherited property names are not enum members', async () => {
  expect(parseAgent({ activity: 'constructor' })).toBe(null)
  expect(parseAgent({ kind: '__proto__' })).toBe(null)
  expect(parseAgent({ mode: 'toString' })).toBe(null)
})

test('never throws: garbage, torn writes and odd JSON all give null', async () => {
  const text = JSON.stringify(demoSnapshots(T0 + 30_000, T0, DAY)[1])
  const torn = Array.from({ length: text.length }, (_, i) => text.slice(0, i))
  expect(torn.every(t => parseSnapshot(t) === null)).toBe(true)
  const odd = ['', ' ', 'null', 'true', '0', '"x"', '[]', '{}', '{"v":1}', '[[[[[', '\u0000', '{"v":1,"agents":[[],[]]}', '{"__proto__":{"v":1}}', '['.repeat(100_000)]
  expect(odd.map(parseSnapshot)).toEqual(odd.map(() => null))
})

// ── Round trip ─────────────────────────────────────────────────────

test('everything the demo and the reducer produce parses back to the same value', async () => {
  const demo = Array.from({ length: 125 }, (_, sec) => at(sec)).flat()
  const ev = (e: Bare, now: number) => ({ ...e, now }) as TruthEvent
  const bash = (id: string, command: string, ok: boolean, now: number): TruthEvent[] => [
    ev({ type: 'toolStart', toolUseId: id, tool: 'Bash', input: { command } }, now),
    ev({ type: 'toolEnd', toolUseId: id, tool: 'Bash', input: { command }, ok }, now + 1),
  ]
  const script: readonly TruthEvent[] = [
    ev({ type: 'turnStart' }, 1_100),
    ev({ type: 'context', percent: 42 }, 1_150),
    ev({ type: 'toolStart', toolUseId: 't1', tool: 'Edit', input: { file_path: 'a.ts' } }, 1_200),
    ev({ type: 'toolStart', toolUseId: 't2', tool: 'Read', input: { file_path: 'b.ts' } }, 1_300),
    ...bash('t3', 'npm test', false, 1_400),
    ...bash('t4', 'npm test', true, 1_500),
    ...bash('t5', 'git commit -m x', true, 1_600),
    ...bash('t6', 'git push', true, 1_700),
    ...bash('t7', 'ls', false, 1_800),
    ev({ type: 'permissionAsk', tool: 'Bash', input: { command: 'npm publish' } }, 1_900),
    ev({ type: 'permissionDenied', tool: 'Bash' }, 2_000),
    ev({ type: 'toolStart', toolUseId: 't8', tool: 'AskUserQuestion', input: { question: 'Which one?' } }, 2_100),
    ev({ type: 'toolEnd', toolUseId: 't8', tool: 'AskUserQuestion', input: {}, ok: true }, 2_200),
    ev({ type: 'toolEnd', toolUseId: 't1', tool: 'Edit', input: {}, ok: true }, 2_300),
    ev({ type: 'toolEnd', toolUseId: 't2', tool: 'Read', input: {}, ok: true }, 2_350),
    ev({ type: 'toolStart', toolUseId: 't9', tool: 'Task', input: { description: 'scout' } }, 2_400),
    ev({ type: 'spawn', agentId: 'a1', parent: 'main', label: 'scout' }, 2_500),
    ev({ type: 'agentSeen', agentId: 'm1', kind: 'teammate', label: 'mate', parent: 'main' }, 2_600),
    ev({ type: 'toolStart', agentId: 'ghost', toolUseId: 'g1', tool: 'mcp__srv__op', input: {} }, 2_650),
    ev({ type: 'message', from: 'main', to: 'a1' }, 2_700),
    ev({ type: 'message', from: 'main', to: 'session:other' }, 2_750),
    ev({ type: 'planMode', on: true }, 2_800),
    ev({ type: 'planMode', on: false }, 2_850),
    ev({ type: 'compact' }, 2_900),
    ev({ type: 'subagentStop', agentId: 'a1' }, 3_000),
    ev({ type: 'teammateIdle', label: 'mate' }, 3_100),
    ev({ type: 'turnEnd', aborted: false }, 3_200),
    ev({ type: 'context', percent: null }, 3_300),
    ev({ type: 'end' }, 3_400),
  ]
  const reduced = script.reduce<Snapshot[]>((all, e) => [...all, reduce(all[all.length - 1]!, e, { day: DAY })], [base])
  // The script has to reach the optional fields, or the round trip would skip them.
  const reaches = (f: (s: Snapshot) => boolean) => expect(reduced.some(f)).toBe(true)
  reaches(s => s.endedAt !== undefined)
  reaches(s => s.agents.some(a => a.doneAt !== undefined))
  reaches(s => s.agents.some(a => a.parent !== undefined))
  reaches(s => s.agents.some(a => a.detail !== undefined))
  reaches(s => s.agents.some(a => a.waiting !== undefined))
  reaches(s => s.agents.some(a => a.mode !== undefined))
  reaches(s => s.effects.some(e => e.to !== undefined))
  reaches(s => s.context.percent !== null)
  for (const s of [...demo, ...reduced]) expect(parseSnapshot(JSON.stringify(s))).toEqual(s)
})
