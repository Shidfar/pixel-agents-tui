import { expect, test } from 'claude-code/testing'
import { createSim, type SimInput } from '../src/engine/sim'
import { defaultWorld, isWalkable, tileCenter } from '../src/engine/world'
import type { Agent, Snapshot } from '../src/engine/types'

const world = defaultWorld()
const agent = (over: Partial<Agent>): Agent => ({ id: 'main', kind: 'main', label: 'repo', activity: 'idle', since: 0, turnActive: false, inFlight: {}, ...over })
const snap = (agents: Agent[], over: Partial<Snapshot> = {}): Snapshot => ({
  v: 1, sessionId: 's1', name: 'repo', cwd: '/w', startedAt: 0, updatedAt: 1_000, context: { percent: 10 },
  agents, effects: [], nextEffectId: 1, stats: { day: '2026-10-02', tools: 0, edits: 0, commits: 0, permits: 0, errors: 0 }, ...over,
})
const input = (snapshots: Snapshot[], now = 1_000): SimInput => ({ snapshots, selfSessionId: 's1', now, localHour: 12, day: '2026-10-02' })
const steps = (sim: ReturnType<typeof createSim>, seconds: number) => Array.from({ length: Math.round(seconds * 10) }).forEach(() => sim.step(0.1))
const char = (sim: ReturnType<typeof createSim>, key = 's1/main') => sim.scene().characters.find(c => c.key === key)

test('initial characters are placed, not walked: a typing agent sits at the first desk', async () => {
  const sim = createSim(world, 1)
  sim.sync(input([snap([agent({ activity: 'typing', turnActive: true, detail: 'Editing a.ts' })])]))
  sim.step(0.1)
  const c = char(sim)!
  expect([c.x, c.y, c.pose, c.dir, c.label, c.isSelf]).toEqual([56, 56, 'type', 'up', 'repo', true])
  expect(sim.scene().monitors.find(m => m.col === 4 && m.row === 2)!.mode).toBe('code')
  expect(c.bubble).toEqual({ text: 'Editing a.ts', tone: 'info' })
})

test('a later arrival spawns at the door and walks to its seat', async () => {
  const sim = createSim(world, 1)
  sim.sync(input([snap([agent({})])]))
  sim.sync(input([snap([agent({}), agent({ id: 'a1', kind: 'sub', label: 'intern', parent: 'main', activity: 'reading', turnActive: true })])]))
  sim.step(0.05)
  const door = tileCenter(world.door)
  expect([char(sim, 's1/a1')!.x, char(sim, 's1/a1')!.y]).toEqual([door.x, door.y])
  steps(sim, 20)
  const seat = tileCenter(world.seats[1]!)
  expect([char(sim, 's1/a1')!.x, char(sim, 's1/a1')!.y, char(sim, 's1/a1')!.pose]).toEqual([seat.x, seat.y, 'read'])
})

test('permission stands up with an alert bubble and bobs', async () => {
  const sim = createSim(world, 1)
  sim.sync(input([snap([agent({ activity: 'permission', detail: 'Bash: npm publish', waiting: { kind: 'permission', tool: 'Bash', detail: 'Bash: npm publish', at: 0 } })])]))
  steps(sim, 0.3)
  expect(char(sim)!.bubble).toEqual({ text: '! Bash: npm publish', tone: 'alert' })
  expect(char(sim)!.pose).toBe('stand')
  const bobs = new Set(Array.from({ length: 12 }, () => (sim.step(0.05), char(sim)!.bob)))
  expect(bobs.size > 1).toBe(true)
})

test('an idle agent leaves the desk for the break area after a few seconds', async () => {
  const sim = createSim(world, 3)
  sim.sync(input([snap([agent({ activity: 'idle' })])]))
  steps(sim, 25)
  const c = char(sim)!
  const onBreak = [...world.kitchen, ...world.lounge, ...world.coffee, ...world.couches].some(p => tileCenter(p).x === c.x && tileCenter(p).y === c.y)
  expect(onBreak || c.pose === 'walk').toBe(true)
})

