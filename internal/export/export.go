// Package export assembles a runnable platform as a zip.
//
// Nothing is compiled or bundled here. The frontend is prebuilt and identical
// in every export — it reads pipeline.json at startup and loads only the
// modules that pipeline names — and the platform binary already contains every
// Go service. So an export is: copy two prebuilt artefacts, write one JSON
// file, add the user's documents. That is why exporting is instant, and why it
// needs no toolchain on the machine doing it.
//
// The cost is that an export carries code for modules its pipeline does not
// use. At proof-of-concept sizes that is a few megabytes of unreachable
// JavaScript. Trimming it means per-export builds, which is a build service,
// not a zip writer.
package export

import (
	"archive/zip"
	"encoding/json"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"sort"
	"strings"

	"github.com/MaastrichtU-BISS/legal-blocks/internal/manifest"
	"github.com/MaastrichtU-BISS/legal-blocks/internal/pipeline"
)

// Options describes one export.
type Options struct {
	Pipeline *pipeline.Pipeline
	Registry *manifest.Registry
	// CorpusDir holds the input documents to ship.
	CorpusDir string
	// BinariesDir holds cross-compiled platform binaries, one per operating
	// system, produced by script/build-platforms.sh. Whatever is found there
	// is shipped, so an export made on one machine runs on a colleague's
	// different one. When it is empty or missing, only the binary running this
	// export is shipped and the export runs on this operating system alone.
	BinariesDir string
}

// target is one operating system an export can run on.
type target struct {
	os   string
	arch string
	// name is the file name inside the zip.
	name string
	// path is where to read it from; empty means "the running binary".
	path string
}

// binaryPattern matches the names build-platforms.sh produces.
var binaryPattern = regexp.MustCompile(`^platform-([a-z0-9]+)-([a-z0-9]+)(\.exe)?$`)

// targets lists the platform binaries to ship, newest-wins per os/arch.
//
// The running binary is always included as a fallback for its own os/arch, so
// an export is never left with nothing to run — but a cross-compiled build for
// the same pair is preferred, because those are stripped and smaller.
func targets(binariesDir string) []target {
	found := map[string]target{}

	entries, err := os.ReadDir(binariesDir)
	if err == nil {
		for _, e := range entries {
			m := binaryPattern.FindStringSubmatch(e.Name())
			if e.IsDir() || m == nil {
				continue
			}
			key := m[1] + "/" + m[2]
			found[key] = target{
				os:   m[1],
				arch: m[2],
				name: e.Name(),
				path: filepath.Join(binariesDir, e.Name()),
			}
		}
	}

	selfKey := runtime.GOOS + "/" + runtime.GOARCH
	if _, ok := found[selfKey]; !ok {
		name := fmt.Sprintf("platform-%s-%s", runtime.GOOS, runtime.GOARCH)
		if runtime.GOOS == "windows" {
			name += ".exe"
		}
		found[selfKey] = target{os: runtime.GOOS, arch: runtime.GOARCH, name: name}
	}

	list := make([]target, 0, len(found))
	for _, t := range found {
		list = append(list, t)
	}
	sort.Slice(list, func(i, j int) bool {
		if list[i].os != list[j].os {
			return list[i].os < list[j].os
		}
		return list[i].arch < list[j].arch
	})
	return list
}

// hasOS reports whether any shipped binary runs on the given operating system.
func hasOS(ts []target, goos string) bool {
	for _, t := range ts {
		if t.os == goos {
			return true
		}
	}
	return false
}

