// The pixel-agents binary: the same office the mod draws, full-screen in the alt screen, fed by the
// shared state folder. Node APIs live here only; the engine stays pure and gets time as a parameter.
import { constants, lstatSync, readdirSync, readFileSync, statSync, unlinkSync, watch, writeSync } from 'node:fs'
import type { FSWatcher, Stats } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { demoSnapshots } from '../engine/demo'
import { cellsToAnsi, toCells, updateCamera } from '../engine/render'
import { createSim } from '../engine/sim'
import { accountOf, asForeign, foreignAccount, pickForeign, SHARED_ROOT } from '../engine/shared'
import { alertsFor, isStale, parseSnapshot } from '../engine/snapshots'
import { CAMERAS, DEFAULT_PREFS, THEMES, isTheme } from '../engine/types'
import type { Camera, CellFrame, Prefs, Snapshot, ThemeName } from '../engine/types'
import { defaultWorld } from '../engine/world'
import { MAX_DT, cycle, dayOf, hourOf } from '../shell/common'

const USAGE = `usage: pixel-agents [--demo] [--shared] [--theme ${THEMES.join('|')}] [--fps 1-30 (10)] [--dir PATH] [--frames N] [--size COLSxROWS]`
const VALUE_FLAGS = ['--theme', '--fps', '--dir', '--frames', '--size', '--shared-root']

const PAN_PX = 16
const RESCAN_MS = 2_000
const STALE_FILE_MS = 3_600_000