test('a finished intern visits its parent and walks out', async () => {
  const sim = createSim(world, 1)
  const live = snap([agent({ activity: 'thinking', turnActive: true }), agent({ id: 'a1', kind: 'sub', label: 'intern', parent: 'main', activity: 'reading', turnActive: true })])
  sim.sync(input([live]))
  sim.sync(input([snap([live.agents[0]!, { ...live.agents[1]!, activity: 'idle', turnActive: false, doneAt: 1_000 }])]))
  steps(sim, 40)
  expect(char(sim, 's1/a1')).toBeUndefined()
})

test('an ended session walks out and disappears', async () => {
  const sim = createSim(world, 1)
  sim.sync(input([snap([agent({})], { sessionId: 's2', name: 'other' })]))
  sim.sync(input([snap([agent({})], { sessionId: 's2', name: 'other', endedAt: 1_500 })], 2_000))
  steps(sim, 40)
  expect(sim.scene().characters.length).toBe(0)
})

test('20 agents: nobody is dropped, 11 sit, 9 stand in the lounge', async () => {
  const sim = createSim(world, 1)
  const agents = [agent({ activity: 'typing', turnActive: true }), ...Array.from({ length: 19 }, (_, i) => agent({ id: 'a' + i, kind: 'sub', label: 'i' + i, parent: 'main', activity: 'typing', turnActive: true }))]
  sim.sync(input([snap(agents)]))
  sim.settle()
  sim.step(0.1)
  const cs = sim.scene().characters
  expect(cs.length).toBe(20)
  const seated = cs.filter(c => world.seats.some(s => tileCenter(s).x === c.x && tileCenter(s).y === c.y))
  expect(seated.length).toBe(11)
})

test('effects dedupe: old effects are not replayed on first sight, new ones are', async () => {
  const sim = createSim(world, 1)
  const old = snap([agent({})], { effects: [{ id: 1, kind: 'commit', agent: 'main', at: 900 }], nextEffectId: 2 })
  sim.sync(input([old]))
  sim.step(0.05)
  expect(sim.scene().particles.length).toBe(0)
  sim.sync(input([{ ...old, effects: [...old.effects, { id: 2, kind: 'commit', agent: 'main', at: 1_000 }], nextEffectId: 3 }]))
  sim.step(0.05)
  expect(sim.scene().particles.length > 0).toBe(true)
})

test('a message flies a paper plane that lands', async () => {
  const sim = createSim(world, 1)
  const s = snap([agent({}), agent({ id: 'a1', kind: 'sub', label: 'i', parent: 'main', activity: 'reading', turnActive: true })])
  sim.sync(input([s]))
  sim.sync(input([{ ...s, effects: [{ id: 1, kind: 'message', agent: 'main', to: 'a1', at: 1_000 }], nextEffectId: 2 }]))
  sim.step(0.1)
  expect(sim.scene().planes.length).toBe(1)
  steps(sim, 2)
  expect(sim.scene().planes.length).toBe(0)
})

test('the cat wanders', async () => {
  const sim = createSim(world, 5)
  sim.sync(input([snap([agent({})])]))
  const seen = new Set(Array.from({ length: 300 }, () => (sim.step(0.1), `${sim.scene().cat.x},${sim.scene().cat.y}`)))
  expect(seen.size > 5).toBe(true)
})

test('deterministic for a seed', async () => {
  const run = () => { const sim = createSim(world, 9); sim.sync(input([snap([agent({ activity: 'idle' })])])); steps(sim, 30); return JSON.stringify(sim.scene()) }
  expect(run()).toBe(run())
})