// Write streams the platform zip to w.
func Write(w io.Writer, opts Options) error {
	zw := zip.NewWriter(w)

	// Credentials never go into pipeline.json. That file describes what the
	// platform is, is served to every browser that opens it, and should be
	// safe to read, copy and commit; a token in it would reach all of those
	// places. They go into their own file instead, which is the one thing in
	// an export that has to be handled carefully — and saying that is much
	// easier when it is a single named file.
	clean, secrets := opts.Pipeline.SplitSecrets(opts.Registry)

	pipelineJSON, err := json.MarshalIndent(clean, "", "  ")
	if err != nil {
		return fmt.Errorf("encoding pipeline: %w", err)
	}
	if err := addFile(zw, "pipeline.json", pipelineJSON, 0o644); err != nil {
		return err
	}

	if len(secrets) > 0 {
		credentialsJSON, err := json.MarshalIndent(secrets, "", "  ")
		if err != nil {
			return fmt.Errorf("encoding credentials: %w", err)
		}
		// 0600 so that on a shared machine the file is at least not readable
		// by other accounts. Anyone holding the zip still holds the token —
		// that is unavoidable when the credential has to travel with the
		// platform, and README.txt says so plainly.
		if err := addFile(zw, "credentials.json", credentialsJSON, 0o600); err != nil {
			return err
		}
	}

	// The platform binaries. Copying them is what makes the result
	// self-contained: the recipient needs no Go, no Node, no Docker, nothing.
	//
	// The frontend bundle is not copied separately — it is already embedded in
	// each binary, and shipping it twice would only create two copies that can
	// disagree.
	ts := targets(opts.BinariesDir)
	for _, t := range ts {
		if err := addBinary(zw, t); err != nil {
			return err
		}
	}

	if err := addCorpus(zw, opts.CorpusDir); err != nil {
		return err
	}

	// A start script only ships when there is a binary it can actually launch.
	// Shipping Start.bat next to a macOS binary is worse than shipping nothing
	// — it looks like Windows is supported and fails with "not recognized as
	// an internal or external command" on someone else's machine.
	if hasOS(ts, "darwin") {
		if err := addFile(zw, "Start.command", []byte(startCommand), 0o755); err != nil {
			return err
		}
	}
	if hasOS(ts, "windows") {
		if err := addFile(zw, "Start.bat", []byte(startBat), 0o644); err != nil {
			return err
		}
	}
	if hasOS(ts, "linux") {
		if err := addFile(zw, "start.sh", []byte(startSh), 0o755); err != nil {
			return err
		}
	}

	if err := addFile(zw, "README.txt", []byte(readme(opts, ts, len(secrets) > 0)), 0o644); err != nil {
		return err
	}

	return zw.Close()
}

// addBinary copies one platform binary into the zip. A target with no path is
// the currently running executable.
func addBinary(zw *zip.Writer, t target) error {
	path := t.path
	if path == "" {
		self, err := os.Executable()
		if err != nil {
			return fmt.Errorf("locating this binary: %w", err)
		}
		path = self
	}

	f, err := os.Open(path)
	if err != nil {
		return fmt.Errorf("opening %s: %w", t.name, err)
	}
	defer f.Close()

	hdr := &zip.FileHeader{Name: t.name, Method: zip.Deflate}
	hdr.SetMode(0o755)
	out, err := zw.CreateHeader(hdr)
	if err != nil {
		return fmt.Errorf("adding %s: %w", t.name, err)
	}
	if _, err := io.Copy(out, f); err != nil {
		return fmt.Errorf("copying %s: %w", t.name, err)
	}
	return nil
}

// addCorpus copies the input documents. A missing or empty folder is not an
// error: the zip still contains corpus/_readme.txt telling the recipient where
// to put their own files. The leading underscore keeps that file from being
// read as a document itself.
func addCorpus(zw *zip.Writer, dir string) error {
	if err := addFile(zw, "corpus/_readme.txt", []byte(corpusReadme), 0o644); err != nil {
		return err
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil
	}
	for _, e := range entries {
		if e.IsDir() || !strings.EqualFold(filepath.Ext(e.Name()), ".txt") {
			continue
		}
		raw, err := os.ReadFile(filepath.Join(dir, e.Name()))
		if err != nil {
			return fmt.Errorf("reading %s: %w", e.Name(), err)
		}
		if err := addFile(zw, "corpus/"+e.Name(), raw, 0o644); err != nil {
			return err
		}
	}
	return nil
}

func addFile(zw *zip.Writer, name string, content []byte, mode fs.FileMode) error {
	hdr := &zip.FileHeader{Name: name, Method: zip.Deflate}
	hdr.SetMode(mode)
	out, err := zw.CreateHeader(hdr)
	if err != nil {
		return fmt.Errorf("adding %s: %w", name, err)
	}
	if _, err := out.Write(content); err != nil {
		return fmt.Errorf("writing %s: %w", name, err)
	}
	return nil
}

