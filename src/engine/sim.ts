// sim.ts — the living office. sync() reconciles characters with the snapshots a viewer knows,
// step() animates them. Pure: time arrives through sync's `now` and step's dt, and every random
// draw comes from the seeded rng, so one seed replays one office.
import { TILE } from './types'
import type {
  Agent, Alert, Bubble, CatView, CharacterView, Dir, Effect, EffectKind, MonitorView, ParticleView, PlaneView,
  Pose, Scene, Seat, Snapshot, Stats, TilePos, Tone, Weather, World,
} from './types'
import { aggregateStats, alertsFor, isStale } from './snapshots'
import { createRng, hashString } from './rng'
import { toolClass } from './truth'
import { DIRS, findPath, isWalkable, open, posKey, tileAt, tileCenter, where } from './world'

export type SimInput = {
  readonly snapshots: readonly Snapshot[]     // every session the viewer knows, including its own and stale/ended ones
  readonly selfSessionId: string | null
  readonly now: number                        // ms epoch
  readonly localHour: number                  // 0..24, fractional
  readonly day: string                        // local 'YYYY-MM-DD'
}
export type Sim = {
  readonly sync: (input: SimInput) => void    // reconcile characters with snapshots; queue new effects once
  readonly step: (dtSec: number) => void      // advance; callers cap dt at 0.2
  readonly settle: () => void                 // everyone jumps to their destination; particles cleared
  readonly scene: () => Scene
}

type Pt = { readonly x: number; readonly y: number }
type Kind = 'seat' | 'couch' | 'board' | 'break' | 'lounge' | 'visit' | 'door'
// seatId names the seat or couch whose facing the character takes on arrival.
type Target = { readonly col: number; readonly row: number; readonly kind: Kind; readonly seatId?: string }
type Walker = { x: number; y: number; col: number; row: number; path: TilePos[]; progress: number; dir: Dir; replan: boolean }
type Char = Walker & {
  readonly key: string
  readonly palette: number
  snap: Snapshot
  agent: Agent
  stale: boolean                 // its session is stale or gone: walk out
  isSelf: boolean
  seatId: string | null
  lounge: TilePos | null         // overflow agents stand here instead of a desk
  target: Target
  breakTarget: Target | null     // set while on a break; a couch target holds that couch
  idleFor: number                // seconds idle while at home
  repickIn: number
  done: 'toParent' | 'pause' | 'toDoor' | null
  visit: TilePos | null
  pause: number
  fx: { readonly bubble: Bubble; readonly until: number } | null
  anim: string
  frame: number
  frameTimer: number
}
type Cat = Walker & {
  mode: 'wander' | 'sit' | 'nap' | 'sleep' | 'follow'
  goal: TilePos | null
  timer: number
  followIn: number
  followLeft: number
  repathIn: number
  frame: number
  frameTimer: number
}
type Beam = { readonly charKey: string; readonly sx: number; readonly sy: number; readonly color: number; timer: number }
type Particle = { x: number; y: number; vx: number; vy: number; readonly color: number; readonly life: number; age: number; readonly size: 1 | 2 | 3 }
type Plane = { readonly pts: readonly Pt[]; readonly arc: number; readonly dur: number; t: number }
type Entry = { readonly snap: Snapshot; readonly agent: Agent; readonly index: number; readonly key: string }

const WALK_PX = 48
const CAT_PX = 30
const WALK_FRAMES = 4, WALK_DUR = 0.15
const TYPE_DUR = 0.3, THINK_DUR = 0.6
const CAT_FRAME_DUR = 0.2
const IDLE_AT_DESK = 5
const DONE_PAUSE = 0.8
const BODY = 8                 // px above the feet where beams, bursts and planes sit
const BEAM_EVERY = 0.1, BEAM_SPEED = 70
const FOLLOW_SEC = 10
const NAP_CHANCE = 0.3
const EFFECT_MAX_AGE_MS = 10_000

const WEB_TOOLS = new Set(['WebFetch', 'WebSearch'])   // truth.ts files these under reading; the beam is its own
const BEAM_COLOR = { reading: 0x00ccff, web: 0xffcc00, running: 0xff8800 } as const

const EFFECT_BUBBLE: Partial<Record<EffectKind, { readonly text: string; readonly tone: Tone; readonly sec: number }>> = {
  done: { text: '✓', tone: 'ok', sec: 1.5 },
  error: { text: '!', tone: 'bad', sec: 1.5 },
  testPass: { text: '✓ tests', tone: 'ok', sec: 2 },
  testFail: { text: '✗ tests', tone: 'bad', sec: 2 },
  commit: { text: 'commit!', tone: 'ok', sec: 2 },
  push: { text: 'pushed', tone: 'ok', sec: 2 },
}
const CONFETTI = [0xff5e5e, 0xffd24a, 0x5ec8ff, 0x7cff6b, 0xd07cff]
const EFFECT_BURST: Partial<Record<EffectKind, { readonly count: number; readonly colors: readonly number[] }>> = {
  done: { count: 10, colors: [0x00ff88] },
  error: { count: 8, colors: [0xff4444] },
  commit: { count: 16, colors: CONFETTI },
  testPass: { count: 10, colors: [0x7cff6b] },
  testFail: { count: 8, colors: [0xff4444] },
}

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

