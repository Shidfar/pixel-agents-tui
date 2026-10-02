import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

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

// Stubs for everything the mod calls; returns the captured writes, opens and toasts.
// Stubs must all be registered before the test's first call on $, so variations come in through opts.
type Opts = {
  files?: Record<string, string>; blitDeny?: boolean; ids?: readonly string[]
  store?: Record<string, unknown>; env?: Record<string, string>; ageMs?: number   // used by the tests below the plan's nine
}
function stubs(on: On, opts: Opts = {}) {
  const files = opts.files ?? {}
  const ids = opts.ids ?? ['s1']
  const n = { list: 0, id: 0 }
  const writes: { path: string; text: string }[] = [], opens: unknown[] = [], toasts: string[] = [], blits: number[] = []
  const reads: string[] = [], runs: (readonly string[])[] = [], blitArgs: unknown[] = []
  const clock = mock.clock(on, { now: 1_790_000_000_000 })
  mock.store(on, opts.store ?? {})
  mock.env(on, { HOME: '/home/u', ...opts.env })
  on('session.start', () => ({ cwd: '/work/repo' }))
  on('session.end', () => ({ sessionId: ids[0]! }))
  on('turn.start', () => ({ turnId: 't1' }))
  on('session.id', () => ({ value: ids[Math.min(n.id++, ids.length - 1)]! }))
  on('session.cwd', () => ({ value: '/work/repo' }))
  on('session.repo', () => ({ value: { root: '/work/repo', remote: null, internal: false, name: null } }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: 1, window: 10, percent: 10 }, rateLimits: [] } }))
  on('command.register', () => ({ value: { command: 'office' } }))
  on('fs.write', ($, e) => { writes.push({ path: e.path, text: e.text }); return { value: undefined } })
  // mtime moves on every listing, so the mod re-reads each file every poll
  on('fs.list', () => { n.list += 1; return { value: Object.keys(files).map(name => ({ name, kind: 'file' as const, size: 10, isLink: false, mtimeMs: 1_790_000_000_000 + n.list - (opts.ageMs ?? 0) })) } })
  on('fs.read', ($, e) => { reads.push(e.path); return { value: files[e.path.split('/').pop()!] ?? '' } })
  on('process.run', ($, e) => { runs.push(e.argv); return { value: { exitCode: 0, stdout: '', stderr: '', isStdoutTruncated: false, isStderrTruncated: false } } })
  on('agent.list', () => ({ value: [] }))
  on('ui.open', ($, e) => { opens.push(e); return { value: { isPlaced: true as const } } })
  on('ui.close', () => ({ value: undefined }))
  on('ui.blit', ($, e) => { blits.push(1); blitArgs.push(e); return opts.blitDeny ? { deny: 'size mismatch' } : { value: {} } })
  on('ui.toast', ($, e) => { toasts.push(e.text); return { value: undefined } })
  on('ui.log', () => ({ value: undefined }))
  on('ui.render', () => ({ type: 'Text', props: {}, children: ['drawn by Claude Code'] }))
  const last = () => JSON.parse(writes.filter(w => w.path.endsWith('/s1.json')).at(-1)!.text)
  return { writes, opens, toasts, blits, blitArgs, reads, runs, clock, last }
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