test('weather follows your context fill; alerts, whiteboard and focus come from snapshots', async () => {
  const weatherAt = (percent: number | null) => { const sim = createSim(world, 1); sim.sync(input([snap([agent({})], { context: { percent } })])); sim.step(0.1); return sim.scene().sky.weather }
  expect([10, 40, 60, 80, 95, null].map(weatherAt)).toEqual(['clear', 'clouds', 'rain', 'storm', 'lightning', 'clear'])
  const sim = createSim(world, 1)
  const waiting = agent({ activity: 'permission', waiting: { kind: 'permission', tool: 'Bash', detail: 'Bash: x', at: 1 } })
  sim.sync(input([snap([agent({})]), snap([waiting], { sessionId: 's2', name: 'api', stats: { day: '2026-10-02', tools: 7, edits: 1, commits: 0, permits: 1, errors: 0 } })]))
  sim.step(0.1)
  const sc = sim.scene()
  expect(sc.alerts.map(a => a.name)).toEqual(['api'])
  expect(sc.whiteboard.tools).toBe(7)
  const s2 = sc.characters.find(c => c.key === 's2/main')!
  expect(sc.focus).toEqual({ x: s2.x, y: s2.y })
})

// ── beyond the plan's acceptance tests ───────────────────────────────────────

const crowd = (n: number) => [agent({ activity: 'typing', turnActive: true }), ...Array.from({ length: n - 1 }, (_, i) => agent({ id: 'a' + i, kind: 'sub', label: 'i' + i, parent: 'main', activity: 'typing', turnActive: true }))]
const at = (c: { x: number; y: number }, p: { col: number; row: number }) => tileCenter(p).x === c.x && tileCenter(p).y === c.y

test('overflow agents each stand on their own lounge tile and keep their labels', async () => {
  const sim = createSim(world, 1)
  sim.sync(input([snap(crowd(20))]))
  sim.settle()
  sim.step(0.1)
  const standing = sim.scene().characters.filter(c => !world.seats.some(s => at(c, s)))
  expect(standing.length).toBe(9)
  expect(new Set(standing.map(c => `${c.x},${c.y}`)).size).toBe(9)
  expect(standing.every(c => c.pose === 'stand' && c.label.length > 0 && world.lounge.some(p => at(c, p)))).toBe(true)
})

test('an overflow agent takes a seat once one frees up', async () => {
  const sim = createSim(world, 1)
  const sessions = (ids: number[]) => ids.map(i => snap([agent({ activity: 'typing', turnActive: true })], { sessionId: 's' + String(i).padStart(2, '0'), name: 'n' + i, startedAt: i }))
  const all = Array.from({ length: 12 }, (_, i) => i)
  sim.sync({ ...input(sessions(all)), selfSessionId: null })
  sim.settle()
  sim.step(0.1)
  const last = () => char(sim, 's11/main')!
  expect(world.seats.some(s => at(last(), s))).toBe(false)
  const rest = all.slice(1)
  sim.sync({ ...input(sessions(rest)), selfSessionId: null })
  steps(sim, 30)
  sim.sync({ ...input(sessions(rest)), selfSessionId: null })
  steps(sim, 30)
  expect(char(sim, 's00/main')).toBeUndefined()
  expect(world.seats.some(s => at(last(), s))).toBe(true)
})

test('seats follow startedAt then sessionId, not the order snapshots arrive in', async () => {
  const older = snap([agent({})], { sessionId: 'b', name: 'b', startedAt: 5 })
  const newer = snap([agent({})], { sessionId: 'a', name: 'a', startedAt: 10 })
  const seatsFor = (order: Snapshot[]) => {
    const sim = createSim(world, 1)
    sim.sync({ ...input(order), selfSessionId: null })
    return ['b/main', 'a/main'].map(k => [char(sim, k)!.x, char(sim, k)!.y])
  }
  const w1 = tileCenter(world.seats[0]!), w2 = tileCenter(world.seats[1]!)
  expect(seatsFor([older, newer])).toEqual([[w1.x, w1.y], [w2.x, w2.y]])
  expect(seatsFor([newer, older])).toEqual([[w1.x, w1.y], [w2.x, w2.y]])
})

