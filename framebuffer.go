package main

import (
	"bytes"
	"fmt"
	"io"
)

// Cell represents a single terminal cell with a character and foreground/background colors.
type Cell struct {
	Char string   // the character to display (e.g., "▀", "▄", " ")
	Fg   [3]uint8 // foreground RGB
	Bg   [3]uint8 // background RGB
}

// FrameBuffer implements double-buffered rendering to minimize flicker.
// It tracks the current and previous frame, only emitting ANSI escape
// sequences for cells that have changed.
type FrameBuffer struct {
	curr [][]Cell
	prev [][]Cell
	w, h int
}

// NewFrameBuffer creates a frame buffer of the given terminal dimensions.
func NewFrameBuffer(w, h int) *FrameBuffer {
	fb := &FrameBuffer{w: w, h: h}
	fb.curr = makeGrid(w, h)
	fb.prev = makeGrid(w, h)
	// Ensure prev differs from curr so the first frame is fully drawn.
	// We achieve this by giving prev cells a sentinel value.
	for r := 0; r < h; r++ {
		for c := 0; c < w; c++ {
			fb.prev[r][c].Char = "\x00"
		}
	}
	return fb
}

func makeGrid(w, h int) [][]Cell {
	grid := make([][]Cell, h)
	for r := 0; r < h; r++ {
		grid[r] = make([]Cell, w)
		for c := 0; c < w; c++ {
			grid[r][c].Char = " "
		}
	}
	return grid
}

// Set updates a cell in the current frame buffer.
func (fb *FrameBuffer) Set(row, col int, c Cell) {
	if row < 0 || row >= fb.h || col < 0 || col >= fb.w {
		return
	}
	fb.curr[row][col] = c
}

// Clear resets all cells in the current frame to spaces with a given background.
func (fb *FrameBuffer) Clear(bgR, bgG, bgB uint8) {
	for r := 0; r < fb.h; r++ {
		for c := 0; c < fb.w; c++ {
			fb.curr[r][c] = Cell{
				Char: " ",
				Fg:   [3]uint8{bgR, bgG, bgB},
				Bg:   [3]uint8{bgR, bgG, bgB},
			}
		}
	}
}

// Flush writes only changed cells to the writer. It compares curr vs prev
// cell-by-cell and emits MoveCursor + SetFg + SetBg + char sequences. When
// consecutive cells on the same row change, it batches them to avoid
// redundant cursor moves. After flushing, prev is swapped to match curr.
// Returns the number of bytes written.
func (fb *FrameBuffer) Flush(w io.Writer) int {
	var buf bytes.Buffer
	var lastFg, lastBg [3]uint8
	fgSet := false
	bgSet := false

	for r := 0; r < fb.h; r++ {
		// Track whether we need a cursor move for this row.
		needCursor := true
		lastCol := -2

		for c := 0; c < fb.w; c++ {
			curr := fb.curr[r][c]
			prev := fb.prev[r][c]

			if curr.Char == prev.Char && curr.Fg == prev.Fg && curr.Bg == prev.Bg {
				needCursor = true
				continue
			}

			// Emit cursor move if not contiguous with the last written cell.
			if needCursor || c != lastCol+1 {
				buf.WriteString(fmt.Sprintf("\x1b[%d;%dH", r+1, c+1))
				needCursor = false
			}

			// Emit foreground color if changed.
			if !fgSet || curr.Fg != lastFg {
				buf.WriteString(fmt.Sprintf("\x1b[38;2;%d;%d;%dm", curr.Fg[0], curr.Fg[1], curr.Fg[2]))
				lastFg = curr.Fg
				fgSet = true
			}

			// Emit background color if changed.
			if !bgSet || curr.Bg != lastBg {
				buf.WriteString(fmt.Sprintf("\x1b[48;2;%d;%d;%dm", curr.Bg[0], curr.Bg[1], curr.Bg[2]))
				lastBg = curr.Bg
				bgSet = true
			}

			buf.WriteString(curr.Char)
			lastCol = c
		}
	}

	n, _ := w.Write(buf.Bytes())

	// Swap: copy curr into prev.
	for r := 0; r < fb.h; r++ {
		copy(fb.prev[r], fb.curr[r])
	}

	return n
}

// Resize adjusts the frame buffer dimensions. Both curr and prev are
// reallocated, forcing a full redraw on the next Flush.
func (fb *FrameBuffer) Resize(w, h int) {
	fb.w = w
	fb.h = h
	fb.curr = makeGrid(w, h)
	fb.prev = makeGrid(w, h)
	for r := 0; r < h; r++ {
		for c := 0; c < w; c++ {
			fb.prev[r][c].Char = "\x00"
		}
	}
}
