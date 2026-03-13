package main

// IsWalkable returns true if the given tile is a floor type, chair, or rug.
// Furniture tiles like desks, bookshelves, computers, counters, and appliances are NOT walkable.
func IsWalkable(t TileType) bool {
	if t >= TileFloor1 && t <= TileFloor7 {
		return true
	}
	// Chairs and rugs are walkable furniture
	return t == TileChair || t == TileRug
}

// isWalkableAt checks if a specific tile position is walkable on the map.
func isWalkableAt(col, row int, tileMap [][]TileType, blocked map[TilePos]bool) bool {
	rows := len(tileMap)
	if rows == 0 {
		return false
	}
	cols := len(tileMap[0])
	if row < 0 || row >= rows || col < 0 || col >= cols {
		return false
	}
	t := tileMap[row][col]
	if !IsWalkable(t) {
		return false
	}
	if blocked[TilePos{Col: col, Row: row}] {
		return false
	}
	return true
}

// FindPath performs BFS on a 4-connected grid (no diagonals) to find a path
// from (startCol, startRow) to (endCol, endRow). Returns the path excluding
// the start position but including the end position. Returns nil if no path
// exists or if start == end.
func FindPath(from, to TilePos, tileMap [][]TileType, blocked map[TilePos]bool) []TilePos {
	if from.Col == to.Col && from.Row == to.Row {
		return nil
	}

	// End must be walkable
	if !isWalkableAt(to.Col, to.Row, tileMap, blocked) {
		return nil
	}

	type pos struct {
		Col, Row int
	}

	start := pos{from.Col, from.Row}
	end := pos{to.Col, to.Row}

	visited := make(map[pos]bool)
	visited[start] = true

	parent := make(map[pos]pos)
	queue := []pos{start}

	dirs := [4]pos{
		{0, -1}, // up
		{0, 1},  // down
		{-1, 0}, // left
		{1, 0},  // right
	}

	for len(queue) > 0 {
		curr := queue[0]
		queue = queue[1:]

		if curr == end {
			// Reconstruct path
			var path []TilePos
			k := end
			for k != start {
				path = append([]TilePos{{Col: k.Col, Row: k.Row}}, path...)
				k = parent[k]
			}
			return path
		}

		for _, d := range dirs {
			nc := curr.Col + d.Col
			nr := curr.Row + d.Row
			next := pos{nc, nr}

			if visited[next] {
				continue
			}
			if !isWalkableAt(nc, nr, tileMap, blocked) {
				continue
			}

			visited[next] = true
			parent[next] = curr
			queue = append(queue, next)
		}
	}

	// No path found
	return nil
}

// GetWalkableTiles returns all walkable tile positions in the map.
func GetWalkableTiles(tileMap [][]TileType, blocked map[TilePos]bool) []TilePos {
	var tiles []TilePos
	for r := 0; r < len(tileMap); r++ {
		for c := 0; c < len(tileMap[r]); c++ {
			if isWalkableAt(c, r, tileMap, blocked) {
				tiles = append(tiles, TilePos{Col: c, Row: r})
			}
		}
	}
	return tiles
}
