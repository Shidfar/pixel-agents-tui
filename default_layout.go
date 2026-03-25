package main

// DefaultLayout returns a large 22x13 multi-room office with:
//   - Work area (left, cols 1-11): warm wood floors, 9 desks with computers, bookshelves, plants
//   - Kitchen/break room (top-right, cols 13-20): lighter tile floor, counters, appliances
//   - Playroom (bottom-right, cols 13-20): blue carpet/rug, couches, TV, game console
//   - Interior walls with doorway gaps connecting the rooms
func DefaultLayout() OfficeLayout {
	// Aliases for readability
	const (
		W  = TileWall        // 0
		a  = TileFloor1      // 1 - warm brown (work area light)
		b  = TileFloor2      // 2 - medium brown (work area dark)
		c  = TileFloor3      // 3 - kitchen light
		d  = TileFloor4      // 4 - kitchen dark
		D  = TileDesk        // 9
		C  = TileComputer    // 10
		B  = TileBookshelf   // 11
		P  = TilePlant       // 12
		H  = TileChair       // 13
		R  = TileRug         // 14
		K  = TileCounter     // 15
		A  = TileAppliance   // 16
		V  = TileVoid        // 8
		G  = TileDoor        // 17 - entrance/exit door
		SC = TileCouch       // 18
		TV = TileTV          // 19
		CT = TileCoffeeTable // 20
		GC = TileGameConsole // 21
	)

	return OfficeLayout{
		Cols: 22,
		Rows: 13,
		Tiles: [][]TileType{
			//   0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16 17 18 19 20 21
			{W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W},     // Row 0:  outer wall top
			{W, B, B, a, b, a, b, a, B, B, a, b, W, K, K, A, c, d, c, A, K, W},     // Row 1:  bookshelves + kitchen counter
			{W, P, a, D, C, b, D, C, a, D, C, b, W, c, d, c, d, c, d, c, d, W},     // Row 2:  desk row 1 + 3rd desk at cols 9-10
			{W, a, b, H, a, b, H, a, b, H, b, a, W, c, d, c, d, c, d, c, d, W},     // Row 3:  chair row 1 + 3rd chair at col 9
			{W, b, a, b, a, b, a, b, a, b, a, b, a, c, d, c, d, c, d, c, d, W},     // Row 4:  open space + doorway col 12
			{W, a, b, D, C, a, D, C, b, D, C, a, W, W, W, W, W, W, a, W, W, W},     // Row 5:  desk row 2 + 3rd desk at cols 9-10
			{W, P, a, H, b, a, H, b, a, H, a, P, W, R, R, R, TV, GC, R, R, P, W},   // Row 6:  chairs row 2 + TV + game console
			{W, a, b, a, b, a, a, b, a, b, a, b, a, R, R, R, R, R, R, R, R, W},     // Row 7:  open space + doorway col 12
			{W, b, a, D, C, b, D, C, a, D, C, b, W, R, R, CT, R, R, CT, R, R, W},   // Row 8:  desk row 3 + coffee tables
			{W, a, b, H, a, b, H, a, b, H, b, a, W, R, SC, SC, R, R, SC, SC, R, W}, // Row 9:  chairs row 3 + couches
			{W, P, a, b, a, b, a, b, a, b, a, P, W, R, R, R, R, R, R, R, P, W},     // Row 10: plants + playroom open
			{W, B, B, a, b, a, b, a, B, B, a, b, W, B, B, R, R, R, R, B, B, W},     // Row 11: bookshelves bottom + playroom bookshelves
			{W, W, W, W, W, G, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W},     // Row 12: outer wall bottom
		},
		Seats: []Seat{
			// ── Work area: desk row 1 (chairs at row 3, desks at row 2) ──
			{UID: "seat-1", Col: 3, Row: 3, FacingDir: DirUp, Zone: "work"}, // faces desk at (3,2)
			{UID: "seat-2", Col: 6, Row: 3, FacingDir: DirUp, Zone: "work"}, // faces desk at (6,2)

			// ── Work area: desk row 2 (chairs at row 6, desks at row 5) ──
			{UID: "seat-3", Col: 3, Row: 6, FacingDir: DirUp, Zone: "work"}, // faces desk at (3,5)
			{UID: "seat-4", Col: 6, Row: 6, FacingDir: DirUp, Zone: "work"}, // faces desk at (6,5)

			// ── Work area: desk row 3 (chairs at row 9, desks at row 8) ──
			{UID: "seat-5", Col: 3, Row: 9, FacingDir: DirUp, Zone: "work"}, // faces desk at (3,8)
			{UID: "seat-6", Col: 6, Row: 9, FacingDir: DirUp, Zone: "work"}, // faces desk at (6,8)

			// ── Work area: desk column 3 (chairs at rows 3/6/9, desks at rows 2/5/8) ──
			{UID: "seat-7", Col: 9, Row: 3, FacingDir: DirUp, Zone: "work"}, // faces desk at (9,2)
			{UID: "seat-8", Col: 9, Row: 6, FacingDir: DirUp, Zone: "work"}, // faces desk at (9,5)
			{UID: "seat-9", Col: 9, Row: 9, FacingDir: DirUp, Zone: "work"}, // faces desk at (9,8)

			// ── Kitchen seats ──
			{UID: "seat-11", Col: 16, Row: 3, FacingDir: DirUp, Zone: "kitchen"}, // kitchen standing area
			{UID: "seat-12", Col: 18, Row: 3, FacingDir: DirUp, Zone: "kitchen"}, // kitchen standing area

			// ── Playroom: couch seats (facing TV) ──
			{UID: "seat-13", Col: 14, Row: 9, FacingDir: DirUp, Zone: "playroom"},
			{UID: "seat-14", Col: 15, Row: 9, FacingDir: DirUp, Zone: "playroom"},
			{UID: "seat-15", Col: 18, Row: 9, FacingDir: DirUp, Zone: "playroom"},
			{UID: "seat-16", Col: 19, Row: 9, FacingDir: DirUp, Zone: "playroom"},
		},
	}
}
