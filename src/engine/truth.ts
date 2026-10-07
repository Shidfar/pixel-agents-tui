// The truth model: Claude Code events in, one session Snapshot out. Pure: the shell passes the
// clock and the local day in, and nothing here touches its input.
import { DONE_KEEP_MS, lastSegment, sanitizeText, zeroStats } from './snapshots'
import type { Activity, Agent, EffectKind, InFlight, Json, Snapshot, Stats, ToolClass, TruthContext, TruthEvent, Waiting } from './types'

export const EFFECT_RING = 32

const MAIN = 'main'
const EDIT_TOOLS = new Set(['Edit', 'MultiEdit', 'Write', 'NotebookEdit'])
const RUNNING_TOOLS = new Set(['Bash', 'BashOutput', 'KillShell'])
const READING_TOOLS = new Set(['Read', 'Grep', 'Glob', 'LS', 'WebFetch', 'WebSearch', 'ToolSearch'])
const TEST_RE = /\b(npm|pnpm|yarn|bun)\s+(run\s+)?test\b|\bgo\s+test\b|\bpytest\b|\bcargo\s+test\b|\bmake\s+test\b|\bvitest\b|\bjest\b|\bclaude\s+plugin\s+test\b/
const COMMIT_RE = /\bgit\s+commit\b/
const PUSH_RE = /\bgit\s+push\b/
const MCP_RE = /^mcp__(.+?)__(.+)$/

// ── Tools ──────────────────────────────────────────────────────────

export function toolClass(tool: string): ToolClass {
  if (RUNNING_TOOLS.has(tool)) return 'running'
  if (READING_TOOLS.has(tool)) return 'reading'
  if (tool === 'AskUserQuestion') return 'question'
  if (tool === 'Agent' || tool === 'Task') return 'delegating'
  return 'typing'
}

// Tool input is opaque JSON from another process: read only what a label needs, and only if it is a string.
const str = (v: unknown): string => (typeof v === 'string' ? v : '')
const firstOf = (...vs: readonly unknown[]): string => vs.map(str).find(s => s !== '') ?? ''
const hostOf = (url: string): string => {
  try {
    return new URL(url).hostname
  } catch {
    return 'web'
  }
}

const rawDetail = (tool: string, i: Json): string => {
  switch (tool) {
    case 'Read': return `Reading ${lastSegment(str(i.file_path))}`
    case 'Edit':
    case 'MultiEdit': return `Editing ${lastSegment(str(i.file_path))}`
    case 'Write': return `Writing ${lastSegment(str(i.file_path))}`
    case 'NotebookEdit': return `Editing ${lastSegment(str(i.notebook_path))}`
    case 'Bash': return (str(i.command).split('\n')[0] ?? '').trim()
    case 'Grep': return `Grep ${str(i.pattern)}`
    case 'Glob': return `Glob ${str(i.pattern)}`
    case 'LS': return `List ${lastSegment(str(i.path))}`
    case 'WebFetch': return hostOf(str(i.url))
    case 'WebSearch': return `Search ${str(i.query)}`
    case 'Agent':
    case 'Task': return firstOf(i.description, i.subagent_type, 'subagent')
    case 'AskUserQuestion': {
      const q: unknown = Array.isArray(i.questions) ? i.questions[0] : undefined
      return firstOf(typeof q === 'object' && q !== null ? (q as Json).question : undefined, i.question)
    }
    case 'ToolSearch': return 'Loading tools'
    default: {
      const m = MCP_RE.exec(tool)
      return m ? `${m[1]}: ${m[2]}` : tool
    }
  }
}

export function describeTool(tool: string, input: Json): string {
  return sanitizeText(rawDetail(tool, input), 30)
}

// ── Activity ───────────────────────────────────────────────────────

// Ties on startedAt go to the later entry: parallel tools can start in the same millisecond.
const newest = (fs: readonly InFlight[]): InFlight | undefined =>
  fs.reduce<InFlight | undefined>((best, f) => (best === undefined || f.startedAt >= best.startedAt ? f : best), undefined)

export function activityOf(a: Agent): Activity {
  if (a.waiting) return a.waiting.kind
  if (a.mode) return a.mode
  const live = Object.values(a.inFlight)
  const working = newest(live.filter(f => toolClass(f.tool) !== 'delegating'))
  if (working) return toolClass(working.tool)
  if (live.length > 0) return 'delegating'
  return a.turnActive ? 'thinking' : 'idle'
}

