// Package registry embeds the module manifests into the binary.
//
// The .json files next to this one are the whole module catalogue. They live
// at the repo root rather than inside internal/ because they are the artefact
// worth reading first: adding a module to the platform means adding one of
// these, and nothing else on the Go side.
package registry

import (
	"embed"
	"io/fs"
)

//go:embed *.json
var files embed.FS

// FS returns the embedded manifest directory.
func FS() fs.FS { return files }
