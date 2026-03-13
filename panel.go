package main

import (
	"sort"
	"time"
)

// ToolHistoryEntry records one tool invocation.
type ToolHistoryEntry struct {
	ToolName string
	Status   string // "active", "done", "permission"
	Time     time.Time
}

const maxHistoryEntries = 8

// AddToolHistory appends a tool entry to the character's history.
func AddToolHistory(ch *Character, name, status string) {
	entry := ToolHistoryEntry{
		ToolName: name,
		Status:   status,
		Time:     time.Now(),
	}
	ch.ToolHistory = append(ch.ToolHistory, entry)
	if len(ch.ToolHistory) > maxHistoryEntries {
		ch.ToolHistory = ch.ToolHistory[len(ch.ToolHistory)-maxHistoryEntries:]
	}
}

// UpdateToolHistoryStatus updates the status of the most recent active entry with the given tool name.
func UpdateToolHistoryStatus(ch *Character, name, newStatus string) {
	for i := len(ch.ToolHistory) - 1; i >= 0; i-- {
		if ch.ToolHistory[i].ToolName == name && ch.ToolHistory[i].Status == "active" {
			ch.ToolHistory[i].Status = newStatus
			return
		}
	}
}

// Panel layout constants
const (
	panelWidth    = 30
	panelMinWidth = 20
)

// RenderHistoryPanel draws the agent history sidebar on the right side of the framebuffer.
func RenderHistoryPanel(fb *FrameBuffer, o *Office, startCol, width, height int) {
	if width < panelMinWidth || height < 3 {
		return
	}

	bgColor := [3]uint8{30, 30, 45}
	borderColor := [3]uint8{80, 80, 120}
	nameColor := [3]uint8{220, 220, 220}
	activeColor := [3]uint8{100, 220, 100}
	doneColor := [3]uint8{120, 120, 140}
	permColor := [3]uint8{220, 180, 60}
	timeColor := [3]uint8{90, 90, 110}
	idleColor := [3]uint8{100, 100, 120}

	// Clear panel area
	for r := 0; r < height-1; r++ {
		for c := startCol; c < startCol+width && c < fb.w; c++ {
			fb.Set(r, c, Cell{Char: " ", Fg: bgColor, Bg: bgColor})
		}
	}

	// Top border
	writePanel(fb, 0, startCol, "┌─ Agent History ", borderColor, bgColor)
	for c := startCol + 17; c < startCol+width-1 && c < fb.w; c++ {
		fb.Set(0, c, Cell{Char: "─", Fg: borderColor, Bg: bgColor})
	}
	if startCol+width-1 < fb.w {
		fb.Set(0, startCol+width-1, Cell{Char: "┐", Fg: borderColor, Bg: bgColor})
	}

	// Side borders
	for r := 1; r < height-1; r++ {
		fb.Set(r, startCol, Cell{Char: "│", Fg: borderColor, Bg: bgColor})
		if startCol+width-1 < fb.w {
			fb.Set(r, startCol+width-1, Cell{Char: "│", Fg: borderColor, Bg: bgColor})
		}
	}

	// Bottom border
	if height-2 >= 1 {
		fb.Set(height-2, startCol, Cell{Char: "└", Fg: borderColor, Bg: bgColor})
		for c := startCol + 1; c < startCol+width-1 && c < fb.w; c++ {
			fb.Set(height-2, c, Cell{Char: "─", Fg: borderColor, Bg: bgColor})
		}
		if startCol+width-1 < fb.w {
			fb.Set(height-2, startCol+width-1, Cell{Char: "┘", Fg: borderColor, Bg: bgColor})
		}
	}

	contentCol := startCol + 2
	contentWidth := width - 4
	row := 2

	// Sort characters by ID for stable display
	ids := make([]int, 0, len(o.Characters))
	for id := range o.Characters {
		ids = append(ids, id)
	}
	sort.Ints(ids)

	for _, id := range ids {
		if row >= height-3 {
			break
		}
		ch := o.Characters[id]

		// Agent name and status
		name := ch.Name
		if name == "" {
			name = "Agent " + intToStr(id)
		}
		status := "idle"
		statusColor := idleColor
		if ch.State == CharGone {
			status = "gone"
			statusColor = [3]uint8{80, 80, 100}
		} else if ch.IsActive {
			if ch.ActiveToolCount > 0 {
				status = ch.CurrentTool
				statusColor = activeColor
			} else {
				status = "thinking"
				statusColor = nameColor
			}
		}
		if ch.BubbleType == "permission" {
			status = "permission"
			statusColor = permColor
		}

		writePanel(fb, row, contentCol, name+" ", nameColor, bgColor)
		statusText := "(" + status + ")"
		if len(name)+1+len(statusText) > contentWidth {
			statusText = statusText[:contentWidth-len(name)-1]
		}
		writePanel(fb, row, contentCol+len(name)+1, statusText, statusColor, bgColor)
		row++

		// Tool history (most recent first)
		histLen := len(ch.ToolHistory)
		start := histLen - 5
		if start < 0 {
			start = 0
		}
		for i := histLen - 1; i >= start && row < height-3; i-- {
			entry := ch.ToolHistory[i]
			icon := "✓"
			iconColor := doneColor
			if entry.Status == "active" {
				icon = "●"
				iconColor = activeColor
			} else if entry.Status == "permission" {
				icon = "!"
				iconColor = permColor
			}

			timeStr := entry.Time.Format("15:04:05")
			writePanel(fb, row, contentCol, " "+icon+" ", iconColor, bgColor)
			writePanel(fb, row, contentCol+4, entry.ToolName, iconColor, bgColor)
			timeCol := startCol + width - 2 - len(timeStr)
			if timeCol > contentCol+4+len(entry.ToolName) {
				writePanel(fb, row, timeCol, timeStr, timeColor, bgColor)
			}
			row++
		}

		if histLen == 0 && row < height-3 {
			writePanel(fb, row, contentCol, " (no activity)", idleColor, bgColor)
			row++
		}

		row++ // spacing between agents
	}
}

func writePanel(fb *FrameBuffer, row, col int, text string, fg, bg [3]uint8) {
	i := 0
	for _, r := range text {
		fb.Set(row, col+i, Cell{Char: string(r), Fg: fg, Bg: bg})
		i++
	}
}
