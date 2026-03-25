package main

import (
	"encoding/json"
	"path/filepath"
	"time"
)

// ── JSONL record structs ────────────────────────────────────

type JsonlRecord struct {
	Type            string          `json:"type"`
	Subtype         string          `json:"subtype,omitempty"`
	Message         json.RawMessage `json:"message,omitempty"`
	ParentToolUseID string          `json:"parentToolUseID,omitempty"`
	DurationMs      int             `json:"duration_ms,omitempty"`
	Data            json.RawMessage `json:"data,omitempty"`
}

type MessageContent struct {
	Role    string          `json:"role"`
	Content json.RawMessage `json:"content"`
}

type ContentBlock struct {
	Type      string                 `json:"type"`
	ID        string                 `json:"id,omitempty"`
	Name      string                 `json:"name,omitempty"`
	Input     map[string]interface{} `json:"input,omitempty"`
	ToolUseID string                 `json:"tool_use_id,omitempty"`
	Text      string                 `json:"text,omitempty"`
}

// ── FormatToolStatus ────────────────────────────────────────

// FormatToolStatus returns a human-readable description for a tool invocation.
func FormatToolStatus(toolName string, input map[string]interface{}) string {
	base := func(p interface{}) string {
		s, ok := p.(string)
		if !ok || s == "" {
			return ""
		}
		return filepath.Base(s)
	}

	switch toolName {
	case "Read":
		return "Reading " + base(input["file_path"])
	case "Edit":
		return "Editing " + base(input["file_path"])
	case "Write":
		return "Writing " + base(input["file_path"])
	case "Bash":
		cmd, _ := input["command"].(string)
		if len(cmd) > BashCmdDisplayMaxLen {
			return "Running: " + cmd[:BashCmdDisplayMaxLen] + "\u2026"
		}
		return "Running: " + cmd
	case "Glob":
		return "Searching files"
	case "Grep":
		return "Searching code"
	case "WebFetch":
		return "Fetching web content"
	case "WebSearch":
		return "Searching the web"
	case "Task":
		desc, _ := input["description"].(string)
		if desc != "" {
			if len(desc) > TaskDescDisplayMaxLen {
				return "Subtask: " + desc[:TaskDescDisplayMaxLen] + "\u2026"
			}
			return "Subtask: " + desc
		}
		return "Running subtask"
	case "AskUserQuestion":
		return "Waiting for your answer"
	case "SendMessage":
		to, _ := input["to"].(string)
		if to != "" {
			return "Messaging " + to
		}
		return "Sending message"
	case "Agent":
		name, _ := input["name"].(string)
		if name != "" {
			return "Spawning " + name
		}
		return "Spawning agent"
	case "EnterPlanMode":
		return "Planning"
	case "NotebookEdit":
		return "Editing notebook"
	default:
		return "Using " + toolName
	}
}

// ── ProcessLine ─────────────────────────────────────────────

// ProcessLine parses a single JSONL line from a transcript file and emits
// AgentEvents through the provided emit function.
func ProcessLine(agentID int, line string, agent *AgentState, emit func(AgentEvent)) {
	if agent == nil {
		return
	}

	var record JsonlRecord
	if err := json.Unmarshal([]byte(line), &record); err != nil {
		return // ignore malformed lines
	}

	switch record.Type {
	case "assistant":
		processAssistant(agentID, agent, &record, emit)
	case "user":
		processUser(agentID, agent, &record, emit)
	case "system":
		if record.Subtype == "turn_duration" {
			processSystemTurnDuration(agentID, agent, emit)
		}
	case "progress":
		processProgress(agentID, agent, &record, emit)
	}
}

// processAssistant handles assistant-type JSONL records.
func processAssistant(agentID int, agent *AgentState, record *JsonlRecord, emit func(AgentEvent)) {
	var msg MessageContent
	if err := json.Unmarshal(record.Message, &msg); err != nil {
		return
	}

	var blocks []ContentBlock
	if err := json.Unmarshal(msg.Content, &blocks); err != nil {
		return
	}

	hasToolUse := false
	hasText := false
	for _, b := range blocks {
		if b.Type == "tool_use" {
			hasToolUse = true
		}
		if b.Type == "text" {
			hasText = true
		}
	}

	if hasToolUse {
		// Cancel waiting state — agent is active
		CancelWaitingTimer(agentID)
		agent.IsWaiting = false
		agent.HadToolsInTurn = true

		emit(AgentEvent{
			Type:    "agentActive",
			AgentID: agentID,
		})

		hasNonExempt := false
		for _, block := range blocks {
			if block.Type == "tool_use" && block.ID != "" {
				toolName := block.Name
				status := FormatToolStatus(toolName, block.Input)

				agent.ActiveToolIDs[block.ID] = struct{}{}
				agent.ActiveToolStatus[block.ID] = status
				agent.ActiveToolNames[block.ID] = toolName

				if !PermissionExemptTools[toolName] {
					hasNonExempt = true
				}

				emit(AgentEvent{
					Type:       "agentToolStart",
					AgentID:    agentID,
					ToolID:     block.ID,
					ToolName:   toolName,
					ToolStatus: status,
				})

				// Emit special events for inter-agent communication tools
				if toolName == "SendMessage" {
					msgTo, _ := block.Input["to"].(string)
					msgText, _ := block.Input["message"].(string)
					if msgTo != "" {
						emit(AgentEvent{
							Type:        "agentMessage",
							AgentID:     agentID,
							ToolName:    "SendMessage",
							ToolID:      block.ID,
							MessageTo:   msgTo,
							MessageText: msgText,
						})
					}
				}
				if toolName == "Agent" {
					spawnName, _ := block.Input["name"].(string)
					spawnDesc, _ := block.Input["description"].(string)
					if spawnName == "" {
						spawnName = spawnDesc
					}
					emit(AgentEvent{
						Type:      "agentSpawned",
						AgentID:   agentID,
						AgentName: spawnName,
					})
				}
			}
		}

		if hasNonExempt {
			StartPermissionTimer(agentID, emit)
		}
	} else if hasText && !agent.HadToolsInTurn {
		// Text-only response in a turn that hasn't used any tools.
		// Start a silence-based timer to detect idle state.
		StartWaitingTimer(agentID, time.Duration(TextIdleDelayMs)*time.Millisecond, emit)
	}
}

