package main

import (
	"io"
	"os"

	"golang.org/x/term"
)

// TerminalSize returns the current terminal width and height in characters.
// Returns (80, 24) as a fallback if the size cannot be determined.
func TerminalSize() (int, int) {
	w, h, err := term.GetSize(int(os.Stdout.Fd()))
	if err != nil || w <= 0 || h <= 0 {
		return 80, 24
	}
	return w, h
}

// Renderer writes the office state to a terminal using ANSI escape sequences
// and a double-buffered FrameBuffer to minimize flicker.
type Renderer struct {
	w  io.Writer
	fb *FrameBuffer
}

// NewRenderer creates a renderer that writes to the given writer.
func NewRenderer(w io.Writer) *Renderer {
	return &Renderer{w: w}
}

// Render draws the current office state to the terminal.
func (r *Renderer) Render(o *Office) {
	tw, th := TerminalSize()
	if tw <= 0 || th <= 0 {
		return
	}

	// Lazy-init or resize frame buffer on terminal size change
	if r.fb == nil || r.fb.w != tw || r.fb.h != th {
		r.fb = NewFrameBuffer(tw, th)
	}

	// Clear frame buffer to a dark background
	r.fb.Clear(20, 20, 30)

	// Compute pixel buffer dimensions from office tile map
	pxW := o.Cols * TileSize
	pxH := o.Rows * TileSize
	if pxW == 0 || pxH == 0 {
		r.fb.Flush(r.w)
		return
	}

	// Build pixel buffer for the office
	pixels := make([][]string, pxH)
	for y := 0; y < pxH; y++ {
		pixels[y] = make([]string, pxW)
	}

	// Draw floor, wall, and furniture tiles using per-pixel sprites
	for row := 0; row < o.Rows; row++ {
		if row >= len(o.TileMap) {
			break
		}
		for col := 0; col < o.Cols; col++ {
			if col >= len(o.TileMap[row]) {
				break
			}
			tile := o.TileMap[row][col]
			var sprite Sprite
			if tile == TileWall {
				sprite = GetWallAutoSprite(col, row, o.TileMap)
			} else {
				sprite = GetTileSprite(tile)
			}
			if sprite != nil {
				RenderSpriteToPixels(sprite, pixels, col*TileSize, row*TileSize)
			} else {
				// Fallback to solid color for unknown tile types
				color := GetTileColor(tile)
				if color == "" {
					continue
				}
				for py := 0; py < TileSize; py++ {
					for px := 0; px < TileSize; px++ {
						y := row*TileSize + py
						x := col*TileSize + px
						if y < pxH && x < pxW {
							pixels[y][x] = color
						}
					}
				}
			}
		}
	}

	// Draw characters sorted by depth (furthest first for correct occlusion)
	sortedChars := SortCharactersByDepth(o.Characters)
	for _, sc := range sortedChars {
		ch := sc.ch
		sprite := GetSprite(ch.Palette%len(CharacterSprites), ch.State, ch.Dir, ch.Frame)
		if len(sprite) == 0 {
			continue
		}

		spriteW := len(sprite[0])
		spriteH := len(sprite)

		// Character anchored bottom-center at (ch.X, ch.Y).
		// Apply sitting offset for typing state (shifts character down when seated).
		sittingOffset := 0.0
		if ch.State == CharType {
			sittingOffset = 6.0 // CHARACTER_SITTING_OFFSET_PX from constants
		}

		drawX := int(ch.X) - spriteW/2
		drawY := int(ch.Y+sittingOffset) - spriteH

		RenderSpriteToPixels(sprite, pixels, drawX, drawY)
	}

	// Draw speech bubbles above characters (on top of everything)
	for _, sc := range sortedChars {
		ch := sc.ch
		if ch.BubbleType == "" {
			continue
		}

		var bubble Sprite
		if ch.BubbleType == "permission" {
			bubble = BubblePermissionSprite
		} else {
			bubble = BubbleWaitingSprite
		}

		bubbleW := len(bubble[0])
		bubbleH := len(bubble)

		// Place bubble centered above the character's head
		sittingOff := 0.0
		if ch.State == CharType {
			sittingOff = BubbleSittingOffsetPx
		}
		bx := int(ch.X) - bubbleW/2
		by := int(ch.Y+sittingOff) - BubbleVerticalOffsetPx - bubbleH

		RenderSpriteToPixels(bubble, pixels, bx, by)
	}

	// Auto-scale: fit entire office into available terminal space.
	// Each terminal row encodes 2 pixel rows via half-block characters.
	fitW := tw
	fitH := (th - 1) * 2 // -1 for status bar, *2 because each row = 2 pixel rows

	scaleX := float64(pxW) / float64(fitW)
	scaleY := float64(pxH) / float64(fitH)
	scale := scaleX
	if scaleY > scale {
		scale = scaleY
	}
	if scale < 1.0 {
		scale = 1.0 // never upscale
	}

	// Display dimensions in terminal cells
	dispW := int(float64(pxW) / scale)
	dispTermH := int(float64(pxH)/scale) / 2 // /2 for half-block rows

	// Center in terminal
	offsetCol := (tw - dispW) / 2
	offsetRow := ((th - 1) - dispTermH) / 2
	if offsetCol < 0 {
		offsetCol = 0
	}
	if offsetRow < 0 {
		offsetRow = 0
	}

	// Blit with nearest-neighbor sampling
	for ty := 0; ty < dispTermH && (offsetRow+ty) < th-1; ty++ {
		srcTopY := int(float64(ty*2) * scale)
		srcBotY := int(float64(ty*2+1) * scale)
		if srcTopY >= pxH {
			srcTopY = pxH - 1
		}
		if srcBotY >= pxH {
			srcBotY = pxH - 1
		}
		for tx := 0; tx < dispW && (offsetCol+tx) < tw; tx++ {
			srcX := int(float64(tx) * scale)
			if srcX >= pxW {
				srcX = pxW - 1
			}

			topColor := pixels[srcTopY][srcX]
			botColor := pixels[srcBotY][srcX]

			var cell Cell
			if topColor != "" && botColor != "" {
				tr, tg, tb := HexToRGB(topColor)
				br, bg, bb := HexToRGB(botColor)
				cell = Cell{Char: HalfBlockUpper, Fg: [3]uint8{tr, tg, tb}, Bg: [3]uint8{br, bg, bb}}
			} else if topColor != "" {
				tr, tg, tb := HexToRGB(topColor)
				cell = Cell{Char: HalfBlockUpper, Fg: [3]uint8{tr, tg, tb}, Bg: [3]uint8{20, 20, 30}}
			} else if botColor != "" {
				br, bg, bb := HexToRGB(botColor)
				cell = Cell{Char: HalfBlockLower, Fg: [3]uint8{br, bg, bb}, Bg: [3]uint8{20, 20, 30}}
			} else {
				cell = Cell{Char: " ", Fg: [3]uint8{20, 20, 30}, Bg: [3]uint8{20, 20, 30}}
			}

			r.fb.Set(offsetRow+ty, offsetCol+tx, cell)
		}
	}

	// Draw status bar at the bottom
	r.drawStatusBar(o, tw, th)

	r.fb.Flush(r.w)
}

