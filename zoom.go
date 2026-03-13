package main

// ZoomState tracks the current zoom level and viewport pan offset.
type ZoomState struct {
	Level      int     // 1 = fit-to-screen, 2/3/4 = zoomed in
	PanX       float64 // pan offset in pixels from top-left
	PanY       float64
	AutoFollow bool // auto-center on most active agent
	MaxLevel   int  // maximum zoom level
}

// NewZoomState creates a default zoom state (fit-to-screen, auto-follow on).
func NewZoomState() ZoomState {
	return ZoomState{
		Level:      1,
		PanX:       0,
		PanY:       0,
		AutoFollow: true,
		MaxLevel:   4,
	}
}

// ZoomIn increases zoom level by 1.
func (z *ZoomState) ZoomIn() {
	if z.Level < z.MaxLevel {
		z.Level++
	}
}

// ZoomOut decreases zoom level by 1. At level 1, resets pan and enables auto-follow.
func (z *ZoomState) ZoomOut() {
	if z.Level > 1 {
		z.Level--
	}
	if z.Level == 1 {
		z.PanX = 0
		z.PanY = 0
		z.AutoFollow = true
	}
}

// Reset returns to fit-to-screen with auto-follow.
func (z *ZoomState) Reset() {
	z.Level = 1
	z.PanX = 0
	z.PanY = 0
	z.AutoFollow = true
}

// Pan moves the viewport by the given pixel offset. Disables auto-follow.
func (z *ZoomState) Pan(dx, dy float64) {
	if z.Level <= 1 {
		return
	}
	z.PanX += dx
	z.PanY += dy
	z.AutoFollow = false
}

// ClampPan ensures the pan offset stays within the office bounds.
func (z *ZoomState) ClampPan(pxW, pxH, viewW, viewH float64) {
	maxPanX := pxW - viewW
	maxPanY := pxH - viewH
	if maxPanX < 0 {
		maxPanX = 0
	}
	if maxPanY < 0 {
		maxPanY = 0
	}
	if z.PanX < 0 {
		z.PanX = 0
	}
	if z.PanY < 0 {
		z.PanY = 0
	}
	if z.PanX > maxPanX {
		z.PanX = maxPanX
	}
	if z.PanY > maxPanY {
		z.PanY = maxPanY
	}
}

// CenterOn centers the viewport on the given pixel coordinates.
func (z *ZoomState) CenterOn(x, y, viewW, viewH float64) {
	z.PanX = x - viewW/2
	z.PanY = y - viewH/2
}

// MostActiveAgent finds the character that is most actively using tools.
func MostActiveAgent(characters map[int]*Character) *Character {
	var best *Character
	bestScore := -1
	for _, ch := range characters {
		score := 0
		if ch.IsActive {
			score += 1
		}
		if ch.ActiveToolCount > 0 {
			score += 2
		}
		if ch.BubbleType == "permission" {
			score += 3
		}
		if score > bestScore {
			bestScore = score
			best = ch
		}
	}
	return best
}

// PanTileSize is how many pixels to pan per arrow key press.
const PanTileSize = 16.0
