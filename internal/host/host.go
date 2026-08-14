// Package host serves an exported platform: the frontend bundle, the pipeline
// definition, persistent storage when the pipeline is a workspace, and
// whichever Go services the pipeline's modules declare.
//
// It has no compose mode. Designing platforms is internal/composer, a separate
// program in a separate image, and this package must not import it — that is
// what keeps a platform free of the machinery for building platforms.
package host

import (
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"os"
	"path/filepath"

	"github.com/MaastrichtU-BISS/legal-blocks/internal/db"
	"github.com/MaastrichtU-BISS/legal-blocks/internal/manifest"
	"github.com/MaastrichtU-BISS/legal-blocks/internal/pipeline"
	"github.com/MaastrichtU-BISS/legal-blocks/internal/serve"
	"github.com/MaastrichtU-BISS/legal-blocks/internal/service"
)

// Config describes one platform.
type Config struct {
	// Dir is the working directory: pipeline.json and data/ are resolved
	// relative to it. In the image this is /app, and both are mounted.
	Dir string
	// Port to listen on.
	Port int
	// Web is the platform bundle, rooted at its index.html.
	Web fs.FS
	// Registry is the module catalogue.
	Registry *manifest.Registry
	// Services holds every Go service compiled into this binary.
	Services *service.Registry
}

type server struct {
	cfg      Config
	db       *db.DB
	pipeline *pipeline.Pipeline
}

// Run starts the platform and blocks until interrupted.
func Run(cfg Config) error {
	if cfg.Dir == "" {
		cfg.Dir = "."
	}

	s := &server{cfg: cfg}

	p, err := s.loadPipeline()
	if err != nil {
		return err
	}
	s.pipeline = p

	mux := http.NewServeMux()
	if err := cfg.Services.Mount(mux, p.ServiceIDs(cfg.Registry)); err != nil {
		return err
	}
	log.Printf("%s %q: %d modules", p.ExportKind(), p.Name, len(p.Nodes))

	secrets, err := loadCredentials(cfg.Dir)
	if err != nil {
		return err
	}
	upstreams := p.Upstreams(cfg.Registry, secrets)
	if err := s.applyUpstreams(upstreams); err != nil {
		return err
	}
	if len(upstreams) > 0 {
		log.Printf("outside services: %s", describeUpstreams(upstreams))
	}

	// A pipeline opens no database and creates no data directory — there is
	// nothing to put in one. That is not an optimisation: it is what makes an
	// exported case-law explorer the same shape as the hand-written demo it
	// replaces.
	//
	// It may still run services. Searching needs the platform's access token,
	// so it happens here rather than in the page — storing nothing and doing
	// nothing on the server are different claims.
	if p.ExportKind() == manifest.KindWorkspace {
		if err := os.MkdirAll(filepath.Join(cfg.Dir, "data"), 0o755); err != nil {
			return fmt.Errorf("creating data directory: %w", err)
		}
		database, err := db.Open(filepath.Join(cfg.Dir, "data", "platform.db"))
		if err != nil {
			return err
		}
		defer database.Close()
		s.db = database
	}

	s.routes(mux)
	return serve.Run("Your platform", cfg.Port, mux)
}

// loadPipeline reads and validates pipeline.json from the working directory.
//
// Validation happens at startup rather than on first use so that a broken
// deployment fails immediately, with a message, instead of halfway through
// somebody's annotation session. The file is mounted read-only by the compose
// file, so a missing one means it was moved or the platform was started from
// the wrong folder — which is what the message has to help with.
func (s *server) loadPipeline() (*pipeline.Pipeline, error) {
	path := filepath.Join(s.cfg.Dir, "pipeline.json")
	f, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("cannot open %s — it should sit next to docker-compose.yml "+
			"in the folder you started the platform from: %w", path, err)
	}
	defer f.Close()
	p, err := pipeline.Parse(f, s.cfg.Registry)
	if err != nil {
		return nil, fmt.Errorf("%s is not a valid pipeline: %w", path, err)
	}
	return p, nil
}