// drawStatusBar renders a text status line at the bottom of the terminal.
func (r *Renderer) drawStatusBar(o *Office, tw, th int) {
	if th < 1 {
		return
	}

	row := th - 1

	// Count agents
	total := len(o.Characters)
	nActive := 0
	var currentTool string
	for _, ch := range o.Characters {
		if ch.IsActive {
			nActive++
		}
		if ch.CurrentTool != "" && currentTool == "" {
			currentTool = ch.CurrentTool
		}
	}

	// Build status text
	status := " pixel-agents"
	if total > 0 {
		status += " | " + formatAgentCount(total, nActive)
	} else {
		status += " | watching..."
	}
	if currentTool != "" {
		status += " | " + currentTool
	}

	// Right-aligned help text
	help := "q=quit "
	padLen := tw - len(status) - len(help)
	if padLen > 0 {
		for i := 0; i < padLen; i++ {
			status += " "
		}
		status += help
	}

	// Write status bar cells
	fgColor := [3]uint8{200, 200, 200}
	bgColor := [3]uint8{40, 40, 60}
	for i := 0; i < tw; i++ {
		ch := " "
		if i < len(status) {
			ch = string(status[i])
		}
		r.fb.Set(row, i, Cell{Char: ch, Fg: fgColor, Bg: bgColor})
	}
}

// formatAgentCount returns a human-readable agent count string.
func formatAgentCount(total, active int) string {
	t := intToStr(total)
	a := intToStr(active)
	if total == 1 {
		if active == 1 {
			return "1 agent (active)"
		}
		return "1 agent (idle)"
	}
	return t + " agents (" + a + " active)"
}

// intToStr converts a non-negative integer to a string without importing strconv.
func intToStr(n int) string {
	if n == 0 {
		return "0"
	}
	if n < 0 {
		return "-" + intToStr(-n)
	}
	digits := ""
	for n > 0 {
		digits = string(rune('0'+n%10)) + digits
		n /= 10
	}
	return digits
}
