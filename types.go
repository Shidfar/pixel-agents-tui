package main

// ── Character State ─────────────────────────────────────────

type CharState int

const (
	CharIdle CharState = iota
	CharWalk
	CharType
	CharRead
	CharGone // offscreen — agent walked out the door
)

// ── Direction ───────────────────────────────────────────────

type Direction int

const (
	DirDown Direction = iota
	DirLeft
	DirRight
	DirUp
)

// ── TileType ────────────────────────────────────────────────

type TileType int

const (
	TileWall   TileType = 0
	TileFloor1 TileType = 1
	TileFloor2 TileType = 2
	TileFloor3 TileType = 3
	TileFloor4 TileType = 4
	TileFloor5 TileType = 5
	TileFloor6 TileType = 6
	TileFloor7 TileType = 7
	TileVoid   TileType = 8

	// Furniture tiles
	TileDesk        TileType = 9  // brown desk surface
	TileComputer    TileType = 10 // dark gray (monitor)
	TileBookshelf   TileType = 11 // dark brown with books
	TilePlant       TileType = 12 // green plant
	TileChair       TileType = 13 // lighter wood chair (walkable)
	TileRug         TileType = 14 // blue/teal carpet accent (walkable)
	TileCounter     TileType = 15 // kitchen counter (white/light)
	TileAppliance   TileType = 16 // kitchen appliance (silver)
	TileDoor        TileType = 17 // entrance/exit door (walkable)
	TileCouch       TileType = 18 // couch/sofa (walkable, agents sit here)
	TileTV          TileType = 19 // wall-mounted TV screen (not walkable)
	TileCoffeeTable TileType = 20 // low coffee table (not walkable)
	TileGameConsole TileType = 21 // PS4 game console (not walkable)
)

// ── Sprite ──────────────────────────────────────────────────

// Sprite is a 2D grid of hex color strings. Empty string = transparent.
type Sprite = [][]string

// ── Destination Type ────────────────────────────────────────

type DestType int

const (
	DestSeat      DestType = iota // go to assigned desk seat (typing)
	DestBookshelf                 // go to a bookshelf spot (reading)
	DestBreakRoom                 // go to kitchen or lounge (waiting/idle)
	DestWander                    // random walkable tile (idle wandering)
	DestDoor                      // walk to exit door (leaving the office)
	DestPlayroom                  // go to playroom (gaming/relaxing while idle)
)

// ── TilePos ─────────────────────────────────────────────────

type TilePos struct {
	Col int
	Row int
}

// ── Seat ────────────────────────────────────────────────────

type Seat struct {
	UID       string
	Col       int
	Row       int
	FacingDir Direction
	Zone      string // "work", "kitchen", "meeting" — controls assignment priority
	Assigned  bool
}

// ── Character ───────────────────────────────────────────────

type Character struct {
	ID              int
	State           CharState
	Dir             Direction
	X               float64
	Y               float64
	TileCol         int
	TileRow         int
	Path            []TilePos
	MoveProgress    float64
	CurrentTool     string
	IsActive        bool
	SeatID          string
	BubbleType      string // "permission", "waiting", or "" for none
	BubbleTimer     float64
	Palette         int
	HueShift        int
	Frame           int
	FrameTimer      float64
	WanderTimer     float64
	WanderCount     int
	WanderLimit     int
	SeatTimer       float64
	IdleTimer       float64 // tracks how long the character has been idle (seconds)
	ActiveToolCount int     // number of currently active tools (incremented/decremented by events)

	// Display
	Name        string             // display name for this agent
	ToolHistory []ToolHistoryEntry // recent tool history for panel

	// Activity zone navigation
	DestType DestType // what kind of destination we're walking to
	DestPos  TilePos  // target tile position for zone navigation

	// Message bubble (inter-agent communication)
	MessageBubble string  // e.g. "→ Alpha" — shown as speech bubble
	MessageTimer  float64 // countdown timer for message bubble display
	MessageTarget int     // ID of the target character (for particle beam)
	ParentID      int     // ID of parent agent (for spawned sub-agents)
}

// ── AgentState ──────────────────────────────────────────────

type AgentState struct {
	ID               int
	JsonlFile        string
	FileOffset       int64
	LineBuffer       string
	ActiveToolIDs    map[string]struct{}
	ActiveToolStatus map[string]string
	ActiveToolNames  map[string]string
	IsWaiting        bool
	PermissionSent   bool
	HadToolsInTurn   bool
}

// NewAgentState creates a properly initialized AgentState.
func NewAgentState(id int, jsonlFile string) *AgentState {
	return &AgentState{
		ID:               id,
		JsonlFile:        jsonlFile,
		ActiveToolIDs:    make(map[string]struct{}),
		ActiveToolStatus: make(map[string]string),
		ActiveToolNames:  make(map[string]string),
	}
}

// ── AgentEvent ──────────────────────────────────────────────

type AgentEvent struct {
	Type        string // "agentToolStart", "agentToolDone", "agentWaiting", "agentActive", "agentToolsClear", "agentToolPermission", "agentToolPermissionClear", "agentCreated"
	AgentID     int
	Status      string
	ToolID      string
	ToolName    string
	ToolStatus  string
	AgentName   string // display name (set on agentCreated events)
	MessageTo   string // recipient name for agentMessage events
	MessageText string // message content for agentMessage events
}

// ── OfficeLayout ────────────────────────────────────────────

type OfficeLayout struct {
	Cols  int
	Rows  int
	Tiles [][]TileType
	Seats []Seat
}

// NOTE: Office struct is defined in office.go with methods and full field set.

// ── KeyEvent ────────────────────────────────────────────────

type KeyEvent struct {
	Key  string
	Rune rune
}

// ── Tool classification maps ────────────────────────────────

// ReadingTools are tools that show a reading animation instead of typing.
var ReadingTools = map[string]bool{
	"Read":      true,
	"Grep":      true,
	"Glob":      true,
	"WebFetch":  true,
	"WebSearch": true,
}

// PermissionExemptTools are tools that don't trigger the permission-wait timer.
var PermissionExemptTools = map[string]bool{
	"Task":            true,
	"AskUserQuestion": true,
	"SendMessage":     true,
	"Agent":           true,
}

// ── Timing constants ────────────────────────────────────────

const (
	ToolDoneDelayMs       = 300
	TextIdleDelayMs       = 5000
	PermissionTimerMs     = 7000
	BashCmdDisplayMaxLen  = 30
	TaskDescDisplayMaxLen = 40
	TileSize              = 16
	WalkSpeedPxPerSec     = 48.0
	WalkFrameDurationSec  = 0.15
	TypeFrameDurationSec  = 0.3
	ReadFrameDurationSec  = 0.3

	WanderPauseMinSec        = 2.0
	WanderPauseMaxSec        = 20.0
	WanderMovesBeforeRestMin = 3
	WanderMovesBeforeRestMax = 6
	SeatRestMinSec           = 120.0
	SeatRestMaxSec           = 240.0

	WaitingBubbleDurationSec = 2.0
	FileWatcherPollMs        = 500
	ExitIdleTimeoutSec       = 600.0 // 10 minutes idle → agent walks out the door
)
