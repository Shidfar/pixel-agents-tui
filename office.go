package main

import (
	"math/rand"
	"sort"
)

// Office holds the full state of the pixel-agents scene: the tile map, seats,
// and characters (one per agent). Agent backend state (tool tracking, file
// offsets) is managed separately by the session watcher.
type Office struct {
	Characters  map[int]*Character
	Seats       map[string]*Seat
	TileMap     [][]TileType
	Cols        int
	Rows        int
	NextSeatIdx int

	BookshelfSpots []TilePos // walkable tiles adjacent to bookshelves
	KitchenSpots   []TilePos // walkable kitchen floor tiles (TileFloor3/TileFloor4)
	LoungeSpots    []TilePos // walkable rug tiles (TileRug)
}

// NewOffice creates a new Office from the given layout.
func NewOffice(layout OfficeLayout) *Office {
	seats := make(map[string]*Seat)
	for i := range layout.Seats {
		s := layout.Seats[i]
		seats[s.UID] = &s
	}

	o := &Office{
		Characters:  make(map[int]*Character),
		Seats:       seats,
		TileMap:     layout.Tiles,
		Cols:        layout.Cols,
		Rows:        layout.Rows,
		NextSeatIdx: 0,
	}
	o.computeZones()
	return o
}

// computeZones scans the tile map to populate BookshelfSpots, KitchenSpots, and LoungeSpots.
func (o *Office) computeZones() {
	bookshelfSet := make(map[TilePos]bool)

	for row := 0; row < o.Rows; row++ {
		for col := 0; col < o.Cols; col++ {
			t := o.TileMap[row][col]

			// KitchenSpots: walkable TileFloor3 or TileFloor4
			if t == TileFloor3 || t == TileFloor4 {
				o.KitchenSpots = append(o.KitchenSpots, TilePos{Col: col, Row: row})
			}

			// LoungeSpots: TileRug tiles
			if t == TileRug {
				o.LoungeSpots = append(o.LoungeSpots, TilePos{Col: col, Row: row})
			}

			// BookshelfSpots: walkable tiles adjacent to a bookshelf
			if t == TileBookshelf {
				// Check 4 neighbors
				for _, d := range [][2]int{{0, -1}, {0, 1}, {-1, 0}, {1, 0}} {
					nc, nr := col+d[0], row+d[1]
					if nr < 0 || nr >= o.Rows || nc < 0 || nc >= o.Cols {
						continue
					}
					neighbor := o.TileMap[nr][nc]
					if IsWalkable(neighbor) {
						pos := TilePos{Col: nc, Row: nr}
						if !bookshelfSet[pos] {
							bookshelfSet[pos] = true
							o.BookshelfSpots = append(o.BookshelfSpots, pos)
						}
					}
				}
			}
		}
	}
}

// HandleEvent processes an AgentEvent: creates characters for new agents,
// and delegates to HandleAgentEvent for state transitions.
func (o *Office) HandleEvent(ev AgentEvent) {
	// Ensure character exists for this agent
	ch, exists := o.Characters[ev.AgentID]
	if !exists {
		// Create a new character for this agent
		seat := o.AssignSeat(ev.AgentID)
		if seat == nil {
			// No seat available — silently drop this agent to avoid pile-ups
			return
		}
		ch = NewCharacter(ev.AgentID, seat.UID, seat)
		o.Characters[ev.AgentID] = ch
	}

	HandleAgentEvent(ch, ev, o)
}

// Update advances all characters by dt seconds.
func (o *Office) Update(dt float64) {
	for _, ch := range o.Characters {
		UpdateCharacter(ch, dt, o)
	}
}

// HandleInput is a placeholder for future keyboard/mouse input handling.
func (o *Office) HandleInput(key KeyEvent) {
	// Placeholder — will be implemented by TUI renderer
}

// AssignSeat assigns the next available seat to an agent using round-robin.
// Returns the assigned seat, or nil if no seats are available.
func (o *Office) AssignSeat(agentID int) *Seat {
	if len(o.Seats) == 0 {
		return nil
	}

	// Collect seat UIDs in a stable sorted order
	uids := make([]string, 0, len(o.Seats))
	for uid := range o.Seats {
		uids = append(uids, uid)
	}
	sort.Strings(uids)

	// Try from NextSeatIdx onwards (round-robin)
	for i := 0; i < len(uids); i++ {
		idx := (o.NextSeatIdx + i) % len(uids)
		seat := o.Seats[uids[idx]]
		if !seat.Assigned {
			seat.Assigned = true
			o.NextSeatIdx = (idx + 1) % len(uids)
			return seat
		}
	}

	return nil // all seats occupied
}

// GetBlockedTiles returns a set of tile positions currently occupied by characters
// that are sitting at their seats. This prevents other characters from pathfinding
// through occupied seats.
func (o *Office) GetBlockedTiles() map[TilePos]bool {
	blocked := make(map[TilePos]bool)
	for _, ch := range o.Characters {
		if ch.SeatID != "" && (ch.State == CharType || ch.State == CharRead) {
			blocked[TilePos{Col: ch.TileCol, Row: ch.TileRow}] = true
		}
	}
	return blocked
}

// RandomBookshelfSpot returns a random bookshelf-adjacent spot, excluding tiles
// in the given set. Falls back to the character's seat position if none available.
func (o *Office) RandomBookshelfSpot(exclude map[TilePos]bool) TilePos {
	if spot, ok := randomFromSlice(o.BookshelfSpots, exclude); ok {
		return spot
	}
	return o.randomWalkableTile(exclude)
}

// RandomBreakSpot returns a random kitchen or lounge spot, excluding tiles in
// the given set. Falls back to a random walkable tile if none available.
func (o *Office) RandomBreakSpot(exclude map[TilePos]bool) TilePos {
	// Combine kitchen + lounge spots
	combined := make([]TilePos, 0, len(o.KitchenSpots)+len(o.LoungeSpots))
	combined = append(combined, o.KitchenSpots...)
	combined = append(combined, o.LoungeSpots...)
	if spot, ok := randomFromSlice(combined, exclude); ok {
		return spot
	}
	return o.randomWalkableTile(exclude)
}

// randomFromSlice picks a random TilePos from the slice, skipping excluded positions.
// Returns the chosen position and true, or zero value and false if none available.
func randomFromSlice(spots []TilePos, exclude map[TilePos]bool) (TilePos, bool) {
	available := make([]TilePos, 0, len(spots))
	for _, s := range spots {
		if !exclude[s] {
			available = append(available, s)
		}
	}
	if len(available) == 0 {
		return TilePos{}, false
	}
	return available[rand.Intn(len(available))], true
}

// randomWalkableTile returns a random walkable tile on the map, excluding the given set.
// Falls back to TilePos{0,0} if the map has no walkable tiles (should not happen).
func (o *Office) randomWalkableTile(exclude map[TilePos]bool) TilePos {
	var candidates []TilePos
	for row := 0; row < o.Rows; row++ {
		for col := 0; col < o.Cols; col++ {
			if IsWalkable(o.TileMap[row][col]) {
				pos := TilePos{Col: col, Row: row}
				if !exclude[pos] {
					candidates = append(candidates, pos)
				}
			}
		}
	}
	if len(candidates) == 0 {
		return TilePos{}
	}
	return candidates[rand.Intn(len(candidates))]
}
