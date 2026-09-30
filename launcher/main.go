// Meridian Reach launcher: a self-contained Windows (or any OS) executable that
// serves the embedded game on a fixed local port and opens it in the default
// browser. The fixed port keeps the browser's save storage (localStorage) the
// same between runs. The launcher exits about a minute after the game tab is
// closed (the page sends a heartbeat), or when its window is closed.
package main

import (
	"embed"
	"fmt"
	"io/fs"
	"net"
	"net/http"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"sync/atomic"
	"time"
)

//go:embed all:web
var files embed.FS

var version = "dev"

const port = 27183

var lastBeat atomic.Int64

const heartbeat = `<script>setInterval(function(){fetch('/__alive',{cache:'no-store'}).catch(function(){})},5000);fetch('/__alive').catch(function(){});</script>`

func main() {
	web, err := fs.Sub(files, "web")
	if err != nil {
		fail(err)
	}
	ln, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", port))
	if err != nil {
		// Already running: just open the browser on the existing instance.
		openBrowser(fmt.Sprintf("http://127.0.0.1:%d/", port))
		return
	}
	mux := http.NewServeMux()
	static := http.FileServer(http.FS(web))
	mux.HandleFunc("/__alive", func(w http.ResponseWriter, r *http.Request) {
		lastBeat.Store(time.Now().Unix())
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
	go func() {
		// Exit once the game tab has been gone for a minute (after it first connected).
		for range time.Tick(10 * time.Second) {
			b := lastBeat.Load()
			if b > 0 && time.Now().Unix()-b > 60 {
				os.Exit(0)
			}
		}
	}()
	url := fmt.Sprintf("http://127.0.0.1:%d/", port)
	fmt.Println("Meridian Reach is running at", url, "- close the game tab to quit.")
	go openBrowser(url)
	if err := http.Serve(ln, mux); err != nil {
		fail(err)
	}
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

func fail(err error) {
	fmt.Fprintln(os.Stderr, "Meridian Reach:", err)
	os.Exit(1)
}
