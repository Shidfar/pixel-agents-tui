// Shared contracts between engine units, the mod shell and the binary.
// A change here is a cross-unit change: architect only.

// ── Truth: what each agent is doing ────────────────────────────────
export type Activity =
  | 'idle' | 'thinking' | 'typing' | 'running' | 'reading'
  | 'permission' | 'question' | 'planning' | 'compacting' | 'delegating'
export type AgentKind = 'main' | 'sub' | 'teammate'
export type ToolClass = 'typing' | 'running' | 'reading' | 'question' | 'delegating'

export type InFlight = { readonly tool: string; readonly detail: string; readonly startedAt: number }
export type Waiting = { readonly kind: 'permission' | 'question'; readonly tool: string; readonly detail: string; readonly at: number }

export type Agent = {
  readonly id: string                    // 'main', or the agentId Claude Code gives a subagent/teammate
  readonly kind: AgentKind
  readonly label: string                 // sanitizeText(…, 16)
  readonly parent?: string               // spawner's agent id ('main' or an agentId)
  readonly activity: Activity            // always equals activityOf(this) after reduce()
  readonly detail?: string               // sanitizeText(…, 30)
  readonly since: number                 // ms epoch when activity last changed
  readonly turnActive: boolean
  readonly inFlight: Readonly<Record<string, InFlight>>   // by tool_use_id
  readonly waiting?: Waiting
  readonly mode?: 'planning' | 'compacting'
  readonly doneAt?: number               // set when a sub/teammate finished; viewers walk it out
}

export type EffectKind = 'spawn' | 'done' | 'error' | 'commit' | 'push' | 'testPass' | 'testFail' | 'message' | 'compact'
export type Effect = { readonly id: number; readonly kind: EffectKind; readonly agent: string; readonly to?: string; readonly at: number }
// Effect.to for 'message': an agent id in the same session, or 'session:<sessionId>' for another session's main agent.

export type Stats = { readonly day: string; readonly tools: number; readonly edits: number; readonly commits: number; readonly permits: number; readonly errors: number }

export type Snapshot = {
  readonly v: 1
  readonly sessionId: string
  readonly name: string
  readonly cwd: string
  readonly startedAt: number
  readonly updatedAt: number
  readonly endedAt?: number
  readonly context: { readonly percent: number | null }
  readonly agents: readonly Agent[]      // 'main' first, then in order of appearance
  readonly effects: readonly Effect[]    // ring of the last 32, ids increasing
  readonly nextEffectId: number
  readonly stats: Stats
}

export type Json = Readonly<Record<string, unknown>>
export type TruthEvent =
  | { readonly type: 'turnStart'; readonly now: number }
  | { readonly type: 'turnEnd'; readonly agentId?: string; readonly aborted: boolean; readonly now: number }
  | { readonly type: 'toolStart'; readonly agentId?: string; readonly toolUseId: string; readonly tool: string; readonly input: Json; readonly now: number }
  | { readonly type: 'toolEnd'; readonly agentId?: string; readonly toolUseId: string; readonly tool: string; readonly input: Json; readonly ok: boolean; readonly now: number }
  | { readonly type: 'permissionAsk'; readonly agentId?: string; readonly tool: string; readonly input: Json; readonly now: number }
  | { readonly type: 'permissionDenied'; readonly agentId?: string; readonly tool: string; readonly now: number }
  | { readonly type: 'agentSeen'; readonly agentId: string; readonly kind: 'sub' | 'teammate'; readonly label: string; readonly parent?: string; readonly now: number }
  | { readonly type: 'spawn'; readonly agentId: string; readonly parent?: string; readonly label: string; readonly now: number }
  | { readonly type: 'subagentStop'; readonly agentId: string; readonly now: number }
  | { readonly type: 'teammateIdle'; readonly label: string; readonly now: number }
  | { readonly type: 'message'; readonly from: string; readonly to: string; readonly now: number }
  | { readonly type: 'compact'; readonly now: number }
  | { readonly type: 'planMode'; readonly on: boolean; readonly now: number }
  | { readonly type: 'context'; readonly percent: number | null; readonly now: number }
  | { readonly type: 'end'; readonly now: number }
export type TruthContext = { readonly day: string }   // local 'YYYY-MM-DD', computed by the shell
// A TruthEvent before the shell's clock stamps it.
export type Bare = TruthEvent extends infer E ? (E extends { readonly now: number } ? Omit<E, 'now'> : never) : never

