// A scripted crew for `/office demo` and the binary's --demo: four fake sessions replaying one
// 60 s script of events through the real reducer, so the demo can never drift from the truth model.
import { initialSnapshot, reduce } from './truth'
import type { Bare, Json, Snapshot } from './types'

const CYCLE_MS = 60_000
// Effect ids restart each cycle; this offset keeps them increasing across cycles (a cycle adds far fewer).
const IDS_PER_CYCLE = 1000

type Step = { readonly at: number; readonly session: number; readonly ev: Bare }

const SESSIONS = ['api-service', 'web-app', 'infra', 'docs'] as const

const step = (session: number, at: number, ev: Bare): Step => ({ at, session, ev })

// A tool call from `at` for `ms`. `agentId` is left out for the main agent.
const tool = (session: number, at: number, ms: number, id: string, name: string, input: Json, opts: { agentId?: string; ok?: boolean } = {}): readonly Step[] => {
  const who = opts.agentId === undefined ? {} : { agentId: opts.agentId }
  return [
    step(session, at, { type: 'toolStart', toolUseId: id, tool: name, input, ...who }),
    step(session, at + ms, { type: 'toolEnd', toolUseId: id, tool: name, input, ok: opts.ok ?? true, ...who }),
  ]
}

// A sub alternates two tools every 4 s, 2 s each, `n` times from `from`.
const subWork = (session: number, agentId: string, from: number, n: number, a: string, ai: Json, b: string, bi: Json): readonly Step[] =>
  Array.from({ length: n }, (_, i) => tool(session, from + i * 4_000, 2_000, `${agentId}-${i}`, i % 2 === 0 ? a : b, i % 2 === 0 ? ai : bi, { agentId })).flat()

const API = 0, WEB = 1, INFRA = 2, DOCS = 3

const api: readonly Step[] = [
  step(API, 0, { type: 'turnStart' }),
  ...tool(API, 2_000, 2_000, 'a1', 'Edit', { file_path: 'src/server.ts' }),
  ...tool(API, 8_000, 2_000, 'a2', 'Edit', { file_path: 'src/routes.ts' }),
  ...tool(API, 14_000, 2_000, 'a3', 'Edit', { file_path: 'tests/api.test.ts' }),
  ...tool(API, 20_000, 4_000, 'a4', 'Bash', { command: 'npm test' }),
  ...tool(API, 34_000, 1_000, 'a5', 'Bash', { command: 'git commit -m "Add health route"' }),
  step(API, 50_000, { type: 'turnEnd', aborted: false }),
]

// Main reads and greps every 3 s; two subs arrive at 10 s and leave at 38 s and 44 s.
const web: readonly Step[] = [
  step(WEB, 0, { type: 'turnStart' }),
  ...Array.from({ length: 18 }, (_, i) => {
    const at = (i + 1) * 3_000
    return i % 2 === 0
      ? tool(WEB, at, 2_000, `w${i}`, 'Read', { file_path: `src/view${i}.tsx` })
      : tool(WEB, at, 2_000, `w${i}`, 'Grep', { pattern: 'useState' })
  }).flat(),
  step(WEB, 10_000, { type: 'spawn', agentId: 'web-sub-1', label: 'find callers' }),
  step(WEB, 10_000, { type: 'spawn', agentId: 'web-sub-2', label: 'check styles' }),
  step(WEB, 15_000, { type: 'message', from: 'main', to: 'web-sub-1' }),
  ...subWork(WEB, 'web-sub-1', 12_000, 6, 'Grep', { pattern: 'render' }, 'Read', { file_path: 'src/render.ts' }),
  ...subWork(WEB, 'web-sub-2', 13_000, 8, 'Read', { file_path: 'src/theme.css' }, 'Grep', { pattern: 'color' }),
  step(WEB, 38_000, { type: 'turnEnd', agentId: 'web-sub-1', aborted: false }),
  step(WEB, 44_000, { type: 'turnEnd', agentId: 'web-sub-2', aborted: false }),
  step(WEB, 58_000, { type: 'turnEnd', aborted: false }),
]

// No turn events: the table gives only tool and permission times, so main is idle until the first tool.
const infra: readonly Step[] = [
  step(INFRA, 5_000, { type: 'toolStart', toolUseId: 'i1', tool: 'Bash', input: { command: 'terraform plan' } }),
  step(INFRA, 6_000, { type: 'permissionAsk', tool: 'Bash', input: { command: 'terraform plan' } }),
  step(INFRA, 26_000, { type: 'toolEnd', toolUseId: 'i1', tool: 'Bash', input: { command: 'terraform plan' }, ok: true }),
  ...tool(INFRA, 40_000, 3_000, 'i2', 'Bash', { command: 'npm test' }, { ok: false }),
]

// Context climbs 10 -> 95 in 12 steps, 5 s apart (the last lands at 55 s).
const context: readonly Step[] = Array.from({ length: 12 }, (_, i) =>
  step(DOCS, i * 5_000, { type: 'context', percent: Math.round(10 + (85 * i) / 11) }))

const docs: readonly Step[] = [
  ...context,
  step(DOCS, 30_000, { type: 'turnStart' }),
  step(DOCS, 30_000, { type: 'planMode', on: true }),
  step(DOCS, 38_000, { type: 'planMode', on: false }),
  ...[38_000, 41_000, 44_000, 47_000].flatMap((at, i) => tool(DOCS, at, 2_000, `d${i}`, 'Write', { file_path: `docs/page${i}.md` })),
  step(DOCS, 50_000, { type: 'turnEnd', aborted: false }),
]

// Array.prototype.sort is stable: events sharing a time keep the order written above.
const SCRIPT: readonly Step[] = [...api, ...web, ...infra, ...docs].sort((a, b) => a.at - b.at)

export function demoSnapshots(now: number, t0: number, day: string): Snapshot[] {
  const elapsed = Math.max(0, now - t0)
  const cycle = Math.floor(elapsed / CYCLE_MS)
  const base = t0 + cycle * CYCLE_MS
  const upTo = elapsed - cycle * CYCLE_MS
  return SESSIONS.map((name, n) => {
    const start = { ...initialSnapshot({ sessionId: `demo-${n + 1}`, name, cwd: `/demo/${name}`, now: base, day }), nextEffectId: 1 + cycle * IDS_PER_CYCLE }
    const replayed = SCRIPT
      .filter(st => st.session === n && st.at <= upTo)
      .reduce((s, st) => reduce(s, { ...st.ev, now: base + st.at }, { day }), start)
    return { ...replayed, updatedAt: now }
  })
}
