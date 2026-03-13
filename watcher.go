package main

import (
	"os"
	"strings"
	"time"
)

// WatchFile starts a goroutine that polls a JSONL file for new lines and emits events.
// It reads from the agent's last known file offset, splits into lines, and calls
// ProcessLine for each complete line. Partial lines are buffered in agent.LineBuffer.
// The goroutine exits when quit is closed.
func WatchFile(agentID int, path string, registry *AgentRegistry, events chan<- AgentEvent, quit <-chan struct{}) {
	ticker := time.NewTicker(time.Duration(FileWatcherPollMs) * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-quit:
			return
		case <-ticker.C:
			ReadNewLines(agentID, registry, events)
		}
	}
}

// ReadNewLines reads any new bytes appended to the agent's JSONL file since the
// last read, splits them into lines, and processes each complete line. Partial
// trailing lines are stored in agent.LineBuffer for the next call.
func ReadNewLines(agentID int, registry *AgentRegistry, events chan<- AgentEvent) {
	agent, ok := registry.Get(agentID)
	if !ok {
		return
	}

	info, err := os.Stat(agent.JsonlFile)
	if err != nil {
		return
	}

	fileSize := info.Size()
	if fileSize <= agent.FileOffset {
		return
	}

	f, err := os.Open(agent.JsonlFile)
	if err != nil {
		return
	}
	defer f.Close()

	bytesToRead := fileSize - agent.FileOffset
	buf := make([]byte, bytesToRead)

	_, err = f.ReadAt(buf, agent.FileOffset)
	if err != nil {
		return
	}
	agent.FileOffset = fileSize

	text := agent.LineBuffer + string(buf)
	lines := strings.Split(text, "\n")

	// Last element is either empty (if text ended with \n) or a partial line
	agent.LineBuffer = lines[len(lines)-1]
	lines = lines[:len(lines)-1]

	// Check if we have any non-empty lines — if so, cancel timers
	// (data flowing means agent is still active)
	hasLines := false
	for _, l := range lines {
		if strings.TrimSpace(l) != "" {
			hasLines = true
			break
		}
	}

	if hasLines {
		CancelWaitingTimer(agentID)
		CancelPermissionTimer(agentID)
		if agent.PermissionSent {
			agent.PermissionSent = false
			events <- AgentEvent{
				Type:    "agentToolPermissionClear",
				AgentID: agentID,
			}
		}
	}

	emit := func(ev AgentEvent) {
		events <- ev
	}

	for _, line := range lines {
		if strings.TrimSpace(line) == "" {
			continue
		}
		ProcessLine(agentID, line, agent, emit)
	}
}
