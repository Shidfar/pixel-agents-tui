import { expect, test } from 'claude-code/testing'
import { activityOf, describeTool, initialSnapshot, prune, reduce, toolClass } from '../src/engine/truth'
import type { Snapshot, TruthEvent } from '../src/engine/types'

const ctx = { day: '2026-10-02' }
const base = () => initialSnapshot({ sessionId: 's1', name: 'repo', cwd: '/w/repo', now: 1000, day: '2026-10-02' })
const run = (evs: readonly TruthEvent[], s: Snapshot = base()) => evs.reduce((acc, ev) => reduce(acc, ev, ctx), s)
const get = (s: Snapshot, id = 'main') => s.agents.find(a => a.id === id)!
const kinds = (s: Snapshot) => s.effects.map(e => e.kind)
const bash = (id: string, command: string, now: number): TruthEvent => ({ type: 'toolStart', toolUseId: id, tool: 'Bash', input: { command }, now })
const bashEnd = (id: string, command: string, ok: boolean, now: number): TruthEvent => ({ type: 'toolEnd', toolUseId: id, tool: 'Bash', input: { command }, ok, now })

test('a fresh session has one idle main agent named after the session', async () => {
  const s = base()
  expect(s.agents.map(a => [a.id, a.kind, a.label, a.activity, a.turnActive])).toEqual([['main', 'main', 'repo', 'idle', false]])
  expect(s.stats).toEqual({ day: '2026-10-02', tools: 0, edits: 0, commits: 0, permits: 0, errors: 0 })
})

test('turn and tool events drive thinking → reading → thinking → idle, with a done effect', async () => {
  const read = { type: 'toolStart', toolUseId: 't1', tool: 'Read', input: { file_path: '/w/repo/src/main.ts' }, now: 1100 } as const
  const s1 = run([{ type: 'turnStart', now: 1050 }])
  expect(get(s1).activity).toBe('thinking')
  const s2 = run([read], s1)
  expect([get(s2).activity, get(s2).detail]).toEqual(['reading', 'Reading main.ts'])
  const s3 = run([{ ...read, type: 'toolEnd', ok: true, now: 1200 }], s2)
  expect(get(s3).activity).toBe('thinking')
  const s4 = run([{ type: 'turnEnd', aborted: false, now: 1300 }], s3)
  expect(get(s4).activity).toBe('idle')
  expect(kinds(s4)).toEqual(['done'])
  expect(get(s4).since).toBe(1300)
})

test('an aborted turn ends idle without a done effect', async () => {
  const s = run([{ type: 'turnStart', now: 1 }, { type: 'turnEnd', aborted: true, now: 2 }])
  expect([get(s).activity, kinds(s).length]).toEqual(['idle', 0])
})

test('permission shows exactly while the dialog is open and clears when that tool resolves', async () => {
  const s1 = run([{ type: 'turnStart', now: 1 }, bash('t1', 'npm publish', 2), { type: 'permissionAsk', tool: 'Bash', input: { command: 'npm publish' }, now: 3 }])
  expect([get(s1).activity, get(s1).detail, s1.stats.permits]).toEqual(['permission', 'Bash: npm publish', 1])
  const s2 = run([bashEnd('t1', 'npm publish', true, 9)], s1)
  expect(get(s2).activity).toBe('thinking')
  expect(get(s2).waiting).toBeUndefined()
})

test('another tool finishing does not clear a pending permission', async () => {
  const s = run([
    { type: 'turnStart', now: 1 }, bash('t1', 'rm -rf build', 2),
    { type: 'toolStart', toolUseId: 't2', tool: 'Read', input: { file_path: 'a.ts' }, now: 3 },
    { type: 'permissionAsk', tool: 'Bash', input: { command: 'rm -rf build' }, now: 4 },
    { type: 'toolEnd', toolUseId: 't2', tool: 'Read', input: { file_path: 'a.ts' }, ok: true, now: 5 },
  ])
  expect(get(s).activity).toBe('permission')
})

