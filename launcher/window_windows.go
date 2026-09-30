//go:build windows

package main

import (
	"os"
	"path/filepath"
	"sync"
	"time"
	"unsafe"

	webview2 "github.com/jchv/go-webview2"
	"github.com/jchv/go-webview2/webviewloader"
	"golang.org/x/sys/windows"
)

var (
	user32             = windows.NewLazySystemDLL("user32.dll")
	procShowWindow     = user32.NewProc("ShowWindow")
	procSetForeground  = user32.NewProc("SetForegroundWindow")
	procFindWindow     = user32.NewProc("FindWindowW")
	procSetWindowLong  = user32.NewProc("SetWindowLongPtrW")
	procCallWindowProc = user32.NewProc("CallWindowProcW")
)

const (
	swRestore   = 9
	swMaximize  = 3
	wmClose     = 0x0010
	gwlpWndProc = ^uintptr(3) // -4
)

// show opens the game in a native window, or in the browser when the WebView2
// runtime is not installed (e.g. Windows 7/8 without Edge).
func show(url string) {
	if v, err := webviewloader.GetInstalledVersion(); err != nil || v == "" {
		runInBrowser()
		return
	}
	data := filepath.Join(appData(), "MeridianReach")
	_ = os.MkdirAll(data, 0o755)
	w := webview2.NewWithOptions(webview2.WebViewOptions{
		DataPath:  data,
		AutoFocus: true,
		WindowOptions: webview2.WindowOptions{
			Title:  title,
			Width:  1280,
			Height: 800,
			IconId: 1, // the icon resource embedded by go-winres (rsrc_windows_*.syso)
			Center: true,
		},
	})
	if w == nil {
		runInBrowser()
		return
	}
	defer w.Destroy()
	hwnd := uintptr(w.Window())
	procShowWindow.Call(hwnd, swMaximize)
	saveOnClose(w, hwnd)
	w.Navigate(url)
	w.Run()
}

// saveOnClose makes the window's close button autosave the campaign before the
// window goes away: the game saves on 'beforeunload', which WebView2 does not
// fire when its host window is destroyed.
func saveOnClose(w webview2.WebView, hwnd uintptr) {
	var once sync.Once
	quit := func() {
		once.Do(func() {
			// Give the browser process a moment to commit the save to disk.
			time.Sleep(500 * time.Millisecond)
			w.Dispatch(w.Terminate)
		})
	}
	_ = w.Bind("__meridianClosed", func() { go quit() })
	var prev uintptr
	proc := windows.NewCallback(func(h, msg, wp, lp uintptr) uintptr {
		if msg == wmClose {
			w.Eval(`try{dispatchEvent(new Event('beforeunload'))}catch(e){}window.__meridianClosed();`)
			go func() { time.Sleep(3 * time.Second); quit() }() // page unresponsive: close anyway
			return 0
		}
		r, _, _ := procCallWindowProc.Call(prev, h, msg, wp, lp)
		return r
	})
	prev, _, _ = procSetWindowLong.Call(hwnd, gwlpWndProc, proc)
}

// alreadyRunning brings the existing game window to the front.
func alreadyRunning() {
	cls, _ := windows.UTF16PtrFromString("webview")
	name, _ := windows.UTF16PtrFromString(title)
	if h, _, _ := procFindWindow.Call(uintptr(unsafe.Pointer(cls)), uintptr(unsafe.Pointer(name))); h != 0 {
		procShowWindow.Call(h, swRestore)
		procSetForeground.Call(h)
		return
	}
	openBrowser(gameURL) // the other instance is in browser mode
}

func appData() string {
	if d, err := os.UserConfigDir(); err == nil {
		return d
	}
	return os.TempDir()
}

func fail(err error) {
	text, _ := windows.UTF16PtrFromString("Meridian Reach could not start:\n\n" + err.Error())
	cap, _ := windows.UTF16PtrFromString(title)
	windows.MessageBox(0, text, cap, windows.MB_OK|windows.MB_ICONERROR)
	os.Exit(1)
}
