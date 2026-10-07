// Helpers for the shared office: accounts on one Mac publish to /Users/Shared and read each other.
// Pure: paths are strings, callers do the I/O and pass the clock in.
import { REAP_MS, isStateFile, parseStateFile, sanitizeText } from './snapshots'
import type { Snapshot } from './types'

export const SHARED_ROOT = '/Users/Shared'
export const MAX_FOREIGN_BYTES = 256 * 1024
export const MAX_FOREIGN_SESSIONS = 50

// Folder and file names come from other accounts, so match the whole name and nothing looser.
const ACCOUNT = /^[a-z0-9._-]{1,32}$/
const FOREIGN_FOLDER = /^pixel-agents-([a-z0-9._-]{1,32})$/

export function accountOf(home: string): string | null {
  const last = home.split('/').filter(Boolean).pop() ?? ''
  return ACCOUNT.test(last) ? last : null
}

// `root` is /Users/Shared; the binary's tests point it elsewhere.
export function sharedFolder(account: string, root = SHARED_ROOT): string {
  return `${root}/pixel-agents-${account}`
}

export function sharedDir(account: string, root = SHARED_ROOT): string {
  return `${sharedFolder(account, root)}/sessions`
}

export function foreignAccount(folderName: string, self: string | null): string | null {
  const account = FOREIGN_FOLDER.exec(folderName)?.[1] ?? null
  return account === self ? null : account
}

// No full path leaves the home folder.
export function forShare(s: Snapshot): Snapshot {
  return { ...s, cwd: '' }
}

// Shown in the viewer's office as `<short>:<name>`, and the id can never collide with the viewer's own.
export function asForeign(s: Snapshot, account: string): Snapshot {
  const short = account.split('.')[0]!
  const name = sanitizeText(`${short}:${s.name}`, 16)
  return {
    ...s,
    sessionId: `${account}:${s.sessionId}`,
    name,
    agents: s.agents.map(a => (a.kind === 'main' ? { ...a, label: name } : a)),
  }
}

// What a viewer makes of another account's file: valid, named for its own session id, shown as theirs.
export function fromShared(name: string, text: string, account: string): Snapshot | null {
  const snap = parseStateFile(name, text)
  return snap === null ? null : asForeign(snap, account)
}

export function pickForeign<T extends { readonly mtimeMs: number; readonly size: number; readonly name: string }>(files: readonly T[], now: number): T[] {
  return files
    .filter(f => isStateFile(f.name) && f.size <= MAX_FOREIGN_BYTES && now - f.mtimeMs <= REAP_MS)
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, MAX_FOREIGN_SESSIONS)
}
