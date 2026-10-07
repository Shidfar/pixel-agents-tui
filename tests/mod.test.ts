import type { On } from 'claude-code'
import { expect, mock, test as kitTest } from 'claude-code/testing'
import type { Engine, TestBody } from 'claude-code/testing'

const PANE = {
  plugin: 'pixel-agents', component: 'Pane', requestId: 'pixel-agents',
  viewport: { columns: 110, rows: 50, isFullscreen: true },
  props: { title: 'office', isFocused: true, bodyColumns: 89, placement: 'dock', scroll: { offset: 0, bodyRows: 42 }, view: {} },
} as const
const BAND = {
  plugin: 'pixel-agents', component: 'AbovePrompt', requestId: 'above',
  viewport: { columns: 200, rows: 50, isFullscreen: true },
  props: { hasSurvey: false, isWorking: false, maxRows: 10, bodyColumns: 200, scroll: { offset: 0, bodyRows: 10 }, view: {} },
} as const

const SHARED = '/Users/Shared'
const PARENT = `${SHARED}/pixel-agents-u`
const MINE = `${PARENT}/sessions`

// Every test also runs under two rules (R13, R14): a process.run that names anything under /Users/Shared is exactly
// `rm -f` of this session's own shared file or the ownership proof (`/usr/bin/stat -f '%u %Lp %HT'` on HOME and the
// folders that exist), and the own shared folder is never listed. The stubs below record a breach.
const breaches: string[] = []
const test = (name: string, body: TestBody) => kitTest(name, async ($, on) => {
  breaches.length = 0
  await body($, on)
  expect(breaches).toEqual([])
})

// Stubs for everything the mod calls; returns the captured writes, opens and toasts.
// Stubs must all be registered before the test's first call on $, so variations come in through opts.
// `lists` answers fs.list by path and rejects a path it does not hold, as a missing folder does; without it every path lists `files`.
// fs.stat then says a listed path is a plain folder (a path not listed rejects), and any path is one when `lists` is not given;
// `stats` overrides what one path says, and null makes it reject. `failShared` makes every write under /Users/Shared reject.
// `files` is looked up by full path first, then by file name. The ownership proof is answered per path from `proof`
// (`<uid> <mode> <type>`; this account is uid 501 and its folders are 755 Directory unless it says otherwise), or fails as `statFail` says:
// exit 1 with nothing, garbage, exit 1 with every line, or exit 0 with only HOME's line. `proofDelayMs` holds the answer on the mock clock.
type Entry = { name: string; kind: 'file' | 'dir' | 'other'; size: number; mtimeMs: number; isLink: boolean }
type Opts = {
  files?: Record<string, string>; blitDeny?: boolean; ids?: readonly string[]
  store?: Record<string, unknown>; env?: Record<string, string>; ageMs?: number; unplaced?: boolean   // used by the tests below the plan's nine
  lists?: Record<string, readonly Entry[]>; stats?: Record<string, (Partial<Pick<Entry, 'kind' | 'isLink'>> & { realPath?: string }) | null>; failShared?: boolean
  proof?: Record<string, string>; statFail?: 'exit' | 'garbage' | 'partial' | 'short'; proofDelayMs?: number   // used by the sharing tests at the end
}
function stubs(on: On, opts: Opts = {}) {
  const files = opts.files ?? {}
  const ids = opts.ids ?? ['s1']
  const n = { list: 0, id: 0 }
  const writes: { path: string; text: string }[] = [], opens: unknown[] = [], toasts: string[] = [], blits: number[] = []
  const reads: string[] = [], runs: (readonly string[])[] = [], blitArgs: unknown[] = [], logs: string[] = [], listed: string[] = [], statted: string[] = []
  const proofs: (readonly string[])[] = [], order: string[] = []   // the ownership proofs, and them and the shared writes in the order they came
  const stats = { ...opts.stats }
  const clock = mock.clock(on, { now: 1_790_000_000_000 })
  // the kit's mock.store, but reachable from the test: another session of the account writes to this store
  const store = new Map<string, unknown>(Object.entries(opts.store ?? {}))
  on('store.get', ($, e) => ({ value: store.get(e.key) }))
  on('store.set', ($, e) => { store.set(e.key, JSON.parse(JSON.stringify(e.value))); return { value: undefined } })
  mock.env(on, { HOME: '/home/u', ...opts.env })
  on('session.start', () => ({ cwd: '/work/repo' }))
  on('session.end', () => ({ sessionId: ids[0]! }))
  on('turn.start', () => ({ turnId: 't1' }))
  on('session.id', () => ({ value: ids[Math.min(n.id++, ids.length - 1)]! }))
  on('session.cwd', () => ({ value: '/work/repo' }))
  on('session.repo', () => ({ value: { root: '/work/repo', remote: null, internal: false, name: null } }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: 1, window: 10, percent: 10 }, rateLimits: [] } }))
  on('command.register', () => ({ value: { command: 'office' } }))
  on('fs.write', ($, e) => {
    if (opts.failShared && e.path.startsWith('/Users/Shared')) throw new Error('EACCES')
    writes.push({ path: e.path, text: e.text })
    if (e.path.startsWith(SHARED)) order.push(`write ${e.path}`)
    return { value: undefined }
  })
  // mtime moves on every listing, so the mod re-reads each file every poll
  on('fs.list', ($, e) => {
    n.list += 1
    listed.push(e.path ?? '')
    if ((e.path ?? '').startsWith(`${SHARED}/pixel-agents-u`)) breaches.push(`list ${e.path}`)
    if (opts.lists) {
      const hit = opts.lists[e.path ?? '']
      if (!hit) throw new Error(`ENOENT ${e.path}`)
      return { value: [...hit] }
    }
    return { value: Object.keys(files).map(name => ({ name, kind: 'file' as const, size: 10, isLink: false, mtimeMs: 1_790_000_000_000 + n.list - (opts.ageMs ?? 0) })) }
  })
  on('fs.stat', ($, e) => {
    statted.push(e.path)
    if (stats[e.path] === null || (opts.lists && !opts.lists[e.path])) throw new Error(`ENOENT ${e.path}`)
    return { value: { kind: 'dir' as const, size: 0, mtimeMs: 0, isLink: false, ...(e.resolve ? { realPath: e.path } : {}), ...stats[e.path] } }
  })
  on('fs.read', ($, e) => { reads.push(e.path); return { value: files[e.path] ?? files[e.path.split('/').pop()!] ?? '' } })
  on('process.run', async ($, e) => {
    const done = (exitCode: number, stdout: string, stderr = '') => ({ value: { exitCode, stdout, stderr, isStdoutTruncated: false, isStderrTruncated: false } })
    const isProof = e.argv[0] === '/usr/bin/stat'
    const ownRm = ids.map(id => ['rm', '-f', `${MINE}/${id}.json`].join('\n'))
    const okProof = [[PARENT], [MINE], [PARENT, MINE]].map(f => ['/usr/bin/stat', '-f', '%u %Lp %HT', '/home/u', ...f].join('\n'))
    if ((isProof || e.argv.some(a => a.includes(SHARED))) && ![...ownRm, ...okProof].includes(e.argv.join('\n'))) breaches.push(`run ${e.argv.join(' ')}`)
    if (!isProof) {
      runs.push(e.argv)
      return done(0, '')
    }
    proofs.push(e.argv)
    order.push(`proof ${e.argv.slice(4).join(' ')}`)
    if (opts.proofDelayMs) await clock.sleep(opts.proofDelayMs)
    const lines = e.argv.slice(3).map(p => opts.proof?.[p] ?? (p === '/home/u' ? '501 700 Directory' : '501 755 Directory'))
    if (opts.statFail === 'exit') return done(1, '', 'stat: No such file or directory')
    if (opts.statFail === 'garbage') return done(0, 'not a stat line\n')
    if (opts.statFail === 'partial') return done(1, lines.join('\n') + '\n', 'stat: No such file or directory')
    if (opts.statFail === 'short') return done(0, lines[0] + '\n')
    return done(0, lines.join('\n') + '\n')
  })
  on('agent.list', () => ({ value: [] }))
  on('ui.open', ($, e) => { opens.push(e); return { value: opts.unplaced ? { isPlaced: false as const, reason: 'too narrow' } : { isPlaced: true as const } } })
  on('ui.close', () => ({ value: undefined }))
  on('ui.blit', ($, e) => { blits.push(1); blitArgs.push(e); return opts.blitDeny ? { deny: 'size mismatch' } : { value: {} } })
  on('ui.toast', ($, e) => { toasts.push(e.text); return { value: undefined } })
  on('ui.log', ($, e) => { logs.push(e.text); return { value: undefined } })
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['drawn by Claude Code'] }))
  const last = () => JSON.parse(writes.filter(w => w.path.endsWith('/s1.json')).at(-1)!.text)
  return { writes, opens, toasts, blits, blitArgs, reads, runs, logs, listed, statted, stats, proofs, order, store, clock, last }
}
const start = ($: Engine) => $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work/repo' })
// The engine's own `$` raises command.run whole: who typed it and where it will show come with it.
const office = ($: Engine, args = '') => $.command.run({ command: 'office', args, origin: { kind: 'composer' }, presentation: { isFullscreen: true, columns: 200 } })