test('permission denied clears the wait and records an error', async () => {
  const s = run([bash('t1', 'rm -rf /', 1), { type: 'permissionAsk', tool: 'Bash', input: { command: 'rm -rf /' }, now: 2 }, { type: 'permissionDenied', tool: 'Bash', now: 3 }])
  expect(get(s).waiting).toBeUndefined()
  expect([kinds(s), s.stats.errors]).toEqual([['error'], 1])
})

test('AskUserQuestion is a question until it resolves', async () => {
  const ask = { type: 'toolStart', toolUseId: 'q', tool: 'AskUserQuestion', input: { questions: [{ question: 'Which DB?' }] }, now: 1 } as const
  const s1 = run([{ type: 'turnStart', now: 0 }, ask])
  expect([get(s1).activity, get(s1).detail]).toEqual(['question', 'Which DB?'])
  expect(get(run([{ ...ask, type: 'toolEnd', ok: true, now: 2 }], s1)).activity).toBe('thinking')
})

test('a spawned subagent works under its own id, finishes, and is pruned a minute later', async () => {
  const s1 = run([
    { type: 'spawn', agentId: 'a1', label: 'find callers', now: 10 },
    { type: 'toolStart', agentId: 'a1', toolUseId: 'g', tool: 'Grep', input: { pattern: 'render' }, now: 11 },
  ])
  expect([get(s1, 'a1').kind, get(s1, 'a1').parent, get(s1, 'a1').activity, get(s1, 'a1').detail]).toEqual(['sub', 'main', 'reading', 'Grep render'])
  expect(kinds(s1)).toEqual(['spawn'])
  const s2 = run([{ type: 'turnEnd', agentId: 'a1', aborted: false, now: 20 }], s1)
  expect([get(s2, 'a1').doneAt, Object.keys(get(s2, 'a1').inFlight).length]).toEqual([20, 0])
  expect(prune(s2, 20 + 59_000).agents.length).toBe(2)
  expect(prune(s2, 20 + 61_000).agents.map(a => a.id)).toEqual(['main'])
})

test('an unknown agentId is created lazily as a sub of main', async () => {
  const s = run([{ type: 'toolStart', agentId: 'x9abcdef', toolUseId: 't', tool: 'Read', input: { file_path: 'a' }, now: 1 }])
  expect([get(s, 'x9abcdef').kind, get(s, 'x9abcdef').label]).toEqual(['sub', 'agent x9abcd'])
})

test('delegating while only an Agent call is in flight; another tool wins over it', async () => {
  const agentCall = { type: 'toolStart', toolUseId: 'ag', tool: 'Agent', input: { description: 'find callers' }, now: 1 } as const
  const s1 = run([agentCall])
  expect(get(s1).activity).toBe('delegating')
  expect(get(run([{ type: 'toolStart', toolUseId: 'r', tool: 'Read', input: { file_path: 'x' }, now: 2 }], s1)).activity).toBe('reading')
})

test('bash outcomes become celebrations, failures become errors, stats count them', async () => {
  const s = run([
    bash('1', 'git commit -m "x"', 1), bashEnd('1', 'git commit -m "x"', true, 2),
    bash('2', 'git push origin mod-rewrite', 3), bashEnd('2', 'git push origin mod-rewrite', true, 4),
    bash('3', 'npm test', 5), bashEnd('3', 'npm test', true, 6),
    bash('4', 'npm test', 7), bashEnd('4', 'npm test', false, 8),
    { type: 'toolStart', toolUseId: '5', tool: 'Edit', input: { file_path: 'a.ts' }, now: 9 },
    { type: 'toolEnd', toolUseId: '5', tool: 'Edit', input: { file_path: 'a.ts' }, ok: false, now: 10 },
  ])
  expect(kinds(s)).toEqual(['commit', 'push', 'testPass', 'testFail', 'error'])
  expect([s.stats.tools, s.stats.edits, s.stats.commits, s.stats.errors]).toEqual([5, 1, 1, 2])
  expect(s.effects.map(e => e.id)).toEqual([1, 2, 3, 4, 5])
})

test('the effect ring keeps the last 32', async () => {
  const evs = Array.from({ length: 40 }, (_, i) => ({ type: 'message', from: 'main', to: 'a1', now: i }) as const)
  const s = run(evs)
  expect([s.effects.length, s.effects[0]!.id, s.nextEffectId]).toEqual([32, 9, 41])
})

