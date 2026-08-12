package pipeline

import (
	"strings"
	"testing"
)

const withToken = `{
  "mode": "ephemeral",
  "name": "Explorer",
  "nodes": [
    {"id": "search", "module": "vue-legal-query-builder",
     "config": {"title": "Find", "api_token": "SUPERSECRET", "api_base_url": "https://example.test/api"}},
    {"id": "explore", "module": "vue-legal-docs-visualizer"}
  ],
  "edges": [{"from": {"node": "search", "port": "documents"}, "to": {"node": "explore", "port": "documents"}}]
}`

// The token must never survive into the pipeline that gets written to disk and
// served to browsers.
func TestSplitSecretsRemovesTokenFromPipeline(t *testing.T) {
	reg := loadRegistry(t)
	p, err := Parse(strings.NewReader(withToken), reg)
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}

	clean, secrets := p.SplitSecrets(reg)

	if got := secrets["search"]["api_token"]; got != "SUPERSECRET" {
		t.Errorf("secrets = %v, want the token extracted", secrets)
	}
	if _, present := clean.Nodes[0].Config["api_token"]; present {
		t.Error("token is still in the stripped pipeline")
	}
	if clean.Nodes[0].Config["title"] != "Find" {
		t.Error("stripping removed a non-secret setting")
	}
	// The original must be untouched, or the composer's draft would silently
	// lose the token the moment anything previewed or exported it.
	if p.Nodes[0].Config["api_token"] != "SUPERSECRET" {
		t.Error("SplitSecrets mutated the pipeline it was given")
	}
}

func TestUpstreamsResolveTokenAndAddress(t *testing.T) {
	reg := loadRegistry(t)
	p, _ := Parse(strings.NewReader(withToken), reg)
	_, secrets := p.SplitSecrets(reg)

	upstreams := p.Upstreams(reg, secrets)
	if len(upstreams) != 1 {
		t.Fatalf("got %d upstreams, want 1", len(upstreams))
	}
	got := upstreams[0]
	if got.Service != "legal-docs" || got.Token != "SUPERSECRET" || got.BaseURL != "https://example.test/api" {
		t.Errorf("upstream = %+v", got)
	}
	if got.EnvVar != "CITATIONS_API_KEY" {
		t.Errorf("EnvVar = %q, want the manifest's override name", got.EnvVar)
	}
}

// A node that never had its address edited must still reach the hosted service.
func TestUpstreamFallsBackToManifestDefault(t *testing.T) {
	reg := loadRegistry(t)
	p, err := Parse(strings.NewReader(`{
		"mode":"ephemeral",
		"nodes":[{"id":"search","module":"vue-legal-query-builder"}]}`), reg)
	if err != nil {
		t.Fatalf("Parse: %v", err)
	}
	upstreams := p.Upstreams(reg, Secrets{})
	if len(upstreams) != 1 || upstreams[0].BaseURL != "https://api.caselawexplorer.tech/api" {
		t.Errorf("upstreams = %+v, want the hosted default", upstreams)
	}
}
