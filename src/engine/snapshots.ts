// Helpers over the per-session state files. Pure: callers pass the clock in.
import type { Activity, Agent, AgentKind, Alert, EffectKind, Snapshot, Stats, Waiting } from './types'

export const STALE_MS = 20_000
export const DONE_KEEP_MS = 60_000

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)

// Everything below is checked, to the leaves: the files are written by another process and may be
// torn or from a newer build, and a viewer (the binary or the mod pane) must never crash on one.
// A miss anywhere is a miss for the whole file, so the caller keeps its last good copy. Unknown
// extra fields are fine (forward compatibility within v1).
const isStr = (x: unknown): x is string => typeof x === 'string'
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)
// JSON has no undefined, so an optional field is either missing or valid: null is not "absent".
const optional = (x: unknown, ok: (v: unknown) => boolean): boolean => x === undefined || ok(x)

// Record<T, true> makes the compiler demand every member of the union. Own keys only, so
// 'constructor' and '__proto__' are not members.
const members = <T extends string>(record: Record<T, true>) => {
  const names = new Set<string>(Object.keys(record))
  return (x: unknown): x is T => isStr(x) && names.has(x)
}
const isActivity = members<Activity>({ idle: true, thinking: true, typing: true, running: true, reading: true, permission: true, question: true, planning: true, compacting: true, delegating: true })
const isAgentKind = members<AgentKind>({ main: true, sub: true, teammate: true })
const isEffectKind = members<EffectKind>({ spawn: true, done: true, error: true, commit: true, push: true, testPass: true, testFail: true, message: true, compact: true })
const isWaitingKind = members<Waiting['kind']>({ permission: true, question: true })
const isMode = members<NonNullable<Agent['mode']>>({ planning: true, compacting: true })

const isInFlight = (x: unknown): boolean => isObject(x) && isStr(x.tool) && isStr(x.detail) && isNum(x.startedAt)
const isWaiting = (x: unknown): boolean => isObject(x) && isWaitingKind(x.kind) && isStr(x.tool) && isStr(x.detail) && isNum(x.at)
const isAgent = (x: unknown): boolean =>
  isObject(x) && isStr(x.id) && isAgentKind(x.kind) && isStr(x.label) && optional(x.parent, isStr)
  && isActivity(x.activity) && optional(x.detail, isStr) && isNum(x.since) && typeof x.turnActive === 'boolean'
  && isObject(x.inFlight) && Object.values(x.inFlight).every(isInFlight)
  && optional(x.waiting, isWaiting) && optional(x.mode, isMode) && optional(x.doneAt, isNum)
const isEffect = (x: unknown): boolean => isObject(x) && isNum(x.id) && isEffectKind(x.kind) && isStr(x.agent) && optional(x.to, isStr) && isNum(x.at)
const isStats = (x: unknown): boolean =>
  isObject(x) && isStr(x.day) && isNum(x.tools) && isNum(x.edits) && isNum(x.commits) && isNum(x.permits) && isNum(x.errors)
const isContext = (x: unknown): boolean => isObject(x) && (x.percent === null || isNum(x.percent))

export function parseSnapshot(text: string): Snapshot | null {
  try {
    const j: unknown = JSON.parse(text)
    if (!isObject(j)) return null
    const ok = j.v === 1
      && isStr(j.sessionId) && isStr(j.name) && isStr(j.cwd)
      && isNum(j.startedAt) && isNum(j.updatedAt) && optional(j.endedAt, isNum) && isNum(j.nextEffectId)
      && isContext(j.context) && isStats(j.stats)
      && Array.isArray(j.agents) && j.agents.every(isAgent)
      && Array.isArray(j.effects) && j.effects.every(isEffect)
    return ok ? (j as unknown as Snapshot) : null
  } catch {
    return null
  }
}

export function isStale(s: Snapshot, now: number): boolean {
  return s.endedAt !== undefined || now - s.updatedAt > STALE_MS
}

export function alertsFor(snaps: readonly Snapshot[], selfSessionId: string | null, now: number): Alert[] {
  return snaps
    .filter(s => s.sessionId !== selfSessionId && !isStale(s, now))
    .flatMap(s => s.agents.flatMap(a => (a.waiting ? [{ sessionId: s.sessionId, name: s.name, kind: a.waiting.kind, detail: a.waiting.detail, at: a.waiting.at }] : [])))
    .sort((x, y) => x.at - y.at)
}

export function aggregateStats(snaps: readonly Snapshot[], day: string): Stats {
  const zero: Stats = { day, tools: 0, edits: 0, commits: 0, permits: 0, errors: 0 }
  return snaps
    .filter(s => s.stats.day === day)
    .reduce((t, { stats: s }) => ({ day, tools: t.tools + s.tools, edits: t.edits + s.edits, commits: t.commits + s.commits, permits: t.permits + s.permits, errors: t.errors + s.errors }), zero)
}

// Duplicates get -2, -3, … (not a middle dot: it is not an allowed cell character).
export function sessionName(cwd: string, repoRoot: string | null, taken: readonly string[]): string {
  const last = (repoRoot ?? cwd).split(/[\\/]/).filter(Boolean).pop() ?? ''
  const base = sanitizeText(last, 16) || 'session'
  const free = (n: number): string => {
    const candidate = n === 1 ? base : `${base}-${n}`
    return taken.includes(candidate) ? free(n + 1) : candidate
  }
  return free(1)
}

// Cells can only draw printable ASCII plus these four; everything else would paint as '?' anyway,
// so say so up front and keep the width predictable. Iterates code points: one emoji is one '?'.
const EXTRA_CELL_CHARS = new Set(['…', '✓', '✗', '★'])
const cellChar = (ch: string): string => {
  const c = ch.codePointAt(0)!
  return (c >= 0x20 && c <= 0x7e) || EXTRA_CELL_CHARS.has(ch) ? ch : '?'
}

export function sanitizeText(s: string, max: number): string {
  const cs = [...s].map(cellChar)
  if (cs.length <= max) return cs.join('')
  return max < 1 ? '' : cs.slice(0, max - 1).join('') + '…'
}
