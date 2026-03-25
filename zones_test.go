package main

import (
	"fmt"
	"testing"
)

func TestZoneComputation(t *testing.T) {
	office := NewOffice(DefaultLayout())

	t.Logf("BookshelfSpots (%d): %v", len(office.BookshelfSpots), office.BookshelfSpots)
	t.Logf("KitchenSpots (%d): %v", len(office.KitchenSpots), office.KitchenSpots)
	t.Logf("LoungeSpots (%d): %v", len(office.LoungeSpots), office.LoungeSpots)

	if len(office.BookshelfSpots) == 0 {
		t.Error("expected BookshelfSpots to be non-empty")
	}
	if len(office.KitchenSpots) == 0 {
		t.Error("expected KitchenSpots to be non-empty")
	}
	if len(office.LoungeSpots) == 0 {
		t.Error("expected LoungeSpots to be non-empty")
	}

	// Verify bookshelf spots are adjacent to actual bookshelf tiles
	for _, spot := range office.BookshelfSpots {
		if !IsWalkable(office.TileMap[spot.Row][spot.Col]) {
			t.Errorf("BookshelfSpot (%d,%d) is not walkable", spot.Col, spot.Row)
		}
		hasAdjacentBookshelf := false
		for _, d := range [][2]int{{0, -1}, {0, 1}, {-1, 0}, {1, 0}} {
			nc, nr := spot.Col+d[0], spot.Row+d[1]
			if nr >= 0 && nr < office.Rows && nc >= 0 && nc < office.Cols {
				if office.TileMap[nr][nc] == TileBookshelf {
					hasAdjacentBookshelf = true
					break
				}
			}
		}
		if !hasAdjacentBookshelf {
			t.Errorf("BookshelfSpot (%d,%d) has no adjacent bookshelf tile", spot.Col, spot.Row)
		}
	}

	// Verify kitchen spots are Floor3 or Floor4
	for _, spot := range office.KitchenSpots {
		tile := office.TileMap[spot.Row][spot.Col]
		if tile != TileFloor3 && tile != TileFloor4 {
			t.Errorf("KitchenSpot (%d,%d) is tile type %d, expected Floor3 or Floor4", spot.Col, spot.Row, tile)
		}
	}

	// Verify lounge spots are Rug tiles
	for _, spot := range office.LoungeSpots {
		if office.TileMap[spot.Row][spot.Col] != TileRug {
			t.Errorf("LoungeSpot (%d,%d) is not a Rug tile", spot.Col, spot.Row)
		}
	}
}

func TestActivityZoneNavigation(t *testing.T) {
	office := NewOffice(DefaultLayout())

	// Create a character at seat-1
	seat := office.Seats["seat-1"]
	ch := NewCharacter(1, "seat-1", seat)
	office.Characters[1] = ch

	// Verify initial position
	if ch.TileCol != seat.Col || ch.TileRow != seat.Row {
		t.Fatalf("character not at seat: (%d,%d) vs expected (%d,%d)", ch.TileCol, ch.TileRow, seat.Col, seat.Row)
	}

	// Test 1: Reading tool → should go to seat (all tools go to desk now)
	HandleAgentEvent(ch, AgentEvent{
		Type:     "agentToolStart",
		AgentID:  1,
		ToolName: "Read",
		ToolID:   "tool-1",
	}, office)

	if ch.DestType != DestSeat {
		t.Errorf("expected DestSeat after Read tool, got %d", ch.DestType)
	}
	if ch.State != CharRead {
		t.Errorf("expected CharRead after Read tool (at seat), got %d", ch.State)
	}

	// Test 2: Another typing tool → should go to seat
	ch2 := NewCharacter(2, "seat-2", office.Seats["seat-2"])
	office.Characters[2] = ch2

	HandleAgentEvent(ch2, AgentEvent{
		Type:     "agentToolStart",
		AgentID:  2,
		ToolName: "Edit",
		ToolID:   "tool-2",
	}, office)

	if ch2.DestType != DestSeat {
		t.Errorf("expected DestSeat after Edit tool, got %d", ch2.DestType)
	}
	if ch2.State != CharType {
		t.Errorf("expected CharType after Edit tool (at seat), got %d", ch2.State)
	}
	t.Logf("Edit tool: character at seat, state=CharType, dir=%d", ch2.Dir)

	// Test 3: agentWaiting → character stays at desk initially, then after
	// the seat timer (~5s) transitions to break room
	ch3 := NewCharacter(3, "seat-3", office.Seats["seat-3"])
	office.Characters[3] = ch3
	ch3.IsActive = true
	ch3.State = CharType

	HandleAgentEvent(ch3, AgentEvent{
		Type:    "agentWaiting",
		AgentID: 3,
		Status:  "waiting",
	}, office)

	// Should still be at desk immediately after agentWaiting (delayed transition)
	if ch3.State != CharType {
		t.Errorf("expected CharType immediately after agentWaiting, got %d", ch3.State)
	}

	// Simulate 6 seconds to trigger the delayed leave-desk transition
	for i := 0; i < 60; i++ {
		UpdateCharacter(ch3, 0.1, office)
	}

	if ch3.DestType != DestBreakRoom {
		t.Errorf("expected DestBreakRoom after seat timer, got %d", ch3.DestType)
	}
}

