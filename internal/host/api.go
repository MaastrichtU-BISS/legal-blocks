package host

import (
	"encoding/json"
	"fmt"
	"io/fs"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"

	"github.com/MaastrichtU-BISS/legal-blocks/internal/export"
	"github.com/MaastrichtU-BISS/legal-blocks/internal/pipeline"
)

// maxBodyBytes caps request bodies. Documents can be long, so this is generous
// rather than tight; it exists to stop a malformed client from filling memory.
const maxBodyBytes = 64 << 20 // 64 MB

func (s *server) routes(mux *http.ServeMux) {
	mux.HandleFunc("/api/registry", s.handleRegistry)
	mux.HandleFunc("/api/pipeline", s.handlePipeline)
	s.dataRoutes(mux)

	if s.cfg.Mode == ModeCompose {
		mux.HandleFunc("/api/validate", s.handleValidate)
		mux.HandleFunc("/api/export", s.handleExport)
	}

	mux.Handle("/", s.staticHandler())
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, format string, args ...any) {
	writeJSON(w, status, map[string]string{"error": fmt.Sprintf(format, args...)})
}

// handleRegistry serves the module catalogue. The composer renders its palette
// from this, and the runtime uses it to find each node's component and config
// schema — neither has any hardcoded knowledge of a specific module.
func (s *server) handleRegistry(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "use GET")
		return
	}
	writeJSON(w, http.StatusOK, s.cfg.Registry)
}

// handlePipeline serves the pipeline this platform runs. In compose mode there
// is no committed pipeline: the draft lives in the store like any other state.
func (s *server) handlePipeline(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "use GET")
		return
	}
	if s.pipeline == nil {
		writeError(w, http.StatusNotFound, "no pipeline: this server is in compose mode")
		return
	}
	writeJSON(w, http.StatusOK, s.pipeline)
}

// handleValidate type-checks a draft pipeline. The composer prevents illegal
// connections in the UI, but it asks the server for the authoritative answer
// so the rule lives in exactly one place.
func (s *server) handleValidate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "use POST")
		return
	}
	_, err := pipeline.Parse(http.MaxBytesReader(w, r.Body, maxBodyBytes), s.cfg.Registry)
	if err != nil {
		writeJSON(w, http.StatusOK, map[string]any{"valid": false, "error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"valid": true})
}

// handleExport builds the runnable platform zip.
func (s *server) handleExport(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "use POST")
		return
	}
	p, err := pipeline.Parse(http.MaxBytesReader(w, r.Body, maxBodyBytes), s.cfg.Registry)
	if err != nil {
		writeError(w, http.StatusBadRequest, "%v", err)
		return
	}

	// An export whose binaries predate the registry they embed fails on
	// somebody else's machine with a message about an unknown module, which
	// reads like the platform is broken rather than out of date. Refuse now,
	// while there is still a response to put the reason in.
	binaries := filepath.Join(s.cfg.Dir, "binaries")
	if err := export.CheckFresh(s.cfg.Dir, binaries); err != nil {
		writeError(w, http.StatusConflict, "%v", err)
		return
	}

	filename := export.Filename(p.Name)
	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", filename))

	if err := export.Write(w, export.Options{
		Pipeline:    p,
		Registry:    s.cfg.Registry,
		BinariesDir: binaries,
	}); err != nil {
		// Headers are already sent, so the client sees a truncated zip. Log
		// loudly; there is nothing useful left to say over the wire.
		fmt.Fprintf(os.Stderr, "export failed: %v\n", err)
	}
}

// staticHandler serves the built frontend, falling back to index.html so the
// runtime's client-side routes survive a reload — which matters here, since
// "does my work survive a refresh?" is the question the whole store exists to
// answer.
func (s *server) staticHandler() http.Handler {
	sub, err := fs.Sub(s.cfg.Web, "dist")
	if err != nil {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			writeError(w, http.StatusInternalServerError, "frontend bundle missing: %v", err)
		})
	}
	files := http.FileServer(http.FS(sub))

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		clean := strings.TrimPrefix(path.Clean("/"+r.URL.Path), "/")
		if clean == "" {
			clean = "index.html"
		}
		if _, err := fs.Stat(sub, clean); err != nil {
			r = r.Clone(r.Context())
			r.URL.Path = "/"
		}
		files.ServeHTTP(w, r)
	})
}
