// The mod shell: the only file that touches `$`. It turns hook events into truth events,
// shares this session's snapshot through ~/.claude/pixel-agents/sessions, reads the other
// sessions' files, and paints the office into a docked pane.
import type { Elements, EngineInterface, On, UiBlitArgs } from 'claude-code'
import { demoSnapshots } from '../src/engine/demo'
import { encodeCells, toCells, toRgba, updateCamera } from '../src/engine/render'
import { hashString } from '../src/engine/rng'
import { createSim } from '../src/engine/sim'
import type { Sim } from '../src/engine/sim'
import { alertsFor, isStale, parseSnapshot, sessionName } from '../src/engine/snapshots'
import { initialSnapshot, prune, reduce } from '../src/engine/truth'
import { DEFAULT_PREFS } from '../src/engine/types'
import type { Alert, Camera, CameraMode, Prefs, Snapshot, ThemeName, TruthEvent } from '../src/engine/types'
import { defaultWorld } from '../src/engine/world'

type Ctx = EngineInterface
type Els = Elements['terminal']
type Bare = TruthEvent extends infer E ? (E extends { readonly now: number } ? Omit<E, 'now'> : never) : never

const PANE_ID = 'pixel-agents'
const LOG = 'pixel-agents: '
const HOUR_MS = 3_600_000
const BLIT_BACKOFF_MS = 1000
const THEMES: readonly ThemeName[] = ['default', 'warm', 'cool', 'dark', 'light']
const CAMERAS: readonly CameraMode[] = ['auto', 'fit', 'x2', 'x1']
const WORLD = defaultWorld()

// All module state lives here; a reload empties it and the next events rebuild it.
// `pane.cols === 0` means no mounted size is known, so nothing is blitted.
const S = {
  id: '',
  home: '',
  dir: '',
  snap: null as Snapshot | null,
  others: new Map<string, { snap: Snapshot; mtimeMs: number }>(),
  sim: null as Sim | null,
  cam: null as Camera | null,
  prefs: DEFAULT_PREFS,
  pane: { open: false, cols: 0, rows: 0, mode: 'raster' as 'raster' | 'image' | 'roster' },
  termCols: 0,
  ticking: false,
  tickN: 0,
  lastTickAt: 0,
  lastPublish: 0,
  writeWarned: false,
  dirty: false,
  lastSig: 0,
  lastHdSentAt: 0,
  blitRetryAt: 0,
  alertKeys: new Set<string>(),
  demoT0: null as number | null,
  knownAgents: new Set<string>(),
}

// ── helpers that do not touch `$` ──────────────────────────────────

const clamp = (n: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, n))
const pad2 = (n: number): string => String(n).padStart(2, '0')
const dayOf = (now: number): string => {
  const d = new Date(now)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}
const hourOf = (now: number): number => {
  const d = new Date(now)
  return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600
}
// FNV-1a over 32-bit words: enough to tell two frames apart.
const hash32 = (w: Uint32Array): number => w.reduce((h, x) => Math.imul(h ^ x, 16777619) >>> 0, 2166136261)
const hashRgba = (px: Uint8Array): number => hash32(new Uint32Array(px.buffer, px.byteOffset, px.byteLength >> 2))
const cycle = <T>(xs: readonly T[], x: T): T => xs[(xs.indexOf(x) + 1) % xs.length]!
const alertKey = (a: Alert): string => `${a.sessionId}|${a.kind}|${a.at}`

// A bad or old store value must not reach the renderer: take each field only if it has the right type.
const readPrefs = (raw: unknown): Prefs => {
  const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  const bool = (k: 'labels' | 'effects' | 'paneOpen'): boolean => (typeof r[k] === 'boolean' ? (r[k] as boolean) : DEFAULT_PREFS[k])
  return {
    theme: THEMES.find(t => t === r.theme) ?? DEFAULT_PREFS.theme,
    camera: CAMERAS.find(c => c === r.camera) ?? DEFAULT_PREFS.camera,
    labels: bool('labels'),
    effects: bool('effects'),
    hd: typeof r.hd === 'boolean' ? r.hd : null,
    paneOpen: bool('paneOpen'),
  }
}

