// Helpers both shells (the mod and the binary) need. They live outside src/engine because the engine
// never reads the clock: `dayOf` and `hourOf` use Date, so only a shell may call them.

// Seconds one frame may advance the sim: after a stall, characters must not jump.
export const MAX_DT = 0.2

const pad2 = (n: number): string => String(n).padStart(2, '0')

// Local 'YYYY-MM-DD' of a ms epoch.
export const dayOf = (now: number): string => {
  const d = new Date(now)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

// Local hour of day as a fraction, for the windows' sky.
export const hourOf = (now: number): number => {
  const d = new Date(now)
  return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600
}

export const cycle = <T>(xs: readonly T[], x: T): T => xs[(xs.indexOf(x) + 1) % xs.length]!