// processUser handles user-type JSONL records.
func processUser(agentID int, agent *AgentState, record *JsonlRecord, emit func(AgentEvent)) {
	var msg MessageContent
	if err := json.Unmarshal(record.Message, &msg); err != nil {
		return
	}

	// Try to parse content as array of blocks
	var blocks []ContentBlock
	if err := json.Unmarshal(msg.Content, &blocks); err != nil {
		// Content might be a plain string — treat as new user prompt
		var textContent string
		if err := json.Unmarshal(msg.Content, &textContent); err == nil && textContent != "" {
			// New user text prompt — new turn starting
			CancelWaitingTimer(agentID)
			clearAgentActivity(agent, agentID, emit)
			agent.HadToolsInTurn = false
		}
		return
	}

	hasToolResult := false
	for _, b := range blocks {
		if b.Type == "tool_result" {
			hasToolResult = true
			break
		}
	}

	if hasToolResult {
		for _, block := range blocks {
			if block.Type == "tool_result" && block.ToolUseID != "" {
				delete(agent.ActiveToolIDs, block.ToolUseID)
				delete(agent.ActiveToolStatus, block.ToolUseID)
				delete(agent.ActiveToolNames, block.ToolUseID)

				toolID := block.ToolUseID
				// Emit tool done after a short delay (via timer goroutine)
				time.AfterFunc(time.Duration(ToolDoneDelayMs)*time.Millisecond, func() {
					emit(AgentEvent{
						Type:    "agentToolDone",
						AgentID: agentID,
						ToolID:  toolID,
					})
				})
			}
		}

		// All tools completed — allow text-idle timer as fallback
		if len(agent.ActiveToolIDs) == 0 {
			agent.HadToolsInTurn = false
		}
	} else {
		// New user text prompt — new turn starting
		CancelWaitingTimer(agentID)
		clearAgentActivity(agent, agentID, emit)
		agent.HadToolsInTurn = false
	}
}

// processSystemTurnDuration handles system/turn_duration records.
func processSystemTurnDuration(agentID int, agent *AgentState, emit func(AgentEvent)) {
	CancelWaitingTimer(agentID)
	CancelPermissionTimer(agentID)

	// Definitive turn-end: clean up any stale tool state
	if len(agent.ActiveToolIDs) > 0 {
		agent.ActiveToolIDs = make(map[string]struct{})
		agent.ActiveToolStatus = make(map[string]string)
		agent.ActiveToolNames = make(map[string]string)
		emit(AgentEvent{
			Type:    "agentToolsClear",
			AgentID: agentID,
		})
	}

	agent.IsWaiting = true
	agent.PermissionSent = false
	agent.HadToolsInTurn = false

	emit(AgentEvent{
		Type:    "agentWaiting",
		AgentID: agentID,
		Status:  "waiting",
	})
}

// processProgress handles progress-type records (bash_progress, mcp_progress, agent_progress).
func processProgress(agentID int, agent *AgentState, record *JsonlRecord, emit func(AgentEvent)) {
	parentToolID := record.ParentToolUseID
	if parentToolID == "" {
		return
	}

	if record.Data == nil {
		return
	}

	// Parse the data field to check its type
	var data struct {
		Type string `json:"type"`
	}
	if err := json.Unmarshal(record.Data, &data); err != nil {
		return
	}

	// bash_progress / mcp_progress: tool is actively executing, not stuck on permission.
	// Restart the permission timer to give the running tool another window.
	if data.Type == "bash_progress" || data.Type == "mcp_progress" {
		if _, ok := agent.ActiveToolIDs[parentToolID]; ok {
			StartPermissionTimer(agentID, emit)
		}
		return
	}
}

// clearAgentActivity resets all tool tracking state for an agent.
func clearAgentActivity(agent *AgentState, agentID int, emit func(AgentEvent)) {
	agent.ActiveToolIDs = make(map[string]struct{})
	agent.ActiveToolStatus = make(map[string]string)
	agent.ActiveToolNames = make(map[string]string)
	agent.IsWaiting = false
	agent.PermissionSent = false
	CancelPermissionTimer(agentID)

	emit(AgentEvent{
		Type:    "agentToolsClear",
		AgentID: agentID,
	})
}