// While the demo runs it stands in for the other sessions.
const otherSnapshots = (now: number): Snapshot[] =>
  S.demoT0 !== null ? demoSnapshots(now, S.demoT0, dayOf(now)) : [...S.others.values()].map(o => o.snap)

const liveSnapshots = (now: number): Snapshot[] =>
  [...(S.snap ? [S.snap] : []), ...otherSnapshots(now)].filter(s => !isStale(s, now))

const currentAlerts = (now: number): Alert[] =>
  alertsFor([...S.others.values()].map(o => o.snap), S.snap?.sessionId ?? null, now)

function syncSim(now: number) {
  if (!S.sim || !S.snap) return
  S.sim.sync({ snapshots: [S.snap, ...otherSnapshots(now)], selfSessionId: S.snap.sessionId, now, localHour: hourOf(now), day: dayOf(now) })
}

// The words the Desktop roster shows, as one string, to tell when it needs redrawing.
const rosterText = (now: number): string =>
  liveSnapshots(now).map(s => `${s.name}\n${s.agents.map(a => `${a.label} ${a.activity} ${a.detail ?? ''}`).join('\n')}`).join('\n')

const rosterColor = (activity: string): { color?: string; dimColor?: boolean } =>
  activity === 'permission' ? { color: 'red' } : activity === 'question' ? { color: 'yellow' } : activity === 'idle' ? { dimColor: true } : {}

// The Desktop app has no Raster, so it gets a line per live session and per agent instead.
const roster = ({ Box, Text }: Pick<Els, 'Box' | 'Text'>, now: number) =>
  Box({
    flexDirection: 'column',
    children: liveSnapshots(now).map(s => Box({
      flexDirection: 'column',
      children: [
        Text({ bold: true, children: [s.name] }),
        ...s.agents.map(a => Text({ ...rosterColor(a.activity), children: [`● ${a.label} — ${a.activity}${a.detail ? ' · ' + a.detail : ''}`] })),
      ],
    })),
  })

// A mount that costs nothing to make: blank cells (the terminal's own colors), or one clear pixel.
const emptyBody = (els: Pick<Els, 'Raster' | 'Image'>, hd: boolean, cols: number, rows: number) =>
  hd
    ? els.Image({ key: 'office', columns: cols, rows, source: { rgba: new Uint8Array(4).toBase64(), width: 1, height: 1 }, alt: 'pixel office' })
    : els.Raster({ key: 'office', columns: cols, rows, cells: encodeCells({ cols, rows, pairs: 1, cells: Uint32Array.from({ length: cols * rows * 3 }, (_, i) => (i % 3 === 0 ? 0x20 : 0x01000000)) }) })

// ── helpers that take `$` ──────────────────────────────────────────

function debug($: Ctx, text: string) {
  $.ui.log(LOG + text, { to: 'debug' })
}

async function savePrefs($: Ctx) {
  try {
    await $.store.set('prefs', S.prefs)
  } catch (err) {
    debug($, `could not save prefs: ${String(err)}`)
  }
}

// Writes at most 4 times a second when something changed, and every 5 s regardless: the
// heartbeat has to move updatedAt too, or an idle session would look gone after 20 s.
async function publish($: Ctx, force: boolean) {
  if (!S.snap || !S.dir) return
  const now = await $.clock.now()
  const due = force || (S.dirty && now - S.lastPublish >= 250) || now - S.lastPublish >= 5000
  if (!due || !S.snap) return
  S.snap = { ...S.snap, updatedAt: now }
  S.lastPublish = now
  S.dirty = false
  try {
    await $.fs.write(`${S.dir}/${S.snap.sessionId}.json`, JSON.stringify(S.snap))
  } catch (err) {
    if (!S.writeWarned) debug($, `could not write the state file: ${String(err)}`)
    S.writeWarned = true
  }
}

async function apply($: Ctx, bare: Bare, force = false) {
  if (!S.snap) return
  const now = await $.clock.now()
  const ev = { ...bare, now } as TruthEvent
  S.snap = prune(reduce(S.snap, ev, { day: dayOf(now) }), now)
  S.dirty = true
  await publish($, force)
}