test('the first sync after settle places newcomers instead of walking them in', async () => {
  const sim = createSim(world, 1)
  sim.sync(input([snap([agent({})])]))
  sim.settle()
  sim.sync(input([snap([agent({}), agent({ id: 'a1', kind: 'sub', label: 'i', parent: 'main', activity: 'reading', turnActive: true })])]))
  const seat = tileCenter(world.seats[1]!)
  expect([char(sim, 's1/a1')!.x, char(sim, 's1/a1')!.y]).toEqual([seat.x, seat.y])
})

test('a stale session with no characters yet gets none: ended, timed out, on any sync', async () => {
  const first = createSim(world, 1)
  first.sync(input([snap([agent({})], { endedAt: 500 })], 2_000))
  expect(first.scene().characters.length).toBe(0)
  const timedOut = createSim(world, 1)
  timedOut.sync(input([snap([agent({})])], 60_000))
  expect(timedOut.scene().characters.length).toBe(0)
  const later = createSim(world, 1)
  later.sync(input([snap([agent({})])]))
  later.sync(input([snap([agent({})]), snap([agent({})], { sessionId: 's2', name: 'old', endedAt: 500 })], 2_000))
  expect(later.scene().characters.map(c => c.key)).toEqual(['s1/main'])
})

test('a finished intern on first sight is never created: only the main character shows', async () => {
  const sim = createSim(world, 1)
  const done = snap([agent({ activity: 'thinking', turnActive: true }), agent({ id: 'a1', kind: 'sub', label: 'intern', parent: 'main', activity: 'idle', doneAt: 900 })])
  sim.sync(input([done]))
  expect(sim.scene().characters.map(c => c.key)).toEqual(['s1/main'])
  steps(sim, 5)
  expect(sim.scene().characters.map(c => c.key)).toEqual(['s1/main'])
})

test('settle, then a sync after the intern finished, gives no intern', async () => {
  const sim = createSim(world, 1)
  const main = agent({ activity: 'thinking', turnActive: true })
  sim.sync(input([snap([main])]))
  sim.settle()
  sim.sync(input([snap([main, agent({ id: 'a1', kind: 'sub', label: 'intern', parent: 'main', activity: 'idle', doneAt: 900 })])]))
  expect(sim.scene().characters.map(c => c.key)).toEqual(['s1/main'])
  sim.sync(input([snap([main, agent({ id: 'a1', kind: 'sub', label: 'intern', parent: 'main', activity: 'idle', doneAt: 900 })])]))
  steps(sim, 5)
  expect(sim.scene().characters.map(c => c.key)).toEqual(['s1/main'])
})

test('an intern seen alive, then settle, then a sync where it is done: no intern', async () => {
  const sim = createSim(world, 1)
  const main = agent({ activity: 'thinking', turnActive: true })
  const intern = agent({ id: 'a1', kind: 'sub', label: 'intern', parent: 'main', activity: 'reading', turnActive: true })
  sim.sync(input([snap([main, intern])]))
  expect(sim.scene().characters.map(c => c.key)).toEqual(['s1/main', 's1/a1'])
  sim.settle()
  sim.sync(input([snap([main, { ...intern, activity: 'idle', turnActive: false, doneAt: 1_000 }])]))
  expect(sim.scene().characters.map(c => c.key)).toEqual(['s1/main'])
})

test('a session seen alive, then settle, then a sync where it ended: none of its characters', async () => {
  const sim = createSim(world, 1)
  const mine = snap([agent({})])
  const other = snap([agent({}), agent({ id: 'a1', kind: 'sub', label: 'i', parent: 'main', activity: 'reading', turnActive: true })], { sessionId: 's2', name: 'other' })
  sim.sync(input([mine, other]))
  expect(sim.scene().characters.filter(c => c.key.startsWith('s2/')).length).toBe(2)
  sim.settle()
  sim.sync(input([mine, { ...other, endedAt: 1_500 }], 2_000))
  expect(sim.scene().characters.map(c => c.key)).toEqual(['s1/main'])
})

