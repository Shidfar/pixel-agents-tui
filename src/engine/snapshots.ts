// Helpers over the per-session state files. Pure: callers pass the clock in.
import type { Alert, Snapshot, Stats } from './types'

export const STALE_MS = 20_000
export const DONE_KEEP_MS = 60_000

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)

// Shallow check only: enough that a viewer can read the context and walk the agents (and
// sanitize their labels) without throwing. The files are written by another process and may
// be torn, so anything unexpected is a miss.
export function parseSnapshot(text: string): Snapshot | null {
  try {
    const j: unknown = JSON.parse(text)
    if (!isObject(j)) return null
    const ok = j.v === 1
      && typeof j.sessionId === 'string' && typeof j.name === 'string' && typeof j.cwd === 'string'
      && typeof j.startedAt === 'number' && typeof j.updatedAt === 'number' && typeof j.nextEffectId === 'number'
      && Array.isArray(j.agents) && Array.isArray(j.effects) && isObject(j.stats) && isObject(j.context)
      && j.agents.every(a => isObject(a) && typeof a.id === 'string' && typeof a.label === 'string' && typeof a.activity === 'string' && isObject(a.inFlight))
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