// Plain code-unit order, not localeCompare: every viewer must seat everyone the same way.
const entriesOf = (snaps: readonly Snapshot[]): Entry[] =>
  snaps
    .flatMap(snap => snap.agents.map((agent, index) => ({ snap, agent, index, key: `${snap.sessionId}/${agent.id}` })))
    .sort((x, y) => x.snap.startedAt - y.snap.startedAt || cmp(x.snap.sessionId, y.snap.sessionId) || x.index - y.index)

const dirBetween = (a: TilePos, b: TilePos): Dir =>
  b.col > a.col ? 'right' : b.col < a.col ? 'left' : b.row < a.row ? 'up' : 'down'

const dirOf = (dx: number, dy: number): Dir =>
  Math.abs(dx) >= Math.abs(dy) ? (dx >= 0 ? 'right' : 'left') : dy >= 0 ? 'down' : 'up'

const weatherOf = (percent: number | null): Weather =>
  percent === null || percent < 25 ? 'clear' : percent < 50 ? 'clouds' : percent < 75 ? 'rain' : percent < 90 ? 'storm' : 'lightning'

const beamKind = (tool: string): 'reading' | 'web' | 'running' | null => {
  if (WEB_TOOLS.has(tool)) return 'web'
  const cls = toolClass(tool)
  return cls === 'reading' || cls === 'running' ? cls : null
}

// Steps `o.frame` through `count` frames of `dur` seconds each.
const advanceFrame = (o: { frame: number; frameTimer: number }, dt: number, dur: number, count: number): void => {
  o.frameTimer += dt
  const n = Math.floor(o.frameTimer / dur)
  o.frameTimer -= n * dur
  o.frame = (o.frame + n) % count
}

// A goal set mid-tile waits for the tile boundary; then the path it replaces is dropped. True when it did.
const dropStalePath = (w: Walker): boolean => {
  const stale = w.replan && w.progress === 0
  if (stale) { w.path = []; w.replan = false }
  return stale
}

// Fades toward black like the Go renderer did; ParticleView has no alpha.
const dim = (rgb: number, f: number): number => {
  const ch = (shift: number) => Math.floor(((rgb >> shift) & 255) * f)
  return (ch(16) << 16) | (ch(8) << 8) | ch(0)
}

// Where `d` px along a polyline; the heading comes with it.
const along = (pts: readonly Pt[], d: number): { readonly x: number; readonly y: number; readonly dx: number; readonly dy: number } => {
  const a = pts[0]!, b = pts[1]
  if (b === undefined) return { x: a.x, y: a.y, dx: 0, dy: -1 }
  const len = Math.hypot(b.x - a.x, b.y - a.y)
  if (pts.length === 2 || d <= len) {
    const k = len === 0 ? 0 : Math.min(d / len, 1)
    return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, dx: b.x - a.x, dy: b.y - a.y }
  }
  return along(pts.slice(1), d - len)
}

const polyLength = (pts: readonly Pt[]): number =>
  pts.slice(1).reduce((sum, q, i) => sum + Math.hypot(q.x - pts[i]!.x, q.y - pts[i]!.y), 0)

