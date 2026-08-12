package host

import (
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/MaastrichtU-BISS/legal-blocks/internal/db"
)

// The database-backed API. Everything a module needs is a query here, rather
// than a blob the previous step handed over — so what travels along a pipeline
// edge is a reference (a dataset id, a task id) and two modules looking at the
// same task are looking at the same rows.

func (s *server) dataRoutes(mux *http.ServeMux) {
	// A platform running without storage has no database behind these, so they
	// answer with a reason rather than crashing. Reaching one at all means a
	// binding asked for stored data in a platform that stores none, which is a
	// wiring mistake worth saying out loud.
	if s.db == nil {
		mux.HandleFunc("/api/", func(w http.ResponseWriter, r *http.Request) {
			if strings.HasPrefix(r.URL.Path, "/api/services/") {
				http.NotFound(w, r)
				return
			}
			writeError(w, http.StatusNotImplemented,
				"this platform stores nothing, so %s does not exist here", r.URL.Path)
		})
		return
	}

	mux.HandleFunc("/api/users", s.handleUsers)
	mux.HandleFunc("/api/datasets/sync", s.handleSyncDataset)
	mux.HandleFunc("/api/datasets/", s.handleDatasetScoped)
	mux.HandleFunc("/api/tasks/sync", s.handleSyncTask)
	mux.HandleFunc("/api/tasks/", s.handleTaskScoped)
	mux.HandleFunc("/api/assignments/", s.handleAssignmentScoped)
}

// handleUsers lists the people who can work in this platform, creating the
// configured number on first call. The runtime's "Working as" selector reads
// this; a login replaces it without anything downstream changing.
func (s *server) handleUsers(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		users, err := s.db.Users(r.Context())
		if err != nil {
			writeError(w, http.StatusInternalServerError, "%v", err)
			return
		}
		writeJSON(w, http.StatusOK, users)

	case http.MethodPost:
		var body struct {
			Count int `json:"count"`
		}
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxBodyBytes)).Decode(&body); err != nil {
			writeError(w, http.StatusBadRequest, "invalid body: %v", err)
			return
		}
		users, err := s.db.EnsureUsers(r.Context(), body.Count)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "%v", err)
			return
		}
		writeJSON(w, http.StatusOK, users)

	default:
		writeError(w, http.StatusMethodNotAllowed, "use GET or POST")
	}
}

// handleSyncDataset stores a set of documents as a named dataset and returns
// its id. Idempotent: documents already present keep their id so annotations
// made against them survive.
func (s *server) handleSyncDataset(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "use POST")
		return
	}
	var body struct {
		Name      string        `json:"name"`
		Documents []db.Document `json:"documents"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxBodyBytes)).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body: %v", err)
		return
	}
	if body.Name == "" {
		body.Name = "corpus"
	}

	owner, err := s.owner(r)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "%v", err)
		return
	}
	id, err := s.db.SyncDataset(r.Context(), owner, body.Name, body.Documents)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "%v", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]int64{"dataset_id": id})
}

// handleSyncTask brings the task for a dataset in line with the annotate
// step's settings and returns its id. Called every time that step is opened,
// so changing labels or annotator count takes effect without losing work.
func (s *server) handleSyncTask(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "use POST")
		return
	}
	var body struct {
		DatasetID int64         `json:"dataset_id"`
		Config    db.TaskConfig `json:"config"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxBodyBytes)).Decode(&body); err != nil {
		writeError(w, http.StatusBadRequest, "invalid body: %v", err)
		return
	}
	if body.DatasetID == 0 {
		writeError(w, http.StatusBadRequest, "dataset_id is required")
		return
	}

	if _, err := s.db.EnsureUsers(r.Context(), body.Config.Annotators); err != nil {
		writeError(w, http.StatusInternalServerError, "%v", err)
		return
	}
	owner, err := s.owner(r)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "%v", err)
		return
	}
	id, err := s.db.SyncTask(r.Context(), owner, body.DatasetID, body.Config)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "%v", err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]int64{"task_id": id})
}

// handleDatasetScoped serves GET /api/datasets/{id}/documents.
func (s *server) handleDatasetScoped(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "use GET")
		return
	}
	rest := strings.TrimPrefix(r.URL.Path, "/api/datasets/")
	idPart, sub, _ := strings.Cut(rest, "/")
	datasetID, err := strconv.ParseInt(idPart, 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid dataset id %q", idPart)
		return
	}
	if sub != "documents" {
		writeError(w, http.StatusNotFound, "unknown dataset resource %q", sub)
		return
	}
	docs, err := s.db.DatasetDocuments(r.Context(), datasetID)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "%v", err)
		return
	}
	writeJSON(w, http.StatusOK, docs)
}

