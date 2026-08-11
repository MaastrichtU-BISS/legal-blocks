package host

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strings"

	"github.com/MaastrichtU-BISS/legal-blocks/internal/export"
	"github.com/MaastrichtU-BISS/legal-blocks/internal/pipeline"
	"github.com/MaastrichtU-BISS/legal-blocks/internal/store"
)

// maxBodyBytes caps request bodies. Documents can be long, so this is generous
// rather than tight; it exists to stop a malformed client from filling memory.
const maxBodyBytes = 64 << 20 // 64 MB

func (s *server) routes(mux *http.ServeMux) {
	mux.HandleFunc("/api/registry", s.handleRegistry)
	mux.HandleFunc("/api/corpus", s.handleCorpus)
	mux.HandleFunc("/api/pipeline", s.handlePipeline)
	mux.HandleFunc("/api/store", s.handleStoreKeys)
	mux.HandleFunc("/api/store/", s.handleStoreItem)

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

// CorpusDocument is one input document.
type CorpusDocument struct {
	Name string `json:"name"`
	Text string `json:"full_text"`
}

// handleCorpus reads corpus/*.txt from the working directory.
//
// This stands in for the import package that does not exist yet. Reading the
// folder on each request rather than caching it means a user can drop a file
// into corpus/ and reload the page, which is the behaviour a non-technical
// user expects from a folder.
func (s *server) handleCorpus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "use GET")
		return
	}
	dir := filepath.Join(s.cfg.Dir, "corpus")
	entries, err := os.ReadDir(dir)
	if errors.Is(err, fs.ErrNotExist) {
		writeJSON(w, http.StatusOK, []CorpusDocument{})
		return
	}
	if err != nil {
		writeError(w, http.StatusInternalServerError, "reading corpus folder: %v", err)
		return
	}

	docs := []CorpusDocument{}
	for _, e := range entries {
		if e.IsDir() || !strings.EqualFold(filepath.Ext(e.Name()), ".txt") {
			continue
		}
		// A leading underscore or dot parks a file: it stays in the folder but
		// is not a document. The folder's own instructions file uses this, and
		// it gives users a way to set a document aside without deleting it.
		if strings.HasPrefix(e.Name(), "_") || strings.HasPrefix(e.Name(), ".") {
			continue
		}
		raw, err := os.ReadFile(filepath.Join(dir, e.Name()))
		if err != nil {
			writeError(w, http.StatusInternalServerError, "reading %s: %v", e.Name(), err)
			return
		}
		docs = append(docs, CorpusDocument{
			Name: strings.TrimSuffix(e.Name(), filepath.Ext(e.Name())),
			Text: string(raw),
		})
	}
	sort.Slice(docs, func(i, j int) bool { return docs[i].Name < docs[j].Name })
	writeJSON(w, http.StatusOK, docs)
}

func (s *server) handleStoreKeys(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "use GET")
		return
	}
	keys, err := s.store.Keys()
	if err != nil {
		writeError(w, http.StatusInternalServerError, "%v", err)
		return
	}
	if keys == nil {
		keys = []string{}
	}
	writeJSON(w, http.StatusOK, keys)
}

// handleStoreItem is the whole persistence API: GET, PUT and DELETE one JSON
// document. Every module's data-access contract in the runtime is implemented
// on top of these three calls.
func (s *server) handleStoreItem(w http.ResponseWriter, r *http.Request) {
	key := strings.TrimPrefix(r.URL.Path, "/api/store/")
	if key == "" {
		writeError(w, http.StatusBadRequest, "missing key")
		return
	}

	switch r.Method {
	case http.MethodGet:
		raw, err := s.store.Get(key)
		if errors.Is(err, store.ErrNotFound) {
			writeError(w, http.StatusNotFound, "no value for %q", key)
			return
		}
		if err != nil {
			writeError(w, http.StatusBadRequest, "%v", err)
			return
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write(raw)

	case http.MethodPut:
		body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxBodyBytes))
		if err != nil {
			writeError(w, http.StatusBadRequest, "reading body: %v", err)
			return
		}
		if err := s.store.Put(key, body); err != nil {
			writeError(w, http.StatusBadRequest, "%v", err)
			return
		}
		w.WriteHeader(http.StatusNoContent)

	case http.MethodDelete:
		if err := s.store.Delete(key); err != nil {
			writeError(w, http.StatusBadRequest, "%v", err)
			return
		}
		w.WriteHeader(http.StatusNoContent)

	default:
		writeError(w, http.StatusMethodNotAllowed, "use GET, PUT or DELETE")
	}
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

	filename := export.Filename(p.Name)
	w.Header().Set("Content-Type", "application/zip")
	w.Header().Set("Content-Disposition", fmt.Sprintf("attachment; filename=%q", filename))

	if err := export.Write(w, export.Options{
		Pipeline:  p,
		Registry:  s.cfg.Registry,
		CorpusDir: filepath.Join(s.cfg.Dir, "corpus"),
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
