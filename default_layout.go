package main

// DefaultLayout returns a large 22x13 multi-room office with:
//   - Work area (left, cols 1-11): warm wood floors, 8 desks with computers, bookshelves, plants
//   - Kitchen/break room (top-right, cols 13-20): lighter tile floor, counters, appliances
//   - Meeting/lounge room (bottom-right, cols 13-20): blue carpet/rug, desks, bookshelves, plants
//   - Interior walls with doorway gaps connecting the rooms
func DefaultLayout() OfficeLayout {
	// Aliases for readability
	const (
		W = TileWall      // 0
		a = TileFloor1    // 1 - warm brown (work area light)
		b = TileFloor2    // 2 - medium brown (work area dark)
		c = TileFloor3    // 3 - kitchen light
		d = TileFloor4    // 4 - kitchen dark
		D = TileDesk      // 9
		C = TileComputer  // 10
		B = TileBookshelf // 11
		P = TilePlant     // 12
		H = TileChair     // 13
		R = TileRug       // 14
		K = TileCounter   // 15
		A = TileAppliance // 16
		V = TileVoid      // 8
	)

	return OfficeLayout{
		Cols: 22,
		Rows: 13,
		Tiles: [][]TileType{
			//   0  1  2  3  4  5  6  7  8  9 10 11 12 13 14 15 16 17 18 19 20 21
			{W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W},       // Row 0:  outer wall top
			{W, B, B, a, b, a, b, a, B, B, a, b, W, K, K, A, c, d, c, A, K, W},       // Row 1:  bookshelves + kitchen counter
			{W, P, a, D, C, b, D, C, a, b, a, b, W, c, d, c, d, c, d, c, d, W},       // Row 2:  desk row 1 (desks face down)
			{W, a, b, H, a, b, H, a, b, a, b, a, W, c, d, c, d, c, d, c, d, W},       // Row 3:  chair row 1 (facing up)
			{W, b, a, b, a, b, a, b, a, b, a, b, a, c, d, c, d, c, d, c, d, W},       // Row 4:  open space + doorway col 12
			{W, a, b, D, C, a, D, C, b, a, b, a, W, W, W, W, W, W, a, W, W, W},       // Row 5:  desk row 2 + wall separator (doorway col 18)
			{W, P, a, H, b, a, H, b, a, b, a, P, W, B, R, R, R, R, R, R, P, W},       // Row 6:  chairs row 2 + meeting room top
			{W, a, b, a, b, a, a, b, a, b, a, b, a, R, R, R, R, R, R, R, R, W},       // Row 7:  open space + doorway col 12
			{W, b, a, D, C, b, D, C, a, b, a, b, W, R, R, D, C, R, D, C, R, W},       // Row 8:  desk row 3 + meeting desks
			{W, a, b, H, a, b, H, a, b, a, b, a, W, R, R, H, R, R, H, R, R, W},       // Row 9:  chairs row 3 + meeting chairs
			{W, P, a, b, a, b, a, b, a, b, a, P, W, R, R, R, R, R, R, R, P, W},       // Row 10: plants + meeting open
			{W, B, B, a, b, a, b, a, B, B, a, b, W, B, B, R, R, R, R, B, B, W},       // Row 11: bookshelves bottom + meeting bookshelves
			{W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W, W},       // Row 12: outer wall bottom
		},
		Seats: []Seat{
			// ── Work area: desk row 1 (chairs at row 3, desks at row 2) ──
			{UID: "seat-1", Col: 3, Row: 3, FacingDir: DirUp},   // faces desk at (3,2)
			{UID: "seat-2", Col: 6, Row: 3, FacingDir: DirUp},   // faces desk at (6,2)

			// ── Work area: desk row 2 (chairs at row 6, desks at row 5) ──
			{UID: "seat-3", Col: 3, Row: 6, FacingDir: DirUp},   // faces desk at (3,5)
			{UID: "seat-4", Col: 6, Row: 6, FacingDir: DirUp},   // faces desk at (6,5)

			// ── Work area: desk row 3 (chairs at row 9, desks at row 8) ──
			{UID: "seat-5", Col: 3, Row: 9, FacingDir: DirUp},   // faces desk at (3,8)
			{UID: "seat-6", Col: 6, Row: 9, FacingDir: DirUp},   // faces desk at (6,8)

			// ── Work area: extra seats along right side of work area ──
			// Using floor tiles as flexible seating positions
			{UID: "seat-7", Col: 9, Row: 3, FacingDir: DirLeft},  // open area seat
			{UID: "seat-8", Col: 9, Row: 6, FacingDir: DirLeft},  // open area seat
			{UID: "seat-9", Col: 9, Row: 9, FacingDir: DirLeft},  // open area seat
			{UID: "seat-10", Col: 10, Row: 4, FacingDir: DirDown}, // open area seat

			// ── Kitchen seats ──
			{UID: "seat-11", Col: 16, Row: 3, FacingDir: DirUp},  // kitchen standing area
			{UID: "seat-12", Col: 18, Row: 3, FacingDir: DirUp},  // kitchen standing area

			// ── Meeting room: desk seats (chairs at row 9, desks at row 8) ──
			{UID: "seat-13", Col: 15, Row: 9, FacingDir: DirUp},  // faces meeting desk at (15,8)
			{UID: "seat-14", Col: 18, Row: 9, FacingDir: DirUp},  // faces meeting desk at (18,8)

			// ── Meeting room: open rug seats ──
			{UID: "seat-15", Col: 15, Row: 7, FacingDir: DirDown}, // rug area
			{UID: "seat-16", Col: 18, Row: 7, FacingDir: DirDown}, // rug area
		},
	}
}