// handleTaskScoped serves everything hanging off one task:
//
//	GET /api/tasks/{id}                       the task and its labelset
//	GET /api/tasks/{id}/queue?user_id=N       one annotator's queue
//	GET /api/tasks/{id}/annotations?...       the filtered annotation list
//	GET /api/tasks/{id}/iaa-input             the whole task, IAA's shape
func (s *server) handleTaskScoped(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "use GET")
		return
	}
	rest := strings.TrimPrefix(r.URL.Path, "/api/tasks/")
	idPart, sub, _ := strings.Cut(rest, "/")
	taskID, err := strconv.ParseInt(idPart, 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid task id %q", idPart)
		return
	}

	switch sub {
	case "":
		task, err := s.db.Task(r.Context(), taskID)
		if errors.Is(err, db.ErrNotFound) {
			writeError(w, http.StatusNotFound, "no task %d", taskID)
			return
		}
		if err != nil {
			writeError(w, http.StatusInternalServerError, "%v", err)
			return
		}
		writeJSON(w, http.StatusOK, task)

	case "queue":
		userID, err := strconv.ParseInt(r.URL.Query().Get("user_id"), 10, 64)
		if err != nil {
			writeError(w, http.StatusBadRequest, "user_id is required")
			return
		}
		queue, err := s.db.Queue(r.Context(), taskID, userID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "%v", err)
			return
		}
		writeJSON(w, http.StatusOK, queue)

	case "annotators":
		annotators, err := s.db.TaskAnnotators(r.Context(), taskID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "%v", err)
			return
		}
		writeJSON(w, http.StatusOK, annotators)

	case "documents":
		docs, err := s.db.TaskDocuments(r.Context(), taskID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "%v", err)
			return
		}
		// Names only: the metrics module lists documents to filter by and has
		// no use for their text, which can be megabytes.
		names := make([]map[string]string, 0, len(docs))
		for _, d := range docs {
			names = append(names, map[string]string{"value": d.Name, "label": d.Name})
		}
		writeJSON(w, http.StatusOK, names)

	case "annotations":
		q := r.URL.Query()
		filters := db.AnnotationFilters{
			Labels:     splitFilter(q.Get("labels")),
			Documents:  splitFilter(q.Get("documents")),
			Annotators: splitFilter(q.Get("annotators")),
		}
		anns, err := s.db.Annotations(r.Context(), taskID, filters)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "%v", err)
			return
		}
		writeJSON(w, http.StatusOK, anns)

	case "iaa-input":
		in, err := s.db.IaaInput(r.Context(), taskID)
		if errors.Is(err, db.ErrNotFound) {
			writeError(w, http.StatusNotFound, "no task %d", taskID)
			return
		}
		if err != nil {
			writeError(w, http.StatusInternalServerError, "%v", err)
			return
		}
		writeJSON(w, http.StatusOK, in)

	default:
		writeError(w, http.StatusNotFound, "unknown task resource %q", sub)
	}
}

// handleAssignmentScoped serves one queue position:
//
//	GET /api/assignments/{id}            the document and everything on it
//	PUT /api/assignments/{id}            replace this assignment's annotations
//	GET /api/assignments/{id}/incoming   the read-only "linked by" view
func (s *server) handleAssignmentScoped(w http.ResponseWriter, r *http.Request) {
	rest := strings.TrimPrefix(r.URL.Path, "/api/assignments/")
	idPart, sub, _ := strings.Cut(rest, "/")
	assignmentID, err := strconv.ParseInt(idPart, 10, 64)
	if err != nil {
		writeError(w, http.StatusBadRequest, "invalid assignment id %q", idPart)
		return
	}

	if sub == "incoming" {
		if r.Method != http.MethodGet {
			writeError(w, http.StatusMethodNotAllowed, "use GET")
			return
		}
		incoming, err := s.db.IncomingRelations(r.Context(), assignmentID)
		if err != nil {
			writeError(w, http.StatusInternalServerError, "%v", err)
			return
		}
		writeJSON(w, http.StatusOK, incoming)
		return
	}

	switch r.Method {
	case http.MethodGet:
		bundle, err := s.db.Bundle(r.Context(), assignmentID)
		if errors.Is(err, db.ErrNotFound) {
			writeError(w, http.StatusNotFound, "no assignment %d", assignmentID)
			return
		}
		if err != nil {
			writeError(w, http.StatusInternalServerError, "%v", err)
			return
		}
		writeJSON(w, http.StatusOK, bundle)

	case http.MethodPut:
		var a db.Assignment
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxBodyBytes)).Decode(&a); err != nil {
			writeError(w, http.StatusBadRequest, "invalid body: %v", err)
			return
		}
		if err := s.db.SaveAssignment(r.Context(), assignmentID, a); err != nil {
			if errors.Is(err, db.ErrNotFound) {
				writeError(w, http.StatusNotFound, "no assignment %d", assignmentID)
				return
			}
			writeError(w, http.StatusInternalServerError, "%v", err)
			return
		}
		w.WriteHeader(http.StatusNoContent)

	default:
		writeError(w, http.StatusMethodNotAllowed, "use GET or PUT")
	}
}

// owner returns the user rows are created under.
//
// Everything is owned by the first user for now. This is the one place that
// assumption lives, so a login replaces it here rather than in every query.
func (s *server) owner(r *http.Request) (int64, error) {
	users, err := s.db.EnsureUsers(r.Context(), 1)
	if err != nil {
		return 0, err
	}
	return users[0].ID, nil
}

// splitFilter parses a comma-separated query parameter. An empty value means
// "no filter", which is not the same as "match nothing".
func splitFilter(raw string) []string {
	if strings.TrimSpace(raw) == "" {
		return nil
	}
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	for _, p := range parts {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return out
}
