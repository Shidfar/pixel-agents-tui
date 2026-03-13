package main

// event_handler.go maps AgentEvents to Character state transitions.
// Separated from character.go (state machine updates) for clarity.

// HandleAgentEvent maps agent events to character state transitions.
func HandleAgentEvent(ch *Character, ev AgentEvent, office *Office) {
	switch ev.Type {
	case "agentToolStart":
		ch.IsActive = true
		ch.ActiveToolCount++
		ch.CurrentTool = ev.ToolName

		// Use CharRead for reading tools, CharType for everything else.
		if ReadingTools[ev.ToolName] {
			ch.State = CharRead
		} else {
			ch.State = CharType
		}
		ch.DestType = DestSeat
		ensureAtSeat(ch, office)
		ch.Frame = 0
		ch.FrameTimer = 0

	case "agentToolDone":
		ch.ActiveToolCount--
		if ch.ActiveToolCount < 0 {
			ch.ActiveToolCount = 0
		}
		if ch.ActiveToolCount == 0 {
			ch.CurrentTool = ""
		}

	case "agentWaiting":
		ch.IsActive = false
		ch.ActiveToolCount = 0
		ch.BubbleType = "waiting"
		ch.BubbleTimer = WaitingBubbleDurationSec
		// Don't immediately walk to break room — let updateTyping's delay
		// handle the transition. This prevents back-and-forth between turns
		// when the next turn starts within seconds.

	case "agentActive":
		ch.IsActive = true
		if ch.BubbleType == "waiting" {
			ch.BubbleType = ""
			ch.BubbleTimer = 0
		}

	case "agentToolPermission":
		ch.BubbleType = "permission"
		ch.BubbleTimer = 0

	case "agentToolPermissionClear":
		if ch.BubbleType == "permission" {
			ch.BubbleType = ""
			ch.BubbleTimer = 0
		}

	case "agentToolsClear":
		ch.ActiveToolCount = 0
		ch.CurrentTool = ""
	}
}

// ensureAtSeat pathfinds the character to their assigned seat if they're not there.
// If pathfinding fails (blocked or unreachable), the character is teleported to the
// seat to guarantee they are always at their desk when working.
func ensureAtSeat(ch *Character, office *Office) {
	if ch.SeatID == "" {
		return
	}
	seat, ok := office.Seats[ch.SeatID]
	if !ok {
		return
	}
	if ch.TileCol == seat.Col && ch.TileRow == seat.Row {
		ch.Dir = seat.FacingDir
		return
	}

	blocked := office.GetBlockedTiles()
	delete(blocked, TilePos{Col: seat.Col, Row: seat.Row})
	path := FindPath(
		TilePos{Col: ch.TileCol, Row: ch.TileRow},
		TilePos{Col: seat.Col, Row: seat.Row},
		office.TileMap, blocked,
	)
	if len(path) > 0 {
		ch.Path = path
		ch.MoveProgress = 0
		ch.State = CharWalk
		ch.Frame = 0
		ch.FrameTimer = 0
	} else {
		// No path found — teleport to seat so the character is always at
		// their desk when working, rather than typing at a random location.
		teleportToSeat(ch, seat)
	}
}

// teleportToSeat instantly moves a character to their seat position.
// Used as a fallback when pathfinding fails, so the character is never
// seen typing at a random location.
func teleportToSeat(ch *Character, seat *Seat) {
	ch.TileCol = seat.Col
	ch.TileRow = seat.Row
	ch.X, ch.Y = tileCenter(seat.Col, seat.Row)
	ch.Dir = seat.FacingDir
	ch.Path = nil
	ch.MoveProgress = 0
}

// facingBookshelf checks the 4 adjacent tiles for a TileBookshelf and returns
// the direction toward it. Defaults to DirUp if none found.
func facingBookshelf(ch *Character, office *Office) Direction {
	neighbors := []struct {
		dc, dr int
		dir    Direction
	}{
		{0, -1, DirUp},
		{0, 1, DirDown},
		{-1, 0, DirLeft},
		{1, 0, DirRight},
	}
	for _, n := range neighbors {
		c := ch.TileCol + n.dc
		r := ch.TileRow + n.dr
		if r >= 0 && r < len(office.TileMap) && c >= 0 && c < len(office.TileMap[r]) {
			if office.TileMap[r][c] == TileBookshelf {
				return n.dir
			}
		}
	}
	return DirUp
}