// A subagent we never saw spawn (the module reloaded mid-turn, or the spawn raced) gets its label from the engine.
async function ensureAgent($: Ctx, agentId: string | undefined) {
  if (agentId === undefined || S.knownAgents.has(agentId)) return
  S.knownAgents.add(agentId)
  try {
    const info = (await $.agent.list()).find(a => a.id === agentId)
    if (info) {
      const kind = info.type === 'teammate' ? 'teammate' : 'sub'
      await apply($, { type: 'agentSeen', agentId, kind, label: info.description || info.type, ...(info.parentId === undefined ? {} : { parent: info.parentId }) })
    }
  } catch (err) {
    debug($, `could not list agents: ${String(err)}`)
  }
}

// The only reader of other sessions: keep the last good copy of each file, drop what is gone,
// and delete what has sat untouched for an hour. Then raise an alert for each new wait.
async function poll($: Ctx) {
  await publish($, false)
  if (!S.dir) return
  const now = await $.clock.now()
  try {
    const listed = (await $.fs.list(S.dir)).filter(f => f.kind === 'file' && f.name.endsWith('.json') && f.name !== `${S.id}.json`)
    for (const old of listed.filter(f => now - f.mtimeMs > HOUR_MS && /^[A-Za-z0-9-]+\.json$/.test(f.name))) {
      await $.process.run(['rm', '-f', `${S.dir}/${old.name}`]).catch(() => undefined)
    }
    const fresh = listed.filter(f => now - f.mtimeMs <= HOUR_MS)
    const names = new Set(fresh.map(f => f.name.slice(0, -5)))
    for (const id of [...S.others.keys()]) if (!names.has(id)) S.others.delete(id)
    await Promise.all(fresh.filter(f => S.others.get(f.name.slice(0, -5))?.mtimeMs !== f.mtimeMs).map(async f => {
      const id = f.name.slice(0, -5)
      try {
        const snap = parseSnapshot(await $.fs.read(`${S.dir}/${f.name}`))
        if (snap && snap.sessionId === id) S.others.set(id, { snap, mtimeMs: f.mtimeMs })
      } catch {
        // unreadable right now: the last good copy stays
      }
    }))
  } catch {
    // no folder yet just means nobody has written; the 1 s retry makes a debug line here noise
  }

  const alerts = currentAlerts(now)
  const keys = new Set(alerts.map(alertKey))
  for (const a of alerts.filter(x => !S.alertKeys.has(alertKey(x)))) $.ui.toast(`${a.name} is waiting: ${a.detail}`)
  const changed = keys.size !== S.alertKeys.size || [...keys].some(k => !S.alertKeys.has(k))
  S.alertKeys = keys
  if (changed) $.ui.invalidate('ui.render')
}

// A fresh snapshot under `id`, named to avoid the live sessions already using the repo's name.
async function beginSession($: Ctx, id: string) {
  S.id = id
  const cwd = await $.session.cwd()
  const repo = await $.session.repo()
  const now = await $.clock.now()
  const taken = [...S.others.values()].map(o => o.snap).filter(s => !isStale(s, now)).map(s => s.name)
  S.snap = initialSnapshot({ sessionId: id, name: sessionName(cwd, repo?.root ?? null, taken), cwd, now, day: dayOf(now) })
  S.knownAgents.clear()
  S.dirty = true
  await publish($, true)
}

async function openPane($: Ctx) {
  const cols = S.termCols ? clamp(Math.round(S.termCols * 0.5), 56, 128) : undefined
  S.sim?.settle()
  S.cam = null
  S.pane.open = true
  try {
    await $.ui.open({ id: PANE_ID, title: 'office', focus: true, closeOnEscape: true, ...(cols ? { columns: cols } : {}) })
  } catch (err) {
    S.pane.open = false
    debug($, `could not open the pane: ${String(err)}`)
    return
  }
  S.prefs = { ...S.prefs, paneOpen: true }
  await savePrefs($)
}

