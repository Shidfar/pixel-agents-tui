package main

import "os"

// SoundEnabled controls whether the terminal bell is used for notifications.
var SoundEnabled = true

// RingBell writes a BEL character (\a) to stdout, triggering the terminal bell.
func RingBell() {
	if SoundEnabled {
		os.Stdout.Write([]byte("\a"))
	}
}