// Recomputes what is derived: activity, its `since`, and the detail line.
const settle = (a: Agent, now: number): Agent => {
  const activity = activityOf(a)
  const detail = a.waiting?.detail ?? newest(Object.values(a.inFlight))?.detail
  const { detail: _old, ...rest } = a
  return { ...rest, activity, since: activity === a.activity ? a.since : now, ...(detail === undefined ? {} : { detail }) }
}

// ── Snapshot plumbing (copy on write) ──────────────────────────────

export function initialSnapshot(a: { sessionId: string; name: string; cwd: string; now: number; day: string }): Snapshot {
  const main: Agent = { id: MAIN, kind: 'main', label: sanitizeText(a.name, 16), activity: 'idle', since: a.now, turnActive: false, inFlight: {} }
  return {
    v: 1, sessionId: a.sessionId, name: a.name, cwd: a.cwd, startedAt: a.now, updatedAt: a.now,
    context: { percent: null }, agents: [main], effects: [], nextEffectId: 1, stats: zeroStats(a.day),
  }
}

const noWaiting = ({ waiting: _w, ...a }: Agent): Agent => a
const noMode = ({ mode: _m, ...a }: Agent): Agent => a

const blank = (id: string, now: number, over: Pick<Agent, 'kind' | 'label'> & Partial<Agent>): Agent =>
  ({ id, activity: 'idle', since: now, turnActive: false, inFlight: {}, ...over })

const putAgent = (s: Snapshot, a: Agent): Snapshot =>
  s.agents.some(x => x.id === a.id)
    ? { ...s, agents: s.agents.map(x => (x.id === a.id ? a : x)) }
    : { ...s, agents: [...s.agents, a] }

const withAgent = (s: Snapshot, id: string, f: (a: Agent) => Agent): Snapshot =>
  ({ ...s, agents: s.agents.map(a => (a.id === id ? f(a) : a)) })

// An agent we never saw (a mod reload dropped it, or the shell raced it) is recreated from the first event naming it.
const ensure = (s: Snapshot, id: string, now: number): Snapshot =>
  s.agents.some(a => a.id === id)
    ? s
    : putAgent(s, blank(id, now, { kind: 'sub', label: sanitizeText(`agent ${id.slice(0, 6)}`, 16), parent: MAIN, turnActive: true }))

const edit = (s: Snapshot, id: string, now: number, f: (a: Agent) => Agent): Snapshot => withAgent(ensure(s, id, now), id, f)

const count = (s: Snapshot, key: Exclude<keyof Stats, 'day'>): Snapshot => ({ ...s, stats: { ...s.stats, [key]: s.stats[key] + 1 } })

const addEffect = (s: Snapshot, kind: EffectKind, agent: string, now: number, to?: string): Snapshot => ({
  ...s,
  effects: [...s.effects, { id: s.nextEffectId, kind, agent, ...(to === undefined ? {} : { to }), at: now }].slice(-EFFECT_RING),
  nextEffectId: s.nextEffectId + 1,
})

// A turn that ends for a sub or teammate: it is done, and viewers walk it out.
const finish = (s: Snapshot, id: string, now: number): Snapshot =>
  edit(s, id, now, a => ({ ...noWaiting(a), doneAt: now, turnActive: false, inFlight: {} }))

const toolEndEffects = (tool: string, input: Json, ok: boolean): readonly EffectKind[] => {
  const cmd = tool === 'Bash' ? str(input.command) : ''
  const isTest = TEST_RE.test(cmd)
  return [
    ...(isTest ? [ok ? 'testPass' : 'testFail'] as const : []),
    ...(ok && COMMIT_RE.test(cmd) ? ['commit'] as const : []),
    ...(ok && PUSH_RE.test(cmd) ? ['push'] as const : []),
    ...(!ok && !isTest ? ['error'] as const : []),
  ]
}