// ── World ──────────────────────────────────────────────────────────
export const TILE = 16
export type Dir = 'down' | 'left' | 'right' | 'up'
export type Tile =
  | 'wall' | 'window' | 'whiteboard' | 'void'
  | 'floor1' | 'floor2' | 'floor3' | 'floor4' | 'floor5' | 'floor6' | 'floor7'
  | 'desk' | 'computer' | 'bookshelf' | 'plant' | 'chair' | 'rug' | 'counter' | 'appliance' | 'door'
  | 'couch' | 'tv' | 'coffeeTable' | 'gameConsole'
export type TilePos = { readonly col: number; readonly row: number }
export type Seat = { readonly id: string; readonly col: number; readonly row: number; readonly facing: Dir; readonly monitor?: TilePos }
export type World = {
  readonly cols: number
  readonly rows: number
  readonly tiles: readonly (readonly Tile[])[]   // [row][col]
  readonly seats: readonly Seat[]               // work-seat assignment priority order
  readonly couches: readonly Seat[]             // playroom couch spots: idle agents sit here facing the TV
  readonly tv: TilePos
  readonly door: TilePos
  readonly kitchen: readonly TilePos[]          // walkable floor3/floor4
  readonly lounge: readonly TilePos[]           // walkable rug, minus seats, couches and whiteboardSpot
  readonly bookshelfSpots: readonly TilePos[]   // walkable tiles beside a bookshelf
  readonly coffee: readonly TilePos[]           // walkable tiles beside an appliance
  readonly windows: readonly TilePos[]
  readonly whiteboard: readonly TilePos[]       // the board tiles, left to right
  readonly whiteboardSpot: TilePos              // where a planner stands, facing up
}

// ── Scene: sim → render ────────────────────────────────────────────
export type Pose = 'stand' | 'walk' | 'type' | 'read'
export type Tone = 'alert' | 'ask' | 'info' | 'ok' | 'bad'
export type Bubble = { readonly text: string; readonly tone: Tone }
export type CharacterView = {
  readonly key: string                   // `${sessionId}/${agentId}`
  readonly x: number                     // px, feet bottom-center
  readonly y: number
  readonly dir: Dir
  readonly pose: Pose
  readonly frame: number
  readonly palette: number               // 0..5, CHAR_PALETTES index
  readonly label: string
  readonly isSelf: boolean               // the viewer's own main agent
  readonly bubble?: Bubble
  readonly bob: number                   // px, vertical, permission bob; 0 normally
}
export type ParticleView = { readonly x: number; readonly y: number; readonly color: number; readonly size: 1 | 2 | 3 }
export type MonitorView = { readonly col: number; readonly row: number; readonly mode: 'code' | 'term' | 'off' }
export type Weather = 'clear' | 'clouds' | 'rain' | 'storm' | 'lightning'
export type SkyView = { readonly hour: number; readonly weather: Weather; readonly flash: boolean }
export type CatView = { readonly x: number; readonly y: number; readonly dir: Dir; readonly pose: 'walk' | 'sit' | 'sleep'; readonly frame: number }
export type PlaneView = { readonly x: number; readonly y: number; readonly dir: Dir }
export type Alert = { readonly sessionId: string; readonly name: string; readonly kind: 'permission' | 'question'; readonly detail: string; readonly at: number }
export type Scene = {
  readonly characters: readonly CharacterView[]
  readonly particles: readonly ParticleView[]
  readonly planes: readonly PlaneView[]
  readonly cat: CatView
  readonly monitors: readonly MonitorView[]
  readonly doorOpen: boolean
  readonly tvOn: boolean                 // someone is sitting on a couch
  readonly sky: SkyView
  readonly whiteboard: Stats
  readonly focus: { readonly x: number; readonly y: number } | null
  readonly alerts: readonly Alert[]
  readonly time: number                  // seconds since the sim started
}

// ── Render ─────────────────────────────────────────────────────────
export type ThemeName = 'default' | 'warm' | 'cool' | 'dark' | 'light'
export type CameraMode = 'auto' | 'fit' | 'x2' | 'x1'
export type Prefs = {
  readonly theme: ThemeName
  readonly camera: CameraMode
  readonly labels: boolean
  readonly effects: boolean
  readonly hd: boolean | null            // null: not decided yet, the shell auto-detects
  readonly paneOpen: boolean
}
export const DEFAULT_PREFS: Prefs = { theme: 'default', camera: 'auto', labels: true, effects: true, hd: null, paneOpen: false }
export type Camera = { readonly x: number; readonly y: number; readonly scale: number; readonly pendingScale: number; readonly pendingSec: number }
// x, y: world px of the view's top-left (may be negative when the view is larger than the world, to center it)
// scale: world px per output px (1 = native). Output px = one half-block row: cols × rows*2.
export type CellFrame = { readonly cols: number; readonly rows: number; readonly cells: Uint32Array; readonly pairs: number }
export type RgbaFrame = { readonly width: number; readonly height: number; readonly rgba: Uint8Array }