func TestIdleGoesToBreakRoomAndStays(t *testing.T) {
	office := NewOffice(DefaultLayout())

	seat := office.Seats["seat-5"]
	ch := NewCharacter(1, "seat-5", seat)
	office.Characters[1] = ch

	// Make character idle and heading to break room
	ch.IsActive = false
	ch.State = CharIdle
	ch.DestType = DestBreakRoom
	ch.WanderTimer = 0 // trigger immediate pathfinding

	// Simulate until arrival at break room
	maxSteps := 500
	arrivedAtBreak := false
	for i := 0; i < maxSteps; i++ {
		UpdateCharacter(ch, 0.1, office)
		if ch.State == CharIdle && ch.DestType == DestBreakRoom && ch.Path == nil {
			t.Logf("Arrived at break room after %d steps at (%d,%d)", i, ch.TileCol, ch.TileRow)
			arrivedAtBreak = true
			break
		}
	}
	if !arrivedAtBreak {
		t.Fatalf("character did not arrive at break room within %d steps, state=%d, pos=(%d,%d)", maxSteps, ch.State, ch.TileCol, ch.TileRow)
	}

	// Now verify it STAYS there — run 100 more ticks, should remain idle
	pos := TilePos{Col: ch.TileCol, Row: ch.TileRow}
	for i := 0; i < 100; i++ {
		UpdateCharacter(ch, 0.1, office)
	}
	if ch.State != CharIdle {
		t.Errorf("character left break room: state=%d, pos=(%d,%d)", ch.State, ch.TileCol, ch.TileRow)
	}
	if ch.TileCol != pos.Col || ch.TileRow != pos.Row {
		t.Errorf("character moved from break room: was (%d,%d), now (%d,%d)", pos.Col, pos.Row, ch.TileCol, ch.TileRow)
	}
}

func TestWalkToBreakRoomAndArrive(t *testing.T) {
	office := NewOffice(DefaultLayout())

	seat := office.Seats["seat-1"]
	ch := NewCharacter(1, "seat-1", seat)
	office.Characters[1] = ch

	// Character must be active+typing first so agentWaiting triggers delayed transition
	ch.IsActive = true
	ch.State = CharType

	// Send agentWaiting
	HandleAgentEvent(ch, AgentEvent{
		Type:    "agentWaiting",
		AgentID: 1,
		Status:  "waiting",
	}, office)

	// Simulate 6 seconds to trigger the delayed leave-desk transition
	for i := 0; i < 60; i++ {
		UpdateCharacter(ch, 0.1, office)
	}

	if ch.DestType != DestBreakRoom {
		t.Fatalf("expected DestBreakRoom after seat timer, got %d", ch.DestType)
	}

	// Simulate walking until arrival at break room (idle with no path)
	maxSteps := 500
	for i := 0; i < maxSteps; i++ {
		UpdateCharacter(ch, 0.1, office)
		if ch.State == CharIdle && ch.DestType == DestBreakRoom && ch.Path == nil {
			t.Logf("Arrived at break room after %d steps at (%d,%d)", i, ch.TileCol, ch.TileRow)
			return
		}
	}
	t.Errorf("character did not arrive at break room within %d steps, state=%d, pos=(%d,%d)", maxSteps, ch.State, ch.TileCol, ch.TileRow)
}

func TestIdleAlwaysGoesToBreakRoom(t *testing.T) {
	office := NewOffice(DefaultLayout())

	// All idle characters should head to break room
	trials := 50
	breakRoomCount := 0

	for i := 0; i < trials; i++ {
		ch := NewCharacter(i+100, "", nil)
		ch.TileCol = 5
		ch.TileRow = 4
		ch.X, ch.Y = tileCenter(5, 4)
		ch.DestType = DestWander // not yet at break room
		ch.WanderTimer = 0       // trigger immediate pathfinding

		UpdateCharacter(ch, 0.01, office)

		if ch.State == CharWalk && (ch.DestType == DestBreakRoom || ch.DestType == DestPlayroom) {
			breakRoomCount++
		}
	}

	t.Logf("Idle destination: %d/%d went to break/playroom", breakRoomCount, trials)
	if breakRoomCount < trials {
		t.Errorf("expected all idle characters to head to break room or playroom, got %d/%d", breakRoomCount, trials)
	}
}

