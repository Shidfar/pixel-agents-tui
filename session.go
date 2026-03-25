package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"
)

// AgentRegistry provides thread-safe access to the agents map.
// Map-level access is protected by a RWMutex. Individual AgentState
// fields don't need locking since each agent is only written by its
// own WatchFile goroutine.
type AgentRegistry struct {
	mu     sync.RWMutex
	agents map[int]*AgentState
}

func NewAgentRegistry() *AgentRegistry {
	return &AgentRegistry{agents: make(map[int]*AgentState)}
}

func (r *AgentRegistry) Get(id int) (*AgentState, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	a, ok := r.agents[id]
	return a, ok
}

func (r *AgentRegistry) Set(id int, agent *AgentState) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.agents[id] = agent
}

// ResolveProjectDir finds the Claude Code project directory.
// If an explicit path is given, use it directly.
// Otherwise, look for the most recently modified project dir under ~/.claude/projects/.
func ResolveProjectDir(explicit string) string {
	if explicit != "" {
		return explicit
	}

	home, err := os.UserHomeDir()
	if err != nil {
		return ""
	}
	projectsDir := filepath.Join(home, ".claude", "projects")

	entries, err := os.ReadDir(projectsDir)
	if err != nil {
		return ""
	}

	var best string
	var bestTime time.Time
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		info, err := e.Info()
		if err != nil {
			continue
		}
		if info.ModTime().After(bestTime) {
			bestTime = info.ModTime()
			best = filepath.Join(projectsDir, e.Name())
		}
	}
	return best
}

// FindJsonlFiles returns all .jsonl files in a directory and its subdirectories,
// sorted by modification time (newest first). Claude Code stores sessions in both
// the project dir and subdirectories. Agent team subagents are stored in
// {session-uuid}/subagents/agent-{hash}.jsonl.
func FindJsonlFiles(dir string) []string {
	// Search top-level, one level deep, and subagents directories
	topLevel, _ := filepath.Glob(filepath.Join(dir, "*.jsonl"))
	nested, _ := filepath.Glob(filepath.Join(dir, "*", "*.jsonl"))
	subagents, _ := filepath.Glob(filepath.Join(dir, "*", "subagents", "*.jsonl"))
	matches := append(topLevel, nested...)
	matches = append(matches, subagents...)

	sort.Slice(matches, func(i, j int) bool {
		fi, _ := os.Stat(matches[i])
		fj, _ := os.Stat(matches[j])
		if fi == nil || fj == nil {
			return false
		}
		return fi.ModTime().After(fj.ModTime())
	})
	return matches
}

// maxAgents is the maximum number of agents to create from discovered JSONL files.
// Set high enough to accommodate a team session (1 lead + several subagents) plus
// other concurrent sessions, but low enough to not overwhelm the map.
const maxAgents = 12

// recentFileThreshold is the maximum age of a JSONL file to be considered active.
// Files not modified within this window are treated as dead sessions and skipped.
const recentFileThreshold = 10 * time.Minute

// agentNameFromID returns a short friendly name for a given agent number.
func agentNameFromID(id int) string {
	// Short names that render well in the 3x5 pixel font at ~3x downscale
	names := []string{"Alpha", "Beta", "Gamma", "Delta", "Sigma", "Omega", "Zeta", "Theta", "Kappa", "Lambda"}
	if id >= 1 && id <= len(names) {
		return names[id-1]
	}
	return "Agent"
}

// teammateNameRe matches "You are [{name}]" in teammate prompts.
var teammateNameRe = regexp.MustCompile(`You are \[([^\]]+)\]`)

// teamLeadRe detects TeamCreate tool calls, indicating this agent is a team lead.
var teamLeadRe = regexp.MustCompile(`"TeamCreate"`)

// extractAgentName reads the JSONL file and tries to extract the agent's name.
// For subagent files: looks for "You are [{name}]" in the first record's prompt.
// For main session files: scans for TeamCreate tool calls (→ "team-lead").
func extractAgentName(path string) string {
	f, err := os.Open(path)
	if err != nil {
		return ""
	}
	defer f.Close()

	// Read up to 64KB — teammate prompts can be very long
	buf := make([]byte, 65536)
	n, _ := f.Read(buf)
	if n == 0 {
		return ""
	}

	content := string(buf[:n])

	// Strategy 1: Find "You are [{name}]" in the first line (subagent teammate prompt)
	firstLine := content
	if idx := strings.IndexByte(firstLine, '\n'); idx >= 0 {
		firstLine = firstLine[:idx]
	}

	var record struct {
		Message struct {
			Content json.RawMessage `json:"content"`
		} `json:"message"`
	}
	if err := json.Unmarshal([]byte(firstLine), &record); err == nil {
		var textContent string
		if err := json.Unmarshal(record.Message.Content, &textContent); err == nil {
			if m := teammateNameRe.FindStringSubmatch(textContent); len(m) > 1 {
				return m[1]
			}
		}
	}

	// Strategy 2: Scan for TeamCreate tool calls — if found, this is a team lead
	if teamLeadRe.MatchString(content) {
		return "team-lead"
	}

	return ""
}

// WatchSessions monitors a project directory for JSONL transcript files and
// starts file watchers for each one. If sessionFile is set, only that single
// file is watched. Otherwise, the directory is scanned periodically for new
// files. Only the most recent files (up to maxAgents) are watched, and files
// not modified in the last 10 minutes are skipped as dead sessions.
func WatchSessions(projectDir string, sessionFile string, events chan<- AgentEvent, quit <-chan struct{}) {
	known := make(map[string]bool)
	nextAgentID := 1
	agentCount := 0
	registry := NewAgentRegistry()

	if sessionFile != "" {
		// Watch a single specific file
		agent := NewAgentState(nextAgentID, sessionFile)
		registry.Set(nextAgentID, agent)
		events <- AgentEvent{Type: "agentCreated", AgentID: nextAgentID, AgentName: agentNameFromID(nextAgentID)}
		go WatchFile(nextAgentID, sessionFile, registry, events, quit)
		<-quit
		return
	}

	// Periodic scan for new JSONL files
	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()

	scan := func() {
		files := FindJsonlFiles(projectDir) // already sorted newest-first
		now := time.Now()

		// Only consider files up to the maxAgents cap
		limit := maxAgents
		if limit > len(files) {
			limit = len(files)
		}
		files = files[:limit]

		for _, f := range files {
			if known[f] {
				continue
			}
			// Skip files that haven't been modified recently (dead sessions)
			info, err := os.Stat(f)
			if err != nil {
				continue
			}
			if now.Sub(info.ModTime()) > recentFileThreshold {
				continue
			}
			// Enforce the agent cap
			if agentCount >= maxAgents {
				break
			}
			known[f] = true
			id := nextAgentID
			nextAgentID++
			agentCount++
			agent := NewAgentState(id, f)
			registry.Set(id, agent)

			// Try to extract the real agent name from JSONL content
			name := agentNameFromID(id)
			if extracted := extractAgentName(f); extracted != "" {
				name = extracted
			}

			events <- AgentEvent{Type: "agentCreated", AgentID: id, AgentName: name}
			go WatchFile(id, f, registry, events, quit)
		}
	}

	scan() // initial scan

	for {
		select {
		case <-ticker.C:
			scan()
		case <-quit:
			return
		}
	}
}
