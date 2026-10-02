// Meridian Reach launcher: a self-contained executable that embeds the game.
// On Windows it opens a native game window (WebView2) that loads the game files
// straight from disk, with no network port involved. Elsewhere, or when WebView2
// is missing, it serves the game on a fixed local port and opens the default
// browser; the fixed port keeps the game's origin, and so its save storage
// (localStorage), the same between runs.
package main

import (
	"embed"
	"fmt"
	"io/fs"
	"net"
	"net/http"
	"os/exec"
	"runtime"
	"strings"
	"sync/atomic"
	"time"
)

//go:embed all:web
var files embed.FS

var version = "dev"

const (
	port  = 27183
	title = "Meridian Reach"
)

var gameURL = fmt.Sprintf("http://127.0.0.1:%d/", port)

// In browser mode the page sends a heartbeat; the launcher exits about a minute
// after the game tab is closed.
var lastBeat atomic.Int64

const heartbeat = `<script>setInterval(function(){fetch('/__alive',{cache:'no-store'}).catch(function(){})},5000);fetch('/__alive').catch(function(){});</script>`

func main() { show() } // platform-specific: returns when the game is closed

func gameFiles() fs.FS {
	web, err := fs.Sub(files, "web")
	if err != nil {
		fail(err)
	}
	return web
}

// runInBrowser serves the game on the local port, opens it in the default
// browser and blocks until the tab has been closed for a minute.
func runInBrowser() {
	ln, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", port))
	if err != nil {
		if running() {
			openBrowser(gameURL)
			return
		}
		fail(fmt.Errorf("port %d is in use by another program (an older Meridian Reach may still be running: end MeridianReach.exe in Task Manager): %w", port, err))
	}
	go serve(ln)
	fmt.Println("Meridian Reach is running at", gameURL, "- close the game tab to quit.")
	openBrowser(gameURL)
	for range time.Tick(10 * time.Second) {
		b := lastBeat.Load()
		if b > 0 && time.Now().Unix()-b > 60 {
			return
		}
	}
}

func serve(ln net.Listener) {
	web := gameFiles()
	mux := http.NewServeMux()
	static := http.FileServer(http.FS(web))
	mux.HandleFunc("/__alive", func(w http.ResponseWriter, r *http.Request) {
		lastBeat.Store(time.Now().Unix())
		w.Header().Set("X-Meridian-Reach", version)
		w.WriteHeader(http.StatusNoContent)
	})
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Cache-Control", "no-cache")
		if r.URL.Path == "/" || r.URL.Path == "/index.html" {
			page, err := fs.ReadFile(web, "index.html")
			if err != nil {
				http.Error(w, "missing index.html", 500)
				return
			}
			html := strings.Replace(string(page), "</body>", heartbeat+"</body>", 1)
			w.Header().Set("Content-Type", "text/html; charset=utf-8")
			_, _ = w.Write([]byte(html))
			return
		}
		static.ServeHTTP(w, r)
	})
	if err := http.Serve(ln, mux); err != nil {
		fail(err)
	}
}

// running reports whether another Meridian Reach launcher already owns the port.
func running() bool {
	c := http.Client{Timeout: 2 * time.Second}
	resp, err := c.Get(gameURL + "__alive")
	if err != nil {
		return false
	}
	resp.Body.Close()
	return resp.Header.Get("X-Meridian-Reach") != ""
}

func openBrowser(url string) {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	case "darwin":
		cmd = exec.Command("open", url)
	default:
		cmd = exec.Command("xdg-open", url)
	}
	_ = cmd.Start()
}
