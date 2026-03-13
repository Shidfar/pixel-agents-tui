package main

import (
	"encoding/json"
	"fmt"
	"os"
	"strings"
)

type jsonLayout struct {
	Cols  int        `json:"cols"`
	Rows  int        `json:"rows"`
	Tiles [][]int    `json:"tiles"`
	Seats []jsonSeat `json:"seats"`
}

type jsonSeat struct {
	UID    string `json:"uid"`
	Col    int    `json:"col"`
	Row    int    `json:"row"`
	Facing string `json:"facing"`
	Zone   string `json:"zone"`
}

func parseFacing(s string) (Direction, error) {
	switch strings.ToLower(s) {
	case "up":
		return DirUp, nil
	case "down":
		return DirDown, nil
	case "left":
		return DirLeft, nil
	case "right":
		return DirRight, nil
	default:
		return DirDown, fmt.Errorf("unknown direction %q (use up/down/left/right)", s)
	}
}

// LoadLayout reads and validates a JSON layout file.
func LoadLayout(path string) (OfficeLayout, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return OfficeLayout{}, fmt.Errorf("reading layout file: %w", err)
	}

	var jl jsonLayout
	if err := json.Unmarshal(data, &jl); err != nil {
		return OfficeLayout{}, fmt.Errorf("parsing layout JSON: %w", err)
	}

	if jl.Rows <= 0 || jl.Cols <= 0 {
		return OfficeLayout{}, fmt.Errorf("layout must have positive rows (%d) and cols (%d)", jl.Rows, jl.Cols)
	}
	if len(jl.Tiles) != jl.Rows {
		return OfficeLayout{}, fmt.Errorf("rows=%d but got %d tile rows", jl.Rows, len(jl.Tiles))
	}

	tiles := make([][]TileType, jl.Rows)
	for r := 0; r < jl.Rows; r++ {
		if len(jl.Tiles[r]) != jl.Cols {
			return OfficeLayout{}, fmt.Errorf("row %d: expected %d cols, got %d", r, jl.Cols, len(jl.Tiles[r]))
		}
		tiles[r] = make([]TileType, jl.Cols)
		for c := 0; c < jl.Cols; c++ {
			t := jl.Tiles[r][c]
			if t < 0 || t > 16 {
				return OfficeLayout{}, fmt.Errorf("row %d, col %d: invalid tile type %d (must be 0-16)", r, c, t)
			}
			tiles[r][c] = TileType(t)
		}
	}

	if len(jl.Seats) == 0 {
		return OfficeLayout{}, fmt.Errorf("layout must have at least 1 seat")
	}
	uidSet := make(map[string]bool)
	seats := make([]Seat, len(jl.Seats))
	for i, js := range jl.Seats {
		if uidSet[js.UID] {
			return OfficeLayout{}, fmt.Errorf("duplicate seat UID %q", js.UID)
		}
		uidSet[js.UID] = true

		if js.Row < 0 || js.Row >= jl.Rows || js.Col < 0 || js.Col >= jl.Cols {
			return OfficeLayout{}, fmt.Errorf("seat %q at (%d,%d) is out of bounds", js.UID, js.Col, js.Row)
		}
		if !IsWalkable(tiles[js.Row][js.Col]) {
			return OfficeLayout{}, fmt.Errorf("seat %q at (%d,%d) is on non-walkable tile type %d", js.UID, js.Col, js.Row, tiles[js.Row][js.Col])
		}

		dir, err := parseFacing(js.Facing)
		if err != nil {
			return OfficeLayout{}, fmt.Errorf("seat %q: %w", js.UID, err)
		}
		zone := js.Zone
		if zone == "" {
			zone = "work"
		}
		seats[i] = Seat{
			UID:       js.UID,
			Col:       js.Col,
			Row:       js.Row,
			FacingDir: dir,
			Zone:      zone,
		}
	}

	return OfficeLayout{
		Cols:  jl.Cols,
		Rows:  jl.Rows,
		Tiles: tiles,
		Seats: seats,
	}, nil
}
