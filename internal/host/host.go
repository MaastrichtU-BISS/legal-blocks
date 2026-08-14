// Package host is the server both halves of the product run on.
//
// In run mode it serves an exported platform: the frontend bundle, the
// pipeline definition, persistent storage, and whichever Go
// services the pipeline's modules declare. In compose mode it serves the
// composer UI and the export endpoint, and nothing else: no database, no
// services, no way to run a draft. One server, one binary, two jobs.
package host

import (
	"context"
	"errors"
	"fmt"
	"io/fs"
	"log"
	"net"
	"net/http"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"runtime"
	"syscall"
	"time"

	"github.com/MaastrichtU-BISS/legal-blocks/internal/db"
	"github.com/MaastrichtU-BISS/legal-blocks/internal/manifest"
	"github.com/MaastrichtU-BISS/legal-blocks/internal/pipeline"
	"github.com/MaastrichtU-BISS/legal-blocks/internal/service"
)

// Mode selects which half of the product this process is.
type Mode string

const (
	// ModeRun serves an exported platform from the working directory.
	ModeRun Mode = "run"
	// ModeCompose serves the composer.
	ModeCompose Mode = "compose"
)

// Config describes one server instance.
type Config struct {
	Mode Mode
	// Dir is the working directory: pipeline.json and data/ are resolved
	// relative to it.
	Dir string
	// Port to listen on. 0 picks a free one.
	Port int
	// Web is the built frontend bundle.
	Web fs.FS
	// Registry is the module catalogue.
	Registry *manifest.Registry
	// Services holds every Go service compiled into this binary.
	Services *service.Registry
	// OpenBrowser launches the user's browser once the server is listening.
	OpenBrowser bool
}

type server struct {
	cfg      Config
	db       *db.DB
	pipeline *pipeline.Pipeline
}

// Run starts the server and blocks until interrupted.
func Run(cfg Config) error {
	if cfg.Dir == "" {
		cfg.Dir = "."
	}

	s := &server{cfg: cfg}

	mux := http.NewServeMux()

	// A pipeline is required to run a platform, and optional while composing
	// one — the composer keeps its draft in the browser until it is exported.
	if cfg.Mode == ModeRun {
		p, err := s.loadPipeline()
		if err != nil {
			return err
		}
		s.pipeline = p
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
	}
	// Compose mode mounts no services. It validates drafts and builds zips;
	// nothing it serves calls an outside API, and with no pipeline committed
	// there is no credential for a service to use anyway.

	// A pipeline opens no database and creates no data directory — there is
	// nothing to put in one. That is not an optimisation: it is what makes an
	// exported case-law explorer the same shape as the hand-written demo it
	// replaces.
	//
	// It may still run services. Searching needs the platform's access token,
	// so it happens here rather than in the page — storing nothing and doing
	// nothing on the server are different claims.
	//
	// The composer opens none either. It only ever opened one so that Preview
	// could run a draft workspace, and a composer that leaves a database file
	// beside itself invites the question of whose data that is.
	if s.needsDatabase() {
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

	ln, err := net.Listen("tcp", fmt.Sprintf("127.0.0.1:%d", cfg.Port))
	if err != nil {
		return fmt.Errorf("cannot listen on port %d: %w", cfg.Port, err)
	}
	url := fmt.Sprintf("http://localhost:%d", ln.Addr().(*net.TCPAddr).Port)

	srv := &http.Server{
		Handler:           mux,
		ReadHeaderTimeout: 10 * time.Second,
	}

	errCh := make(chan error, 1)
	go func() {
		if err := srv.Serve(ln); err != nil && !errors.Is(err, http.ErrServerClosed) {
			errCh <- err
		}
	}()

	fmt.Printf("\n  %s is running.\n\n  Open:  %s\n\n  Leave this window open. Press Ctrl+C to stop.\n\n", productName(cfg.Mode), url)
	if cfg.OpenBrowser {
		openBrowser(url)
	}

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)
	select {
	case err := <-errCh:
		return err
	case <-stop:
	}

	fmt.Println("\n  Stopping…")
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	return srv.Shutdown(ctx)
}

// needsDatabase reports whether this server has to open one. Only a running
// workspace does: a pipeline keeps nothing, and the composer builds zips.
func (s *server) needsDatabase() bool {
	return s.cfg.Mode == ModeRun && s.pipeline.ExportKind() == manifest.KindWorkspace
}

func productName(m Mode) string {
	if m == ModeCompose {
		return "Legal Blocks composer"
	}
	return "Your platform"
}

// loadPipeline reads and validates pipeline.json from the working directory.
// Validation happens at startup rather than on first use so that a broken
// export fails immediately, with a message, instead of halfway through
// somebody's annotation session.
func (s *server) loadPipeline() (*pipeline.Pipeline, error) {
	path := filepath.Join(s.cfg.Dir, "pipeline.json")
	f, err := os.Open(path)
	if err != nil {
		return nil, fmt.Errorf("cannot open %s: %w", path, err)
	}
	defer f.Close()
	p, err := pipeline.Parse(f, s.cfg.Registry)
	if err != nil {
		return nil, fmt.Errorf("%s is not a valid pipeline: %w", path, err)
	}
	return p, nil
}

// openBrowser is best-effort: the URL is printed either way, so a failure here
// costs the user a copy-paste and nothing more.
func openBrowser(url string) {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		cmd = exec.Command("open", url)
	case "windows":
		cmd = exec.Command("rundll32", "url.dll,FileProtocolHandler", url)
	default:
		cmd = exec.Command("xdg-open", url)
	}
	_ = cmd.Start()
}
