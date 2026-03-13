package main

import (
	"sync"
	"time"
)

// ── Timer state ─────────────────────────────────────────────
// Timers fire from their own goroutines and call the provided emit function
// to send events. The timer maps are protected by a mutex since timers
// are started/cancelled from multiple goroutines.

var (
	waitingTimers    = make(map[int]*time.Timer)
	permissionTimers = make(map[int]*time.Timer)
	timerMu          sync.Mutex
)

// StartWaitingTimer starts (or restarts) a waiting timer for the given agent.
// When the timer fires, it calls emit with an "agentWaiting" event.
func StartWaitingTimer(agentID int, delay time.Duration, emit func(AgentEvent)) {
	timerMu.Lock()
	defer timerMu.Unlock()

	// Cancel existing timer if any
	if t, ok := waitingTimers[agentID]; ok {
		t.Stop()
		delete(waitingTimers, agentID)
	}

	timer := time.AfterFunc(delay, func() {
		timerMu.Lock()
		delete(waitingTimers, agentID)
		timerMu.Unlock()

		emit(AgentEvent{
			Type:    "agentWaiting",
			AgentID: agentID,
			Status:  "waiting",
		})
	})
	waitingTimers[agentID] = timer
}

// CancelWaitingTimer cancels a pending waiting timer for the given agent.
func CancelWaitingTimer(agentID int) {
	timerMu.Lock()
	defer timerMu.Unlock()

	if t, ok := waitingTimers[agentID]; ok {
		t.Stop()
		delete(waitingTimers, agentID)
	}
}

// StartPermissionTimer starts (or restarts) a permission timer for the given agent.
// When the timer fires, it calls emit with an "agentToolPermission" event.
// The actual permission check (verifying non-exempt tools remain active) is
// handled by the event consumer in the main loop.
func StartPermissionTimer(agentID int, emit func(AgentEvent)) {
	timerMu.Lock()
	defer timerMu.Unlock()

	// Cancel existing timer if any
	if t, ok := permissionTimers[agentID]; ok {
		t.Stop()
		delete(permissionTimers, agentID)
	}

	timer := time.AfterFunc(time.Duration(PermissionTimerMs)*time.Millisecond, func() {
		timerMu.Lock()
		delete(permissionTimers, agentID)
		timerMu.Unlock()

		emit(AgentEvent{
			Type:    "agentToolPermission",
			AgentID: agentID,
		})
	})
	permissionTimers[agentID] = timer
}

// CancelPermissionTimer cancels a pending permission timer for the given agent.
func CancelPermissionTimer(agentID int) {
	timerMu.Lock()
	defer timerMu.Unlock()

	if t, ok := permissionTimers[agentID]; ok {
		t.Stop()
		delete(permissionTimers, agentID)
	}
}

// CancelAllTimers cancels both waiting and permission timers for the given agent.
func CancelAllTimers(agentID int) {
	CancelWaitingTimer(agentID)
	CancelPermissionTimer(agentID)
}