test('/office opens a focused pane named pixel-agents', async ($, on) => {
  const t = stubs(on)
  await start($)
  await office($)
  expect(t.opens.at(-1)).toMatchObject({ id: 'pixel-agents', focus: true, closeOnEscape: true })
})

test('a Bash call publishes running while in flight, then idle with a tool counted', async ($, on) => {
  const t = stubs(on)
  on('tool.call', async () => { await t.clock.sleep(2000); return { result: { stdout: '', stderr: '', interrupted: false } } })
  await start($)
  const call = $.tool.call({ tool: 'Bash', command: 'npm run build' })
  await t.clock.advance(1100)
  expect(t.last().agents[0].activity).toBe('running')
  await t.clock.advance(2000)
  await call
  await t.clock.advance(1100)
  expect(t.last().stats.tools).toBe(1)
  expect(t.writes[0]!.path).toBe('/home/u/.claude/pixel-agents/sessions/s1.json')
})

test('a permission request shows as permission in the published snapshot', async ($, on) => {
  const t = stubs(on)
  on('classic.PermissionRequest', () => ({}))
  await start($)
  await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: { command: 'npm publish' } })
  await t.clock.advance(1100)
  expect([t.last().agents[0].activity, t.last().agents[0].detail]).toEqual(['permission', 'Bash: npm publish'])
})

test('a spawned subagent appears in the snapshot', async ($, on) => {
  const t = stubs(on)
  on('agent.spawn', () => ({ model: 'haiku', agentId: 'a1' }))
  await start($)
  // the engine's own `$` raises agent.spawn whole, with who provides the agent and how it runs
  await $.agent.spawn({ tool_use_id: 'toolu_1', prompt: 'look', description: 'find callers', subagentType: 'Explore', provider: { plugin: 'engine', tier: 'core' }, parentModel: 'sonnet', background: false, fork: false })
  await t.clock.advance(1100)
  expect(t.last().agents.map((a: any) => [a.id, a.kind, a.label])).toContainEqual(['a1', 'sub', 'find callers'])
})

test('the pane mounts a Raster sized to the body in the terminal, and a roster on desktop', async ($, on) => {
  stubs(on)
  await start($)
  await office($)
  const term = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const r = await term.find({ type: 'Raster' })
  expect([r?.props.columns, r?.props.rows, r?.props.key]).toEqual([89, 41, 'office'])
  expect(await term.find({ key: 'z' })).toBeDefined()
  await term.unmount()
  const desk = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await desk.find({ type: 'Raster' })).toBeUndefined()
  expect(await desk.find({ type: 'Text', text: /repo/ })).toBeDefined()
})

