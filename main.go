package main

import (
	"flag"
	"fmt"
	"os"
	"os/signal"
	"syscall"
	"time"
)

// LabelsEnabled controls whether agent name labels are rendered above characters.
var LabelsEnabled = true

func main() {
	projectDir := flag.String("project-dir", "", "Claude Code project directory (default: auto-detect from ~/.claude/projects/)")
	sessionFile := flag.String("session", "", "Specific JSONL session file to watch")
	demo := flag.Bool("demo", false, "Run with fake demo agents (no JSONL needed)")
	fps := flag.Int("fps", 10, "Frames per second (1-30)")
	layoutFile := flag.String("layout", "", "Path to custom office layout JSON file")
	themeName := flag.String("theme", "default", "Color theme: default, warm, cool, dark, light")
	noSound := flag.Bool("no-sound", false, "Disable terminal bell on permission requests")
	noLabels := flag.Bool("no-labels", false, "Disable agent name labels above characters")
	noParticles := flag.Bool("no-particles", false, "Disable network activity particle effects")
	flag.Parse()

	if *fps < 1 {
		*fps = 1
	}
	if *fps > 30 {
		*fps = 30
	}

	// Apply flags to globals
	if *noSound {
		SoundEnabled = false
	}
	if *noLabels {
		LabelsEnabled = false
	}
	if *noParticles {
		ParticlesEnabled = false
	}

	// Setup terminal (raw mode + alt screen + hide cursor)
	oldState := SetupTerminal()
	defer RestoreTerminal(oldState)

	// Signal handling
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM, syscall.SIGWINCH)

	// Channels
	events := make(chan AgentEvent, 64)
	inputCh := make(chan KeyEvent, 16)
	quit := make(chan struct{})

	// Start goroutines
	if *demo {
		fmt.Fprintf(os.Stderr, "Demo mode\n")
		go RunDemo(events, quit)
	} else {
		dir := ResolveProjectDir(*projectDir)
		if dir == "" {
			RestoreTerminal(oldState)
			fmt.Fprintf(os.Stderr, "Error: could not find Claude Code project directory.\n")
			fmt.Fprintf(os.Stderr, "Run from a project with Claude Code, or pass --project-dir.\n")
			os.Exit(1)
		}
		fmt.Fprintf(os.Stderr, "Watching: %s\n", dir)
		go WatchSessions(dir, *sessionFile, events, quit)
	}
	go ReadInput(inputCh, quit)

	// Load layout
	var layout OfficeLayout
	if *layoutFile != "" {
		var err error
		layout, err = LoadLayout(*layoutFile)
		if err != nil {
			RestoreTerminal(oldState)
			fmt.Fprintf(os.Stderr, "Error loading layout: %v\n", err)
			os.Exit(1)
		}
	} else {
		layout = DefaultLayout()
	}

	// Create office
	office := NewOffice(layout)
	office.Theme = FindTheme(*themeName)
	renderer := NewRenderer(os.Stdout)

	// Game loop
	ticker := time.NewTicker(time.Duration(1000/(*fps)) * time.Millisecond)
	defer ticker.Stop()
	lastTick := time.Now()

	for {
		select {
		case ev := <-events:
			office.HandleEvent(ev)
		case key := <-inputCh:
			if key.Key == "quit" {
				return
			}
			office.HandleInput(key)
		case now := <-ticker.C:
			dt := now.Sub(lastTick).Seconds()
			if dt > 0.2 {
				dt = 0.2 // cap delta time to prevent huge jumps
			}
			lastTick = now
			office.Update(dt)
			renderer.Render(office)
		case sig := <-sigCh:
			if sig == syscall.SIGWINCH {
				// Terminal resized — renderer will auto-detect on next frame
				continue
			}
			return // SIGINT/SIGTERM
		case <-quit:
			return
		}
	}
}
