//go:build !windows

package main

import (
	"fmt"
	"os"
)

// show opens the game in the default browser (native windows are Windows-only for now).
func show() { runInBrowser() }

func fail(err error) {
	fmt.Fprintln(os.Stderr, "Meridian Reach:", err)
	os.Exit(1)
}
