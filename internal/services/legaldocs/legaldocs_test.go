package legaldocs

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

const token = "secret-token-value"

// upstream stands in for the Case Law Explorer API and records what reached it.
type upstream struct {
	server *httptest.Server
	path   string
	auth   string
	body   string
	status int
	reply  string
}

func newUpstream(t *testing.T) *upstream {
	t.Helper()
	u := &upstream{status: http.StatusOK, reply: `{"nodes":[],"edges":[]}`}
	u.server = httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		u.path = r.URL.RequestURI()
		u.auth = r.Header.Get("Authorization")
		u.body = string(raw)
		w.WriteHeader(u.status)
		_, _ = io.WriteString(w, u.reply)
	}))
	t.Cleanup(u.server.Close)
	return u
}

// service returns a configured service pointed at the stub.
func (u *upstream) service(t *testing.T) http.Handler {
	t.Helper()
	s := New()
	if err := s.SetCredentials(u.server.URL, token); err != nil {
		t.Fatalf("SetCredentials: %v", err)
	}
	return s.Handler()
}

func call(h http.Handler, method, target, body string) *httptest.ResponseRecorder {
	var reader io.Reader
	if body != "" {
		reader = strings.NewReader(body)
	}
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(method, target, reader))
	return rec
}

// The whole reason this service replaced a reverse proxy: the caller names a
// dataset, not a path, so there is no request it can aim anywhere else.
func TestOnlyTheDeclaredOperationsExist(t *testing.T) {
	u := newUpstream(t)
	h := u.service(t)

	// Every one of these is a real endpoint of the API the platform holds a
	// token for, and the proxy this replaced would have forwarded all of them.
	for _, path := range []string{"/statistics", "/rechtspraak", "/echr/text", "/../admin"} {
		rec := call(h, http.MethodPost, path, `{}`)
		if rec.Code == http.StatusOK {
			t.Errorf("POST %s succeeded — the browser must not be able to reach it", path)
		}
	}
	if u.path != "" {
		t.Errorf("a request reached the API at %q, which no declared operation asks for", u.path)
	}
}

func TestSearchSendsTheCredentialUpstreamAndNotBack(t *testing.T) {
	u := newUpstream(t)
	rec := call(u.service(t), http.MethodPost, "/search",
		`{"dataset":"RS","params":{"degreesSource":1,"degreesTarget":0,"keywords":["huur"]}}`)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d: %s", rec.Code, rec.Body.String())
	}
	if u.auth != "Bearer "+token {
		t.Errorf("upstream Authorization = %q, want the platform's token", u.auth)
	}
	if u.path != "/rechtspraak" {
		t.Errorf("upstream path = %q, want /rechtspraak", u.path)
	}
	// The envelope the API expects. Without it the search returns everything.
	if !strings.Contains(u.body, `"arguments"`) || !strings.Contains(u.body, `"keywords":["huur"]`) {
		t.Errorf("upstream body = %s", u.body)
	}
	if strings.Contains(rec.Body.String(), token) {
		t.Error("the response carried the access token to the browser")
	}
}

// Without this the API answers with ids and dates, every downstream step sees
// a document with no content, and a search that matched 110 cases is
// indistinguishable from one that matched none.
func TestSearchAsksForDocumentsNotJustIdentifiers(t *testing.T) {
	u := newUpstream(t)
	call(u.service(t), http.MethodPost, "/search", `{"dataset":"RS","params":{"degreesSource":1,"degreesTarget":1}}`)

	if !strings.Contains(u.body, `"attributesToFetch":"ALL"`) {
		t.Errorf("upstream body = %s, want the search to ask for document content", u.body)
	}
}

// A caller that asked for something specific keeps it — this is a default.
func TestSearchKeepsAnExplicitAttributeChoice(t *testing.T) {
	u := newUpstream(t)
	call(u.service(t), http.MethodPost, "/search",
		`{"dataset":"RS","params":{"degreesSource":0,"degreesTarget":0,"attributesToFetch":"MINIMAL"}}`)

	if !strings.Contains(u.body, `"attributesToFetch":"MINIMAL"`) {
		t.Errorf("upstream body = %s, want the caller's own choice", u.body)
	}
}

func TestSearchRoutesEchrToItsOwnEndpoint(t *testing.T) {
	u := newUpstream(t)
	rec := call(u.service(t), http.MethodPost, "/search",
		`{"dataset":"ECHR","params":{"degreesSource":0,"degreesTarget":0,"respondent_state":["GRC"]}}`)

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d: %s", rec.Code, rec.Body.String())
	}
	if u.path != "/echr" {
		t.Errorf("upstream path = %q, want /echr", u.path)
	}
	// ECHR parameters are snake_case; camelCasing them drops the filter and
	// silently widens the search.
	if !strings.Contains(u.body, `"respondent_state":["GRC"]`) {
		t.Errorf("upstream body = %s", u.body)
	}
}

