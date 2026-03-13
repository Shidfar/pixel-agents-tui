package main

import "fmt"

// Half-block characters for encoding 2 vertical pixels per terminal cell.
const HalfBlockUpper = "\u2580" // ▀
const HalfBlockLower = "\u2584" // ▄

// MoveCursor positions the cursor at (row, col) using 1-based indexing.
func MoveCursor(row, col int) string { return fmt.Sprintf("\x1b[%d;%dH", row, col) }

// SetFg sets the foreground color using truecolor (24-bit).
func SetFg(r, g, b uint8) string { return fmt.Sprintf("\x1b[38;2;%d;%d;%dm", r, g, b) }

// SetBg sets the background color using truecolor (24-bit).
func SetBg(r, g, b uint8) string { return fmt.Sprintf("\x1b[48;2;%d;%d;%dm", r, g, b) }

// ResetColor resets all terminal attributes.
func ResetColor() string { return "\x1b[0m" }

// EnterAltScreen switches to the alternate screen buffer.
func EnterAltScreen() string { return "\x1b[?1049h" }

// ExitAltScreen returns to the normal screen buffer.
func ExitAltScreen() string { return "\x1b[?1049l" }

// HideCursor hides the terminal cursor.
func HideCursor() string { return "\x1b[?25l" }

// ShowCursor shows the terminal cursor.
func ShowCursor() string { return "\x1b[?25h" }

// ClearScreen clears the entire screen.
func ClearScreen() string { return "\x1b[2J" }

// HexToRGB converts a #RRGGBB hex string to RGB components.
// Returns (0,0,0) for invalid input.
func HexToRGB(hex string) (uint8, uint8, uint8) {
	if len(hex) < 7 || hex[0] != '#' {
		return 0, 0, 0
	}
	var n uint32
	fmt.Sscanf(hex[1:], "%06x", &n)
	return uint8(n >> 16), uint8(n >> 8 & 0xFF), uint8(n & 0xFF)
}
