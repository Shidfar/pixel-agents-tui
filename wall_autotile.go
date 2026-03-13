package main

// Wall auto-tiling: 16 pre-computed sprites indexed by 4-bit neighbor bitmask.
// Bitmask: N=1, E=2, S=4, W=8. Set bit = neighbor IS a wall.
// Exposed edges (no wall neighbor) get highlight/shadow for 3D depth.

// Wall palette
var (
	wcHL   = "#5A5A7E" // top-cap highlight (brightest, "top surface")
	wcCap  = "#4E4E70" // top-cap body
	wcFace = "#3A3A5C" // main wall face
	wcMort = "#444466" // mortar line (subtle)
	wcDark = "#2E2E48" // transition to base
	wcBase = "#252540" // base shadow
	wcDeep = "#1C1C34" // deepest shadow (corners, ground line)
	wcEdge = "#2A2A44" // side edge inset
)

// wallAutoSprites holds the 16 pre-computed wall variants.
var wallAutoSprites [16]Sprite

func init() {
	for m := 0; m < 16; m++ {
		wallAutoSprites[m] = buildAutoWall(m)
	}
}

func buildAutoWall(mask int) Sprite {
	hasN := mask&1 != 0
	hasE := mask&2 != 0
	hasS := mask&4 != 0
	hasW := mask&8 != 0

	s := make(Sprite, 16)
	for r := range s {
		s[r] = make([]string, 16)
		for c := range s[r] {
			// Brick texture: horizontal mortar + staggered vertical breaks
			switch {
			case r == 5 || r == 11:
				s[r][c] = wcMort // horizontal mortar
			case c == 7 && r > 0 && r < 5:
				s[r][c] = wcMort // vertical break, top bricks
			case c == 3 && r > 5 && r < 11:
				s[r][c] = wcMort // vertical break, mid bricks (staggered)
			case c == 11 && r > 11 && r < 15:
				s[r][c] = wcMort // vertical break, bottom bricks (staggered)
			default:
				s[r][c] = wcFace
			}
		}
	}

	// North exposed: top-cap (lighter "top surface" visible from above)
	if !hasN {
		for c := 0; c < 16; c++ {
			s[0][c] = wcHL
			s[1][c] = wcCap
			s[2][c] = wcCap
		}
	}

	// South exposed: base shadow (wall meets ground)
	if !hasS {
		for c := 0; c < 16; c++ {
			s[13][c] = wcDark
			s[14][c] = wcBase
			s[15][c] = wcDeep
		}
	}

	// West exposed: left edge inset
	if !hasW {
		for r := 0; r < 16; r++ {
			s[r][0] = wcEdge
		}
	}

	// East exposed: right edge inset
	if !hasE {
		for r := 0; r < 16; r++ {
			s[r][15] = wcEdge
		}
	}

	// Corner shadows where two exposed edges meet
	if !hasN && !hasW {
		s[0][0] = wcDeep
	}
	if !hasN && !hasE {
		s[0][15] = wcDeep
	}
	if !hasS && !hasW {
		s[15][0] = wcDeep
	}
	if !hasS && !hasE {
		s[15][15] = wcDeep
	}

	return s
}

// GetWallAutoSprite returns the auto-tiled wall sprite for the given position.
func GetWallAutoSprite(col, row int, tileMap [][]TileType) Sprite {
	tmRows := len(tileMap)
	if tmRows == 0 {
		return wallAutoSprites[0]
	}
	tmCols := len(tileMap[0])

	mask := 0
	if row > 0 && tileMap[row-1][col] == TileWall {
		mask |= 1 // N
	}
	if col < tmCols-1 && tileMap[row][col+1] == TileWall {
		mask |= 2 // E
	}
	if row < tmRows-1 && tileMap[row+1][col] == TileWall {
		mask |= 4 // S
	}
	if col > 0 && tileMap[row][col-1] == TileWall {
		mask |= 8 // W
	}

	return wallAutoSprites[mask]
}