const apply = (s: Snapshot, ev: TruthEvent): Snapshot => {
  switch (ev.type) {
    case 'turnStart':
      return withAgent(s, MAIN, a => ({ ...(a.mode === 'compacting' ? noMode(a) : a), turnActive: true }))

    case 'toolStart': {
      const id = ev.agentId ?? MAIN
      const detail = describeTool(ev.tool, ev.input)
      const asks: Waiting = { kind: 'question', tool: ev.tool, detail, at: ev.now }
      const s1 = edit(s, id, ev.now, a => ({
        ...a,
        turnActive: true,
        inFlight: { ...a.inFlight, [ev.toolUseId]: { tool: ev.tool, detail, startedAt: ev.now } },
        ...(ev.tool === 'AskUserQuestion' ? { waiting: asks } : {}),
      }))
      const s2 = count(s1, 'tools')
      return EDIT_TOOLS.has(ev.tool) ? count(s2, 'edits') : s2
    }

    case 'toolEnd': {
      const id = ev.agentId ?? MAIN
      const s1 = edit(s, id, ev.now, a => ({
        ...(a.waiting?.tool === ev.tool ? noWaiting(a) : a),
        inFlight: Object.fromEntries(Object.entries(a.inFlight).filter(([k]) => k !== ev.toolUseId)),
      }))
      const kinds = toolEndEffects(ev.tool, ev.input, ev.ok)
      const s2 = kinds.reduce((acc, k) => addEffect(acc, k, id, ev.now), s1)
      const s3 = kinds.includes('commit') ? count(s2, 'commits') : s2
      // Every failed end is one error: a failed test run (testFail) or any other failure (error).
      return ev.ok ? s3 : count(s3, 'errors')
    }

    case 'permissionAsk': {
      const id = ev.agentId ?? MAIN
      const waiting: Waiting = { kind: 'permission', tool: ev.tool, detail: sanitizeText(`${ev.tool}: ${describeTool(ev.tool, ev.input)}`, 30), at: ev.now }
      return count(edit(s, id, ev.now, a => ({ ...a, waiting })), 'permits')
    }

    case 'permissionDenied': {
      const id = ev.agentId ?? MAIN
      return count(addEffect(edit(s, id, ev.now, noWaiting), 'error', id, ev.now), 'errors')
    }

    case 'agentSeen': {
      const label = sanitizeText(ev.label, 16)
      return s.agents.some(a => a.id === ev.agentId)
        ? withAgent(s, ev.agentId, a => ({ ...a, label }))
        : putAgent(s, blank(ev.agentId, ev.now, { kind: ev.kind, label, ...(ev.parent === undefined ? {} : { parent: ev.parent }) }))
    }

    case 'spawn': {
      const a = blank(ev.agentId, ev.now, { kind: 'sub', label: sanitizeText(ev.label, 16), parent: ev.parent ?? MAIN, turnActive: true })
      return addEffect(putAgent(s, a), 'spawn', ev.agentId, ev.now)
    }

    case 'turnEnd': {
      if (ev.agentId !== undefined) return finish(s, ev.agentId, ev.now)
      const s1 = withAgent(s, MAIN, a => ({ ...noMode(noWaiting(a)), turnActive: false, inFlight: {} }))
      return ev.aborted ? s1 : addEffect(s1, 'done', MAIN, ev.now)
    }

    case 'subagentStop': {
      const a = s.agents.find(x => x.id === ev.agentId)
      return a === undefined || a.doneAt !== undefined ? s : finish(s, ev.agentId, ev.now)
    }

    case 'teammateIdle': {
      const label = sanitizeText(ev.label, 16)
      return { ...s, agents: s.agents.map(a => (a.kind === 'teammate' && a.label === label ? { ...a, turnActive: false } : a)) }
    }

    case 'message':
      return addEffect(s, 'message', ev.from, ev.now, ev.to)

    case 'compact':
      return addEffect(withAgent(s, MAIN, a => ({ ...a, mode: 'compacting' })), 'compact', MAIN, ev.now)

    case 'planMode':
      return withAgent(s, MAIN, a => (ev.on ? { ...a, mode: 'planning' } : a.mode === 'planning' ? noMode(a) : a))

    case 'context':
      return { ...s, context: { percent: ev.percent } }

    case 'end':
      return { ...s, endedAt: ev.now }
  }
}

export function reduce(s: Snapshot, ev: TruthEvent, ctx: TruthContext): Snapshot {
  // A new local day zeroes the counters before this event counts.
  const stats = s.stats.day === ctx.day ? s.stats : zeroStats(ctx.day)
  const next = apply({ ...s, updatedAt: ev.now, stats }, ev)
  return { ...next, agents: next.agents.map(a => settle(a, ev.now)) }
}

export function prune(s: Snapshot, now: number): Snapshot {
  const keep = s.agents.filter(a => a.doneAt === undefined || now - a.doneAt <= DONE_KEEP_MS)
  return keep.length === s.agents.length ? s : { ...s, agents: keep }
}
