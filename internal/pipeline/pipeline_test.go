package pipeline

import (
	"strings"
	"testing"

	"github.com/MaastrichtU-BISS/legal-blocks/internal/manifest"
	"github.com/MaastrichtU-BISS/legal-blocks/registry"
)

func loadRegistry(t *testing.T) *manifest.Registry {
	t.Helper()
	reg, err := manifest.Load(registry.FS())
	if err != nil {
		t.Fatalf("loading registry: %v", err)
	}
	return reg
}

func TestRegistryLoads(t *testing.T) {
	reg := loadRegistry(t)
	for _, want := range []string{"corpus-source", "legal-annotation-kit", "vue-iaa-metrics"} {
		if _, ok := reg.Modules[want]; !ok {
			t.Errorf("registry missing module %q", want)
		}
	}
	if !reg.CanConnect("corpus@1", "corpus@1") {
		t.Error("identical types should connect")
	}
	if reg.CanConnect("corpus@1", "annotated-task@1") {
		t.Error("unrelated types must not connect")
	}
	// Search results are cases; a corpus is documents to work on. Bridging them
	// means fetching each judgment, which is a step of its own — so this must
	// stay refused until the preprocessing module exists to do it.
	if reg.CanConnect("document-set@1", "corpus@1") {
		t.Error("search must not feed an annotation step directly")
	}
}

// In a workspace the annotate tool's documents come from the task somebody
// opened, not from whatever is upstream. Insisting on an edge would mean
// drawing one that lies about where the documents come from.
func TestWorkspaceNeedsNoEdges(t *testing.T) {
	reg := loadRegistry(t)
	_, err := Parse(strings.NewReader(`{
		"kind":"workspace",
		"nodes":[
			{"id":"upload","module":"vue-legal-docs-import"},
			{"id":"annotate","module":"legal-annotation-kit"},
			{"id":"metrics","module":"vue-iaa-metrics"}],
		"edges":[]
	}`), reg)
	if err != nil {
		t.Fatalf("a workspace with no edges was rejected: %v", err)
	}
}

// Refusing is only half of it: someone wiring search into annotation has a
// reasonable idea and is missing a piece, and the message has to say which.
func TestRefusingSearchToCorpusSaysWhatIsMissing(t *testing.T) {
	reg := loadRegistry(t)
	_, err := Parse(strings.NewReader(`{
		"kind":"pipeline",
		"nodes":[
			{"id":"search","module":"vue-legal-query-builder"},
			{"id":"annotate","module":"legal-annotation-kit"}],
		"edges":[{"from":{"node":"search","port":"documents"},"to":{"node":"annotate","port":"corpus"}}]
	}`), reg)
	if err == nil {
		t.Fatal("search fed an annotation step directly")
	}
	if !strings.Contains(err.Error(), "preprocessing") {
		t.Errorf("error = %q, want it to name the missing step", err)
	}
}

const flagship = `{
  "version": 1,
  "name": "Annotate and measure",
  "nodes": [
    {"id": "docs", "module": "corpus-source", "label": "Documents"},
    {"id": "annotate", "module": "legal-annotation-kit", "label": "Annotate",
     "config": {"labels": "Actor, Act", "annotators": 2, "annotation_level": "word"}},
    {"id": "metrics", "module": "vue-iaa-metrics", "label": "Metrics"}
  ],
  "edges": [
    {"from": {"node": "docs", "port": "corpus"}, "to": {"node": "annotate", "port": "corpus"}},
    {"from": {"node": "annotate", "port": "task"}, "to": {"node": "metrics", "port": "task"}}
  ]
}`

func TestFlagshipPipelineIsValid(t *testing.T) {
	reg := loadRegistry(t)
	p, err := Parse(strings.NewReader(flagship), reg)
	if err != nil {
		t.Fatalf("valid pipeline rejected: %v", err)
	}
	if got, want := strings.Join(p.Order(), ","), "docs,annotate,metrics"; got != want {
		t.Errorf("Order() = %q, want %q", got, want)
	}
	if got := p.ServiceIDs(reg); len(got) != 1 || got[0] != "lawnotation-iaa" {
		t.Errorf("ServiceIDs() = %v, want [lawnotation-iaa]", got)
	}
}

