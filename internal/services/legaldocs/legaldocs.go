// Package legaldocs exposes case law search to the frontend without letting a
// browser near the credential.
//
// The platform used to forward /api/proxy/legal-docs/<anything> to the Case
// Law Explorer API with the token attached. That kept the token off the page,
// which was the point, but it left the browser choosing the upstream path: any
// script on the page could reach any endpoint of that API, authenticated as
// the platform's owner. A credential the page cannot read but can still spend
// is only half a fix.
//
// So this is a service instead of a proxy. It offers two operations, builds
// every upstream request itself, and there is no path for a caller to name.
// The same http.Handler mechanism as lawnotation-iaa, which is the second
// reason to prefer it: one way of adding a backend rather than two.
package legaldocs

import (
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"sync"

	legaldocs "github.com/MaastrichtU-BISS/go-legal-docs-client"
)

// Service searches case law at /api/services/legal-docs/{search,laws}.
type Service struct {
	// The composer repoints this whenever it previews a draft with a
	// different token, while requests may be in flight.
	mu     sync.RWMutex
	client *legaldocs.Client
}

// New returns the service, unconfigured. It answers with a clear error until
// the host supplies credentials from the pipeline.
func New() *Service { return &Service{} }

// ID implements service.Service.
func (*Service) ID() string { return "legal-docs" }

// SetCredentials implements service.Credentialed: the host calls this with the
// address and token the pipeline carries, once at startup or on every preview.
//
// An empty token leaves the service unconfigured rather than half-configured.
// The API would refuse the call anyway, and its 401 reads as an expired key —
// which sends whoever is searching looking for a token they were never given.
func (s *Service) SetCredentials(baseURL, token string) error {
	var client *legaldocs.Client
	if token != "" {
		client = legaldocs.New(token, legaldocs.WithBaseURL(baseURL))
	}
	s.mu.Lock()
	s.client = client
	s.mu.Unlock()
	return nil
}

// Handler implements service.Service.
func (s *Service) Handler() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/search", s.handleSearch)
	mux.HandleFunc("/laws", s.handleLaws)
	return mux
}

// searchRequest is what the query builder produces: a dataset and that
// dataset's parameters. Held raw until the dataset says which shape to expect.
type searchRequest struct {
	Dataset string          `json:"dataset"`
	Params  json.RawMessage `json:"params"`
}

// handleSearch runs one query against one dataset.
//
// The dataset is a value from a fixed set, not a path — the difference between
// this and the proxy it replaces. A caller can ask for Rechtspraak or ECHR
// case law and for nothing else.
func (s *Service) handleSearch(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "use POST")
		return
	}
	client, ok := s.ready(w)
	if !ok {
		return
	}

	var req searchRequest
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1<<20)).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "could not read the search: %v", err)
		return
	}

	switch req.Dataset {
	case "RS", "":
		var query legaldocs.RechtspraakQuery
		if !decodeParams(w, req.Params, &query) {
			return
		}
		result, err := client.FetchRechtspraak(r.Context(), query)
		respond(w, result, err)
	case "ECHR":
		var query legaldocs.EchrQuery
		if !decodeParams(w, req.Params, &query) {
			return
		}
		result, err := client.FetchEchr(r.Context(), query)
		respond(w, result, err)
	default:
		// CJEU is offered by the query builder and not by the API yet, so a
		// user picking it deserves to be told rather than to see a failure.
		writeError(w, http.StatusBadRequest,
			"this platform cannot search %q — only Dutch (RS) and ECHR case law", req.Dataset)
	}
}

// handleLaws searches legislation, for the query builder's law selector.
func (s *Service) handleLaws(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "use GET")
		return
	}
	client, ok := s.ready(w)
	if !ok {
		return
	}

	query := r.URL.Query().Get("q")
	if query == "" {
		// An empty search is the state the selector starts in, not a mistake.
		writeJSON(w, http.StatusOK, []legaldocs.LawItem{})
		return
	}
	laws, err := client.FetchLaws(r.Context(), query)
	respond(w, laws, err)
}

// ready returns the configured client, or explains its absence.
func (s *Service) ready(w http.ResponseWriter) (*legaldocs.Client, bool) {
	s.mu.RLock()
	client := s.client
	s.mu.RUnlock()
	if client == nil {
		writeError(w, http.StatusServiceUnavailable,
			"this platform has no access token for the document service, so it cannot search. "+
				"Whoever exported it can add one, or set CITATIONS_API_KEY before starting it.")
		return nil, false
	}
	return client, true
}

// decodeParams reads the dataset's own query parameters.
func decodeParams(w http.ResponseWriter, raw json.RawMessage, into any) bool {
	if len(raw) == 0 {
		return true
	}
	if err := json.Unmarshal(raw, into); err != nil {
		writeError(w, http.StatusBadRequest, "could not read the search parameters: %v", err)
		return false
	}
	return true
}

// respond writes a result, or translates a failure into something a person
// reading it in a browser can act on.
func respond(w http.ResponseWriter, result any, err error) {
	if err == nil {
		writeJSON(w, http.StatusOK, result)
		return
	}

	var apiErr *legaldocs.APIError
	if !errors.As(err, &apiErr) {
		// A transport failure. The message names the address it could not
		// reach, which is not the browser's business.
		log.Printf("legal-docs: %v", err)
		writeError(w, http.StatusBadGateway,
			"could not reach the document service — check this machine's internet connection")
		return
	}

	switch {
	case apiErr.StatusCode == http.StatusUnauthorized || apiErr.StatusCode == http.StatusForbidden:
		// The person searching cannot fix this and should not be shown the
		// API's wording about keys, which invites them to go looking for one.
		log.Printf("legal-docs: the access token was refused (%d)", apiErr.StatusCode)
		writeError(w, http.StatusBadGateway,
			"the document service refused this platform's access token — it may have expired. "+
				"Whoever exported this platform can issue a new one.")
	case apiErr.StatusCode < 500:
		// The query itself was rejected, so the API's own words are the most
		// useful thing available: they say which filter was wrong.
		writeError(w, http.StatusBadRequest, "the document service rejected this search: %s", apiErr.Body)
	default:
		log.Printf("legal-docs: upstream %d: %s", apiErr.StatusCode, apiErr.Body)
		writeError(w, http.StatusBadGateway,
			"the document service is having trouble — try again in a moment")
	}
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, format string, args ...any) {
	writeJSON(w, status, map[string]string{"error": fmt.Sprintf(format, args...)})
}
