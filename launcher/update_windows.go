//go:build windows

// Auto-update for the Windows game. On start the launcher asks GitHub for the
// latest release; if it is newer than this build it downloads MeridianReach.exe
// in the background, checks it against the release's published SHA-256, and
// keeps it ready. The game shows "Update ready — restart"; restarting (or simply
// the next launch) swaps the new EXE in place of this one and starts it. The
// running EXE is renamed aside (Windows allows renaming a running program) and
// removed on the following start. If the folder is not writable the game offers
// the download page instead.
package main

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

const (
	releasesAPI  = "https://api.github.com/repos/ItsEridus/Strat-Game/releases/latest"
	releasesPage = "https://github.com/ItsEridus/Strat-Game/releases/latest"
	exeAsset     = "MeridianReach.exe"
)

// UpdateStatus is what the game page sees (via the bound __meridianUpdate function).
type UpdateStatus struct {
	State   string `json:"state"` // off, checking, current, downloading, ready, manual, error
	Current string `json:"current"`
	Latest  string `json:"latest,omitempty"`
	Notes   string `json:"notes,omitempty"`
	Error   string `json:"error,omitempty"`
	Page    string `json:"page"`
	Auto    bool   `json:"auto"`
}

var (
	upMu     sync.Mutex
	upStatus = UpdateStatus{State: "checking", Current: version, Page: releasesPage, Auto: true}
)

func setStatus(f func(s *UpdateStatus)) { upMu.Lock(); f(&upStatus); upMu.Unlock() }
func getStatus() UpdateStatus         { upMu.Lock(); defer upMu.Unlock(); return upStatus }

func updateDir() string { return filepath.Join(localAppData(), "MeridianReach", "update") }
func autoOffFile() string { return filepath.Join(localAppData(), "MeridianReach", "no-auto-update") }

func autoUpdates() bool { _, err := os.Stat(autoOffFile()); return err != nil }

// setAutoUpdates turns automatic checks on or off (remembered across launches).
func setAutoUpdates(on bool) {
	_ = os.MkdirAll(filepath.Dir(autoOffFile()), 0o755)
	if on {
		_ = os.Remove(autoOffFile())
	} else {
		_ = os.WriteFile(autoOffFile(), []byte("off"), 0o644)
	}
	setStatus(func(s *UpdateStatus) { s.Auto = on })
	if on && getStatus().State == "off" {
		go checkForUpdate()
	}
}

// cleanupOld removes the EXE left aside by the previous update.
func cleanupOld() {
	if exe, err := os.Executable(); err == nil {
		for i := 0; i < 20; i++ {
			if err := os.Remove(exe + ".old"); err == nil || os.IsNotExist(err) {
				break
			}
			time.Sleep(250 * time.Millisecond)
		}
	}
}

type release struct {
	Tag    string `json:"tag_name"`
	Body   string `json:"body"`
	Assets []struct {
		Name string `json:"name"`
		URL  string `json:"browser_download_url"`
		Size int64  `json:"size"`
	} `json:"assets"`
}

var client = &http.Client{Timeout: 5 * time.Minute}

func getJSON(url string, v any) error {
	req, _ := http.NewRequest("GET", url, nil)
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", "MeridianReach/"+version)
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return fmt.Errorf("GitHub answered %s", resp.Status)
	}
	return json.NewDecoder(resp.Body).Decode(v)
}

// readyUpdate returns a verified downloaded update newer than this build, if any.
func readyUpdate() (path, tag string) {
	entries, _ := os.ReadDir(updateDir())
	for _, e := range entries {
		n := e.Name()
		if !strings.HasPrefix(n, "MeridianReach-") || !strings.HasSuffix(n, ".exe") {
			continue
		}
		t := strings.TrimSuffix(strings.TrimPrefix(n, "MeridianReach-"), ".exe")
		if newer(t, version) && (tag == "" || newer(t, tag)) {
			path, tag = filepath.Join(updateDir(), n), t
		}
	}
	return
}