test('the band alerts about another session waiting, with one toast; never about your own', async ($, on) => {
  const other = { v: 1, sessionId: 's2', name: 'api', cwd: '/w/api', startedAt: 0, updatedAt: 1_790_000_000_000, context: { percent: null }, effects: [], nextEffectId: 1,
    stats: { day: '2026-10-02', tools: 0, edits: 0, commits: 0, permits: 0, errors: 0 },
    agents: [{ id: 'main', kind: 'main', label: 'api', activity: 'permission', detail: 'Bash: x', since: 0, turnActive: true, inFlight: {}, waiting: { kind: 'permission', tool: 'Bash', detail: 'Bash: x', at: 5 } }] }
  const t = stubs(on, { files: { 's2.json': JSON.stringify(other) } })
  await start($)
  await t.clock.advance(1100)
  await t.clock.advance(1100)
  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await band.find({ type: 'Text', text: /api is waiting: Bash: x/ })).toBeDefined()
  expect(t.toasts).toEqual(['api is waiting: Bash: x'])
})

test('a torn file keeps the last good copy', async ($, on) => {
  const good = JSON.stringify({ v: 1, sessionId: 's2', name: 'api', cwd: '/w', startedAt: 0, updatedAt: 1_790_000_000_000, context: { percent: null }, effects: [], nextEffectId: 1, stats: { day: '2026-10-02', tools: 0, edits: 0, commits: 0, permits: 0, errors: 0 }, agents: [{ id: 'main', kind: 'main', label: 'api', activity: 'question', detail: 'q', since: 0, turnActive: true, inFlight: {}, waiting: { kind: 'question', tool: 'AskUserQuestion', detail: 'q', at: 5 } }] })
  const files: Record<string, string> = { 's2.json': good }
  const t = stubs(on, { files })
  await start($)
  await t.clock.advance(1100)
  files['s2.json'] = good.slice(0, 40)
  await t.clock.advance(1100)
  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect(await band.find({ type: 'Text', text: /api is waiting/ })).toBeDefined()
})

test('a failed blit asks for a re-render instead of failing every frame', async ($, on) => {
  const t = stubs(on, { blitDeny: true })
  await start($)
  await $.turn.start({ text: 'go', turnId: 't1' })   // a turn running, so frames change and blits are attempted
  await office($)
  const term = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await t.clock.advance(1000)
  expect(t.blits.length >= 1).toBe(true)
  expect(t.blits.length <= 2).toBe(true)
  // the remount that followed the refusal shows the office, not an empty frame
  const blank = new Uint8Array(Uint32Array.from({ length: 89 * 41 * 3 }, (_, i) => (i % 3 === 0 ? 0x20 : 0x01000000)).buffer).toBase64()
  const cells = (await term.find({ type: 'Raster' }))?.props.cells
  expect([typeof cells, cells === blank]).toEqual(['string', false])
})

test('/clear starts a new snapshot and ends the old one', async ($, on) => {
  const t = stubs(on, { ids: ['s1', 's9'] })
  on('classic.SessionStart', () => ({}))
  await start($)
  await t.clock.advance(1100)
  await $.classic.SessionStart({ source: 'clear' })
  await t.clock.advance(1100)
  expect(JSON.parse(t.writes.filter(w => w.path.endsWith('/s1.json')).at(-1)!.text).endedAt).toBeDefined()
  expect(t.writes.some(w => w.path.endsWith('/s9.json'))).toBe(true)
})

// ── beyond the plan's nine ─────────────────────────────────────────

const quiet = { v: 1, sessionId: 's2', name: 'api', cwd: '/w/api', startedAt: 0, updatedAt: 1_790_000_000_000, context: { percent: null }, effects: [], nextEffectId: 1,
  stats: { day: '2026-10-02', tools: 0, edits: 0, commits: 0, permits: 0, errors: 0 },
  agents: [{ id: 'main', kind: 'main', label: 'api', activity: 'idle', since: 0, turnActive: false, inFlight: {} }] }

test('an idle session heartbeats: updatedAt moves every 5 s, so viewers never see it as gone', async ($, on) => {
  const t = stubs(on)
  await start($)
  const first = t.last().updatedAt
  await t.clock.advance(6000)
  expect(t.last().updatedAt).toBeGreaterThan(first)
  expect(t.writes).toHaveLength(2)
})

test('session.end writes the snapshot once with endedAt and reads nothing', async ($, on) => {
  const t = stubs(on)
  await start($)
  await t.clock.advance(300)
  const [writes, reads] = [t.writes.length, t.reads.length]
  await $.session.end({ reason: 'other', sessionId: 's1', resume: { id: 's1' } })
  expect([t.writes.length - writes, t.reads.length - reads, t.last().endedAt !== undefined]).toEqual([1, 0, true])
})

test('an office that changes is repainted through ui.blit at the pane id and key', async ($, on) => {
  const t = stubs(on)
  await start($)
  await $.turn.start({ text: 'go', turnId: 't1' })
  await office($)
  await $.ui.mount({ ...PANE, surface: 'terminal' })
  await t.clock.advance(1000)
  expect(t.blitArgs[0]).toMatchObject({ requestId: 'pixel-agents', key: 'office', cells: expect.any(String) })
})

test('hd mounts an Image in place of the Raster, and the g button turns it on', async ($, on) => {
  const t = stubs(on)
  await start($)
  await $.turn.start({ text: 'go', turnId: 't1' })
  await office($)
  const term = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await term.find({ type: 'Image' })).toBeUndefined()
  await term.press({ key: 'g' })
  const img = await term.find({ type: 'Image' })
  expect([img?.props.columns, img?.props.rows, img?.props.key, await term.find({ type: 'Raster' })]).toEqual([89, 41, 'office', undefined])
  await t.clock.advance(1000)
  expect(t.blitArgs.at(-1)).toMatchObject({ requestId: 'pixel-agents', key: 'office', source: { rgba: expect.any(String), width: expect.any(Number) } })
})

test('a Ghostty terminal starts in hd', async ($, on) => {
  stubs(on, { env: { TERM_PROGRAM: 'ghostty' } })
  await start($)
  await office($)
  const term = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await term.find({ type: 'Image' })).toBeDefined()
})

