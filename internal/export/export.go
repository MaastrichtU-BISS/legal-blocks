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
	"runtime"
	"strings"

	"github.com/MaastrichtU-BISS/legal-blocks/internal/manifest"
	"github.com/MaastrichtU-BISS/legal-blocks/internal/pipeline"
)

// Options describes one export.
type Options struct {
	Pipeline  *pipeline.Pipeline
	Registry  *manifest.Registry
	CorpusDir string
}

// Write streams the platform zip to w.
func Write(w io.Writer, opts Options) error {
	zw := zip.NewWriter(w)

	pipelineJSON, err := json.MarshalIndent(opts.Pipeline, "", "  ")
	if err != nil {
		return fmt.Errorf("encoding pipeline: %w", err)
	}
	if err := addFile(zw, "pipeline.json", pipelineJSON, 0o644); err != nil {
		return err
	}

	// The binary running this export is the same one the exported platform
	// runs. Copying it is what makes the result self-contained: the recipient
	// needs no Go, no Node, no Docker, nothing.
	if err := addSelf(zw); err != nil {
		return err
	}

	// The frontend bundle is not copied separately: it is already embedded in
	// the binary above. Shipping it twice would only create two copies that
	// can disagree.
	if err := addCorpus(zw, opts.CorpusDir); err != nil {
		return err
	}

	if err := addFile(zw, "Start.command", []byte(startCommand), 0o755); err != nil {
		return err
	}
	if err := addFile(zw, "Start.bat", []byte(startBat), 0o644); err != nil {
		return err
	}
	if err := addFile(zw, "README.txt", []byte(readme(opts)), 0o644); err != nil {
		return err
	}

	return zw.Close()
}

// binaryName is what the platform executable is called inside the zip.
func binaryName() string {
	if runtime.GOOS == "windows" {
		return "platform.exe"
	}
	return "platform"
}

// addSelf copies the currently running executable into the zip.
//
// Only the current platform's binary is exported. Cross-platform exports mean
// shipping binaries built for other systems, which this process does not have
// — that is a CI matrix producing a set of binaries the composer embeds, and
// it is deliberately out of scope here.
func addSelf(zw *zip.Writer) error {
	self, err := os.Executable()
	if err != nil {
		return fmt.Errorf("locating this binary: %w", err)
	}
	f, err := os.Open(self)
	if err != nil {
		return fmt.Errorf("opening this binary: %w", err)
	}
	defer f.Close()

	hdr := &zip.FileHeader{Name: binaryName(), Method: zip.Deflate}
	hdr.SetMode(0o755)
	out, err := zw.CreateHeader(hdr)
	if err != nil {
		return fmt.Errorf("adding binary: %w", err)
	}
	if _, err := io.Copy(out, f); err != nil {
		return fmt.Errorf("copying binary: %w", err)
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
chmod +x ./platform 2>/dev/null
./platform run
`

const startBat = `@echo off
rem Double-click this file to start the platform.
cd /d "%~dp0"
platform.exe run
pause
`

const corpusReadme = `Put the documents you want to work on in this folder, as .txt files.

The file name (without .txt) becomes the document name in the platform.
Add or remove files and reload the page in your browser to see the change.

Files whose name starts with an underscore are ignored, so you can set a
document aside without deleting it. That is why this file is called _readme.
`

func readme(opts Options) string {
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

  Windows : double-click "Start.bat"
  macOS   : double-click "Start.command"  (but read the next section first)

  A window opens and your browser goes to the platform. Leave that window
  open while you work; closing it stops the platform.

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

YOUR WORK

  Everything you do is saved in the "data" folder as you go, so closing the
  browser or refreshing the page does not lose anything.

  To back up your work, copy the "data" folder. To send it to someone, zip it.
  To start over, delete it — it will be recreated empty.
`, opts.Pipeline.Name, strings.Repeat("=", len(opts.Pipeline.Name)), steps.String())
}
