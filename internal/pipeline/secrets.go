package pipeline

import (
	"github.com/MaastrichtU-BISS/legal-blocks/internal/manifest"
)

// Secrets are credentials a platform needs, keyed by node id and then by
// config key.
//
// They are kept apart from the pipeline itself throughout: pipeline.json
// describes what a platform is and is meant to be readable, shareable and
// checked into a repository, while these are the one thing in an export that
// has to be handled carefully. Mixing them would mean neither could be treated
// simply.
type Secrets map[string]map[string]string

// SplitSecrets returns the pipeline with every secret config value removed,
// and those values separately.
//
// The stripped copy is what gets written to pipeline.json and what the host
// serves to the browser, so a credential cannot reach a page by being carried
// along inside the pipeline that describes the page.
func (p *Pipeline) SplitSecrets(reg *manifest.Registry) (*Pipeline, Secrets) {
	secrets := Secrets{}

	clean := *p
	clean.Nodes = make([]Node, len(p.Nodes))

	for i, node := range p.Nodes {
		clean.Nodes[i] = node
		m, ok := reg.Modules[node.Module]
		if !ok || node.Config == nil {
			continue
		}

		var config map[string]any
		for _, field := range m.Config {
			if !field.IsSecret() {
				continue
			}
			value, present := node.Config[field.Key]
			if !present {
				continue
			}
			if config == nil {
				// Copy lazily: a node with no secrets keeps its original map.
				config = make(map[string]any, len(node.Config))
				for k, v := range node.Config {
					config[k] = v
				}
			}
			delete(config, field.Key)
			if s, ok := value.(string); ok && s != "" {
				if secrets[node.ID] == nil {
					secrets[node.ID] = map[string]string{}
				}
				secrets[node.ID][field.Key] = s
			}
		}
		if config != nil {
			clean.Nodes[i].Config = config
		}
	}

	return &clean, secrets
}

// Upstream is one outside API a service calls on a module's behalf, with the
// credentials it needs to do so.
type Upstream struct {
	// Service is the id of the Go service that makes the calls.
	Service string
	// BaseURL is the API to call.
	BaseURL string
	// Token authenticates the platform to it, if there is one.
	Token string
	// EnvVar can supply the token at run time instead.
	EnvVar string
}

// Upstreams lists the outside APIs this pipeline's services call, with their
// credentials resolved from secrets.
func (p *Pipeline) Upstreams(reg *manifest.Registry, secrets Secrets) []Upstream {
	var out []Upstream
	for _, node := range p.Nodes {
		m, ok := reg.Modules[node.Module]
		if !ok || m.Upstream == nil {
			continue
		}

		up := Upstream{Service: m.Upstream.Service, EnvVar: m.Upstream.EnvVar}
		if v, ok := node.Config[m.Upstream.BaseURLKey].(string); ok {
			up.BaseURL = v
		}
		if up.BaseURL == "" {
			// Fall back to the manifest's default, so a node that never had
			// its address edited still reaches the hosted service.
			for _, f := range m.Config {
				if f.Key == m.Upstream.BaseURLKey {
					if d, ok := f.Default.(string); ok {
						up.BaseURL = d
					}
				}
			}
		}
		if m.Upstream.TokenKey != "" {
			up.Token = secrets[node.ID][m.Upstream.TokenKey]
		}
		out = append(out, up)
	}
	return out
}
