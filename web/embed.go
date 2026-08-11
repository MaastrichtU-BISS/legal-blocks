// Package webui embeds the built frontend bundle.
//
// The bundle is prebuilt and identical in every exported platform: it reads
// pipeline.json at startup and dynamically imports only the modules that
// pipeline names. That is what removes any need for Node, npm or a build step
// on the machine running an exported platform.
//
// Run `npm run build` in this directory to regenerate dist/.
package webui

import (
	"embed"
	"io/fs"
)

//go:embed all:dist
var files embed.FS

// FS returns the embedded bundle, rooted so that dist/index.html is at
// "dist/index.html".
func FS() fs.FS { return files }