async function closePane($: Ctx) {
  await $.ui.close({ id: PANE_ID })
  S.pane.open = false
  S.pane.cols = 0
  S.pane.rows = 0
  S.prefs = { ...S.prefs, paneOpen: false }
  await savePrefs($)
}

// A refused blit means the mounted size is not the one we drew for. Stop blitting until the
// next ui.render says the size again, and ask for that render. A refusal that outlives the
// remount (an Image on a terminal that only shows its alt) must not loop: no blit and no
// in-hook frame for BLIT_BACKOFF_MS.
async function blit($: Ctx, args: UiBlitArgs) {
  const ok = await $.ui.blit(args).then(r => r.deny === undefined, () => false)
  if (ok) return
  S.blitRetryAt = (await $.clock.now()) + BLIT_BACKOFF_MS
  S.pane.cols = 0
  S.pane.rows = 0
  S.lastSig = 0
  $.ui.invalidate('ui.render')
}

async function tick($: Ctx) {
  if (!S.pane.open || S.ticking || !S.sim || !S.snap) return
  S.ticking = true
  try {
    const now = await $.clock.now()
    if (S.pane.mode === 'roster') {
      // plain text: redrawn only when its words change
      const sig = hashString(rosterText(now))
      if (sig !== S.lastSig) {
        S.lastSig = sig
        $.ui.invalidate('ui.render')
      }
      return
    }
    if (S.pane.cols === 0 || now < S.blitRetryAt) return
    const dt = clamp((now - S.lastTickAt) / 1000, 0, 0.2)
    S.lastTickAt = now
    syncSim(now)
    S.sim.step(dt)
    const { cols, rows } = S.pane
    const scene = S.sim.scene()
    S.cam = updateCamera(S.cam, WORLD, scene, { cols, rows }, S.prefs.camera, dt)
    if (S.pane.mode === 'raster') {
      const f = toCells(WORLD, scene, S.prefs, S.cam, cols, rows)
      const sig = hash32(f.cells)
      if (sig !== S.lastSig) {
        S.lastSig = sig
        await blit($, { requestId: PANE_ID, key: 'office', cells: encodeCells(f) })
      }
    } else if (now - S.lastHdSentAt >= 125) {
      S.lastHdSentAt = now
      const f = toRgba(WORLD, scene, S.prefs, S.cam, cols, rows)
      const sig = hashRgba(f.rgba)
      if (sig !== S.lastSig) {
        S.lastSig = sig
        await blit($, { requestId: PANE_ID, key: 'office', source: { rgba: f.rgba.toBase64(), width: f.width, height: f.height } })
      }
    }
    // Every 10 s at 10 fps: the frame cost, for measuring big panes in a real session.
    if (++S.tickN % 100 === 0) debug($, `frame ${(await $.clock.now()) - now} ms, ${cols}x${rows} ${S.pane.mode}`)
  } catch (err) {
    debug($, `tick failed: ${String(err)}`)
  } finally {
    S.ticking = false
  }
}

// The control row under the picture. Each press saves the prefs and asks for a redraw.
function controls($: Ctx, { Box, Button, Text }: Pick<Els, 'Box' | 'Button' | 'Text'>, now: number) {
  const set = async (over: Partial<Prefs>) => {
    S.prefs = { ...S.prefs, ...over }
    await savePrefs($)
    $.ui.invalidate('ui.render')
  }
  const btn = (key: string, label: string, onPress: () => Promise<void>) => Button({ key, hotkey: key, label, plain: true, onPress })
  const live = liveSnapshots(now)
  return Box({
    columnGap: 2,
    children: [
      btn('z', 'zoom', () => set({ camera: cycle(CAMERAS, S.prefs.camera) })),
      btn('t', 'theme', () => set({ theme: cycle(THEMES, S.prefs.theme) })),
      btn('l', 'labels', () => set({ labels: !S.prefs.labels })),
      btn('n', 'effects', () => set({ effects: !S.prefs.effects })),
      btn('g', 'hd', () => set({ hd: !S.prefs.hd })),
      btn('d', 'demo', async () => {
        S.demoT0 = S.demoT0 === null ? await $.clock.now() : null
        $.ui.invalidate('ui.render')
      }),
      Text({ dimColor: true, children: [`${live.length} sessions · ${live.reduce((n, s) => n + s.agents.length, 0)} agents`] }),
    ],
  })
}

