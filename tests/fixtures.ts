// Builders several test files share. Not a *.test.ts, so `claude plugin test` does not run it.
import { demoSnapshots } from '../src/engine/demo'
import { initialSnapshot } from '../src/engine/truth'
import type { Agent, Snapshot } from '../src/engine/types'

export const DAY = '2026-10-02'
export const T0 = 1_000_000

export const agent = (over: Partial<Agent> = {}): Agent => ({ id: 'main', kind: 'main', label: 'repo', activity: 'idle', since: 0, turnActive: false, inFlight: {}, ...over })

// The demo crew `sec` seconds after T0.
export const at = (sec: number): Snapshot[] => demoSnapshots(T0 + sec * 1000, T0, DAY)

// A session that just started: one idle main agent.
export const freshSnapshot = (): Snapshot => initialSnapshot({ sessionId: 's1', name: 'repo', cwd: '/w/repo', now: 1000, day: DAY })
