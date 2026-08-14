// Command platform runs one exported platform.
//
// It reads ./pipeline.json, mounts the services that pipeline's modules
// declare, and serves the platform bundle. It cannot design or export a
// platform — that is the composer, a separate program in a separate image.
//
// This is what ships in the platform image. An exported folder is a
// docker-compose.yml naming that image, with pipeline.json and data/ mounted
// beside it.
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

// services lists every Go backend compiled into this image. Adding a new one —
// a PDF parser, a summariser — means implementing service.Service and adding
// it to this line.
func services() (*service.Registry, error) {
	return service.NewRegistry(
		iaasvc.New(),
		docsimportsvc.New(),
		legaldocssvc.New(),
	)
}

func main() {
	port := flag.Int("port", 7777, "port to listen on")
	dir := flag.String("dir", ".", "working directory holding pipeline.json and data/")
	flag.Parse()

	reg, err := manifest.Load(registry.FS())
	if err != nil {
		fail("loading module registry: %v", err)
	}
	svcs, err := services()
	if err != nil {
		fail("building service registry: %v", err)
	}

	if err := host.Run(host.Config{
		Dir:      *dir,
		Port:     *port,
		Web:      webui.Platform(),
		Registry: reg,
		Services: svcs,
	}); err != nil {
		fail("%v", err)
	}
}

func fail(format string, args ...any) {
	fmt.Fprintf(os.Stderr, "\nerror: "+format+"\n\n", args...)
	os.Exit(1)
}
