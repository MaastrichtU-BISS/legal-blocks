// Command composer designs platforms and exports them.
//
// It serves the composer UI and one endpoint that builds a zip. It opens no
// database, mounts no services and runs no pipeline: an export is a
// docker-compose.yml naming the platform image, so trying a platform means
// exporting it and running it.
package main

import (
	"flag"
	"fmt"
	"os"

	"github.com/MaastrichtU-BISS/legal-blocks/internal/build"
	"github.com/MaastrichtU-BISS/legal-blocks/internal/composer"
	"github.com/MaastrichtU-BISS/legal-blocks/internal/manifest"
	"github.com/MaastrichtU-BISS/legal-blocks/registry"
	webui "github.com/MaastrichtU-BISS/legal-blocks/web"
)

func main() {
	port := flag.Int("port", 7788, "port to listen on")
	// Overriding this is how you try a platform image you built locally,
	// before it has been published under a version anyone else can pull.
	image := flag.String("platform-image", os.Getenv("LEGAL_BLOCKS_PLATFORM_IMAGE"),
		"platform image exports should name (default: this build's own version)")
	flag.Parse()

	reg, err := manifest.Load(registry.FS())
	if err != nil {
		fail("loading module registry: %v", err)
	}

	fmt.Printf("\n  Legal Blocks %s\n", build.Version)
	if err := composer.Run(composer.Config{
		Port:     *port,
		Web:      webui.Composer(),
		Registry: reg,
		Image:    *image,
	}); err != nil {
		fail("%v", err)
	}
}

func fail(format string, args ...any) {
	fmt.Fprintf(os.Stderr, "\nerror: "+format+"\n\n", args...)
	os.Exit(1)
}