test('/office again closes the pane, and /office demo opens it with the demo crew', async ($, on) => {
  const t = stubs(on)
  await start($)
  await office($)
  await office($)
  expect(t.opens).toHaveLength(1)
  await office($, 'demo')
  expect(t.opens).toHaveLength(2)
  const desk = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await desk.find({ type: 'Text', text: /api-service/ })).toBeDefined()
})

test('a pane left open last time reopens at session start', async ($, on) => {
  const t = stubs(on, { store: { prefs: { paneOpen: true, theme: 'warm' } } })
  await start($)
  expect(t.opens).toHaveLength(1)
})

test('a garbled stored prefs value changes nothing', async ($, on) => {
  const t = stubs(on, { store: { prefs: { paneOpen: 'yes', theme: 'neon', camera: 7 } } })
  await start($)
  const term = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect([t.opens, await term.find({ type: 'Raster' })]).toMatchObject([[], { type: 'Raster' }])
})

test('your own wait never alerts', async ($, on) => {
  const t = stubs(on)
  on('classic.PermissionRequest', () => ({}))
  await start($)
  await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: { command: 'x' } })
  await t.clock.advance(2200)
  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect([await band.find({ type: 'Text', text: /waiting/ }), t.toasts]).toEqual([undefined, []])
})

test('a file untouched for an hour is deleted, and not read', async ($, on) => {
  const t = stubs(on, { files: { 'old-1.json': JSON.stringify(quiet) }, ageMs: 3_700_000 })
  await start($)
  await t.clock.advance(1100)
  expect(t.runs[0]).toEqual(['rm', '-f', '/home/u/.claude/pixel-agents/sessions/old-1.json'])
  expect(t.reads).toEqual([])
})

test('a second session in the same repo is named repo-2; an ended one does not take the name', async ($, on) => {
  const t = stubs(on, { files: { 's2.json': JSON.stringify({ ...quiet, name: 'repo' }), 's3.json': JSON.stringify({ ...quiet, sessionId: 's3', name: 'repo', endedAt: 1_790_000_000_000 }) } })
  await start($)
  expect(t.last().name).toBe('repo-2')
})

test('a startup SessionStart is not a reset', async ($, on) => {
  const t = stubs(on, { ids: ['s1', 's9'] })
  on('classic.SessionStart', () => ({}))
  await start($)
  await $.classic.SessionStart({ source: 'startup' })
  await t.clock.advance(1100)
  expect(t.writes.some(w => w.path.endsWith('/s9.json'))).toBe(false)
})

test('a resume of the same session id is not a reset: no endedAt, no new file', async ($, on) => {
  const t = stubs(on, { ids: ['s1', 's1'] })
  on('classic.SessionStart', () => ({}))
  await start($)
  await t.clock.advance(1100)
  await $.classic.SessionStart({ source: 'resume' })
  await t.clock.advance(1100)
  expect(t.writes.every(w => w.path.endsWith('/s1.json') && JSON.parse(w.text).endedAt === undefined)).toBe(true)
})

// How a tool call ends. A tool call alone never ends the turn, so the main agent goes back to
// 'thinking' (not 'idle') once nothing is in flight; only turn.complete makes it idle.
const OK = { result: { stdout: '', stderr: '', interrupted: false } }
const bash = ($: Engine) => $.tool.call({ tool: 'Bash', command: 'npm run build' })

