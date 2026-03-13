package main

import (
	"fmt"
	"sync/atomic"
	"time"
)

var demoToolSeq atomic.Int64

// demoToolID returns a unique tool ID for demo events.
func demoToolID(agentID int) string {
	seq := demoToolSeq.Add(1)
	return fmt.Sprintf("demo-%d-tool-%d", agentID, seq)
}

// demoSleep sleeps for the given duration, returning true if quit was signaled.
func demoSleep(d time.Duration, quit <-chan struct{}) bool {
	select {
	case <-quit:
		return true
	case <-time.After(d):
		return false
	}
}

// RunDemo sends scripted AgentEvents for 4 fake agents, looping forever.
// Used for visual testing without real JSONL files.
func RunDemo(events chan<- AgentEvent, quit <-chan struct{}) {
	// Create all demo agents with names
	demoNames := map[int]string{1: "Coder", 2: "Reader", 3: "Waiting", 4: "Sporadic"}
	for id := 1; id <= 4; id++ {
		events <- AgentEvent{Type: "agentCreated", AgentID: id, AgentName: demoNames[id]}
	}

	if demoSleep(500*time.Millisecond, quit) {
		return
	}

	go demoActiveCoder(1, events, quit)
	go demoReader(2, events, quit)
	go demoWaiting(3, events, quit)
	go demoIntermittent(4, events, quit)

	<-quit
}

// demoActiveCoder simulates rapid tool use — Edit, Write, Bash in quick succession.
func demoActiveCoder(id int, events chan<- AgentEvent, quit <-chan struct{}) {
	tools := []struct {
		name   string
		status string
		dur    time.Duration
	}{
		{"Edit", "Editing main.go", 2 * time.Second},
		{"Bash", "Running: go build ./...", 3 * time.Second},
		{"Write", "Writing config.go", 2 * time.Second},
		{"Edit", "Editing handler.go", 1500 * time.Millisecond},
		{"Bash", "Running: go test ./...", 4 * time.Second},
	}

	for {
		// Activate
		events <- AgentEvent{Type: "agentActive", AgentID: id}

		for _, tool := range tools {
			toolID := demoToolID(id)
			events <- AgentEvent{
				Type: "agentToolStart", AgentID: id,
				ToolID: toolID, ToolName: tool.name, ToolStatus: tool.status,
			}
			if demoSleep(tool.dur, quit) {
				return
			}
			events <- AgentEvent{Type: "agentToolDone", AgentID: id, ToolID: toolID}
			if demoSleep(800*time.Millisecond, quit) {
				return
			}
		}

		// Brief idle between coding bursts
		events <- AgentEvent{Type: "agentWaiting", AgentID: id, Status: "waiting"}
		if demoSleep(8*time.Second, quit) {
			return
		}
	}
}

// demoReader simulates reading-focused work — Read, Grep, Glob with longer pauses.
func demoReader(id int, events chan<- AgentEvent, quit <-chan struct{}) {
	tools := []struct {
		name   string
		status string
		dur    time.Duration
	}{
		{"Read", "Reading server.go", 3 * time.Second},
		{"Grep", "Searching code", 2 * time.Second},
		{"Read", "Reading types.go", 2500 * time.Millisecond},
		{"Glob", "Searching files", 1500 * time.Millisecond},
		{"WebFetch", "Fetching web content", 4 * time.Second},
	}

	for {
		events <- AgentEvent{Type: "agentActive", AgentID: id}

		for i, tool := range tools {
			toolID := demoToolID(id)
			events <- AgentEvent{
				Type: "agentToolStart", AgentID: id,
				ToolID: toolID, ToolName: tool.name, ToolStatus: tool.status,
			}
			if demoSleep(tool.dur, quit) {
				return
			}
			events <- AgentEvent{Type: "agentToolDone", AgentID: id, ToolID: toolID}

			// Longer pause between reads
			pause := 2 * time.Second
			if i == 2 {
				pause = 4 * time.Second
			}
			if demoSleep(pause, quit) {
				return
			}
		}

		// Idle for a while — reader goes to break room
		events <- AgentEvent{Type: "agentWaiting", AgentID: id, Status: "waiting"}
		if demoSleep(15*time.Second, quit) {
			return
		}
	}
}

// demoWaiting simulates an agent that gets stuck on permission approval.
func demoWaiting(id int, events chan<- AgentEvent, quit <-chan struct{}) {
	for {
		events <- AgentEvent{Type: "agentActive", AgentID: id}

		// Start a tool
		toolID := demoToolID(id)
		events <- AgentEvent{
			Type: "agentToolStart", AgentID: id,
			ToolID: toolID, ToolName: "Bash", ToolStatus: "Running: rm -rf build/",
		}
		if demoSleep(2*time.Second, quit) {
			return
		}

		// Permission required!
		events <- AgentEvent{Type: "agentToolPermission", AgentID: id}
		if demoSleep(10*time.Second, quit) {
			return
		}

		// Permission granted
		events <- AgentEvent{Type: "agentToolPermissionClear", AgentID: id}
		if demoSleep(3*time.Second, quit) {
			return
		}
		events <- AgentEvent{Type: "agentToolDone", AgentID: id, ToolID: toolID}

		// Do one more tool after unblock
		toolID2 := demoToolID(id)
		events <- AgentEvent{
			Type: "agentToolStart", AgentID: id,
			ToolID: toolID2, ToolName: "Edit", ToolStatus: "Editing deploy.yaml",
		}
		if demoSleep(2*time.Second, quit) {
			return
		}
		events <- AgentEvent{Type: "agentToolDone", AgentID: id, ToolID: toolID2}

		// Go idle
		events <- AgentEvent{Type: "agentWaiting", AgentID: id, Status: "waiting"}
		if demoSleep(12*time.Second, quit) {
			return
		}
	}
}

// demoIntermittent simulates sporadic activity — brief bursts separated by long idle.
func demoIntermittent(id int, events chan<- AgentEvent, quit <-chan struct{}) {
	for {
		// Long idle at start
		if demoSleep(20*time.Second, quit) {
			return
		}

		// Brief burst of activity
		events <- AgentEvent{Type: "agentActive", AgentID: id}

		toolID := demoToolID(id)
		events <- AgentEvent{
			Type: "agentToolStart", AgentID: id,
			ToolID: toolID, ToolName: "Read", ToolStatus: "Reading README.md",
		}
		if demoSleep(2*time.Second, quit) {
			return
		}
		events <- AgentEvent{Type: "agentToolDone", AgentID: id, ToolID: toolID}
		if demoSleep(1*time.Second, quit) {
			return
		}

		toolID2 := demoToolID(id)
		events <- AgentEvent{
			Type: "agentToolStart", AgentID: id,
			ToolID: toolID2, ToolName: "Edit", ToolStatus: "Editing README.md",
		}
		if demoSleep(3*time.Second, quit) {
			return
		}
		events <- AgentEvent{Type: "agentToolDone", AgentID: id, ToolID: toolID2}

		// Go waiting
		events <- AgentEvent{Type: "agentWaiting", AgentID: id, Status: "waiting"}
	}
}
