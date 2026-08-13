package export

// Catching an export that would not run.
//
// The binaries in binaries/ embed the module registry and the frontend bundle
// as they were when they were cross-compiled. Adding a module and exporting a
// pipeline that uses it produces a zip that fails on somebody else's machine
// with "references unknown module" — the composer knows about it because the
// composer is running today's code, and the shipped binary does not.
//
// That has happened three times while building this, always the same way and
// always discovered by whoever was handed the zip. So the export refuses
// instead, and says which command fixes it. A refusal costs one command; a
// broken export costs somebody else's afternoon and a message that reads like
// the platform is broken rather than out of date.

import (
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"time"
)

// embedded lists what a platform binary carries a copy of. A change to any of
// these means the built binaries no longer match the source they came from.
var embedded = []string{"registry", "web/dist", "internal", "cmd"}

// CheckFresh reports whether the binaries predate what they embed.
//
// Called before the export writes anything, because by the time a zip is
// streaming it is too late to say no: the response headers are gone and all
// that is left is a truncated download.
//
// Modification times rather than checksums: the question is "were these built
// after that change", which is exactly what a timestamp answers, and a
// checksum manifest would be another thing to keep in step.
func CheckFresh(root, binariesDir string) error {
	built, name := oldestBinary(binariesDir)
	if built.IsZero() {
		// No cross-compiled binaries at all. The export falls back to the
		// running process, which is by definition current.
		return nil
	}

	newest, source := newestSource(root)
	if newest.IsZero() || !newest.After(built) {
		return nil
	}

	return fmt.Errorf(
		"the platform binaries are older than this build: %s changed after %s was compiled.\n"+
			"An export made now would fail on another machine with an error about an unknown module.\n"+
			"Run ./script/build-platforms.sh and export again",
		source, name)
}

// oldestBinary returns when the least recently built binary was compiled.
//
// The oldest rather than the newest: every binary in the zip has to be current,
// and a rebuild that failed for one target leaves exactly one stale file
// behind.
func oldestBinary(dir string) (time.Time, string) {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return time.Time{}, ""
	}
	var oldest time.Time
	var name string
	for _, e := range entries {
		if e.IsDir() || binaryPattern.FindStringSubmatch(e.Name()) == nil {
			continue
		}
		info, err := e.Info()
		if err != nil {
			continue
		}
		if oldest.IsZero() || info.ModTime().Before(oldest) {
			oldest = info.ModTime()
			name = e.Name()
		}
	}
	return oldest, name
}

// newestSource returns the most recent change to anything a binary embeds.
func newestSource(root string) (time.Time, string) {
	var newest time.Time
	var which string

	for _, rel := range embedded {
		dir := filepath.Join(root, rel)
		_ = filepath.WalkDir(dir, func(path string, d fs.DirEntry, err error) error {
			if err != nil || d.IsDir() {
				return nil
			}
			info, err := d.Info()
			if err != nil {
				return nil
			}
			if info.ModTime().After(newest) {
				newest = info.ModTime()
				if r, err := filepath.Rel(root, path); err == nil {
					which = r
				} else {
					which = path
				}
			}
			return nil
		})
	}
	return newest, which
}
