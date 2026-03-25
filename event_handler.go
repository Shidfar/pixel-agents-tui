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
		ch.IdleTimer = 0
		// Clear permission bubble — agent is actively working
		if ch.BubbleType == "permission" {
			ch.BubbleType = ""
			ch.BubbleTimer = 0
		}
		AddToolHistory(ch, ev.ToolName, "active")

		// Respawn if the agent had left the office
		if ch.State == CharGone {
			respawnAtDoor(ch, office)
		}

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

		// Spawn particles for this tool
		spawnToolParticles(ch, ev, office)

	case "agentToolDone":
		ch.ActiveToolCount--
		if ch.ActiveToolCount < 0 {
			ch.ActiveToolCount = 0
		}
		UpdateToolHistoryStatus(ch, ev.ToolName, "done")
		if ch.ActiveToolCount == 0 {
			ch.CurrentTool = ""
		}

		// Remove beam and emit completion burst
		if ParticlesEnabled {
			office.Particles.RemoveBeamsForTool(ch.ID, ev.ToolID)
			office.Particles.EmitBurst(ch.X, ch.Y-8, ToolParticleColor(ev.ToolName), 8)
		}

	case "agentWaiting":
		ch.IsActive = false
		ch.ActiveToolCount = 0
		ch.BubbleType = "waiting"
		ch.BubbleTimer = WaitingBubbleDurationSec

		// Clean up all beams for this agent
		if ParticlesEnabled {
			office.Particles.RemoveBeamsForAgent(ch.ID)
		}
		// Don't immediately walk to break room — let updateTyping's delay
		// handle the transition. This prevents back-and-forth between turns
		// when the next turn starts within seconds.

	case "agentActive":
		ch.IsActive = true
		ch.IdleTimer = 0
		// Clear any bubble — permission or waiting — agent is working again
		ch.BubbleType = ""
		ch.BubbleTimer = 0

		// Respawn if the agent had left the office
		if ch.State == CharGone {
			respawnAtDoor(ch, office)
		}

	case "agentToolPermission":
		if ch.BubbleType != "permission" {
			RingBell()
		}
		ch.BubbleType = "permission"
		ch.BubbleTimer = 0
		UpdateToolHistoryStatus(ch, ch.CurrentTool, "permission")

	case "agentToolPermissionClear":
		if ch.BubbleType == "permission" {
			ch.BubbleType = ""
			ch.BubbleTimer = 0
		}

	case "agentToolsClear":
		ch.ActiveToolCount = 0
		ch.CurrentTool = ""
		ch.BubbleType = ""
		ch.BubbleTimer = 0
		if ParticlesEnabled {
			office.Particles.RemoveBeamsForAgent(ch.ID)
		}

	case "agentMessage":
		// Show message bubble with just the recipient indicator
		ch.MessageBubble = "\u2192 " + ev.MessageTo // "→ {name}"
		ch.MessageTimer = 4.0

		// Find target character by name and create particle beam
		if ParticlesEnabled {
			for _, other := range office.Characters {
				if other.Name == ev.MessageTo && other.ID != ch.ID {
					ch.MessageTarget = other.ID
					office.Particles.AddBeam(
						ch.X, ch.Y-8,
						other.X, other.Y-8,
						ParticleColorAgent, ch.ID, ev.ToolID,
					)
					// Burst at both ends
					office.Particles.EmitBurst(ch.X, ch.Y-8, ParticleColorAgent, 6)
					office.Particles.EmitBurst(other.X, other.Y-8, ParticleColorAgent, 6)
					break
				}
			}
		}

	case "agentSpawned":
		// Visual burst when an agent spawns a sub-agent
		if ParticlesEnabled {
			office.Particles.EmitBurst(ch.X, ch.Y-8, ParticleColorAgent, 12)
		}
	}
}

// spawnToolParticles creates particle effects for a tool start event.
func spawnToolParticles(ch *Character, ev AgentEvent, office *Office) {
	if !ParticlesEnabled {
		return
	}

	color := ToolParticleColor(ev.ToolName)
	category := ToolCategory(ev.ToolName)

	// Character position (slightly above feet)
	agentX := ch.X
	agentY := ch.Y - 8

	switch category {
	case "file", "web", "bash":
		// Beam from data source to agent
		srcX, srcY := DataSourcePos(category, office)
		office.Particles.AddBeam(srcX, srcY, agentX, agentY, color, ch.ID, ev.ToolID)

	case "agent":
		// Beam between this agent and another active agent (if any)
		for _, other := range office.Characters {
			if other.ID != ch.ID && other.ActiveToolCount > 0 {
				office.Particles.AddBeam(other.X, other.Y-8, agentX, agentY, color, ch.ID, ev.ToolID)
				break
			}
		}
		// Always emit a small burst for Task tools
		office.Particles.EmitBurst(agentX, agentY, color, 6)

	case "write":
		// Directional burst from agent (writing outward)
		office.Particles.EmitDirectionalBurst(agentX, agentY, ch.Dir, color, 8)
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

// respawnAtDoor makes a CharGone character reappear at the office door.
// It reassigns a seat (if available) and places the character at the door tile,
// ready to walk to their desk.
func respawnAtDoor(ch *Character, office *Office) {
	// Reassign a seat if the old one was released
	if ch.SeatID != "" {
		if seat, ok := office.Seats[ch.SeatID]; ok && !seat.Assigned {
			seat.Assigned = true
		}
	} else {
		// Try to get a new seat
		seat := office.AssignSeat(ch.ID)
		if seat != nil {
			ch.SeatID = seat.UID
		}
	}

	// Place at door position
	door := office.DoorPos
	ch.TileCol = door.Col
	ch.TileRow = door.Row
	ch.X, ch.Y = tileCenter(door.Col, door.Row)
	ch.Dir = DirUp
	ch.IdleTimer = 0
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