export function register(on: On) {
  on('session.start', async ($, e, next) => {
    const started = await next(e)
    S.home = (await $.env.get('HOME')) ?? ''
    S.dir = S.home ? `${S.home}/.claude/pixel-agents/sessions` : ''
    const term = await $.env.get('TERM_PROGRAM')
    const kitty = await $.env.get('KITTY_WINDOW_ID')
    const id = await $.session.id()
    S.prefs = readPrefs(await $.store.get('prefs'))
    if (S.prefs.hd === null) {
      S.prefs = { ...S.prefs, hd: term === 'ghostty' || !!kitty }
      await savePrefs($)
    }
    S.id = id
    await poll($)
    await beginSession($, id)
    S.sim = createSim(WORLD, hashString(id))
    $.clock.every(100, () => tick($))
    $.clock.every(1000, () => poll($).catch(err => debug($, `poll failed: ${String(err)}`)))
    if (S.prefs.paneOpen) await openPane($)
    try {
      await $.command.register({ name: 'office', description: 'Toggle the pixel office pane', argumentHint: '[demo]', immediate: true })
    } catch (err) {
      debug($, `could not register /office: ${String(err)}`)
    }
    return started
  })

  // A new conversation under a new id: end the old file, start a fresh one.
  on('classic.SessionStart', { source: ['clear', 'resume', 'fork'] }, async ($, e, next) => {
    if (S.snap) {
      const id = await $.session.id()
      // the same id again (a resume of this very session) is no new conversation
      if (id !== S.snap.sessionId) {
        await apply($, { type: 'end' }, true)
        await beginSession($, id)
      }
    }
    return next(e)
  })

  on('turn.start', async ($, e, next) => {
    await apply($, { type: 'turnStart' })
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    await apply($, { type: 'turnEnd', agentId: e.agentId, aborted: e.isAborted })
    return next(e)
  })

  on('tool.call', async ($, e, next) => {
    await ensureAgent($, e.agentId)
    const call = { agentId: e.agentId, toolUseId: e.tool_use_id, tool: e.tool, input: { ...e } }
    await apply($, { type: 'toolStart', ...call })
    try {
      const r = await next(e)
      await apply($, { type: 'toolEnd', ...call, ok: !r.deny && !r.isError })
      return r
    } catch (err) {
      await apply($, { type: 'toolEnd', ...call, ok: false })
      throw err
    }
  })

  on('classic.PermissionRequest', async ($, e, next) => {
    await apply($, { type: 'permissionAsk', agentId: e.agent_id, tool: e.tool_name, input: (e.tool_input ?? {}) as Record<string, unknown> })
    return next(e)
  })

  on('classic.PermissionDenied', async ($, e, next) => {
    await apply($, { type: 'permissionDenied', agentId: e.agent_id, tool: e.tool_name })
    return next(e)
  })

  on('agent.spawn', async ($, e, next) => {
    const r = await next(e)
    if (r.agentId) {
      S.knownAgents.add(r.agentId)
      await apply($, { type: 'spawn', agentId: r.agentId, label: e.description || e.subagentType, ...(e.parentAgentId === undefined ? {} : { parent: e.parentAgentId }) })
    }
    return r
  })

  on('classic.SubagentStop', async ($, e, next) => {
    await apply($, { type: 'subagentStop', agentId: e.agent_id })
    return next(e)
  })

  on('classic.TeammateIdle', async ($, e, next) => {
    await apply($, { type: 'teammateIdle', label: e.teammate_name })
    return next(e)
  })

  on('session.send', async ($, e, next) => {
    await apply($, { type: 'message', from: 'main', to: e.to })
    return next(e)
  })

  // The sender is outside this office, so the plane comes in through the door.
  on('session.receive', async ($, e, next) => {
    await apply($, { type: 'message', from: 'door', to: 'main' })
    return next(e)
  })

  on('session.compact', async ($, e, next) => {
    await apply($, { type: 'compact' })
    return next(e)
  })

  on('classic.UserPromptSubmit', async ($, e, next) => {
    await apply($, { type: 'planMode', on: e.permission_mode === 'plan' })
    return next(e)
  })

  on('session.measure', async ($, e, next) => {
    const u = await $.session.usage()
    await apply($, { type: 'context', percent: u.context?.percent ?? null })
    return next(e)
  })

  // One forced write and no reads: the whole chain shares a 1.5 s budget.
  on('session.end', async ($, e, next) => {
    await apply($, { type: 'end' }, true)
    return next(e)
  })

  on('command.run', { command: 'office' }, async ($, e) => {
    if (e.args.trim() === 'demo') {
      S.demoT0 = S.demoT0 === null ? await $.clock.now() : null
      await openPane($)
    } else if (S.pane.open) {
      await closePane($)
    } else {
      await openPane($)
    }
    return {}
  })

  on('ui.close', async ($, e, next) => {
    const r = await next(e)
    if (e.id === PANE_ID) {
      S.pane.open = false
      S.pane.cols = 0
      S.pane.rows = 0
      if (e.origin.kind === 'person') {
        S.prefs = { ...S.prefs, paneOpen: false }
        await savePrefs($)
      }
    }
    return r
  })

  on('ui.render', { component: 'Pane' }, async ($, e, next) => {
    if (e.requestId !== PANE_ID) return next(e)
    if (e.viewport) S.termCols = e.viewport.columns + e.props.bodyColumns + 1
    const now = await $.clock.now()
    if (e.surface !== 'terminal') {
      S.pane.mode = 'roster'
      S.lastSig = hashString(rosterText(now))
      return roster($.ui.resolve(e), now)
    }
    if (!S.sim) return next(e)
    const els = $.ui.resolve(e)
    const hd = S.prefs.hd === true
    const cols = clamp(e.props.bodyColumns, 1, hd ? 255 : 512)
    const rows = clamp(e.props.scroll.bodyRows - 1, 1, hd ? 255 : 256)
    if (cols !== S.pane.cols || rows !== S.pane.rows) S.cam = null
    S.pane.cols = cols
    S.pane.rows = rows
    S.pane.mode = hd ? 'image' : 'raster'

    // Backing off from a refused blit: mount an empty frame and skip the drawing; the next tick paints.
    if (now < S.blitRetryAt) return els.Box({ flexDirection: 'column', children: [emptyBody(els, hd, cols, rows), controls($, els, now)] })

    // Draw the current scene right here so the mount is never blank.
    syncSim(now)
    const scene = S.sim.scene()
    S.cam = updateCamera(S.cam, WORLD, scene, { cols, rows }, S.prefs.camera, 0)
    const body = (() => {
      if (hd) {
        const f = toRgba(WORLD, scene, S.prefs, S.cam, cols, rows)
        S.lastSig = hashRgba(f.rgba)
        S.lastHdSentAt = now
        return els.Image({ key: 'office', columns: cols, rows, source: { rgba: f.rgba.toBase64(), width: f.width, height: f.height }, alt: 'pixel office' })
      }
      const f = toCells(WORLD, scene, S.prefs, S.cam, cols, rows)
      S.lastSig = hash32(f.cells)
      return els.Raster({ key: 'office', columns: cols, rows, cells: encodeCells(f) })
    })()
    return els.Box({ flexDirection: 'column', children: [body, controls($, els, now)] })
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (!S.pane.open && e.viewport) S.termCols = e.viewport.columns
    const alerts = currentAlerts(await $.clock.now())
    const first = alerts[0]
    if (!first || e.props.hasSurvey) return next(e)
    const { Text } = $.ui.resolve(e)
    const rest = alerts.length - 1
    return Text({ color: 'yellow', children: ['⚠ ' + first.name + ' is waiting: ' + first.detail + (rest > 0 ? '  +' + rest + ' more' : '')] })
  })
}