test('a session that vanished from the input is removed by a place-sync', async () => {
  const sim = createSim(world, 1)
  sim.sync(input([snap([agent({})]), snap([agent({})], { sessionId: 's2', name: 'other' })]))
  sim.settle()
  sim.sync(input([snap([agent({})])]))
  expect(sim.scene().characters.map(c => c.key)).toEqual(['s1/main'])
})

test('a finished intern does not come back while its snapshot lingers', async () => {
  const sim = createSim(world, 1)
  const live = snap([agent({ activity: 'thinking', turnActive: true }), agent({ id: 'a1', kind: 'sub', label: 'intern', parent: 'main', activity: 'reading', turnActive: true })])
  const done = snap([live.agents[0]!, { ...live.agents[1]!, activity: 'idle', turnActive: false, doneAt: 1_000 }])
  sim.sync(input([live]))
  sim.sync(input([done]))
  steps(sim, 40)
  expect(char(sim, 's1/a1')).toBeUndefined()
  sim.sync(input([done]))
  steps(sim, 2)
  expect(char(sim, 's1/a1')).toBeUndefined()
})

test('a finished intern pauses next to its parent with a check mark first', async () => {
  const sim = createSim(world, 1)
  const live = snap([agent({ activity: 'thinking', turnActive: true }), agent({ id: 'a1', kind: 'sub', label: 'intern', parent: 'main', activity: 'reading', turnActive: true })])
  sim.sync(input([live]))
  sim.sync(input([snap([live.agents[0]!, { ...live.agents[1]!, activity: 'idle', turnActive: false, doneAt: 1_000 }])]))
  const parent = tileCenter(world.seats[0]!)
  const pausing = Array.from({ length: 160 }, () => (sim.step(0.05), char(sim, 's1/a1'))).filter(c => c?.bubble?.text === '✓')
  expect(pausing.length > 8).toBe(true)
  expect(pausing.every(c => Math.abs(c!.x - parent.x) + Math.abs(c!.y - parent.y) === 16 && c!.pose === 'stand')).toBe(true)
})

test('a planning agent stands at the whiteboard facing up', async () => {
  const sim = createSim(world, 1)
  sim.sync(input([snap([agent({ activity: 'planning', turnActive: true, mode: 'planning' })])]))
  const c = char(sim)!
  const spot = tileCenter(world.whiteboardSpot)
  expect([c.x, c.y, c.dir, c.pose, c.bubble]).toEqual([spot.x, spot.y, 'up', 'stand', { text: 'planning', tone: 'info' }])
})

test('delegating counts only unfinished interns', async () => {
  const sim = createSim(world, 1)
  const lead = agent({ activity: 'delegating', turnActive: true })
  const intern = (id: string, over: Partial<Agent> = {}) => agent({ id, kind: 'sub', label: id, parent: 'main', activity: 'reading', turnActive: true, ...over })
  sim.sync(input([snap([lead, intern('a1'), intern('a2'), intern('a3', { doneAt: 900 })])]))
  expect(char(sim)!.bubble).toEqual({ text: 'waiting on 2 interns', tone: 'info' })
  sim.sync(input([snap([lead, intern('a1'), intern('a2', { doneAt: 900 })])]))
  expect(char(sim)!.bubble).toEqual({ text: 'waiting on 1 intern', tone: 'info' })
})

test('thinking cycles its dots every 0.4 s', async () => {
  const sim = createSim(world, 1)
  sim.sync(input([snap([agent({ activity: 'thinking', turnActive: true })])]))
  sim.step(0.1)
  const dots = [char(sim)!.bubble!.text]
  steps(sim, 0.4)
  dots.push(char(sim)!.bubble!.text)
  steps(sim, 0.4)
  dots.push(char(sim)!.bubble!.text)
  expect(dots).toEqual(['.', '..', '...'])
})