func TestUnknownDatasetIsRefusedWithoutCallingTheAPI(t *testing.T) {
	u := newUpstream(t)
	rec := call(u.service(t), http.MethodPost, "/search", `{"dataset":"CJEU","params":{}}`)

	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", rec.Code)
	}
	if u.path != "" {
		t.Errorf("a rejected dataset still reached the API at %q", u.path)
	}
}

func TestLawsSearchesLegislation(t *testing.T) {
	u := newUpstream(t)
	u.reply = `[{"bwb_id":"BWBR001","bwb_label_id":456,"title":"Burgerlijk Wetboek","amount_related_cases":3}]`
	rec := call(u.service(t), http.MethodGet, "/laws?q=burgerlijk+wetboek", "")

	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d: %s", rec.Code, rec.Body.String())
	}
	if u.path != "/links/laws?q=burgerlijk+wetboek" {
		t.Errorf("upstream path = %q", u.path)
	}
	// The selector builds "bwb_id|bwb_label_id" from these, so both have to
	// survive the round trip in the API's own spelling.
	var laws []map[string]any
	if err := json.Unmarshal(rec.Body.Bytes(), &laws); err != nil {
		t.Fatalf("decoding response: %v", err)
	}
	if len(laws) != 1 || laws[0]["bwb_id"] != "BWBR001" || laws[0]["bwb_label_id"] != float64(456) {
		t.Errorf("laws = %v", laws)
	}
}

// The selector calls this on every keystroke, including the one that empties
// the box.
func TestEmptyLawQueryReturnsNothingWithoutCallingTheAPI(t *testing.T) {
	u := newUpstream(t)
	rec := call(u.service(t), http.MethodGet, "/laws?q=", "")

	if rec.Code != http.StatusOK || strings.TrimSpace(rec.Body.String()) != "[]" {
		t.Errorf("status = %d, body = %q, want an empty list", rec.Code, rec.Body.String())
	}
	if u.path != "" {
		t.Errorf("an empty search still reached the API at %q", u.path)
	}
}

func TestRefusedTokenDoesNotTellTheUserToFindOne(t *testing.T) {
	u := newUpstream(t)
	u.status = http.StatusUnauthorized
	u.reply = `{"message":"invalid api key ` + token + `"}`

	rec := call(u.service(t), http.MethodPost, "/search", `{"dataset":"RS","params":{}}`)
	if rec.Code != http.StatusBadGateway {
		t.Errorf("status = %d, want 502 — the platform is misconfigured, not the search", rec.Code)
	}
	// The API echoes the key it rejected. Passing that body through would put
	// the token on the page the service exists to keep it off.
	if strings.Contains(rec.Body.String(), token) {
		t.Errorf("the token reached the browser inside an error: %s", rec.Body.String())
	}
}

// A rejected query is the user's to fix, so the API's own explanation of which
// filter was wrong is worth more than a generic message.
func TestRejectedQueryKeepsTheApiExplanation(t *testing.T) {
	u := newUpstream(t)
	u.status = http.StatusBadRequest
	u.reply = `{"message":"degreesSource must be 0-5"}`

	rec := call(u.service(t), http.MethodPost, "/search", `{"dataset":"RS","params":{"degreesSource":9}}`)
	if rec.Code != http.StatusBadRequest {
		t.Errorf("status = %d, want 400", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "degreesSource must be 0-5") {
		t.Errorf("body = %s, want the API's reason", rec.Body.String())
	}
}

// An export with no token still starts and still serves every other step. Only
// the search says why it cannot work.
func TestWithoutCredentialsTheServiceExplainsItself(t *testing.T) {
	h := New().Handler()
	rec := call(h, http.MethodPost, "/search", `{"dataset":"RS","params":{}}`)

	if rec.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want 503", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "CITATIONS_API_KEY") {
		t.Errorf("body = %s, want the way out", rec.Body.String())
	}
}

// An empty token is the same situation, and has to read the same way.
//
// Passing it to the client instead would send a request that cannot succeed
// and answer with the API's 401 — which this service reports as a key that may
// have expired, sending the user to look for a token nobody ever gave them.
func TestAnEmptyTokenIsNotAConfiguredService(t *testing.T) {
	u := newUpstream(t)
	s := New()
	if err := s.SetCredentials(u.server.URL, ""); err != nil {
		t.Fatalf("SetCredentials: %v", err)
	}

	rec := call(s.Handler(), http.MethodPost, "/search", `{"dataset":"RS","params":{}}`)
	if rec.Code != http.StatusServiceUnavailable {
		t.Errorf("status = %d, want 503", rec.Code)
	}
	if !strings.Contains(rec.Body.String(), "CITATIONS_API_KEY") {
		t.Errorf("body = %s, want the way out rather than a story about expiry", rec.Body.String())
	}
	if u.path != "" {
		t.Errorf("called the API at %q with no credential, which can only fail", u.path)
	}
}

