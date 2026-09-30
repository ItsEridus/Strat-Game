//go:build windows

package main

import (
	"io/fs"
	"os"
	"path/filepath"
	"reflect"
	"sync"
	"time"
	"unsafe"

	webview2 "github.com/jchv/go-webview2"
	"github.com/jchv/go-webview2/pkg/edge"
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
	procCreateMutex    = windows.NewLazySystemDLL("kernel32.dll").NewProc("CreateMutexW")
	procPostMessage    = user32.NewProc("PostMessageW")
)

const (
	swRestore   = 9
	swMaximize  = 3
	wmClose     = 0x0010
	gwlpWndProc = ^uintptr(3) // -4
	// The game is served to the window from this virtual host, which maps to the
	// extracted game files. A fixed origin keeps the saves in one place.
	gameHost = "meridian-reach.example"
)

// show opens the game in a native window, or in the browser when the WebView2
// runtime is not installed (e.g. Windows 7/8 without Edge).
func show() {
	afterUpdate := len(os.Args) > 1 && os.Args[1] == "--after-update"
	name, _ := windows.UTF16PtrFromString("Local\\MeridianReachGame")
	// One game at a time: a second launch brings the open window to the front.
	// Right after an update the old copy is still closing, so wait for it instead.
	for i := 0; ; i++ {
		h, _, err := procCreateMutex.Call(0, 0, uintptr(unsafe.Pointer(name)))
		if h == 0 || err != windows.ERROR_ALREADY_EXISTS {
			break
		}
		if !afterUpdate || i > 80 {
			focusRunning()
			return
		}
		windows.CloseHandle(windows.Handle(h))
		time.Sleep(250 * time.Millisecond)
	}
	cleanupOld()
	// An update downloaded last time is installed before the game opens.
	if !afterUpdate && autoUpdates() {
		if p, _ := readyUpdate(); p != "" && installUpdate() == nil {
			return
		}
	}
	go checkForUpdate()
	if v, err := webviewloader.GetInstalledVersion(); err != nil || v == "" {
		runInBrowser()
		return
	}
	home := filepath.Join(localAppData(), "MeridianReach")
	gameDir := filepath.Join(home, "game")
	if err := extract(gameDir); err != nil {
		fail(err)
	}
	w := webview2.NewWithOptions(webview2.WebViewOptions{
		DataPath:  filepath.Join(home, "WebView"),
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
	quit := saveOnClose(w, hwnd)
	bindUpdater(w, quit)
	if c := chromium(w); c != nil && c.GetICoreWebView2_3() != nil &&
		c.GetICoreWebView2_3().SetVirtualHostNameToFolderMapping(gameHost, gameDir, edge.COREWEBVIEW2_HOST_RESOURCE_ACCESS_KIND_ALLOW) == nil {
		w.Navigate("https://" + gameHost + "/index.html")
	} else {
		// Very old WebView2 runtime: load the files directly.
		w.Navigate("file:///" + filepath.ToSlash(filepath.Join(gameDir, "index.html")))
	}
	w.Run()
}

// extract writes the embedded game files to dir (replacing an older version).
func extract(dir string) error {
	web := gameFiles()
	_ = os.RemoveAll(dir)
	return fs.WalkDir(web, ".", func(p string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}
		dst := filepath.Join(dir, filepath.FromSlash(p))
		if d.IsDir() {
			return os.MkdirAll(dst, 0o755)
		}
		b, err := fs.ReadFile(web, p)
		if err != nil {
			return err
		}
		return os.WriteFile(dst, b, 0o644)
	})
}

// chromium returns the WebView2 controller behind w. go-webview2 keeps it in an
// unexported field; it is needed to map the virtual host.
func chromium(w webview2.WebView) *edge.Chromium {
	v := reflect.ValueOf(w)
	if v.Kind() != reflect.Ptr || v.Elem().Kind() != reflect.Struct {
		return nil
	}
	f := v.Elem().FieldByName("browser")
	if !f.IsValid() {
		return nil
	}
	c, _ := reflect.NewAt(f.Type(), unsafe.Pointer(f.UnsafeAddr())).Elem().Interface().(*edge.Chromium)
	return c
}

// saveOnClose makes the window's close button autosave the campaign before the
// window goes away: the game saves on 'beforeunload', which WebView2 does not
// fire when its host window is destroyed.
func saveOnClose(w webview2.WebView, hwnd uintptr) func() {
	var once sync.Once
	quit := func() {
		once.Do(func() {
			// Give the browser process a moment to flush the save to disk.
			time.Sleep(300 * time.Millisecond)
			w.Dispatch(w.Terminate)
		})
	}
	_ = w.Bind("__meridianClosed", func() { go quit() })
	var prev uintptr
	proc := windows.NewCallback(func(h, msg, wp, lp uintptr) uintptr {
		if msg == wmClose {
			// The game saves (asynchronously, it can take a few seconds for a big world), then reports back.
			w.Eval(`(async()=>{try{if(window.__meridianSave)await window.__meridianSave();else dispatchEvent(new Event('beforeunload'))}catch(e){}window.__meridianClosed();})()`)
			go func() { time.Sleep(20 * time.Second); quit() }() // page unresponsive: close anyway
			return 0
		}
		r, _, _ := procCallWindowProc.Call(prev, h, msg, wp, lp)
		return r
	})
	prev, _, _ = procSetWindowLong.Call(hwnd, gwlpWndProc, proc)
	return func() { procPostMessage.Call(hwnd, wmClose, 0, 0) }
}

// bindUpdater lets the game page read the update status, switch automatic
// updates on or off, restart into a ready update, or open the download page.
func bindUpdater(w webview2.WebView, closeWindow func()) {
	_ = w.Bind("__meridianUpdate", func() string { return statusJSON() })
	_ = w.Bind("__meridianSetAutoUpdate", func(on bool) string { setAutoUpdates(on); return statusJSON() })
	_ = w.Bind("__meridianOpenDownloads", func() { openBrowser(releasesPage) })
	_ = w.Bind("__meridianCheckUpdate", func() string { go checkForUpdate(); return statusJSON() })
	_ = w.Bind("__meridianRestartToUpdate", func() string {
		// Install first (the game saves on close); if that fails, stay open and report why.
		if err := installUpdate(); err != nil {
			setStatus(func(s *UpdateStatus) { s.State = "manual"; s.Error = err.Error() })
			return statusJSON()
		}
		closeWindow()
		return statusJSON()
	})
}

// focusRunning brings the already-open game window to the front.
func focusRunning() {
	cls, _ := windows.UTF16PtrFromString("webview")
	name, _ := windows.UTF16PtrFromString(title)
	if h, _, _ := procFindWindow.Call(uintptr(unsafe.Pointer(cls)), uintptr(unsafe.Pointer(name))); h != 0 {
		procShowWindow.Call(h, swRestore)
		procSetForeground.Call(h)
		return
	}
	openBrowser(gameURL) // the other instance is in browser mode
}

func localAppData() string {
	if d := os.Getenv("LOCALAPPDATA"); d != "" {
		return d
	}
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
