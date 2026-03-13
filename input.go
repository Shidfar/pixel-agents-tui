package main

import (
	"fmt"
	"os"

	"golang.org/x/term"
)

// SetupTerminal enters raw mode, switches to the alternate screen buffer,
// and hides the cursor. Returns the previous terminal state for restoration.
// If raw mode cannot be entered (e.g., stdin is not a terminal), returns nil
// and prints a warning to stderr.
func SetupTerminal() *term.State {
	oldState, err := term.MakeRaw(int(os.Stdin.Fd()))
	if err != nil {
		fmt.Fprintf(os.Stderr, "Warning: could not enter raw mode: %v\n", err)
		return nil
	}
	os.Stdout.WriteString(EnterAltScreen() + HideCursor() + ClearScreen())
	return oldState
}

// RestoreTerminal returns the terminal to its original state. This exits the
// alternate screen buffer, shows the cursor, resets colors, and restores the
// saved terminal mode. It is safe to call with a nil oldState.
func RestoreTerminal(oldState *term.State) {
	os.Stdout.WriteString(ExitAltScreen() + ShowCursor() + ResetColor())
	if oldState != nil {
		term.Restore(int(os.Stdin.Fd()), oldState)
	}
}

// ReadInput reads raw bytes from stdin and translates them into KeyEvent values
// sent on ch. It runs until quit is closed. Recognized keys:
//
//   - q, Q, Ctrl-C  -> KeyEvent{Key: "quit"}
//   - Tab            -> KeyEvent{Key: "tab"}
//   - +, =           -> KeyEvent{Key: "zoom_in"}
//   - -              -> KeyEvent{Key: "zoom_out"}
//   - Arrow keys     -> KeyEvent{Key: "up"/"down"/"left"/"right"}
func ReadInput(ch chan<- KeyEvent, quit <-chan struct{}) {
	buf := make([]byte, 8)
	for {
		select {
		case <-quit:
			return
		default:
		}

		n, err := os.Stdin.Read(buf)
		if err != nil || n == 0 {
			continue
		}

		switch {
		case buf[0] == 'q' || buf[0] == 'Q' || buf[0] == 3: // q/Q or Ctrl-C
			ch <- KeyEvent{Key: "quit", Rune: rune(buf[0])}
		case buf[0] == '\t':
			ch <- KeyEvent{Key: "tab", Rune: '\t'}
		case buf[0] == '+' || buf[0] == '=':
			ch <- KeyEvent{Key: "zoom_in", Rune: rune(buf[0])}
		case buf[0] == '-':
			ch <- KeyEvent{Key: "zoom_out", Rune: '-'}
		case n >= 3 && buf[0] == 27 && buf[1] == '[':
			switch buf[2] {
			case 'A':
				ch <- KeyEvent{Key: "up"}
			case 'B':
				ch <- KeyEvent{Key: "down"}
			case 'C':
				ch <- KeyEvent{Key: "right"}
			case 'D':
				ch <- KeyEvent{Key: "left"}
			}
		}
	}
}
