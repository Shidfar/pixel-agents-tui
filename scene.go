package main

// Scene rendering utilities.
// The main Render function lives in renderer.go.
// This file provides helper functions used by the renderer.

import "sort"

// sortableChar is used for depth-sorting characters before rendering.
type sortableChar struct {
	ch *Character
	zY float64
}

// SortCharactersByDepth returns characters sorted by their Y position
// for correct occlusion (furthest/lowest Y first).
func SortCharactersByDepth(characters map[int]*Character) []sortableChar {
	chars := make([]sortableChar, 0, len(characters))
	for _, ch := range characters {
		// Characters sort by the bottom of their sprite for correct occlusion.
		// Add a small offset so they render in front of same-row furniture.
		zY := ch.Y + float64(TileSize)/2 + 0.5
		chars = append(chars, sortableChar{ch: ch, zY: zY})
	}
	sort.Slice(chars, func(i, j int) bool {
		return chars[i].zY < chars[j].zY
	})
	return chars
}