test('an effect bubble shows for its time; permission and question beat it', async () => {
  const typing = snap([agent({ activity: 'typing', turnActive: true, detail: 'Editing a.ts' })])
  const withError = (s: Snapshot) => ({ ...s, effects: [{ id: 1, kind: 'error' as const, agent: 'main', at: 1_000 }], nextEffectId: 2 })
  const sim = createSim(world, 1)
  sim.sync(input([typing]))
  sim.sync(input([withError(typing)]))
  expect(char(sim)!.bubble).toEqual({ text: '!', tone: 'bad' })
  steps(sim, 1.6)
  expect(char(sim)!.bubble).toEqual({ text: 'Editing a.ts', tone: 'info' })
  const ask = snap([agent({ activity: 'question', detail: 'Which db?', waiting: { kind: 'question', tool: 'AskUserQuestion', detail: 'Which db?', at: 0 } })])
  const sim2 = createSim(world, 1)
  sim2.sync(input([ask]))
  sim2.sync(input([withError(ask)]))
  expect(char(sim2)!.bubble).toEqual({ text: '? Which db?', tone: 'ask' })
})

test('effects older than 10 s are never played', async () => {
  const sim = createSim(world, 1)
  const base = snap([agent({})])
  sim.sync(input([base], 20_000))
  sim.sync(input([{ ...base, effects: [{ id: 1, kind: 'commit', agent: 'main', at: 5_000 }], nextEffectId: 2 }], 20_000))
  sim.step(0.05)
  expect(sim.scene().particles.length).toBe(0)
  sim.sync(input([{ ...base, effects: [{ id: 1, kind: 'commit', agent: 'main', at: 5_000 }, { id: 2, kind: 'commit', agent: 'main', at: 19_000 }], nextEffectId: 3 }], 20_000))
  sim.step(0.05)
  expect(sim.scene().particles.length > 0).toBe(true)
})

test('a message from the door starts at the door; an unknown target flies out through it', async () => {
  const door = tileCenter(world.door)
  const s = snap([agent({})])
  const fly = (e: { agent: string; to: string }) => {
    const sim = createSim(world, 1)
    sim.sync(input([s]))
    sim.sync(input([{ ...s, effects: [{ id: 1, kind: 'message', ...e, at: 1_000 }], nextEffectId: 2 }]))
    return sim
  }
  const fromDoor = fly({ agent: 'door', to: 'main' })
  fromDoor.step(0.05)
  const p = fromDoor.scene().planes[0]!
  expect(Math.abs(p.x - door.x) < 8 && p.y > door.y - 20).toBe(true)
  const toDoor = fly({ agent: 'main', to: 'nowhere' })
  steps(toDoor, 1.1)
  const q = toDoor.scene().planes[0]!
  expect(Math.abs(q.x - door.x) < 12 && q.y > door.y - 30).toBe(true)
})

test('a message to another session lands on that session main', async () => {
  const sim = createSim(world, 1)
  const a = snap([agent({})])
  const b = snap([agent({})], { sessionId: 's2', name: 'api' })
  sim.sync(input([a, b]))
  sim.sync(input([{ ...a, effects: [{ id: 1, kind: 'message', agent: 'main', to: 'session:s2', at: 1_000 }], nextEffectId: 2 }, b]))
  const flight = Array.from({ length: 30 }, () => (sim.step(0.05), sim.scene().planes[0])).filter(p => p !== undefined)
  const end = char(sim, 's2/main')!
  const last = flight[flight.length - 1]!
  expect(Math.hypot(last.x - end.x, last.y - (end.y - 8)) < 10).toBe(true)
})

test('a push flies a plane out through a window and the agent says pushed', async () => {
  const sim = createSim(world, 1)
  const s = snap([agent({})])
  sim.sync(input([s]))
  sim.sync(input([{ ...s, effects: [{ id: 1, kind: 'push', agent: 'main', at: 1_000 }], nextEffectId: 2 }]))
  expect(char(sim)!.bubble).toEqual({ text: 'pushed', tone: 'ok' })
  const flight = Array.from({ length: 40 }, () => (sim.step(0.05), sim.scene().planes[0])).filter(p => p !== undefined)
  expect(flight.length > 20 && flight.length < 40).toBe(true)
  expect(flight[flight.length - 1]!.y < 0).toBe(true)
})