// Filename turns a pipeline name into a safe zip filename.
func Filename(name string) string {
	var b strings.Builder
	for _, r := range strings.ToLower(strings.TrimSpace(name)) {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			b.WriteRune(r)
		case r == ' ', r == '-', r == '_':
			b.WriteRune('-')
		}
	}
	slug := strings.Trim(b.String(), "-")
	if slug == "" {
		slug = "platform"
	}
	return slug + ".zip"
}

// startCommand clears the quarantine flag before launching.
//
// macOS tags anything that arrives from a browser, and kills tagged
// executables outright — with SIGKILL and no message — unless they are signed
// by a paid Apple developer account. That applies to the platform binary
// however it is launched, so without this the user would get past Gatekeeper
// on this script only to have the program die silently.
//
// Clearing the tag on our own extracted files is exactly what Finder's "Open
// Anyway" button does, needs no password, and covers the whole folder so a
// second launch is prompt-free too. It is a workaround for not being
// notarised, not a substitute for it.
const startCommand = `#!/bin/sh
# Double-click this file to start the platform.
cd "$(dirname "$0")" || exit 1
xattr -dr com.apple.quarantine . 2>/dev/null

# Apple Silicon Macs run the arm64 build; Intel Macs run the amd64 one. If the
# exact match is missing, any macOS build will do — an amd64 binary still runs
# on Apple Silicon through Rosetta.
case "$(uname -m)" in
  arm64) BIN=./platform-darwin-arm64 ;;
  *)     BIN=./platform-darwin-amd64 ;;
esac
[ -f "$BIN" ] || BIN=$(ls ./platform-darwin-* 2>/dev/null | head -1)

if [ ! -f "$BIN" ]; then
  echo "This folder has no macOS version of the platform in it."
  echo "Ask whoever sent it for a version built for macOS."
  exit 1
fi

chmod +x "$BIN" 2>/dev/null
"$BIN" run
`

const startBat = `@echo off
rem Double-click this file to start the platform.
cd /d "%~dp0"

if not exist platform-windows-amd64.exe (
  echo This folder has no Windows version of the platform in it.
  echo Ask whoever sent it for a version built for Windows.
  pause
  exit /b 1
)

platform-windows-amd64.exe run
pause
`

const startSh = `#!/bin/sh
# Run this file to start the platform:  ./start.sh
cd "$(dirname "$0")" || exit 1

case "$(uname -m)" in
  aarch64|arm64) BIN=./platform-linux-arm64 ;;
  *)             BIN=./platform-linux-amd64 ;;
esac
[ -f "$BIN" ] || BIN=$(ls ./platform-linux-* 2>/dev/null | head -1)

if [ ! -f "$BIN" ]; then
  echo "This folder has no Linux version of the platform in it."
  exit 1
fi

chmod +x "$BIN" 2>/dev/null
"$BIN" run
`

const corpusReadme = `Put the documents you want to work on in this folder, as .txt files.

The file name (without .txt) becomes the document name in the platform.
Add or remove files and reload the page in your browser to see the change.

Files whose name starts with an underscore are ignored, so you can set a
document aside without deleting it. That is why this file is called _readme.
`

// storageSection tells the recipient where their work lives, which differs
// completely between the two kinds of export and is the thing they most need
// to know before they start typing into one.
func storageSection(kind manifest.Kind) string {
	if kind == manifest.KindPipeline {
		return `YOUR WORK

  This platform does not save anything on your computer beyond your browser.
  Work stays in the browser you did it in: it survives reloading the page and
  restarting the platform, but it is lost if you clear your browsing data, and
  it is not visible in another browser or to anyone else.

  Use the download step to save your results before you finish.
`
	}
	return `YOUR WORK

  Everything you do is saved in the "data" folder as you go, so closing the
  browser or refreshing the page does not lose anything.

  To back up your work, copy the "data" folder. To send it to someone, zip it.
  To start over, delete it — it will be recreated empty.
`
}

// osLabel names an operating system the way a non-technical reader does.
func osLabel(goos string) string {
	switch goos {
	case "darwin":
		return "macOS"
	case "windows":
		return "Windows"
	case "linux":
		return "Linux"
	default:
		return goos
	}
}

