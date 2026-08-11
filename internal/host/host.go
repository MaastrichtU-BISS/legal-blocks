// Package host is the server both halves of the product run on.
//
// In run mode it serves an exported platform: the frontend bundle, the
// pipeline definition, the corpus, persistent storage, and whichever Go
// services the pipeline's modules declare. In compose mode it additionally
// serves the composer UI and the export endpoint. One server, one binary, and
// the composer's preview is therefore the same code path the exported
// platform runs — export cannot drift from what was previewed.
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

	"github.com/MaastrichtU-BISS/legal-blocks/internal/manifest"
	"github.com/MaastrichtU-BISS/legal-blocks/internal/pipeline"
	"github.com/MaastrichtU-BISS/legal-blocks/internal/service"
	"github.com/MaastrichtU-BISS/legal-blocks/internal/store"
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
	// Dir is the working directory: pipeline.json, corpus/ and data/ are
	// resolved relative to it.
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
	store    *store.FileStore
	pipeline *pipeline.Pipeline
}

// Run starts the server and blocks until interrupted.
func Run(cfg Config) error {
	if cfg.Dir == "" {
		cfg.Dir = "."
	}

	st, err := store.NewFileStore(filepath.Join(cfg.Dir, "data"))
	if err != nil {
		return err
	}
	s := &server{cfg: cfg, store: st}

	mux := http.NewServeMux()

	// A pipeline is required to run a platform, and optional while composing
	// one — the composer holds its draft in the store until it is exported.
	if cfg.Mode == ModeRun {
		p, err := s.loadPipeline()
		if err != nil {
			return err
		}
		s.pipeline = p
		if err := cfg.Services.Mount(mux, p.ServiceIDs(cfg.Registry)); err != nil {
			return err
		}
		log.Printf("pipeline %q: %d steps", p.Name, len(p.Nodes))
	} else {
		// The composer previews any pipeline the user builds, so every
		// service in the build has to be reachable.
		if err := cfg.Services.Mount(mux, cfg.Services.IDs()); err != nil {
			return err
		}
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