test('a failed test puffs red sparks and gray smoke; a commit throws confetti', async () => {
  const colors = (kind: 'testFail' | 'commit') => {
    const sim = createSim(world, 1)
    const s = snap([agent({})])
    sim.sync(input([s]))
    sim.sync(input([{ ...s, effects: [{ id: 1, kind, agent: 'main', at: 1_000 }], nextEffectId: 2 }]))
    return new Set(sim.scene().particles.map(p => p.color))
  }
  expect(colors('testFail')).toEqual(new Set([0xff4444, 0x8a8a9a]))
  expect(colors('commit').size).toBe(5)
})

test('a reading tool in flight streams particles, and they stop when it ends', async () => {
  const sim = createSim(world, 1)
  const reading = agent({ activity: 'reading', turnActive: true, detail: 'Grep x', inFlight: { t1: { tool: 'Grep', detail: 'x', startedAt: 900 } } })
  sim.sync(input([snap([reading])]))
  sim.step(0.05)
  expect(sim.scene().particles.length > 0).toBe(true)
  sim.sync(input([snap([agent({ activity: 'thinking', turnActive: true })])]))
  steps(sim, 3)
  expect(sim.scene().particles.length).toBe(0)
})

test('settle clears particles', async () => {
  const sim = createSim(world, 1)
  const s = snap([agent({})])
  sim.sync(input([s]))
  sim.sync(input([{ ...s, effects: [{ id: 1, kind: 'commit', agent: 'main', at: 1_000 }], nextEffectId: 2 }]))
  sim.step(0.05)
  sim.settle()
  expect(sim.scene().particles.length).toBe(0)
})

test('walkers cover 48 px/s and cycle four walk frames', async () => {
  const sim = createSim(world, 1)
  sim.sync(input([snap([agent({})])]))
  sim.sync(input([snap([agent({}), agent({ id: 'a1', kind: 'sub', label: 'i', parent: 'main', activity: 'reading', turnActive: true })])]))
  sim.step(0.05)
  const door = tileCenter(world.door)
  const frames = Array.from({ length: 20 }, () => (sim.step(0.05), char(sim, 's1/a1')!))
  const c = char(sim, 's1/a1')!
  expect(Math.round(Math.abs(c.x - door.x) + Math.abs(c.y - door.y))).toBe(48)
  expect(c.pose).toBe('walk')
  expect(new Set(frames.map(f => f.frame))).toEqual(new Set([0, 1, 2, 3]))
})

test('the door opens for anyone within a tile and closes 0.6 s after they leave', async () => {
  const sim = createSim(world, 1)
  sim.sync(input([snap([agent({})])]))
  sim.step(0.1)
  expect(sim.scene().doorOpen).toBe(false)
  sim.sync(input([snap([agent({}), agent({ id: 'a1', kind: 'sub', label: 'i', parent: 'main', activity: 'reading', turnActive: true })])]))
  sim.step(0.1)
  expect(sim.scene().doorOpen).toBe(true)
  steps(sim, 2)
  expect(sim.scene().doorOpen).toBe(false)
})

test('an idle agent sometimes takes a couch facing the TV, and the TV turns on', async () => {
  const watch = (seed: number) => {
    const sim = createSim(world, seed)
    sim.sync(input([snap([agent({})])]))
    return Array.from({ length: 600 }, () => (sim.step(0.1), [sim.scene().tvOn, char(sim)!] as const))
      .some(([tv, c]) => tv && c.pose === 'read' && c.dir === 'up' && world.couches.some(p => at(c, p)))
  }
  expect(Array.from({ length: 8 }, (_, i) => watch(i + 1)).some(Boolean)).toBe(true)
})

