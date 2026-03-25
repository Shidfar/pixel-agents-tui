package main

// NewCharacter creates a new character at the given seat position.
// If seat is nil, the character spawns at a walkable fallback tile (5,4)
// near the center of the work area.
func NewCharacter(id int, seatID string, seat *Seat) *Character {
	col := 5
	row := 4
	dir := DirDown
	if seat != nil {
		col = seat.Col
		row = seat.Row
		dir = seat.FacingDir
	}
	cx, cy := tileCenter(col, row)
	return &Character{
		ID:           id,
		State:        CharIdle,
		Dir:          dir,
		X:            cx,
		Y:            cy,
		TileCol:      col,
		TileRow:      row,
		Path:         nil,
		MoveProgress: 0,
		CurrentTool:  "",
		IsActive:     false,
		SeatID:       seatID,
		BubbleType:   "",
		BubbleTimer:  0,
		Palette:      id % len(CharacterSprites),
		HueShift:     0,
		Frame:        0,
		FrameTimer:   0,
		WanderTimer:  0,
		WanderCount:  0,
		WanderLimit:  randomInt(WanderMovesBeforeRestMin, WanderMovesBeforeRestMax),
		SeatTimer:    0,
	}
}

// UpdateCharacter advances the character's state machine by dt seconds.
func UpdateCharacter(ch *Character, dt float64, office *Office) {
	ch.FrameTimer += dt

	// Tick bubble timer for waiting bubbles (counts down to 0, then auto-clears)
	if ch.BubbleType == "waiting" {
		ch.BubbleTimer -= dt
		if ch.BubbleTimer <= 0 {
			ch.BubbleType = ""
			ch.BubbleTimer = 0
		}
	}

	// Tick message bubble timer (counts down to 0, then auto-clears)
	if ch.MessageBubble != "" {
		ch.MessageTimer -= dt
		if ch.MessageTimer <= 0 {
			ch.MessageBubble = ""
			ch.MessageTimer = 0
			ch.MessageTarget = 0
			// Clean up message beam
			if ParticlesEnabled {
				office.Particles.RemoveBeamsForAgent(ch.ID)
			}
		}
	}

	// Track idle time for exit-after-timeout
	if !ch.IsActive && ch.State != CharGone && ch.State != CharWalk {
		ch.IdleTimer += dt
	} else if ch.IsActive {
		ch.IdleTimer = 0
	}

	switch ch.State {
	case CharType, CharRead:
		updateTyping(ch, dt, office)
	case CharIdle:
		updateIdle(ch, dt, office)
	case CharWalk:
		updateWalk(ch, dt, office)
	}
}

// updateTyping handles the TYPE and READ states.
func updateTyping(ch *Character, dt float64, office *Office) {
	frameDur := TypeFrameDurationSec
	if ch.State == CharRead {
		frameDur = ReadFrameDurationSec
	}

	if ch.FrameTimer >= frameDur {
		ch.FrameTimer -= frameDur
		ch.Frame = (ch.Frame + 1) % 2
	}

	// If no longer active, wait a few seconds before leaving desk.
	// This absorbs the gap between turns — if a new tool starts within
	// the window, ch.IsActive becomes true again and we never leave.
	if !ch.IsActive {
		ch.SeatTimer += dt
		if ch.SeatTimer >= 5.0 {
			ch.SeatTimer = 0
			ch.State = CharIdle
			ch.Frame = 0
			ch.FrameTimer = 0
			ch.DestType = DestBreakRoom
			ch.WanderTimer = randomRange(1.0, 3.0)
		}
	} else {
		ch.SeatTimer = 0
	}
}

// updateIdle handles the IDLE state — standing still, waiting to move.
func updateIdle(ch *Character, dt float64, office *Office) {
	ch.Frame = 0

	// If became active with tools running, pathfind to seat
	if ch.IsActive && ch.ActiveToolCount > 0 {
		ch.DestType = DestSeat
		if ch.SeatID == "" {
			ch.State = activeState(ch)
			ch.Frame = 0
			ch.FrameTimer = 0
			return
		}
		seat, ok := office.Seats[ch.SeatID]
		if !ok {
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
			// No path — teleport to seat so character is always at desk when working.
			teleportToSeat(ch, seat)
			ch.State = activeState(ch)
			ch.Frame = 0
			ch.FrameTimer = 0
		}
		return
	}

	// Already at break room or playroom — stay put
	if (ch.DestType == DestBreakRoom || ch.DestType == DestPlayroom) && ch.Path == nil {
		// Exit the office after being idle for too long
		if ch.IdleTimer >= ExitIdleTimeoutSec {
			startExitWalk(ch, office)
			return
		}
		return
	}

	// Countdown before heading to break room or playroom
	ch.WanderTimer -= dt
	if ch.WanderTimer <= 0 {
		blocked := office.GetBlockedTiles()
		// 40% chance to go to playroom instead of break room
		var spot TilePos
		if len(office.PlayroomSpots) > 0 && randomRange(0, 1) < 0.4 {
			spot = office.RandomPlayroomSpot(blocked)
			ch.DestType = DestPlayroom
		} else {
			spot = office.RandomBreakSpot(blocked)
			ch.DestType = DestBreakRoom
		}
		path := FindPath(
			TilePos{Col: ch.TileCol, Row: ch.TileRow},
			spot,
			office.TileMap, blocked,
		)
		if len(path) > 0 {
			ch.Path = path
			ch.MoveProgress = 0
			ch.State = CharWalk
			ch.Frame = 0
			ch.FrameTimer = 0
		} else {
			// Can't path — just stay here
			ch.DestType = DestBreakRoom
		}
	}
}

