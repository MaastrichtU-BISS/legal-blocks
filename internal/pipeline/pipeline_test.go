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
