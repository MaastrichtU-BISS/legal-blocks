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
	if !reg.CanConnect("document-set@1", "corpus@1") {
		t.Error("declared adapter should allow connection")
	}
	if reg.CanConnect("corpus@1", "annotated-task@1") {
		t.Error("unrelated types must not connect")
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
		"required input unconnected": {
			json:    `{"nodes":[{"id":"metrics","module":"vue-iaa-metrics"}]}`,
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
  "mode": "ephemeral",
  "nodes": [
    {"id": "search", "module": "vue-legal-query-builder", "label": "Search"},
    {"id": "explore", "module": "vue-legal-docs-visualizer", "label": "Explore"}
  ],
  "edges": [
    {"from": {"node": "search", "port": "documents"}, "to": {"node": "explore", "port": "documents"}}
  ]
}`

func TestEphemeralPipelineIsValid(t *testing.T) {
	reg := loadRegistry(t)
	p, err := Parse(strings.NewReader(explorer), reg)
	if err != nil {
		t.Fatalf("valid ephemeral pipeline rejected: %v", err)
	}
	if p.StorageMode() != manifest.ModeEphemeral {
		t.Errorf("StorageMode() = %q, want ephemeral", p.StorageMode())
	}
	// Storing nothing does not mean running nothing: searching happens on the
	// server, because that is where the access token lives. An explorer has no
	// database and still has a backend.
	if got := p.ServiceIDs(reg); len(got) != 1 || got[0] != "legal-docs" {
		t.Errorf("ServiceIDs() = %v, want the search service", got)
	}
}

// A pipeline written before modes existed must keep behaving as it did.
func TestModeDefaultsToPersistent(t *testing.T) {
	reg := loadRegistry(t)
	p, err := Parse(strings.NewReader(flagship), reg)
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	if p.StorageMode() != manifest.ModePersistent {
		t.Errorf("StorageMode() = %q, want persistent by default", p.StorageMode())
	}
}

// A module that cannot work in the chosen mode must be refused at validation,
// so an export never promises a screen that will not function.
func TestValidateRejectsModuleInWrongMode(t *testing.T) {
	reg := loadRegistry(t)

	// results-download only makes sense when nothing is stored.
	persistentDownload := `{
		"mode": "persistent",
		"nodes": [
			{"id": "docs", "module": "corpus-source"},
			{"id": "annotate", "module": "legal-annotation-kit"},
			{"id": "save", "module": "results-download"}],
		"edges": [
			{"from": {"node": "docs", "port": "corpus"}, "to": {"node": "annotate", "port": "corpus"}},
			{"from": {"node": "annotate", "port": "task"}, "to": {"node": "save", "port": "task"}}]}`

	_, err := Parse(strings.NewReader(persistentDownload), reg)
	if err == nil || !strings.Contains(err.Error(), "does not work in persistent mode") {
		t.Fatalf("expected a mode error, got %v", err)
	}
}

func TestValidateRejectsUnknownMode(t *testing.T) {
	reg := loadRegistry(t)
	_, err := Parse(strings.NewReader(
		`{"mode":"sometimes","nodes":[{"id":"d","module":"corpus-source"}]}`), reg)
	if err == nil || !strings.Contains(err.Error(), "unknown storage mode") {
		t.Fatalf("expected an unknown-mode error, got %v", err)
	}
}
