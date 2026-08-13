package export

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

// build makes a fake source tree with binaries compiled at a given moment.
func build(t *testing.T, binariesBuiltAt time.Time) string {
	t.Helper()
	root := t.TempDir()

	for _, dir := range []string{"registry", "web/dist", "internal", "binaries"} {
		if err := os.MkdirAll(filepath.Join(root, dir), 0o755); err != nil {
			t.Fatal(err)
		}
	}
	write := func(rel string, at time.Time) {
		path := filepath.Join(root, rel)
		if err := os.WriteFile(path, []byte("x"), 0o644); err != nil {
			t.Fatal(err)
		}
		if err := os.Chtimes(path, at, at); err != nil {
			t.Fatal(err)
		}
	}

	long := binariesBuiltAt.Add(-time.Hour)
	write("registry/corpus-source.module.json", long)
	write("web/dist/index.html", long)
	write("internal/host.go", long)
	write("binaries/platform-linux-amd64", binariesBuiltAt)
	write("binaries/platform-darwin-arm64", binariesBuiltAt)
	return root
}

// The failure this exists for: a module added after the binaries were built.
// The composer knows about it and the shipped binary does not, so the zip
// fails on somebody else's machine with "references unknown module".
func TestExportRefusesBinariesOlderThanTheRegistry(t *testing.T) {
	built := time.Now().Add(-2 * time.Hour)
	root := build(t, built)

	added := filepath.Join(root, "registry", "vue-legal-docs-import.module.json")
	if err := os.WriteFile(added, []byte("{}"), 0o644); err != nil {
		t.Fatal(err)
	}

	err := CheckFresh(root, filepath.Join(root, "binaries"))
	if err == nil {
		t.Fatal("a stale export was allowed")
	}
	// The message has to name the fix. "Unknown module" on a colleague's
	// laptop is what this replaces, and that one says nothing useful.
	if !strings.Contains(err.Error(), "build-platforms.sh") {
		t.Errorf("error = %q, want the command that fixes it", err)
	}
	if !strings.Contains(err.Error(), "vue-legal-docs-import") {
		t.Errorf("error = %q, want it to name what changed", err)
	}
}

// A rebuild that failed for one target leaves exactly one stale binary, and
// the zip ships all of them — so the oldest is what counts, not the newest.
func TestOneStaleBinaryIsEnoughToRefuse(t *testing.T) {
	root := build(t, time.Now())

	old := time.Now().Add(-24 * time.Hour)
	stale := filepath.Join(root, "binaries", "platform-windows-amd64.exe")
	if err := os.WriteFile(stale, []byte("x"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.Chtimes(stale, old, old); err != nil {
		t.Fatal(err)
	}

	if err := CheckFresh(root, filepath.Join(root, "binaries")); err == nil {
		t.Error("a build where one target failed was allowed")
	}
}

func TestFreshBinariesExportFine(t *testing.T) {
	root := build(t, time.Now())
	if err := CheckFresh(root, filepath.Join(root, "binaries")); err != nil {
		t.Errorf("a current build was refused: %v", err)
	}
}

// Without cross-compiled binaries the export ships the running process, which
// cannot be out of date with itself.
func TestNoBinariesIsNotStale(t *testing.T) {
	root := build(t, time.Now())
	os.RemoveAll(filepath.Join(root, "binaries"))
	if err := CheckFresh(root, filepath.Join(root, "binaries")); err != nil {
		t.Errorf("an export with no cross-compiled binaries was refused: %v", err)
	}
}
