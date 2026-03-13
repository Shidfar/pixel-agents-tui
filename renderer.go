package main

import (
	"io"
	"os"
	"sort"

	"golang.org/x/term"
)

// placedRect tracks a placed text element for collision detection.
type placedRect struct {
	row, startCol, endCol int
}

// overlaps returns true if the given row/col range overlaps any already-placed rect.
func overlaps(placed []placedRect, row, startCol, endCol int) bool {
	for _, p := range placed {
		if p.row == row && startCol < p.endCol && endCol > p.startCol {
			return true
		}
	}
	return false
}

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

	// Clear frame buffer using theme background
	bg := o.Theme.Background
	r.fb.Clear(bg[0], bg[1], bg[2])

	// Reserve space for history panel if open
	officeAreaW := tw
	if o.HistoryPanelOpen && tw > panelWidth+20 {
		officeAreaW = tw - panelWidth
	}

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
		if ch.State == CharGone {
			continue
		}
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

	// NOTE: Speech bubbles and agent name labels now render as terminal text
	// after the viewport blit, so they are always crisp regardless of zoom/scale.

	// Draw particles and connection arcs (on top of everything in the world)
	if ParticlesEnabled {
		o.Particles.Render(pixels, pxW, pxH)
		o.Particles.RenderConnections(pixels, pxW, pxH, o.Characters)
	}

	// ── Viewport calculation (zoom/pan) ──
	fitW := officeAreaW
	fitH := (th - 1) * 2 // -1 for status bar, *2 because each row = 2 pixel rows

	// Base scale to fit entire office
	baseScaleX := float64(pxW) / float64(fitW)
	baseScaleY := float64(pxH) / float64(fitH)
	baseScale := baseScaleX
	if baseScaleY > baseScale {
		baseScale = baseScaleY
	}
	if baseScale < 1.0 {
		baseScale = 1.0
	}

	// Apply zoom: higher zoom level = smaller scale = more detail
	scale := baseScale / float64(o.Zoom.Level)
	if scale < 1.0 {
		scale = 1.0
	}

	// Visible viewport in pixel coordinates
	viewPxW := float64(fitW) * scale
	viewPxH := float64(fitH) * scale

	// Clamp pan within office bounds
	o.Zoom.ClampPan(float64(pxW), float64(pxH), viewPxW, viewPxH)

	// Display dimensions in terminal cells
	dispW := fitW
	dispTermH := fitH / 2

	// At zoom > 1, we're showing a sub-region of the pixel buffer
	// so dispW/dispTermH stay the same but we sample from a sub-region

	// Center in terminal (within the office area)
	actualDispW := int(float64(pxW) / scale)
	actualDispTermH := int(float64(pxH)/scale) / 2
	if o.Zoom.Level == 1 {
		// Fit-to-screen: center in available area
		dispW = actualDispW
		dispTermH = actualDispTermH
	}
	offsetCol := (officeAreaW - dispW) / 2
	offsetRow := ((th - 1) - dispTermH) / 2
	if offsetCol < 0 {
		offsetCol = 0
	}
	if offsetRow < 0 {
		offsetRow = 0
	}

	// Color transform from theme
	transform := o.Theme.Transform

	// Blit with nearest-neighbor sampling
	for ty := 0; ty < dispTermH && (offsetRow+ty) < th-1; ty++ {
		srcTopY := int(o.Zoom.PanY + float64(ty*2)*scale)
		srcBotY := int(o.Zoom.PanY + float64(ty*2+1)*scale)
		if srcTopY >= pxH {
			srcTopY = pxH - 1
		}
		if srcBotY >= pxH {
			srcBotY = pxH - 1
		}
		if srcTopY < 0 {
			srcTopY = 0
		}
		if srcBotY < 0 {
			srcBotY = 0
		}
		for tx := 0; tx < dispW && (offsetCol+tx) < officeAreaW; tx++ {
			srcX := int(o.Zoom.PanX + float64(tx)*scale)
			if srcX >= pxW {
				srcX = pxW - 1
			}
			if srcX < 0 {
				srcX = 0
			}

			topColor := pixels[srcTopY][srcX]
			botColor := pixels[srcBotY][srcX]

			var cell Cell
			if topColor != "" && botColor != "" {
				tr, tg, tb := HexToRGB(topColor)
				tr, tg, tb = transform(tr, tg, tb)
				br, bg, bb := HexToRGB(botColor)
				br, bg, bb = transform(br, bg, bb)
				cell = Cell{Char: HalfBlockUpper, Fg: [3]uint8{tr, tg, tb}, Bg: [3]uint8{br, bg, bb}}
			} else if topColor != "" {
				tr, tg, tb := HexToRGB(topColor)
				tr, tg, tb = transform(tr, tg, tb)
				cell = Cell{Char: HalfBlockUpper, Fg: [3]uint8{tr, tg, tb}, Bg: bg}
			} else if botColor != "" {
				br, bgg, bb := HexToRGB(botColor)
				br, bgg, bb = transform(br, bgg, bb)
				cell = Cell{Char: HalfBlockLower, Fg: [3]uint8{br, bgg, bb}, Bg: bg}
			} else {
				cell = Cell{Char: " ", Fg: bg, Bg: bg}
			}

			r.fb.Set(offsetRow+ty, offsetCol+tx, cell)
		}
	}

	// Draw agent name labels and bubbles as terminal text (crisp at any zoom).
	// Sort characters by Y ascending so back-of-office agents get placed first,
	// giving front agents priority for closer (less shifted) positions.
	sortedForLabels := make([]*Character, 0, len(o.Characters))
	for _, ch := range o.Characters {
		if ch.State == CharGone {
			continue
		}
		sortedForLabels = append(sortedForLabels, ch)
	}
	sort.Slice(sortedForLabels, func(i, j int) bool {
		return sortedForLabels[i].Y < sortedForLabels[j].Y
	})

	var placed []placedRect

	for _, ch := range sortedForLabels {
		// Convert pixel position to terminal coordinates
		sittingOff := 0.0
		if ch.State == CharType {
			sittingOff = 6.0
		}

		// Character head position in pixels (above feet)
		headPxX := ch.X
		headPxY := ch.Y + sittingOff - 18

		// Pixel → terminal coordinate conversion
		termCol := int((headPxX-o.Zoom.PanX)/scale) + offsetCol
		termRow := int((headPxY-o.Zoom.PanY)/scale/2) + offsetRow

		// Skip if offscreen
		if termRow < 0 || termRow >= th-1 || termCol < 0 || termCol >= officeAreaW {
			continue
		}

		// Calculate label row from original termRow (never mutate termRow).
		// If bubble exists: label goes 2 rows above head (1 for bubble + 1 for spacing).
		// If no bubble: label goes 1 row above head.
		var labelRow int
		if ch.BubbleType != "" {
			labelRow = termRow - 2
		} else {
			labelRow = termRow - 1
		}

		// Draw bubble indicator above character
		if ch.BubbleType != "" {
			bubbleRow := termRow - 1
			if bubbleRow >= 0 {
				var bubbleText string
				var bubbleFg, bubbleBg [3]uint8
				if ch.BubbleType == "permission" {
					bubbleText = " ! PERMIT "
					bubbleFg = [3]uint8{255, 255, 255}
					bubbleBg = [3]uint8{200, 40, 40}
				} else {
					bubbleText = " * WAIT "
					bubbleFg = [3]uint8{30, 30, 30}
					bubbleBg = [3]uint8{180, 140, 20}
				}
				startCol := termCol - len(bubbleText)/2
				endCol := startCol + len(bubbleText)

				// Collision avoidance: shift up by 1 row, max 2 shifts
				for shift := 0; shift < 3; shift++ {
					if !overlaps(placed, bubbleRow-shift, startCol, endCol) {
						bubbleRow -= shift
						// Also shift label up by the same amount
						labelRow -= shift
						break
					}
				}

				if bubbleRow >= 0 {
					for i, ru := range bubbleText {
						col := startCol + i
						if col >= 0 && col < officeAreaW {
							r.fb.Set(bubbleRow, col, Cell{Char: string(ru), Fg: bubbleFg, Bg: bubbleBg})
						}
					}
					placed = append(placed, placedRect{row: bubbleRow, startCol: startCol, endCol: endCol})
				}
			}
		}

		// Draw name label
		if LabelsEnabled && ch.Name != "" {
			if labelRow >= 0 && labelRow < th-1 {
				labelFg := [3]uint8{255, 255, 255}
				labelBg := [3]uint8{34, 34, 51}
				name := ch.Name
				startCol := termCol - len(name)/2
				endCol := startCol + len(name)

				// Collision avoidance: shift up by 1 row, max 2 shifts
				for shift := 0; shift < 3; shift++ {
					if !overlaps(placed, labelRow-shift, startCol, endCol) {
						labelRow -= shift
						break
					}
				}

				if labelRow >= 0 && labelRow < th-1 {
					for i, ru := range name {
						col := startCol + i
						if col >= 0 && col < officeAreaW {
							r.fb.Set(labelRow, col, Cell{Char: string(ru), Fg: labelFg, Bg: labelBg})
						}
					}
					placed = append(placed, placedRect{row: labelRow, startCol: startCol, endCol: endCol})
				}
			}
		}
	}

	// Draw history panel if open
	if o.HistoryPanelOpen && tw > panelWidth+20 {
		RenderHistoryPanel(r.fb, o, tw-panelWidth, panelWidth, th)
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
	if o.Theme.Name != "default" {
		status += " | " + o.Theme.Name
	}
	if o.Zoom.Level > 1 {
		status += " | " + intToStr(o.Zoom.Level) + "x"
	}

	// Right-aligned help text
	help := "q=quit t=theme h=history n=particles +/-=zoom "
	padLen := tw - len(status) - len(help)
	if padLen > 0 {
		for i := 0; i < padLen; i++ {
			status += " "
		}
		status += help
	}

	// Write status bar cells using theme colors
	fgColor := o.Theme.StatusFg
	bgColor := o.Theme.StatusBg
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
