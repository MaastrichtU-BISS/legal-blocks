// Package composer serves the tool that designs platforms.
//
// It is deliberately thin. The composer holds its draft in the browser, keeps
// no database, mounts no services and runs nothing — it answers with the
// module catalogue, and it builds zips. Everything else a platform can do
// lives in internal/host, which this package does not import.
//
// That separation is the point: internal/export is reachable from here and
// from nowhere a platform can see, so an exported platform carries no code for
// building exports.
package composer

import (
	"fmt"
	"io/fs"
	"net/http"
	"os"

	"github.com/MaastrichtU-BISS/legal-blocks/internal/build"
	"github.com/MaastrichtU-BISS/legal-blocks/internal/export"
	"github.com/MaastrichtU-BISS/legal-blocks/internal/manifest"
	"github.com/MaastrichtU-BISS/legal-blocks/internal/pipeline"
	"github.com/MaastrichtU-BISS/legal-blocks/internal/serve"
)

// maxBodyBytes caps request bodies. A draft pipeline is small; this exists to
// stop a malformed client from filling memory.
const maxBodyBytes = 8 << 20 // 8 MB

// Config describes one composer.
type Config struct {
	Port int
	// Web is the composer bundle, rooted at its index.html.
	Web fs.FS
	// Registry is the module catalogue.
	Registry *manifest.Registry
	// Image overrides the platform image an export names. Empty uses this
	// build's own version, which is what makes the export match the composer.
	Image string
}

type server struct {
	cfg   Config
	image string
}

// Run starts the composer and blocks until interrupted.
func Run(cfg Config) error {
	image := cfg.Image
	if image == "" {
		image = build.PlatformRef()
	}
	s := &server{cfg: cfg, image: image}

	mux := http.NewServeMux()
	// Matched last — see the note in internal/host on why this exists at all.
	mux.HandleFunc("/api/", func(w http.ResponseWriter, r *http.Request) {
		serve.Error(w, http.StatusNotFound,
			"the composer designs platforms and runs none, so %s exists only in an export",
			r.URL.Path)
	})
	mux.HandleFunc("/api/registry", s.handleRegistry)
	mux.HandleFunc("/api/export", s.handleExport)
	mux.Handle("/", serve.Static(cfg.Web))

	fmt.Printf("\n  Exports will run:  %s\n", image)
	return serve.Run("Legal Blocks composer", cfg.Port, mux)
}

// handleRegistry serves the module catalogue. The composer renders its palette
// from this and has no hardcoded knowledge of any module.
func (s *server) handleRegistry(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		serve.Error(w, http.StatusMethodNotAllowed, "use GET")
		return
	}
	serve.JSON(w, http.StatusOK, s.cfg.Registry)
}

// handleExport validates a draft and builds the platform zip.
//
// Parsing is the validation: pipeline.Parse rejects anything the composer
// should not have allowed, and its message is the one the user sees. There is
// no separate validate endpoint, because a second copy of that rule is a
// second thing that can disagree with this one.
func (s *server) handleExport(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		serve.Error(w, http.StatusMethodNotAllowed, "use POST")
		return
	}
	p, err := pipeline.Parse(http.MaxBytesReader(w, r.Body, maxBodyBytes), s.cfg.Registry)
	if err != nil {
		serve.Error(w, http.StatusBadRequest, "%v", err)
		return
	}

	filename := export.Filename(p.Name)
	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", filename))

	if err := export.Write(w, export.Options{
		Pipeline: p,
		Registry: s.cfg.Registry,
		Image:    s.image,
	}); err != nil {
		// Headers are already sent, so the client sees a truncated zip. Log
		// loudly; there is nothing useful left to say over the wire.
		fmt.Fprintf(os.Stderr, "export failed: %v\n", err)
	}
}