test('a Bash call that resolves leaves nothing in flight, and the turn ending makes the agent idle', async ($, on) => {
  const t = stubs(on)
  on('tool.call', () => OK)
  on('turn.complete', () => ({ text: '' }))
  await start($)
  await bash($)
  await t.clock.advance(1100)
  expect([t.last().agents[0].activity, t.last().agents[0].inFlight, t.last().stats.tools]).toEqual(['thinking', {}, 1])
  await $.turn.complete({ answer: '', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  await t.clock.advance(1100)
  expect([t.last().agents[0].activity, t.last().agents[0].inFlight, t.last().stats.tools]).toEqual(['idle', {}, 1])
})

test('a denied tool call counts one error, passes the denial on, and is no longer in flight', async ($, on) => {
  const t = stubs(on)
  on('tool.call', () => ({ deny: 'no' }))
  await start($)
  expect(await bash($)).toEqual({ deny: 'no' })
  await t.clock.advance(1100)
  expect([t.last().stats.errors, t.last().agents[0].inFlight, t.last().agents[0].activity]).toEqual([1, {}, 'thinking'])
})

test('a tool result with isError counts one error and passes the result on', async ($, on) => {
  const t = stubs(on)
  on('tool.call', () => ({ isError: true as const, result: 'boom', text: 'boom' }))
  await start($)
  expect(await bash($)).toMatchObject({ isError: true, text: 'boom' })
  await t.clock.advance(1100)
  expect([t.last().stats.errors, t.last().agents[0].inFlight]).toEqual([1, {}])
})

test('a tool call that throws still rejects the caller, counts one error and leaves nothing in flight', async ($, on) => {
  const t = stubs(on)
  on('tool.call', () => { throw new Error('boom') })
  await start($)
  // the kit reports a failing bottom hook as its own "no implementation" error; the mod must pass that on as it is
  await expect(bash($)).rejects.toThrow(/tool\.call/)
  await t.clock.advance(1100)
  expect([t.last().stats.errors, t.last().agents[0].inFlight]).toEqual([1, {}])
})

test('a permission request clears when its tool call resolves', async ($, on) => {
  const t = stubs(on)
  on('classic.PermissionRequest', () => ({}))
  on('tool.call', () => OK)
  await start($)
  await $.classic.PermissionRequest({ tool_name: 'Bash', tool_input: { command: 'npm run build' } })
  await t.clock.advance(1100)
  expect(t.last().agents[0].activity).toBe('permission')
  await bash($)
  await t.clock.advance(1100)
  expect([t.last().agents[0].waiting, t.last().agents[0].activity]).toEqual([undefined, 'thinking'])
})

test('a pane the terminal did not place stays closed: no pane state, no remembered open, /office tries again', async ($, on) => {
  const t = stubs(on, { unplaced: true })
  await start($)
  await office($)
  await office($)
  expect(t.opens).toHaveLength(2)
  // paneOpen was not saved: a second start with the same store does not open a pane on its own
  await start($)
  expect(t.opens).toHaveLength(2)
})

test('a session id that is not a safe file name is never written, and said so once', async ($, on) => {
  const t = stubs(on, { ids: ['../x'] })
  await start($)
  await t.clock.advance(6000)
  expect(t.writes).toEqual([])
  expect(t.logs.filter(l => l.includes('not writing a state file'))).toHaveLength(1)
})

test('a pane the terminal places later is open once it is drawn, and animates', async ($, on) => {
  const t = stubs(on, { unplaced: true })
  await start($)
  await $.turn.start({ text: 'go', turnId: 't1' })
  await office($)
  await $.ui.mount({ ...PANE, surface: 'terminal' })
  await t.clock.advance(1000)
  expect(t.blits.length).toBeGreaterThanOrEqual(1)
})

// ── sharing with other accounts on this Mac ────────────────────────
// HOME in the stubs is /home/u, so this account is `u` and publishes under /Users/Shared/pixel-agents-u.

const NOW = 1_790_000_000_000
const THEIRS = `${SHARED}/pixel-agents-alex/sessions`
const entry = (name: string, over: Partial<Entry> = {}): Entry => ({ name, kind: 'file', size: 10, isLink: false, mtimeMs: NOW, ...over })
const dir = (name: string): Entry => entry(name, { kind: 'dir', size: 0, mtimeMs: 0 })
const snap = (sessionId: string, over: object = {}) => JSON.stringify({ ...quiet, sessionId, ...over })
const blocked = { activity: 'permission', detail: 'Bash: x', waiting: { kind: 'permission', tool: 'Bash', detail: 'Bash: x', at: 5 } }
const waits = (sessionId: string) => snap(sessionId, { agents: [{ ...quiet.agents[0], ...blocked, turnActive: true }] })
const underShared = (p: string) => p.startsWith(SHARED)
// one other account, alex, with these files; `files` maps a name to its content
const alex = (entries: readonly Entry[], files: Record<string, string> = {}) => ({
  lists: { [SHARED]: [dir('pixel-agents-alex'), dir('pixel-agents-u'), entry('.DS_Store')], [THEIRS]: entries, [MINE]: [], '/home/u/.claude/pixel-agents/sessions': [] },
  files: Object.fromEntries(Object.entries(files).map(([name, text]) => [`${THEIRS}/${name}`, text])),
})
const SHARE_ON = { prefs: { share: true } }
const countText = async ($: Engine) => {
  const term = await $.ui.mount({ ...PANE, surface: 'terminal' })
  const text = (await term.find({ type: 'Text', text: /sessions · / }))?.text
  await term.unmount()
  return text
}

test('with share off nothing is written, listed or read under /Users/Shared', async ($, on) => {
  const t = stubs(on, { ...alex([entry('f1.json')], { 'f1.json': waits('f1') }) })
  await start($)
  await t.clock.advance(6000)
  expect(t.writes.length).toBeGreaterThan(0)
  expect([t.writes.some(w => underShared(w.path)), t.listed.some(underShared), t.reads.some(underShared), t.statted.some(underShared), t.runs, t.proofs]).toEqual([false, false, false, false, [], []])
})

for (const bad of ['yes', 1, null, {}]) {
  test(`a stored share of ${JSON.stringify(bad)} is not on`, async ($, on) => {
    const t = stubs(on, { store: { prefs: { share: bad } }, ...alex([entry('f1.json')], { 'f1.json': waits('f1') }) })
    await start($)
    await t.clock.advance(6000)
    expect([t.writes.some(w => underShared(w.path)), t.listed.some(underShared)]).toEqual([false, false])
  })
}

test('with share on, the snapshot goes to the shared folder without its cwd, and the own file keeps it', async ($, on) => {
  const t = stubs(on, { store: SHARE_ON })
  await start($)
  await t.clock.advance(1100)
  const shared = t.writes.filter(w => w.path === `${MINE}/s1.json`)
  const own = t.writes.filter(w => w.path === '/home/u/.claude/pixel-agents/sessions/s1.json')
  expect(shared.length).toBeGreaterThan(0)
  expect(JSON.parse(shared.at(-1)!.text).cwd).toBe('')
  expect(JSON.parse(own.at(-1)!.text).cwd).toBe('/work/repo')
  // only cwd differs
  expect(JSON.parse(shared.at(-1)!.text)).toEqual({ ...JSON.parse(own.at(-1)!.text), cwd: '' })
})

test('a waiting session of another account shows in the count and as alex:api, with no band alert and no toast', async ($, on) => {
  const t = stubs(on, { store: SHARE_ON, ...alex([entry('f1.json')], { 'f1.json': waits('f1') }) })
  await start($)
  await t.clock.advance(1100)
  await t.clock.advance(1100)
  await office($)
  expect(await countText($)).toBe('2 sessions · 2 agents · 1 shared')
  const desk = await $.ui.mount({ ...PANE, surface: 'desktop' })
  expect(await desk.find({ type: 'Text', text: /alex:api/ })).toBeDefined()
  const band = await $.ui.mount({ ...BAND, surface: 'terminal' })
  expect([await band.find({ type: 'Text', text: /waiting/ }), t.toasts]).toEqual([undefined, []])
})

test('the count has no shared part when no other account is live', async ($, on) => {
  stubs(on, { store: SHARE_ON, ...alex([]) })
  await start($)
  await office($)
  expect(await countText($)).toBe('1 sessions · 1 agents')
})

test('the demo replaces the other accounts too', async ($, on) => {
  stubs(on, { store: SHARE_ON, ...alex([entry('f1.json')], { 'f1.json': waits('f1') }) })
  await start($)
  await office($, 'demo')
  const text = await countText($)
  expect([text, text?.includes('shared')]).toEqual([expect.stringMatching(/^\d+ sessions · \d+ agents$/), false])
})

test('an oversize foreign file is not read, while a normal one next to it is', async ($, on) => {
  const t = stubs(on, { store: SHARE_ON, ...alex([entry('big.json', { size: 256 * 1024 + 1 }), entry('f1.json')], { 'big.json': snap('big'), 'f1.json': snap('f1') }) })
  await start($)
  await t.clock.advance(1100)
  expect(t.reads).toContain(`${THEIRS}/f1.json`)
  expect(t.reads).not.toContain(`${THEIRS}/big.json`)
})

test('a foreign file is read only when its name, size, age, content and session id all pass', async ($, on) => {
  const t = stubs(on, {
    store: SHARE_ON,
    ...alex(
      [entry('ok1.json'), entry('bad name.json'), entry('old1.json', { mtimeMs: NOW - 3_700_000 }), entry('mismatch.json'), entry('torn.json'), entry('notes.txt')],
      { 'ok1.json': snap('ok1'), 'bad name.json': snap('bad name'), 'old1.json': snap('old1'), 'mismatch.json': snap('other'), 'torn.json': '{"v":1,', 'notes.txt': snap('notes') },
    ),
  })
  await start($)
  await t.clock.advance(1100)
  await office($)
  // a refused file is read again on every poll, as in the own folder: the set is what matters
  expect([[...new Set(t.reads)].sort(), await countText($)]).toEqual([[`${THEIRS}/mismatch.json`, `${THEIRS}/ok1.json`, `${THEIRS}/torn.json`], '2 sessions · 2 agents · 1 shared'])
})

test('your own pixel-agents-u folder is never read as foreign', async ($, on) => {
  const t = stubs(on, {
    store: SHARE_ON,
    lists: { [SHARED]: [dir('pixel-agents-u')], [MINE]: [entry('s7.json')] },
    files: { [`${MINE}/s7.json`]: waits('s7') },
  })
  await start($)
  await t.clock.advance(1100)
  await office($)
  expect([t.reads, await countText($), t.toasts]).toEqual([[], '1 sessions · 1 agents', []])
})

test('a link in place of a foreign folder or file is never listed or read', async ($, on) => {
  const linkDir = `${SHARED}/pixel-agents-evil/sessions`
  const t = stubs(on, {
    store: SHARE_ON,
    lists: {
      [SHARED]: [entry('pixel-agents-evil', { kind: 'other', isLink: true, size: 0, mtimeMs: 0 }), entry('pixel-agents-alex', { kind: 'file' }), dir('pixel-agents-bob')],
      [linkDir]: [entry('e1.json')],
      [`${SHARED}/pixel-agents-bob/sessions`]: [entry('l1.json', { kind: 'other', isLink: true }), entry('b1.json')],
    },
    files: { [`${linkDir}/e1.json`]: snap('e1'), [`${SHARED}/pixel-agents-bob/sessions/l1.json`]: snap('l1'), [`${SHARED}/pixel-agents-bob/sessions/b1.json`]: snap('b1') },
  })
  await start($)
  await t.clock.advance(1100)
  expect(t.listed).not.toContain(linkDir)
  expect(t.listed).not.toContain(THEIRS)
  expect(t.reads).toEqual([`${SHARED}/pixel-agents-bob/sessions/b1.json`])
})

test('a foreign sessions folder that is a link, or not a folder, is never listed and none of its files are read', async ($, on) => {
  const [linked, plain] = [`${SHARED}/pixel-agents-x/sessions`, `${SHARED}/pixel-agents-y/sessions`]
  const t = stubs(on, {
    store: SHARE_ON,
    lists: { [SHARED]: [dir('pixel-agents-x'), dir('pixel-agents-y'), dir('pixel-agents-bob')], [linked]: [entry('x1.json')], [plain]: [entry('y1.json')], [`${SHARED}/pixel-agents-bob/sessions`]: [entry('b1.json')] },
    stats: { [linked]: { kind: 'dir', isLink: true }, [plain]: { kind: 'file' } },
    files: { [`${linked}/x1.json`]: snap('x1'), [`${plain}/y1.json`]: snap('y1'), [`${SHARED}/pixel-agents-bob/sessions/b1.json`]: snap('b1') },
  })
  await start($)
  await t.clock.advance(1100)
  expect([t.listed.includes(linked), t.listed.includes(plain)]).toEqual([false, false])
  expect(t.reads).toEqual([`${SHARED}/pixel-agents-bob/sessions/b1.json`])
})

test('foreign files never reach process.run, and an old x.json in the own shared folder is neither removed nor listed', async ($, on) => {
  const t = stubs(on, {
    store: SHARE_ON,
    lists: {
      [SHARED]: [dir('pixel-agents-alex'), dir('pixel-agents-u')],
      [THEIRS]: [entry('f1.json'), entry('f2.json', { mtimeMs: NOW - 3_700_000 }), entry('x;y.json')],
      [MINE]: [entry('x.json', { mtimeMs: NOW - 3_700_000 }), entry('old-1.json', { mtimeMs: NOW - 3_700_000 })],
    },
    files: { [`${THEIRS}/f1.json`]: waits('f1') },
  })
  await start($)
  await t.clock.advance(3000)
  expect([t.runs, t.listed.includes(MINE)]).toEqual([[], false])
})

// R13: the own shared folder may have been made by another account, or be a link into this account's home.
const unsafe = [
  ['a link', { isLink: true }],
  ['a link that lands elsewhere', { isLink: true, realPath: '/Users/u/.claude' }],
  ['reached through a link above it', { realPath: '/Users/u/.claude' }],
  ['not a folder', { kind: 'file' }],
] as const
for (const [why, over] of unsafe) {
  test(`an own shared folder that is ${why} gets no write and no rm, and one debug line`, async ($, on) => {
    const t = stubs(on, { store: SHARE_ON, stats: { [MINE]: over } })
    await start($)
    for (const _ of [1, 2, 3, 4]) await t.clock.advance(1000)
    expect([t.writes.some(w => underShared(w.path)), t.runs, t.logs.filter(l => l.includes('shared folder')).length]).toEqual([false, [], 1])
  })
}

test('an own shared folder that turns into a link after a write gets no rm when sharing stops', async ($, on) => {
  const t = stubs(on, { store: SHARE_ON })
  await start($)
  await t.clock.advance(1100)
  expect(t.writes.some(w => w.path === `${MINE}/s1.json`)).toBe(true)
  t.stats[MINE] = { isLink: true, realPath: '/Users/u/.claude' }
  t.store.set('prefs', { share: false })
  await t.clock.advance(1100)
  expect([t.runs, t.logs.filter(l => l.includes('shared folder')).length]).toEqual([[], 1])
})

test('an own shared folder that is not there yet is written to, which makes it', async ($, on) => {
  const t = stubs(on, { store: SHARE_ON, stats: { [MINE]: null } })
  await start($)
  await t.clock.advance(1100)
  expect([t.writes.some(w => w.path === `${MINE}/s1.json`), t.logs.filter(l => l.includes('shared folder'))]).toEqual([true, []])
})

test('turning s off removes this session\'s shared file and nothing else, and it stays off', async ($, on) => {
  const t = stubs(on, { store: SHARE_ON })
  await start($)
  await office($)
  const term = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await t.clock.advance(1100)
  expect(t.runs).toEqual([])
  await term.press({ key: 's' })
  await t.clock.advance(1100)
  expect(t.runs).toEqual([['rm', '-f', `${MINE}/s1.json`]])
  const sharedWrites = t.writes.filter(w => underShared(w.path)).length
  await t.clock.advance(6000)
  expect([t.runs.length, t.writes.filter(w => underShared(w.path)).length]).toEqual([1, sharedWrites])
  await term.press({ key: 's' })
  await t.clock.advance(6000)
  expect(t.writes.filter(w => underShared(w.path)).length).toBeGreaterThan(sharedWrites)
})

test('the share button sits between hd and demo', async ($, on) => {
  stubs(on)
  await start($)
  await office($)
  const term = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect((await term.findAll({ type: 'Button' })).map(b => b.props.label)).toEqual(['zoom', 'theme', 'labels', 'effects', 'hd', 'share', 'demo'])
})

test('/office share toggles sharing, opens the pane, and remembers it', async ($, on) => {
  const t = stubs(on)
  await start($)
  await office($, 'share')
  expect(t.opens).toHaveLength(1)
  await t.clock.advance(6000)
  expect(t.writes.some(w => w.path === `${MINE}/s1.json`)).toBe(true)
  expect(t.store.get('prefs')).toMatchObject({ share: true })
  await office($, 'share')
  await t.clock.advance(1100)
  expect([t.runs, t.store.get('prefs')]).toEqual([[['rm', '-f', `${MINE}/s1.json`]], expect.objectContaining({ share: false })])
})

test('another session turning share off in the store makes this one remove its file, and takes nothing else from the store', async ($, on) => {
  const t = stubs(on, { store: { prefs: { share: true, hd: false } }, ...alex([entry('f1.json')], { 'f1.json': waits('f1') }) })
  await start($)
  await t.clock.advance(1100)
  expect([t.runs, await countText($)]).toEqual([[], '2 sessions · 2 agents · 1 shared'])
  t.store.set('prefs', { share: false, hd: true, theme: 'warm' })
  await t.clock.advance(1100)
  expect(t.runs).toEqual([['rm', '-f', `${MINE}/s1.json`]])
  const term = await $.ui.mount({ ...PANE, surface: 'terminal' })
  // the other account is gone from the office, and the hd flag the store now holds was not taken
  expect([await term.find({ type: 'Text', text: /shared/ }), await term.find({ type: 'Image' })]).toEqual([undefined, undefined])
})

test('a missing /Users/Shared throws nothing and logs one line however many polls fail', async ($, on) => {
  const t = stubs(on, { store: SHARE_ON, lists: {}, failShared: true })
  await start($)
  for (const _ of [1, 2, 3, 4]) await t.clock.advance(1000)
  expect(t.logs.filter(l => l.includes('shared folder'))).toHaveLength(1)
  // the own state file is a separate matter and still gets written
  expect([t.writes.some(w => w.path === '/home/u/.claude/pixel-agents/sessions/s1.json'), t.logs.some(l => l.includes('could not write the state file'))]).toEqual([true, false])
})

test('session.end with sharing on writes only the own file, then removes this session\'s shared file with one stat and one rm, and reads nothing', async ($, on) => {
  const t = stubs(on, { store: SHARE_ON })
  await start($)
  await t.clock.advance(300)
  const [writes, reads, runs, stats] = [t.writes.length, t.reads.length, t.runs.length, t.statted.length]
  await $.session.end({ reason: 'other', sessionId: 's1', resume: { id: 's1' } })
  expect(t.writes.slice(writes).map(w => [w.path, JSON.parse(w.text).endedAt !== undefined])).toEqual([['/home/u/.claude/pixel-agents/sessions/s1.json', true]])
  expect([t.reads.length - reads, t.statted.length - stats, t.runs.slice(runs)]).toEqual([0, 1, [['rm', '-f', `${MINE}/s1.json`]]])
  // no ended snapshot ever went to the shared folder
  expect(t.writes.filter(w => underShared(w.path) && JSON.parse(w.text).endedAt !== undefined)).toEqual([])
})

for (const source of ['clear', 'resume', 'fork'] as const) {
  test(`a new session id after ${source} removes the previous id's shared file, shares the new one, and later removes that`, async ($, on) => {
    const t = stubs(on, { ids: ['s1', 's9'], store: SHARE_ON })
    on('classic.SessionStart', () => ({}))
    await start($)
    await t.clock.advance(1100)
    await $.classic.SessionStart({ source })
    await t.clock.advance(1100)
    const shared = t.writes.filter(w => underShared(w.path))
    expect([t.runs, shared.some(w => w.path === `${MINE}/s9.json`), shared.some(w => JSON.parse(w.text).endedAt !== undefined)]).toEqual([[['rm', '-f', `${MINE}/s1.json`]], true, false])
    t.store.set('prefs', { share: false })
    await t.clock.advance(1100)
    expect(t.runs.at(-1)).toEqual(['rm', '-f', `${MINE}/s9.json`])
  })
}

test('a shared write that fails while the list works logs one line however many polls fail, and leaves nothing to remove', async ($, on) => {
  const t = stubs(on, { store: SHARE_ON, failShared: true, ...alex([entry('f1.json')], { 'f1.json': waits('f1') }) })
  await start($)
  for (const _ of [1, 2, 3, 4]) await t.clock.advance(1000)
  expect(t.logs.filter(l => l.includes('shared folder'))).toHaveLength(1)
  await office($)
  expect(await countText($)).toBe('2 sessions · 2 agents · 1 shared')
  // nothing was written, so sharing off has no file to remove
  t.store.set('prefs', { share: false })
  await t.clock.advance(1100)
  expect(t.runs).toEqual([])
})

test('a session id that is not a safe file name is not written to the shared folder either', async ($, on) => {
  const t = stubs(on, { ids: ['../x'], store: SHARE_ON })
  await start($)
  await t.clock.advance(6000)
  expect(t.writes).toEqual([])
})

// R14: the own shared folders are proven to be this account's before anything is trusted there. `proof` says
// what the stat process answers for a path; this account is uid 501.
const refused = [
  ['owned by another uid', { [MINE]: '502 755 Directory' }],
  ['owned by another uid, one level up', { [PARENT]: '502 755 Directory' }],
  ['writable by its group (775)', { [MINE]: '501 775 Directory' }],
  ['writable by everyone (777), one level up', { [PARENT]: '501 777 Directory' }],
  ['writable by others only (757)', { [MINE]: '501 757 Directory' }],
  ['a link, one level up', { [PARENT]: '501 755 Symbolic Link' }],
  ['a link to somewhere else', { [MINE]: '501 755 Symbolic Link' }],
  ['a plain file', { [MINE]: '501 644 Regular File' }],
] as const
const refusal = (t: ReturnType<typeof stubs>) => t.logs.filter(l => l.includes('not this account\'s own folder'))

for (const [why, proof] of refused) {
  test(`an own shared folder that is ${why} is refused: no shared write, no rm, one debug line, one proof`, async ($, on) => {
    const t = stubs(on, { store: SHARE_ON, proof })
    await start($)
    for (const _ of [1, 2, 3, 4]) await t.clock.advance(1000)
    t.store.set('prefs', { share: false })
    await t.clock.advance(1100)
    expect([t.writes.some(w => underShared(w.path)), t.runs, refusal(t).length, t.proofs.length]).toEqual([false, [], 1, 1])
  })
}

const unproven = [['exit', 'a non-zero exit'], ['garbage', 'garbage output'], ['partial', 'a non-zero exit that still printed every line'], ['short', 'too few lines']] as const
for (const [statFail, what] of unproven) {
  test(`a proof that ends with ${what} is refused`, async ($, on) => {
    const t = stubs(on, { store: SHARE_ON, statFail })
    await start($)
    for (const _ of [1, 2, 3, 4]) await t.clock.advance(1000)
    expect([t.writes.some(w => underShared(w.path)), t.runs, refusal(t).length]).toEqual([false, [], 1])
  })
}

test('folders that exist are proven before the first write and after it, and then no more stat processes run', async ($, on) => {
  // 700 is fine: nobody but the owner can write
  const t = stubs(on, { store: SHARE_ON, proof: { [MINE]: '501 700 Directory' } })
  await start($)
  expect(t.order.slice(0, 3)).toEqual([`proof ${PARENT} ${MINE}`, `write ${MINE}/s1.json`, `proof ${PARENT} ${MINE}`])
  for (const _ of [1, 2, 3, 4, 5, 6]) await t.clock.advance(1000)
  expect([t.proofs.length, t.writes.filter(w => underShared(w.path)).length > 1, refusal(t)]).toEqual([2, true, []])
})

test('only the folder that exists is proven before the first write', async ($, on) => {
  const t = stubs(on, { store: SHARE_ON, stats: { [MINE]: null } })
  await start($)
  expect(t.order.slice(0, 3)).toEqual([`proof ${PARENT}`, `write ${MINE}/s1.json`, `proof ${PARENT} ${MINE}`])
})

test('missing folders: the write goes ahead, the proof runs right after it, the folders are trusted from then on, and sharing off removes the file', async ($, on) => {
  const t = stubs(on, { store: SHARE_ON, stats: { [PARENT]: null, [MINE]: null } })
  await start($)
  for (const _ of [1, 2, 3, 4, 5, 6]) await t.clock.advance(1000)
  expect(t.order.slice(0, 2)).toEqual([`write ${MINE}/s1.json`, `proof ${PARENT} ${MINE}`])
  expect([t.proofs.length, t.writes.filter(w => underShared(w.path)).length > 1]).toEqual([1, true])
  t.store.set('prefs', { share: false })
  await t.clock.advance(1100)
  expect(t.runs).toEqual([['rm', '-f', `${MINE}/s1.json`]])
})

test('folders that turn out not to be ours right after the first write are refused, that file is left alone, and sharing off removes nothing', async ($, on) => {
  const t = stubs(on, { store: SHARE_ON, stats: { [PARENT]: null, [MINE]: null }, proof: { [PARENT]: '502 755 Directory' } })
  await start($)
  for (const _ of [1, 2, 3, 4, 5, 6]) await t.clock.advance(1000)
  expect([t.order.slice(0, 2), t.writes.filter(w => underShared(w.path)).length, refusal(t).length]).toEqual([[`write ${MINE}/s1.json`, `proof ${PARENT} ${MINE}`], 1, 1])
  t.store.set('prefs', { share: false })
  await t.clock.advance(1100)
  expect(t.runs).toEqual([])
})

test('a file whose proof is still running is not removed: nothing is removed before the folders are proven', async ($, on) => {
  const t = stubs(on, { store: SHARE_ON, stats: { [PARENT]: null, [MINE]: null }, proofDelayMs: 500 })
  const starting = start($)
  await t.clock.settle()
  expect(t.writes.some(w => w.path === `${MINE}/s1.json`)).toBe(true)
  await $.session.end({ reason: 'other', sessionId: 's1', resume: { id: 's1' } })
  expect(t.runs).toEqual([])
  await t.clock.advance(1000)
  await starting
})