test('a couch is held by one character at a time', async () => {
  const sim = createSim(world, 4)
  const idlers = Array.from({ length: 6 }, (_, i) => agent({ id: 'a' + i, kind: 'sub', label: 'i' + i, parent: 'main' }))
  sim.sync(input([snap([agent({}), ...idlers])]))
  const onCouch = Array.from({ length: 1200 }, () => {
    sim.step(0.1)
    return sim.scene().characters.filter(c => c.pose === 'read' && world.couches.some(p => at(c, p))).map(c => `${c.x},${c.y}`)
  })
  expect(onCouch.some(xs => xs.length >= 2)).toBe(true)
  expect(onCouch.every(xs => new Set(xs).size === xs.length)).toBe(true)
})

test('monitors glow code for typing and terminal for running, and stay off otherwise', async () => {
  const sim = createSim(world, 1)
  sim.sync({ ...input([snap([agent({ activity: 'running', turnActive: true }), agent({ id: 'a1', kind: 'sub', label: 'i', parent: 'main', activity: 'thinking', turnActive: true })])]) })
  sim.step(0.1)
  const modes = sim.scene().monitors.slice(0, 3).map(m => m.mode)
  expect(modes).toEqual(['term', 'off', 'off'])
})

test('weather without a self session follows the busiest live session; stale ones do not count', async () => {
  const sim = createSim(world, 1)
  const a = snap([agent({})], { sessionId: 'a', context: { percent: 10 } })
  const b = snap([agent({})], { sessionId: 'b', context: { percent: 80 } })
  const old = snap([agent({})], { sessionId: 'c', context: { percent: 99 }, endedAt: 500 })
  sim.sync({ ...input([a, b, old], 1_000), selfSessionId: null })
  sim.step(0.1)
  expect(sim.scene().sky.weather).toBe('storm')
})

test('lightning flashes in short bursts, and only in lightning weather', async () => {
  const flashes = (percent: number) => {
    const sim = createSim(world, 2)
    sim.sync(input([snap([agent({})], { context: { percent } })]))
    return Array.from({ length: 400 }, () => (sim.step(0.1), sim.scene().sky.flash)).filter(Boolean).length
  }
  expect(flashes(95) > 0).toBe(true)
  expect(flashes(95) < 40).toBe(true)
  expect(flashes(10)).toBe(0)
})

test('focus goes to a waiting agent, else the busy self, else any busy agent, else nothing', async () => {
  const focusOf = (selfAgent: Agent, other: Agent | null) => {
    const sim = createSim(world, 1)
    sim.sync(input([snap([selfAgent]), ...(other ? [snap([other], { sessionId: 's2', name: 'api' })] : [])]))
    sim.step(0.1)
    return { sc: sim.scene(), self: char(sim, 's1/main')!, other: char(sim, 's2/main') }
  }
  expect(focusOf(agent({}), null).sc.focus).toBe(null)
  const busy = focusOf(agent({ activity: 'typing', turnActive: true }), agent({}))
  expect(busy.sc.focus).toEqual({ x: busy.self.x, y: busy.self.y })
  const other = focusOf(agent({}), agent({ activity: 'reading', turnActive: true }))
  expect(other.sc.focus).toEqual({ x: other.other!.x, y: other.other!.y })
})

test('the cat only rests on walkable tiles, and now and then naps', async () => {
  const centers = new Set(world.tiles.flatMap((r, row) => r.flatMap((t, col) => (isWalkable(t) ? [`${tileCenter({ col, row }).x},${tileCenter({ col, row }).y}`] : []))))
  const rests = Array.from({ length: 6 }, (_, i) => {
    const sim = createSim(world, i + 1)
    sim.sync(input([snap([agent({})])]))
    return Array.from({ length: 3000 }, () => (sim.step(0.1), sim.scene().cat)).filter(c => c.pose !== 'walk')
  }).flat()
  expect(rests.every(c => centers.has(`${c.x},${c.y}`))).toBe(true)
  expect(rests.some(c => c.pose === 'sleep')).toBe(true)
})