// graphUpstream answers per endpoint, which the shared stub cannot: a search
// that scores its network makes two calls, and the test is about what the
// second one does to the first one's answer.
func graphUpstream(t *testing.T, search, statistics string) (http.Handler, *int) {
	t.Helper()
	statsCalls := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/statistics" {
			statsCalls++
			_, _ = io.WriteString(w, statistics)
			return
		}
		_, _ = io.WriteString(w, search)
	}))
	t.Cleanup(server.Close)

	s := New()
	if err := s.SetCredentials(server.URL, token); err != nil {
		t.Fatalf("SetCredentials: %v", err)
	}
	return s.Handler(), &statsCalls
}

// The viewer colours and clusters documents from their statistics, and the
// search endpoint does not supply any. Without this the whole graph is grey.
func TestSearchScoresTheCitationNetwork(t *testing.T) {
	h, calls := graphUpstream(t,
		`{"nodes":[{"id":"ECLI:A","data":{"ecli":"ECLI:A"}},{"id":"ECLI:B","data":{"ecli":"ECLI:B"}}],
		  "edges":[{"source":"ECLI:A","target":"ECLI:B"}]}`,
		`{"ECLI:A":{"degree":1,"community":0},"ECLI:B":{"degree":1,"community":0}}`)

	rec := call(h, http.MethodPost, "/search", `{"dataset":"RS","params":{}}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("search returned %d: %s", rec.Code, rec.Body.String())
	}
	if *calls != 1 {
		t.Errorf("the network was scored %d times, want once", *calls)
	}

	var out struct {
		Nodes []struct {
			ID   string `json:"id"`
			Data struct {
				Ecli       string `json:"ecli"`
				Statistics *struct {
					Degree    int `json:"degree"`
					Community int `json:"community"`
				} `json:"statistics"`
			} `json:"data"`
		} `json:"nodes"`
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &out); err != nil {
		t.Fatalf("reading the search result: %v", err)
	}
	if len(out.Nodes) != 2 {
		t.Fatalf("got %d nodes, want 2", len(out.Nodes))
	}
	for _, n := range out.Nodes {
		if n.Data.Statistics == nil {
			t.Fatalf("%s came back without statistics, so the viewer draws it grey", n.ID)
		}
		if n.Data.Statistics.Degree != 1 {
			t.Errorf("%s degree = %d, want 1", n.ID, n.Data.Statistics.Degree)
		}
		// Merged into the document, not put in place of it.
		if n.Data.Ecli != n.ID {
			t.Errorf("%s lost its own attributes: %+v", n.ID, n.Data)
		}
	}
}

// The statistics endpoint answers with an empty object for a graph with no
// citations, so asking is a round trip that can only return nothing.
func TestSearchWithoutCitationsIsNotScored(t *testing.T) {
	h, calls := graphUpstream(t,
		`{"nodes":[{"id":"ECLI:A","data":{"ecli":"ECLI:A"}}],"edges":[]}`, `{}`)

	if rec := call(h, http.MethodPost, "/search", `{"dataset":"RS","params":{}}`); rec.Code != http.StatusOK {
		t.Fatalf("search returned %d: %s", rec.Code, rec.Body.String())
	}
	if *calls != 0 {
		t.Errorf("scored an edgeless graph %d times, want none", *calls)
	}
}

// Documents that were found are worth showing without colours. Losing the
// search because the scoring failed would be the worse of the two outcomes.
func TestUnscorableNetworkStillReturnsItsDocuments(t *testing.T) {
	h, _ := graphUpstream(t,
		`{"nodes":[{"id":"ECLI:A","data":{"ecli":"ECLI:A"}}],
		  "edges":[{"source":"ECLI:A","target":"ECLI:A"}]}`,
		`not json`)

	rec := call(h, http.MethodPost, "/search", `{"dataset":"RS","params":{}}`)
	if rec.Code != http.StatusOK {
		t.Fatalf("search returned %d: %s", rec.Code, rec.Body.String())
	}
	if !strings.Contains(rec.Body.String(), "ECLI:A") {
		t.Errorf("the document was dropped along with its statistics: %s", rec.Body.String())
	}
}