export function createSim(world: World, seed: number): Sim {
  const rng = createRng(seed)
  const range = (lo: number, hi: number): number => lo + rng.next() * (hi - lo)

  const doorPx = tileCenter(world.door)
  const DOOR: Target = { col: world.door.col, row: world.door.row, kind: 'door' }
  const seatById = new Map<string, Seat>([...world.seats, ...world.couches].map(s => [s.id, s] as const))
  const walkable = where(world.tiles, isWalkable)
  const mid = (world.cols * TILE) / 2
  const windowPx = world.windows.map(p => tileCenter(p))
  const topWindow = [...windowPx].sort((a, b) => Math.abs(a.x - mid) - Math.abs(b.x - mid))[0] ?? { x: mid, y: 4 }

  const catStart = world.lounge.length > 0 ? rng.pick(world.lounge) : world.door
  const catPx = tileCenter(catStart)

  const st = {
    chars: new Map<string, Char>(),
    seats: new Map<string, string>(),          // seatId -> char key
    couches: new Map<string, string>(),        // couchId -> char key
    loungeSpots: new Map<string, string>(),    // posKey -> char key
    beams: new Map<string, Beam>(),
    seen: new Map<string, number>(),           // sessionId -> max effect id seen
    particles: [] as Particle[],
    planes: [] as Plane[],
    time: 0,
    placeNext: true,                           // first sync, and the first after settle(), place instead of walk
    hour: 12,
    weather: 'clear' as Weather,
    flashIn: 0,
    flashLeft: 0,
    whiteboard: { day: '', tools: 0, edits: 0, commits: 0, permits: 0, errors: 0 } as Stats,
    alerts: [] as Alert[],
    doorHold: 0,
    cat: {
      x: catPx.x, y: catPx.y, col: catStart.col, row: catStart.row, path: [], progress: 0, dir: 'right', replan: false,
      mode: 'wander', goal: null, timer: 0, followIn: range(45, 75), followLeft: 0, repathIn: 0, frame: 0, frameTimer: 0,
    } as Cat,
  }
  const cat = st.cat

  const bodyOf = (p: Pt): Pt => ({ x: p.x, y: p.y - BODY })

  // ── characters: where they stand and what they look like ──────────────────────
  const atTarget = (c: Char): boolean =>
    c.path.length === 0 && c.progress === 0 && c.col === c.target.col && c.row === c.target.row

  const seated = (c: Char): boolean => (c.target.kind === 'seat' || c.target.kind === 'couch') && atTarget(c)

  // Seated characters block paths, except the tile the walker is heading for.
  const blockedExcept = (goal?: TilePos): Set<string> => {
    const set = new Set([...st.chars.values()].filter(seated).map(c => posKey(c)))
    if (goal) set.delete(posKey(goal))
    return set
  }

  const poseOf = (c: Char): Pose => {
    if (c.path.length > 0) return 'walk'
    if (!atTarget(c)) return 'stand'
    if (c.target.kind === 'couch') return 'read'
    if (c.target.kind !== 'seat') return 'stand'
    const act = c.agent.activity
    return act === 'typing' || act === 'running' ? 'type' : act === 'reading' || act === 'thinking' || act === 'compacting' ? 'read' : 'stand'
  }

  const frameSpec = (c: Char, pose: Pose): { readonly anim: string; readonly count: number; readonly dur: number } => {
    const dur = pose === 'walk' ? WALK_DUR : pose === 'read' && c.agent.activity === 'thinking' ? THINK_DUR : TYPE_DUR
    return { anim: `${pose}${dur}`, count: pose === 'walk' ? WALK_FRAMES : pose === 'stand' ? 1 : 2, dur }
  }

  const animate = (c: Char, dt: number): void => {
    const spec = frameSpec(c, poseOf(c))
    if (spec.anim !== c.anim) { c.anim = spec.anim; c.frame = 0; c.frameTimer = 0 }
    advanceFrame(c, dt, spec.dur, spec.count)
  }

  const facing = (c: Char): Dir => {
    const t = c.target
    if (t.kind === 'board') return 'up'
    if (t.kind !== 'seat' && t.kind !== 'couch') return 'down'
    // A waiting agent stands at its desk and faces the viewer (spec 7.3).
    if (c.agent.activity === 'permission' || c.agent.activity === 'question') return 'down'
    return (t.seatId === undefined ? undefined : seatById.get(t.seatId))?.facing ?? 'down'
  }

  const bubbleOf = (c: Char): Bubble | undefined => {
    const a = c.agent
    const finished = c.stale || a.doneAt !== undefined
    const detail = a.detail ?? a.waiting?.detail ?? ''
    if (!finished && a.activity === 'permission') return { text: `! ${detail}`.trimEnd(), tone: 'alert' }
    if (!finished && a.activity === 'question') return { text: `? ${detail}`.trimEnd(), tone: 'ask' }
    if (c.fx !== null && st.time < c.fx.until) return c.fx.bubble
    if (finished) return c.done === 'pause' ? { text: '✓', tone: 'ok' } : undefined
    switch (a.activity) {
      case 'thinking': return { text: ['.', '..', '...'][Math.floor(st.time / 0.4) % 3]!, tone: 'info' }
      case 'delegating': {
        const n = c.snap.agents.filter(x => x.kind === 'sub' && x.parent === a.id && x.doneAt === undefined).length
        return { text: `waiting on ${n} ${n === 1 ? 'intern' : 'interns'}`, tone: 'info' }
      }
      case 'planning': return { text: 'planning', tone: 'info' }
      case 'compacting': return { text: 'compacting', tone: 'info' }
      case 'typing': case 'running': case 'reading': return a.detail ? { text: a.detail, tone: 'info' } : undefined
      default: return undefined
    }
  }

  const view = (c: Char): CharacterView => {
    const pose = poseOf(c)
    const spec = frameSpec(c, pose)
    const bubble = bubbleOf(c)
    const waiting = !c.stale && (c.agent.activity === 'permission' || c.agent.activity === 'question')
    return {
      key: c.key, x: c.x, y: c.y,
      dir: pose === 'walk' || !atTarget(c) ? c.dir : facing(c),
      pose,
      frame: c.anim === spec.anim ? c.frame : 0,
      palette: c.palette, label: c.agent.label, kind: c.agent.kind, isSelf: c.isSelf,
      ...(bubble ? { bubble } : {}),
      bob: waiting ? Math.round(Math.sin(st.time * 6) * 1.5) : 0,
    }
  }

  // ── movement, shared by characters and the cat ────────────────────────────────
  const moveAlong = (w: Walker, dist: number): void => {
    const next = w.path[0]
    if (next === undefined || dist <= 0) return
    const from = tileCenter(w), to = tileCenter(next)
    w.dir = dirBetween(w, next)
    const left = TILE * (1 - w.progress)
    if (dist < left) {
      w.progress += dist / TILE
      w.x = from.x + (to.x - from.x) * w.progress
      w.y = from.y + (to.y - from.y) * w.progress
      return
    }
    w.col = next.col
    w.row = next.row
    w.path = w.path.slice(1)
    w.progress = 0
    w.x = to.x
    w.y = to.y
    // A new goal was set mid-tile: stop at the tile boundary so the next step re-plans.
    if (w.replan) { w.path = []; return }
    moveAlong(w, dist - left)
  }

  const jump = (c: Char): void => {
    const p = tileCenter(c.target)
    c.x = p.x
    c.y = p.y
    c.col = c.target.col
    c.row = c.target.row
    c.path = []
    c.progress = 0
    c.replan = false
  }

  // Planning costs the step: the walk starts on the next one (the Go loop did the same).
  const plan = (c: Char): void => {
    const path = findPath(world, c, c.target, blockedExcept(c.target))
    if (path.length > 0) { c.path = path; c.progress = 0; return }
    jump(c)   // no way through: teleport to the target, as the Go version did
  }

  const aim = (c: Char, t: Target): void => {
    if (c.target.col !== t.col || c.target.row !== t.row) c.replan = true
    c.target = t
  }

  // ── seats, couches, lounge ───────────────────────────────────────────────────
  const releaseCouch = (c: Char): void => {
    const id = c.breakTarget?.kind === 'couch' ? c.breakTarget.seatId : undefined
    if (id !== undefined && st.couches.get(id) === c.key) st.couches.delete(id)
  }

  const dropLounge = (c: Char): void => {
    if (c.lounge !== null && st.loungeSpots.get(posKey(c.lounge)) === c.key) st.loungeSpots.delete(posKey(c.lounge))
    c.lounge = null
  }

  const pickLounge = (key: string): TilePos => {
    const n = world.lounge.length
    const start = n === 0 ? 0 : hashString(key) % n
    const free = Array.from({ length: n }, (_, i) => (start + i) % n).find(i => !st.loungeSpots.has(posKey(world.lounge[i]!)))
    return world.lounge[free ?? start] ?? world.door
  }

  // A seat when one is free, otherwise a lounge spot of its own: nobody is dropped.
  const claimSeat = (c: Char): void => {
    if (c.seatId !== null) return
    const seat = world.seats.find(s => !st.seats.has(s.id))
    if (seat) {
      st.seats.set(seat.id, c.key)
      c.seatId = seat.id
      dropLounge(c)
      return
    }
    if (c.lounge === null) {
      c.lounge = pickLounge(c.key)
      st.loungeSpots.set(posKey(c.lounge), c.key)
    }
  }

  const ownedTiles = (): Set<string> =>
    new Set([...st.seats.keys()].flatMap(id => { const s = seatById.get(id); return s ? [posKey(s)] : [] }))

  // Nobody stops on a desk that belongs to someone away from it, so the owner never returns to company.
  const unavailable = (): Set<string> => new Set([...blockedExcept(), ...ownedTiles()])

  const removeChar = (c: Char): void => {
    st.chars.delete(c.key)
    if (c.seatId !== null && st.seats.get(c.seatId) === c.key) st.seats.delete(c.seatId)
    dropLounge(c)
    releaseCouch(c)
    for (const [k, b] of st.beams) if (b.charKey === c.key) st.beams.delete(k)
  }

  const homeOf = (c: Char): Target => {
    const seat = c.seatId === null ? undefined : seatById.get(c.seatId)
    if (seat) return { col: seat.col, row: seat.row, kind: 'seat', seatId: seat.id }
    const spot = c.lounge ?? world.door
    return { col: spot.col, row: spot.row, kind: 'lounge' }
  }

  const goalOf = (c: Char): Target => {
    const a = c.agent
    if (c.stale || c.done === 'toDoor') return DOOR
    if (c.done !== null && c.visit !== null) return { col: c.visit.col, row: c.visit.row, kind: 'visit' }
    if (a.activity === 'planning') return { col: world.whiteboardSpot.col, row: world.whiteboardSpot.row, kind: 'board' }
    if (a.activity === 'idle' && c.breakTarget !== null) return c.breakTarget
    return homeOf(c)
  }

  // ── idle: break area ─────────────────────────────────────────────────────────
  const leaveBreak = (c: Char): void => {
    releaseCouch(c)
    c.breakTarget = null
  }

  // 50% a free couch, 25% a coffee tile, 25% a kitchen or lounge tile. Same pool when no couch is free.
  const pickBreak = (c: Char): void => {
    releaseCouch(c)
    const blocked = unavailable()
    const roll = rng.next()
    const freeCouches = world.couches.filter(s => !st.couches.has(s.id))
    const couch = roll < 0.5 && freeCouches.length > 0 ? rng.pick(freeCouches) : undefined
    const pool = roll >= 0.5 && roll < 0.75 ? world.coffee : [...world.kitchen, ...world.lounge]
    const open = pool.filter(p => !blocked.has(posKey(p)))
    const pickSpot = (): Target => {
      const spot = open.length > 0 ? rng.pick(open) : c
      return { col: spot.col, row: spot.row, kind: 'break' }
    }
    const target: Target = couch ? { col: couch.col, row: couch.row, kind: 'couch', seatId: couch.id } : pickSpot()
    if (couch) st.couches.set(couch.id, c.key)
    c.breakTarget = target
    c.idleFor = 0
    c.repickIn = range(8, 20)
    aim(c, target)
  }

  // ── finished agents ──────────────────────────────────────────────────────────
  const visitTile = (parent: Char): TilePos => {
    const blocked = unavailable()
    const next = DIRS.map(d => ({ col: parent.col + d.col, row: parent.row + d.row })).find(p => open(world.tiles, p, blocked))
    return next ?? { col: parent.col, row: parent.row }
  }

  const startDone = (c: Char): void => {
    const parent = st.chars.get(`${c.snap.sessionId}/${c.agent.parent ?? 'main'}`)
    if (parent === undefined || parent === c) { c.done = 'toDoor'; return }
    c.visit = visitTile(parent)
    c.done = 'toParent'
  }

  // ── sync ─────────────────────────────────────────────────────────────────────
  const spawn = (e: Entry): Char => {
    const c: Char = {
      key: e.key, palette: hashString(e.key) % 6,
      x: doorPx.x, y: doorPx.y, col: world.door.col, row: world.door.row, path: [], progress: 0, dir: 'up', replan: false,
      snap: e.snap, agent: e.agent, stale: false, isSelf: false,
      seatId: null, lounge: null,
      target: { col: world.door.col, row: world.door.row, kind: 'break' },
      breakTarget: null, idleFor: 0, repickIn: 0,
      done: null, visit: null, pause: 0, fx: null, anim: '', frame: 0, frameTimer: 0,
    }
    st.chars.set(e.key, c)
    return c
  }

  // Only someone the sim has seen alive may walk out: a finished agent with no character yet is
  // never created, so reopening the pane doesn't replay a parade of exits.
  const born = (e: Entry): Char | undefined => (e.agent.doneAt !== undefined ? undefined : spawn(e))

  const retarget = (c: Char, place: boolean): void => {
    // Placing means everyone is where they belong now, and a finished or departed character belongs nowhere.
    if (place && (c.stale || c.agent.doneAt !== undefined)) { removeChar(c); return }
    const done = c.agent.doneAt !== undefined && !c.stale
    if (!done) c.done = null
    else if (c.done === null) startDone(c)
    if (c.stale || done || c.agent.activity !== 'idle') {
      if (c.breakTarget !== null) leaveBreak(c)
      c.idleFor = 0
    }
    aim(c, goalOf(c))
    if (place) jump(c)
  }

  const updateWeather = (input: SimInput): void => {
    const self = input.snapshots.find(s => s.sessionId === input.selfSessionId)
    const percent = self
      ? self.context.percent
      : input.snapshots.filter(s => !isStale(s, input.now))
        .reduce<number | null>((m, s) => (s.context.percent === null ? m : m === null ? s.context.percent : Math.max(m, s.context.percent)), null)
    const weather = weatherOf(percent)
    if (weather === 'lightning' && st.weather !== 'lightning') st.flashIn = range(3, 7)
    if (weather !== 'lightning') st.flashLeft = 0
    st.weather = weather
  }

  // A message end: the door, an agent of the same session, another session's main, else the door.
  const endPos = (snap: Snapshot, ref: string | undefined, snaps: readonly Snapshot[]): Pt => {
    if (ref === undefined || ref === 'door') return doorPx
    const own = st.chars.get(`${snap.sessionId}/${ref}`)
    if (own) return bodyOf(own)
    const sid = ref.startsWith('session:') ? ref.slice('session:'.length) : ref
    const other = snaps.find(s => s.sessionId === sid && s.sessionId !== snap.sessionId)
    const main = other ? st.chars.get(`${other.sessionId}/main`) : undefined
    return main ? bodyOf(main) : doorPx
  }

  const emitBurst = (at: Pt, count: number, colors: readonly number[]): void => {
    Array.from({ length: count }).forEach((_, i) => {
      const angle = (i / count) * 2 * Math.PI
      const speed = range(25, 55)
      st.particles.push({ x: at.x, y: at.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, color: colors[i % colors.length]!, life: range(0.4, 0.8), age: 0, size: 2 })
    })
  }

  const emitSmoke = (at: Pt): void => {
    Array.from({ length: 6 }).forEach(() => {
      st.particles.push({ x: at.x + range(-4, 4), y: at.y, vx: range(-3, 3), vy: -12, color: 0x8a8a9a, life: range(0.8, 1.4), age: 0, size: 3 })
    })
  }

  // To the nearest window, then straight up and out.
  const flyOut = (from: Pt): void => {
    const win = [...windowPx].sort((a, b) => Math.hypot(a.x - from.x, a.y - from.y) - Math.hypot(b.x - from.x, b.y - from.y))[0]
    const via = win ?? from
    st.planes.push({ pts: [from, via, { x: via.x, y: -TILE }], arc: 0, dur: 1.5, t: 0 })
  }

  const play = (snap: Snapshot, e: Effect, snaps: readonly Snapshot[]): void => {
    if (e.kind === 'message') {
      st.planes.push({ pts: [endPos(snap, e.agent, snaps), endPos(snap, e.to, snaps)], arc: 20, dur: 1.2, t: 0 })
      return
    }
    const c = st.chars.get(`${snap.sessionId}/${e.agent}`)
    if (c === undefined) return
    const at = bodyOf(c)
    const bubble = EFFECT_BUBBLE[e.kind]
    if (bubble) c.fx = { bubble: { text: bubble.text, tone: bubble.tone }, until: st.time + bubble.sec }
    const burst = EFFECT_BURST[e.kind]
    if (burst) emitBurst(at, burst.count, burst.colors)
    if (e.kind === 'testFail') emitSmoke(at)
    if (e.kind === 'push') flyOut(at)
  }

  // On a session's first sight everything it already holds counts as seen.
  const playEffects = (input: SimInput): void => {
    for (const snap of input.snapshots) {
      const top = snap.effects.reduce((m, e) => Math.max(m, e.id), 0)
      const seen = st.seen.get(snap.sessionId)
      st.seen.set(snap.sessionId, Math.max(seen ?? 0, top))
      if (seen === undefined) continue
      snap.effects
        .filter(e => e.id > seen && input.now - e.at < EFFECT_MAX_AGE_MS)
        .sort((a, b) => a.id - b.id)
        .forEach(e => play(snap, e, input.snapshots))
    }
  }

  const beamSource = (kind: 'reading' | 'web' | 'running'): Pt | null => {
    const spots = kind === 'reading' ? world.bookshelfSpots : kind === 'running' ? world.coffee : []
    if (kind === 'web') return topWindow
    return spots.length > 0 ? tileCenter(rng.pick(spots)) : null
  }

  // One beam per in-flight tool that has a source; it lives as long as the tool does.
  const syncBeams = (): void => {
    const wanted = [...st.chars.values()]
      .filter(c => c.target.kind !== 'door')
      .flatMap(c => Object.entries(c.agent.inFlight).flatMap(([id, f]) => {
        const kind = beamKind(f.tool)
        return kind ? [{ key: `${c.key}/${id}`, charKey: c.key, kind }] : []
      }))
    const keep = new Set(wanted.map(w => w.key))
    for (const k of [...st.beams.keys()]) if (!keep.has(k)) st.beams.delete(k)
    for (const w of wanted) {
      if (st.beams.has(w.key)) continue
      const src = beamSource(w.kind)
      if (src) st.beams.set(w.key, { charKey: w.charKey, sx: src.x, sy: src.y, color: BEAM_COLOR[w.kind], timer: 0 })
    }
  }

  const sync = (input: SimInput): void => {
    const place = st.placeNext
    st.placeNext = false
    st.hour = input.localHour
    st.whiteboard = aggregateStats(input.snapshots, input.day)
    st.alerts = alertsFor(input.snapshots, input.selfSessionId, input.now)
    updateWeather(input)
    const entries = entriesOf(input.snapshots)
    const known = new Set(entries.map(e => e.key))
    // A session that vanished from the input is gone: its characters walk out.
    for (const c of st.chars.values()) if (!known.has(c.key)) c.stale = true
    for (const e of entries) {
      const stale = isStale(e.snap, input.now)
      const c = st.chars.get(e.key) ?? (stale ? undefined : born(e))
      if (c === undefined) continue
      c.snap = e.snap
      c.agent = e.agent
      c.stale = stale
      c.isSelf = e.snap.sessionId === input.selfSessionId && e.agent.kind === 'main'
      if (!stale && e.agent.doneAt === undefined) claimSeat(c)
    }
    for (const c of [...st.chars.values()]) retarget(c, place)
    playEffects(input)
    syncBeams()
  }

  // ── step ─────────────────────────────────────────────────────────────────────
  const updateChar = (c: Char, dt: number): boolean => {
    if (c.fx !== null && c.fx.until <= st.time) c.fx = null
    if (c.done === 'toParent' && atTarget(c)) {
      c.done = 'pause'
      c.pause = DONE_PAUSE
    } else if (c.done === 'pause') {
      c.pause -= dt
      if (c.pause <= 0) { c.done = 'toDoor'; aim(c, DOOR) }
    }
    dropStalePath(c)
    if (c.path.length === 0 && !atTarget(c)) plan(c)
    else moveAlong(c, WALK_PX * dt)
    // The goal changed mid-tile and moveAlong stopped at the boundary: plan at once, no pause.
    if (dropStalePath(c) && !atTarget(c)) plan(c)
    const arrived = atTarget(c)
    if (c.agent.activity === 'idle' && !c.stale && c.done === null) {
      if (c.breakTarget !== null) {
        c.repickIn -= dt
        if (c.repickIn <= 0) pickBreak(c)
      } else if (arrived && (c.target.kind === 'seat' || c.target.kind === 'lounge')) {
        c.idleFor += dt
        if (c.idleFor >= IDLE_AT_DESK) pickBreak(c)
      }
    }
    animate(c, dt)
    return arrived && c.target.kind === 'door'
  }

  const emitBeam = (b: Beam, c: Char): void => {
    const t = bodyOf(c)
    const dx = t.x - b.sx, dy = t.y - b.sy
    const dist = Math.hypot(dx, dy)
    if (dist < 1) return
    const ux = dx / dist, uy = dy / dist
    const nx = -uy, ny = ux
    const jitter = range(-1, 1) * 3
    st.particles.push({
      x: b.sx + nx * jitter, y: b.sy + ny * jitter,
      vx: ux * BEAM_SPEED + nx * jitter * 1.5, vy: uy * BEAM_SPEED + ny * jitter * 1.5,
      color: b.color, life: Math.min(Math.max(dist / BEAM_SPEED, 0.3), 2), age: 0, size: 3,
    })
  }

  const stepParticles = (dt: number): void => {
    for (const b of st.beams.values()) {
      const c = st.chars.get(b.charKey)
      if (c === undefined) continue
      b.timer -= dt
      if (b.timer <= 0) { b.timer += BEAM_EVERY; emitBeam(b, c) }
    }
    st.particles.forEach(p => { p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt })
    st.particles = st.particles.filter(p => p.age < p.life)
    st.planes.forEach(p => { p.t += dt })
    st.planes = st.planes.filter(p => p.t < p.dur)
  }

  const stepSky = (dt: number): void => {
    if (st.weather !== 'lightning') return
    if (st.flashLeft > 0) { st.flashLeft -= dt; return }
    st.flashIn -= dt
    if (st.flashIn <= 0) { st.flashLeft = 0.15; st.flashIn = range(3, 7) }
  }

  // ── the cat ──────────────────────────────────────────────────────────────────
  // Most tools in flight wins; ties go to whoever was seated first.
  const busiest = (): Char | undefined =>
    [...st.chars.values()]
      .filter(c => !c.stale && c.agent.doneAt === undefined && c.agent.activity !== 'idle')
      .reduce<Char | undefined>((best, c) => (best === undefined || Object.keys(c.agent.inFlight).length > Object.keys(best.agent.inFlight).length ? c : best), undefined)

  const pickCatGoal = (nap: boolean): TilePos => {
    const blocked = unavailable()
    const chairs = world.seats.filter(s => tileAt(world, s) === 'chair' && !st.seats.has(s.id))
    const pool: readonly TilePos[] = nap ? [...world.lounge, ...chairs] : walkable
    const free = pool.filter(p => !blocked.has(posKey(p)) && !(p.col === cat.col && p.row === cat.row))
    const p = free.length > 0 ? rng.pick(free) : cat
    return { col: p.col, row: p.row }
  }

  const catPlan = (): void => {
    if (cat.goal === null) return
    const path = findPath(world, cat, cat.goal, blockedExcept(cat.goal))
    cat.path = cat.mode === 'follow' ? path.slice(0, -1) : path   // following: stop one tile short
  }

  const stepCat = (dt: number): void => {
    cat.followIn -= dt
    if (cat.mode !== 'follow' && cat.followIn <= 0) {
      cat.followIn = range(45, 75)
      if (busiest() !== undefined) { cat.mode = 'follow'; cat.followLeft = FOLLOW_SEC; cat.repathIn = 0; cat.goal = null; cat.replan = true }
    }
    if (cat.mode === 'follow') {
      const lead = busiest()
      cat.followLeft -= dt
      cat.repathIn -= dt
      if (lead === undefined || cat.followLeft <= 0) {
        cat.mode = 'sit'; cat.timer = range(3, 8); cat.goal = null; cat.replan = true
      } else if (cat.repathIn <= 0) {
        cat.repathIn = 0.5; cat.goal = { col: lead.col, row: lead.row }; cat.replan = true
      }
    } else if (cat.mode === 'sit' || cat.mode === 'sleep') {
      cat.timer -= dt
      // A desk claimed under a napping cat wakes it.
      if (ownedTiles().has(posKey(cat))) cat.timer = 0
      if (cat.timer <= 0) {
        cat.mode = cat.mode === 'sit' && rng.next() < NAP_CHANCE ? 'nap' : 'wander'
        cat.goal = null
      }
    } else if (cat.goal === null) {
      cat.goal = pickCatGoal(cat.mode === 'nap')
      cat.replan = true
    } else if (cat.path.length === 0 && cat.progress === 0 && !cat.replan) {
      // Arrived (or there was no way): sit a while, or sleep if this was a nap.
      cat.timer = cat.mode === 'nap' ? range(20, 40) : range(3, 8)
      cat.mode = cat.mode === 'nap' ? 'sleep' : 'sit'
      cat.goal = null
    }
    const replanCat = (): void => { if (dropStalePath(cat)) catPlan() }
    replanCat()
    if (cat.path.length > 0) {
      moveAlong(cat, CAT_PX * dt)
      replanCat()   // moveAlong stops at a tile boundary when the goal changed: carry on without a pause
      advanceFrame(cat, dt, CAT_FRAME_DUR, 2)
    } else {
      cat.frame = 0
      cat.frameTimer = 0
    }
  }

  const step = (dt: number): void => {
    st.time += dt
    const leaving: Char[] = []
    for (const c of st.chars.values()) if (updateChar(c, dt)) leaving.push(c)
    // The door counts someone about to leave too: it stays open 0.6 s after.
    const near = [...st.chars.values()].some(c => Math.hypot(c.x - doorPx.x, c.y - doorPx.y) <= TILE)
    st.doorHold = near ? 0.6 : Math.max(0, st.doorHold - dt)
    leaving.forEach(removeChar)
    stepParticles(dt)
    stepSky(dt)
    stepCat(dt)
  }

  const settle = (): void => {
    for (const c of [...st.chars.values()]) {
      jump(c)
      if (c.target.kind === 'door') removeChar(c)
    }
    st.particles = []
    st.placeNext = true
  }

  // ── scene ────────────────────────────────────────────────────────────────────
  const planeView = (p: Plane): PlaneView => {
    const u = Math.min(p.t / p.dur, 1)
    const at = along(p.pts, u * polyLength(p.pts))
    return { x: at.x, y: at.y - p.arc * 4 * u * (1 - u), dir: dirOf(at.dx, at.dy) }
  }

  const particleView = (p: Particle): ParticleView => {
    const alpha = 1 - p.age / p.life
    return { x: p.x, y: p.y, color: alpha < 0.5 ? dim(p.color, alpha * 2) : p.color, size: p.size }
  }

  const monitors = (): MonitorView[] =>
    world.seats.flatMap(s => {
      if (!s.monitor) return []
      const key = st.seats.get(s.id)
      const c = key === undefined ? undefined : st.chars.get(key)
      const sitting = c !== undefined && c.target.kind === 'seat' && atTarget(c)
      const mode = sitting && c.agent.activity === 'typing' ? 'code' : sitting && c.agent.activity === 'running' ? 'term' : 'off'
      return [{ col: s.monitor.col, row: s.monitor.row, mode, phase: st.time } as const]
    })

  // The self agent waiting, any waiting agent, the self main if busy, any busy agent.
  const focusOf = (): { readonly x: number; readonly y: number } | null => {
    const live = [...st.chars.values()].filter(c => !c.stale && c.agent.doneAt === undefined)
    const self = live.find(c => c.isSelf)
    const pick =
      (self !== undefined && self.agent.waiting !== undefined ? self : undefined)
      ?? live.find(c => c.agent.waiting !== undefined)
      ?? (self !== undefined && self.agent.activity !== 'idle' ? self : undefined)
      ?? live.find(c => c.agent.activity !== 'idle')
    return pick ? { x: pick.x, y: pick.y } : null
  }

  const catView = (): CatView => ({
    x: cat.x, y: cat.y, dir: cat.dir,
    pose: cat.mode === 'sleep' ? 'sleep' : cat.path.length > 0 ? 'walk' : 'sit',
    frame: cat.frame,
  })

  const scene = (): Scene => ({
    characters: [...st.chars.values()].map(view),
    particles: st.particles.map(particleView),
    planes: st.planes.map(planeView),
    cat: catView(),
    monitors: monitors(),
    doorOpen: st.doorHold > 0,
    tvOn: [...st.chars.values()].some(c => c.target.kind === 'couch' && atTarget(c)),
    sky: { hour: st.hour, weather: st.weather, flash: st.flashLeft > 0, phase: st.time },
    whiteboard: st.whiteboard,
    focus: focusOf(),
    alerts: st.alerts,
    time: st.time,
  })

  return { sync, step, settle, scene }
}