const ENTER = '\x1b[?1049h\x1b[?25l\x1b[2J'
const LEAVE = '\x1b[0m\x1b[?25h\x1b[?1049l'
const BAR_COLORS = '\x1b[38;2;200;200;200m\x1b[48;2;40;40;60m'
// An arrow is one key; everything else is a single character. A held key arrives as a burst in one chunk.
const KEYS = /\x1b\[[A-D]|[\s\S]/g

type Args = {
  readonly demo: boolean
  readonly shared: boolean
  readonly sharedRoot: string   // hidden: tests point it away from /Users/Shared
  readonly theme: ThemeName
  readonly fps: number
  readonly dir: string
  readonly frames: number | null
  readonly size: { readonly cols: number; readonly rows: number } | null
}

// Bad input is an error: say so on stderr before the screen is touched, exit 1.
const bad = (msg: string): never => {
  writeSync(2, `pixel-agents: ${msg}\n${USAGE}\n`)
  return process.exit(1)
}

function parseArgs(argv: readonly string[]): Args {
  const stray = argv.find((a, i) => a !== '--demo' && a !== '--shared' && !VALUE_FLAGS.includes(a) && !VALUE_FLAGS.includes(argv[i - 1] ?? ''))
  if (stray !== undefined) bad(`unknown argument ${stray}`)
  const value = (flag: string): string | null => {
    const i = argv.indexOf(flag)
    if (i < 0) return null
    return argv[i + 1] ?? bad(`${flag} needs a value`)
  }
  const int = (flag: string, lo: number, hi: number): number | null => {
    const v = value(flag)
    if (v === null) return null
    return /^\d+$/.test(v) && Number(v) >= lo && Number(v) <= hi ? Number(v) : bad(`${flag} must be an integer from ${lo} to ${hi}`)
  }
  const themeArg = value('--theme')
  const theme = themeArg === null ? DEFAULT_PREFS.theme : isTheme(themeArg) ? themeArg : bad(`--theme must be one of ${THEMES.join(', ')}`)
  const sizeArg = value('--size')
  const m = sizeArg === null ? null : /^([1-9]\d*)x([1-9]\d*)$/.exec(sizeArg) ?? bad('--size must look like 100x30')
  const dirArg = value('--dir')
  const rootArg = value('--shared-root')
  return {
    demo: argv.includes('--demo'),
    shared: argv.includes('--shared'),
    sharedRoot: resolve(rootArg ?? SHARED_ROOT),
    theme,
    fps: int('--fps', 1, 30) ?? 10,
    dir: resolve(dirArg ?? join(homedir(), '.claude', 'pixel-agents', 'sessions')),
    frames: int('--frames', 1, Number.MAX_SAFE_INTEGER),
    size: m === null ? null : { cols: Number(m[1]), rows: Number(m[2]) },
  }
}

const args = parseArgs(process.argv.slice(2))

type AppState = {
  readonly world: ReturnType<typeof defaultWorld>
  readonly sim: ReturnType<typeof createSim>
  prefs: Prefs
  cam: Camera | null
  pan: { readonly x: number; readonly y: number }   // added to the camera at x1/x2, cleared by `z`
  prev: CellFrame | null
  demoT0: number | null
  files: Map<string, { readonly stamp: string; readonly snap: Snapshot }>   // by file name: the last good copy
  foreign: Map<string, { readonly stamp: string; readonly snap: Snapshot }>   // by `account/file name`; --shared only
  dirty: boolean
  scannedAt: number
  last: number | null
  frames: number
  timer: ReturnType<typeof setInterval> | null
  watcher: FSWatcher | null
  raw: boolean
  quitting: boolean
}

const world = defaultWorld()
const app: AppState = {
  world,
  sim: createSim(world, Date.now()),
  prefs: { ...DEFAULT_PREFS, theme: args.theme },
  cam: null,
  pan: { x: 0, y: 0 },
  prev: null,
  demoT0: args.demo ? Date.now() : null,
  files: new Map(),
  foreign: new Map(),
  dirty: true,
  scannedAt: 0,
  last: null,
  frames: 0,
  timer: null,
  watcher: null,
  raw: false,
  quitting: false,
}

// ── Leaving ────────────────────────────────────────────────────────────────

// Every exit path comes through here. The restore string goes out first; exit waits for it to
// flush, so a redirected or piped stdout is never cut short.
function quit(code: number, err?: unknown): void {
  if (app.quitting) return
  app.quitting = true
  if (app.timer !== null) clearInterval(app.timer)
  app.watcher?.close()
  if (app.raw) {
    try { process.stdin.setRawMode(false) } catch { /* stdin is already gone */ }
  }
  process.stdout.write(LEAVE, () => {
    if (err !== undefined) writeSync(2, `pixel-agents: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`)
    process.exit(code)
  })
}

// ── State folder ───────────────────────────────────────────────────────────

function readOne(name: string, now: number): void {
  const path = join(args.dir, name)
  try {
    const st = statSync(path)
    if (now - st.mtimeMs > STALE_FILE_MS) {
      unlinkSync(path)
      app.files.delete(name)
      return
    }
    const stamp = `${st.mtimeMs}:${st.size}`
    if (app.files.get(name)?.stamp === stamp) return
    // A torn write is a miss: the stamp stays unset, so the next rescan tries again.
    const snap = parseSnapshot(readFileSync(path, 'utf8'))
    if (snap !== null) app.files.set(name, { stamp, snap })
  } catch {
    // vanished or unreadable mid-scan: keep the last good copy
  }
}

function rescan(now: number): void {
  app.dirty = false
  app.scannedAt = now
  const names = (() => {
    try { return readdirSync(args.dir).filter(n => n.endsWith('.json')) } catch { return [] }   // a missing folder is zero sessions
  })()
  const present = new Set(names)
  for (const name of [...app.files.keys()]) if (!present.has(name)) app.files.delete(name)
  for (const name of names) readOne(name, now)
  if (args.shared) rescanForeign(now)
}

// Other accounts' folders are read the same way but trusted less, and never written or deleted.
// lstat, not stat: a link under a foreign folder is never followed (R9).
const lstatOrNull = (path: string): Stats | null => {
  try { return lstatSync(path) } catch { return null }
}

function realEntries(dir: string, keep: (st: Stats) => boolean): { readonly name: string; readonly st: Stats }[] {
  try {
    return readdirSync(dir).flatMap(name => {
      const st = lstatOrNull(join(dir, name))
      return st !== null && keep(st) ? [{ name, st }] : []
    })
  } catch {
    return []   // a missing or unreadable folder is zero sessions
  }
}

// ponytail: a folder swapped for a link, or a file grown, between the lstat and the read gets through;
// O_NOFOLLOW only guards the last path component. Upgrade: openat and fstat on the descriptor.
function rescanForeign(now: number): void {
  const self = accountOf(homedir())
  const candidates = realEntries(args.sharedRoot, st => st.isDirectory()).flatMap(({ name: folder }) => {
    const account = foreignAccount(folder, self)
    const sessions = join(args.sharedRoot, folder, 'sessions')
    if (account === null || !lstatOrNull(sessions)?.isDirectory()) return []
    return realEntries(sessions, st => st.isFile()).map(({ name, st }) => ({ account, name, path: join(sessions, name), size: st.size, mtimeMs: st.mtimeMs }))
  })
  const picked = pickForeign(candidates, now)
  const present = new Set(picked.map(c => `${c.account}/${c.name}`))
  for (const key of [...app.foreign.keys()]) if (!present.has(key)) app.foreign.delete(key)
  for (const c of picked) {
    const key = `${c.account}/${c.name}`
    const stamp = `${c.mtimeMs}:${c.size}`
    if (app.foreign.get(key)?.stamp === stamp) continue
    try {
      const snap = parseSnapshot(readFileSync(c.path, { encoding: 'utf8', flag: constants.O_RDONLY | constants.O_NOFOLLOW }))
      if (snap !== null && `${snap.sessionId}.json` === c.name) app.foreign.set(key, { stamp, snap: asForeign(snap, c.account) })
    } catch {
      // vanished, a link, or unreadable mid-scan: keep the last good copy
    }
  }
}

// A missing folder makes watch throw; the 2 s rescan covers it.
function watchDir(): FSWatcher | null {
  try {
    const w = watch(args.dir, () => { app.dirty = true })
    w.on('error', () => w.close())
    return w
  } catch {
    return null
  }
}

// ── One frame ──────────────────────────────────────────────────────────────

// The office gets every row but the last. `--size` beats the terminal; 80x24 when neither says.
function readSize(): { readonly cols: number; readonly rows: number } {
  const s = args.size ?? { cols: process.stdout.columns || 80, rows: process.stdout.rows || 24 }
  return { cols: Math.max(1, s.cols), rows: Math.max(2, s.rows) }
}

function statusBar(snaps: readonly Snapshot[], waiting: number, now: number, cols: number, row: number): string {
  const live = snaps.filter(s => !isStale(s, now))
  const agents = live.flatMap(s => s.agents).filter(a => a.doneAt === undefined).length
  const text = ` pixel-agents │ ${live.length} sessions · ${agents} agents · ${waiting} waiting │ q quit  t theme  z zoom  l labels  n effects  d demo`
  return `\x1b[${row};1H${BAR_COLORS}${text.padEnd(cols).slice(0, cols)}`
}

function frame(): void {
  const now = Date.now()
  if (app.dirty || now - app.scannedAt >= RESCAN_MS) rescan(now)
  const { cols, rows } = readSize()
  const dt = app.last === null ? 0 : Math.min(MAX_DT, (now - app.last) / 1000)
  app.last = now
  const day = dayOf(now)
  // Only your own folder (or the demo) can make `waiting` count; another account's wait never does.
  const own = [...app.files.values()].map(f => f.snap)
  // Demo stands in for the real sessions while it is on, as in the mod.
  const snaps = app.demoT0 === null ? [...own, ...[...app.foreign.values()].map(f => f.snap)] : demoSnapshots(now, app.demoT0, day)
  app.sim.sync({ snapshots: snaps, selfSessionId: null, now, localHour: hourOf(now), day })
  app.sim.step(dt)
  const scene = app.sim.scene()
  const cam = updateCamera(app.cam, app.world, scene, { cols, rows: rows - 1 }, app.prefs.camera, dt)
  app.cam = cam
  const cells = toCells(app.world, scene, app.prefs, { ...cam, x: cam.x + app.pan.x, y: cam.y + app.pan.y }, cols, rows - 1)
  process.stdout.write(cellsToAnsi(cells, app.prev) + statusBar(snaps, alertsFor(app.demoT0 === null ? own : snaps, null, now).length, now, cols, rows))
  app.prev = cells
  app.frames += 1
  if (args.frames !== null && app.frames >= args.frames) quit(0)
}

// ── Keys ───────────────────────────────────────────────────────────────────

// Panning only means something at a fixed zoom; at auto and fit the camera frames the office itself.
const pan = (dx: number, dy: number): void => {
  if (app.prefs.camera === 'x1' || app.prefs.camera === 'x2') app.pan = { x: app.pan.x + dx * PAN_PX, y: app.pan.y + dy * PAN_PX }
}

function onKey(key: string): void {
  switch (key) {
    case 'q': case '\x03': return quit(0)
    case 't': app.prefs = { ...app.prefs, theme: cycle(THEMES, app.prefs.theme) }; return
    case 'z': app.prefs = { ...app.prefs, camera: cycle(CAMERAS, app.prefs.camera) }; app.pan = { x: 0, y: 0 }; return
    case 'l': app.prefs = { ...app.prefs, labels: !app.prefs.labels }; return
    case 'n': app.prefs = { ...app.prefs, effects: !app.prefs.effects }; return
    case 'd': app.demoT0 = app.demoT0 === null ? Date.now() : null; return
    case '\x1b[A': return pan(0, -1)
    case '\x1b[B': return pan(0, 1)
    case '\x1b[C': return pan(1, 0)
    case '\x1b[D': return pan(-1, 0)
  }
}

// EOF is a quit: a closed stdin must never turn into a busy loop.
function listen(): void {
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true)
    app.raw = true
  }
  process.stdin.setEncoding('utf8')
  process.stdin.on('data', (chunk: string) => { for (const key of chunk.match(KEYS) ?? []) onKey(key) })
  process.stdin.on('end', () => quit(0))
  process.stdin.on('close', () => quit(0))
}

// ── Run ────────────────────────────────────────────────────────────────────

process.on('SIGINT', () => quit(0))
process.on('SIGTERM', () => quit(0))
process.on('uncaughtException', e => quit(1, e))
process.on('unhandledRejection', e => quit(1, e))
process.stdout.on('error', e => quit(1, e))
process.stdout.on('resize', () => { app.prev = null })

process.stdout.write(ENTER)
app.watcher = watchDir()
// `--frames` is the test mode: stdin is never read, so `< /dev/null` cannot cut the run short.
if (args.frames === null) listen()
frame()
if (!app.quitting) app.timer = setInterval(frame, 1000 / args.fps)
