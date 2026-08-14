// Package webui embeds the built frontend bundles.
//
// There are two, built from one source tree: the composer and the platform.
// They are separate builds rather than one bundle choosing at runtime, which
// is what lets the platform image contain no composer code at all — and, going
// the other way, keeps the composer down to a few tens of kilobytes instead of
// carrying every module's JavaScript.
//
// Each is embedded whole and returned already rooted, so a server serves the
// filesystem it is given and never has to know which one it got.
//
// Regenerate with `npm run build` in this directory.
package webui

import (
	"embed"
	"io/fs"
)

//go:embed all:dist/composer
var composerFiles embed.FS

//go:embed all:dist/platform
var platformFiles embed.FS

// Composer returns the composer bundle, rooted at its index.html.
func Composer() fs.FS { return rooted(composerFiles, "dist/composer") }

// Platform returns the platform bundle, rooted at its index.html.
func Platform() fs.FS { return rooted(platformFiles, "dist/platform") }

// rooted strips the build directory so callers serve "/" and not "/dist/x/".
//
// A failure here means the bundle was not built before compiling, which no
// amount of error handling at the call site can recover from — so it panics at
// startup rather than serving a platform with no interface.
func rooted(files embed.FS, dir string) fs.FS {
	sub, err := fs.Sub(files, dir)
	if err != nil {
		panic("frontend bundle missing: " + dir + " — run npm run build in web/")
	}
	return sub
}