// updateWalk handles the WALK state — moving along a path tile by tile.
func updateWalk(ch *Character, dt float64, office *Office) {
	// Walk animation
	if ch.FrameTimer >= WalkFrameDurationSec {
		ch.FrameTimer -= WalkFrameDurationSec
		ch.Frame = (ch.Frame + 1) % 4
	}

	if len(ch.Path) == 0 {
		// Path complete — snap to tile center and transition
		cx, cy := tileCenter(ch.TileCol, ch.TileRow)
		ch.X = cx
		ch.Y = cy

		switch ch.DestType {
		case DestBookshelf:
			// Arrived at bookshelf — face toward nearest bookshelf tile and read
			ch.Dir = facingBookshelf(ch, office)
			ch.State = CharRead
			ch.Frame = 0
			ch.FrameTimer = 0
			return

		case DestDoor:
			// Arrived at the door — agent leaves the office
			ch.State = CharGone
			ch.Frame = 0
			ch.FrameTimer = 0
			ch.Path = nil
			office.ReleaseSeat(ch.SeatID)
			return

		case DestPlayroom:
			// Arrived at playroom — stay idle here facing TV
			ch.State = CharIdle
			ch.Dir = DirUp // face the TV (north wall)
			ch.Frame = 0
			ch.FrameTimer = 0
			ch.Path = nil
			return

		case DestBreakRoom:
			// Arrived at break room — stay idle here
			ch.State = CharIdle
			ch.Dir = DirDown
			ch.Frame = 0
			ch.FrameTimer = 0
			ch.Path = nil
			return

		case DestSeat:
			if ch.IsActive {
				if ch.SeatID == "" {
					ch.State = activeState(ch)
				} else if seat, ok := office.Seats[ch.SeatID]; ok &&
					ch.TileCol == seat.Col && ch.TileRow == seat.Row {
					ch.State = activeState(ch)
					ch.Dir = seat.FacingDir
				} else if seat, ok := office.Seats[ch.SeatID]; ok {
					// Walked toward seat but ended up elsewhere — teleport.
					teleportToSeat(ch, seat)
					ch.State = activeState(ch)
				} else {
					ch.State = CharIdle
				}
			} else {
				// Not active — head to break room
				ch.State = CharIdle
				ch.DestType = DestBreakRoom
				ch.WanderTimer = randomRange(1.0, 3.0)
			}

		default: // DestWander
			ch.State = CharIdle
			if !ch.IsActive {
				ch.DestType = DestBreakRoom
				ch.WanderTimer = randomRange(1.0, 3.0)
			}
		}
		ch.Frame = 0
		ch.FrameTimer = 0
		return
	}

	// Move toward next tile in path
	nextTile := ch.Path[0]
	ch.Dir = directionBetween(ch.TileCol, ch.TileRow, nextTile.Col, nextTile.Row)

	ch.MoveProgress += (WalkSpeedPxPerSec / TileSize) * dt

	fromX, fromY := tileCenter(ch.TileCol, ch.TileRow)
	toX, toY := tileCenter(nextTile.Col, nextTile.Row)

	t := ch.MoveProgress
	if t > 1 {
		t = 1
	}
	ch.X = fromX + (toX-fromX)*t
	ch.Y = fromY + (toY-fromY)*t

	if ch.MoveProgress >= 1 {
		// Arrived at next tile
		ch.TileCol = nextTile.Col
		ch.TileRow = nextTile.Row
		ch.X = toX
		ch.Y = toY
		ch.Path = ch.Path[1:]
		ch.MoveProgress = 0
	}

	// If became active while walking, repath to seat
	if ch.IsActive && ch.SeatID != "" && ch.DestType != DestSeat {
		if seat, ok := office.Seats[ch.SeatID]; ok {
			needRepath := true
			if len(ch.Path) > 0 {
				last := ch.Path[len(ch.Path)-1]
				if last.Col == seat.Col && last.Row == seat.Row {
					needRepath = false
				}
			}
			if needRepath {
				ch.DestType = DestSeat
				blocked := office.GetBlockedTiles()
				delete(blocked, TilePos{Col: seat.Col, Row: seat.Row})
				newPath := FindPath(
					TilePos{Col: ch.TileCol, Row: ch.TileRow},
					TilePos{Col: seat.Col, Row: seat.Row},
					office.TileMap, blocked,
				)
				if len(newPath) > 0 {
					ch.Path = newPath
					ch.MoveProgress = 0
				} else {
					// No path — teleport to seat.
					teleportToSeat(ch, seat)
					ch.State = activeState(ch)
					ch.Frame = 0
					ch.FrameTimer = 0
				}
			}
		}
	}
}

// startExitWalk sends the character walking toward the office door to leave.
func startExitWalk(ch *Character, office *Office) {
	door := office.DoorPos
	if door.Col == 0 && door.Row == 0 {
		// No door configured — just go gone immediately
		ch.State = CharGone
		office.ReleaseSeat(ch.SeatID)
		return
	}

	blocked := office.GetBlockedTiles()
	path := FindPath(
		TilePos{Col: ch.TileCol, Row: ch.TileRow},
		door,
		office.TileMap, blocked,
	)
	if len(path) > 0 {
		ch.Path = path
		ch.MoveProgress = 0
		ch.State = CharWalk
		ch.DestType = DestDoor
		ch.Frame = 0
		ch.FrameTimer = 0
	} else {
		// Can't path to door — go gone immediately
		ch.State = CharGone
		office.ReleaseSeat(ch.SeatID)
	}
}

// activeState returns CharRead if the current tool is a reading tool, CharType otherwise.
func activeState(ch *Character) CharState {
	if ReadingTools[ch.CurrentTool] {
		return CharRead
	}
	return CharType
}
