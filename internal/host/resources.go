package host

// The API behind the three tabs a running platform opens on: tasks, datasets
// and labelsets.
//
// These are what makes an export a platform rather than an appliance. Nothing
// here is derived from the pipeline — the pipeline says this platform can run
// annotation tasks, and the people using it decide which tasks, over which
// documents, with which labels, done by whom.

import (
	"encoding/json"
	"net/http"

	"github.com/MaastrichtU-BISS/legal-blocks/internal/db"
)

func (s *server) resourceRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/api/labelsets", s.handleLabelsets)
	mux.HandleFunc("/api/datasets", s.handleDatasets)
	mux.HandleFunc("/api/tasks", s.handleTasks)
}

// handleLabelsets lists or creates labelsets.
func (s *server) handleLabelsets(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		sets, err := s.db.Labelsets(r.Context())
		if err != nil {
			writeError(w, http.StatusInternalServerError, "%v", err)
			return
		}
		writeJSON(w, http.StatusOK, sets)

	case http.MethodPost:
		var body struct {
			Name   string     `json:"name"`
			Desc   string     `json:"desc"`
			Labels []db.Label `json:"labels"`
		}
		if !decodeBody(w, r, &body) {
			return
		}
		owner, err := s.owner(r)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "%v", err)
			return
		}
		id, err := s.db.CreateLabelset(r.Context(), owner, body.Name, body.Desc, body.Labels)
		if err != nil {
			// These failures are things the person filling in the form can
			// fix, so they are 400s carrying the reason rather than 500s.
			writeError(w, http.StatusBadRequest, "%v", err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"id": id})

	default:
		writeError(w, http.StatusMethodNotAllowed, "use GET or POST")
	}
}

// handleDatasets lists or creates datasets.
//
// A dataset is created with its documents and is not added to afterwards. That
// is a deliberate limit for now: a task's assignments are made from the
// documents present when it was created, so growing a dataset would leave
// existing tasks covering part of it and silently disagree with what the
// screen says they cover.
func (s *server) handleDatasets(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		sets, err := s.db.Datasets(r.Context())
		if err != nil {
			writeError(w, http.StatusInternalServerError, "%v", err)
			return
		}
		writeJSON(w, http.StatusOK, sets)

	case http.MethodPost:
		var body struct {
			Name      string        `json:"name"`
			Desc      string        `json:"desc"`
			Documents []db.Document `json:"documents"`
		}
		if !decodeBody(w, r, &body) {
			return
		}
		if len(body.Documents) == 0 {
			writeError(w, http.StatusBadRequest, "a dataset needs at least one document")
			return
		}
		owner, err := s.owner(r)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "%v", err)
			return
		}
		id, err := s.db.CreateDataset(r.Context(), owner, body.Name, body.Desc, body.Documents)
		if err != nil {
			writeError(w, http.StatusBadRequest, "%v", err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"id": id})

	default:
		writeError(w, http.StatusMethodNotAllowed, "use GET or POST")
	}
}

// handleTasks lists or creates tasks.
func (s *server) handleTasks(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		tasks, err := s.db.Tasks(r.Context())
		if err != nil {
			writeError(w, http.StatusInternalServerError, "%v", err)
			return
		}
		writeJSON(w, http.StatusOK, tasks)

	case http.MethodPost:
		var spec db.TaskSpec
		if !decodeBody(w, r, &spec) {
			return
		}
		owner, err := s.owner(r)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "%v", err)
			return
		}
		id, err := s.db.CreateTask(r.Context(), owner, spec)
		if err != nil {
			// "that dataset has no documents yet", "a task needs at least one
			// annotator's email address" — all answerable by the person
			// filling in the form.
			writeError(w, http.StatusBadRequest, "%v", err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"id": id})

	default:
		writeError(w, http.StatusMethodNotAllowed, "use GET or POST")
	}
}

// decodeBody reads a JSON request body, reporting a failure to the client.
func decodeBody(w http.ResponseWriter, r *http.Request, into any) bool {
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxBodyBytes)).Decode(into); err != nil {
		writeError(w, http.StatusBadRequest, "could not read the request: %v", err)
		return false
	}
	return true
}