test('stats reset when the local day changes', async () => {
  const s1 = run([bash('1', 'ls', 1)])
  const s2 = reduce(s1, bash('2', 'ls', 2), { day: '2026-10-03' })
  expect([s2.stats.day, s2.stats.tools]).toEqual(['2026-10-03', 1])
})

test('compaction lasts until the next turn; plan mode toggles; context is stored; end marks endedAt', async () => {
  const s1 = run([{ type: 'compact', now: 1 }])
  expect([get(s1).activity, kinds(s1)]).toEqual(['compacting', ['compact']])
  expect(get(run([{ type: 'turnStart', now: 2 }], s1)).activity).toBe('thinking')
  expect(get(run([{ type: 'planMode', on: true, now: 3 }])).activity).toBe('planning')
  expect(get(run([{ type: 'planMode', on: true, now: 3 }, { type: 'planMode', on: false, now: 4 }])).activity).toBe('idle')
  expect(run([{ type: 'context', percent: 42, now: 5 }]).context.percent).toBe(42)
  expect(run([{ type: 'end', now: 6 }]).endedAt).toBe(6)
})

test('teammates are seen, work, and go idle by name', async () => {
  const s = run([
    { type: 'agentSeen', agentId: 'tm1', kind: 'teammate', label: 'researcher', now: 1 },
    { type: 'toolStart', agentId: 'tm1', toolUseId: 'w', tool: 'WebSearch', input: { query: 'mods' }, now: 2 },
    { type: 'toolEnd', agentId: 'tm1', toolUseId: 'w', tool: 'WebSearch', input: { query: 'mods' }, ok: true, now: 3 },
    { type: 'teammateIdle', label: 'researcher', now: 4 },
  ])
  expect([get(s, 'tm1').kind, get(s, 'tm1').activity]).toEqual(['teammate', 'idle'])
})

test('describeTool and toolClass follow the tables', async () => {
  expect(describeTool('Bash', { command: 'npm run build -- --watch --verbose --long-flag\nsecond' })).toBe('npm run build -- --watch --ve…')
  expect(describeTool('mcp__github__create_issue', {})).toBe('github: create_issue')
  expect(describeTool('WebFetch', { url: 'https://example.com/x' })).toBe('example.com')
  expect(describeTool('WebFetch', { url: 'nope' })).toBe('web')
  expect(describeTool('Agent', { subagent_type: 'Explore' })).toBe('Explore')
  expect(['Edit', 'Bash', 'Grep', 'AskUserQuestion', 'Agent', 'mcp__x__y'].map(toolClass)).toEqual(['typing', 'running', 'reading', 'question', 'delegating', 'typing'])
  expect(activityOf({ id: 'main', kind: 'main', label: 'r', activity: 'idle', since: 0, turnActive: true, inFlight: {} })).toBe('thinking')
})

// ── Beyond the plan ────────────────────────────────────────────────

const freeze = <T>(x: T): T => {
  if (typeof x === 'object' && x !== null) {
    Object.values(x).forEach(freeze)
    Object.freeze(x)
  }
  return x
}

const everyKind: readonly TruthEvent[] = [
  { type: 'turnStart', now: 1 },
  { type: 'agentSeen', agentId: 'tm1', kind: 'teammate', label: 'researcher', now: 2 },
  { type: 'spawn', agentId: 'a1', label: 'find callers', now: 3 },
  { type: 'toolStart', toolUseId: 't1', tool: 'Bash', input: { command: 'npm test' }, now: 4 },
  { type: 'toolStart', agentId: 'a1', toolUseId: 't2', tool: 'Grep', input: { pattern: 'x' }, now: 5 },
  { type: 'permissionAsk', tool: 'Bash', input: { command: 'npm test' }, now: 6 },
  { type: 'message', from: 'main', to: 'a1', now: 7 },
  { type: 'toolEnd', toolUseId: 't1', tool: 'Bash', input: { command: 'npm test' }, ok: false, now: 8 },
  { type: 'permissionDenied', agentId: 'a1', tool: 'Grep', now: 9 },
  { type: 'planMode', on: true, now: 10 },
  { type: 'compact', now: 11 },
  { type: 'context', percent: 80, now: 12 },
  { type: 'teammateIdle', label: 'researcher', now: 13 },
  { type: 'subagentStop', agentId: 'a1', now: 14 },
  { type: 'turnEnd', aborted: false, now: 15 },
  { type: 'end', now: 16 },
]

