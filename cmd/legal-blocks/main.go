// Command legal-blocks is both halves of the product.
//
//	legal-blocks compose   design a platform and export it
//	legal-blocks run       run an exported platform
//
// Exported platforms ship a copy of this same binary, invoked as `run` by
// their Start script. One binary, two modes, so the composer's preview and the
// exported platform cannot behave differently.
package main

import (
	"flag"
	"fmt"
	"os"

	"github.com/MaastrichtU-BISS/legal-blocks/internal/host"
	"github.com/MaastrichtU-BISS/legal-blocks/internal/manifest"
	"github.com/MaastrichtU-BISS/legal-blocks/internal/service"
	docsimportsvc "github.com/MaastrichtU-BISS/legal-blocks/internal/services/docsimport"
	iaasvc "github.com/MaastrichtU-BISS/legal-blocks/internal/services/iaa"
	legaldocssvc "github.com/MaastrichtU-BISS/legal-blocks/internal/services/legaldocs"
	"github.com/MaastrichtU-BISS/legal-blocks/registry"
	webui "github.com/MaastrichtU-BISS/legal-blocks/web"
)

// services lists every Go backend compiled into this binary. Adding a new one
// — a PDF parser, a summariser — means implementing service.Service and adding
// it to this line.
func services() (*service.Registry, error) {
	return service.NewRegistry(
		iaasvc.New(),
		docsimportsvc.New(),
		legaldocssvc.New(),
	)
}

func main() {
	if len(os.Args) < 2 {
		usage()
		os.Exit(2)
	}

	mode := host.Mode(os.Args[1])
	switch mode {
	case host.ModeRun, host.ModeCompose:
	default:
		fmt.Fprintf(os.Stderr, "unknown command %q\n\n", os.Args[1])
		usage()
		os.Exit(2)
	}

	fs := flag.NewFlagSet(os.Args[1], flag.ExitOnError)
	defaultPort := 7777
	if mode == host.ModeCompose {
		defaultPort = 7788
	}
	port := fs.Int("port", defaultPort, "port to listen on (0 picks a free one)")
	dir := fs.String("dir", ".", "working directory holding pipeline.json, corpus/ and data/")
	noOpen := fs.Bool("no-open", false, "do not open a browser on startup")
	_ = fs.Parse(os.Args[2:])

	reg, err := manifest.Load(registry.FS())
	if err != nil {
		fail("loading module registry: %v", err)
	}
	svcs, err := services()
	if err != nil {
		fail("building service registry: %v", err)
	}

	if err := host.Run(host.Config{
		Mode:        mode,
		Dir:         *dir,
		Port:        *port,
		Web:         webui.FS(),
		Registry:    reg,
		Services:    svcs,
		OpenBrowser: !*noOpen,
	}); err != nil {
		fail("%v", err)
	}
}

func usage() {
	fmt.Fprint(os.Stderr, `Legal Blocks — compose platforms from annotation, analysis and search modules.

Usage:
  legal-blocks compose [flags]   design a platform and export it as a zip
  legal-blocks run     [flags]   run the platform defined by ./pipeline.json

Flags:
  -port N     port to listen on (compose: 7788, run: 7777; 0 picks a free one)
  -dir PATH   working directory holding pipeline.json, corpus/ and data/
  -no-open    do not open a browser on startup
`)
}

func fail(format string, args ...any) {
	fmt.Fprintf(os.Stderr, "\nerror: "+format+"\n\n", args...)
	os.Exit(1)
}