func TestValidateRejectsBadPipelines(t *testing.T) {
	reg := loadRegistry(t)

	cases := map[string]struct{ json, wantErr string }{
		"metrics before annotate": {
			json: `{"nodes":[
				{"id":"docs","module":"corpus-source"},
				{"id":"metrics","module":"vue-iaa-metrics"}],
			 "edges":[{"from":{"node":"docs","port":"corpus"},"to":{"node":"metrics","port":"task"}}]}`,
			wantErr: "no adapter declared",
		},
		// Only in a pipeline. In a workspace the task a tool is opened against
		// supplies what it needs, so an unconnected input is normal.
		"required input unconnected": {
			json:    `{"kind":"pipeline","nodes":[{"id":"metrics","module":"vue-iaa-metrics"}]}`,
			wantErr: "required input",
		},
		"unknown module": {
			json:    `{"nodes":[{"id":"x","module":"does-not-exist"}]}`,
			wantErr: "unknown module",
		},
		"unknown port": {
			json: `{"nodes":[
				{"id":"docs","module":"corpus-source"},
				{"id":"annotate","module":"legal-annotation-kit"}],
			 "edges":[{"from":{"node":"docs","port":"nope"},"to":{"node":"annotate","port":"corpus"}}]}`,
			wantErr: "no output port",
		},
		"duplicate node id": {
			json: `{"nodes":[
				{"id":"docs","module":"corpus-source"},
				{"id":"docs","module":"corpus-source"}]}`,
			wantErr: "duplicate node id",
		},
	}

	for name, tc := range cases {
		t.Run(name, func(t *testing.T) {
			_, err := Parse(strings.NewReader(tc.json), reg)
			if err == nil {
				t.Fatalf("expected an error containing %q, got none", tc.wantErr)
			}
			if !strings.Contains(err.Error(), tc.wantErr) {
				t.Errorf("error = %q, want it to contain %q", err, tc.wantErr)
			}
		})
	}
}

// A hand-edited pipeline.json must not be able to make the runtime loop while
// resolving inputs, even though the composer only draws linear chains.
func TestValidateRejectsCycles(t *testing.T) {
	reg := loadRegistry(t)
	cyclic := `{"nodes":[
		{"id":"a","module":"vue-legal-docs-visualizer"},
		{"id":"b","module":"vue-legal-docs-visualizer"}],
	 "edges":[
		{"from":{"node":"a","port":"documents"},"to":{"node":"b","port":"documents"}},
		{"from":{"node":"b","port":"documents"},"to":{"node":"a","port":"documents"}}]}`
	_, err := Parse(strings.NewReader(cyclic), reg)
	if err == nil || !strings.Contains(err.Error(), "cycle") {
		t.Fatalf("expected a cycle error, got %v", err)
	}
}

// A case-law explorer: search and view, nothing stored. The shape
// caselaw-explorer-demo has today as a hand-written app.
const explorer = `{
  "version": 1,
  "name": "Case-law explorer",
  "kind": "pipeline",
  "nodes": [
    {"id": "search", "module": "vue-legal-query-builder", "label": "Search"},
    {"id": "explore", "module": "vue-legal-docs-visualizer", "label": "Explore"}
  ],
  "edges": [
    {"from": {"node": "search", "port": "documents"}, "to": {"node": "explore", "port": "documents"}}
  ]
}`

func TestPipelineKindIsValid(t *testing.T) {
	reg := loadRegistry(t)
	p, err := Parse(strings.NewReader(explorer), reg)
	if err != nil {
		t.Fatalf("valid pipeline rejected: %v", err)
	}
	if p.ExportKind() != manifest.KindPipeline {
		t.Errorf("ExportKind() = %q, want pipeline", p.ExportKind())
	}
	// Storing nothing does not mean running nothing: searching happens on the
	// server, because that is where the access token lives. An explorer has no
	// database and still has a backend.
	if got := p.ServiceIDs(reg); len(got) != 1 || got[0] != "legal-docs" {
		t.Errorf("ServiceIDs() = %v, want the search service", got)
	}
}

// A file written before this field existed must keep behaving as it did.
func TestKindDefaultsToWorkspace(t *testing.T) {
	reg := loadRegistry(t)
	p, err := Parse(strings.NewReader(flagship), reg)
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	if p.ExportKind() != manifest.KindWorkspace {
		t.Errorf("ExportKind() = %q, want workspace by default", p.ExportKind())
	}
}

// A module that cannot work in the chosen mode must be refused at validation,
// so an export never promises a screen that will not function.
func TestValidateRejectsModuleInWrongKind(t *testing.T) {
	reg := loadRegistry(t)

	// results-download only makes sense when nothing is stored.
	downloadInWorkspace := `{
		"kind": "workspace",
		"nodes": [
			{"id": "docs", "module": "corpus-source"},
			{"id": "annotate", "module": "legal-annotation-kit"},
			{"id": "save", "module": "results-download"}],
		"edges": [
			{"from": {"node": "docs", "port": "corpus"}, "to": {"node": "annotate", "port": "corpus"}},
			{"from": {"node": "annotate", "port": "task"}, "to": {"node": "save", "port": "task"}}]}`

	_, err := Parse(strings.NewReader(downloadInWorkspace), reg)
	if err == nil || !strings.Contains(err.Error(), "does not belong in a workspace") {
		t.Fatalf("expected a kind error, got %v", err)
	}
}

func TestValidateRejectsUnknownKind(t *testing.T) {
	reg := loadRegistry(t)
	_, err := Parse(strings.NewReader(
		`{"kind":"sometimes","nodes":[{"id":"d","module":"corpus-source"}]}`), reg)
	if err == nil || !strings.Contains(err.Error(), "expected pipeline or workspace") {
		t.Fatalf("expected an unknown-kind error, got %v", err)
	}
}