test('reduce never mutates its input, and every agent always matches activityOf', async () => {
  const frozen = everyKind.reduce((acc, ev) => freeze(reduce(acc, ev, ctx)), freeze(base()))
  expect(frozen.endedAt).toBe(16)
  const states = everyKind.map((_, i) => run(everyKind.slice(0, i + 1)))
  expect(states.every(s => s.agents.every(a => a.activity === activityOf(a)))).toBe(true)
})

test('any event naming an unknown agent recreates it; subagentStop does not, and is idempotent', async () => {
  const ghost = (ev: TruthEvent) => run([ev]).agents.map(a => a.id)
  expect(ghost({ type: 'permissionAsk', agentId: 'g1', tool: 'Bash', input: {}, now: 1 })).toEqual(['main', 'g1'])
  expect(ghost({ type: 'toolEnd', agentId: 'g1', toolUseId: 't', tool: 'Read', input: {}, ok: true, now: 1 })).toEqual(['main', 'g1'])
  expect(ghost({ type: 'subagentStop', agentId: 'g1', now: 1 })).toEqual(['main'])
  const s = run([{ type: 'spawn', agentId: 'a1', label: 'x', now: 1 }, { type: 'subagentStop', agentId: 'a1', now: 5 }, { type: 'subagentStop', agentId: 'a1', now: 9 }])
  expect(get(s, 'a1').doneAt).toBe(5)
})

test('spawn names the new agent and replaces a stale one in place; labels are cut to 16 cells', async () => {
  const s = run([
    { type: 'spawn', agentId: 'a1', parent: 'tm1', label: 'a very long task description here', now: 1 },
    { type: 'spawn', agentId: 'b2', label: 'other', now: 2 },
    { type: 'turnEnd', agentId: 'a1', aborted: false, now: 3 },
    { type: 'spawn', agentId: 'a1', label: 'again', now: 4 },
  ])
  expect(s.agents.map(a => a.id)).toEqual(['main', 'a1', 'b2'])
  expect([get(s, 'a1').label, get(s, 'a1').parent, get(s, 'a1').doneAt, get(s, 'a1').activity]).toEqual(['again', 'main', undefined, 'thinking'])
  expect(s.effects.map(e => [e.kind, e.agent])).toEqual([['spawn', 'a1'], ['spawn', 'b2'], ['spawn', 'a1']])
  expect(run([{ type: 'spawn', agentId: 'a', label: 'a very long task description here', now: 1 }]).agents[1]!.label).toBe('a very long tas…')
})

test('the newest tool decides the activity; a finished one hands it back', async () => {
  const s1 = run([bash('1', 'ls', 1), { type: 'toolStart', toolUseId: '2', tool: 'Read', input: { file_path: 'a' }, now: 2 }])
  expect([get(s1).activity, get(s1).detail]).toEqual(['reading', 'Reading a'])
  const s2 = run([{ type: 'toolEnd', toolUseId: '2', tool: 'Read', input: {}, ok: true, now: 3 }], s1)
  expect([get(s2).activity, get(s2).detail, get(s2).since]).toEqual(['running', 'ls', 3])
})

test('a failed test run is one testFail and one error count, not two', async () => {
  const s = run([bash('1', 'bun run test', 1), bashEnd('1', 'bun run test', false, 2), bash('2', 'false', 3), bashEnd('2', 'false', false, 4)])
  expect([kinds(s), s.stats.errors]).toEqual([['testFail', 'error'], 2])
})

test('prune hands back the same snapshot when nothing is old enough', async () => {
  const s = run([{ type: 'spawn', agentId: 'a1', label: 'x', now: 1 }])
  expect(prune(s, 10 ** 9)).toBe(s)
})
