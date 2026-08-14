package host

import (
	"net/http"
	"strings"

	"github.com/MaastrichtU-BISS/legal-blocks/internal/serve"
)

// maxBodyBytes caps request bodies. Documents can be long, so this is generous
// rather than tight; it exists to stop a malformed client from filling memory.
const maxBodyBytes = 64 << 20 // 64 MB

func (s *server) routes(mux *http.ServeMux) {
	// Registered first and matched last: ServeMux prefers the longest pattern,
	// so every specific route below wins and this catches whatever is left.
	//
	// Without it, an unknown /api/ path falls through to the single-page
	// handler and comes back as 200 with index.html — an endpoint that does
	// not exist answering successfully, in HTML, to a caller expecting JSON.
	// That cost real debugging time twice while splitting this program in two.
	mux.HandleFunc("/api/", s.handleUnknownAPI)

	mux.HandleFunc("/api/registry", s.handleRegistry)
	mux.HandleFunc("/api/pipeline", s.handlePipeline)
	s.dataRoutes(mux)
	mux.Handle("/", serve.Static(s.cfg.Web))
}

// handleUnknownAPI answers anything under /api/ that nothing else claimed.
//
// A platform that stores nothing gets most of the way here, and "does not
// exist" would be true but unhelpful: the caller asked for stored data in a
// platform built not to store any, which is a wiring mistake worth naming.
func (s *server) handleUnknownAPI(w http.ResponseWriter, r *http.Request) {
	if s.db == nil && !strings.HasPrefix(r.URL.Path, "/api/services/") {
		writeError(w, http.StatusNotImplemented,
			"this platform stores nothing, so %s does not exist here", r.URL.Path)
		return
	}
	writeError(w, http.StatusNotFound, "no such endpoint: %s", r.URL.Path)
}

func writeJSON(w http.ResponseWriter, status int, v any) { serve.JSON(w, status, v) }

func writeError(w http.ResponseWriter, status int, format string, args ...any) {
	serve.Error(w, status, format, args...)
}

// handleRegistry serves the module catalogue. The runtime uses it to find each
// node's component and config schema, so it has no hardcoded knowledge of any
// specific module.
func (s *server) handleRegistry(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "use GET")
		return
	}
	writeJSON(w, http.StatusOK, s.cfg.Registry)
}

// handlePipeline serves the pipeline this platform runs.
func (s *server) handlePipeline(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "use GET")
		return
	}
	writeJSON(w, http.StatusOK, s.pipeline)
}