// checkForUpdate looks for a newer release and downloads it (background).
func checkForUpdate() {
	if parseVer(version) == nil { // development build
		setStatus(func(s *UpdateStatus) { s.State = "current" })
		return
	}
	if !autoUpdates() {
		setStatus(func(s *UpdateStatus) { s.State = "off"; s.Auto = false })
		return
	}
	if p, tag := readyUpdate(); p != "" {
		setStatus(func(s *UpdateStatus) { s.State = "ready"; s.Latest = tag })
		return
	}
	setStatus(func(s *UpdateStatus) { s.State = "checking" })
	var rel release
	if err := getJSON(releasesAPI, &rel); err != nil {
		setStatus(func(s *UpdateStatus) { s.State = "error"; s.Error = "Could not check for updates (offline?)." })
		return
	}
	if !newer(rel.Tag, version) {
		setStatus(func(s *UpdateStatus) { s.State = "current"; s.Latest = rel.Tag })
		return
	}
	notes := rel.Body
	if len(notes) > 1500 {
		notes = notes[:1500] + "…"
	}
	setStatus(func(s *UpdateStatus) { s.State = "downloading"; s.Latest = rel.Tag; s.Notes = notes })
	if err := download(rel); err != nil {
		setStatus(func(s *UpdateStatus) { s.State = "manual"; s.Error = err.Error() })
		return
	}
	setStatus(func(s *UpdateStatus) { s.State = "ready" })
}

func download(rel release) error {
	var exeURL, sumURL string
	var size int64
	for _, a := range rel.Assets {
		switch a.Name {
		case exeAsset:
			exeURL, size = a.URL, a.Size
		case exeAsset + ".sha256":
			sumURL = a.URL
		}
	}
	if exeURL == "" || sumURL == "" {
		return errors.New("the release has no verifiable Windows download")
	}
	want, err := fetchSum(sumURL)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(updateDir(), 0o755); err != nil {
		return err
	}
	tmp := filepath.Join(updateDir(), "download.tmp")
	f, err := os.Create(tmp)
	if err != nil {
		return err
	}
	req, _ := http.NewRequest("GET", exeURL, nil)
	req.Header.Set("User-Agent", "MeridianReach/"+version)
	resp, err := client.Do(req)
	if err != nil {
		f.Close()
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		f.Close()
		return fmt.Errorf("download failed: %s", resp.Status)
	}
	h := sha256.New()
	n, err := io.Copy(io.MultiWriter(f, h), resp.Body)
	f.Close()
	if err != nil {
		return err
	}
	if size > 0 && n != size {
		_ = os.Remove(tmp)
		return errors.New("the download was incomplete")
	}
	if got := hex.EncodeToString(h.Sum(nil)); got != want {
		_ = os.Remove(tmp)
		return errors.New("the download did not match its checksum")
	}
	return os.Rename(tmp, filepath.Join(updateDir(), "MeridianReach-"+rel.Tag+".exe"))
}

func fetchSum(url string) (string, error) {
	req, _ := http.NewRequest("GET", url, nil)
	req.Header.Set("User-Agent", "MeridianReach/"+version)
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	b, err := io.ReadAll(io.LimitReader(resp.Body, 1024))
	if err != nil {
		return "", err
	}
	sum := strings.ToLower(strings.Fields(string(b) + " x")[0])
	if len(sum) != 64 {
		return "", errors.New("the release checksum is malformed")
	}
	return sum, nil
}

// installUpdate puts the downloaded EXE in place of this one and starts it.
// Returns an error (and leaves everything as it was) if that is not possible.
func installUpdate() error {
	src, tag := readyUpdate()
	if src == "" {
		return errors.New("no update is ready")
	}
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	_ = os.Remove(exe + ".old")
	if err := os.Rename(exe, exe+".old"); err != nil {
		return fmt.Errorf("cannot replace the game in %s (move MeridianReach.exe to a folder you can write to, or download %s manually)", filepath.Dir(exe), tag)
	}
	if err := copyFile(src, exe); err != nil {
		_ = os.Rename(exe+".old", exe) // roll back
		return err
	}
	_ = os.Remove(src)
	cmd := exec.Command(exe, "--after-update")
	cmd.Dir = filepath.Dir(exe)
	if err := cmd.Start(); err != nil {
		_ = os.Remove(exe)
		_ = os.Rename(exe+".old", exe)
		return err
	}
	return nil
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.OpenFile(dst, os.O_CREATE|os.O_TRUNC|os.O_WRONLY, 0o755)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, in); err != nil {
		out.Close()
		return err
	}
	return out.Close()
}

// statusJSON is returned to the page.
func statusJSON() string {
	b, _ := json.Marshal(getStatus())
	return string(b)
}
