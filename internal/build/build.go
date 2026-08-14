// Package build holds what this binary knows about its own release.
//
// An exported platform is no longer a copy of the composer — it is a
// docker-compose.yml naming an image. That means the composer has to write
// down *which* image, and getting it wrong is the failure the old design ruled
// out by construction: a platform running code that does not understand the
// pipeline it was given.
//
// So the composer writes its own version. Both images are built from one
// commit by the same script, so "the platform image with my version number" is
// the one that agrees with this composer about the module registry and the
// frontend contract. The guarantee moved from "the same file" to "the same
// version number, written into the compose file at export time" — weaker
// looking, stronger in practice, because it is explicit, inspectable and
// upgradable by editing one line.
package build

import "fmt"

// Version is the release these binaries were cut from, stamped at link time by
// script/docker-build.sh:
//
//	-ldflags "-X github.com/MaastrichtU-BISS/legal-blocks/internal/build.Version=1.2.3"
//
// "dev" means an unstamped local build.
var Version = "dev"

// PlatformImage is the repository an exported platform pulls from, without a
// tag. Overridable at link time for a fork or a private registry, and at run
// time with LEGAL_BLOCKS_PLATFORM_IMAGE for someone testing a locally built
// image before publishing one.
var PlatformImage = "ghcr.io/maastrichtu-biss/legal-blocks-platform"

// PlatformRef is the fully qualified image an export should name.
//
// A dev build points at :dev deliberately rather than :latest. An export made
// from an unreleased composer should fail to pull loudly on someone else's
// machine, not quietly run whatever :latest happens to be that week.
func PlatformRef() string {
	return fmt.Sprintf("%s:%s", PlatformImage, Version)
}