func TestRepathToSeatWhenActivated(t *testing.T) {
	office := NewOffice(DefaultLayout())

	seat := office.Seats["seat-1"]
	ch := NewCharacter(1, "seat-1", seat)
	office.Characters[1] = ch

	// Character must be active+typing first so agentWaiting triggers delayed transition
	ch.IsActive = true
	ch.State = CharType

	// Send to break room first
	HandleAgentEvent(ch, AgentEvent{
		Type:    "agentWaiting",
		AgentID: 1,
		Status:  "waiting",
	}, office)

	// Simulate 6 seconds to trigger the delayed leave-desk transition
	for i := 0; i < 60; i++ {
		UpdateCharacter(ch, 0.1, office)
	}

	if ch.DestType != DestBreakRoom {
		t.Fatalf("expected DestBreakRoom after seat timer, got %d", ch.DestType)
	}

	// Walk a few steps toward break room
	for i := 0; i < 5; i++ {
		UpdateCharacter(ch, 0.1, office)
	}

	// Now activate with a tool running — should repath to seat
	ch.IsActive = true
	ch.ActiveToolCount = 1
	UpdateCharacter(ch, 0.1, office)

	if ch.DestType != DestSeat {
		t.Errorf("expected repath to DestSeat after activation, got %d", ch.DestType)
	}
}

func TestPrintZoneMap(t *testing.T) {
	office := NewOffice(DefaultLayout())

	// Print a visual map showing zones
	zoneMap := make([][]rune, office.Rows)
	for r := 0; r < office.Rows; r++ {
		zoneMap[r] = make([]rune, office.Cols)
		for c := 0; c < office.Cols; c++ {
			switch office.TileMap[r][c] {
			case TileWall:
				zoneMap[r][c] = '#'
			case TileBookshelf:
				zoneMap[r][c] = 'B'
			case TileDesk:
				zoneMap[r][c] = 'D'
			case TileComputer:
				zoneMap[r][c] = 'M'
			case TileChair:
				zoneMap[r][c] = 'H'
			case TileCounter:
				zoneMap[r][c] = 'K'
			case TileAppliance:
				zoneMap[r][c] = 'A'
			case TilePlant:
				zoneMap[r][c] = 'P'
			case TileRug:
				zoneMap[r][c] = 'r'
			case TileFloor3, TileFloor4:
				zoneMap[r][c] = 'k' // kitchen floor
			default:
				if IsWalkable(office.TileMap[r][c]) {
					zoneMap[r][c] = '.'
				} else {
					zoneMap[r][c] = '?'
				}
			}
		}
	}

	// Overlay zone spots
	for _, s := range office.BookshelfSpots {
		if zoneMap[s.Row][s.Col] == '.' || zoneMap[s.Row][s.Col] == 'H' {
			zoneMap[s.Row][s.Col] = 'b' // bookshelf-adjacent walkable
		}
	}

	// Print seats
	for _, seat := range office.Seats {
		dirChar := map[Direction]rune{DirUp: '^', DirDown: 'v', DirLeft: '<', DirRight: '>'}
		zoneMap[seat.Row][seat.Col] = dirChar[seat.FacingDir]
	}

	t.Log("\nZone map (B=bookshelf, b=bookshelf-spot, k=kitchen, r=rug/lounge, ^v<>=seats, H=chair):")
	for r := 0; r < office.Rows; r++ {
		t.Log(string(zoneMap[r]))
	}
	t.Logf("\nZone counts: bookshelf=%d, kitchen=%d, lounge=%d",
		len(office.BookshelfSpots), len(office.KitchenSpots), len(office.LoungeSpots))
}

func TestGlobToolIsReading(t *testing.T) {
	if !ReadingTools["Glob"] {
		t.Error("Glob should be classified as a reading tool")
	}
	if !ReadingTools["Read"] {
		t.Error("Read should be classified as a reading tool")
	}
	if !ReadingTools["Grep"] {
		t.Error("Grep should be classified as a reading tool")
	}
	if ReadingTools["Edit"] {
		t.Error("Edit should NOT be classified as a reading tool")
	}
	if ReadingTools["Bash"] {
		t.Error("Bash should NOT be classified as a reading tool")
	}
}

func TestFacingBookshelf(t *testing.T) {
	office := NewOffice(DefaultLayout())

	// Place character at a bookshelf-adjacent spot and check facing
	for _, spot := range office.BookshelfSpots {
		ch := &Character{TileCol: spot.Col, TileRow: spot.Row}
		dir := facingBookshelf(ch, office)
		// Verify the direction actually points to a bookshelf
		dc, dr := 0, 0
		switch dir {
		case DirUp:
			dr = -1
		case DirDown:
			dr = 1
		case DirLeft:
			dc = -1
		case DirRight:
			dc = 1
		}
		nc, nr := spot.Col+dc, spot.Row+dr
		if nr >= 0 && nr < office.Rows && nc >= 0 && nc < office.Cols {
			if office.TileMap[nr][nc] != TileBookshelf {
				t.Errorf("facingBookshelf at (%d,%d) returned dir=%d but tile at (%d,%d) is %d, not bookshelf",
					spot.Col, spot.Row, dir, nc, nr, office.TileMap[nr][nc])
			}
		}
	}
	fmt.Printf("All %d bookshelf spots face correctly\n", len(office.BookshelfSpots))
}