// startInstructions describes only the systems this export can actually run
// on, so nobody is told to double-click a file that is not in the folder.
func startInstructions(ts []target) string {
	var b strings.Builder
	if hasOS(ts, "windows") {
		b.WriteString("  Windows : double-click \"Start.bat\"\n")
	}
	if hasOS(ts, "darwin") {
		b.WriteString("  macOS   : double-click \"Start.command\"  (read FIRST TIME ON macOS below)\n")
	}
	if hasOS(ts, "linux") {
		b.WriteString("  Linux   : run  ./start.sh\n")
	}

	var systems []string
	seen := map[string]bool{}
	for _, t := range ts {
		if !seen[t.os] {
			seen[t.os] = true
			systems = append(systems, osLabel(t.os))
		}
	}
	fmt.Fprintf(&b, "\n  This copy runs on: %s.\n", strings.Join(systems, ", "))
	if len(systems) == 1 {
		b.WriteString("  It will not run on anything else — ask for a copy built for your\n  system if you need one.\n")
	}
	return b.String()
}

// credentialsSection warns the recipient about the one file in the export that
// is not safe to pass on. Only included when there is such a file.
func credentialsSection() string {
	return `THE FILE CALLED "credentials.json"

  This platform searches a document service on your behalf, and that service
  needs an access key. The key is in "credentials.json".

  Treat that file the way you would treat a password:

    - Anyone who has this folder can use the key.
    - Do not put the folder on a shared drive or send it on to other people.
    - If you need to pass the platform to someone else, delete
      "credentials.json" first and ask whoever gave you this for their own copy.

  The key is never shown in your browser and never leaves this machine except
  in requests to the document service itself.

`
}

func readme(opts Options, ts []target, hasCredentials bool) string {
	credentials := ""
	if hasCredentials {
		credentials = credentialsSection()
	}

	var steps strings.Builder
	for i, id := range opts.Pipeline.Order() {
		for _, n := range opts.Pipeline.Nodes {
			if n.ID != id {
				continue
			}
			label := n.Label
			if label == "" {
				label = opts.Registry.Modules[n.Module].Name
			}
			fmt.Fprintf(&steps, "  %d. %s\n", i+1, label)
		}
	}

	return fmt.Sprintf(`%s
%s

WHAT THIS IS

  A self-contained platform. Everything it needs is in this folder — there is
  nothing to install.

  Steps in this platform:

%s

HOW TO START IT

%s
  A window opens and your browser goes to the platform. Leave that window
  open while you work; closing it stops the platform.

  The folder contains one program file per operating system. You only need
  the one for yours; the others are harmless and can be deleted.

FIRST TIME ON WINDOWS

  Windows may show a blue "Windows protected your PC" box. Click "More info",
  then "Run anyway". This appears because the program is not registered with
  Microsoft under a paid certificate, not because anything is wrong with it.
  You only do this once.

FIRST TIME ON macOS

  macOS will refuse to open the file and say it "could not verify" it is free
  of malware. Nothing is wrong with the file. macOS says this about every
  program that is not registered with Apple under a paid developer account,
  which this one is not yet.

  The easiest way past it is to start the platform from the Terminal once:

    1. Open Terminal (press Cmd+Space, type Terminal, press Enter).
    2. Type  cd  followed by a space. Do not press Enter yet.
    3. Drag this folder into the Terminal window. The path appears.
    4. Press Enter.
    5. Type  ./Start.command  and press Enter.

  No warning appears this way, and afterwards double-clicking
  "Start.command" works normally.

  If you would rather not use the Terminal: open System Settings >
  Privacy & Security, scroll to the message about "Start.command", click
  "Open Anyway", then double-click "Start.command" again.

  Either way, you only do this once.

YOUR DOCUMENTS

  Put .txt files in the "corpus" folder. Reload the page to pick up changes.

%s%s`, opts.Pipeline.Name, strings.Repeat("=", len(opts.Pipeline.Name)), steps.String(),
		startInstructions(ts), storageSection(opts.Pipeline.ExportKind()), credentials)
}
