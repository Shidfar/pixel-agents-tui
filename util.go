package main

import (
	"math/rand"
)

// tileCenter returns the pixel center of a tile at (col, row).
func tileCenter(col, row int) (float64, float64) {
	x := float64(col)*TileSize + TileSize/2.0
	y := float64(row)*TileSize + TileSize/2.0
	return x, y
}

// directionBetween returns the direction from one tile to an adjacent tile.
func directionBetween(fromCol, fromRow, toCol, toRow int) Direction {
	dc := toCol - fromCol
	dr := toRow - fromRow
	if dc > 0 {
		return DirRight
	}
	if dc < 0 {
		return DirLeft
	}
	if dr > 0 {
		return DirDown
	}
	return DirUp
}

// randomRange returns a random float64 in [min, max).
func randomRange(min, max float64) float64 {
	return min + rand.Float64()*(max-min)
}

// randomInt returns a random int in [min, max] inclusive.
func randomInt(min, max int) int {
	if min >= max {
		return min
	}
	return min + rand.Intn(max-min+1)
}
