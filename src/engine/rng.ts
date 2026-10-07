// rng.ts — mulberry32: tiny, fast, good enough for wander targets and particle jitter.
export type Rng = { readonly next: () => number /* [0,1) */; readonly int: (min: number, max: number) => number /* inclusive */; readonly pick: <T>(xs: readonly T[]) => T }

export function createRng(seed: number): Rng {
  const st = { a: seed >>> 0 }
  const next = () => {
    st.a = (st.a + 0x6d2b79f5) >>> 0
    const t1 = Math.imul(st.a ^ (st.a >>> 15), 1 | st.a)
    const t2 = (t1 + Math.imul(t1 ^ (t1 >>> 7), 61 | t1)) ^ t1
    return ((t2 ^ (t2 >>> 14)) >>> 0) / 4294967296
  }
  return { next, int: (min, max) => min + Math.floor(next() * (max - min + 1)), pick: xs => xs[Math.floor(next() * xs.length)]! }
}

// FNV-1a 32-bit over code points, unsigned.
export function hashString(s: string): number {
  return [...s].reduce((h, ch) => Math.imul(h ^ ch.codePointAt(0)!, 0x01000193) >>> 0, 0x811c9dc5)
}
